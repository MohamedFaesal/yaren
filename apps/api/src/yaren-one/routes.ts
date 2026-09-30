import { randomUUID } from "node:crypto";
import { runAcceptance, suggestCodes } from "./acceptance.js";
import { createTotpSecret } from "./totp.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError, DomainError } from "@yaren/shared-kernel";
import type { IdentityService, StaffRole } from "@yaren/identity";
import { staffRoles } from "@yaren/identity";
import {
  applyPayment,
  assertBatchUsable,
  assertClaimSettlement,
  assertClaimTransition,
  assertContrastSafety,
  assertEncounterTransition,
  assertHandoverEvidence,
  assertIncidentClose,
  assertNoAllergyConflict,
  assertPayerReady,
  claimReadiness,
  invoiceTotals,
  nextTransferStatus,
  priceLine,
  refundInvoice,
  requireAmendment,
  returnStock,
  takeStock,
  voidInvoice,
  type EncounterStatus,
} from "@yaren/care-controls";

type Actor = { id: string; role: string; hotelId: string | null };
const builtInAccess = [
  { role: "system_admin", access: "Every module, including users, settings, and backups" },
  { role: "center_manager", access: "Clinics, billing, payroll drafts, and reports" },
  { role: "operations_manager", access: "Clinics, billing, coverage, and reports" },
  { role: "physician", access: "Consultation, prescriptions, investigations, and coding" },
  { role: "nurse", access: "Registration, triage, and room requests" },
  { role: "receptionist", access: "Registration, billing, and coverage" },
  { role: "pharmacist", access: "Prescriptions, dispensing, and stock" },
  { role: "claims_officer", access: "Claims, coverage, invoices, and finance totals" },
  { role: "hotel_manager", access: "Own property requests and monthly counts, without clinical notes" },
];
const clinicalRoles = new Set(["system_admin", "center_manager", "operations_manager", "physician", "nurse"]);
const moneyRoles = new Set(["system_admin", "center_manager", "operations_manager", "receptionist", "claims_officer"]);
const clinicCapabilities = ["desk", "clinical", "pharmacy", "billing", "insurance", "transfers", "quality", "reports"] as const;

type ClinicGrant = { id: string; hotelId: string | null; capabilities: string[] };
type ClinicScope = { all: boolean; clinics: ClinicGrant[] };

async function clinicScope(pool: pg.Pool, actor: Actor): Promise<ClinicScope> {
  if (actor.role === "system_admin") return { all: true, clinics: [] };
  const rows = await pool.query(
    "SELECT a.clinic_id, a.capabilities, c.hotel_id FROM identity.clinic_access a JOIN organization.clinics c ON c.id = a.clinic_id WHERE a.user_id = $1",
    [actor.id],
  );
  return {
    all: false,
    clinics: rows.rows.map((row) => ({
      id: String(row.clinic_id),
      hotelId: row.hotel_id ? String(row.hotel_id) : null,
      capabilities: Array.isArray(row.capabilities) ? row.capabilities.map(String) : [],
    })),
  };
}

function seesBranch(scope: ClinicScope, clinicId: string | null | undefined, hotelId: string | null | undefined, capability?: string) {
  if (scope.all) return true;
  return scope.clinics.some((clinic) => {
    if (capability && !clinic.capabilities.includes(capability)) return false;
    if (clinicId && clinic.id === String(clinicId)) return true;
    if (!clinicId && hotelId && clinic.hotelId === String(hotelId)) return true;
    return false;
  });
}

function branchPredicate(scope: ClinicScope, clinicColumn: string, hotelColumn: string) {
  if (scope.all) return { sql: "TRUE", params: [] as unknown[] };
  const hotels = [...new Set(scope.clinics.map((clinic) => clinic.hotelId).filter((id): id is string => Boolean(id)))];
  return {
    sql: `(${clinicColumn} = ANY($1::uuid[]) OR (${clinicColumn} IS NULL AND ${hotelColumn} = ANY($2::uuid[])))`,
    params: [scope.clinics.map((clinic) => clinic.id), hotels],
  };
}

