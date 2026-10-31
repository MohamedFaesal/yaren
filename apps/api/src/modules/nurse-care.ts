import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError, procedureServiceCharges } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import { can, canList, loadAccess, workspaceClinicOptionsWhere } from "../permissions.js";
import { changed, noteActivity } from "./activity.js";

type Db = pg.Pool | pg.PoolClient;

const observationSchema = z.object({
  temperature_c: z.number().min(30).max(45).nullable().optional().transform((value) => value ?? null),
  pulse: z.number().int().min(20).max(250).nullable().optional().transform((value) => value ?? null),
  respiratory_rate: z.number().int().min(4).max(80).nullable().optional().transform((value) => value ?? null),
  spo2: z.number().int().min(50).max(100).nullable().optional().transform((value) => value ?? null),
  blood_pressure: z.string().trim().max(20).optional().transform((value) => value ?? ""),
  notes: z.string().trim().max(500).optional().transform((value) => value ?? ""),
});

export function registerNurseCare(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/nurse/dashboard-summary", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    if (!canList(access, "triage") && !canList(access, "visit")) {
      throw new ApplicationError(403, "forbidden", "You cannot view the nurse dashboard");
    }
    const clinicId = readClinicId(request.query);
    const values: unknown[] = [];
    const clauses = [`v.deleted_at IS NULL`, `p.deleted_at IS NULL`];
    const workspace = workspaceClinicOptionsWhere(access);
    if (workspace && !workspace.allClinics) {
      values.push(workspace.params[0]);
      clauses.push(`v.clinic_id = ANY($${values.length}::uuid[])`);
    }
    if (clinicId) {
      values.push(clinicId);
      clauses.push(`v.clinic_id = $${values.length}`);
    }
    const where = clauses.join(" AND ");
    const result = await pool.query<{
      waiting_for_triage: number;
      triage_in_progress: number;
      to_doctor: number;
      under_nursing_care: number;
      samples_to_collect: number;
    }>(
      `SELECT
         count(*) FILTER (
           WHERE v.status = 'waiting_for_triage'
             AND (t.started_at IS NULL OR t.id IS NULL)
         )::int AS waiting_for_triage,
         count(*) FILTER (
           WHERE v.status = 'waiting_for_triage'
             AND t.started_at IS NOT NULL
             AND t.completed_at IS NULL
         )::int AS triage_in_progress,
         count(*) FILTER (WHERE v.status = 'to_doctor')::int AS to_doctor,
         count(*) FILTER (
           WHERE v.nursing_plan_status IN ('ordered', 'in_progress')
             AND v.status IN ('waiting_for_investigation', 'diagnosed')
         )::int AS under_nursing_care,
         count(DISTINCT v.id) FILTER (
           WHERE v.status = 'waiting_for_investigation'
             AND EXISTS (
               SELECT 1 FROM patient_visit_investigations i
               WHERE i.visit_id = v.id
                 AND (
                   (i.requires_collection AND i.status IN ('ordered', 'collected'))
                   OR (NOT i.requires_collection AND i.status = 'ordered')
                 )
             )
         )::int AS samples_to_collect
       FROM patient_visits v
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN patient_visit_triages t ON t.visit_id = v.id
       WHERE ${where}`,
      values,
    );
    return result.rows[0] ?? {
      waiting_for_triage: 0,
      triage_in_progress: 0,
      to_doctor: 0,
      under_nursing_care: 0,
      samples_to_collect: 0,
    };
  });

  app.get("/api/nurse/nursing-care", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    if (!canList(access, "triage") && !canList(access, "visit")) {
      throw new ApplicationError(403, "forbidden", "You cannot view nursing care");
    }
    const clinicId = readClinicId(request.query);
    const values: unknown[] = [];
    const clauses = [
      `v.deleted_at IS NULL`,
      `p.deleted_at IS NULL`,
      `v.nursing_plan_status IN ('ordered', 'in_progress')`,
      `v.status IN ('waiting_for_investigation', 'diagnosed')`,
    ];
    const workspace = workspaceClinicOptionsWhere(access);
    if (workspace && !workspace.allClinics) {
      values.push(workspace.params[0]);
      clauses.push(`v.clinic_id = ANY($${values.length}::uuid[])`);
    }
    if (clinicId) {
      values.push(clinicId);
      clauses.push(`v.clinic_id = $${values.length}`);
    }
    const isAdmin = request.user.type === "super-admin" || request.user.type === "admin";
    if (!isAdmin && request.user.role === "Nurse") {
      values.push(request.user.sub);
      clauses.push(`v.assigned_nurse_id = $${values.length}`);
    }
    const result = await pool.query(
      `SELECT v.id AS visit_id, v.patient_id, v.clinic_id, v.hotel_room_no, v.status, v.nursing_plan_status,
              v.monitoring_status, v.status_changed_at, v.assigned_nurse_id,
              c.name AS clinic_name, h.name AS hotel_name,
              p.name AS patient_name, p.mrn AS patient_mrn, p.gender AS patient_gender, p.nationality AS patient_nationality,
              EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit,
              e.finished_at AS order_time,
              e.provisional_diagnoses, e.medication_orders, e.procedure_orders, e.patient_advices, e.management_plan,
              t.triage_category
       FROM patient_visits v
       JOIN clinics c ON c.id = v.clinic_id
       JOIN hotels h ON h.id = c.hotel_id
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN patient_visit_encounters e ON e.visit_id = v.id
       LEFT JOIN patient_visit_triages t ON t.visit_id = v.id
       WHERE ${clauses.join(" AND ")}
       ORDER BY
         CASE v.nursing_plan_status WHEN 'in_progress' THEN 0 WHEN 'ordered' THEN 1 ELSE 2 END,
         e.finished_at DESC NULLS LAST`,
      values,
    );
    return {
      items: result.rows.map((row) => presentNursingCare(row as Record<string, unknown>)),
    };
  });

  app.get("/api/nurse/monitoring", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    if (!canList(access, "triage") && !canList(access, "visit")) {
      throw new ApplicationError(403, "forbidden", "You cannot view monitoring");
    }
    const clinicId = readClinicId(request.query);
    const values: unknown[] = [];
    const clauses = [
      `v.deleted_at IS NULL`,
      `p.deleted_at IS NULL`,
      `v.monitoring_status IN ('in_progress', 'completed')`,
    ];
    const workspace = workspaceClinicOptionsWhere(access);
    if (workspace && !workspace.allClinics) {
      values.push(workspace.params[0]);
      clauses.push(`v.clinic_id = ANY($${values.length}::uuid[])`);
    }
    if (clinicId) {
      values.push(clinicId);
      clauses.push(`v.clinic_id = $${values.length}`);
    }
    const isAdmin = request.user.type === "super-admin" || request.user.type === "admin";
    if (!isAdmin && request.user.role === "Nurse") {
      values.push(request.user.sub);
      clauses.push(`v.assigned_nurse_id = $${values.length}`);
    }
    const result = await pool.query(
      `SELECT v.id AS visit_id, v.patient_id, v.clinic_id, v.hotel_room_no, v.status, v.monitoring_status,
              v.nursing_plan_status, v.assigned_nurse_id,
              c.name AS clinic_name, h.name AS hotel_name,
              p.name AS patient_name, p.mrn AS patient_mrn, p.gender AS patient_gender, p.nationality AS patient_nationality,
              EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit,
              e.medication_orders, e.procedure_orders
       FROM patient_visits v
       JOIN clinics c ON c.id = v.clinic_id
       JOIN hotels h ON h.id = c.hotel_id
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN patient_visit_encounters e ON e.visit_id = v.id
       WHERE ${clauses.join(" AND ")}
       ORDER BY
         CASE v.monitoring_status WHEN 'in_progress' THEN 0 ELSE 1 END,
         v.updated_at DESC`,
      values,
    );
    return {
      items: result.rows.map((row) => presentMonitoring(row as Record<string, unknown>)),
    };
  });

  app.get("/api/patients/:patientId/visits/:visitId/nursing-plan", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseView(pool, request, visit);
    const encounter = await pool.query(
      `SELECT provisional_diagnoses, medication_orders, procedure_orders, patient_advices, management_plan, finished_at
       FROM patient_visit_encounters WHERE visit_id = $1`,
      [visitId],
    );
    const triage = await pool.query<{ triage_category: string | null }>(
      `SELECT triage_category FROM patient_visit_triages WHERE visit_id = $1`,
      [visitId],
    );
    const row = encounter.rows[0] as Record<string, unknown> | undefined;
    return {
      visit: {
        id: visit.id,
        patient_id: visit.patient_id,
        patient_name: visit.patient_name,
        patient_mrn: visit.patient_mrn,
        patient_gender: visit.patient_gender,
        patient_nationality: visit.patient_nationality,
        patient_age_at_visit: visit.patient_age_at_visit,
        hotel_room_no: visit.hotel_room_no,
        clinic_name: visit.clinic_name,
        visit_type: visit.visit_type,
        nursing_plan_status: visit.nursing_plan_status,
        monitoring_status: visit.monitoring_status,
        triage_category: triage.rows[0]?.triage_category ?? null,
      },
      plan: {
        provisional_diagnoses: Array.isArray(row?.provisional_diagnoses) ? row.provisional_diagnoses : [],
        medication_orders: Array.isArray(row?.medication_orders) ? row.medication_orders : [],
        procedure_orders: Array.isArray(row?.procedure_orders) ? row.procedure_orders : [],
        patient_advices: Array.isArray(row?.patient_advices) ? row.patient_advices : [],
        management_plan: typeof row?.management_plan === "string" ? row.management_plan : "",
        finished_at: row?.finished_at ? new Date(String(row.finished_at)).toISOString() : null,
      },
    };
  });

  app.post("/api/patients/:patientId/visits/:visitId/nursing-plan/start", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseUpdate(pool, request, visit);
    if (visit.nursing_plan_status !== "ordered" && visit.nursing_plan_status !== "in_progress") {
      throw new ApplicationError(422, "invalid_status", "This visit has no nursing plan to start");
    }
    await pool.query(
      `UPDATE patient_visits
       SET nursing_plan_status = 'in_progress', updated_at = now()
       WHERE id = $1`,
      [visitId],
    );
    noteActivity(request, {
      entity: "patient",
      entityId: visit.patient_id,
      summary: `Started the management plan for ${visit.patient_name}`,
      changes: [changed("Nursing plan", "Ordered", "In progress")].filter((item) => item !== null),
    });
    return { ok: true, nursing_plan_status: "in_progress" };
  });

  app.post("/api/patients/:patientId/visits/:visitId/nursing-plan/monitoring", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseUpdate(pool, request, visit);
    await pool.query(
      `UPDATE patient_visits
       SET monitoring_status = 'in_progress',
           nursing_plan_status = CASE WHEN nursing_plan_status = 'ordered' THEN 'in_progress' ELSE nursing_plan_status END,
           updated_at = now()
       WHERE id = $1`,
      [visitId],
    );
    noteActivity(request, {
      entity: "patient",
      entityId: visit.patient_id,
      summary: `Sent ${visit.patient_name} to monitoring`,
      changes: [changed("Monitoring", "None", "In progress")].filter((item) => item !== null),
    });
    return { ok: true, monitoring_status: "in_progress" };
  });

  app.post("/api/patients/:patientId/visits/:visitId/monitoring", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseUpdate(pool, request, visit);
    const body = parse(observationSchema, request.body);
    if (visit.monitoring_status === "none") {
      throw new ApplicationError(422, "invalid_status", "Send this patient to monitoring first");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO patient_visit_nurse_observations (
           visit_id, temperature_c, pulse, respiratory_rate, spo2, blood_pressure, notes, recorded_by, sent_to_doctor_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          visitId,
          body.temperature_c,
          body.pulse,
          body.respiratory_rate,
          body.spo2,
          body.blood_pressure || null,
          body.notes,
          request.user.sub,
        ],
      );
      await client.query(
        `UPDATE patient_visits
         SET monitoring_status = 'completed',
             nursing_plan_status = CASE WHEN nursing_plan_status IN ('ordered', 'in_progress') THEN 'completed' ELSE nursing_plan_status END,
             updated_at = now()
         WHERE id = $1`,
        [visitId],
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
      summary: `Recorded monitoring and sent ${visit.patient_name} to the doctor`,
      changes: [changed("Monitoring", "In progress", "Completed")].filter((item) => item !== null),
    });
    return { ok: true, monitoring_status: "completed" };
  });
}

