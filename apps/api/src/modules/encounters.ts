import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError, procedureDetailErrors, procedureFields, procedureFormById, quantityForProcedureForm, readServices, readStaff } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import { loadAccess, workspaceClinicOptionsWhere } from "../permissions.js";
import { fileUrl, removeUpload, saveEncounterFile } from "../uploads.js";
import { changed, noteActivity } from "./activity.js";
import { icd10Title } from "../icd10.js";

const systems = ["general", "heent", "respiratory", "cardiovascular", "abdomen", "cns", "musculoskeletal", "skin", "other"] as const;
const appearances = ["well", "ill", "toxic"] as const;
const consciousnessLevels = ["alert", "drowsy", "confused"] as const;
const nutritionLevels = ["normal", "overweight", "obese", "cachectic"] as const;
const hydrationLevels = ["adequate", "mildly_dehydrated", "dehydrated"] as const;

const optionalText = z.string().trim().max(8000).optional().transform((value) => value ?? "");
const optionalChoice = <T extends string>(values: readonly T[]) =>
  z.union([z.enum(values), z.literal(""), z.null()]).optional().transform((value) => (value ? value : ""));

const allergySchema = z.object({
  name: z.string().trim().min(1).max(120),
  reaction: z.string().trim().max(120).optional().transform((value) => (value ? value : undefined)),
});

const medicationSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

const encounterSchema = z.object({
  chief_complaint: optionalText,
  history_of_present_illness: optionalText,
  past_history: optionalText,
  medication_allergy_history: optionalText,
  temperature_c: z.number().min(10).max(60).nullable().optional().transform((value) => value ?? null),
  pulse: z.number().int().min(0).max(300).nullable().optional().transform((value) => value ?? null),
  respiratory_rate: z.number().int().min(0).max(80).nullable().optional().transform((value) => value ?? null),
  blood_pressure: z.string().trim().max(7).nullable().optional()
    .refine((value) => !value || /^\d{2,3}\/\d{2,3}$/.test(value), "Enter blood pressure as systolic/diastolic, for example 120/80")
    .transform((value) => (value ? value : null)),
  spo2: z.number().int().min(0).max(100).nullable().optional().transform((value) => value ?? null),
  pain_score: z.number().int().min(0).max(10).nullable().optional().transform((value) => value ?? null),
  vitals_recorded_at: z.string().nullable().optional()
    .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), "Enter a valid time for the vital signs")
    .transform((value) => (value ? new Date(value).toISOString() : null)),
  examination: z.object({
    general_appearance: optionalChoice(appearances),
    consciousness: optionalChoice(consciousnessLevels),
    nutrition: optionalChoice(nutritionLevels),
    hydration: optionalChoice(hydrationLevels),
    findings: z.string().trim().max(8000).optional().transform((value) => value ?? ""),
    notes: z.record(z.string(), z.string().trim().max(4000)).optional().transform((value) => {
      const notes: Partial<Record<(typeof systems)[number], string>> = {};
      for (const system of systems) {
        const text = value?.[system]?.trim();
        if (text) notes[system] = text;
      }
      return notes;
    }),
  }),
  provisional_diagnoses: z.array(z.object({
    code: z.string().trim().min(1).max(10),
    title: z.string().trim().max(500).optional().transform((value) => value ?? ""),
  })).max(20).optional().transform((value) => value ?? []),
  provisional_diagnosis: optionalText,
  investigations: z.array(z.object({
    id: z.string().uuid(),
    service_id: z.string().uuid().nullable().optional().transform((value) => value ?? null),
    name: z.string().trim().min(1).max(200),
    code: z.string().trim().max(40).optional().transform((value) => value ?? ""),
    unit: z.string().trim().max(80).optional().transform((value) => value ?? ""),
    price: z.number().min(0).nullable().optional().transform((value) => value ?? null),
    priority: z.enum(["emergency", "urgent", "normal"]).optional().transform((value) => value ?? "normal"),
  })).max(40).optional().transform((value) => value ?? []),
  management_plan: optionalText,
  allergies: z.array(allergySchema).max(40).optional().transform((value) => value ?? []),
  medications: z.array(medicationSchema).max(40).optional().transform((value) => value ?? []),
  medication_orders: z.array(z.object({
    id: z.string().uuid(),
    medication_id: z.string().uuid().nullable().optional().transform((value) => value ?? null),
    route: z.string().trim().max(80).optional().transform((value) => value ?? ""),
    medication: z.string().trim().min(1, "Enter the medication").max(160),
    strength: z.string().trim().max(80).optional().transform((value) => value ?? ""),
    dosage_form: z.string().trim().max(80).optional().transform((value) => value ?? ""),
    dose: z.string().trim().max(80).optional().transform((value) => value ?? ""),
    dose_value: z.number().positive().max(100000).nullable().optional().transform((value) => value ?? null),
    dose_unit: z.enum(["", "mg", "g", "mcg", "mL", "Ampule", "Vial", "Nebule", "Syringe"]).optional().transform((value) => value ?? ""),
    frequency: z.string().trim().max(80).optional().transform((value) => value ?? ""),
    duration: z.string().trim().max(80).optional().transform((value) => value ?? ""),
    duration_value: z.number().int().min(1).max(10000).nullable().optional().transform((value) => value ?? null),
    duration_unit: z.enum(["", "minutes", "hours", "days"]).optional().transform((value) => value ?? ""),
    flow_rate: z.string().trim().max(80).optional().transform((value) => value ?? ""),
    flow_rate_value: z.number().positive().max(100000).nullable().optional().transform((value) => value ?? null),
    flow_rate_unit: z.enum(["", "mL/hr", "drops/min", "mL/min", "mg/hr", "mcg/min"]).optional().transform((value) => value ?? ""),
    diluent_medication_id: z.string().uuid().nullable().optional().transform((value) => value ?? null),
    diluent_volume_value: z.number().positive().max(100000).nullable().optional().transform((value) => value ?? null),
    infusion_duration_value: z.number().positive().max(1000).nullable().optional().transform((value) => value ?? null),
    infusion_input: z.enum(["rate", "duration"]).optional().transform((value) => value ?? "rate"),
    monitoring_duration_value: z.number().positive().max(1000).nullable().optional().transform((value) => value ?? null),
    monitoring_duration_unit: z.enum(["", "minutes", "hours"]).optional().transform((value) => value ?? ""),
    instructions: z.string().trim().max(500).optional().transform((value) => value ?? ""),
  })).max(40).optional().transform((value) => value ?? []),
  procedure_orders: z.array(z.object({
    id: z.string().uuid(),
    procedure_id: z.string().uuid().nullable().optional().transform((value) => value ?? null),
    name: z.string().trim().min(1, "Enter the procedure").max(160),
    code: z.string().trim().max(32).optional().transform((value) => value ?? ""),
    unit: z.string().trim().max(40).optional().transform((value) => value ?? ""),
    price: z.number().min(0).nullable().optional().transform((value) => value ?? null),
    quantity: z.number().positive().max(999).optional().transform((value) => value == null ? 1 : Math.round(value * 10000) / 10000),
    notes: z.string().trim().max(500).optional().transform((value) => value ?? ""),
    linked_medication_order_id: z.string().uuid().nullable().optional().transform((value) => value ?? null),
    billing_scope: z.enum(["order", "plan"]).optional().transform((value) => value ?? "order"),
    details: z.unknown().optional().transform((value) => (
      value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
    )),
  })).max(40).optional().transform((value) => value ?? []),
  patient_advices: z.array(z.object({
    id: z.string().uuid(),
    text: z.string().trim().min(1, "Enter the advice").max(500),
  })).max(40).optional().transform((value) => value ?? []),
});