export async function registerYarenOne(
  app: FastifyInstance,
  pool: pg.Pool,
  identity: IdentityService,
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
) {
  await pool.query(`
    UPDATE identity.users SET hotel_id = '11111111-1111-4111-8111-111111111111'
    WHERE email = 'hotel@yaren.local' AND hotel_id IS NULL
  `);
  await pool.query(`UPDATE identity.users SET license_no = 'EG-MD-10442' WHERE email = 'layla.hassan@yaren.local' AND license_no IS NULL`);

  const auth = { preHandler: requireAuth };
  const actorOf = async (request: FastifyRequest): Promise<Actor> => {
    const user = request.user as { sub: string; role: string };
    const row = await one(pool, "SELECT hotel_id FROM identity.users WHERE id = $1", [user.sub]);
    return { id: user.sub, role: user.role, hotelId: (row?.hotel_id as string | null) ?? null };
  };
  const userTypeOf = async (id: string) => {
    const row = await one(pool, "SELECT user_type FROM identity.users WHERE id = $1", [id]);
    const value = String(row?.user_type ?? "staff");
    return value === "super_admin" || value === "admin" ? value : "staff";
  };
  const guard = (actor: Actor, allowed: Set<string>) => {
    if (actor.role !== "system_admin" && !allowed.has(actor.role)) {
      throw new ApplicationError(403, "forbidden", "Your role cannot open this record");
    }
  };

  app.get("/api/yaren/bootstrap", auth, async (request) => {
    const actor = await actorOf(request);
    const [hotels, clinics, services, insurers, medications, settings, staff, centers] = await Promise.all([
      pool.query("SELECT * FROM organization.hotels ORDER BY name"),
      pool.query("SELECT * FROM organization.clinics ORDER BY name"),
      pool.query("SELECT * FROM organization.services WHERE active ORDER BY name"),
      pool.query("SELECT * FROM organization.insurers WHERE active ORDER BY name"),
      pool.query(`SELECT m.*, COALESCE(SUM(b.quantity),0)::int AS on_hand FROM pharmacy.medications m LEFT JOIN pharmacy.batches b ON b.medication_id = m.id GROUP BY m.id ORDER BY m.name`),
      pool.query("SELECT key, value FROM identity.settings ORDER BY key"),
      pool.query("SELECT id, email, display_name, role, status, hotel_id, license_no, user_type FROM identity.users ORDER BY display_name"),
      pool.query("SELECT id, name, code, city, phone, status, address_line FROM organization.medical_centers ORDER BY name"),
    ]);
    const scope = await clinicScope(pool, actor);
    const visibleClinics = scope.all ? clinics.rows : clinics.rows.filter((clinic) => seesBranch(scope, String(clinic.id), null));
    const hotelIds = new Set(visibleClinics.map((clinic) => String(clinic.hotel_id)));
    return {
      actor,
      hotels: scope.all ? hotels.rows : hotels.rows.filter((hotel) => hotelIds.has(String(hotel.id))),
      clinics: visibleClinics,
      centers: centers.rows,
      services: services.rows.map(moneyRow),
      insurers: insurers.rows,
      medications: medications.rows,
      settings: Object.fromEntries(settings.rows.filter((row: { key: string }) => !isSecretSetting(row.key)).map((row: { key: string; value: string }) => [row.key, row.value])),
      staff: staff.rows,
      screens: screenRegister,
    };
  });

  app.get("/api/yaren/desk", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["receptionist", "nurse", "physician", "operations_manager", "center_manager", "claims_officer"]));
    const scope = await clinicScope(pool, actor);
    const queue = (await pool.query(queueSql)).rows.filter((row) => seesBranch(scope, row.clinic_id ? String(row.clinic_id) : null, row.hotel_id ? String(row.hotel_id) : null));
    const counts = await one(pool, `
      SELECT
        (SELECT count(*)::int FROM clinical.encounters WHERE arrival_at::date = CURRENT_DATE) AS checkins,
        (SELECT count(*)::int FROM clinical.encounters WHERE status IN ('waiting','priority')) AS waiting,
        (SELECT count(*)::int FROM coordination.service_requests WHERE status <> 'completed') AS room_visits,
        (SELECT count(*)::int FROM billing.coverage WHERE status = 'pending') AS insurance_pending,
        (SELECT count(*)::int FROM billing.invoices WHERE status IN ('issued','part_paid')) AS open_invoices,
        (SELECT COALESCE(SUM(outstanding),0) FROM billing.invoices WHERE status IN ('issued','part_paid')) AS open_amount
    `);
    return { counts: counts ? moneyRow(counts) : {}, queue };
  });

  app.get("/api/yaren/patients/search", auth, async (request) => {
    const q = String((request.query as { q?: string }).q ?? "").trim();
    if (q.length < 2) return [];
    const like = `%${q}%`;
    const rows = await pool.query(
      `SELECT p.*, h.name AS hotel_name,
        (SELECT max(arrival_at) FROM clinical.encounters e WHERE e.patient_id = p.id) AS last_visit
       FROM patient_registry.patients p
       LEFT JOIN organization.hotels h ON h.id = p.hotel_id
       WHERE p.given_name ILIKE $1 OR p.family_name ILIKE $1 OR (p.given_name || ' ' || p.family_name) ILIKE $1
          OR p.phone ILIKE $1 OR p.passport_no ILIKE $1 OR p.room_no ILIKE $1 OR p.medical_record_number ILIKE $1
       ORDER BY p.created_at DESC LIMIT 20`,
      [like],
    );
    return rows.rows;
  });

  app.get("/api/yaren/patients/:id", auth, async (request) => {
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const patient = await one(pool, `SELECT p.*, h.name AS hotel_name FROM patient_registry.patients p LEFT JOIN organization.hotels h ON h.id = p.hotel_id WHERE p.id = $1`, [id]);
    if (!patient) throw new ApplicationError(404, "patient_not_found", "Patient was not found");
    const encounters = await pool.query(`SELECT * FROM clinical.encounters WHERE patient_id = $1 ORDER BY arrival_at DESC`, [id]);
    const actor = await actorOf(request);
    if (!clinicalRoles.has(actor.role) && actor.role !== "system_admin" && actor.role !== "receptionist" && actor.role !== "claims_officer") {
      throw new ApplicationError(403, "forbidden", "This record is outside your access");
    }
    const clinical = clinicalRoles.has(actor.role) || actor.role === "system_admin"
      ? await pool.query(`SELECT c.* FROM clinical.consultations c JOIN clinical.encounters e ON e.id = c.encounter_id WHERE e.patient_id = $1`, [id])
      : { rows: [] };
    return { patient, encounters: encounters.rows, consultations: clinical.rows };
  });

  app.post("/api/yaren/patients", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["receptionist", "nurse", "center_manager", "operations_manager"]));
    const body = parse(patientBody, request.body);
    if (body.departureDate && body.arrivalDate && body.departureDate < body.arrivalDate) {
      throw new DomainError("stay_dates_invalid", "Departure cannot be earlier than arrival");
    }
    const dup = await one(
      pool,
      `SELECT id, given_name, family_name, medical_record_number FROM patient_registry.patients
       WHERE phone = $1 OR ($2::text IS NOT NULL AND passport_no = $2) LIMIT 1`,
      [body.phone.replace(/[\s()-]/g, ""), body.passportNo || null],
    );
    if (dup && !body.confirmDuplicate) {
      throw new ApplicationError(409, "possible_duplicate", `Possible existing patient ${dup.medical_record_number} ${dup.given_name} ${dup.family_name}`);
    }
    const seq = await one(pool, "SELECT nextval('patient_registry.mrn_seq')::text AS n");
    const id = randomUUID();
    const mrn = `YRN-${String(seq?.n ?? "1").padStart(6, "0")}`;
    await pool.query(
      `INSERT INTO patient_registry.patients
        (id, medical_record_number, given_name, family_name, date_of_birth, sex, phone, national_id, email, nationality, home_address, passport_no, hotel_id, room_no, city, arrival_date, departure_date, tour_operator, insurer_name, policy_number, allergies, chronic_conditions, regular_medications, other_alerts, vip, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25, now())`,
      [id, mrn, body.givenName.trim(), body.familyName.trim(), body.dateOfBirth, body.sex, body.phone.replace(/[\s()-]/g, ""), body.passportNo || null, body.email || null, body.nationality, body.homeAddress || null, body.passportNo || null, body.hotelId, body.roomNo, body.city || null, body.arrivalDate || null, body.departureDate || null, body.tourOperator || null, body.insurerName || null, body.policyNumber || null, body.allergies || null, body.chronicConditions || null, body.regularMedications || null, body.otherAlerts || null, body.vip ?? false],
    );
    const encounter = await openEncounter(pool, actor, { patientId: id, hotelId: body.hotelId, clinicId: body.clinicId, roomNo: body.roomNo, visitType: body.visitType });
    await audit(pool, actor, "patient.registered", "patient", id);
    return { id, medicalRecordNumber: mrn, encounter };
  });

  app.post("/api/yaren/encounters", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["receptionist", "nurse", "operations_manager", "center_manager"]));
    const body = parse(z.object({
      patientId: z.uuid(),
      hotelId: z.uuid(),
      clinicId: z.uuid(),
      roomNo: z.string().optional(),
      visitType: z.enum(["walk_in", "room_visit", "emergency", "consultation", "follow_up"]),
    }), request.body);
    const encounter = await openEncounter(pool, actor, body);
    await audit(pool, actor, "encounter.opened", "encounter", encounter.id);
    return encounter;
  });

  app.get("/api/yaren/queue", auth, async (request) => {
    const actor = await actorOf(request);
    const scope = await clinicScope(pool, actor);
    const rows = (await pool.query(queueSql)).rows.filter((row) => seesBranch(scope, row.clinic_id ? String(row.clinic_id) : null, row.hotel_id ? String(row.hotel_id) : null));
    return rows;
  });

  app.get("/api/yaren/appointments", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["receptionist", "nurse", "physician", "operations_manager", "center_manager"]));
    const rows = await pool.query(`
      SELECT a.id, a.scheduled_start, a.scheduled_end, a.duration_minutes, a.reason, a.status, a.cancellation_reason,
        p.given_name, p.family_name, u.display_name AS clinician
      FROM scheduling.appointments a
      JOIN patient_registry.patients p ON p.id = a.patient_id
      JOIN identity.users u ON u.id = a.practitioner_id
      ORDER BY a.scheduled_start DESC
      LIMIT 50`);
    return rows.rows;
  });

  app.post("/api/yaren/encounters/:id/status", auth, async (request) => {
    const actor = await actorOf(request);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ status: z.string(), assignedTo: z.uuid().optional() }), request.body);
    const current = await one(pool, "SELECT status FROM clinical.encounters WHERE id = $1", [id]);
    if (!current) throw new ApplicationError(404, "encounter_not_found", "Encounter was not found");
    assertEncounterTransition(current.status as EncounterStatus, body.status as EncounterStatus);
    await pool.query("UPDATE clinical.encounters SET status = $2, assigned_to = COALESCE($3, assigned_to), updated_at = now() WHERE id = $1", [id, body.status, body.assignedTo ?? null]);
    await audit(pool, actor, "encounter.status", "encounter", id, { status: body.status });
    return { id, status: body.status };
  });

  app.post("/api/yaren/encounters/:id/triage", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["nurse", "physician"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(triageBody, request.body);
    const current = await one(pool, "SELECT status FROM clinical.encounters WHERE id = $1", [id]);
    if (!current) throw new ApplicationError(404, "encounter_not_found", "Encounter was not found");
    if (current.status === "closed" || current.status === "cancelled") {
      throw new DomainError("encounter_closed", "Triage cannot be edited on a closed encounter");
    }
    await pool.query(
      `INSERT INTO clinical.triage (encounter_id, temperature, systolic, diastolic, pulse, respiratory_rate, spo2, pain_score, chief_complaint, notes, category, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (encounter_id) DO UPDATE SET temperature=$2, systolic=$3, diastolic=$4, pulse=$5, respiratory_rate=$6, spo2=$7, pain_score=$8, chief_complaint=$9, notes=$10, category=$11, recorded_by=$12, recorded_at=now()`,
      [id, body.temperature, body.systolic, body.diastolic, body.pulse, body.respiratoryRate, body.spo2, body.painScore, body.chiefComplaint, body.notes ?? null, body.category, actor.id],
    );
    if (current.status === "waiting" || current.status === "priority") assertEncounterTransition(current.status as EncounterStatus, "in_triage");
    if (body.sendToDoctor) {
      const latest = current.status === "waiting" || current.status === "priority" ? "in_triage" : current.status;
      assertEncounterTransition(latest as EncounterStatus, "ready_for_doctor");
      await pool.query("UPDATE clinical.encounters SET status = 'ready_for_doctor', updated_at = now() WHERE id = $1", [id]);
    } else if (current.status === "waiting" || current.status === "priority") {
      await pool.query("UPDATE clinical.encounters SET status = 'in_triage', updated_at = now() WHERE id = $1", [id]);
    }
    await audit(pool, actor, "triage.recorded", "encounter", id, { category: body.category });
    return { id, category: body.category };
  });

  app.get("/api/yaren/encounters/:id", auth, async (request) => {
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const actor = await actorOf(request);
    const encounter = await one(pool, `${queueSql.replace("ORDER BY e.arrival_at", "WHERE e.id = $1 ORDER BY e.arrival_at")}`, [id]);
    if (!encounter) throw new ApplicationError(404, "encounter_not_found", "Encounter was not found");
    const scope = await clinicScope(pool, actor);
    if (!seesBranch(scope, encounter.clinic_id ? String(encounter.clinic_id) : null, encounter.hotel_id ? String(encounter.hotel_id) : null)) {
      throw new ApplicationError(403, "forbidden", "This clinic is outside your branch access");
    }
    const full = clinicalRoles.has(actor.role) || actor.role === "system_admin" || actor.role === "claims_officer" || actor.role === "pharmacist";
    const [triage, consultation, prescriptions, investigations, report, notes, invoices] = await Promise.all([
      one(pool, "SELECT * FROM clinical.triage WHERE encounter_id = $1", [id]),
      full ? one(pool, "SELECT * FROM clinical.consultations WHERE encounter_id = $1", [id]) : null,
      pool.query(`SELECT p.*, json_agg(i.*) AS items FROM clinical.prescriptions p LEFT JOIN clinical.prescription_items i ON i.prescription_id = p.id WHERE p.encounter_id = $1 GROUP BY p.id`, [id]),
      full ? pool.query("SELECT * FROM clinical.investigations WHERE encounter_id = $1 ORDER BY created_at", [id]) : { rows: [] },
      full ? one(pool, "SELECT * FROM clinical.reports WHERE encounter_id = $1", [id]) : null,
      full ? pool.query("SELECT * FROM clinical.progress_notes WHERE encounter_id = $1 ORDER BY created_at", [id]) : { rows: [] },
      pool.query("SELECT * FROM billing.invoices WHERE encounter_id = $1 ORDER BY created_at", [id]),
    ]);
    return { encounter, triage, consultation, prescriptions: prescriptions.rows, investigations: investigations.rows, report, notes: notes.rows, invoices: invoices.rows.map(moneyRow) };
  });

  app.post("/api/yaren/encounters/:id/consultation", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["physician"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(consultBody, request.body);
    const current = await one(pool, "SELECT status FROM clinical.encounters WHERE id = $1", [id]);
    if (!current) throw new ApplicationError(404, "encounter_not_found", "Encounter was not found");
    const existingNote = await one(pool, "SELECT status FROM clinical.consultations WHERE encounter_id = $1", [id]);
    if (existingNote?.status === "final") {
      throw new DomainError("record_final", "This consultation is signed. Add an amendment instead of overwriting it.");
    }
    if (current.status === "ready_for_doctor") {
      assertEncounterTransition("ready_for_doctor", "in_consultation");
      await pool.query("UPDATE clinical.encounters SET status = 'in_consultation', assigned_to = $2, updated_at = now() WHERE id = $1", [id, actor.id]);
    }
    const examination = body.examination ?? (body.examSystems ? Object.values(body.examSystems).filter(Boolean).join("; ") : null);
    await pool.query(
      `INSERT INTO clinical.consultations (encounter_id, chief_complaint, hpi, past_history, allergies, examination, exam_systems, diagnosis, icd10, secondary_diagnoses, plan, physician_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)
       ON CONFLICT (encounter_id) DO UPDATE SET chief_complaint=$2, hpi=$3, past_history=$4, allergies=$5, examination=$6, exam_systems=$7::jsonb, diagnosis=$8, icd10=$9, secondary_diagnoses=$10, plan=$11, physician_id=$12, updated_at=now()
       WHERE clinical.consultations.status = 'draft'`,
      [id, body.chiefComplaint, body.hpi ?? null, body.pastHistory ?? null, body.allergies ?? null, examination, body.examSystems ? JSON.stringify(body.examSystems) : null, body.diagnosis, body.icd10, body.secondaryDiagnoses ?? null, body.plan, actor.id],
    );
    if (body.allergies) await pool.query("UPDATE patient_registry.patients SET allergies = $2 WHERE id = (SELECT patient_id FROM clinical.encounters WHERE id = $1)", [id, body.allergies]);
    await audit(pool, actor, "consultation.saved", "encounter", id);
    return { id, status: "draft" };
  });

  app.post("/api/yaren/encounters/:id/consultation/sign", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["physician"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const draft = await one(pool, "SELECT diagnosis, icd10 FROM clinical.consultations WHERE encounter_id = $1 AND status = 'draft'", [id]);
    if (!draft) throw new ApplicationError(409, "already_final", "This consultation is already finalized");
    if (!draft.diagnosis || !draft.icd10) throw new DomainError("diagnosis_required", "A final consultation needs a diagnosis and an ICD-10 code");
    const updated = await pool.query("UPDATE clinical.consultations SET status = 'final', finalized_at = now() WHERE encounter_id = $1 AND status = 'draft' RETURNING encounter_id", [id]);
    if (!updated.rowCount) throw new ApplicationError(409, "already_final", "This consultation is already finalized");
    await audit(pool, actor, "consultation.signed", "encounter", id);
    return { id, status: "final" };
  });

  app.post("/api/yaren/encounters/:id/prescriptions", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["physician"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({
      indication: z.string().min(1),
      instructions: z.string().optional(),
      followUp: z.string().optional(),
      items: z.array(z.object({
        medicationId: z.uuid().optional(),
        medicationName: z.string().min(1),
        strength: z.string().optional(),
        dose: z.string().min(1),
        route: z.string().min(1),
        frequency: z.string().min(1),
        duration: z.string().min(1),
        quantity: z.number().int().positive(),
        acknowledgeAllergy: z.boolean().optional(),
      })).min(1),
    }), request.body);
    const encounter = await one(pool, "SELECT patient_id, status, clinic_id, hotel_id FROM clinical.encounters WHERE id = $1", [id]);
    if (!encounter) throw new ApplicationError(404, "encounter_not_found", "Encounter was not found");
    const scope = await clinicScope(pool, actor);
    if (!seesBranch(scope, encounter.clinic_id ? String(encounter.clinic_id) : null, encounter.hotel_id ? String(encounter.hotel_id) : null)) {
      throw new ApplicationError(403, "forbidden", "This clinic is outside your branch access");
    }
    const patient = await one(pool, "SELECT allergies FROM patient_registry.patients WHERE id = $1", [encounter.patient_id]);
    for (const item of body.items) assertNoAllergyConflict(patient?.allergies ? String(patient.allergies) : null, item.medicationName, Boolean(item.acknowledgeAllergy));
    const rxId = randomUUID();
    const rxNo = await sequence(pool, "clinical.rx_seq", "YRN-RX-");
    await pool.query(
      `INSERT INTO clinical.prescriptions (id, rx_no, encounter_id, patient_id, prescriber_id, indication, instructions, follow_up, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'signed')`,
      [rxId, rxNo, id, encounter.patient_id, actor.id, body.indication, body.instructions ?? null, body.followUp ?? null],
    );
    for (const item of body.items) {
      await pool.query(
        `INSERT INTO clinical.prescription_items (id, prescription_id, medication_id, medication_name, strength, dose, route, frequency, duration, quantity, allergy_ack)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [randomUUID(), rxId, item.medicationId ?? null, item.medicationName, item.strength ?? null, item.dose, item.route, item.frequency, item.duration, item.quantity, Boolean(item.acknowledgeAllergy)],
      );
    }
    if (encounter.status === "in_consultation") {
      assertEncounterTransition("in_consultation", "treatment");
      await pool.query("UPDATE clinical.encounters SET status = 'treatment', updated_at = now() WHERE id = $1", [id]);
    }
    await audit(pool, actor, "prescription.signed", "prescription", rxId);
    return { id: rxId, rxNo };
  });

  app.get("/api/yaren/prescriptions", auth, async (request) => {
    const q = String((request.query as { q?: string }).q ?? "").trim();
    const rows = await pool.query(`
      SELECT p.*, pat.given_name, pat.family_name, pat.allergies, pat.room_no, u.display_name AS prescriber,
        COALESCE(json_agg(json_build_object(
          'medication_name', i.medication_name, 'strength', i.strength, 'dose', i.dose, 'route', i.route,
          'frequency', i.frequency, 'duration', i.duration, 'quantity', i.quantity
        )) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items
      FROM clinical.prescriptions p
      JOIN patient_registry.patients pat ON pat.id = p.patient_id
      LEFT JOIN identity.users u ON u.id = p.prescriber_id
      LEFT JOIN clinical.prescription_items i ON i.prescription_id = p.id
      WHERE $1 = '' OR pat.given_name ILIKE $2 OR pat.family_name ILIKE $2 OR (pat.given_name || ' ' || pat.family_name) ILIKE $2 OR p.rx_no ILIKE $2 OR pat.room_no ILIKE $2
      GROUP BY p.id, pat.id, u.id
      ORDER BY p.created_at DESC`, [q, `%${q}%`]);
    return rows.rows;
  });

  app.post("/api/yaren/prescriptions/:id/dispense", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["pharmacist"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ lines: z.array(z.object({ medicationId: z.uuid(), batchId: z.uuid(), quantity: z.number().int().positive() })).min(1) }), request.body);
    const rx = await one(pool, "SELECT * FROM clinical.prescriptions WHERE id = $1", [id]);
    if (!rx) throw new ApplicationError(404, "prescription_not_found", "Prescription was not found");
    if (rx.status === "dispensed" || rx.status === "partial") throw new DomainError("already_dispensed", "This prescription was already dispensed");
    const client = await pool.connect();
    let dispenseStatus = "dispensed";
    try {
      await client.query("BEGIN");
      const dispenseId = randomUUID();
      await client.query("INSERT INTO pharmacy.dispenses (id, prescription_id, encounter_id, pharmacist_id) VALUES ($1,$2,$3,$4)", [dispenseId, id, rx.encounter_id, actor.id]);
      for (const line of body.lines) {
        const batch = await client.query("SELECT quantity, expiry_date FROM pharmacy.batches WHERE id = $1 AND medication_id = $2 FOR UPDATE", [line.batchId, line.medicationId]);
        const available = Number(batch.rows[0]?.quantity ?? -1);
        if (available < 0) throw new ApplicationError(404, "batch_not_found", "Selected batch was not found");
        assertBatchUsable(new Date(String(batch.rows[0].expiry_date)), new Date());
        const remaining = takeStock(available, line.quantity);
        await client.query("UPDATE pharmacy.batches SET quantity = $2 WHERE id = $1", [line.batchId, remaining]);
        await client.query("INSERT INTO pharmacy.dispense_lines (id, dispense_id, batch_id, medication_id, quantity) VALUES ($1,$2,$3,$4,$5)", [randomUUID(), dispenseId, line.batchId, line.medicationId, line.quantity]);
      }
      const prescribed = await client.query("SELECT COALESCE(SUM(quantity),0)::int AS quantity FROM clinical.prescription_items WHERE prescription_id = $1", [id]);
      const given = body.lines.reduce((sum, line) => sum + line.quantity, 0);
      dispenseStatus = given < Number(prescribed.rows[0]?.quantity ?? given) ? "partial" : "dispensed";
      await client.query("UPDATE clinical.prescriptions SET status = $2 WHERE id = $1", [id, dispenseStatus]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await audit(pool, actor, "pharmacy.dispensed", "prescription", id);
    return { id, status: dispenseStatus };
  });

  app.get("/api/yaren/inventory", auth, async (request) => {
    const location = (request.query as { location?: string }).location || null;
    const rows = await pool.query(`
      SELECT m.id, m.code, m.name, m.strength, m.form, m.reorder_level, b.id AS batch_id, b.lot, b.expiry_date, b.quantity, b.location
      FROM pharmacy.medications m JOIN pharmacy.batches b ON b.medication_id = m.id
      WHERE ($1::text IS NULL OR b.location = $1)
      ORDER BY m.name, b.expiry_date`, [location]);
    return rows.rows;
  });

  app.get("/api/yaren/stock-alerts", auth, async () => {
    const rows = await pool.query(`
      SELECT m.id, m.name, m.reorder_level, COALESCE(SUM(b.quantity),0)::int AS on_hand,
        MIN(b.expiry_date) FILTER (WHERE b.quantity > 0) AS next_expiry
      FROM pharmacy.medications m LEFT JOIN pharmacy.batches b ON b.medication_id = m.id
      GROUP BY m.id
      HAVING COALESCE(SUM(b.quantity),0) <= m.reorder_level OR MIN(b.expiry_date) FILTER (WHERE b.quantity > 0) <= CURRENT_DATE + INTERVAL '90 days'`);
    return rows.rows;
  });

  app.post("/api/yaren/encounters/:id/investigations", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["physician"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({
      priority: z.enum(["routine", "urgent", "stat"]),
      tests: z.array(z.string()).min(1),
      indication: z.string().min(1),
      diagnosis: z.string().optional(),
      icd10: z.string().optional(),
      anatomicalSite: z.string().optional(),
      laterality: z.string().optional(),
      contrast: z.boolean().optional(),
      safetyAcknowledged: z.boolean().optional(),
      safety: z.object({
        specimen: z.string().optional(),
        fasting: z.string().optional(),
        pregnancy: z.string().optional(),
        contrastAllergy: z.string().optional(),
        renalRisk: z.string().optional(),
        flags: z.array(z.string()).optional(),
        instructions: z.string().optional(),
        medications: z.string().optional(),
      }).optional(),
    }), request.body);
    assertContrastSafety(Boolean(body.contrast), Boolean(body.safetyAcknowledged));
    const requestNo = await sequence(pool, "clinical.investigation_seq", "YRN-LAB-");
    const rowId = randomUUID();
    await pool.query(
      `INSERT INTO clinical.investigations (id, request_no, encounter_id, priority, tests, indication, diagnosis, icd10, anatomical_site, contrast, safety_acknowledged, safety, requested_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
      [rowId, requestNo, id, body.priority, JSON.stringify(body.tests), body.indication, body.diagnosis ?? null, body.icd10 ?? null, [body.anatomicalSite, body.laterality].filter(Boolean).join(" · ") || null, Boolean(body.contrast), Boolean(body.safetyAcknowledged), body.safety ? JSON.stringify(body.safety) : null, actor.id],
    );
    await audit(pool, actor, "investigation.requested", "investigation", rowId);
    return { id: rowId, requestNo };
  });

  app.post("/api/yaren/encounters/:id/report", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["physician"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({
      summary: z.string().min(1),
      findings: z.string().optional(),
      treatment: z.string().optional(),
      followUp: z.string().optional(),
      certificateType: z.string().optional(),
      fitDecision: z.string().optional(),
      restrictions: z.string().optional(),
      airline: z.string().optional(),
      travelDate: z.string().optional(),
      sign: z.boolean().optional(),
    }), request.body);
    await pool.query(
      `INSERT INTO clinical.reports (encounter_id, summary, findings, treatment, follow_up, certificate_type, fit_decision, restrictions, status, signed_by, signed_at, airline, travel_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (encounter_id) DO UPDATE SET summary=$2, findings=$3, treatment=$4, follow_up=$5, certificate_type=$6, fit_decision=$7, restrictions=$8,
         status = CASE WHEN clinical.reports.status = 'signed' THEN clinical.reports.status ELSE $9 END,
         signed_by = COALESCE(clinical.reports.signed_by, $10),
         signed_at = COALESCE(clinical.reports.signed_at, $11),
         airline = COALESCE($12, clinical.reports.airline),
         travel_date = COALESCE($13::date, clinical.reports.travel_date)`,
      [id, body.summary, body.findings ?? null, body.treatment ?? null, body.followUp ?? null, body.certificateType ?? null, body.fitDecision ?? null, body.restrictions ?? null, body.sign ? "signed" : "draft", body.sign ? actor.id : null, body.sign ? new Date() : null, body.airline || null, body.travelDate && /^\d{4}-\d{2}-\d{2}$/.test(body.travelDate) ? body.travelDate : null],
    );
    await audit(pool, actor, body.sign ? "report.signed" : "report.saved", "encounter", id);
    return { id, status: body.sign ? "signed" : "draft" };
  });

  app.post("/api/yaren/encounters/:id/notes", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, clinicalRoles);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ note: z.string().min(1), followUp: z.string().optional(), followUpDue: z.string().optional(), sign: z.boolean().optional() }), request.body);
    const noteId = randomUUID();
    await pool.query("INSERT INTO clinical.progress_notes (id, encounter_id, note, follow_up, follow_up_due, signed, author_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [noteId, id, body.note, body.followUp ?? null, body.followUpDue ?? null, Boolean(body.sign), actor.id]);
    await audit(pool, actor, "progress.noted", "encounter", id);
    return { id: noteId };
  });

  app.post("/api/yaren/encounters/:id/invoice", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, moneyRoles);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({
      payerType: z.enum(["self_pay", "insurance", "hotel_account"]),
      insuranceCover: z.number().min(0).default(0),
      notes: z.string().optional(),
      lines: z.array(z.object({
        code: z.string().min(1),
        description: z.string().min(1),
        category: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().min(0),
        discountPercent: z.number().min(0).max(100).default(0),
        taxPercent: z.number().min(0).max(100).default(0),
      })).min(1),
    }), request.body);
    const encounter = await one(pool, "SELECT patient_id, status, clinic_id, hotel_id FROM clinical.encounters WHERE id = $1", [id]);
    if (!encounter) throw new ApplicationError(404, "encounter_not_found", "Encounter was not found");
    const scope = await clinicScope(pool, actor);
    if (!seesBranch(scope, encounter.clinic_id ? String(encounter.clinic_id) : null, encounter.hotel_id ? String(encounter.hotel_id) : null)) {
      throw new ApplicationError(403, "forbidden", "This clinic is outside your branch access");
    }
    const priced = body.lines.map((line) => ({ ...line, ...priceLine(line) }));
    const totals = invoiceTotals(priced, body.insuranceCover);
    const invoiceId = randomUUID();
    const invoiceNo = await sequence(pool, "billing.invoice_seq", "YRN-INV-");
    const settings = await pool.query("SELECT value FROM identity.settings WHERE key = 'currency'");
    await pool.query(
      `INSERT INTO billing.invoices (id, invoice_no, encounter_id, patient_id, status, currency, subtotal, discount, tax, insurance_cover, patient_payable, outstanding, payer_type, notes, created_by)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$10,$11,$12,$13)`,
      [invoiceId, invoiceNo, id, encounter.patient_id, settings.rows[0]?.value ?? "EGP", totals.subtotal, totals.discount, totals.tax, totals.insuranceCover, totals.patientPayable, body.payerType, body.notes ?? null, actor.id],
    );
    for (const line of priced) {
      await pool.query(
        `INSERT INTO billing.invoice_lines (id, invoice_id, code, description, category, quantity, unit_price, discount_percent, tax_percent, gross, discount, tax, net)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [randomUUID(), invoiceId, line.code, line.description, line.category, line.quantity, line.unitPrice, line.discountPercent, line.taxPercent, line.gross, line.discount, line.tax, line.net],
      );
    }
    await audit(pool, actor, "invoice.drafted", "invoice", invoiceId);
    return { id: invoiceId, invoiceNo, ...totals, status: "draft" };
  });

  app.post("/api/yaren/invoices/:id/issue", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, moneyRoles);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const draft = await one(pool, "SELECT payer_type, patient_id FROM billing.invoices WHERE id = $1 AND status = 'draft'", [id]);
    if (!draft) throw new ApplicationError(409, "invoice_not_draft", "Only a draft invoice can be issued");
    if (draft.payer_type === "insurance") {
      const policy = await one(pool, "SELECT policy_number FROM billing.coverage WHERE patient_id = $1 AND policy_number IS NOT NULL ORDER BY created_at DESC LIMIT 1", [draft.patient_id]);
      const patientPolicy = policy?.policy_number ? String(policy.policy_number) : (await one(pool, "SELECT policy_number FROM patient_registry.patients WHERE id = $1", [draft.patient_id]))?.policy_number;
      assertPayerReady("insurance", patientPolicy ? String(patientPolicy) : null);
    }
    const updated = await pool.query("UPDATE billing.invoices SET status = 'issued', issued_at = now() WHERE id = $1 AND status = 'draft' RETURNING encounter_id", [id]);
    if (!updated.rowCount) throw new ApplicationError(409, "invoice_not_draft", "Only a draft invoice can be issued");
    const encounterId = updated.rows[0].encounter_id as string;
    const enc = await one(pool, "SELECT status FROM clinical.encounters WHERE id = $1", [encounterId]);
    if (enc && (enc.status === "treatment" || enc.status === "in_consultation")) {
      const from = enc.status as EncounterStatus;
      if (from === "in_consultation") assertEncounterTransition(from, "treatment");
      assertEncounterTransition("treatment", "billing");
      await pool.query("UPDATE clinical.encounters SET status = 'billing', updated_at = now() WHERE id = $1", [encounterId]);
    }
    const amounts = await one(pool, "SELECT invoice_no, subtotal::float AS subtotal, discount::float AS discount, tax::float AS tax, insurance_cover::float AS insurance_cover, patient_payable::float AS patient_payable FROM billing.invoices WHERE id = $1", [id]);
    if (amounts) {
      await postJournal(pool, "invoice", id, [
        { account: "accounts_receivable", debit: Number(amounts.patient_payable), credit: 0, memo: String(amounts.invoice_no) },
        { account: "insurer_receivable", debit: Number(amounts.insurance_cover), credit: 0, memo: String(amounts.invoice_no) },
        { account: "revenue", debit: 0, credit: Number(amounts.subtotal) - Number(amounts.discount), memo: String(amounts.invoice_no) },
        { account: "tax_payable", debit: 0, credit: Number(amounts.tax), memo: String(amounts.invoice_no) },
      ]);
    }
    const tax = await one(pool, "SELECT value FROM identity.settings WHERE key = 'tax_percent'");
    const version = await one(pool, "SELECT id FROM organization.master_versions WHERE entity = 'settings' ORDER BY created_at DESC LIMIT 1");
    await audit(pool, actor, "invoice.issued", "invoice", id, { taxPercent: tax?.value ?? null, settingsVersion: version?.id ?? null });
    return { id, status: "issued" };
  });

  app.get("/api/yaren/invoices", auth, async (request) => {
    const actor = await actorOf(request);
    const scope = await clinicScope(pool, actor);
    const branch = branchPredicate(scope, "e.clinic_id", "e.hotel_id");
    return (await pool.query(`SELECT i.*, p.given_name, p.family_name FROM billing.invoices i JOIN patient_registry.patients p ON p.id = i.patient_id JOIN clinical.encounters e ON e.id = i.encounter_id WHERE ${branch.sql} ORDER BY i.created_at DESC`, branch.params)).rows.map(moneyRow);
  });

  app.get("/api/yaren/invoices/:id", auth, async (request) => {
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const invoice = await one(pool, "SELECT * FROM billing.invoices WHERE id = $1", [id]);
    if (!invoice) throw new ApplicationError(404, "invoice_not_found", "Invoice was not found");
    const lines = await pool.query("SELECT * FROM billing.invoice_lines WHERE invoice_id = $1", [id]);
    const payments = await pool.query("SELECT * FROM billing.payments WHERE invoice_id = $1 ORDER BY paid_at", [id]);
    return { invoice: moneyRow(invoice), lines: lines.rows.map(moneyRow), payments: payments.rows.map(moneyRow) };
  });

  app.post("/api/yaren/invoices/:id/payments", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, moneyRoles);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ method: z.enum(["cash", "card", "transfer", "insurance", "hotel_account"]), amount: z.number().positive(), reference: z.string().optional() }), request.body);
    const invoice = await one(pool, "SELECT status, outstanding::float AS outstanding, amount_paid::float AS amount_paid FROM billing.invoices WHERE id = $1", [id]);
    if (!invoice) throw new ApplicationError(404, "invoice_not_found", "Invoice was not found");
    if (invoice.status === "draft" || invoice.status === "void") throw new DomainError("invoice_not_payable", "Issue the invoice before recording payment");
    const result = applyPayment(Number(invoice.outstanding), body.amount);
    const paymentId = randomUUID();
    const reference = body.reference?.trim() || `YRN-PAY-${paymentId.slice(0, 8).toUpperCase()}`;
    await pool.query("INSERT INTO billing.payments (id, invoice_id, method, amount, reference, collected_by) VALUES ($1,$2,$3,$4,$5,$6)", [paymentId, id, body.method, body.amount, reference, actor.id]);
    await pool.query("UPDATE billing.invoices SET amount_paid = $2, outstanding = $3, status = $4 WHERE id = $1", [id, Number(invoice.amount_paid) + body.amount, result.remaining, result.status]);
    const invoiceNo = await one(pool, "SELECT invoice_no FROM billing.invoices WHERE id = $1", [id]);
    await postJournal(pool, "payment", id, [
      { account: "cash", debit: body.amount, credit: 0, memo: String(invoiceNo?.invoice_no ?? id) },
      { account: "accounts_receivable", debit: 0, credit: body.amount, memo: String(invoiceNo?.invoice_no ?? id) },
    ]);
    await audit(pool, actor, "payment.recorded", "invoice", id, { amount: body.amount, reference, payer: actor.id });
    return { id, paymentId, reference, ...result };
  });

  app.post("/api/yaren/coverage", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["receptionist", "claims_officer", "operations_manager"]));
    const body = parse(z.object({
      patientId: z.uuid(),
      encounterId: z.uuid().optional(),
      insurer: z.string().min(1),
      policyNumber: z.string().optional(),
      tpa: z.string().optional(),
      status: z.enum(["verified", "pending", "not_verified"]),
      deductible: z.string().optional(),
      coinsurance: z.string().optional(),
    }), request.body);
    const id = randomUUID();
    await pool.query(
      `INSERT INTO billing.coverage (id, patient_id, encounter_id, insurer, policy_number, tpa, status, deductible, coinsurance, verified_by, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, body.patientId, body.encounterId ?? null, body.insurer, body.policyNumber ?? null, body.tpa ?? null, body.status, body.deductible ?? null, body.coinsurance ?? null, actor.id, body.status === "verified" ? new Date() : null],
    );
    await pool.query("INSERT INTO billing.coverage_events (id, coverage_id, status, actor_id) VALUES ($1,$2,$3,$4)", [randomUUID(), id, body.status, actor.id]);
    await audit(pool, actor, "coverage.recorded", "coverage", id);
    return { id, status: body.status };
  });

  app.post("/api/yaren/coverage/verify", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["receptionist", "claims_officer", "operations_manager"]));
    const body = parse(z.object({
      patientId: z.uuid(),
      encounterId: z.uuid().optional(),
      insurer: z.string().min(1),
      policyNumber: z.string().min(1),
    }), request.body);
    const settings = await pool.query("SELECT key, value FROM identity.settings WHERE key IN ('insurer_mode', 'insurer_adapter_url', 'insurer_adapter_host')");
    const config = Object.fromEntries(settings.rows.map((row: { key: string; value: string }) => [row.key, row.value]));
    let status = "verified";
    let method = "ruleset";
    let reference = `YRN-ELG-${Date.now().toString(36).toUpperCase()}`;
    if (config.insurer_mode === "simulator") {
      if (!/^[A-Za-z0-9][A-Za-z0-9-]{5,}$/.test(body.policyNumber)) {
        throw new DomainError("policy_invalid", "The payer simulator rejected this policy number");
      }
      const known = await one(pool, "SELECT id FROM organization.insurers WHERE lower(name) = lower($1) AND active", [body.insurer]);
      if (!known) throw new DomainError("insurer_unknown", "That insurer is not in the active master list");
      method = "simulator";
      reference = `YRN-PAYER-${Date.now().toString(36).toUpperCase()}`;
    } else if (config.insurer_mode === "adapter") {
      if (!config.insurer_adapter_url || !config.insurer_adapter_host) {
        throw new DomainError("adapter_not_configured", "Set the insurer adapter address before live verification");
      }
      const target = new URL(config.insurer_adapter_url);
      if (target.protocol !== "https:" || target.hostname !== config.insurer_adapter_host) {
        throw new DomainError("adapter_host_rejected", "The insurer adapter address does not match the approved host");
      }
      const response = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ insurer: body.insurer, policyNumber: body.policyNumber }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new DomainError("adapter_rejected", "The insurer adapter did not verify this policy");
      const payload = await response.json() as { reference?: string; status?: string };
      method = "adapter";
      status = payload.status === "verified" ? "verified" : "not_verified";
      reference = payload.reference || reference;
    } else {
      if (!/^[A-Za-z0-9][A-Za-z0-9-]{5,}$/.test(body.policyNumber)) {
        throw new DomainError("policy_invalid", "The policy number does not match the eligibility ruleset");
      }
      const known = await one(pool, "SELECT id FROM organization.insurers WHERE lower(name) = lower($1) AND active", [body.insurer]);
      if (!known) throw new DomainError("insurer_unknown", "That insurer is not in the active master list");
    }
    const id = randomUUID();
    await pool.query(
      `INSERT INTO billing.coverage (id, patient_id, encounter_id, insurer, policy_number, status, verified_by, verified_at, verification_method, verification_reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, body.patientId, body.encounterId ?? null, body.insurer, body.policyNumber, status, actor.id, new Date(), method, reference],
    );
    await pool.query("INSERT INTO billing.coverage_events (id, coverage_id, status, actor_id) VALUES ($1,$2,$3,$4)", [randomUUID(), id, status, actor.id]);
    await audit(pool, actor, "coverage.verified", "coverage", id, { method, reference });
    return { id, status, method, reference };
  });

  app.get("/api/yaren/coverage", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["receptionist", "claims_officer", "operations_manager", "center_manager"]));
    const rows = await pool.query(`
      SELECT c.id, c.insurer, c.status, c.tpa, c.deductible, c.coinsurance, c.verification_method, c.verification_reference, c.verified_at,
        p.given_name, p.family_name, u.display_name AS verified_by
      FROM billing.coverage c
      JOIN patient_registry.patients p ON p.id = c.patient_id
      LEFT JOIN identity.users u ON u.id = c.verified_by
      ORDER BY c.created_at DESC
      LIMIT 50`);
    return rows.rows;
  });

  app.get("/api/yaren/claims", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role === "hotel_manager") throw new ApplicationError(403, "forbidden", "Hotel users cannot open insurance claims");
    const scope = await clinicScope(pool, actor);
    const branch = branchPredicate(scope, "e.clinic_id", "e.hotel_id");
    return (await pool.query(`
      SELECT c.*, p.given_name, p.family_name, i.invoice_no,
        COALESCE(i.patient_payable, c.amount, 0)::float AS claimed,
        COALESCE(c.settlement_amount, 0)::float AS approved_amount,
        COALESCE(i.amount_paid, 0)::float AS paid,
        COALESCE(i.outstanding, 0)::float AS outstanding
      FROM billing.claims c
      JOIN patient_registry.patients p ON p.id = c.patient_id
      JOIN clinical.encounters e ON e.id = c.encounter_id
      LEFT JOIN billing.invoices i ON i.id = c.invoice_id
      WHERE ${branch.sql}
      ORDER BY c.created_at DESC`, branch.params)).rows.map(moneyRow);
  });

  app.get("/api/yaren/claims/export", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role === "hotel_manager") throw new ApplicationError(403, "forbidden", "Hotel users cannot open insurance claims");
    const rows = await pool.query(`
      SELECT c.claim_no, c.status, COALESCE(i.patient_payable, 0)::float AS claimed, COALESCE(c.settlement_amount, 0)::float AS approved_amount, COALESCE(i.amount_paid, 0)::float AS paid, COALESCE(i.outstanding, 0)::float AS outstanding
      FROM billing.claims c LEFT JOIN billing.invoices i ON i.id = c.invoice_id ORDER BY c.claim_no`);
    await audit(pool, actor, "claim.exported", "claim", actor.id, { rows: rows.rowCount });
    const csv = ["claim_no,status,claimed,approved,paid,outstanding", ...rows.rows.map((row) => `${row.claim_no},${row.status},${row.claimed},${row.approved_amount},${row.paid},${row.outstanding}`)].join("\n");
    return { csv };
  });

  app.post("/api/yaren/claims", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["claims_officer"]));
    const body = parse(z.object({
      encounterId: z.uuid(),
      invoiceId: z.uuid(),
      claimType: z.string().min(1),
      authorizationRef: z.string().optional(),
    }), request.body);
    const encounter = await one(pool, "SELECT patient_id, clinic_id, hotel_id FROM clinical.encounters WHERE id = $1", [body.encounterId]);
    if (!encounter) throw new ApplicationError(404, "encounter_not_found", "Encounter was not found");
    const scope = await clinicScope(pool, actor);
    if (!seesBranch(scope, encounter.clinic_id ? String(encounter.clinic_id) : null, encounter.hotel_id ? String(encounter.hotel_id) : null)) {
      throw new ApplicationError(403, "forbidden", "This clinic is outside your branch access");
    }
    const id = randomUUID();
    const claimNo = await sequence(pool, "billing.claim_seq", "YRN-CLM-");
    await pool.query(
      `INSERT INTO billing.claims (id, claim_no, encounter_id, invoice_id, patient_id, status, claim_type, authorization_ref)
       VALUES ($1,$2,$3,$4,$5,'draft',$6,$7)`,
      [id, claimNo, body.encounterId, body.invoiceId, encounter.patient_id, body.claimType, body.authorizationRef ?? null],
    );
    await audit(pool, actor, "claim.created", "claim", id);
    return { id, claimNo, status: "draft" };
  });

  app.get("/api/yaren/claims/:id/readiness", auth, async (request) => {
    const actor = await actorOf(request);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const ready = await readinessFor(pool, id);
    await pool.query("INSERT INTO billing.readiness_runs (id, claim_id, ready, checks, ruleset, actor_id) VALUES ($1,$2,$3,$4::jsonb,'mvp-v1',$5)", [randomUUID(), id, ready.ready, JSON.stringify(ready), actor.id]);
    return { ...ready, ruleset: "mvp-v1", evaluatedAt: new Date().toISOString() };
  });

  app.get("/api/yaren/claims/:id/readiness-runs", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role === "hotel_manager") throw new ApplicationError(403, "forbidden", "Hotel users cannot open insurance claims");
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const rows = await pool.query(`
      SELECT r.id, r.ready, r.ruleset, r.checks, r.created_at, COALESCE(u.display_name, approver.display_name) AS display_name
      FROM billing.readiness_runs r
      LEFT JOIN identity.users u ON u.id = r.actor_id
      LEFT JOIN identity.users approver ON approver.id::text = r.checks #>> '{override,approver}'
      WHERE r.claim_id = $1
      ORDER BY r.created_at`, [id]);
    return rows.rows.map((row) => {
      const payload = row.checks && typeof row.checks === "object" ? row.checks : {};
      const checks = Array.isArray(payload) ? payload : Array.isArray(payload.checks) ? payload.checks : [];
      return {
        id: row.id,
        ready: row.ready,
        ruleset: row.ruleset,
        created_at: row.created_at,
        failed: checks.filter((check: { ok?: boolean; label?: string }) => !check.ok).map((check: { label?: string }) => check.label).filter(Boolean),
        overrideReason: payload.override?.reason ?? null,
        display_name: row.display_name,
      };
    });
  });

  app.post("/api/yaren/claims/:id/override", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["claims_officer"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ reason: z.string().min(3) }), request.body);
    const claim = await one(pool, "SELECT status FROM billing.claims WHERE id = $1", [id]);
    if (!claim) throw new ApplicationError(404, "claim_not_found", "Claim was not found");
    const ready = await readinessFor(pool, id);
    const failed = ready.checks.filter((check) => !check.ok);
    if (failed.length === 0) throw new DomainError("override_not_needed", "This claim already meets the readiness rules");
    assertClaimTransition(String(claim.status), "ready");
    await pool.query(
      "INSERT INTO billing.readiness_runs (id, claim_id, ready, checks, ruleset, actor_id) VALUES ($1,$2,true,$3::jsonb,'mvp-v1-override',$4)",
      [randomUUID(), id, JSON.stringify({ checks: ready.checks, override: { approver: actor.id, reason: body.reason, failed } }), actor.id],
    );
    await pool.query("UPDATE billing.claims SET status = 'ready', updated_at = now() WHERE id = $1", [id]);
    await pool.query("INSERT INTO billing.claim_events (id, claim_id, from_status, to_status, actor_id) VALUES ($1,$2,$3,'ready',$4)", [randomUUID(), id, claim.status, actor.id]);
    await audit(pool, actor, "claim.override", "claim", id, { reason: body.reason, failed });
    return { id, status: "ready", failed };
  });

  app.post("/api/yaren/claims/:id/status", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["claims_officer"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ status: z.string(), insurerReference: z.string().optional(), rejectionReason: z.string().optional(), settlementAmount: z.number().optional(), channel: z.enum(["portal", "email", "api"]).optional() }), request.body);
    const claim = await one(pool, "SELECT status FROM billing.claims WHERE id = $1", [id]);
    if (!claim) throw new ApplicationError(404, "claim_not_found", "Claim was not found");
    if (body.status === "ready" || (body.status === "submitted" && claim.status !== "ready")) {
      const ready = await readinessFor(pool, id);
      const overridden = await one(pool, "SELECT id FROM billing.readiness_runs WHERE claim_id = $1 AND ruleset = 'mvp-v1-override' LIMIT 1", [id]);
      if (!ready.ready && !overridden) throw new DomainError("claim_not_ready", "Claim pack is missing required report, invoice, coding, or coverage");
    }
    assertClaimSettlement(body.status, body.settlementAmount);
    assertClaimTransition(String(claim.status), body.status);
    await pool.query(
      "UPDATE billing.claims SET status = $2, insurer_reference = COALESCE($3, insurer_reference), rejection_reason = $4, settlement_amount = COALESCE($5, settlement_amount), updated_at = now() WHERE id = $1",
      [id, body.status, body.insurerReference ?? null, body.rejectionReason ?? null, body.settlementAmount ?? null],
    );
    await pool.query("INSERT INTO billing.claim_events (id, claim_id, from_status, to_status, actor_id) VALUES ($1,$2,$3,$4,$5)", [randomUUID(), id, claim.status, body.status, actor.id]);
    const submission = body.status === "submitted" ? await freezeClaim(pool, actor, id, body.channel ?? "portal") : null;
    await audit(pool, actor, "claim.status", "claim", id, { status: body.status, channel: body.channel ?? null });
    return { id, status: body.status, submission };
  });

  app.get("/api/yaren/claims/:id/submission", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role === "hotel_manager") throw new ApplicationError(403, "forbidden", "Hotel users cannot open insurance claims");
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const rows = await pool.query("SELECT snapshot, created_at FROM organization.master_versions WHERE entity = 'claim_submission' AND entity_id = $1 ORDER BY created_at", [id]);
    return { original: rows.rows[0]?.snapshot ?? null, versions: rows.rows };
  });

  app.get("/api/yaren/claims/:id/events", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role === "hotel_manager") throw new ApplicationError(403, "forbidden", "Hotel users cannot open insurance claims");
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const rows = await pool.query(`
      SELECT e.id, e.from_status, e.to_status, e.created_at, u.display_name
      FROM billing.claim_events e
      LEFT JOIN identity.users u ON u.id = e.actor_id
      WHERE e.claim_id = $1
      ORDER BY e.created_at`, [id]);
    return rows.rows;
  });

  app.post("/api/yaren/referrals", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, clinicalRoles);
    const body = parse(z.object({
      encounterId: z.uuid(),
      reason: z.string().min(1),
      facility: z.string().min(1),
      department: z.string().optional(),
      priority: z.enum(["routine", "urgent", "emergency"]),
      referralType: z.string().min(1),
      transport: z.string().optional(),
    }), request.body);
    const encounter = await one(pool, "SELECT patient_id, clinic_id, hotel_id FROM clinical.encounters WHERE id = $1", [body.encounterId]);
    if (!encounter) throw new ApplicationError(404, "encounter_not_found", "Encounter was not found");
    const scope = await clinicScope(pool, actor);
    if (!seesBranch(scope, encounter.clinic_id ? String(encounter.clinic_id) : null, encounter.hotel_id ? String(encounter.hotel_id) : null)) {
      throw new ApplicationError(403, "forbidden", "This clinic is outside your branch access");
    }
    const id = randomUUID();
    const referralNo = await sequence(pool, "coordination.referral_seq", "YRN-REF-");
    await pool.query(
      `INSERT INTO coordination.referrals (id, referral_no, encounter_id, patient_id, reason, facility, department, priority, referral_type, transport, status, physician_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'requested',$11)`,
      [id, referralNo, body.encounterId, encounter.patient_id, body.reason, body.facility, body.department ?? null, body.priority, body.referralType, body.transport ?? null, actor.id],
    );
    await audit(pool, actor, "referral.created", "referral", id);
    return { id, referralNo };
  });

  app.get("/api/yaren/referrals", auth, async () => (await pool.query(`SELECT r.*, p.given_name, p.family_name FROM coordination.referrals r JOIN patient_registry.patients p ON p.id = r.patient_id ORDER BY r.created_at DESC`)).rows);

  app.post("/api/yaren/transfers", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["nurse", "operations_manager", "physician"]));
    const body = parse(z.object({
      encounterId: z.uuid(),
      referralId: z.uuid().optional(),
      destination: z.string().min(1),
      priority: z.enum(["routine", "urgent", "emergency"]),
      reason: z.string().min(1),
      snapshot: z.string().optional(),
      handover: z.object({
        gcs: z.string().optional(),
        receivingClinician: z.string().optional(),
        receivingDepartment: z.string().optional(),
        referringClinician: z.string().optional(),
        ambulanceCrew: z.string().optional(),
        escort: z.string().optional(),
        oxygen: z.string().optional(),
        monitor: z.string().optional(),
        ivAccess: z.string().optional(),
        suction: z.string().optional(),
        doctorEscort: z.string().optional(),
        nurseEscort: z.string().optional(),
        isolation: z.string().optional(),
        documents: z.string().optional(),
        closureNotes: z.string().optional(),
        checklist: z.record(z.string(), z.boolean()).optional(),
        treatment: z.array(z.object({ time: z.string(), item: z.string(), dose: z.string(), response: z.string(), by: z.string() })).optional(),
        observations: z.array(z.object({ time: z.string(), event: z.string(), temp: z.string(), bp: z.string(), pulse: z.string(), spo2: z.string(), notes: z.string() })).optional(),
      }).optional(),
    }), request.body);
    const id = randomUUID();
    const transferNo = await sequence(pool, "coordination.transfer_seq", "YRN-TRF-");
    await pool.query(
      `INSERT INTO coordination.transfers (id, transfer_no, referral_id, encounter_id, destination, priority, status, reason, snapshot, handover, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'requested',$7,$8,$9::jsonb,$10)`,
      [id, transferNo, body.referralId ?? null, body.encounterId, body.destination, body.priority, body.reason, body.snapshot ?? null, body.handover ? JSON.stringify(body.handover) : null, actor.id],
    );
    await audit(pool, actor, "transfer.requested", "transfer", id);
    return { id, transferNo, status: "requested" };
  });

  app.get("/api/yaren/transfers", auth, async () => (await pool.query(`SELECT t.*, p.given_name, p.family_name, e.room_no FROM coordination.transfers t JOIN clinical.encounters e ON e.id = t.encounter_id JOIN patient_registry.patients p ON p.id = e.patient_id ORDER BY t.created_at DESC`)).rows);

  app.post("/api/yaren/transfers/:id/advance", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["nurse", "operations_manager"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ handover: z.string().optional() }), request.body ?? {});
    const current = await one(pool, "SELECT status, snapshot FROM coordination.transfers WHERE id = $1", [id]);
    if (!current) throw new ApplicationError(404, "transfer_not_found", "Transfer was not found");
    const status = nextTransferStatus(String(current.status));
    assertHandoverEvidence(status, body.handover ?? (current.snapshot ? String(current.snapshot) : null));
    const stamp = status === "en_route" ? "dispatch_at" : status === "arrived" ? "arrival_at" : status === "transferred" ? "departure_at" : status === "handover" ? "handover_at" : status === "closed" ? "closed_at" : "destination_arrival_at";
    await pool.query(`UPDATE coordination.transfers SET status = $2, ${stamp} = now() WHERE id = $1`, [id, status]);
    if (status === "closed") {
      await pool.query("UPDATE coordination.referrals SET status = 'closed' WHERE id = (SELECT referral_id FROM coordination.transfers WHERE id = $1)", [id]);
    }
    await audit(pool, actor, "transfer.advanced", "transfer", id, { status });
    return { id, status };
  });

  app.post("/api/yaren/requests", auth, async (request) => {
    const actor = await actorOf(request);
    const body = parse(z.object({
      hotelId: z.uuid(),
      patientId: z.uuid().optional(),
      encounterId: z.uuid().optional(),
      guestName: z.string().min(1),
      roomNo: z.string().optional(),
      requestType: z.enum(["doctor_to_room", "nurse_visit", "clinic_visit", "ambulance", "emergency"]),
      priority: z.enum(["routine", "urgent", "emergency"]),
    }), request.body);
    if (actor.role === "hotel_manager" && actor.hotelId !== body.hotelId) {
      throw new ApplicationError(403, "forbidden", "Hotel users can request service only for their property");
    }
    const id = randomUUID();
    const requestNo = await sequence(pool, "coordination.request_seq", "YRN-REQ-");
    const escalated = body.requestType === "ambulance" || body.requestType === "emergency" || body.priority === "emergency";
    const priority = escalated ? "emergency" : body.priority;
    await pool.query(
      `INSERT INTO coordination.service_requests (id, request_no, hotel_id, patient_id, encounter_id, guest_name, room_no, request_type, priority, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'acknowledged')`,
      [id, requestNo, body.hotelId, body.patientId ?? null, body.encounterId ?? null, body.guestName, body.roomNo ?? null, body.requestType, priority],
    );
    await audit(pool, actor, "hotel.request", "service_request", id, { priority });
    if (escalated) await audit(pool, actor, "hotel.request_escalated", "service_request", id, { requestType: body.requestType });
    return { id, requestNo, status: "acknowledged", priority };
  });

  app.get("/api/yaren/requests", auth, async (request) => {
    const actor = await actorOf(request);
    const scope = await clinicScope(pool, actor);
    const hotels = scope.all ? null : [...new Set(scope.clinics.filter((clinic) => clinic.capabilities.includes("desk")).map((clinic) => clinic.hotelId).filter((id): id is string => Boolean(id)))];
    const hotelFilter = hotels ? "WHERE r.hotel_id = ANY($1)" : "";
    const params = hotels ? [hotels] : [];
    const rows = await pool.query(`SELECT r.*, h.name AS hotel_name, u.display_name AS assigned_name FROM coordination.service_requests r JOIN organization.hotels h ON h.id = r.hotel_id LEFT JOIN identity.users u ON u.id = r.assigned_to ${hotelFilter} ORDER BY r.created_at DESC`, params);
    return rows.rows;
  });

  app.post("/api/yaren/requests/:id/status", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["receptionist", "nurse", "operations_manager"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ status: z.enum(["acknowledged", "assigned", "en_route", "in_progress", "completed"]), assignedTo: z.uuid().optional() }), request.body);
    const current = await one(pool, "SELECT status, assigned_to FROM coordination.service_requests WHERE id = $1", [id]);
    if (!current) throw new ApplicationError(404, "request_not_found", "Service request was not found");
    await pool.query("UPDATE coordination.service_requests SET status = $2, assigned_to = COALESCE($3, assigned_to), updated_at = now() WHERE id = $1", [id, body.status, body.assignedTo ?? null]);
    await audit(pool, actor, "hotel.request_status", "service_request", id, { status: body.status, previousStatus: current.status, previousAssignee: current.assigned_to, assignedTo: body.assignedTo ?? current.assigned_to });
    return { id, status: body.status };
  });

  app.get("/api/yaren/requests/:id/history", auth, async (request) => {
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const rows = await pool.query(
      "SELECT action, detail, created_at FROM identity.audit_events WHERE entity = 'service_request' AND entity_id = $1 ORDER BY created_at",
      [id],
    );
    return rows.rows;
  });

  app.post("/api/yaren/requests/:id/visit", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["receptionist", "nurse", "operations_manager"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ patientId: z.uuid().optional() }), request.body ?? {});
    const current = await one(pool, "SELECT * FROM coordination.service_requests WHERE id = $1", [id]);
    if (!current) throw new ApplicationError(404, "request_not_found", "Service request was not found");
    if (current.encounter_id) return { id, encounterId: current.encounter_id };
    const patientId = body.patientId ?? current.patient_id;
    if (!patientId) throw new DomainError("patient_required", "Link an existing guest before starting the visit");
    const patient = await one(pool, "SELECT id, hotel_id, room_no FROM patient_registry.patients WHERE id = $1", [patientId]);
    if (!patient) throw new ApplicationError(404, "patient_not_found", "Patient was not found");
    const encounter = await openEncounter(pool, actor, { patientId: String(patient.id), hotelId: String(current.hotel_id), roomNo: String(current.room_no ?? patient.room_no ?? ""), visitType: "room_visit" });
    await pool.query("UPDATE coordination.service_requests SET patient_id = $2, encounter_id = $3, status = 'in_progress', updated_at = now() WHERE id = $1", [id, patientId, encounter.id]);
    await audit(pool, actor, "hotel.request_linked", "service_request", id, { patientId, encounterId: encounter.id });
    return { id, encounterId: encounter.id };
  });

  app.get("/api/yaren/partner", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role !== "hotel_manager" && actor.role !== "system_admin" && actor.role !== "operations_manager") {
      throw new ApplicationError(403, "forbidden", "The partner portal is limited to the hotel and operations");
    }
    const hotelId = actor.role === "hotel_manager" ? actor.hotelId : (request.query as { hotelId?: string }).hotelId;
    const scope = await clinicScope(pool, actor);
    if (hotelId && !seesBranch(scope, null, String(hotelId), "desk") && !seesBranch(scope, null, String(hotelId), "reports")) {
      throw new ApplicationError(403, "forbidden", "This clinic is outside your branch access");
    }
    const hotel = await one(pool, "SELECT * FROM organization.hotels WHERE id = $1", [hotelId]);
    const requests = await pool.query("SELECT request_no, guest_name, room_no, request_type, priority, status, created_at, updated_at FROM coordination.service_requests WHERE hotel_id = $1 ORDER BY created_at DESC", [hotelId]);
    const summary = await one(pool, `
      SELECT count(*)::int AS cases,
        count(*) FILTER (WHERE status = 'completed')::int AS completed,
        COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FILTER (WHERE status = 'completed'),0)::int AS avg_seconds
      FROM coordination.service_requests WHERE hotel_id = $1 AND created_at >= date_trunc('month', now())`, [hotelId]);
    return { hotel, requests: requests.rows, summary, note: "Clinical notes, diagnoses and prescriptions are not shared with the hotel." };
  });

  app.post("/api/yaren/feedback", auth, async (request) => {
    const body = parse(z.object({
      patientName: z.string().optional(),
      hotelId: z.uuid().optional(),
      roomNo: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      nps: z.number().int().min(1).max(10),
      comment: z.string().optional(),
      source: z.string().optional(),
      heardFrom: z.string().optional(),
      improve: z.string().optional(),
      anonymous: z.boolean().optional(),
      publishConsent: z.boolean().default(false),
    }), request.body);
    if (body.publishConsent && body.anonymous) throw new DomainError("publish_consent", "An anonymous response cannot be published with the guest's name");
    const id = randomUUID();
    const template = await one(pool, "SELECT value FROM identity.settings WHERE key = 'survey_template'");
    await pool.query(
      `INSERT INTO quality.feedback (id, patient_name, hotel_id, room_no, phone, email, nps, comment, source, publish_consent, anonymous, template_version, heard_from, improve) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, body.anonymous ? null : body.patientName ?? null, body.hotelId ?? null, body.anonymous ? null : body.roomNo ?? null, body.anonymous ? null : body.phone ?? null, body.anonymous ? null : body.email ?? null, body.nps, body.comment ?? null, body.source ?? null, body.publishConsent, Boolean(body.anonymous), template?.value ?? "MED-04-v1", body.heardFrom ?? null, body.improve ?? null],
    );
    const threshold = await one(pool, "SELECT value FROM identity.settings WHERE key = 'low_nps_threshold'");
    if (body.nps <= Number(threshold?.value ?? 6)) {
      await pool.query(
        "INSERT INTO quality.incidents (id, severity, category, description, status) VALUES ($1,'moderate','satisfaction',$2,'open')",
        [randomUUID(), `Low satisfaction score ${body.nps} needs follow-up`],
      );
    }
    return { id };
  });

  app.get("/api/yaren/feedback", auth, async () => (await pool.query("SELECT f.*, h.name AS hotel_name FROM quality.feedback f LEFT JOIN organization.hotels h ON h.id = f.hotel_id ORDER BY f.created_at DESC")).rows);

  app.post("/api/yaren/incidents", auth, async (request) => {
    const actor = await actorOf(request);
    const body = parse(z.object({
      severity: z.enum(["low", "moderate", "high", "critical"]),
      category: z.string().min(1),
      description: z.string().min(1),
      rootCause: z.string().optional(),
      action: z.string().optional(),
    }), request.body);
    const id = randomUUID();
    await pool.query(
      `INSERT INTO quality.incidents (id, severity, category, description, root_cause, action, status, reported_by) VALUES ($1,$2,$3,$4,$5,$6,'open',$7)`,
      [id, body.severity, body.category, body.description, body.rootCause ?? null, body.action ?? null, actor.id],
    );
    await audit(pool, actor, "incident.opened", "incident", id, { severity: body.severity });
    if (body.severity === "high" || body.severity === "critical") await audit(pool, actor, "incident.escalated", "incident", id, { severity: body.severity });
    return { id, status: "open" };
  });

  app.get("/api/yaren/incidents", auth, async () => (await pool.query("SELECT * FROM quality.incidents ORDER BY created_at DESC")).rows);

  app.post("/api/yaren/incidents/:id/status", auth, async (request) => {
    const actor = await actorOf(request);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ status: z.enum(["open", "investigating", "closed"]), action: z.string().optional(), rootCause: z.string().optional(), evidence: z.string().optional() }), request.body);
    const current = await one(pool, "SELECT status, evidence FROM quality.incidents WHERE id = $1", [id]);
    if (!current) throw new ApplicationError(404, "incident_not_found", "Incident was not found");
    assertIncidentClose(body.status, body.evidence ?? current.evidence);
    await pool.query("UPDATE quality.incidents SET status = $2, action = COALESCE($3, action), root_cause = COALESCE($4, root_cause), evidence = COALESCE($5, evidence) WHERE id = $1", [id, body.status, body.action ?? null, body.rootCause ?? null, body.evidence ?? null]);
    await audit(pool, actor, current.status === "closed" && body.status === "open" ? "incident.reopened" : "incident.status", "incident", id, { previousStatus: current.status, status: body.status });
    return { id, status: body.status, previousStatus: current.status };
  });

  async function operationsReport(actor: { role: string; hotelId: string | null }, query: { from?: string; to?: string; hotelId?: string }) {
    const today = new Date().toISOString().slice(0, 10);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "") ? query.from! : today;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "") ? query.to! : from;
    const hotelId = actor.role === "hotel_manager" ? actor.hotelId : query.hotelId || null;
    const volume = await one(pool, `
      SELECT count(*)::int AS encounters,
        count(*) FILTER (WHERE visit_type = 'room_visit')::int AS room_visits,
        count(*) FILTER (WHERE status = 'closed')::int AS closed
      FROM clinical.encounters
      WHERE arrival_at::date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR hotel_id = $3)`, [from, to, hotelId]);
    const referrals = await one(pool, `
      SELECT count(*)::int AS referrals FROM coordination.referrals r
      JOIN clinical.encounters e ON e.id = r.encounter_id
      WHERE r.created_at::date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR e.hotel_id = $3)`, [from, to, hotelId]);
    const days = await pool.query(`
      SELECT to_char(arrival_at::date, 'YYYY-MM-DD') AS day, count(*)::int AS encounters
      FROM clinical.encounters
      WHERE arrival_at::date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR hotel_id = $3)
      GROUP BY arrival_at::date
      ORDER BY arrival_at::date`, [from, to, hotelId]);
    return { from, to, hotelId, volume, referrals, days: days.rows };
  }

  app.get("/api/yaren/reports/operations", auth, async (request) => {
    const actor = await actorOf(request);
    return operationsReport(actor, request.query as { from?: string; to?: string; hotelId?: string });
  });

  app.get("/api/yaren/reports/operations/export", auth, async (request) => {
    const actor = await actorOf(request);
    const report = await operationsReport(actor, request.query as { from?: string; to?: string; hotelId?: string });
    await audit(pool, actor, "report.exported", "operations", actor.id, { from: report.from, to: report.to, hotelId: report.hotelId });
    const csv = [
      "filter_from,filter_to,filter_hotel,encounters,room_visits,closed,referrals",
      `${report.from},${report.to},${report.hotelId ?? ""},${report.volume?.encounters ?? 0},${report.volume?.room_visits ?? 0},${report.volume?.closed ?? 0},${report.referrals?.referrals ?? 0}`,
    ].join("\n");
    return { csv, from: report.from, to: report.to, hotelId: report.hotelId };
  });

  app.get("/api/yaren/reports/monthly", auth, async (request) => {
    const actor = await actorOf(request);
    const requested = (request.query as { hotelId?: string }).hotelId;
    if (actor.role === "hotel_manager" && requested && requested !== actor.hotelId) {
      throw new ApplicationError(403, "forbidden", "A hotel user can only open their own property report");
    }
    const hotelId = actor.role === "hotel_manager" ? actor.hotelId : requested;
    const month = /^\d{4}-\d{2}$/.test(String((request.query as { month?: string }).month ?? "")) ? String((request.query as { month?: string }).month) : new Date().toISOString().slice(0, 7);
    const live = await one(pool, `
      SELECT count(*)::int AS cases,
        count(*) FILTER (WHERE status = 'completed')::int AS completed,
        count(DISTINCT room_no)::int AS rooms
      FROM coordination.service_requests
      WHERE ($1::uuid IS NULL OR hotel_id = $1) AND to_char(created_at, 'YYYY-MM') = $2`, [hotelId ?? null, month]);
    const published = await one(pool, `
      SELECT snapshot, created_at FROM organization.master_versions
      WHERE entity = 'monthly_report' AND snapshot->>'hotelId' = $1 AND snapshot->>'month' = $2
      ORDER BY created_at DESC LIMIT 1`, [hotelId ?? "", month]);
    const hotel = hotelId ? await one(pool, "SELECT name FROM organization.hotels WHERE id = $1", [hotelId]) : null;
    return { month, hotel: hotel?.name ?? "", cases: live?.cases ?? 0, completed: live?.completed ?? 0, rooms: live?.rooms ?? 0, published: published?.snapshot ?? null, publishedAt: published?.created_at ?? null };
  });

  app.post("/api/yaren/reports/monthly/publish", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["operations_manager", "center_manager"]));
    const body = parse(z.object({ hotelId: z.uuid(), month: z.string().regex(/^\d{4}-\d{2}$/) }), request.body);
    const live = await one(pool, `
      SELECT count(*)::int AS cases,
        count(*) FILTER (WHERE status = 'completed')::int AS completed,
        count(DISTINCT room_no)::int AS rooms
      FROM coordination.service_requests WHERE hotel_id = $1 AND to_char(created_at, 'YYYY-MM') = $2`, [body.hotelId, body.month]);
    const hotel = await one(pool, "SELECT name FROM organization.hotels WHERE id = $1", [body.hotelId]);
    const snapshot = { hotelId: body.hotelId, hotel: hotel?.name ?? "", month: body.month, cases: live?.cases ?? 0, completed: live?.completed ?? 0, rooms: live?.rooms ?? 0 };
    await pool.query("INSERT INTO organization.master_versions (id, entity, entity_id, snapshot, actor_id) VALUES ($1,'monthly_report',$2,$3::jsonb,$4)", [randomUUID(), body.hotelId, JSON.stringify(snapshot), actor.id]);
    await audit(pool, actor, "report.published", "monthly_report", body.hotelId, { month: body.month });
    return snapshot;
  });

  app.get("/api/yaren/reports/finance", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["operations_manager", "center_manager", "claims_officer"]));
    const totals = await one(pool, `
      SELECT COALESCE(SUM(subtotal),0) AS revenue,
        COALESCE(SUM(amount_paid),0) AS collected,
        COALESCE(SUM(outstanding),0) AS receivables,
        count(*) FILTER (WHERE status IN ('issued','part_paid'))::int AS open_invoices
      FROM billing.invoices WHERE status <> 'void'`);
    const invoices = await pool.query("SELECT status AS label, count(*)::int AS value FROM billing.invoices WHERE status <> 'void' GROUP BY status ORDER BY status");
    const currency = await one(pool, "SELECT value FROM identity.settings WHERE key = 'currency'");
    return { ...(totals ? moneyRow(totals) : {}), invoices: invoices.rows, currency: currency?.value ?? "EGP" };
  });

  app.get("/api/yaren/reports/management", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["operations_manager", "center_manager"]));
    const [ops, finance, claims, satisfaction, encounterMix, claimMix, hotels] = await Promise.all([
      one(pool, "SELECT count(*)::int AS encounters FROM clinical.encounters WHERE arrival_at >= date_trunc('month', now())"),
      one(pool, "SELECT COALESCE(SUM(amount_paid),0) AS collected, COALESCE(SUM(outstanding),0) AS receivables FROM billing.invoices"),
      one(pool, "SELECT count(*) FILTER (WHERE status IN ('submitted','under_review'))::int AS pending, count(*) FILTER (WHERE status = 'rejected')::int AS rejected FROM billing.claims"),
      one(pool, "SELECT COALESCE(AVG(nps),0)::numeric(4,1) AS nps, count(*)::int AS responses FROM quality.feedback"),
      pool.query("SELECT status AS label, count(*)::int AS value FROM clinical.encounters WHERE arrival_at >= date_trunc('month', now()) GROUP BY status ORDER BY status"),
      pool.query("SELECT status AS label, count(*)::int AS value FROM billing.claims GROUP BY status ORDER BY status"),
      pool.query(`SELECT h.name AS label, count(r.id)::int AS value
        FROM organization.hotels h
        LEFT JOIN coordination.service_requests r ON r.hotel_id = h.id AND r.status <> 'completed'
        GROUP BY h.name ORDER BY h.name`),
    ]);
    return { ops, finance: finance ? moneyRow(finance) : {}, claims, satisfaction, encounterMix: encounterMix.rows, claimMix: claimMix.rows, hotels: hotels.rows, generatedAt: new Date().toISOString() };
  });

  app.get("/api/yaren/ledger", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["operations_manager", "center_manager", "claims_officer"]));
    const invoices = await pool.query(`
      SELECT invoice_no, status, patient_payable::float AS amount, issued_at
      FROM billing.invoices WHERE status NOT IN ('draft', 'void') ORDER BY issued_at DESC LIMIT 100`);
    const payments = await pool.query(`
      SELECT p.amount::float AS amount, p.method, p.paid_at, i.invoice_no
      FROM billing.payments p JOIN billing.invoices i ON i.id = p.invoice_id ORDER BY p.paid_at DESC LIMIT 100`);
    const journal = await pool.query("SELECT account, SUM(debit)::float AS debit, SUM(credit)::float AS credit FROM billing.journal_lines GROUP BY account ORDER BY account");
    return {
      generatedAt: new Date().toISOString(),
      receivables: invoices.rows.map(moneyRow),
      cash: payments.rows.map(moneyRow),
      journal: journal.rows.map(moneyRow),
    };
  });

  app.post("/api/yaren/payroll/runs", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["center_manager"]));
    const body = parse(z.object({
      period: z.string().min(4),
      lines: z.array(z.object({ userId: z.uuid(), gross: z.number().min(0), deduction: z.number().min(0) })).min(1),
    }), request.body);
    const id = randomUUID();
    await pool.query("INSERT INTO payroll.runs (id, period, status, created_by) VALUES ($1,$2,'draft',$3)", [id, body.period, actor.id]);
    for (const line of body.lines) {
      const net = Math.round((line.gross - line.deduction) * 100) / 100;
      if (net < 0) throw new DomainError("payroll_negative", "A pay line cannot deduct more than the gross");
      await pool.query("INSERT INTO payroll.lines (id, run_id, user_id, gross, deduction, net) VALUES ($1,$2,$3,$4,$5,$6)", [randomUUID(), id, line.userId, line.gross, line.deduction, net]);
    }
    await audit(pool, actor, "payroll.drafted", "payroll", id);
    return { id, status: "draft" };
  });

  app.get("/api/yaren/payroll/runs", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["center_manager"]));
    const runs = await pool.query(`
      SELECT r.id, r.period, r.status, r.created_at, COALESCE(SUM(l.net),0)::float AS net,
        COALESCE(json_agg(json_build_object('name', u.display_name, 'gross', l.gross::float, 'deduction', l.deduction::float, 'net', l.net::float)) FILTER (WHERE l.id IS NOT NULL), '[]'::json) AS lines
      FROM payroll.runs r
      LEFT JOIN payroll.lines l ON l.run_id = r.id
      LEFT JOIN identity.users u ON u.id = l.user_id
      GROUP BY r.id ORDER BY r.created_at DESC`);
    return runs.rows.map(moneyRow);
  });

  app.post("/api/yaren/coding/suggest", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["physician"]));
    const body = parse(z.object({ text: z.string().min(2) }), request.body);
    await audit(pool, actor, "coding.suggested", "coding", actor.id);
    return { suggestions: suggestCodes(body.text) };
  });

  app.post("/api/yaren/acceptance/run", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role !== "system_admin") throw new ApplicationError(403, "forbidden", "Only a system admin can run acceptance");
    const outcome = await runAcceptance(pool);
    const id = randomUUID();
    await pool.query("INSERT INTO identity.acceptance_runs (id, created_by, passed, failed, results) VALUES ($1,$2,$3,$4,$5::jsonb)", [id, actor.id, outcome.passed, outcome.failed, JSON.stringify(outcome.results)]);
    return { id, passed: outcome.passed, failed: outcome.failed };
  });

  app.get("/api/yaren/acceptance/latest", auth, async () => {
    const row = await one(pool, "SELECT id, passed, failed, results, created_at FROM identity.acceptance_runs ORDER BY created_at DESC LIMIT 1");
    return row ?? { passed: 0, failed: 0, results: [] };
  });

  app.get("/api/yaren/investigations", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role === "hotel_manager") throw new ApplicationError(403, "forbidden", "Hotel users cannot open investigations");
    const rows = await pool.query(`
      SELECT i.id, i.request_no, i.priority, i.status, i.tests, i.result_text, i.critical, i.critical_value, i.receiving_lab, i.received_at, p.given_name, p.family_name
      FROM clinical.investigations i
      JOIN clinical.encounters e ON e.id = i.encounter_id
      JOIN patient_registry.patients p ON p.id = e.patient_id
      ORDER BY i.created_at DESC`);
    return rows.rows;
  });

  app.post("/api/yaren/investigations/:id/result", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, clinicalRoles);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ resultText: z.string().min(1), critical: z.boolean().default(false), criticalValue: z.string().optional(), receivingLab: z.string().optional() }), request.body);
    const updated = await pool.query("UPDATE clinical.investigations SET result_text = $2, critical = $3, critical_value = $4, receiving_lab = COALESCE($5, receiving_lab), received_at = now() WHERE id = $1", [id, body.resultText, body.critical, body.criticalValue ?? null, body.receivingLab || null]);
    if (!updated.rowCount) throw new ApplicationError(404, "investigation_not_found", "Investigation was not found");
    if (body.critical) await audit(pool, actor, "result.critical", "investigation", id, { criticalValue: body.criticalValue ?? "" });
    return { id, critical: body.critical };
  });

  app.post("/api/yaren/encounters/:id/report/share", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["physician", "claims_officer"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ channel: z.enum(["insurer", "hotel", "patient", "hospital"]), recipient: z.string().min(2) }), request.body);
    const report = await one(pool, "SELECT status FROM clinical.reports WHERE encounter_id = $1", [id]);
    if (report?.status !== "signed") throw new DomainError("report_unsigned", "Only a signed report can be shared");
    const shareId = randomUUID();
    await pool.query("INSERT INTO clinical.distributions (id, encounter_id, channel, recipient, actor_id) VALUES ($1,$2,$3,$4,$5)", [shareId, id, body.channel, body.recipient, actor.id]);
    await audit(pool, actor, "report.shared", "encounter", id, { channel: body.channel });
    return { id: shareId, channel: body.channel };
  });

  app.get("/api/yaren/distributions", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role === "hotel_manager") throw new ApplicationError(403, "forbidden", "Hotel users cannot open shared reports");
    guard(actor, new Set(["physician", "claims_officer", "center_manager", "operations_manager", "nurse"]));
    const rows = await pool.query(`
      SELECT d.id, d.channel, d.recipient, d.created_at, e.encounter_no, p.given_name, p.family_name
      FROM clinical.distributions d
      JOIN clinical.encounters e ON e.id = d.encounter_id
      JOIN patient_registry.patients p ON p.id = e.patient_id
      ORDER BY d.created_at DESC`);
    return rows.rows;
  });

  app.get("/api/yaren/audit", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["center_manager"]));
    const rows = await pool.query(`SELECT a.*, u.display_name FROM identity.audit_events a LEFT JOIN identity.users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 200`);
    return rows.rows.map((row) => ({ ...row, detail: maskDetail(row.detail) }));
  });

  const settingsEntity = "00000000-0000-4000-8000-000000000004";
  const criticalSettings = new Set(["tax_percent", "mfa_required", "insurer_mode", "insurer_adapter_url", "insurer_adapter_host", "insurer_client_id", "insurer_client_secret", "tax_reg_no", "commercial_reg", "payroll_rules", "uat_signed_by", "uat_signed_on", "uat_note"]);

  function assertConfig(next: Record<string, string>) {
    if (next.tax_percent !== undefined && !/^\d+(\.\d+)?$/.test(next.tax_percent)) {
      throw new DomainError("configuration_invalid", "Tax percent must be a number");
    }
    if (next.mfa_required !== undefined && next.mfa_required !== "true" && next.mfa_required !== "false") {
      throw new DomainError("configuration_invalid", "Multi-factor sign-in must be true or false");
    }
    if (next.insurer_mode === "adapter") {
      let target: URL;
      try {
        target = new URL(next.insurer_adapter_url ?? "");
      } catch {
        throw new DomainError("configuration_invalid", "An insurer adapter needs an https address that matches the approved host");
      }
      if (target.protocol !== "https:" || !next.insurer_adapter_host || target.hostname !== next.insurer_adapter_host) {
        throw new DomainError("configuration_invalid", "An insurer adapter needs an https address that matches the approved host");
      }
    } else if (next.insurer_mode && !["ruleset", "simulator", "adapter"].includes(next.insurer_mode)) {
      throw new DomainError("configuration_invalid", "Insurer mode must be ruleset, simulator, or adapter");
    }
    if (next.uat_signed_on && !/^\d{4}-\d{2}-\d{2}$/.test(next.uat_signed_on)) {
      throw new DomainError("configuration_invalid", "The acceptance sign-off date must be YYYY-MM-DD");
    }
  }

  async function applyDueSettings() {
    const due = await pool.query("SELECT id, snapshot FROM organization.master_versions WHERE entity = 'settings_schedule' AND COALESCE(snapshot->>'applied', 'false') <> 'true' AND (snapshot->>'effective')::date <= CURRENT_DATE ORDER BY created_at");
    for (const row of due.rows) {
      const values = (row.snapshot?.values ?? {}) as Record<string, string>;
      for (const [key, value] of Object.entries(values)) {
        if (key.startsWith("_")) continue;
        await pool.query("INSERT INTO identity.settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, String(value)]);
      }
      await pool.query("UPDATE organization.master_versions SET snapshot = snapshot || '{\"applied\":true}'::jsonb WHERE id = $1", [row.id]);
      await pool.query("INSERT INTO organization.master_versions (id, entity, entity_id, snapshot) VALUES ($1,'settings',$2,$3::jsonb)", [randomUUID(), settingsEntity, JSON.stringify({ values, source: row.id })]);
    }
  }

  app.get("/api/yaren/payments", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, moneyRoles);
    const rows = await pool.query(`
      SELECT p.id, COALESCE(p.reference, p.id::text) AS reference, p.amount::float AS amount, p.method, p.paid_at,
        i.invoice_no, (pt.given_name || ' ' || pt.family_name) AS payer, u.display_name AS cashier
      FROM billing.payments p
      JOIN billing.invoices i ON i.id = p.invoice_id
      JOIN patient_registry.patients pt ON pt.id = i.patient_id
      LEFT JOIN identity.users u ON u.id = p.collected_by
      ORDER BY p.paid_at DESC LIMIT 50`);
    return rows.rows.map(moneyRow);
  });

  app.get("/api/yaren/refunds", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, moneyRoles);
    const rows = await pool.query(`
      SELECT r.id, r.amount::float AS amount, r.reason, r.created_at, i.invoice_no, u.display_name
      FROM billing.refunds r
      JOIN billing.invoices i ON i.id = r.invoice_id
      LEFT JOIN identity.users u ON u.id = r.actor_id
      ORDER BY r.created_at DESC
      LIMIT 50`);
    return rows.rows.map(moneyRow);
  });

  app.get("/api/yaren/payments/:id/receipt", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, moneyRoles);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const row = await one(pool, `
      SELECT p.id, COALESCE(p.reference, p.id::text) AS reference, p.amount::float AS amount, p.method, p.paid_at,
        i.invoice_no, (pt.given_name || ' ' || pt.family_name) AS payer, u.display_name AS cashier
      FROM billing.payments p
      JOIN billing.invoices i ON i.id = p.invoice_id
      JOIN patient_registry.patients pt ON pt.id = i.patient_id
      LEFT JOIN identity.users u ON u.id = p.collected_by
      WHERE p.id = $1`, [id]);
    if (!row) throw new ApplicationError(404, "payment_not_found", "Payment was not found");
    await audit(pool, actor, "payment.receipt", "payment", id, { reference: row.reference });
    return moneyRow(row);
  });

  app.get("/api/yaren/settings", auth, async (request) => {
    const actor = await actorOf(request);
    await applyDueSettings();
    const rows = await pool.query("SELECT key, value FROM identity.settings ORDER BY key");
    const privileged = actor.role === "system_admin" || actor.role === "center_manager";
    return Object.fromEntries(rows.rows.filter((row: { key: string }) => privileged || !isSecretSetting(row.key)).map((row: { key: string; value: string }) => [row.key, row.value]));
  });

  app.put("/api/yaren/settings", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["center_manager"]));
    const body = parse(z.record(z.string(), z.string()), request.body);
    const approved = body._approved === "yes";
    const effective = /^\d{4}-\d{2}-\d{2}$/.test(body._effective ?? "") ? body._effective : null;
    const current = await pool.query("SELECT key, value FROM identity.settings");
    const saved = Object.fromEntries(current.rows.map((row: { key: string; value: string }) => [row.key, row.value]));
    const changes: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (key.startsWith("_")) continue;
      changes[key] = value;
      if (criticalSettings.has(key) && saved[key] !== value && !approved) {
        throw new DomainError("approval_required", "Changing tax, sign-in, or insurer settings needs approval");
      }
    }
    const next = { ...saved, ...changes };
    assertConfig(next);
    const today = new Date().toISOString().slice(0, 10);
    if (effective && effective > today) {
      await pool.query("INSERT INTO organization.master_versions (id, entity, entity_id, snapshot, actor_id) VALUES ($1,'settings_schedule',$2,$3::jsonb,$4)", [randomUUID(), settingsEntity, JSON.stringify({ effective, values: changes, applied: false }), actor.id]);
      await audit(pool, actor, "settings.scheduled", "settings", "global", { approved, effective });
      return { scheduled: "yes", effective };
    }
    for (const [key, value] of Object.entries(changes)) {
      await pool.query("INSERT INTO identity.settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, value]);
    }
    const versionId = randomUUID();
    await pool.query("INSERT INTO organization.master_versions (id, entity, entity_id, snapshot, actor_id) VALUES ($1,'settings',$2,$3::jsonb,$4)", [versionId, settingsEntity, JSON.stringify({ values: next }), actor.id]);
    await audit(pool, actor, "settings.updated", "settings", "global", { approved, settingsVersion: versionId });
    return next;
  });

  app.post("/api/yaren/users", auth, async (request) => {
    const actor = await actorOf(request);
    const actorType = await userTypeOf(actor.id);
    if (actorType !== "super_admin" && actorType !== "admin") throw new ApplicationError(403, "forbidden", "Only an admin can create users");
    const body = parse(z.object({
      email: z.string().min(3),
      password: z.string().min(8),
      displayName: z.string().min(2),
      userType: z.enum(["super_admin", "admin", "staff"]).default("staff"),
      role: z.enum(staffRoles).optional(),
      hotelId: z.uuid().optional(),
    }), request.body);
    if (body.userType !== "staff" && actorType !== "super_admin") throw new ApplicationError(403, "forbidden", "Only a super admin can create an admin");
    const staffJobs = ["physician", "nurse", "receptionist", "pharmacist", "claims_officer", "hotel_manager"] as const;
    const role = body.userType === "super_admin" ? "system_admin" : body.userType === "admin" ? "center_manager" : (body.role && staffJobs.includes(body.role as typeof staffJobs[number]) ? body.role : "receptionist");
    const user = await identity.register({
      id: randomUUID(),
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      role: role as StaffRole,
      centerId: null,
    });
    await pool.query("UPDATE identity.users SET user_type = $2 WHERE id = $1", [user.id, body.userType]);
    if (body.hotelId) await pool.query("UPDATE identity.users SET hotel_id = $2 WHERE id = $1", [user.id, body.hotelId]);
    await audit(pool, actor, "user.created", "user", user.id, { userType: body.userType });
    return { ...user, userType: body.userType };
  });

  app.post("/api/yaren/users/:id/status", auth, async (request) => {
    const actor = await actorOf(request);
    const actorType = await userTypeOf(actor.id);
    if (actorType !== "super_admin" && actorType !== "admin") throw new ApplicationError(403, "forbidden", "Only an admin can change users");
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    if (id === actor.id) throw new ApplicationError(403, "forbidden", "You cannot change your own account");
    const target = await one(pool, "SELECT user_type FROM identity.users WHERE id = $1", [id]);
    if (!target) throw new ApplicationError(404, "user_not_found", "User was not found");
    if (actorType === "admin" && target.user_type !== "staff") throw new ApplicationError(403, "forbidden", "An admin can change staff accounts only");
    const body = parse(z.object({ status: z.enum(["active", "disabled"]), role: z.enum(staffRoles).optional(), userType: z.enum(["super_admin", "admin", "staff"]).optional() }), request.body);
    if (body.userType && actorType !== "super_admin") throw new ApplicationError(403, "forbidden", "Only a super admin can change a user type");
    const nextRole = body.userType === "super_admin" ? "system_admin" : body.userType === "admin" ? "center_manager" : body.userType === "staff" && (target.user_type === "super_admin" || target.user_type === "admin") ? "receptionist" : body.role ?? null;
    await pool.query("UPDATE identity.users SET status = $2, role = COALESCE($3, role), user_type = COALESCE($4, user_type) WHERE id = $1", [id, body.status, nextRole, body.userType ?? null]);
    await audit(pool, actor, "user.updated", "user", id, { userType: body.userType ?? target.user_type });
    return { id, ...body };
  });

  app.post("/api/yaren/master/hotels", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["center_manager"]));
    const body = parse(z.object({ name: z.string().min(2), city: z.string().min(1), phone: z.string().optional() }), request.body);
    const id = randomUUID();
    await pool.query("INSERT INTO organization.hotels (id, name, city, phone) VALUES ($1,$2,$3,$4)", [id, body.name, body.city, body.phone ?? null]);
    await audit(pool, actor, "master.hotel", "hotel", id);
    return { id };
  });

  app.post("/api/yaren/master/services", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["center_manager"]));
    const body = parse(z.object({ code: z.string().min(1), name: z.string().min(1), category: z.string().min(1), unitPrice: z.number().min(0) }), request.body);
    const id = randomUUID();
    try {
      await pool.query("INSERT INTO organization.services (id, code, name, category, unit_price) VALUES ($1,$2,$3,$4,$5)", [id, body.code, body.name, body.category, body.unitPrice]);
    } catch (error) {
      if (isDuplicate(error)) throw new ApplicationError(409, "duplicate_code", "That service code is already in use");
      throw error;
    }
    await pool.query("INSERT INTO organization.master_versions (id, entity, entity_id, snapshot, actor_id) VALUES ($1,'service',$2,$3::jsonb,$4)", [randomUUID(), id, JSON.stringify(body), actor.id]);
    return { id };
  });

  app.post("/api/yaren/master/insurers", auth, async (request) => {
    const body = parse(z.object({ name: z.string().min(2) }), request.body);
    const id = randomUUID();
    await pool.query("INSERT INTO organization.insurers (id, name) VALUES ($1,$2)", [id, body.name]);
    return { id };
  });

  app.post("/api/yaren/master/medications", auth, async (request) => {
    const body = parse(z.object({ code: z.string(), name: z.string(), strength: z.string(), form: z.string(), quantity: z.number().int().positive(), lot: z.string(), expiryDate: z.string() }), request.body);
    const id = randomUUID();
    await pool.query("INSERT INTO pharmacy.medications (id, code, name, strength, form) VALUES ($1,$2,$3,$4,$5)", [id, body.code, body.name, body.strength, body.form]);
    await pool.query("INSERT INTO pharmacy.batches (id, medication_id, lot, expiry_date, quantity) VALUES ($1,$2,$3,$4,$5)", [randomUUID(), id, body.lot, body.expiryDate, body.quantity]);
    return { id };
  });

  app.post("/api/yaren/master/clinics", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["center_manager"]));
    const body = parse(z.object({ hotelId: z.uuid(), name: z.string().min(2) }), request.body);
    const id = randomUUID();
    await pool.query("INSERT INTO organization.clinics (id, hotel_id, name) VALUES ($1,$2,$3)", [id, body.hotelId, body.name]);
    await audit(pool, actor, "master.clinic", "clinic", id);
    return { id };
  });

  app.post("/api/yaren/encounters/:id/amend", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["physician"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({
      target: z.enum(["consultation", "report"]),
      reason: z.string().min(3),
      diagnosis: z.string().optional(),
      icd10: z.string().optional(),
      plan: z.string().optional(),
      summary: z.string().optional(),
    }), request.body);
    const table = body.target === "consultation" ? "clinical.consultations" : "clinical.reports";
    const current = await one(pool, `SELECT * FROM ${table} WHERE encounter_id = $1`, [id]);
    if (!current) throw new ApplicationError(404, "record_not_found", "Nothing has been signed for this visit yet");
    const reason = requireAmendment(String(current.status), body.reason);
    await pool.query(
      "INSERT INTO clinical.amendments (id, encounter_id, target, reason, previous, author_id) VALUES ($1,$2,$3,$4,$5::jsonb,$6)",
      [randomUUID(), id, body.target, reason, JSON.stringify(current), actor.id],
    );
    if (body.target === "consultation") {
      await pool.query(
        "UPDATE clinical.consultations SET diagnosis = COALESCE($2, diagnosis), icd10 = COALESCE($3, icd10), plan = COALESCE($4, plan), updated_at = now() WHERE encounter_id = $1",
        [id, body.diagnosis ?? null, body.icd10 ?? null, body.plan ?? null],
      );
    } else {
      await pool.query("UPDATE clinical.reports SET summary = COALESCE($2, summary) WHERE encounter_id = $1", [id, body.summary ?? null]);
    }
    await audit(pool, actor, "record.amended", body.target, id, { reason });
    return { id, amended: true };
  });

  app.get("/api/yaren/encounters/:id/amendments", auth, async (request) => {
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    return (await pool.query("SELECT a.*, u.display_name FROM clinical.amendments a LEFT JOIN identity.users u ON u.id = a.author_id WHERE a.encounter_id = $1 ORDER BY a.created_at", [id])).rows;
  });

  app.post("/api/yaren/prescriptions/:id/return", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["pharmacist"]));
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ batchId: z.uuid(), medicationId: z.uuid(), quantity: z.number().int().positive(), reason: z.string().min(3) }), request.body);
    const dispense = await one(pool, "SELECT id FROM pharmacy.dispenses WHERE prescription_id = $1", [id]);
    if (!dispense) throw new ApplicationError(404, "dispense_not_found", "This prescription has not been dispensed");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const batch = await client.query("SELECT quantity FROM pharmacy.batches WHERE id = $1 FOR UPDATE", [body.batchId]);
      const available = Number(batch.rows[0]?.quantity ?? -1);
      if (available < 0) throw new ApplicationError(404, "batch_not_found", "Selected batch was not found");
      const next = returnStock(available, body.quantity);
      await client.query("UPDATE pharmacy.batches SET quantity = $2 WHERE id = $1", [body.batchId, next]);
      await client.query(
        "INSERT INTO pharmacy.movements (id, batch_id, medication_id, quantity, direction, reason, dispense_id, actor_id) VALUES ($1,$2,$3,$4,'return',$5,$6,$7)",
        [randomUUID(), body.batchId, body.medicationId, body.quantity, body.reason, dispense.id, actor.id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await audit(pool, actor, "pharmacy.returned", "prescription", id, { quantity: body.quantity });
    return { id, returned: body.quantity };
  });

  app.post("/api/yaren/invoices/:id/void", auth, async (request) => {
    const actor = await actorOf(request);
    const allowed = await one(pool, "SELECT allowed FROM identity.permissions WHERE role = $1 AND resource = 'invoice' AND action = 'void'", [actor.role]);
    if (actor.role !== "system_admin" && !allowed?.allowed) throw new ApplicationError(403, "forbidden", "You cannot void an invoice");
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ reason: z.string().min(3) }), request.body);
    const invoice = await one(pool, "SELECT status, amount_paid::float AS amount_paid FROM billing.invoices WHERE id = $1", [id]);
    if (!invoice) throw new ApplicationError(404, "invoice_not_found", "Invoice was not found");
    voidInvoice(String(invoice.status), Number(invoice.amount_paid));
    await pool.query("UPDATE billing.invoices SET status = 'void', void_reason = $2, outstanding = 0 WHERE id = $1", [id, body.reason]);
    await audit(pool, actor, "invoice.voided", "invoice", id, { reason: body.reason });
    return { id, status: "void" };
  });

  app.post("/api/yaren/invoices/:id/refunds", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, moneyRoles);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ amount: z.number().positive(), reason: z.string().min(3) }), request.body);
    const invoice = await one(pool, "SELECT status, amount_paid::float AS amount_paid, outstanding::float AS outstanding, patient_payable::float AS patient_payable FROM billing.invoices WHERE id = $1", [id]);
    if (!invoice) throw new ApplicationError(404, "invoice_not_found", "Invoice was not found");
    if (invoice.status === "void" || invoice.status === "draft") throw new DomainError("invoice_not_refundable", "Only an issued invoice can be refunded");
    const next = refundInvoice(Number(invoice.amount_paid), Number(invoice.outstanding), Number(invoice.patient_payable), body.amount);
    const refundId = randomUUID();
    await pool.query("INSERT INTO billing.refunds (id, invoice_id, amount, reason, actor_id) VALUES ($1,$2,$3,$4,$5)", [refundId, id, body.amount, body.reason, actor.id]);
    await pool.query("UPDATE billing.invoices SET amount_paid = $2, outstanding = $3, status = $4 WHERE id = $1", [id, next.amountPaid, next.outstanding, next.status]);
    const invoiceNo = await one(pool, "SELECT invoice_no FROM billing.invoices WHERE id = $1", [id]);
    await postJournal(pool, "refund", refundId, [
      { account: "accounts_receivable", debit: body.amount, credit: 0, memo: String(invoiceNo?.invoice_no ?? id) },
      { account: "cash", debit: 0, credit: body.amount, memo: String(invoiceNo?.invoice_no ?? id) },
    ]);
    await audit(pool, actor, "invoice.refunded", "invoice", id, { amount: body.amount, reason: body.reason, approver: actor.id });
    return { id, refundId, approver: actor.id, ...next };
  });

  app.post("/api/yaren/inventory/receipts", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["pharmacist"]));
    const body = parse(z.object({ medicationId: z.uuid(), lot: z.string().min(1), expiryDate: z.string().min(1), quantity: z.number().int().positive() }), request.body);
    const batchId = randomUUID();
    await pool.query("INSERT INTO pharmacy.batches (id, medication_id, lot, expiry_date, quantity) VALUES ($1,$2,$3,$4,$5)", [batchId, body.medicationId, body.lot, body.expiryDate, body.quantity]);
    await pool.query("INSERT INTO pharmacy.movements (id, batch_id, medication_id, quantity, direction, reason, actor_id) VALUES ($1,$2,$3,$4,'receipt','Goods receipt',$5)", [randomUUID(), batchId, body.medicationId, body.quantity, actor.id]);
    return { id: batchId };
  });

  app.post("/api/yaren/inventory/adjustments", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["pharmacist"]));
    const body = parse(z.object({ batchId: z.uuid(), quantity: z.number().int(), reason: z.string().min(3), approved: z.boolean() }), request.body);
    if (!body.approved) throw new DomainError("adjustment_unapproved", "A stock adjustment needs approval before it is posted");
    const batch = await one(pool, "SELECT medication_id, quantity FROM pharmacy.batches WHERE id = $1", [body.batchId]);
    if (!batch) throw new ApplicationError(404, "batch_not_found", "Selected batch was not found");
    const next = Number(batch.quantity) + body.quantity;
    if (next < 0) throw new DomainError("stock_short", "The adjustment would take stock below zero");
    await pool.query("UPDATE pharmacy.batches SET quantity = $2 WHERE id = $1", [body.batchId, next]);
    await pool.query("INSERT INTO pharmacy.movements (id, batch_id, medication_id, quantity, direction, reason, actor_id) VALUES ($1,$2,$3,$4,'adjustment',$5,$6)", [randomUUID(), body.batchId, batch.medication_id, body.quantity, body.reason, actor.id]);
    return { id: body.batchId, quantity: next };
  });

  app.get("/api/yaren/medications/:id/movements", auth, async (request) => {
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const rows = await pool.query(
      `SELECT m.created_at, m.direction, m.quantity, m.reason, b.lot
       FROM pharmacy.movements m LEFT JOIN pharmacy.batches b ON b.id = m.batch_id
       WHERE m.medication_id = $1 ORDER BY m.created_at DESC`,
      [id],
    );
    return rows.rows;
  });

  app.post("/api/yaren/medications/:id/replenish", auth, async (request) => {
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    const body = parse(z.object({ quantity: z.number().int().positive() }), request.body);
    const requestId = randomUUID();
    await pool.query("INSERT INTO pharmacy.replenishment_requests (id, medication_id, quantity, status) VALUES ($1,$2,$3,'open')", [requestId, id, body.quantity]);
    return { id: requestId, status: "open" };
  });

  app.get("/api/yaren/replenishment", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["pharmacist", "operations_manager", "center_manager"]));
    const rows = await pool.query(`
      SELECT r.id, r.quantity, r.status, r.created_at, m.name
      FROM pharmacy.replenishment_requests r
      JOIN pharmacy.medications m ON m.id = r.medication_id
      ORDER BY r.created_at DESC`);
    return rows.rows;
  });

  app.get("/api/yaren/backups", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role !== "system_admin") throw new ApplicationError(403, "forbidden", "Only a system admin can take a backup");
    const rows = await pool.query(`
      SELECT b.id, b.created_at, u.display_name
      FROM identity.backups b
      LEFT JOIN identity.users u ON u.id = b.created_by
      ORDER BY b.created_at DESC
      LIMIT 20`);
    return rows.rows;
  });

  app.post("/api/yaren/admin/backup", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role !== "system_admin") throw new ApplicationError(403, "forbidden", "Only a system admin can take a backup");
    const [settings, hotels, services] = await Promise.all([
      pool.query("SELECT key, value FROM identity.settings ORDER BY key"),
      pool.query("SELECT id, name, city, status FROM organization.hotels"),
      pool.query("SELECT id, code, name, category, unit_price, active FROM organization.services"),
    ]);
    const id = randomUUID();
    await pool.query("INSERT INTO identity.backups (id, created_by, payload) VALUES ($1,$2,$3::jsonb)", [id, actor.id, JSON.stringify({ settings: settings.rows, hotels: hotels.rows, services: services.rows })]);
    await audit(pool, actor, "backup.created", "backup", id);
    return { id, settings: settings.rowCount, hotels: hotels.rowCount, services: services.rowCount };
  });

  app.post("/api/yaren/admin/restore", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role !== "system_admin") throw new ApplicationError(403, "forbidden", "Only a system admin can restore a backup");
    const body = parse(z.object({ backupId: z.uuid(), confirm: z.literal("RESTORE") }), request.body);
    const backup = await one(pool, "SELECT payload FROM identity.backups WHERE id = $1", [body.backupId]);
    if (!backup) throw new ApplicationError(404, "backup_not_found", "Backup was not found");
    const payload = typeof backup.payload === "string" ? JSON.parse(backup.payload) as { settings?: { key: string; value: string }[] } : backup.payload as { settings?: { key: string; value: string }[] };
    for (const setting of payload.settings ?? []) {
      await pool.query("INSERT INTO identity.settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2", [setting.key, setting.value]);
    }
    await audit(pool, actor, "backup.restored", "backup", body.backupId);
    return { id: body.backupId, restored: payload.settings?.length ?? 0 };
  });

  app.post("/api/yaren/mfa/enroll", auth, async (request) => {
    const actor = await actorOf(request);
    const secret = createTotpSecret();
    await pool.query("UPDATE identity.users SET mfa_secret = $2 WHERE id = $1", [actor.id, secret]);
    await audit(pool, actor, "mfa.enrolled", "user", actor.id);
    return { secret, otpauth: `otpauth://totp/Yaren%20One:${actor.id}?secret=${secret}&issuer=Yaren%20One` };
  });

  app.get("/api/yaren/change-requests", auth, async () => {
    const rows = await pool.query(`
      SELECT c.id, c.title, c.scope, c.status, c.created_at, u.display_name
      FROM identity.change_requests c
      LEFT JOIN identity.users u ON u.id = c.requested_by
      ORDER BY c.created_at DESC`);
    return {
      available: ["Full general ledger", "Investor board", "Live insurer connection", "Tax e-invoicing", "Payroll rules"],
      requests: rows.rows,
    };
  });

  app.post("/api/yaren/change-requests", auth, async (request) => {
    const actor = await actorOf(request);
    const body = parse(z.object({ title: z.string().min(3), scope: z.string().min(3) }), request.body);
    const id = randomUUID();
    await pool.query("INSERT INTO identity.change_requests (id, title, scope, status, requested_by) VALUES ($1,$2,$3,'requested',$4)", [id, body.title, body.scope, actor.id]);
    return { id, status: "requested" };
  });

  app.post("/api/yaren/master/:entity/:id/retire", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["center_manager"]));
    const params = parse(z.object({ entity: z.enum(["hotel", "clinic", "service", "insurer", "medication"]), id: z.uuid() }), request.params);
    const sql = {
      hotel: "UPDATE organization.hotels SET status = 'inactive' WHERE id = $1",
      clinic: "UPDATE organization.clinics SET status = 'inactive' WHERE id = $1",
      service: "UPDATE organization.services SET active = false WHERE id = $1",
      insurer: "UPDATE organization.insurers SET active = false WHERE id = $1",
      medication: "UPDATE pharmacy.medications SET active = false WHERE id = $1",
    }[params.entity];
    const updated = await pool.query(sql, [params.id]);
    if (!updated.rowCount) throw new ApplicationError(404, "record_not_found", "Master record was not found");
    await pool.query("INSERT INTO organization.master_versions (id, entity, entity_id, snapshot, actor_id) VALUES ($1,$2,$3,$4::jsonb,$5)", [randomUUID(), params.entity, params.id, JSON.stringify({ status: "inactive" }), actor.id]);
    return { id: params.id, status: "inactive" };
  });

  app.post("/api/yaren/master/services/import", auth, async (request) => {
    const actor = await actorOf(request);
    guard(actor, new Set(["center_manager"]));
    const body = parse(z.object({ rows: z.array(z.object({ code: z.string().min(1), name: z.string().min(1), category: z.string().min(1), unitPrice: z.number().min(0) })).min(1) }), request.body);
    const results = [];
    for (const row of body.rows) {
      try {
        const id = randomUUID();
        await pool.query("INSERT INTO organization.services (id, code, name, category, unit_price) VALUES ($1,$2,$3,$4,$5)", [id, row.code, row.name, row.category, row.unitPrice]);
        results.push({ code: row.code, status: "created", id });
      } catch (error) {
        if (!isDuplicate(error)) throw error;
        results.push({ code: row.code, status: "duplicate" });
      }
    }
    await audit(pool, actor, "master.imported", "service", actor.id, { rows: results.length });
    return { results };
  });

  app.post("/api/yaren/patients/:id/consent", auth, async (request) => {
    const actor = await actorOf(request);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    await pool.query("UPDATE patient_registry.patients SET consent_recorded_at = now() WHERE id = $1", [id]);
    await audit(pool, actor, "consent.recorded", "patient", id);
    return { id, recorded: true };
  });

  app.get("/api/yaren/alerts", auth, async () => {
    const allergies = await pool.query(`
      SELECT e.id AS encounter_id, p.given_name, p.family_name, p.allergies, e.ticket_no
      FROM clinical.encounters e JOIN patient_registry.patients p ON p.id = e.patient_id
      WHERE e.status NOT IN ('closed','cancelled') AND COALESCE(p.allergies,'') <> '' AND p.allergies <> 'NKDA'`);
    const emergencies = await pool.query(`
      SELECT e.id AS encounter_id, p.given_name, p.family_name, e.ticket_no, e.status
      FROM clinical.encounters e JOIN patient_registry.patients p ON p.id = e.patient_id
      WHERE e.status = 'priority' OR e.visit_type = 'emergency'`);
    const unpaid = await pool.query(`
      SELECT i.id, i.invoice_no, i.outstanding, p.given_name, p.family_name
      FROM billing.invoices i JOIN patient_registry.patients p ON p.id = i.patient_id
      WHERE i.status IN ('issued','part_paid') AND i.outstanding > 0`);
    const vip = await pool.query(`
      SELECT e.id AS encounter_id, p.given_name, p.family_name, e.ticket_no
      FROM clinical.encounters e JOIN patient_registry.patients p ON p.id = e.patient_id
      WHERE p.vip AND e.status NOT IN ('closed','cancelled')`);
    const overdue = await pool.query(`
      SELECT request_no, guest_name, room_no, priority, request_type
      FROM coordination.service_requests
      WHERE status <> 'completed' AND (
        (priority = 'emergency' AND created_at < now() - interval '30 minutes')
        OR (priority = 'urgent' AND created_at < now() - interval '2 hours')
      )`);
    const escalations = await pool.query("SELECT id, severity, description FROM quality.incidents WHERE status <> 'closed' AND severity IN ('high','critical')");
    return { allergies: allergies.rows, emergencies: emergencies.rows, unpaid: unpaid.rows.map(moneyRow), vip: vip.rows, overdue: overdue.rows, escalations: escalations.rows };
  });

  app.get("/api/yaren/clinic-access", auth, async (request) => {
    const actor = await actorOf(request);
    const owner = actor.role === "system_admin" ? null : actor.id;
    const rows = await pool.query(
      `SELECT a.user_id, a.clinic_id, a.capabilities, c.name AS clinic_name, u.display_name
       FROM identity.clinic_access a
       JOIN organization.clinics c ON c.id = a.clinic_id
       JOIN identity.users u ON u.id = a.user_id
       WHERE $1::uuid IS NULL OR a.user_id = $1
       ORDER BY u.display_name, c.name`,
      [owner],
    );
    return { capabilities: clinicCapabilities, grants: rows.rows };
  });

  app.put("/api/yaren/clinic-access", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role !== "system_admin") throw new ApplicationError(403, "forbidden", "Only a super admin can change branch access");
    const body = parse(z.object({
      userId: z.uuid(),
      clinicId: z.uuid(),
      capabilities: z.array(z.enum(clinicCapabilities)),
    }), request.body);
    const target = await one(pool, "SELECT user_type FROM identity.users WHERE id = $1", [body.userId]);
    if (!target) throw new ApplicationError(404, "user_not_found", "User was not found");
    if (target.user_type === "super_admin") throw new ApplicationError(403, "forbidden", "A super admin keeps access to every clinic");
    if (body.capabilities.length === 0) {
      await pool.query("DELETE FROM identity.clinic_access WHERE user_id = $1 AND clinic_id = $2", [body.userId, body.clinicId]);
    } else {
      await pool.query(
        `INSERT INTO identity.clinic_access (user_id, clinic_id, capabilities) VALUES ($1,$2,$3)
         ON CONFLICT (user_id, clinic_id) DO UPDATE SET capabilities = $3`,
        [body.userId, body.clinicId, body.capabilities],
      );
    }
    await audit(pool, actor, "branch.access_updated", "user", body.userId, { clinicId: body.clinicId, capabilities: body.capabilities });
    return { userId: body.userId, clinicId: body.clinicId, capabilities: body.capabilities };
  });

  app.get("/api/yaren/permissions", auth, async () => {
    const overrides = await pool.query("SELECT role, resource, action, allowed FROM identity.permissions ORDER BY role, resource, action");
    return { builtIn: builtInAccess, overrides: overrides.rows };
  });

  app.put("/api/yaren/permissions", auth, async (request) => {
    const actor = await actorOf(request);
    if (actor.role !== "system_admin") throw new ApplicationError(403, "forbidden", "Only a system admin can change permissions");
    const body = parse(z.object({ role: z.string(), resource: z.string(), action: z.string(), allowed: z.boolean() }), request.body);
    await pool.query(
      `INSERT INTO identity.permissions (role, resource, action, allowed) VALUES ($1,$2,$3,$4)
       ON CONFLICT (role, resource, action) DO UPDATE SET allowed = $4`,
      [body.role, body.resource, body.action, body.allowed],
    );
    await audit(pool, actor, "permission.changed", "permission", `${body.role}:${body.resource}:${body.action}`);
    return body;
  });

  app.get("/api/yaren/encounters/:id/pack", auth, async (request) => {
    const actor = await actorOf(request);
    const { id } = parse(z.object({ id: z.uuid() }), request.params);
    if (actor.role === "hotel_manager") throw new ApplicationError(403, "forbidden", "Hotel users cannot open clinical documents");
    const encounter = await one(pool, `${queueSql.replace("ORDER BY e.arrival_at", "WHERE e.id = $1 ORDER BY e.arrival_at")}`, [id]);
    if (!encounter) throw new ApplicationError(404, "encounter_not_found", "Encounter was not found");
    const scope = await clinicScope(pool, actor);
    if (!seesBranch(scope, encounter.clinic_id ? String(encounter.clinic_id) : null, encounter.hotel_id ? String(encounter.hotel_id) : null)) {
      throw new ApplicationError(403, "forbidden", "This clinic is outside your branch access");
    }
    const patient = await one(pool, "SELECT p.*, h.name AS hotel_name, h.city AS hotel_city FROM patient_registry.patients p LEFT JOIN organization.hotels h ON h.id = p.hotel_id WHERE p.id = $1", [encounter.patient_id]);
    const [triage, consultation, report, invoice, coverage, referral, transfer, settings, physician] = await Promise.all([
      one(pool, "SELECT * FROM clinical.triage WHERE encounter_id = $1", [id]),
      one(pool, "SELECT c.*, u.display_name, u.license_no FROM clinical.consultations c LEFT JOIN identity.users u ON u.id = c.physician_id WHERE c.encounter_id = $1", [id]),
      one(pool, "SELECT * FROM clinical.reports WHERE encounter_id = $1", [id]),
      one(pool, "SELECT * FROM billing.invoices WHERE encounter_id = $1 ORDER BY created_at DESC LIMIT 1", [id]),
      one(pool, "SELECT * FROM billing.coverage WHERE encounter_id = $1 ORDER BY created_at DESC LIMIT 1", [id]),
      one(pool, "SELECT * FROM coordination.referrals WHERE encounter_id = $1 ORDER BY created_at DESC LIMIT 1", [id]),
      one(pool, "SELECT * FROM coordination.transfers WHERE encounter_id = $1 ORDER BY created_at DESC LIMIT 1", [id]),
      pool.query("SELECT key, value FROM identity.settings"),
      one(pool, "SELECT display_name, license_no FROM identity.users WHERE id = $1", [encounter.assigned_to]),
    ]);
    const items = await pool.query("SELECT i.* FROM clinical.prescription_items i JOIN clinical.prescriptions p ON p.id = i.prescription_id WHERE p.encounter_id = $1", [id]);
    const lines = invoice ? await pool.query("SELECT * FROM billing.invoice_lines WHERE invoice_id = $1", [invoice.id]) : { rows: [] };
    const payments = invoice ? await pool.query("SELECT p.*, u.display_name AS cashier FROM billing.payments p LEFT JOIN identity.users u ON u.id = p.collected_by WHERE p.invoice_id = $1 ORDER BY p.paid_at", [invoice.id]) : { rows: [] };
    const investigations = await pool.query("SELECT * FROM clinical.investigations WHERE encounter_id = $1", [id]);
    const amendments = await pool.query("SELECT reason, target, created_at FROM clinical.amendments WHERE encounter_id = $1 ORDER BY created_at", [id]);
    const notes = await pool.query("SELECT note, follow_up, follow_up_due, signed, created_at FROM clinical.progress_notes WHERE encounter_id = $1 ORDER BY created_at", [id]);
    const claim = await one(pool, "SELECT * FROM billing.claims WHERE encounter_id = $1 ORDER BY created_at DESC LIMIT 1", [id]);
    const submission = claim ? await one(pool, "SELECT snapshot FROM organization.master_versions WHERE entity = 'claim_submission' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1", [claim.id]) : null;
    const prescription = await one(pool, `
      SELECT p.rx_no, p.indication, p.instructions, p.follow_up, p.created_at, u.display_name AS pharmacist, d.created_at AS dispensed_at
      FROM clinical.prescriptions p
      LEFT JOIN pharmacy.dispenses d ON d.prescription_id = p.id
      LEFT JOIN identity.users u ON u.id = d.pharmacist_id
      WHERE p.encounter_id = $1
      ORDER BY p.created_at DESC LIMIT 1`, [id]);
    return {
      encounter,
      patient,
      triage,
      consultation,
      report,
      invoice: invoice ? moneyRow(invoice) : null,
      lines: lines.rows.map(moneyRow),
      payments: payments.rows.map(moneyRow),
      items: items.rows,
      investigations: investigations.rows,
      claim: claim ? { ...moneyRow(claim), channel: submission?.snapshot?.channel ?? null, submittedAt: submission?.snapshot?.submittedAt ?? null, submissionVersion: submission?.snapshot?.version ?? null } : null,
      coverage,
      referral,
      transfer,
      physician,
      amendments: amendments.rows,
      notes: notes.rows,
      prescription: prescription ?? null,
      prescriptionSignedAt: prescription?.created_at ?? null,
      settings: Object.fromEntries(settings.rows.filter((row: { key: string }) => !isSecretSetting(row.key)).map((row: { key: string; value: string }) => [row.key, row.value])),
    };
  });
}

