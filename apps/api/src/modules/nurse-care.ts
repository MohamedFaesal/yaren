import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError, procedureServiceCharges } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import { investigationPhaseSql, listVisitInvestigations } from "../investigation-helpers.js";
import { can, canList, loadAccess, workspaceClinicOptionsWhere } from "../permissions.js";
import { changed, noteActivity } from "./activity.js";
import { loadSavedEncounter } from "./encounters.js";

type Db = pg.Pool | pg.PoolClient;

const startPlanSchema = z.object({
  position: z.number().int().min(1).optional().transform((value) => value ?? 1),
});

const doctorAssessmentStatus = z.enum(["stable", "needs_review", "deteriorating"]);

const assessmentSchema = z.object({
  observation_id: z.string().uuid(),
  status: doctorAssessmentStatus,
  clinical_assessment: z.string().trim().max(1000).optional().transform((value) => value ?? ""),
  medication_orders: z.array(z.unknown()).max(40).optional().transform((value) => value ?? []),
  procedure_orders: z.array(z.unknown()).max(40).optional().transform((value) => value ?? []),
});

const completeMonitoringSchema = z.object({
  doctor_assessment: doctorAssessmentStatus.nullable().optional().transform((value) => value ?? null),
  clinical_assessment: z.string().trim().max(1000).optional().transform((value) => value ?? ""),
});

