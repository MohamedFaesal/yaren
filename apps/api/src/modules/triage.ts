import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import {
  assertCan,
  assertClinicScoped,
  can,
  canList,
  loadAccess,
  viewWhere,
  workspaceClinicOptionsWhere,
} from "../permissions.js";
import { changed, noteActivity } from "./activity.js";

const visitStatuses = ["waiting_for_triage", "to_doctor"] as const;
const triageCategories = ["emergency", "urgent", "normal"] as const;
const historyKeys = [
  "hypertension",
  "copd",
  "diabetes_mellitus",
  "immunosuppression",
  "asthma",
  "hypothyroidism",
  "cardiac_disease",
  "other",
] as const;

const allergySchema = z.object({
  name: z.string().trim().min(1),
  reaction: z.string().trim().optional().transform((value) => (value ? value : undefined)),
});

const medicationSchema = z.object({
  name: z.string().trim().min(1),
});

const optionalText = z.union([z.string().trim(), z.null()]).optional().transform((value) => (value ? value : null));

const triageDraftSchema = z.object({
  chief_complaint: optionalText,
  temperature_c: z.union([z.number(), z.null()]).optional(),
  pulse: z.union([z.number().int(), z.null()]).optional(),
  respiratory_rate: z.union([z.number().int(), z.null()]).optional(),
  spo2: z.union([z.number().int(), z.null()]).optional(),
  allergies: z.array(allergySchema).optional(),
  medications: z.array(medicationSchema).optional(),
  relevant_history: z.array(z.enum(historyKeys)).optional(),
  relevant_history_other: optionalText,
  initial_assessment: optionalText,
  triage_category: z.union([z.enum(triageCategories), z.null()]).optional(),
  assigned_doctor_id: z.union([z.string().uuid(), z.null()]).optional(),
});

const triageCompleteSchema = z.object({
  chief_complaint: z.string().trim().min(1, "Enter the chief complaint"),
  temperature_c: z.number({ error: "Enter temperature" }),
  pulse: z.number().int({ error: "Enter pulse" }),
  respiratory_rate: z.number().int({ error: "Enter respiratory rate" }),
  spo2: z.number().int({ error: "Enter SpO2" }),
  allergies: z.array(allergySchema).optional(),
  medications: z.array(medicationSchema).optional(),
  relevant_history: z.array(z.enum(historyKeys)).optional(),
  relevant_history_other: optionalText,
  initial_assessment: z.string().trim().min(1, "Enter the nurse initial assessment"),
  triage_category: z.enum(triageCategories, { error: "Choose a triage category" }),
  assigned_doctor_id: z.string().uuid({ error: "Assign a doctor" }),
});

const visitQueueColumns = `v.id, v.patient_id, v.status, v.status_changed_at, v.assigned_doctor_id,
  v.hotel_room_no, v.clinic_id, c.name AS clinic_name, h.name AS hotel_name,
  p.name AS patient_name, p.mrn AS patient_mrn, p.added_by AS patient_added_by,
  v.created_at, v.updated_at,
  t.id AS triage_id, t.triage_category, t.completed_at AS triage_completed_at,
  d.name AS assigned_doctor_name`;

type Db = pg.Pool | pg.PoolClient;