const queueSql = `
  SELECT e.*, p.given_name, p.family_name, p.medical_record_number, p.allergies, p.phone, h.name AS hotel_name, u.display_name AS assigned_name
  FROM clinical.encounters e
  JOIN patient_registry.patients p ON p.id = e.patient_id
  LEFT JOIN organization.hotels h ON h.id = e.hotel_id
  LEFT JOIN identity.users u ON u.id = e.assigned_to
  ORDER BY e.arrival_at`;

async function openEncounter(pool: pg.Pool, actor: Actor, input: { patientId: string; hotelId: string; clinicId?: string; roomNo?: string; visitType: string }) {
  const scope = await clinicScope(pool, actor);
  if (!seesBranch(scope, input.clinicId ?? null, input.hotelId, "desk") && !seesBranch(scope, input.clinicId ?? null, input.hotelId, "clinical")) {
    throw new ApplicationError(403, "forbidden", "This clinic is outside your branch access");
  }
  const id = randomUUID();
  const ticket = await sequence(pool, "clinical.ticket_seq", "T-");
  const encounterNo = await sequence(pool, "clinical.encounter_seq", "YRN-ENC-");
  const status = input.visitType === "emergency" ? "priority" : "waiting";
  await pool.query(
    `INSERT INTO clinical.encounters (id, ticket_no, encounter_no, patient_id, hotel_id, clinic_id, room_no, visit_type, status, arrival_at, created_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), $10, now())`,
    [id, ticket, encounterNo, input.patientId, input.hotelId, input.clinicId ?? null, input.roomNo ?? null, input.visitType, status, actor.id],
  );
  return { id, ticketNo: ticket, encounterNo, status };
}