const finishSchema = encounterSchema.superRefine((value, context) => {
  if (!value.chief_complaint.trim()) {
    context.addIssue({ code: "custom", message: "Enter the chief complaint", path: ["chief_complaint"] });
  }
  if (value.temperature_c == null) {
    context.addIssue({ code: "custom", message: "Enter the temperature", path: ["temperature_c"] });
  }
  if (value.pulse == null) {
    context.addIssue({ code: "custom", message: "Enter the pulse", path: ["pulse"] });
  }
  if (value.respiratory_rate == null) {
    context.addIssue({ code: "custom", message: "Enter the respiratory rate", path: ["respiratory_rate"] });
  }
  if (!value.blood_pressure) {
    context.addIssue({ code: "custom", message: "Enter the blood pressure", path: ["blood_pressure"] });
  }
  if (value.spo2 == null) {
    context.addIssue({ code: "custom", message: "Enter the oxygen saturation", path: ["spo2"] });
  }
  if (!value.examination.findings.trim()) {
    context.addIssue({ code: "custom", message: "Enter the examination findings", path: ["examination", "findings"] });
  }
  if (value.provisional_diagnoses.length === 0) {
    context.addIssue({ code: "custom", message: "Add at least one ICD-10-CM diagnosis", path: ["provisional_diagnoses"] });
  }
});

type EncounterBody = z.infer<typeof encounterSchema>;

type CaseRow = {
  id: string;
  patient_id: string;
  status: string;
  visit_type: string;
  status_changed_at: string;
  hotel_room_no: string | null;
  clinic_id: string;
  currency: "EGP" | "EUR";
  clinic_name: string;
  hotel_name: string;
  patient_name: string;
  patient_mrn: string;
  patient_gender: "male" | "female" | null;
  patient_nationality: string | null;
  patient_age_at_visit: number | null;
  assigned_doctor_id: string;
  assigned_doctor_name: string | null;
  chief_complaint: string | null;
  temperature_c: number | string | null;
  pulse: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
  blood_pressure: string | null;
  allergies: { name: string; reaction?: string }[];
  medications: { name: string }[];
  relevant_history: string[];
  relevant_history_items: { name: string }[] | null;
  relevant_history_other: string | null;
  initial_assessment: string | null;
  triage_category: string | null;
  triage_completed_at: string | null;
  completed_by_name: string | null;
};