export function registerTriage(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/triage/queue", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    if (!canList(access, "triage")) throw new ApplicationError(403, "forbidden", "You cannot view triage");
    const query = readQueueQuery(request.query);
    const scope = viewWhere(access, request.user.sub, "triage", { owner: "p.added_by", clinic: "v.clinic_id" });
    const values: unknown[] = [...scope.params];
    const clauses = [`v.deleted_at IS NULL`, `p.deleted_at IS NULL`, scope.sql];
    if (query.clinicId) {
      values.push(query.clinicId);
      clauses.push(`v.clinic_id = $${values.length}`);
    }
    if (query.status) {
      values.push(query.status);
      clauses.push(`v.status = $${values.length}`);
    }
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      values.push(pattern, pattern, pattern, pattern);
      const start = values.length - 3;
      clauses.push(`(
        p.name ILIKE $${start} ESCAPE '\\'
        OR p.mrn ILIKE $${start + 1} ESCAPE '\\'
        OR h.name ILIKE $${start + 2} ESCAPE '\\'
        OR COALESCE(v.hotel_room_no, '') ILIKE $${start + 3} ESCAPE '\\'
      )`);
    }
    const where = `WHERE ${clauses.join(" AND ")}`;
    const from = `
      FROM patient_visits v
      JOIN clinics c ON c.id = v.clinic_id
      JOIN hotels h ON h.id = c.hotel_id
      JOIN patients p ON p.id = v.patient_id
      LEFT JOIN patient_visit_triages t ON t.visit_id = v.id
      LEFT JOIN users d ON d.id = v.assigned_doctor_id
      ${where}`;

    const counts = await pool.query<{ status: string; count: number }>(
      `SELECT v.status, count(*)::int AS count
       FROM patient_visits v
       JOIN patients p ON p.id = v.patient_id
       WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL AND ${scope.sql}
         ${query.clinicId ? `AND v.clinic_id = $${scope.params.length + 1}` : ""}
       GROUP BY v.status`,
      query.clinicId ? [...scope.params, query.clinicId] : scope.params,
    );
    const summary = {
      waiting_for_triage: 0,
      to_doctor: 0,
    };
    for (const row of counts.rows) {
      if (row.status === "waiting_for_triage" || row.status === "to_doctor") {
        summary[row.status] = row.count;
      }
    }

    const counted = await pool.query<{ total: number }>(`SELECT count(*)::int AS total ${from}`, values);
    const total = counted.rows[0]?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, pages);
    const result = await pool.query(
      `SELECT ${visitQueueColumns}
       ${from}
       ORDER BY
         CASE v.status WHEN 'waiting_for_triage' THEN 0 ELSE 1 END,
         v.created_at ASC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.pageSize, (page - 1) * query.pageSize],
    );
    return {
      items: result.rows,
      total,
      page,
      page_size: query.pageSize,
      summary,
    };
  });

  app.get("/api/doctor-cases", { preHandler: authenticate }, async (request) => {
    const seesAll = request.user.type === "super-admin" || request.user.type === "admin";
    if (!seesAll && request.user.role !== "Doctor") {
      throw new ApplicationError(403, "forbidden", "You cannot view doctor cases");
    }
    const access = await loadAccess(pool, request.user);
    const query = readQueueQuery(request.query);
    const values: unknown[] = [];
    const clauses = [
      "v.deleted_at IS NULL",
      "p.deleted_at IS NULL",
      "v.status = 'to_doctor'",
      "v.assigned_doctor_id IS NOT NULL",
      "t.completed_at IS NOT NULL",
    ];
    if (!seesAll) {
      values.push(request.user.sub);
      clauses.push(`v.assigned_doctor_id = $${values.length}`);
    }
    const workspace = workspaceClinicOptionsWhere(access);
    if (workspace && !workspace.allClinics) {
      const allowed = (workspace.params[0] as string[] | undefined) ?? [];
      if (query.clinicId && !allowed.includes(query.clinicId)) {
        throw new ApplicationError(403, "forbidden", "You cannot view cases for this clinic");
      }
      if (!query.clinicId) {
        values.push(allowed);
        clauses.push(`v.clinic_id = ANY($${values.length}::uuid[])`);
      }
    }
    if (query.clinicId) {
      values.push(query.clinicId);
      clauses.push(`v.clinic_id = $${values.length}`);
    }
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      values.push(pattern, pattern, pattern, pattern, pattern);
      const start = values.length - 4;
      clauses.push(`(
        p.name ILIKE $${start} ESCAPE '\\'
        OR p.mrn ILIKE $${start + 1} ESCAPE '\\'
        OR h.name ILIKE $${start + 2} ESCAPE '\\'
        OR COALESCE(v.hotel_room_no, '') ILIKE $${start + 3} ESCAPE '\\'
        OR COALESCE(t.chief_complaint, '') ILIKE $${start + 4} ESCAPE '\\'
      )`);
    }
    const where = `WHERE ${clauses.join(" AND ")}`;
    const from = `
      FROM patient_visits v
      JOIN clinics c ON c.id = v.clinic_id
      JOIN hotels h ON h.id = c.hotel_id
      JOIN patients p ON p.id = v.patient_id
      JOIN patient_visit_triages t ON t.visit_id = v.id
      LEFT JOIN users d ON d.id = v.assigned_doctor_id
      ${where}`;
    const counted = await pool.query<{ total: number }>(`SELECT count(*)::int AS total ${from}`, values);
    const total = counted.rows[0]?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, pages);
    const result = await pool.query(
      `SELECT v.id, v.patient_id, v.status, v.status_changed_at, v.assigned_doctor_id,
              d.name AS assigned_doctor_name, v.hotel_room_no, v.clinic_id, c.name AS clinic_name,
              h.name AS hotel_name, p.name AS patient_name, p.mrn AS patient_mrn,
              t.triage_category, t.chief_complaint, t.completed_at AS triage_completed_at
       ${from}
       ORDER BY t.completed_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.pageSize, (page - 1) * query.pageSize],
    );
    return { items: result.rows, total, page, page_size: query.pageSize };
  });

  app.get("/api/doctor-cases/:id", { preHandler: authenticate }, async (request) => {
    const seesAll = request.user.type === "super-admin" || request.user.type === "admin";
    if (!seesAll && request.user.role !== "Doctor") {
      throw new ApplicationError(403, "forbidden", "You cannot view doctor cases");
    }
    const { id } = request.params as { id: string };
    if (!isUuid(id)) throw new ApplicationError(404, "not_found", "Case was not found");
    const found = await pool.query(
      `SELECT v.id, v.patient_id, v.status, v.status_changed_at, v.hotel_room_no, v.clinic_id, v.assigned_doctor_id,
              c.name AS clinic_name, h.name AS hotel_name,
              p.name AS patient_name, p.mrn AS patient_mrn, p.gender AS patient_gender,
              p.nationality AS patient_nationality,
              EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit,
              t.chief_complaint, t.temperature_c, t.pulse, t.respiratory_rate, t.spo2,
              t.allergies, t.medications, t.relevant_history, t.relevant_history_other,
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
         AND v.status = 'to_doctor'
         AND v.assigned_doctor_id IS NOT NULL
         AND t.completed_at IS NOT NULL`,
      [id],
    );
    const row = found.rows[0] as { assigned_doctor_id: string; clinic_id: string; patient_id: string; patient_name: string } | undefined;
    if (!row) throw new ApplicationError(404, "not_found", "Case was not found");
    if (!seesAll && row.assigned_doctor_id !== request.user.sub) {
      throw new ApplicationError(403, "forbidden", "This case is assigned to another doctor");
    }
    const access = await loadAccess(pool, request.user);
    const workspace = workspaceClinicOptionsWhere(access);
    if (workspace && !workspace.allClinics) {
      const allowed = (workspace.params[0] as string[] | undefined) ?? [];
      if (!allowed.includes(row.clinic_id)) {
        throw new ApplicationError(403, "forbidden", "You cannot view cases for this clinic");
      }
    }
    noteActivity(request, { entityId: row.patient_id, summary: `Viewed triage sent with ${row.patient_name}` });
    return row;
  });

  app.get("/api/clinics/:clinicId/doctors", { preHandler: authenticate }, async (request) => {
    const { clinicId } = request.params as { clinicId: string };
    const access = await loadAccess(pool, request.user);
    const allowed = can(access, request.user.sub, {
      resource: "triage",
      action: "view",
      ownerId: request.user.sub,
      clinicId,
    }) || can(access, request.user.sub, {
      resource: "triage",
      action: "update",
      ownerId: request.user.sub,
      clinicId,
    });
    if (!allowed) throw new ApplicationError(403, "forbidden", "You cannot view doctors for this clinic");
    const clinic = await pool.query("SELECT id FROM clinics WHERE id = $1 AND deleted_at IS NULL", [clinicId]);
    if (!clinic.rows[0]) throw new ApplicationError(404, "not_found", "Clinic was not found");
    const result = await pool.query<{ id: string; name: string }>(
      `SELECT DISTINCT u.id, u.name
       FROM users u
       WHERE ${doctorForClinicSql}
       ORDER BY u.name ASC`,
      [clinicId],
    );
    return { items: result.rows };
  });

  app.get("/api/patients/:patientId/visits/:id/triage", { preHandler: authenticate }, async (request) => {
    const { patientId, id } = request.params as { patientId: string; id: string };
    const visit = await findVisitCore(pool, patientId, id);
    if (!visit) throw new ApplicationError(404, "not_found", "Visit was not found");
    await assertCan(pool, request, {
      resource: "triage",
      action: "view",
      ownerId: visit.patient_added_by,
      clinicId: visit.clinic_id,
    });
    return {
      visit,
      triage: await findTriage(pool, id),
      history: await listStatusHistory(pool, id),
    };
  });

  app.put("/api/patients/:patientId/visits/:id/triage", { preHandler: authenticate }, async (request) => {
    const { patientId, id } = request.params as { patientId: string; id: string };
    const body = parse(triageDraftSchema, request.body);
    const visit = await findVisitCore(pool, patientId, id);
    if (!visit) throw new ApplicationError(404, "not_found", "Visit was not found");
    if (visit.status !== "waiting_for_triage") {
      throw new ApplicationError(422, "invalid_status", "Triage can only be edited while waiting for triage");
    }
    const access = await loadAccess(pool, request.user);
    await assertClinicScoped(access, request.user.sub, "triage", ["update"], visit.clinic_id, visit.patient_added_by);
    if (body.assigned_doctor_id) await assertDoctorForClinic(pool, body.assigned_doctor_id, visit.clinic_id);
    const triage = await upsertTriage(pool, id, body, request.user.sub, false);
    noteActivity(request, {
      summary: `Updated triage for ${visit.patient_name}`,
      changes: [changed("Triage", "Draft", "Saved")].filter((item) => item !== null),
    });
    return {
      visit: await findVisitCore(pool, patientId, id),
      triage,
      history: await listStatusHistory(pool, id),
    };
  });

  app.post("/api/patients/:patientId/visits/:id/triage/complete", { preHandler: authenticate }, async (request) => {
    const { patientId, id } = request.params as { patientId: string; id: string };
    const body = parse(triageCompleteSchema, request.body);
    const visit = await findVisitCore(pool, patientId, id);
    if (!visit) throw new ApplicationError(404, "not_found", "Visit was not found");
    if (visit.status !== "waiting_for_triage") {
      throw new ApplicationError(422, "invalid_status", "Only visits waiting for triage can be sent to a doctor");
    }
    const access = await loadAccess(pool, request.user);
    await assertClinicScoped(access, request.user.sub, "triage", ["update"], visit.clinic_id, visit.patient_added_by);
    await assertDoctorForClinic(pool, body.assigned_doctor_id, visit.clinic_id);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const triage = await upsertTriage(client, id, body, request.user.sub, true);
      await client.query(
        `UPDATE patient_visits
         SET status = 'to_doctor',
             status_changed_at = now(),
             assigned_doctor_id = $2,
             updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL AND status = 'waiting_for_triage'`,
        [id, body.assigned_doctor_id],
      );
      await client.query(
        `INSERT INTO patient_visit_status_history (visit_id, from_status, to_status, changed_by)
         VALUES ($1, 'waiting_for_triage', 'to_doctor', $2)`,
        [id, request.user.sub],
      );
      await client.query("COMMIT");
      noteActivity(request, {
        summary: `Sent ${visit.patient_name} to doctor after triage`,
        changes: [
          changed("Status", "Waiting for triage", "To see the doctor"),
          changed("Triage category", null, body.triage_category),
        ].filter((item) => item !== null),
      });
      return {
        visit: await findVisitCore(pool, patientId, id),
        triage,
        history: await listStatusHistory(pool, id),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}

function readQueueQuery(query: unknown) {
  const source = query !== null && typeof query === "object" ? query as Record<string, unknown> : {};
  const text = (key: string) => (typeof source[key] === "string" ? source[key].trim() : "");
  const page = Number(text("page") || "1");
  const pageSize = Number(text("page_size") || "50");
  const q = text("q");
  const clinicId = text("clinic_id");
  const status = text("status");
  if (!Number.isInteger(page) || page < 1) throw new ApplicationError(422, "invalid_query", "Page must be 1 or greater");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ApplicationError(422, "invalid_query", "Page size must be between 1 and 100");
  }
  if (q.length > 200) throw new ApplicationError(422, "invalid_query", "Search is too long");
  if (clinicId && !isUuid(clinicId)) throw new ApplicationError(422, "invalid_query", "Unknown clinic");
  if (status && !visitStatuses.includes(status as (typeof visitStatuses)[number])) {
    throw new ApplicationError(422, "invalid_query", "Unknown status");
  }
  return {
    page,
    pageSize,
    q,
    clinicId: clinicId || null,
    status: (status || null) as (typeof visitStatuses)[number] | null,
  };
}

async function findVisitCore(pool: pg.Pool, patientId: string, id: string) {
  const result = await pool.query(
    `SELECT v.id, v.patient_id, v.status, v.status_changed_at, v.assigned_doctor_id,
            v.hotel_room_no, v.clinic_id, c.name AS clinic_name, h.name AS hotel_name,
            p.name AS patient_name, p.mrn AS patient_mrn, p.added_by AS patient_added_by,
            p.gender AS patient_gender, p.birthdate::text AS patient_birthdate,
            p.nationality AS patient_nationality,
            EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit,
            d.name AS assigned_doctor_name,
            v.created_at, v.updated_at
     FROM patient_visits v
     JOIN clinics c ON c.id = v.clinic_id
     JOIN hotels h ON h.id = c.hotel_id
     JOIN patients p ON p.id = v.patient_id
     LEFT JOIN users d ON d.id = v.assigned_doctor_id
     WHERE v.id = $1 AND v.patient_id = $2 AND v.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [id, patientId],
  );
  return result.rows[0] as {
    id: string;
    patient_id: string;
    status: string;
    clinic_id: string;
    patient_added_by: string;
    patient_name: string;
  } | undefined;
}

async function findTriage(pool: Db, visitId: string) {
  const result = await pool.query(
    `SELECT t.*, d.name AS assigned_doctor_name,
            s.name AS started_by_name, c.name AS completed_by_name
     FROM patient_visit_triages t
     LEFT JOIN users d ON d.id = t.assigned_doctor_id
     LEFT JOIN users s ON s.id = t.started_by
     LEFT JOIN users c ON c.id = t.completed_by
     WHERE t.visit_id = $1`,
    [visitId],
  );
  return result.rows[0] ?? null;
}

async function listStatusHistory(pool: Db, visitId: string) {
  const result = await pool.query(
    `SELECT h.id, h.visit_id, h.from_status, h.to_status, h.changed_by, h.note, h.created_at,
            u.name AS changed_by_name
     FROM patient_visit_status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.visit_id = $1
     ORDER BY h.created_at ASC`,
    [visitId],
  );
  return result.rows;
}

async function upsertTriage(
  db: Db,
  visitId: string,
  body: z.infer<typeof triageDraftSchema>,
  actorId: string,
  complete: boolean,
) {
  const existing = await db.query<{ id: string; started_by: string | null; started_at: string | null }>(
    "SELECT id, started_by, started_at FROM patient_visit_triages WHERE visit_id = $1",
    [visitId],
  );
  const allergies = JSON.stringify(body.allergies ?? []);
  const medications = JSON.stringify(body.medications ?? []);
  const relevantHistory = body.relevant_history ?? [];
  const startedBy = existing.rows[0]?.started_by ?? actorId;
  const startedAt = existing.rows[0]?.started_at ?? new Date().toISOString();

  if (existing.rows[0]) {
    await db.query(
      `UPDATE patient_visit_triages SET
         chief_complaint = $2,
         temperature_c = $3,
         pulse = $4,
         respiratory_rate = $5,
         spo2 = $6,
         allergies = $7::jsonb,
         medications = $8::jsonb,
         relevant_history = $9::text[],
         relevant_history_other = $10,
         initial_assessment = $11,
         triage_category = $12,
         assigned_doctor_id = $13::uuid,
         started_by = COALESCE(started_by, $14::uuid),
         started_at = COALESCE(started_at, now()),
         completed_by = CASE WHEN $15::boolean THEN $14::uuid ELSE completed_by END,
         completed_at = CASE WHEN $15::boolean THEN now() ELSE completed_at END,
         updated_at = now()
       WHERE visit_id = $1`,
      [
        visitId,
        body.chief_complaint ?? null,
        body.temperature_c ?? null,
        body.pulse ?? null,
        body.respiratory_rate ?? null,
        body.spo2 ?? null,
        allergies,
        medications,
        relevantHistory,
        body.relevant_history_other ?? null,
        body.initial_assessment ?? null,
        body.triage_category ?? null,
        body.assigned_doctor_id ?? null,
        actorId,
        complete,
      ],
    );
  } else {
    await db.query(
      `INSERT INTO patient_visit_triages (
         visit_id, chief_complaint, temperature_c, pulse, respiratory_rate, spo2,
         allergies, medications, relevant_history, relevant_history_other, initial_assessment,
         triage_category, assigned_doctor_id, started_by, started_at,
         completed_by, completed_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7::jsonb, $8::jsonb, $9::text[], $10, $11,
         $12, $13::uuid, $14::uuid, $15::timestamptz,
         CASE WHEN $16::boolean THEN $14::uuid ELSE NULL::uuid END,
         CASE WHEN $16::boolean THEN now() ELSE NULL::timestamptz END
       )`,
      [
        visitId,
        body.chief_complaint ?? null,
        body.temperature_c ?? null,
        body.pulse ?? null,
        body.respiratory_rate ?? null,
        body.spo2 ?? null,
        allergies,
        medications,
        relevantHistory,
        body.relevant_history_other ?? null,
        body.initial_assessment ?? null,
        body.triage_category ?? null,
        body.assigned_doctor_id ?? null,
        startedBy,
        startedAt,
        complete,
      ],
    );
  }
  return findTriage(db, visitId);
}

const doctorForClinicSql = `u.deleted_at IS NULL
  AND u.is_active
  AND u.role = 'Doctor'
  AND (
    u.type = 'super-admin'
    OR EXISTS (
      SELECT 1
      FROM user_access_roles a
      JOIN access_roles r ON r.id = a.role_id AND r.deleted_at IS NULL
      JOIN access_role_permissions rp ON rp.role_id = r.id
      JOIN permissions p ON p.id = rp.permission_id AND p.clinic_scoped
      WHERE a.user_id = u.id
        AND (
          a.all_clinics
          OR EXISTS (
            SELECT 1 FROM user_access_role_clinics c
            WHERE c.assignment_id = a.id AND c.clinic_id = $1
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM user_permission_grants g
      JOIN permissions p ON p.id = g.permission_id AND p.clinic_scoped
      WHERE g.user_id = u.id
        AND (
          g.all_clinics
          OR EXISTS (
            SELECT 1 FROM user_permission_grant_clinics c
            WHERE c.grant_id = g.id AND c.clinic_id = $1
          )
        )
    )
  )`;

async function assertDoctorForClinic(pool: pg.Pool, doctorId: string, clinicId: string) {
  const result = await pool.query(
    `SELECT u.id
     FROM users u
     WHERE u.id = $2
       AND ${doctorForClinicSql}`,
    [clinicId, doctorId],
  );
  if (!result.rows[0]) throw new ApplicationError(422, "unknown_doctor", "Choose a doctor for this clinic");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