const doctorNoteSchema = z.object({
  doctor_assessment: doctorAssessmentStatus,
  clinical_assessment: z.string().trim().max(1000).optional().transform((value) => value ?? ""),
});

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
             AND v.status IN ('waiting_for_investigation', 'under_nursing_care')
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
      `v.status IN ('waiting_for_investigation', 'under_nursing_care')`,
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
    const where = clauses.join(" AND ");
    const result = await pool.query(
      `SELECT * FROM (
         SELECT v.id AS visit_id, v.patient_id, v.clinic_id, v.hotel_room_no, v.status,
                e.nursing_status AS nursing_plan_status, v.monitoring_status, v.status_changed_at,
                c.name AS clinic_name, h.name AS hotel_name,
                p.name AS patient_name, p.mrn AS patient_mrn, p.gender AS patient_gender, p.nationality AS patient_nationality,
                EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit,
                e.finished_at AS order_time,
                NULL::uuid AS plan_id,
                1 AS plan_position,
                COALESCE(jsonb_array_length(COALESCE(e.medication_orders, '[]'::jsonb)), 0)::int AS medication_count,
                COALESCE(jsonb_array_length(COALESCE(e.procedure_orders, '[]'::jsonb)), 0)::int AS procedure_count,
                t.triage_category
         FROM patient_visits v
         JOIN clinics c ON c.id = v.clinic_id
         JOIN hotels h ON h.id = c.hotel_id
         JOIN patients p ON p.id = v.patient_id
         JOIN patient_visit_encounters e ON e.visit_id = v.id
         LEFT JOIN patient_visit_triages t ON t.visit_id = v.id
         WHERE ${where} AND e.nursing_status IN ('ordered', 'in_progress')
         UNION ALL
         SELECT v.id AS visit_id, v.patient_id, v.clinic_id, v.hotel_room_no, v.status,
                mp.status AS nursing_plan_status, v.monitoring_status, v.status_changed_at,
                c.name AS clinic_name, h.name AS hotel_name,
                p.name AS patient_name, p.mrn AS patient_mrn, p.gender AS patient_gender, p.nationality AS patient_nationality,
                EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit,
                mp.created_at AS order_time,
                mp.id AS plan_id,
                mp.position AS plan_position,
                COALESCE(jsonb_array_length(COALESCE(mp.medication_orders, '[]'::jsonb)), 0)::int AS medication_count,
                COALESCE(jsonb_array_length(COALESCE(mp.procedure_orders, '[]'::jsonb)), 0)::int AS procedure_count,
                t.triage_category
         FROM patient_visits v
         JOIN clinics c ON c.id = v.clinic_id
         JOIN hotels h ON h.id = c.hotel_id
         JOIN patients p ON p.id = v.patient_id
         JOIN patient_visit_management_plans mp ON mp.visit_id = v.id
         LEFT JOIN patient_visit_triages t ON t.visit_id = v.id
         WHERE ${where} AND mp.status IN ('ordered', 'in_progress')
       ) plans
       ORDER BY order_time DESC NULLS LAST`,
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
      `v.monitoring_status = 'in_progress'`,
      `NOT (
         (
           e.nursing_status = 'ordered'
           OR EXISTS (
             SELECT 1 FROM patient_visit_management_plans p
             WHERE p.visit_id = v.id AND p.status = 'ordered'
           )
         )
         AND e.nursing_status IS DISTINCT FROM 'in_progress'
         AND NOT EXISTS (
           SELECT 1 FROM patient_visit_management_plans p
           WHERE p.visit_id = v.id AND p.status = 'in_progress'
         )
       )`,
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
              v.monitoring_started_at, v.nursing_plan_status, v.assigned_nurse_id,
              c.name AS clinic_name, h.name AS hotel_name,
              p.name AS patient_name, p.mrn AS patient_mrn, p.gender AS patient_gender, p.nationality AS patient_nationality,
              EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit,
              e.case_priority, e.medication_orders, e.procedure_orders
       FROM patient_visits v
       JOIN clinics c ON c.id = v.clinic_id
       JOIN hotels h ON h.id = c.hotel_id
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN patient_visit_encounters e ON e.visit_id = v.id
       WHERE ${clauses.join(" AND ")}
       ORDER BY COALESCE(
         (SELECT MAX(o.updated_at) FROM patient_visit_nurse_observations o WHERE o.visit_id = v.id),
         v.updated_at
       ) DESC`,
      values,
    );
    const visitIdsForPlans = result.rows.map((row) => String((row as { visit_id: string }).visit_id));
    const extraPlans = visitIdsForPlans.length === 0
      ? []
      : (await pool.query(
        `SELECT visit_id, medication_orders, procedure_orders
         FROM patient_visit_management_plans
         WHERE visit_id = ANY($1::uuid[])
         ORDER BY position`,
        [visitIdsForPlans],
      )).rows;
    const extrasByVisit = new Map<string, { medications: unknown[]; procedures: unknown[] }>();
    for (const plan of extraPlans) {
      const visitId = String((plan as { visit_id: string }).visit_id);
      const current = extrasByVisit.get(visitId) ?? { medications: [], procedures: [] };
      if (Array.isArray((plan as { medication_orders?: unknown }).medication_orders)) {
        current.medications.push(...(plan as { medication_orders: unknown[] }).medication_orders);
      }
      if (Array.isArray((plan as { procedure_orders?: unknown }).procedure_orders)) {
        current.procedures.push(...(plan as { procedure_orders: unknown[] }).procedure_orders);
      }
      extrasByVisit.set(visitId, current);
    }
    const items = result.rows.map((row) => {
      const source = row as Record<string, unknown>;
      const extra = extrasByVisit.get(String(source.visit_id));
      return presentMonitoring({
        ...source,
        medication_orders: [
          ...(Array.isArray(source.medication_orders) ? source.medication_orders : []),
          ...(extra?.medications ?? []),
        ],
        procedure_orders: [
          ...(Array.isArray(source.procedure_orders) ? source.procedure_orders : []),
          ...(extra?.procedures ?? []),
        ],
      });
    });
    const visitIds = items.map((item) => item.visit_id);
    const observations = visitIds.length === 0
      ? []
      : (await pool.query(
        `SELECT o.id, o.visit_id, o.temperature_c, o.pulse, o.respiratory_rate, o.spo2, o.blood_pressure, o.notes,
                o.doctor_assessment, o.clinical_assessment, o.case_priority, o.recorded_by, o.recorded_at, o.sent_to_doctor_at, u.name AS recorded_by_name
         FROM patient_visit_nurse_observations o
         LEFT JOIN users u ON u.id = o.recorded_by
         WHERE o.visit_id = ANY($1::uuid[])
         ORDER BY o.updated_at DESC, o.recorded_at DESC`,
        [visitIds],
      )).rows;
    const byVisit = new Map<string, ReturnType<typeof presentObservation>[]>();
    for (const row of observations) {
      const visitId = String((row as { visit_id: string }).visit_id);
      const list = byVisit.get(visitId) ?? [];
      list.push(presentObservation(row as Record<string, unknown>));
      byVisit.set(visitId, list);
    }
    return {
      items: items.map((item) => ({ ...item, observations: byVisit.get(item.visit_id) ?? [] })),
    };
  });

  app.get("/api/nurse/monitoring/history", { preHandler: authenticate }, async (request) => {
    if (!canSeeMonitoringHistory(request.user)) {
      throw new ApplicationError(403, "forbidden", "You cannot view monitoring history");
    }
    const access = await loadAccess(pool, request.user);
    const query = readMonitoringHistoryQuery(request.query);
    const values: unknown[] = [];
    const clauses = [
      `v.deleted_at IS NULL`,
      `p.deleted_at IS NULL`,
      `v.monitoring_status = 'completed'`,
    ];
    const workspace = workspaceClinicOptionsWhere(access);
    if (workspace && !workspace.allClinics) {
      values.push(workspace.params[0]);
      clauses.push(`v.clinic_id = ANY($${values.length}::uuid[])`);
    }
    if (query.clinicId) {
      values.push(query.clinicId);
      clauses.push(`v.clinic_id = $${values.length}`);
    }
    const isAdmin = request.user.type === "super-admin" || request.user.type === "admin";
    if (!isAdmin && request.user.role === "Nurse") {
      values.push(request.user.sub);
      clauses.push(`v.assigned_nurse_id = $${values.length}`);
    }
    if (!isAdmin && request.user.role === "Doctor") {
      values.push(request.user.sub);
      clauses.push(`v.assigned_doctor_id = $${values.length}`);
    }
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      values.push(pattern, pattern, pattern, pattern, pattern);
      const start = values.length - 4;
      clauses.push(`(
        p.name ILIKE $${start} ESCAPE '\\'
        OR p.mrn ILIKE $${start + 1} ESCAPE '\\'
        OR c.name ILIKE $${start + 2} ESCAPE '\\'
        OR h.name ILIKE $${start + 3} ESCAPE '\\'
        OR COALESCE(v.hotel_room_no, '') ILIKE $${start + 4} ESCAPE '\\'
      )`);
    }
    const where = clauses.join(" AND ");
    const from = `
      FROM patient_visits v
      JOIN clinics c ON c.id = v.clinic_id
      JOIN hotels h ON h.id = c.hotel_id
      JOIN patients p ON p.id = v.patient_id
      LEFT JOIN patient_visit_encounters e ON e.visit_id = v.id
      LEFT JOIN users doctor ON doctor.id = v.assigned_doctor_id
      LEFT JOIN users nurse ON nurse.id = v.assigned_nurse_id
      WHERE ${where}`;
    const counted = await pool.query<{ total: number }>(`SELECT count(*)::int AS total ${from}`, values);
    const total = counted.rows[0]?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, pages);
    const result = await pool.query(
      `SELECT v.id AS visit_id, v.visit_number, v.patient_id, v.clinic_id, v.hotel_room_no, v.status, v.monitoring_status,
              v.monitoring_started_at, v.monitoring_completed_at, v.nursing_plan_status, v.assigned_nurse_id, v.assigned_doctor_id,
              ${investigationPhaseSql("v")} AS investigation_phase,
              doctor.name AS assigned_doctor_name, nurse.name AS assigned_nurse_name,
              c.name AS clinic_name, h.name AS hotel_name,
              p.name AS patient_name, p.mrn AS patient_mrn, p.gender AS patient_gender, p.nationality AS patient_nationality,
              EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit,
              e.case_priority, e.medication_orders, e.procedure_orders, e.patient_advices, e.management_plan,
              e.nursing_status, e.finished_at
       ${from}
       ORDER BY COALESCE(
         (SELECT MAX(o.updated_at) FROM patient_visit_nurse_observations o WHERE o.visit_id = v.id),
         v.updated_at
       ) DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.pageSize, (page - 1) * query.pageSize],
    );
    const visitIdsForPlans = result.rows.map((row) => String((row as { visit_id: string }).visit_id));
    const extraPlans = visitIdsForPlans.length === 0
      ? []
      : (await pool.query(
        `SELECT id, visit_id, position, medication_orders, procedure_orders, clinical_assessment, assessment_status, status, created_at
         FROM patient_visit_management_plans
         WHERE visit_id = ANY($1::uuid[])
         ORDER BY position`,
        [visitIdsForPlans],
      )).rows;
    const plansByVisit = new Map<string, ReturnType<typeof presentManagementPlan>[]>();
    const extrasByVisit = new Map<string, { medications: unknown[]; procedures: unknown[] }>();
    for (const row of result.rows) {
      const source = row as Record<string, unknown>;
      const visitId = String(source.visit_id);
      plansByVisit.set(visitId, [
        presentManagementPlan({
          medication_orders: source.medication_orders,
          procedure_orders: source.procedure_orders,
          patient_advices: source.patient_advices,
          management_plan: source.management_plan,
          status: source.nursing_status,
          created_at: source.finished_at,
        }, 1),
      ]);
    }
    for (const plan of extraPlans) {
      const visitId = String((plan as { visit_id: string }).visit_id);
      const position = Number((plan as { position: number }).position);
      const list = plansByVisit.get(visitId) ?? [];
      list.push(presentManagementPlan(plan as Record<string, unknown>, position));
      plansByVisit.set(visitId, list);
      const current = extrasByVisit.get(visitId) ?? { medications: [], procedures: [] };
      if (Array.isArray((plan as { medication_orders?: unknown }).medication_orders)) {
        current.medications.push(...(plan as { medication_orders: unknown[] }).medication_orders);
      }
      if (Array.isArray((plan as { procedure_orders?: unknown }).procedure_orders)) {
        current.procedures.push(...(plan as { procedure_orders: unknown[] }).procedure_orders);
      }
      extrasByVisit.set(visitId, current);
    }
    const items = result.rows.map((row) => {
      const source = row as Record<string, unknown>;
      const visitId = String(source.visit_id);
      const extra = extrasByVisit.get(visitId);
      return {
        ...presentMonitoring({
          ...source,
          medication_orders: [
            ...(Array.isArray(source.medication_orders) ? source.medication_orders : []),
            ...(extra?.medications ?? []),
          ],
          procedure_orders: [
            ...(Array.isArray(source.procedure_orders) ? source.procedure_orders : []),
            ...(extra?.procedures ?? []),
          ],
        }),
        plans: (plansByVisit.get(visitId) ?? []).filter(planHasOrders),
      };
    });
    const visitIds = items.map((item) => item.visit_id);
    const observations = visitIds.length === 0
      ? []
      : (await pool.query(
        `SELECT o.id, o.visit_id, o.temperature_c, o.pulse, o.respiratory_rate, o.spo2, o.blood_pressure, o.notes,
                o.doctor_assessment, o.clinical_assessment, o.case_priority, o.recorded_by, o.recorded_at, o.sent_to_doctor_at, u.name AS recorded_by_name
         FROM patient_visit_nurse_observations o
         LEFT JOIN users u ON u.id = o.recorded_by
         WHERE o.visit_id = ANY($1::uuid[])
         ORDER BY o.updated_at DESC, o.recorded_at DESC`,
        [visitIds],
      )).rows;
    const byVisit = new Map<string, ReturnType<typeof presentObservation>[]>();
    for (const row of observations) {
      const visitId = String((row as { visit_id: string }).visit_id);
      const list = byVisit.get(visitId) ?? [];
      list.push(presentObservation(row as Record<string, unknown>));
      byVisit.set(visitId, list);
    }
    return {
      items: items.map((item) => ({ ...item, observations: byVisit.get(item.visit_id) ?? [] })),
      total,
      page,
      page_size: query.pageSize,
    };
  });

  app.get("/api/patients/:patientId/visits/:visitId/care-profile", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseView(pool, request, visit);
    const [triageResult, encounter, observationsResult, extras, investigations] = await Promise.all([
      pool.query(
        `SELECT t.*, d.name AS assigned_doctor_name,
                s.name AS started_by_name, c.name AS completed_by_name
         FROM patient_visit_triages t
         LEFT JOIN users d ON d.id = t.assigned_doctor_id
         LEFT JOIN users s ON s.id = t.started_by
         LEFT JOIN users c ON c.id = t.completed_by
         WHERE t.visit_id = $1`,
        [visitId],
      ),
      loadSavedEncounter(pool, { id: visitId, status: visit.status }),
      pool.query(
        `SELECT o.id, o.temperature_c, o.pulse, o.respiratory_rate, o.spo2, o.blood_pressure, o.notes,
                o.doctor_assessment, o.clinical_assessment, o.case_priority, o.recorded_by, o.recorded_at, o.sent_to_doctor_at, u.name AS recorded_by_name
         FROM patient_visit_nurse_observations o
         LEFT JOIN users u ON u.id = o.recorded_by
         WHERE o.visit_id = $1
         ORDER BY o.updated_at DESC, o.recorded_at DESC`,
        [visitId],
      ),
      pool.query(
        `SELECT id, position, medication_orders, procedure_orders, clinical_assessment, assessment_status, status, created_at
         FROM patient_visit_management_plans
         WHERE visit_id = $1
         ORDER BY position`,
        [visitId],
      ),
      listVisitInvestigations(pool, visitId),
    ]);
    const triage = triageResult.rows[0] ?? null;
    const observations = observationsResult.rows.map((row) => presentObservation(row as Record<string, unknown>));
    const encounterPlans = encounter
      ? [
          presentManagementPlan({
            medication_orders: encounter.encounter.medication_orders,
            procedure_orders: encounter.encounter.procedure_orders,
            patient_advices: encounter.encounter.patient_advices,
            management_plan: encounter.encounter.management_plan,
            status: visit.nursing_plan_status,
            created_at: null,
          }, 1),
          ...extras.rows.map((item) => presentManagementPlan(item as Record<string, unknown>, Number((item as { position: number }).position))),
        ].filter(planHasOrders)
      : extras.rows.map((item) => presentManagementPlan(item as Record<string, unknown>, Number((item as { position: number }).position))).filter(planHasOrders);
    const hasMonitoring = visit.monitoring_status === "in_progress"
      || visit.monitoring_status === "completed"
      || observations.length > 0;
    return {
      triage,
      encounter,
      monitoring: hasMonitoring
        ? {
            monitoring_status: visit.monitoring_status,
            monitoring_started_at: visit.monitoring_started_at ? new Date(String(visit.monitoring_started_at)).toISOString() : null,
            monitoring_completed_at: visit.monitoring_completed_at ? new Date(String(visit.monitoring_completed_at)).toISOString() : null,
            observations,
            plans: encounterPlans,
          }
        : null,
      investigations,
    };
  });

  app.get("/api/patients/:patientId/visits/:visitId/nursing-plan", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseView(pool, request, visit);
    const encounter = await pool.query(
      `SELECT provisional_diagnoses, medication_orders, procedure_orders, patient_advices, management_plan, case_priority, finished_at, nursing_status
       FROM patient_visit_encounters WHERE visit_id = $1`,
      [visitId],
    );
    const row = encounter.rows[0] as Record<string, unknown> | undefined;
    const casePriority = row?.case_priority === "stable" || row?.case_priority === "urgent" || row?.case_priority === "emergency"
      ? row.case_priority
      : null;
    const extras = await pool.query(
      `SELECT id, position, medication_orders, procedure_orders, clinical_assessment, assessment_status, status, created_at
       FROM patient_visit_management_plans
       WHERE visit_id = $1
       ORDER BY position`,
      [visitId],
    );
    const plans = [
      presentManagementPlan({
        medication_orders: row?.medication_orders,
        procedure_orders: row?.procedure_orders,
        patient_advices: row?.patient_advices,
        management_plan: row?.management_plan,
        status: row?.nursing_status,
        created_at: row?.finished_at,
      }, 1),
      ...extras.rows.map((item) => presentManagementPlan(item as Record<string, unknown>, Number((item as { position: number }).position))),
    ];
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
        hotel_name: visit.hotel_name,
        clinic_id: visit.clinic_id,
        clinic_name: visit.clinic_name,
        visit_type: visit.visit_type,
        status: visit.status,
        nursing_plan_status: visit.nursing_plan_status,
        monitoring_status: visit.monitoring_status,
        investigation_phase: visit.investigation_phase,
        case_priority: casePriority,
      },
      plan: {
        provisional_diagnoses: Array.isArray(row?.provisional_diagnoses) ? row.provisional_diagnoses : [],
        medication_orders: plans[0]?.medication_orders ?? [],
        procedure_orders: plans[0]?.procedure_orders ?? [],
        patient_advices: plans[0]?.patient_advices ?? [],
        management_plan: plans[0]?.management_plan ?? "",
        finished_at: row?.finished_at ? new Date(String(row.finished_at)).toISOString() : null,
      },
      plans,
      can_end_encounter: visitCanEndEncounter(visit.status, visit.monitoring_status, visit.investigation_phase),
    };
  });

  app.post("/api/patients/:patientId/visits/:visitId/nursing-plan/start", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseUpdate(pool, request, visit);
    const body = parse(startPlanSchema, request.body ?? {});
    const started = body.position === 1
      ? await pool.query(
        `UPDATE patient_visit_encounters
         SET nursing_status = 'in_progress'
         WHERE visit_id = $1 AND nursing_status = 'ordered'`,
        [visitId],
      )
      : await pool.query(
        `UPDATE patient_visit_management_plans
         SET status = 'in_progress'
         WHERE visit_id = $1 AND position = $2 AND status = 'ordered'`,
        [visitId, body.position],
      );
    if ((started.rowCount ?? 0) < 1) {
      throw new ApplicationError(422, "invalid_status", "This management plan is not waiting to be started");
    }
    await refreshNursingPlanStatus(pool, visitId);
    noteActivity(request, {
      entity: "patient",
      entityId: visit.patient_id,
      summary: `Started management plan ${body.position} for ${visit.patient_name}`,
      changes: [changed("Nursing plan", "Ordered", "In progress")].filter((item) => item !== null),
    });
    return { ok: true, nursing_plan_status: "in_progress", position: body.position };
  });

  app.post("/api/patients/:patientId/visits/:visitId/nursing-plan/monitoring", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseUpdate(pool, request, visit);
    await pool.query(
      `UPDATE patient_visits
       SET monitoring_status = 'in_progress',
           monitoring_started_at = CASE WHEN monitoring_status = 'in_progress' THEN monitoring_started_at ELSE now() END,
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

  app.get("/api/patients/:patientId/visits/:visitId/monitoring/observations", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseView(pool, request, visit);
    const result = await pool.query(
      `SELECT o.id, o.temperature_c, o.pulse, o.respiratory_rate, o.spo2, o.blood_pressure, o.notes,
              o.doctor_assessment, o.clinical_assessment, o.case_priority, o.recorded_by, o.recorded_at, o.sent_to_doctor_at, u.name AS recorded_by_name
       FROM patient_visit_nurse_observations o
       LEFT JOIN users u ON u.id = o.recorded_by
       WHERE o.visit_id = $1
       ORDER BY o.updated_at DESC, o.recorded_at DESC`,
      [visitId],
    );
    return {
      items: result.rows.map((row) => presentObservation(row as Record<string, unknown>)),
    };
  });

  app.post("/api/patients/:patientId/visits/:visitId/monitoring", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseUpdate(pool, request, visit);
    const body = parse(observationSchema, request.body);
    if (visit.monitoring_status === "none") {
      throw new ApplicationError(422, "invalid_status", "Send this patient to monitoring first");
    }
    if (visit.monitoring_status === "completed") {
      throw new ApplicationError(422, "invalid_status", "Monitoring is already completed");
    }
    const previous = await pool.query<{ case_priority: string | null }>(
      `SELECT case_priority FROM patient_visit_encounters WHERE visit_id = $1`,
      [visitId],
    );
    const previousPriority = presentCasePriority(previous.rows[0]?.case_priority);
    const casePriority = priorityFromReading(body);
    const inserted = await pool.query(
      `INSERT INTO patient_visit_nurse_observations (
         visit_id, temperature_c, pulse, respiratory_rate, spo2, blood_pressure, notes, case_priority, recorded_by, sent_to_doctor_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       RETURNING id, temperature_c, pulse, respiratory_rate, spo2, blood_pressure, notes, case_priority, recorded_by, recorded_at, sent_to_doctor_at`,
      [
        visitId,
        body.temperature_c,
        body.pulse,
        body.respiratory_rate,
        body.spo2,
        body.blood_pressure || null,
        body.notes,
        casePriority,
        request.user.sub,
      ],
    );
    await pool.query(
      `UPDATE patient_visit_encounters
       SET case_priority = $2, updated_at = now()
       WHERE visit_id = $1`,
      [visitId, casePriority],
    );
    noteActivity(request, {
      entity: "patient",
      entityId: visit.patient_id,
      summary: `Recorded a monitoring observation for ${visit.patient_name}`,
      changes: [
        changed("Patient priority", priorityLabel(previousPriority), priorityLabel(casePriority)),
      ].filter((item) => item !== null),
    });
    return {
      ok: true,
      monitoring_status: "in_progress" as const,
      observation: presentObservation({
        ...(inserted.rows[0] as Record<string, unknown>),
        recorded_by_name: null,
      }),
    };
  });

  app.post("/api/patients/:patientId/visits/:visitId/monitoring/assessment", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseUpdate(pool, request, visit, { allowAssignedDoctor: true });
    const body = parse(assessmentSchema, request.body);
    const medicationOrders = readAssessmentOrders(body.medication_orders, "medication");
    const procedureOrders = readAssessmentOrders(body.procedure_orders, "procedure");
    if (medicationOrders.length + procedureOrders.length < 1) {
      throw new ApplicationError(422, "orders_required", "Add a medication or procedure before sending the assessment");
    }
    const observation = await pool.query(
      `SELECT id FROM patient_visit_nurse_observations WHERE id = $1 AND visit_id = $2`,
      [body.observation_id, visitId],
    );
    if (!observation.rows[0]) throw new ApplicationError(404, "not_found", "Observation was not found");
    const client = await pool.connect();
    let savedId: string | undefined;
    let position = 2;
    let attachedObservationId: string | null = null;
    try {
      await client.query("BEGIN");
      const encounter = await client.query(
        `SELECT visit_id FROM patient_visit_encounters WHERE visit_id = $1`,
        [visitId],
      );
      if (!encounter.rows[0]) {
        throw new ApplicationError(422, "no_encounter", "This visit has no encounter to update");
      }
      const latestObservation = await latestObservationId(client, visitId);
      if (!latestObservation) throw new ApplicationError(422, "no_observations", "Record at least one observation before sending the assessment");
      const saved = await client.query<{ id: string; position: number }>(
        `INSERT INTO patient_visit_management_plans (
           visit_id, position, medication_orders, procedure_orders,
           clinical_assessment, assessment_status, observation_id, created_by
         )
         VALUES (
           $1,
           (SELECT COALESCE(MAX(position), 1) + 1 FROM patient_visit_management_plans WHERE visit_id = $1),
           $2::jsonb, $3::jsonb, $4, $5, $6, $7
         )
         RETURNING id, position`,
        [
          visitId,
          JSON.stringify(medicationOrders),
          JSON.stringify(procedureOrders),
          body.clinical_assessment,
          body.status,
          latestObservation,
          request.user.sub,
        ],
      );
      const plan = saved.rows[0];
      if (!plan) throw new ApplicationError(500, "internal_error", "Unexpected server error");
      position = plan.position;
      const assessment = await client.query<{ id: string }>(
        `INSERT INTO patient_visit_monitoring_assessments (
           visit_id, observation_id, status, clinical_assessment, created_by, plan_id
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [visitId, latestObservation, body.status, body.clinical_assessment, request.user.sub, plan.id],
      );
      savedId = assessment.rows[0]?.id;
      attachedObservationId = await attachDoctorAssessment(client, visitId, body.status, body.clinical_assessment);
      await refreshNursingPlanStatus(client, visitId);
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
      summary: `Added management plan ${position} for ${visit.patient_name}`,
      changes: [changed("Nursing plan", planStatusLabel(visit.nursing_plan_status), "Ordered")].filter((item) => item !== null),
    });
    return { ok: true, id: savedId, position, observation_id: attachedObservationId };
  });

  app.post("/api/patients/:patientId/visits/:visitId/monitoring/note", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseUpdate(pool, request, visit, { allowAssignedDoctor: true });
    const body = parse(doctorNoteSchema, request.body);
    if (!body.clinical_assessment.trim()) {
      throw new ApplicationError(422, "note_required", "Enter a clinical assessment for the nurse");
    }
    const observationId = await latestObservationId(pool, visitId);
    if (!observationId) {
      throw new ApplicationError(422, "no_observations", "Record at least one observation before sending a note");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE patient_visit_nurse_observations
         SET doctor_assessment = $2,
             clinical_assessment = $3,
             updated_at = now()
         WHERE id = $1`,
        [observationId, body.doctor_assessment, body.clinical_assessment],
      );
      await client.query(
        `INSERT INTO patient_visit_monitoring_assessments (
           visit_id, observation_id, status, clinical_assessment, created_by
         ) VALUES ($1, $2, $3, $4, $5)`,
        [visitId, observationId, body.doctor_assessment, body.clinical_assessment, request.user.sub],
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
      summary: `Sent a monitoring note to the nurse for ${visit.patient_name}`,
      changes: [
        changed("Doctor assessment", null, doctorAssessmentLabel(body.doctor_assessment)),
        changed("Clinical assessment", null, body.clinical_assessment),
      ].filter((item) => item !== null),
    });
    return {
      ok: true,
      observation_id: observationId,
      doctor_assessment: body.doctor_assessment,
      clinical_assessment: body.clinical_assessment,
    };
  });

  app.post("/api/patients/:patientId/visits/:visitId/monitoring/complete", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseUpdate(pool, request, visit, { allowAssignedDoctor: true });
    if (visit.monitoring_status !== "in_progress") {
      throw new ApplicationError(422, "invalid_status", "Only in-progress monitoring can be completed");
    }
    const count = await pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM patient_visit_nurse_observations WHERE visit_id = $1`,
      [visitId],
    );
    if ((count.rows[0]?.total ?? 0) < 1) {
      throw new ApplicationError(422, "no_observations", "Record at least one observation before completing monitoring");
    }
    const assessment = parse(completeMonitoringSchema, request.body ?? {});
    const client = await pool.connect();
    let attachedObservationId: string | null = null;
    try {
      await client.query("BEGIN");
      attachedObservationId = await attachDoctorAssessment(client, visitId, assessment.doctor_assessment, assessment.clinical_assessment);
      await client.query(
        `UPDATE patient_visits
         SET monitoring_status = 'completed', monitoring_completed_at = now(), updated_at = now()
         WHERE id = $1`,
        [visitId],
      );
      await client.query(
        `UPDATE patient_visit_encounters
         SET nursing_status = 'completed'
         WHERE visit_id = $1 AND nursing_status = 'in_progress'`,
        [visitId],
      );
      await client.query(
        `UPDATE patient_visit_management_plans
         SET status = 'completed'
         WHERE visit_id = $1 AND status = 'in_progress'`,
        [visitId],
      );
      await refreshNursingPlanStatus(client, visitId);
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
      summary: `Completed monitoring for ${visit.patient_name}`,
      changes: [
        changed("Monitoring", "In progress", "Completed"),
        assessment.doctor_assessment ? changed("Doctor assessment", null, doctorAssessmentLabel(assessment.doctor_assessment)) : null,
        assessment.clinical_assessment ? changed("Clinical assessment", null, assessment.clinical_assessment) : null,
      ].filter((item) => item !== null),
    });
    const after = await findVisit(pool, patientId, visitId);
    return {
      ok: true,
      monitoring_status: "completed" as const,
      status: after.status,
      can_end_encounter: visitCanEndEncounter(after.status, after.monitoring_status, after.investigation_phase),
      observation_id: attachedObservationId,
    };
  });

  app.post("/api/patients/:patientId/visits/:visitId/monitoring/end-encounter", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertNurseUpdate(pool, request, visit, { allowAssignedDoctor: true });
    if (!visitCanEndEncounter(visit.status, visit.monitoring_status, visit.investigation_phase)) {
      throw new ApplicationError(422, "invalid_status", "This encounter cannot be ended yet");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query<{ id: string }>(
        `UPDATE patient_visits
         SET status = 'encounter_complete', status_changed_at = now(), updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL AND status IN ('under_nursing_care', 'waiting_for_investigation')
         RETURNING id`,
        [visitId],
      );
      if (!updated.rows[0]) throw new ApplicationError(422, "invalid_status", "This encounter can no longer be ended");
      await client.query(
        `INSERT INTO patient_visit_status_history (visit_id, from_status, to_status, changed_by, note)
         VALUES ($1, $2, 'encounter_complete', $3, 'Encounter Complete')`,
        [visitId, visit.status, request.user.sub],
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
      summary: `Completed the encounter for ${visit.patient_name}`,
      changes: [changed("Status", careStatusLabel(visit.status), "Encounter Complete")].filter((item) => item !== null),
    });
    return { ok: true, status: "encounter_complete" as const };
  });
}