async function freezeClaim(pool: pg.Pool, actor: Actor, claimId: string, channel: string) {
  const claim = await one(pool, `
    SELECT c.claim_no, c.status, c.claim_type, i.invoice_no, i.patient_payable::float AS patient_payable, i.insurance_cover::float AS insurance_cover, i.outstanding::float AS outstanding
    FROM billing.claims c LEFT JOIN billing.invoices i ON i.id = c.invoice_id WHERE c.id = $1`, [claimId]);
  const consult = await one(pool, "SELECT diagnosis, icd10 FROM clinical.consultations WHERE encounter_id = (SELECT encounter_id FROM billing.claims WHERE id = $1)", [claimId]);
  const prior = await one(pool, "SELECT id FROM organization.master_versions WHERE entity = 'claim_submission' AND entity_id = $1 ORDER BY created_at LIMIT 1", [claimId]);
  const snapshot = {
    version: prior ? "resubmission" : "original",
    channel,
    submittedAt: new Date().toISOString(),
    claimNo: claim?.claim_no,
    claimType: claim?.claim_type,
    invoiceNo: claim?.invoice_no,
    patientPayable: claim?.patient_payable ?? 0,
    insuranceCover: claim?.insurance_cover ?? 0,
    outstanding: claim?.outstanding ?? 0,
    diagnosis: consult?.diagnosis ?? "",
    icd10: consult?.icd10 ?? "",
  };
  await pool.query("INSERT INTO organization.master_versions (id, entity, entity_id, snapshot, actor_id) VALUES ($1,'claim_submission',$2,$3::jsonb,$4)", [randomUUID(), claimId, JSON.stringify(snapshot), actor.id]);
  return snapshot;
}