function presentNursingCare(row: Record<string, unknown>) {
  return {
    visit_id: String(row.visit_id),
    patient_id: String(row.patient_id),
    clinic_id: String(row.clinic_id),
    hotel_room_no: typeof row.hotel_room_no === "string" ? row.hotel_room_no : null,
    status: String(row.status),
    nursing_plan_status: String(row.nursing_plan_status),
    monitoring_status: String(row.monitoring_status),
    status_changed_at: row.status_changed_at ? new Date(String(row.status_changed_at)).toISOString() : null,
    clinic_name: String(row.clinic_name),
    hotel_name: String(row.hotel_name),
    patient_name: String(row.patient_name),
    patient_mrn: String(row.patient_mrn),
    patient_gender: typeof row.patient_gender === "string" ? row.patient_gender : null,
    patient_nationality: typeof row.patient_nationality === "string" ? row.patient_nationality : null,
    patient_age_at_visit: row.patient_age_at_visit == null ? null : Number(row.patient_age_at_visit),
    order_time: row.order_time ? new Date(String(row.order_time)).toISOString() : null,
    triage_category: typeof row.triage_category === "string" ? row.triage_category : null,
    medication_count: Array.isArray(row.medication_orders) ? row.medication_orders.length : 0,
    procedure_count: Array.isArray(row.procedure_orders) ? row.procedure_orders.length : 0,
  };
}