function visitCanEndEncounter(status: string, monitoringStatus: string, phase: string | null) {
  if (status !== "under_nursing_care" && status !== "waiting_for_investigation") return false;
  if (monitoringStatus === "in_progress") return false;
  if (monitoringStatus === "completed") return true;
  return monitoringStatus === "none" && phase === "results_ready";
}

function careStatusLabel(status: string) {
  if (status === "under_nursing_care") return "Under Nursing Care";
  if (status === "waiting_for_investigation") return "Waiting for Investigation";
  if (status === "encounter_complete") return "Encounter Complete";
  return status;
}

async function refreshNursingPlanStatus(db: Db, visitId: string) {
  await db.query(
    `UPDATE patient_visits v
     SET nursing_plan_status = CASE
           WHEN EXISTS (
             SELECT 1 FROM patient_visit_encounters e
             WHERE e.visit_id = v.id AND e.nursing_status = 'ordered'
           ) OR EXISTS (
             SELECT 1 FROM patient_visit_management_plans p
             WHERE p.visit_id = v.id AND p.status = 'ordered'
           ) THEN 'ordered'
           WHEN EXISTS (
             SELECT 1 FROM patient_visit_encounters e
             WHERE e.visit_id = v.id AND e.nursing_status = 'in_progress'
           ) OR EXISTS (
             SELECT 1 FROM patient_visit_management_plans p
             WHERE p.visit_id = v.id AND p.status = 'in_progress'
           ) THEN 'in_progress'
           WHEN EXISTS (
             SELECT 1 FROM patient_visit_encounters e
             WHERE e.visit_id = v.id AND e.nursing_status = 'completed'
           ) OR EXISTS (
             SELECT 1 FROM patient_visit_management_plans p
             WHERE p.visit_id = v.id AND p.status = 'completed'
           ) THEN 'completed'
           ELSE 'none'
         END,
         updated_at = now()
     WHERE v.id = $1`,
    [visitId],
  );
}