export function registerEncounters(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/doctor-cases/:id/encounter", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const visit = await loadCase(pool, request.user, id);
    noteActivity(request, { entity: "patient", entityId: visit.patient_id, summary: `Opened the clinical encounter for ${visit.patient_name}` });
    return presentEncounter(pool, visit);
  });

  app.put("/api/doctor-cases/:id/encounter", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const visit = await loadCase(pool, request.user, id);
    if (visit.status !== "to_doctor") throw new ApplicationError(422, "encounter_finished", "This encounter is already finished");
    const body = await applyRouteProcedures(pool, id, resolveDiagnosis(parse(encounterSchema, request.body)));
    await saveEncounter(pool, id, body, null);
    noteActivity(request, { entity: "patient", entityId: visit.patient_id, summary: `Saved the clinical encounter for ${visit.patient_name}` });
    return presentEncounter(pool, visit);
  });

  app.post("/api/doctor-cases/:id/encounter/finish", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const visit = await loadCase(pool, request.user, id);
    if (visit.status !== "to_doctor") throw new ApplicationError(422, "encounter_finished", "This encounter is already finished");
    const body = await applyRouteProcedures(pool, id, resolveDiagnosis(parse(finishSchema, request.body)));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await saveEncounter(client, id, body, request.user.sub);
      const nextStatus = body.investigations.length > 0 ? "waiting_for_investigation" : "diagnosed";
      await client.query(
        `UPDATE patient_visits
         SET status = $2, status_changed_at = now(), updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL AND status = 'to_doctor'`,
        [id, nextStatus],
      );
      await client.query(
        `INSERT INTO patient_visit_status_history (visit_id, from_status, to_status, changed_by)
         VALUES ($1, 'to_doctor', $2, $3)`,
        [id, nextStatus, request.user.sub],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    noteActivity(request, {
      entity: "patient",
      entityId: visit.patient_id,
      summary: `Finished the clinical encounter for ${visit.patient_name}`,
      changes: [changed("Status", "To see the doctor", body.investigations.length > 0 ? "Waiting for investigation" : "Diagnosed")].filter((item) => item !== null),
    });
    const finished = await loadCase(pool, request.user, id);
    return presentEncounter(pool, finished);
  });

  app.post("/api/doctor-cases/:id/encounter/files", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const visit = await loadCase(pool, request.user, id);
    if (visit.status !== "to_doctor") throw new ApplicationError(422, "encounter_finished", "This encounter is already finished");
    const count = await pool.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM patient_visit_encounter_files WHERE visit_id = $1",
      [id],
    );
    if ((count.rows[0]?.total ?? 0) >= 20) throw new ApplicationError(422, "too_many_files", "This encounter already has 20 files");
    const file = await request.file();
    if (!file) throw new ApplicationError(422, "document_required", "Choose a file to upload");
    const fileId = randomUUID();
    const saved = await saveEncounterFile(id, fileId, file);
    await pool.query(
      `INSERT INTO patient_visit_encounter_files (id, visit_id, file_path, original_name, mime_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [fileId, id, saved.path, saved.originalName, saved.mimeType],
    );
    noteActivity(request, {
      entity: "patient",
      entityId: visit.patient_id,
      summary: `Added ${saved.originalName} to the encounter for ${visit.patient_name}`,
    });
    return presentEncounter(pool, visit);
  });

  app.delete("/api/doctor-cases/:id/encounter/files/:fileId", { preHandler: authenticate }, async (request) => {
    const { id, fileId } = request.params as { id: string; fileId: string };
    const visit = await loadCase(pool, request.user, id);
    if (visit.status !== "to_doctor") throw new ApplicationError(422, "encounter_finished", "This encounter is already finished");
    if (!isUuid(fileId)) throw new ApplicationError(404, "not_found", "File was not found");
    const existing = await pool.query<{ file_path: string; original_name: string }>(
      "SELECT file_path, original_name FROM patient_visit_encounter_files WHERE id = $1 AND visit_id = $2",
      [fileId, id],
    );
    if (!existing.rows[0]) throw new ApplicationError(404, "not_found", "File was not found");
    await pool.query("DELETE FROM patient_visit_encounter_files WHERE id = $1 AND visit_id = $2", [fileId, id]);
    await removeUpload(existing.rows[0].file_path);
    noteActivity(request, {
      entity: "patient",
      entityId: visit.patient_id,
      summary: `Removed ${existing.rows[0].original_name} from the encounter for ${visit.patient_name}`,
    });
    return presentEncounter(pool, visit);
  });
}

async function loadCase(pool: pg.Pool, user: { sub: string; type: string; role: string }, id: string) {
  const seesAll = user.type === "super-admin" || user.type === "admin";
  if (!seesAll && user.role !== "Doctor") {
    throw new ApplicationError(403, "forbidden", "You cannot open this encounter");
  }
  if (!isUuid(id)) throw new ApplicationError(404, "not_found", "Case was not found");
  const found = await pool.query(
    `SELECT v.id, v.patient_id, v.status, v.visit_type, v.currency, v.status_changed_at, v.hotel_room_no, v.clinic_id, v.assigned_doctor_id,
            c.name AS clinic_name, h.name AS hotel_name,
            p.name AS patient_name, p.mrn AS patient_mrn, p.gender AS patient_gender,
            p.nationality AS patient_nationality,
            EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit,
            t.chief_complaint, t.temperature_c, t.pulse, t.respiratory_rate, t.spo2, t.blood_pressure,
            t.allergies, t.medications, t.relevant_history, t.relevant_history_items, t.relevant_history_other,
            t.initial_assessment, t.triage_category, t.completed_at AS triage_completed_at,
            d.name AS assigned_doctor_name, n.name AS completed_by_name
     FROM patient_visits v
     JOIN clinics c ON c.id = v.clinic_id
     JOIN hotels h ON h.id = c.hotel_id
     JOIN patients p ON p.id = v.patient_id
     JOIN patient_visit_triages t ON t.visit_id = v.id
     LEFT JOIN users d ON d.id = v.assigned_doctor_id
     LEFT JOIN users n ON n.id = t.completed_by
     WHERE v.id = $1
       AND v.deleted_at IS NULL
       AND p.deleted_at IS NULL
       AND v.status IN ('to_doctor', 'seen', 'waiting_for_investigation', 'diagnosed', 'pending_payment')
       AND v.assigned_doctor_id IS NOT NULL
       AND t.completed_at IS NOT NULL`,
    [id],
  );
  const row = found.rows[0] as CaseRow | undefined;
  if (!row) throw new ApplicationError(404, "not_found", "Case was not found");
  if (!seesAll && row.assigned_doctor_id !== user.sub) {
    throw new ApplicationError(403, "forbidden", "This case is assigned to another doctor");
  }
  const access = await loadAccess(pool, user);
  const workspace = workspaceClinicOptionsWhere(access);
  if (workspace && !workspace.allClinics) {
    const allowed = (workspace.params[0] as string[] | undefined) ?? [];
    if (!allowed.includes(row.clinic_id)) {
      throw new ApplicationError(403, "forbidden", "You cannot view cases for this clinic");
    }
  }
  return row;
}

function resolveDiagnosis(body: EncounterBody): EncounterBody {
  const seen = new Set<string>();
  const diagnoses: { code: string; title: string }[] = [];
  for (const item of body.provisional_diagnoses) {
    const code = item.code.toUpperCase();
    if (seen.has(code)) continue;
    const title = icd10Title(code);
    if (!title) throw new ApplicationError(422, "invalid_body", "provisional_diagnoses: Choose a valid ICD-10-CM code");
    seen.add(code);
    diagnoses.push({ code, title });
  }
  const summary = diagnoses.map((item) => `${item.code} ${item.title}`).join("\n");
  return {
    ...body,
    provisional_diagnoses: diagnoses,
    provisional_diagnosis: diagnoses.length > 0 ? summary : body.provisional_diagnosis,
  };
}

async function applyRouteProcedures<T extends EncounterBody>(db: pg.Pool | pg.PoolClient, visitId: string, body: T): Promise<T> {
  const orders = body.medication_orders.filter((order) => order.medication_id && order.route);
  const medicationIds = [...new Set(orders.map((order) => order.medication_id).filter((id): id is string => Boolean(id)))];
  const linked = new Map<string, { id: string; name: string; code: string; unit: string; price: number | null; charge_once_per_plan: boolean }[]>();
  if (medicationIds.length > 0) {
    const result = await db.query<{
      medication_id: string;
      route: string;
      id: string;
      name: string;
      code: string;
      unit: string;
      price: string | null;
      charge_once_per_plan: boolean;
    }>(
      `SELECT mr.medication_id, mr.route, s.id, s.name, s.code, s.unit, s.charge_once_per_plan,
              CASE WHEN p.nationality = 'Egyptian' THEN s.unit_price_egp ELSE s.unit_price_eur END AS price
       FROM medication_routes mr
       JOIN medication_route_services mrs ON mrs.medication_route_id = mr.id
       JOIN medical_services s ON s.id = mrs.service_id AND s.deleted_at IS NULL
         AND s.service_type = 'Procedures & Interventions Services'
       JOIN patient_visits v ON v.id = $2::uuid
       JOIN patients p ON p.id = v.patient_id
       WHERE mr.medication_id = ANY($1::uuid[])`,
      [medicationIds, visitId],
    );
    for (const row of result.rows) {
      const key = `${row.medication_id}\n${row.route}`;
      const list = linked.get(key) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        code: row.code,
        unit: row.unit,
        price: row.price == null ? null : Number(row.price),
        charge_once_per_plan: row.charge_once_per_plan,
      });
      linked.set(key, list);
    }
  }
  const manual = body.procedure_orders.filter((item) => !item.linked_medication_order_id && item.billing_scope !== "plan");
  const linkedOrders: EncounterBody["procedure_orders"] = [];
  const planServices = new Map<string, { id: string; name: string; code: string; unit: string; price: number | null }>();
  for (const order of orders) {
    const services = linked.get(`${order.medication_id}\n${order.route}`) ?? [];
    for (const service of services) {
      if (service.charge_once_per_plan) {
        planServices.set(service.id, service);
        continue;
      }
      const quantity = quantityForLinkedService(order, service);
      const previous = body.procedure_orders.find((item) => item.linked_medication_order_id === order.id && item.procedure_id === service.id);
      linkedOrders.push({
        id: previous?.id ?? randomUUID(),
        procedure_id: service.id,
        name: service.name,
        code: service.code,
        unit: service.unit,
        price: service.price,
        quantity,
        notes: previous?.notes ?? "",
        linked_medication_order_id: order.id,
        billing_scope: "order",
        details: {},
      });
    }
  }
  const planOrders: EncounterBody["procedure_orders"] = [];
  for (const service of planServices.values()) {
    if (manual.some((item) => item.procedure_id === service.id)) continue;
    const previous = body.procedure_orders.find((item) => item.billing_scope === "plan" && item.procedure_id === service.id);
    planOrders.push({
      id: previous?.id ?? randomUUID(),
      procedure_id: service.id,
      name: service.name,
      code: service.code,
      unit: service.unit,
      price: service.price,
      quantity: 1,
      notes: previous?.notes ?? "",
      linked_medication_order_id: null,
      billing_scope: "plan",
      details: {},
    });
  }
  const normalizedManual = await normalizeManualProcedures(db, visitId, manual);
  return { ...body, procedure_orders: [...normalizedManual, ...planOrders, ...linkedOrders] };
}

async function normalizeManualProcedures(
  db: pg.Pool | pg.PoolClient,
  visitId: string,
  orders: EncounterBody["procedure_orders"],
): Promise<EncounterBody["procedure_orders"]> {
  const ids = [...new Set(orders.map((item) => item.procedure_id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return orders.map((item) => ({ ...item, details: {} }));
  const catalog = await db.query<{
    id: string;
    procedure_form: string | null;
    service_type: string;
    name: string;
    code: string;
    unit_price_egp: string | null;
    unit_price_eur: string | null;
  }>(
    `SELECT id, procedure_form, service_type, name, code, unit_price_egp, unit_price_eur
     FROM medical_services
     WHERE deleted_at IS NULL AND id = ANY($1::uuid[])`,
    [ids],
  );
  const byId = new Map(catalog.rows.map((row) => [row.id, row]));
  const prepared = orders.map((item) => {
    const service = item.procedure_id ? byId.get(item.procedure_id) : undefined;
    const formId = service?.procedure_form ?? null;
    if (formId && !procedureFormById(formId)) {
      throw new ApplicationError(422, "invalid_body", `${item.name}: This procedure form is not available.`);
    }
    const form = procedureFormById(formId);
    if (!form) return { ...item, details: {} };
    const checked = procedureDetailErrors(form, item.details);
    const message = Object.values(checked.errors)[0];
    if (message) throw new ApplicationError(422, "invalid_body", `${item.name}: ${message}`);
    return { ...item, details: checked.details, quantity: quantityForProcedureForm(form, checked.details, item.quantity) };
  });
  if (!prepared.some((item) => item.procedure_id && procedureFormById(byId.get(item.procedure_id)?.procedure_form ?? null))) return prepared;

  const patient = await db.query<{ nationality: string | null }>(
    `SELECT p.nationality
     FROM patient_visits v
     JOIN patients p ON p.id = v.patient_id
     WHERE v.id = $1::uuid`,
    [visitId],
  );
  const nationality = patient.rows[0]?.nationality ?? null;
  const staffIds = new Set<string>();
  const serviceIds = new Set<string>();
  for (const item of prepared) {
    const form = procedureFormById(item.procedure_id ? byId.get(item.procedure_id)?.procedure_form ?? null : null);
    if (!form) continue;
    for (const field of procedureFields(form)) {
      if (field.kind === "staff") {
        const person = readStaff(item.details, field.id);
        if (person) staffIds.add(person.id);
      }
      if (field.kind === "associated-services") {
        for (const service of readServices(item.details, field.id)) {
          if (service.service_id === item.procedure_id) {
            throw new ApplicationError(422, "invalid_body", `${item.name}: An associated service cannot be the procedure itself.`);
          }
          serviceIds.add(service.service_id);
        }
      }
    }
  }
  const staff = staffIds.size === 0 ? [] : (await db.query<{ id: string; name: string }>(
    `SELECT id, name
     FROM users
     WHERE deleted_at IS NULL AND is_active = true AND role IN ('Doctor', 'Nurse') AND id = ANY($1::uuid[])`,
    [[...staffIds]],
  )).rows;
  const staffNames = new Map(staff.map((row) => [row.id, row.name]));
  const linkedServices = serviceIds.size === 0 ? [] : (await db.query<{
    id: string;
    name: string;
    code: string;
    service_type: string;
    unit_price_egp: string | null;
    unit_price_eur: string | null;
  }>(
    `SELECT id, name, code, service_type, unit_price_egp, unit_price_eur
     FROM medical_services
     WHERE deleted_at IS NULL AND id = ANY($1::uuid[])`,
    [[...serviceIds]],
  )).rows;
  const linkedById = new Map(linkedServices.map((row) => [row.id, row]));
  const priceOf = (row: { unit_price_egp: string | null; unit_price_eur: string | null }) => {
    const raw = nationality === "Egyptian" ? row.unit_price_egp : row.unit_price_eur;
    return raw == null ? null : Number(raw);
  };

  return prepared.map((item) => {
    const form = procedureFormById(item.procedure_id ? byId.get(item.procedure_id)?.procedure_form ?? null : null);
    if (!form) return item;
    const details = { ...item.details };
    for (const field of procedureFields(form)) {
      if (field.kind === "staff") {
        const person = readStaff(details, field.id);
        if (!person) continue;
        const name = staffNames.get(person.id);
        if (!name) throw new ApplicationError(422, "invalid_body", `${item.name}: ${field.label} must be a doctor or nurse.`);
        details[field.id] = { id: person.id, name };
      }
      if (field.kind === "associated-services") {
        details[field.id] = readServices(details, field.id).map((service) => {
          const row = linkedById.get(service.service_id);
          if (!row || row.service_type !== "Procedures & Interventions Services") {
            throw new ApplicationError(422, "invalid_body", `${item.name}: Choose a procedure or intervention.`);
          }
          return { service_id: row.id, name: row.name, code: row.code, price: priceOf(row) };
        });
      }
    }
    const note = details.notes;
    return { ...item, details, notes: typeof note === "string" ? note : item.notes };
  });
}

function quantityForLinkedService(order: {
  route: string;
  duration_value: number | null;
  duration_unit: string;
  dose_value: number | null;
  dose_unit: string;
  flow_rate_value: number | null;
  flow_rate_unit: string;
  infusion_duration_value: number | null;
  monitoring_duration_value: number | null;
  monitoring_duration_unit: string;
}, service: { code: string; name: string; unit: string }) {
  if (isMonitoringService(service)) {
    const hours = monitoringHours(order.monitoring_duration_value, order.monitoring_duration_unit);
    return hours == null ? 1 : hours;
  }
  if (isHourlyService(service)) return administrationQuantity(order);
  if (isPerProcedure(service)) return 1;
  return administrationQuantity(order);
}

function isMonitoringService(service: { code: string; name: string }) {
  return service.code === "YRN-MP-006" || /monitor/i.test(service.name);
}

function isPerProcedure(service: { unit: string }) {
  return /per procedure/i.test(service.unit);
}

function isHourlyService(service: { name: string; unit: string }) {
  return /per hour/i.test(`${service.name} ${service.unit}`);
}

function monitoringHours(value: number | null, unit: string) {
  if (value == null || value <= 0) return null;
  const hours = unit === "minutes" ? value / 60 : value;
  return Math.round(hours * 10000) / 10000;
}

function administrationQuantity(order: { route: string; duration_value: number | null; duration_unit: string; dose_value: number | null; dose_unit: string; flow_rate_value: number | null; flow_rate_unit: string }) {
  if (order.route === "IV Infusion / Drip") {
    const fromRate = infusionHours(order.dose_value, order.dose_unit, order.flow_rate_value, order.flow_rate_unit);
    if (fromRate != null) return Math.max(1, Math.ceil(fromRate));
  }
  const hourly = order.route === "IV Infusion / Drip" || order.route === "Inhalation / Nebulization";
  if (!hourly || (order.duration_unit !== "minutes" && order.duration_unit !== "hours") || order.duration_value == null || order.duration_value <= 0) return 1;
  const hours = order.duration_unit === "minutes" ? order.duration_value / 60 : order.duration_value;
  return Math.max(1, Math.ceil(hours));
}

/** Hours needed to give the dose at the stated rate. Null when the units cannot be combined. Drops use a 20-drop/mL giving set. */
function infusionHours(doseValue: number | null, doseUnit: string, flowValue: number | null, flowUnit: string) {
  if (doseValue == null || doseValue <= 0 || flowValue == null || flowValue <= 0) return null;
  const perHour = flowUnit === "mL/hr" || flowUnit === "mg/hr" ? flowValue
    : flowUnit === "mL/min" || flowUnit === "mcg/min" ? flowValue * 60
    : flowUnit === "drops/min" ? (flowValue / 20) * 60
    : null;
  if (perHour == null || perHour <= 0) return null;
  const amount = doseUnit === "mL" && (flowUnit === "mL/hr" || flowUnit === "mL/min" || flowUnit === "drops/min") ? doseValue
    : doseUnit === "mg" && flowUnit === "mg/hr" ? doseValue
    : doseUnit === "g" && flowUnit === "mg/hr" ? doseValue * 1000
    : doseUnit === "mcg" && flowUnit === "mcg/min" ? doseValue
    : doseUnit === "mg" && flowUnit === "mcg/min" ? doseValue * 1000
    : null;
  return amount == null ? null : amount / perHour;
}

async function saveEncounter(db: pg.Pool | pg.PoolClient, visitId: string, body: EncounterBody, finishedBy: string | null) {
  await db.query(
    `INSERT INTO patient_visit_encounters (
       visit_id, chief_complaint, history_of_present_illness, past_history, medication_allergy_history,
       temperature_c, pulse, respiratory_rate, blood_pressure, spo2, pain_score, vitals_recorded_at,
       examination, provisional_diagnosis, provisional_diagnosis_code, provisional_diagnoses, investigations, management_plan, allergies, medications,
       medication_orders, procedure_orders, patient_advices,
       finished_at, finished_by, updated_at
     ) VALUES (
       $1, $2, $3, $4, $24,
       $5, $6, $7, $8, $9, $10, $11,
       $12::jsonb, $13, $22, $23::jsonb, $14::jsonb, $15, $16::jsonb, $17::jsonb,
       $18::jsonb, $19::jsonb, $20::jsonb,
       CASE WHEN $21::uuid IS NULL THEN NULL ELSE now() END, $21, now()
     )
     ON CONFLICT (visit_id) DO UPDATE SET
       chief_complaint = EXCLUDED.chief_complaint,
       history_of_present_illness = EXCLUDED.history_of_present_illness,
       past_history = EXCLUDED.past_history,
       medication_allergy_history = EXCLUDED.medication_allergy_history,
       temperature_c = EXCLUDED.temperature_c,
       pulse = EXCLUDED.pulse,
       respiratory_rate = EXCLUDED.respiratory_rate,
       blood_pressure = EXCLUDED.blood_pressure,
       spo2 = EXCLUDED.spo2,
       pain_score = EXCLUDED.pain_score,
       vitals_recorded_at = EXCLUDED.vitals_recorded_at,
       examination = EXCLUDED.examination,
       provisional_diagnosis = EXCLUDED.provisional_diagnosis,
       provisional_diagnosis_code = EXCLUDED.provisional_diagnosis_code,
       provisional_diagnoses = EXCLUDED.provisional_diagnoses,
       investigations = EXCLUDED.investigations,
       management_plan = EXCLUDED.management_plan,
       allergies = EXCLUDED.allergies,
       medications = EXCLUDED.medications,
       medication_orders = EXCLUDED.medication_orders,
       procedure_orders = EXCLUDED.procedure_orders,
       patient_advices = EXCLUDED.patient_advices,
       finished_at = COALESCE(patient_visit_encounters.finished_at, EXCLUDED.finished_at),
       finished_by = COALESCE(patient_visit_encounters.finished_by, EXCLUDED.finished_by),
       updated_at = now()
     WHERE patient_visit_encounters.finished_at IS NULL`,
    [
      visitId,
      body.chief_complaint || null,
      body.history_of_present_illness || null,
      body.past_history || null,
      body.temperature_c,
      body.pulse,
      body.respiratory_rate,
      body.blood_pressure,
      body.spo2,
      body.pain_score,
      body.vitals_recorded_at,
      JSON.stringify(body.examination),
      body.provisional_diagnosis || null,
      JSON.stringify(body.investigations),
      body.management_plan || null,
      JSON.stringify(body.allergies),
      JSON.stringify(body.medications),
      JSON.stringify(body.medication_orders),
      JSON.stringify(body.procedure_orders),
      JSON.stringify(body.patient_advices),
      finishedBy,
      body.provisional_diagnoses.length === 1 ? body.provisional_diagnoses[0]?.code ?? null : null,
      JSON.stringify(body.provisional_diagnoses),
      body.medication_allergy_history || null,
    ],
  );
}

async function presentEncounter(pool: pg.Pool, visit: CaseRow) {
  const stored = await pool.query("SELECT * FROM patient_visit_encounters WHERE visit_id = $1", [visit.id]);
  const row = stored.rows[0] as Record<string, unknown> | undefined;
  const files = await pool.query<{ id: string; original_name: string; mime_type: string; file_path: string; created_at: string }>(
    `SELECT id, original_name, mime_type, file_path, created_at
     FROM patient_visit_encounter_files
     WHERE visit_id = $1
     ORDER BY created_at ASC`,
    [visit.id],
  );
  return {
    visit,
    encounter: row ? storedEncounter(row) : blankEncounter(visit),
    files: files.rows.map((file) => ({
      id: file.id,
      original_name: file.original_name,
      mime_type: file.mime_type,
      file_url: fileUrl(file.file_path),
      created_at: file.created_at,
    })),
    saved: Boolean(row),
    finished: visit.status !== "to_doctor" || Boolean(row?.finished_at),
  };
}

function storedEncounter(row: Record<string, unknown>) {
  const examination = (row.examination ?? {}) as {
    general_appearance?: string;
    consciousness?: string;
    nutrition?: string;
    hydration?: string;
    findings?: string;
    notes?: Record<string, string>;
  };
  return {
    chief_complaint: text(row.chief_complaint),
    history_of_present_illness: text(row.history_of_present_illness),
    past_history: text(row.past_history),
    medication_allergy_history: text(row.medication_allergy_history),
    temperature_c: numberOrNull(row.temperature_c),
    pulse: numberOrNull(row.pulse),
    respiratory_rate: numberOrNull(row.respiratory_rate),
    blood_pressure: text(row.blood_pressure),
    spo2: numberOrNull(row.spo2),
    pain_score: numberOrNull(row.pain_score),
    vitals_recorded_at: row.vitals_recorded_at ? new Date(String(row.vitals_recorded_at)).toISOString() : null,
    examination: {
      general_appearance: text(examination.general_appearance),
      consciousness: text(examination.consciousness),
      nutrition: text(examination.nutrition),
      hydration: text(examination.hydration),
      findings: text(examination.findings) || Object.values(examination.notes ?? {}).map((item) => item.trim()).filter(Boolean).join("\n\n"),
      notes: examination.notes ?? {},
    },
    provisional_diagnoses: presentDiagnoses(row),
    provisional_diagnosis: presentDiagnoses(row).length > 0 ? "" : text(row.provisional_diagnosis),
    investigations: Array.isArray(row.investigations) ? row.investigations.flatMap((item) => {
      const notice = presentInvestigation(item);
      return notice ? [notice] : [];
    }) : [],
    management_plan: text(row.management_plan),
    allergies: Array.isArray(row.allergies) ? row.allergies : [],
    medications: Array.isArray(row.medications) ? row.medications : [],
    medication_orders: Array.isArray(row.medication_orders) ? row.medication_orders : [],
    procedure_orders: Array.isArray(row.procedure_orders) ? row.procedure_orders : [],
    patient_advices: Array.isArray(row.patient_advices) ? row.patient_advices : [],
  };
}

function blankEncounter(_visit: CaseRow) {
  return {
    chief_complaint: "",
    history_of_present_illness: "",
    past_history: "",
    medication_allergy_history: "",
    temperature_c: null,
    pulse: null,
    respiratory_rate: null,
    blood_pressure: "",
    spo2: null,
    pain_score: null,
    vitals_recorded_at: null,
    examination: {
      general_appearance: "",
      consciousness: "",
      nutrition: "",
      hydration: "",
      findings: "",
      notes: {},
    },
    provisional_diagnoses: [],
    provisional_diagnosis: "",
    investigations: [],
    management_plan: "",
    allergies: [],
    medications: [],
    medication_orders: [],
    procedure_orders: [],
    patient_advices: [],
  };
}

function presentDiagnoses(row: Record<string, unknown>) {
  const stored = Array.isArray(row.provisional_diagnoses) ? row.provisional_diagnoses : [];
  const diagnoses = stored.flatMap((item) => {
    if (item === null || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code.trim().toUpperCase() : "";
    const title = icd10Title(code) ?? (typeof record.title === "string" ? record.title.trim() : "");
    return code && title ? [{ code, title }] : [];
  });
  if (diagnoses.length > 0) return diagnoses;
  const code = text(row.provisional_diagnosis_code).toUpperCase();
  const title = icd10Title(code);
  return code && title ? [{ code, title }] : [];
}

function presentInvestigation(value: unknown) {
  if (value === null || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string" || !row.name.trim()) return null;
  const price = row.price == null || row.price === "" ? null : Number(row.price);
  const priorities = ["emergency", "urgent", "normal"] as const;
  const priority = typeof row.priority === "string" && priorities.includes(row.priority as (typeof priorities)[number])
    ? row.priority as (typeof priorities)[number]
    : "normal";
  return {
    id: row.id,
    service_id: typeof row.service_id === "string" ? row.service_id : null,
    name: row.name,
    code: typeof row.code === "string" ? row.code : "",
    unit: typeof row.unit === "string" ? row.unit : "",
    price: price != null && Number.isFinite(price) ? price : null,
    priority,
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