function presentMonitoring(row: Record<string, unknown>) {
  return {
    visit_id: String(row.visit_id),
    patient_id: String(row.patient_id),
    clinic_id: String(row.clinic_id),
    hotel_room_no: typeof row.hotel_room_no === "string" ? row.hotel_room_no : null,
    status: String(row.status),
    monitoring_status: String(row.monitoring_status),
    nursing_plan_status: String(row.nursing_plan_status),
    clinic_name: String(row.clinic_name),
    hotel_name: String(row.hotel_name),
    patient_name: String(row.patient_name),
    patient_mrn: String(row.patient_mrn),
    patient_gender: typeof row.patient_gender === "string" ? row.patient_gender : null,
    patient_nationality: typeof row.patient_nationality === "string" ? row.patient_nationality : null,
    patient_age_at_visit: row.patient_age_at_visit == null ? null : Number(row.patient_age_at_visit),
    ordered_services: extractOrderedServices(row.medication_orders, row.procedure_orders),
  };
}

type OrderedService = {
  id: string;
  name: string;
  code: string;
  kind: "procedure" | "associated" | "medication_monitoring";
  detail: string | null;
  quantity: number | null;
  unit: string | null;
};

function extractOrderedServices(medicationOrdersRaw: unknown, procedureOrdersRaw: unknown): OrderedService[] {
  const medications = Array.isArray(medicationOrdersRaw) ? medicationOrdersRaw : [];
  const procedures = Array.isArray(procedureOrdersRaw) ? procedureOrdersRaw : [];
  const services: OrderedService[] = [];
  const seen = new Set<string>();

  for (const raw of procedures) {
    if (!raw || typeof raw !== "object") continue;
    const order = raw as Record<string, unknown>;
    const id = typeof order.id === "string" ? order.id : "";
    const name = typeof order.name === "string" ? order.name.trim() : "";
    if (!id || !name) continue;
    const code = typeof order.code === "string" ? order.code : "";
    const quantity = typeof order.quantity === "number" && order.quantity > 0 ? order.quantity : null;
    const unit = typeof order.unit === "string" && order.unit.trim() ? order.unit.trim() : null;
    const notes = typeof order.notes === "string" && order.notes.trim() ? order.notes.trim() : null;
    const linkedMedId = typeof order.linked_medication_order_id === "string" ? order.linked_medication_order_id : null;
    const linkedMed = linkedMedId
      ? medications.find((item) => item && typeof item === "object" && (item as { id?: string }).id === linkedMedId) as Record<string, unknown> | undefined
      : undefined;
    const linkedLabel = linkedMed && typeof linkedMed.medication === "string"
      ? [linkedMed.medication, linkedMed.strength, linkedMed.dosage_form].filter((part) => typeof part === "string" && part.trim()).join(" ")
      : null;
    const detailParts = [
      quantity != null ? formatQuantityDetail(quantity, unit) : null,
      linkedLabel ? `With ${linkedLabel}` : null,
      notes,
    ].filter(Boolean);
    pushService(services, seen, {
      id,
      name,
      code,
      kind: "procedure",
      detail: detailParts.length ? detailParts.join(" · ") : null,
      quantity,
      unit,
    });

    const details = order.details && typeof order.details === "object" ? order.details : null;
    for (const charge of procedureServiceCharges(details as never)) {
      if (!charge.name?.trim()) continue;
      if (charge.code === code || charge.name === name) continue;
      pushService(services, seen, {
        id: `${id}:${charge.service_id}`,
        name: charge.name.trim(),
        code: charge.code || "",
        kind: "associated",
        detail: [
          formatQuantityDetail(charge.quantity, null),
          `With ${name}`,
        ].filter(Boolean).join(" · "),
        quantity: charge.quantity > 0 ? charge.quantity : null,
        unit: null,
      });
    }
  }

  for (const raw of medications) {
    if (!raw || typeof raw !== "object") continue;
    const order = raw as Record<string, unknown>;
    const id = typeof order.id === "string" ? order.id : "";
    const medication = typeof order.medication === "string" ? order.medication.trim() : "";
    const monitoringValue = typeof order.monitoring_duration_value === "number" ? order.monitoring_duration_value : null;
    const monitoringUnit = typeof order.monitoring_duration_unit === "string" ? order.monitoring_duration_unit : "";
    if (!id || !medication || monitoringValue == null || monitoringValue <= 0) continue;
    const alreadyLinked = procedures.some((item) => {
      if (!item || typeof item !== "object") return false;
      const procedure = item as Record<string, unknown>;
      return procedure.linked_medication_order_id === id && isMonitoringService({
        code: typeof procedure.code === "string" ? procedure.code : "",
        name: typeof procedure.name === "string" ? procedure.name : "",
      });
    });
    if (alreadyLinked) continue;
    const label = [medication, order.strength, order.dosage_form]
      .filter((part) => typeof part === "string" && String(part).trim())
      .join(" ");
    pushService(services, seen, {
      id: `med-monitor:${id}`,
      name: "Monitoring & Observation",
      code: "YRN-MP-006",
      kind: "medication_monitoring",
      detail: [
        formatDurationDetail(monitoringValue, monitoringUnit),
        label ? `With ${label}` : null,
      ].filter(Boolean).join(" · "),
      quantity: monitoringHours(monitoringValue, monitoringUnit),
      unit: "hours",
    });
  }

  return services;
}