function priorityFromReading(reading: {
  temperature_c: number | null;
  pulse: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
  blood_pressure: string;
}) {
  const pressure = reading.blood_pressure.match(/(\d+)\s*\/\s*(\d+)/);
  const systolic = pressure ? Number(pressure[1]) : null;
  const diastolic = pressure ? Number(pressure[2]) : null;
  const emergency = (reading.temperature_c != null && (reading.temperature_c >= 39 || reading.temperature_c < 35))
    || (reading.pulse != null && (reading.pulse >= 130 || reading.pulse < 50))
    || (reading.respiratory_rate != null && (reading.respiratory_rate >= 30 || reading.respiratory_rate < 10))
    || (reading.spo2 != null && reading.spo2 < 90)
    || (systolic != null && (systolic >= 180 || systolic < 90))
    || (diastolic != null && diastolic >= 110);
  if (emergency) return "emergency" as const;
  const urgent = (reading.temperature_c != null && reading.temperature_c >= 38)
    || (reading.pulse != null && reading.pulse >= 100)
    || (reading.respiratory_rate != null && reading.respiratory_rate >= 22)
    || (reading.spo2 != null && reading.spo2 < 94)
    || (systolic != null && systolic >= 140)
    || (diastolic != null && diastolic >= 90);
  if (urgent) return "urgent" as const;
  return "stable" as const;
}