async function readinessFor(pool: pg.Pool, claimId: string) {
  const claim = await one(pool, "SELECT encounter_id, invoice_id FROM billing.claims WHERE id = $1", [claimId]);
  if (!claim) throw new ApplicationError(404, "claim_not_found", "Claim was not found");
  const report = await one(pool, "SELECT status FROM clinical.reports WHERE encounter_id = $1", [claim.encounter_id]);
  const invoice = await one(pool, "SELECT status FROM billing.invoices WHERE id = $1", [claim.invoice_id]);
  const consult = await one(pool, "SELECT diagnosis, icd10 FROM clinical.consultations WHERE encounter_id = $1", [claim.encounter_id]);
  const coverage = await one(pool, "SELECT status FROM billing.coverage WHERE encounter_id = $1 OR patient_id = (SELECT patient_id FROM clinical.encounters WHERE id = $2) ORDER BY created_at DESC LIMIT 1", [claim.encounter_id, claim.encounter_id]);
  return claimReadiness({
    hasSignedReport: report?.status === "signed",
    hasIssuedInvoice: invoice?.status === "issued" || invoice?.status === "paid" || invoice?.status === "part_paid",
    hasDiagnosisCode: Boolean(consult?.diagnosis && consult?.icd10),
    coverageVerified: coverage?.status === "verified",
  });
}