function pushService(target: OrderedService[], seen: Set<string>, service: OrderedService) {
  const key = `${service.kind}:${service.id}:${service.code}:${service.name}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push(service);
}

function isMonitoringService(service: { code: string; name: string }) {
  return service.code === "YRN-MP-006" || /monitor/i.test(service.name);
}

function monitoringHours(value: number, unit: string) {
  const hours = unit === "minutes" ? value / 60 : value;
  return Math.round(hours * 10000) / 10000;
}

function formatQuantityDetail(quantity: number, unit: string | null) {
  const rounded = Number.isInteger(quantity) ? String(quantity) : String(Math.round(quantity * 100) / 100);
  if (!unit) return `× ${rounded}`;
  return `${rounded} ${unit}`;
}

function formatDurationDetail(value: number, unit: string) {
  const label = unit === "minutes" ? (value === 1 ? "minute" : "minutes") : (value === 1 ? "hour" : "hours");
  const amount = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  return `${amount} ${label}`;
}

async function findVisit(pool: pg.Pool, patientId: string, visitId: string) {
  if (!isUuid(patientId) || !isUuid(visitId)) throw new ApplicationError(404, "not_found", "Visit was not found");
  const result = await pool.query(
    `SELECT v.id, v.patient_id, v.clinic_id, v.hotel_room_no, v.status, v.visit_type, v.assigned_nurse_id,
            v.nursing_plan_status, v.monitoring_status,
            c.name AS clinic_name, h.name AS hotel_name,
            p.name AS patient_name, p.mrn AS patient_mrn, p.gender AS patient_gender, p.nationality AS patient_nationality,
            p.added_by AS patient_added_by,
            EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit
     FROM patient_visits v
     JOIN clinics c ON c.id = v.clinic_id
     JOIN hotels h ON h.id = c.hotel_id
     JOIN patients p ON p.id = v.patient_id
     WHERE v.id = $1 AND v.patient_id = $2 AND v.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [visitId, patientId],
  );
  const row = result.rows[0] as {
    id: string;
    patient_id: string;
    clinic_id: string;
    hotel_room_no: string | null;
    status: string;
    visit_type: string;
    assigned_nurse_id: string | null;
    nursing_plan_status: string;
    monitoring_status: string;
    clinic_name: string;
    hotel_name: string;
    patient_name: string;
    patient_mrn: string;
    patient_gender: string | null;
    patient_nationality: string | null;
    patient_added_by: string;
    patient_age_at_visit: number | null;
  } | undefined;
  if (!row) throw new ApplicationError(404, "not_found", "Visit was not found");
  return row;
}