function planStatusLabel(value: string) {
  if (value === "ordered") return "Ordered";
  if (value === "in_progress") return "In progress";
  if (value === "completed") return "Completed";
  return "None";
}

function readAssessmentOrders(value: unknown[], kind: "medication" | "procedure") {
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApplicationError(422, "invalid_order", "An order is incomplete");
    }
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !isUuid(row.id)) {
      throw new ApplicationError(422, "invalid_order", "An order is incomplete");
    }
    const label = kind === "medication" ? row.medication : row.name;
    if (typeof label !== "string" || !label.trim()) {
      throw new ApplicationError(422, "invalid_order", kind === "medication" ? "Enter the medication" : "Enter the procedure");
    }
    return row;
  });
}

function presentPlanStatus(value: unknown) {
  return value === "ordered" || value === "in_progress" || value === "completed" ? value : "none";
}

function presentManagementPlan(row: Record<string, unknown>, position: number) {
  const status = row.assessment_status;
  return {
    id: typeof row.id === "string" ? row.id : null,
    position,
    status: presentPlanStatus(row.status),
    medication_orders: Array.isArray(row.medication_orders) ? row.medication_orders : [],
    procedure_orders: Array.isArray(row.procedure_orders) ? row.procedure_orders : [],
    patient_advices: Array.isArray(row.patient_advices) ? row.patient_advices : [],
    management_plan: typeof row.management_plan === "string" ? row.management_plan : "",
    clinical_assessment: typeof row.clinical_assessment === "string" ? row.clinical_assessment : "",
    assessment_status: status === "stable" || status === "needs_review" || status === "deteriorating" ? status : null,
    created_at: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
  };
}