async function sequence(pool: pg.Pool, seq: string, prefix: string) {
  const row = await one(pool, `SELECT nextval('${seq}')::text AS n`);
  return `${prefix}${String(row?.n ?? "1").padStart(6, "0")}`;
}

async function postJournal(pool: pg.Pool, source: string, sourceId: string, lines: { account: string; debit: number; credit: number; memo: string }[]) {
  for (const line of lines) {
    if (line.debit === 0 && line.credit === 0) continue;
    await pool.query(
      "INSERT INTO billing.journal_lines (id, source, source_id, account, debit, credit, memo) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [randomUUID(), source, sourceId, line.account, line.debit, line.credit, line.memo],
    );
  }
}

function maskDetail(detail: unknown): unknown {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return detail;
  const hidden = /password|secret|token|policy|mfa/i;
  return Object.fromEntries(Object.entries(detail as Record<string, unknown>).map(([key, value]) => [key, hidden.test(key) ? "••••" : maskDetail(value)]));
}

async function audit(pool: pg.Pool, actor: Actor, action: string, entity: string, entityId: string, detail: Record<string, unknown> = {}) {
  await pool.query("INSERT INTO identity.audit_events (id, actor_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5,$6::jsonb)", [randomUUID(), actor.id, action, entity, entityId, JSON.stringify(detail)]);
}