async function assertNurseView(
  pool: pg.Pool,
  request: { user: { sub: string; type: string; role: string } },
  visit: { clinic_id: string; patient_added_by: string },
) {
  const access = await loadAccess(pool, request.user);
  const allowed = can(access, request.user.sub, {
    resource: "triage",
    action: "view",
    ownerId: visit.patient_added_by,
    clinicId: visit.clinic_id,
  }) || can(access, request.user.sub, {
    resource: "visit",
    action: "view",
    ownerId: visit.patient_added_by,
    clinicId: visit.clinic_id,
  });
  if (!allowed) throw new ApplicationError(403, "forbidden", "You cannot view this nursing plan");
}

async function assertNurseUpdate(
  pool: pg.Pool,
  request: { user: { sub: string; type: string; role: string } },
  visit: { clinic_id: string; patient_added_by: string; assigned_nurse_id: string | null },
) {
  const access = await loadAccess(pool, request.user);
  const allowed = can(access, request.user.sub, {
    resource: "triage",
    action: "update",
    ownerId: visit.patient_added_by,
    clinicId: visit.clinic_id,
  }) || can(access, request.user.sub, {
    resource: "visit",
    action: "update",
    ownerId: visit.patient_added_by,
    clinicId: visit.clinic_id,
  }) || request.user.type === "super-admin" || request.user.type === "admin";
  if (!allowed) throw new ApplicationError(403, "forbidden", "You cannot update this nursing plan");
  const isAdmin = request.user.type === "super-admin" || request.user.type === "admin";
  if (!isAdmin && request.user.role === "Nurse" && visit.assigned_nurse_id && visit.assigned_nurse_id !== request.user.sub) {
    throw new ApplicationError(403, "forbidden", "This visit is assigned to another nurse");
  }
}

function readClinicId(query: unknown) {
  const source = query !== null && typeof query === "object" ? query as Record<string, unknown> : {};
  const clinicId = typeof source.clinic_id === "string" ? source.clinic_id.trim() : "";
  if (clinicId && !isUuid(clinicId)) throw new ApplicationError(422, "invalid_query", "Unknown clinic");
  return clinicId || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