function planHasOrders(plan: ReturnType<typeof presentManagementPlan>) {
  return plan.medication_orders.length > 0
    || plan.procedure_orders.length > 0
    || plan.patient_advices.length > 0
    || plan.management_plan.trim().length > 0
    || plan.clinical_assessment.trim().length > 0;
}

function presentCasePriority(value: unknown) {
  return value === "stable" || value === "urgent" || value === "emergency" ? value : null;
}

function priorityLabel(value: "stable" | "urgent" | "emergency" | null) {
  if (value === "stable") return "Stable";
  if (value === "urgent") return "Urgent";
  if (value === "emergency") return "Emergency";
  return "—";
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
    plan_id: typeof row.plan_id === "string" ? row.plan_id : null,
    plan_position: Number(row.plan_position ?? 1),
    triage_category: typeof row.triage_category === "string" ? row.triage_category : null,
    medication_count: Number(row.medication_count ?? 0),
    procedure_count: Number(row.procedure_count ?? 0),
  };
}

function presentMonitoring(row: Record<string, unknown>) {
  const phase = row.investigation_phase;
  return {
    visit_id: String(row.visit_id),
    visit_number: typeof row.visit_number === "string" ? row.visit_number : undefined,
    patient_id: String(row.patient_id),
    clinic_id: String(row.clinic_id),
    hotel_room_no: typeof row.hotel_room_no === "string" ? row.hotel_room_no : null,
    status: String(row.status),
    monitoring_status: String(row.monitoring_status),
    investigation_phase: phase === "awaiting_collection" || phase === "collected" || phase === "at_lab" || phase === "results_ready"
      ? phase
      : null,
    monitoring_started_at: row.monitoring_started_at ? new Date(String(row.monitoring_started_at)).toISOString() : null,
    monitoring_completed_at: row.monitoring_completed_at ? new Date(String(row.monitoring_completed_at)).toISOString() : null,
    nursing_plan_status: String(row.nursing_plan_status),
    assigned_doctor_id: typeof row.assigned_doctor_id === "string" ? row.assigned_doctor_id : null,
    assigned_doctor_name: typeof row.assigned_doctor_name === "string" ? row.assigned_doctor_name : null,
    assigned_nurse_id: typeof row.assigned_nurse_id === "string" ? row.assigned_nurse_id : null,
    assigned_nurse_name: typeof row.assigned_nurse_name === "string" ? row.assigned_nurse_name : null,
    clinic_name: String(row.clinic_name),
    hotel_name: String(row.hotel_name),
    patient_name: String(row.patient_name),
    patient_mrn: String(row.patient_mrn),
    patient_gender: typeof row.patient_gender === "string" ? row.patient_gender : null,
    patient_nationality: typeof row.patient_nationality === "string" ? row.patient_nationality : null,
    patient_age_at_visit: row.patient_age_at_visit == null ? null : Number(row.patient_age_at_visit),
    case_priority: row.case_priority === "stable" || row.case_priority === "urgent" || row.case_priority === "emergency"
      ? row.case_priority
      : null,
    ordered_services: extractOrderedServices(row.medication_orders, row.procedure_orders),
  };
}