async function one(pool: pg.Pool, sql: string, params: unknown[] = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] as Record<string, any> | undefined;
}

function isSecretSetting(key: string) {
  return /secret|password|token/i.test(key);
}

function moneyRow(row: Record<string, any>) {
  const copy = { ...row };
  for (const key of ["unit_price", "subtotal", "discount", "tax", "insurance_cover", "patient_payable", "amount_paid", "outstanding", "open_amount", "revenue", "collected", "receivables", "gross", "net", "amount", "settlement_amount"]) {
    if (copy[key] !== undefined && copy[key] !== null) copy[key] = Number(copy[key]);
  }
  return copy;
}

function isDuplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApplicationError(400, "invalid_request", result.error.issues.map((issue) => issue.message).join(", "));
  return result.data;
}

const patientBody = z.object({
  givenName: z.string().min(1),
  familyName: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sex: z.enum(["female", "male", "other", "unknown"]),
  nationality: z.string().min(1),
  phone: z.string().min(8),
  email: z.string().optional(),
  homeAddress: z.string().optional(),
  passportNo: z.string().optional(),
  hotelId: z.uuid(),
  clinicId: z.uuid(),
  roomNo: z.string().min(1),
  city: z.string().optional(),
  arrivalDate: z.string().optional(),
  departureDate: z.string().optional(),
  tourOperator: z.string().optional(),
  insurerName: z.string().optional(),
  policyNumber: z.string().optional(),
  allergies: z.string().optional(),
  chronicConditions: z.string().optional(),
  regularMedications: z.string().optional(),
  otherAlerts: z.string().optional(),
  vip: z.boolean().optional(),
  visitType: z.enum(["walk_in", "room_visit", "emergency", "consultation", "follow_up"]),
  confirmDuplicate: z.boolean().optional(),
});

const triageBody = z.object({
  temperature: z.number().optional(),
  systolic: z.number().int().optional(),
  diastolic: z.number().int().optional(),
  pulse: z.number().int().optional(),
  respiratoryRate: z.number().int().optional(),
  spo2: z.number().int().optional(),
  painScore: z.number().int().min(0).max(10).optional(),
  chiefComplaint: z.string().min(1),
  notes: z.string().optional(),
  category: z.enum(["emergency", "urgent", "non_urgent"]),
  sendToDoctor: z.boolean().default(false),
});

const consultBody = z.object({
  chiefComplaint: z.string().min(1),
  hpi: z.string().optional(),
  pastHistory: z.string().optional(),
  allergies: z.string().optional(),
  examination: z.string().optional(),
  examSystems: z.object({
    general: z.string().optional(),
    orientation: z.string().optional(),
    chest: z.string().optional(),
    cardiac: z.string().optional(),
    abdomen: z.string().optional(),
    other: z.string().optional(),
  }).optional(),
  diagnosis: z.string().min(1),
  icd10: z.string().min(1),
  secondaryDiagnoses: z.string().optional(),
  plan: z.string().min(1),
});

const screenRegister = [
  ["SCR-FD-001", "Front desk", "/"],
  ["SCR-FD-002", "Register patient", "/register"],
  ["SCR-FD-003", "Find patient", "/search"],
  ["SCR-FD-004", "Today's queue", "/queue"],
  ["SCR-CLN-001", "Triage", "/triage"],
  ["SCR-CLN-002", "Medical record", "/record"],
  ["SCR-CLN-003", "Consultation", "/consult"],
  ["SCR-CLN-004", "Diagnosis", "/consult"],
  ["SCR-CLN-005", "Prescription", "/prescription"],
  ["SCR-CLN-006", "Investigations", "/investigations"],
  ["SCR-CLN-007", "Medical report", "/report"],
  ["SCR-CLN-008", "Progress note", "/progress"],
  ["SCR-PHM-001", "Pharmacy", "/pharmacy"],
  ["SCR-PHM-002", "Dispense", "/pharmacy"],
  ["SCR-INV-001", "Inventory", "/inventory"],
  ["SCR-INV-002", "Stock alerts", "/alerts"],
  ["SCR-BIL-001", "Invoice", "/invoices"],
  ["SCR-BIL-002", "Payment", "/payments"],
  ["SCR-INS-001", "Claims", "/claims"],
  ["SCR-INS-002", "Coverage", "/coverage"],
  ["SCR-INS-003", "New claim", "/claims"],
  ["SCR-INS-004", "Claim tracking", "/claims"],
  ["SCR-INS-005", "Claim readiness", "/claims"],
  ["SCR-REF-001", "Referral", "/referrals"],
  ["SCR-REF-002", "Ambulance", "/ambulance"],
  ["SCR-REF-003", "Transfer tracking", "/transfers"],
  ["SCR-CRM-001", "Hotel 360", "/hotels"],
  ["SCR-CRM-002", "Room request", "/requests"],
  ["SCR-CRM-003", "Hotel queue", "/requests"],
  ["SCR-CRM-004", "Partner portal", "/partner"],
  ["SCR-QLT-001", "Satisfaction", "/feedback"],
  ["SCR-QLT-002", "Incidents", "/incidents"],
  ["SCR-RPT-001", "Operations", "/operations"],
  ["SCR-RPT-002", "Monthly clinic report", "/monthly"],
  ["SCR-RPT-003", "Collections", "/finance"],
  ["SCR-MGT-001", "Management", "/management"],
  ["SCR-ADM-001", "Users", "/users"],
  ["SCR-ADM-002", "Roles", "/roles"],
  ["SCR-ADM-003", "Audit", "/audit"],
  ["SCR-ADM-004", "Settings", "/settings"],
  ["SCR-ADM-005", "Master data", "/master-data"],
];