function canSeeMonitoringHistory(user: { type: string; role: string }) {
  return user.type === "super-admin" || user.type === "admin" || user.role === "Doctor" || user.role === "Nurse";
}

function readMonitoringHistoryQuery(query: unknown) {
  const source = query !== null && typeof query === "object" ? query as Record<string, unknown> : {};
  const text = (key: string) => (typeof source[key] === "string" ? source[key].trim() : "");
  const page = Number(text("page") || "1");
  const pageSize = Number(text("page_size") || "20");
  const q = text("q");
  const clinicId = text("clinic_id");
  if (!Number.isInteger(page) || page < 1) throw new ApplicationError(422, "invalid_query", "Page must be 1 or greater");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ApplicationError(422, "invalid_query", "Page size must be between 1 and 100");
  }
  if (q.length > 200) throw new ApplicationError(422, "invalid_query", "Search is too long");
  if (clinicId && !isUuid(clinicId)) throw new ApplicationError(422, "invalid_query", "Unknown clinic");
  return {
    page,
    pageSize,
    q,
    clinicId: clinicId || null,
  };
}

async function latestObservationId(db: Db, visitId: string) {
  const latest = await db.query<{ id: string }>(
    `SELECT id
     FROM patient_visit_nurse_observations
     WHERE visit_id = $1
     ORDER BY recorded_at DESC, created_at DESC
     LIMIT 1`,
    [visitId],
  );
  return latest.rows[0]?.id ?? null;
}

async function attachDoctorAssessment(
  db: Db,
  visitId: string,
  doctorAssessment: "stable" | "needs_review" | "deteriorating" | null,
  clinicalAssessment: string,
) {
  const text = clinicalAssessment.trim();
  if (!doctorAssessment && !text) return null;
  const observationId = await latestObservationId(db, visitId);
  if (!observationId) return null;
  await db.query(
    `UPDATE patient_visit_nurse_observations
     SET doctor_assessment = COALESCE($2, doctor_assessment),
         clinical_assessment = CASE WHEN $3 <> '' THEN $3 ELSE clinical_assessment END,
         updated_at = now()
     WHERE id = $1`,
    [observationId, doctorAssessment, text],
  );
  return observationId;
}

function doctorAssessmentLabel(status: "stable" | "needs_review" | "deteriorating") {
  if (status === "needs_review") return "Needs Review";
  if (status === "deteriorating") return "Deteriorating";
  return "Stable";
}

function presentDoctorAssessment(value: unknown) {
  return value === "stable" || value === "needs_review" || value === "deteriorating" ? value : null;
}

function presentObservation(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    temperature_c: row.temperature_c == null ? null : Number(row.temperature_c),
    pulse: row.pulse == null ? null : Number(row.pulse),
    respiratory_rate: row.respiratory_rate == null ? null : Number(row.respiratory_rate),
    spo2: row.spo2 == null ? null : Number(row.spo2),
    blood_pressure: typeof row.blood_pressure === "string" ? row.blood_pressure : null,
    notes: typeof row.notes === "string" ? row.notes : "",
    doctor_assessment: presentDoctorAssessment(row.doctor_assessment),
    clinical_assessment: typeof row.clinical_assessment === "string" ? row.clinical_assessment : "",
    case_priority: presentCasePriority(row.case_priority),
    recorded_by: typeof row.recorded_by === "string" ? row.recorded_by : null,
    recorded_by_name: typeof row.recorded_by_name === "string" ? row.recorded_by_name : null,
    recorded_at: row.recorded_at ? new Date(String(row.recorded_at)).toISOString() : null,
    sent_to_doctor_at: row.sent_to_doctor_at ? new Date(String(row.sent_to_doctor_at)).toISOString() : null,
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
            v.assigned_doctor_id, v.nursing_plan_status, v.monitoring_status, v.monitoring_started_at, v.monitoring_completed_at,
            ${investigationPhaseSql("v")} AS investigation_phase,
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
    assigned_doctor_id: string | null;
    nursing_plan_status: string;
    monitoring_status: string;
    monitoring_started_at: string | null;
    monitoring_completed_at: string | null;
    investigation_phase: string | null;
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
  visit: { clinic_id: string; patient_added_by: string; assigned_doctor_id?: string | null },
) {
  const access = await loadAccess(pool, request.user);
  const assignedDoctor = request.user.role === "Doctor" && visit.assigned_doctor_id === request.user.sub;
  const allowed = assignedDoctor
    || request.user.type === "super-admin"
    || request.user.type === "admin"
    || can(access, request.user.sub, {
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
  visit: { clinic_id: string; patient_added_by: string; assigned_nurse_id: string | null; assigned_doctor_id?: string | null },
  options?: { allowAssignedDoctor?: boolean },
) {
  const access = await loadAccess(pool, request.user);
  const assignedDoctor = options?.allowAssignedDoctor === true && request.user.role === "Doctor" && visit.assigned_doctor_id === request.user.sub;
  const allowed = assignedDoctor || can(access, request.user.sub, {
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
