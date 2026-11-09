import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate } from "../http.js";
import {
  listVisitInvestigations,
  maybeCompleteVisitInvestigations,
  presentInvestigationRow,
} from "../investigation-helpers.js";
import { can, canList, loadAccess, workspaceClinicOptionsWhere } from "../permissions.js";
import { removeUpload, saveInvestigationResult } from "../uploads.js";
import { changed, noteActivity } from "./activity.js";

type Db = pg.Pool | pg.PoolClient;

export function registerInvestigations(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/investigations", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    if (!canList(access, "triage") && !canList(access, "visit")) {
      throw new ApplicationError(403, "forbidden", "You cannot view investigations");
    }
    const query = readVisitListQuery(request.query);
    const values: unknown[] = [];
    const baseClauses = [`v.deleted_at IS NULL`, `p.deleted_at IS NULL`];
    const workspace = workspaceClinicOptionsWhere(access);
    if (workspace && !workspace.allClinics) {
      values.push(workspace.params[0]);
      baseClauses.push(`v.clinic_id = ANY($${values.length}::uuid[])`);
    }
    if (query.clinicId) {
      values.push(query.clinicId);
      baseClauses.push(`v.clinic_id = $${values.length}`);
    }
    if (query.q) {
      const pattern = `%${escapeLike(query.q)}%`;
      values.push(pattern, pattern);
      const start = values.length - 1;
      baseClauses.push(`(
        p.name ILIKE $${start} ESCAPE '\\'
        OR p.mrn ILIKE $${start + 1} ESCAPE '\\'
      )`);
    }
    const baseWhere = baseClauses.join(" AND ");
    const visitStatsCte = `
      WITH visit_stats AS (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          v.clinic_id,
          v.hotel_room_no,
          v.status AS visit_status,
          c.name AS clinic_name,
          h.name AS hotel_name,
          p.name AS patient_name,
          p.mrn AS patient_mrn,
          p.gender AS patient_gender,
          p.nationality AS patient_nationality,
          EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit,
          e.case_priority,
          count(i.id)::int AS test_count,
          count(*) FILTER (WHERE i.status = 'completed')::int AS completed_count,
          count(*) FILTER (WHERE i.status IN ('ordered', 'collected'))::int AS early_count,
          count(*) FILTER (WHERE i.status IN ('sent', 'result_uploaded'))::int AS sent_count,
          min(i.ordered_at) AS ordered_at,
          CASE
            WHEN count(i.id) > 0 AND count(*) FILTER (WHERE i.status = 'completed') = count(i.id) THEN 'completed'
            WHEN count(*) FILTER (WHERE i.status = 'completed') > 0
              AND count(*) FILTER (WHERE i.status <> 'completed') > 0 THEN 'partially_completed'
            WHEN count(*) FILTER (WHERE i.status IN ('ordered', 'collected')) = 0
              AND count(*) FILTER (WHERE i.status = 'completed') = 0
              AND count(*) FILTER (WHERE i.status IN ('sent', 'result_uploaded')) > 0 THEN 'sent'
            ELSE 'other'
          END AS overall_status
        FROM patient_visits v
        JOIN clinics c ON c.id = v.clinic_id
        JOIN hotels h ON h.id = c.hotel_id
        JOIN patients p ON p.id = v.patient_id
        JOIN patient_visit_investigations i ON i.visit_id = v.id
        LEFT JOIN patient_visit_encounters e ON e.visit_id = v.id
        WHERE ${baseWhere}
        GROUP BY v.id, v.patient_id, v.clinic_id, v.hotel_room_no, v.status, c.name, h.name,
                 p.name, p.mrn, p.gender, p.nationality, p.birthdate, v.created_at, e.case_priority
      )`;
    const filterClause = query.overallStatus
      ? `WHERE overall_status = $${values.length + 1}`
      : "";
    const filterValues = query.overallStatus ? [...values, query.overallStatus] : values;

    const summaryResult = await pool.query<{ overall_status: string; count: number }>(
      `${visitStatsCte}
       SELECT overall_status, count(*)::int AS count
       FROM visit_stats
       GROUP BY overall_status`,
      values,
    );
    const summary = {
      all: 0,
      sent: 0,
      partially_completed: 0,
      completed: 0,
    };
    for (const row of summaryResult.rows) {
      summary.all += row.count;
      if (row.overall_status === "sent") summary.sent = row.count;
      if (row.overall_status === "partially_completed") summary.partially_completed = row.count;
      if (row.overall_status === "completed") summary.completed = row.count;
    }

    const counted = await pool.query<{ total: number }>(
      `${visitStatsCte}
       SELECT count(*)::int AS total FROM visit_stats ${filterClause}`,
      filterValues,
    );
    const total = counted.rows[0]?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, pages);
    const result = await pool.query(
      `${visitStatsCte}
       SELECT *
       FROM visit_stats
       ${filterClause}
       ORDER BY
         CASE case_priority WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 WHEN 'stable' THEN 2 ELSE 3 END,
         ordered_at DESC NULLS LAST
       LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`,
      [...filterValues, query.pageSize, (page - 1) * query.pageSize],
    );

    return {
      items: result.rows.map((row) => presentInvestigationVisit(row as Record<string, unknown>)),
      total,
      page,
      page_size: query.pageSize,
      summary,
    };
  });

  app.get("/api/nurse/sample-collection", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    if (!canList(access, "triage") && !canList(access, "visit")) {
      throw new ApplicationError(403, "forbidden", "You cannot view sample collection");
    }
    const query = readSampleQuery(request.query);
    const values: unknown[] = [];
    const clauses = [
      `v.deleted_at IS NULL`,
      `p.deleted_at IS NULL`,
      `v.status = 'waiting_for_investigation'`,
      `EXISTS (
         SELECT 1 FROM patient_visit_investigations i
         WHERE i.visit_id = v.id
           AND (
             (i.requires_collection AND i.status IN ('ordered', 'collected'))
             OR (NOT i.requires_collection AND i.status = 'ordered')
           )
       )`,
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
    const where = `WHERE ${clauses.join(" AND ")}`;
    const result = await pool.query(
      `SELECT v.id AS visit_id, v.patient_id, v.clinic_id, v.hotel_room_no, v.passport_number, v.status, v.assigned_nurse_id, v.status_changed_at,
              c.name AS clinic_name, h.name AS hotel_name,
              p.name AS patient_name, p.mrn AS patient_mrn, p.gender AS patient_gender, p.nationality AS patient_nationality,
              EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit,
              nurse.name AS assigned_nurse_name,
              e.case_priority,
              (
                SELECT i.priority
                FROM patient_visit_investigations i
                WHERE i.visit_id = v.id
                ORDER BY CASE i.priority WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END
                LIMIT 1
              ) AS highest_priority,
              (
                SELECT count(*)::int FROM patient_visit_investigations i
                WHERE i.visit_id = v.id AND i.status <> 'completed'
              ) AS open_count,
              (
                SELECT count(*)::int FROM patient_visit_investigations i
                WHERE i.visit_id = v.id AND i.requires_collection AND i.status = 'ordered'
              ) AS collectable_count,
              (
                SELECT count(*)::int FROM patient_visit_investigations i
                WHERE i.visit_id = v.id
                  AND (
                    (i.requires_collection AND i.status = 'collected')
                    OR (NOT i.requires_collection AND i.status = 'ordered')
                  )
              ) AS sendable_count,
              (
                SELECT min(i.ordered_at) FROM patient_visit_investigations i WHERE i.visit_id = v.id
              ) AS ordered_at
       FROM patient_visits v
       JOIN clinics c ON c.id = v.clinic_id
       JOIN hotels h ON h.id = c.hotel_id
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN users nurse ON nurse.id = v.assigned_nurse_id
       LEFT JOIN patient_visit_encounters e ON e.visit_id = v.id
       ${where}
       ORDER BY
         CASE e.case_priority WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 WHEN 'stable' THEN 2 ELSE 3 END,
         CASE (
           SELECT i.priority FROM patient_visit_investigations i
           WHERE i.visit_id = v.id
           ORDER BY CASE i.priority WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END
           LIMIT 1
         ) WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
         ordered_at ASC`,
      values,
    );
    return {
      items: result.rows.map((row) => ({
        ...row,
        case_priority: row.case_priority === "stable" || row.case_priority === "urgent" || row.case_priority === "emergency"
          ? row.case_priority
          : null,
      })),
    };
  });

  app.get("/api/patients/:patientId/visits/:visitId/investigations", { preHandler: authenticate }, async (request) => {
    const { patientId, visitId } = request.params as { patientId: string; visitId: string };
    const visit = await findVisit(pool, patientId, visitId);
    await assertVisitAccess(pool, request, visit);
    const items = await listVisitInvestigations(pool, visitId);
    return {
      visit: {
        id: visit.id,
        patient_id: visit.patient_id,
        clinic_id: visit.clinic_id,
        clinic_name: visit.clinic_name,
        hotel_name: visit.hotel_name,
        hotel_room_no: visit.hotel_room_no,
        status: visit.status,
        patient_name: visit.patient_name,
        patient_mrn: visit.patient_mrn,
        patient_gender: visit.patient_gender,
        patient_nationality: visit.patient_nationality,
        patient_age_at_visit: visit.patient_age_at_visit,
        visit_type: visit.visit_type,
      },
      items,
    };
  });

  app.post("/api/investigations/:id/collect", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const row = await loadInvestigation(pool, id);
    await assertNurseAction(pool, request, row);
    if (!row.requires_collection) {
      throw new ApplicationError(422, "invalid_status", "This investigation does not need sample collection");
    }
    if (row.status !== "ordered") {
      throw new ApplicationError(422, "invalid_status", "Only ordered laboratory tests can be marked collected");
    }
    await pool.query(
      `UPDATE patient_visit_investigations
       SET status = 'collected', collected_at = now(), collected_by = $2, updated_at = now()
       WHERE id = $1`,
      [id, request.user.sub],
    );
    noteActivity(request, {
      entity: "patient",
      entityId: row.patient_id,
      summary: `Marked ${row.name} as collected for ${row.patient_name}`,
      changes: [changed("Investigation status", "Ordered", "Collected")].filter((item) => item !== null),
    });
    return presentInvestigationRow(await loadInvestigation(pool, id));
  });

  app.post("/api/investigations/:id/send", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const row = await loadInvestigation(pool, id);
    await assertNurseAction(pool, request, row);
    const allowed = row.requires_collection ? row.status === "collected" : row.status === "ordered";
    if (!allowed) {
      throw new ApplicationError(
        422,
        "invalid_status",
        row.requires_collection
          ? "Collect the sample before sending it to the lab"
          : "Only ordered imaging studies can be sent",
      );
    }
    await pool.query(
      `UPDATE patient_visit_investigations
       SET status = 'sent', sent_at = now(), sent_by = $2, updated_at = now()
       WHERE id = $1`,
      [id, request.user.sub],
    );
    noteActivity(request, {
      entity: "patient",
      entityId: row.patient_id,
      summary: `Sent ${row.name} to lab for ${row.patient_name}`,
      changes: [changed("Investigation status", row.status === "collected" ? "Collected" : "Ordered", "Sent")].filter((item) => item !== null),
    });
    return presentInvestigationRow(await loadInvestigation(pool, id));
  });

  app.post("/api/visits/:visitId/investigations/collect", { preHandler: authenticate }, async (request) => {
    const { visitId } = request.params as { visitId: string };
    const visit = await findVisitById(pool, visitId);
    await assertNurseAction(pool, request, visit);
    const result = await pool.query(
      `UPDATE patient_visit_investigations
       SET status = 'collected', collected_at = now(), collected_by = $2, updated_at = now()
       WHERE visit_id = $1 AND requires_collection AND status = 'ordered'
       RETURNING id`,
      [visitId, request.user.sub],
    );
    noteActivity(request, {
      entity: "patient",
      entityId: visit.patient_id,
      summary: `Marked ${result.rowCount ?? 0} sample(s) collected for ${visit.patient_name}`,
    });
    return { items: await listVisitInvestigations(pool, visitId), updated: result.rowCount ?? 0 };
  });

  app.post("/api/visits/:visitId/investigations/send", { preHandler: authenticate }, async (request) => {
    const { visitId } = request.params as { visitId: string };
    const visit = await findVisitById(pool, visitId);
    await assertNurseAction(pool, request, visit);
    const result = await pool.query(
      `UPDATE patient_visit_investigations
       SET status = 'sent', sent_at = now(), sent_by = $2, updated_at = now()
       WHERE visit_id = $1
         AND (
           (requires_collection AND status = 'collected')
           OR (NOT requires_collection AND status = 'ordered')
         )
       RETURNING id`,
      [visitId, request.user.sub],
    );
    noteActivity(request, {
      entity: "patient",
      entityId: visit.patient_id,
      summary: `Sent ${result.rowCount ?? 0} investigation(s) to lab for ${visit.patient_name}`,
    });
    return { items: await listVisitInvestigations(pool, visitId), updated: result.rowCount ?? 0 };
  });

  app.post("/api/investigations/:id/result", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const row = await loadInvestigation(pool, id);
    await assertResultUpload(pool, request, row);
    const replacing = Boolean(row.result_file_path) || row.status === "completed" || row.status === "result_uploaded";
    if (row.status !== "sent" && row.status !== "result_uploaded" && row.status !== "completed") {
      throw new ApplicationError(422, "invalid_status", "Send the investigation to the lab before uploading a result");
    }
    const file = await request.file();
    if (!file) throw new ApplicationError(422, "document_required", "Choose a result file to upload");
    const saved = await saveInvestigationResult(row.visit_id, id, file, row.result_file_path);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE patient_visit_investigations
         SET status = 'completed',
             result_file_path = $2,
             result_original_name = $3,
             result_mime_type = $4,
             result_uploaded_at = now(),
             result_uploaded_by = $5,
             completed_at = COALESCE(completed_at, now()),
             updated_at = now()
         WHERE id = $1`,
        [id, saved.path, saved.originalName, saved.mimeType, request.user.sub],
      );
      const completedVisit = await maybeCompleteVisitInvestigations(client, row.visit_id, request.user.sub);
      await client.query("COMMIT");
      noteActivity(request, {
        entity: "patient",
        entityId: row.patient_id,
        summary: `${replacing ? "Re-uploaded" : "Uploaded"} result for ${row.name} (${row.patient_name})`,
        changes: [
          changed("Investigation status", statusLabel(row.status), "Completed"),
          completedVisit ? changed("Status", "Waiting for investigation", "Diagnosed") : null,
        ].filter((item) => item !== null),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      await removeUpload(saved.path);
      throw error;
    } finally {
      client.release();
    }
    return presentInvestigationRow(await loadInvestigation(pool, id));
  });
}

async function assertVisitAccess(
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
  if (!allowed) throw new ApplicationError(403, "forbidden", "You cannot view investigations for this visit");
}

async function assertNurseAction(
  pool: pg.Pool,
  request: { user: { sub: string; type: string; role: string } },
  row: { clinic_id: string; patient_added_by: string; assigned_nurse_id?: string | null },
) {
  const access = await loadAccess(pool, request.user);
  const allowed = can(access, request.user.sub, {
    resource: "triage",
    action: "update",
    ownerId: row.patient_added_by,
    clinicId: row.clinic_id,
  }) || can(access, request.user.sub, {
    resource: "visit",
    action: "update",
    ownerId: row.patient_added_by,
    clinicId: row.clinic_id,
  }) || request.user.type === "super-admin" || request.user.type === "admin";
  if (!allowed) throw new ApplicationError(403, "forbidden", "You cannot update this investigation");
  const isAdmin = request.user.type === "super-admin" || request.user.type === "admin";
  if (!isAdmin && request.user.role === "Nurse" && row.assigned_nurse_id && row.assigned_nurse_id !== request.user.sub) {
    throw new ApplicationError(403, "forbidden", "This visit is assigned to another nurse");
  }
}

async function assertResultUpload(
  pool: pg.Pool,
  request: { user: { sub: string; type: string; role: string } },
  row: { clinic_id: string; patient_added_by: string },
) {
  const isAdmin = request.user.type === "super-admin" || request.user.type === "admin";
  if (isAdmin || request.user.role === "Nurse") {
    await assertNurseAction(pool, request, row);
    return;
  }
  throw new ApplicationError(403, "forbidden", "Only a nurse or admin can upload investigation results");
}

async function loadInvestigation(db: Db, id: string) {
  if (!isUuid(id)) throw new ApplicationError(404, "not_found", "Investigation was not found");
  const result = await db.query(
    `SELECT i.*,
            v.patient_id, v.clinic_id, v.assigned_nurse_id, v.status AS visit_status,
            p.name AS patient_name, p.added_by AS patient_added_by,
            o.name AS ordered_by_name,
            c.name AS collected_by_name,
            s.name AS sent_by_name,
            r.name AS result_uploaded_by_name
     FROM patient_visit_investigations i
     JOIN patient_visits v ON v.id = i.visit_id
     JOIN patients p ON p.id = v.patient_id
     LEFT JOIN users o ON o.id = i.ordered_by
     LEFT JOIN users c ON c.id = i.collected_by
     LEFT JOIN users s ON s.id = i.sent_by
     LEFT JOIN users r ON r.id = i.result_uploaded_by
     WHERE i.id = $1 AND v.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [id],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new ApplicationError(404, "not_found", "Investigation was not found");
  return {
    ...row,
    id: String(row.id),
    visit_id: String(row.visit_id),
    patient_id: String(row.patient_id),
    clinic_id: String(row.clinic_id),
    patient_added_by: String(row.patient_added_by),
    patient_name: String(row.patient_name),
    name: String(row.name),
    status: String(row.status),
    requires_collection: Boolean(row.requires_collection),
    assigned_nurse_id: typeof row.assigned_nurse_id === "string" ? row.assigned_nurse_id : null,
    result_file_path: typeof row.result_file_path === "string" ? row.result_file_path : null,
  };
}

async function findVisit(pool: pg.Pool, patientId: string, visitId: string) {
  if (!isUuid(patientId) || !isUuid(visitId)) throw new ApplicationError(404, "not_found", "Visit was not found");
  const result = await pool.query(
    `SELECT v.id, v.patient_id, v.clinic_id, v.hotel_room_no, v.status, v.visit_type, v.assigned_nurse_id,
            v.assigned_doctor_id,
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

async function findVisitById(pool: pg.Pool, visitId: string) {
  if (!isUuid(visitId)) throw new ApplicationError(404, "not_found", "Visit was not found");
  const result = await pool.query(
    `SELECT v.id, v.patient_id, v.clinic_id, v.assigned_nurse_id, p.name AS patient_name, p.added_by AS patient_added_by
     FROM patient_visits v
     JOIN patients p ON p.id = v.patient_id
     WHERE v.id = $1 AND v.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [visitId],
  );
  const row = result.rows[0] as {
    id: string;
    patient_id: string;
    clinic_id: string;
    assigned_nurse_id: string | null;
    patient_name: string;
    patient_added_by: string;
  } | undefined;
  if (!row) throw new ApplicationError(404, "not_found", "Visit was not found");
  return row;
}

const visitOverallStatuses = ["sent", "partially_completed", "completed"] as const;
type VisitOverallStatus = (typeof visitOverallStatuses)[number];

function presentInvestigationVisit(row: Record<string, unknown>) {
  const casePriority = row.case_priority === "stable" || row.case_priority === "urgent" || row.case_priority === "emergency"
    ? row.case_priority
    : null;
  const overall = row.overall_status === "sent" || row.overall_status === "partially_completed" || row.overall_status === "completed"
    ? row.overall_status
    : "other";
  return {
    visit_id: String(row.visit_id),
    patient_id: String(row.patient_id),
    clinic_id: String(row.clinic_id),
    hotel_room_no: typeof row.hotel_room_no === "string" ? row.hotel_room_no : null,
    visit_status: String(row.visit_status),
    clinic_name: String(row.clinic_name),
    hotel_name: String(row.hotel_name),
    patient_name: String(row.patient_name),
    patient_mrn: String(row.patient_mrn),
    patient_gender: typeof row.patient_gender === "string" ? row.patient_gender : null,
    patient_nationality: typeof row.patient_nationality === "string" ? row.patient_nationality : null,
    patient_age_at_visit: row.patient_age_at_visit == null ? null : Number(row.patient_age_at_visit),
    case_priority: casePriority,
    test_count: Number(row.test_count ?? 0),
    overall_status: overall,
    ordered_at: row.ordered_at ? new Date(String(row.ordered_at)).toISOString() : null,
  };
}

function readVisitListQuery(query: unknown) {
  const source = query !== null && typeof query === "object" ? query as Record<string, unknown> : {};
  const text = (key: string) => (typeof source[key] === "string" ? source[key].trim() : "");
  const page = Number(text("page") || "1");
  const pageSize = Number(text("page_size") || "50");
  const q = text("q");
  const clinicId = text("clinic_id");
  const overallStatus = text("overall_status") || text("status");
  if (!Number.isInteger(page) || page < 1) throw new ApplicationError(422, "invalid_query", "Page must be 1 or greater");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ApplicationError(422, "invalid_query", "Page size must be between 1 and 100");
  }
  if (q.length > 200) throw new ApplicationError(422, "invalid_query", "Search is too long");
  if (clinicId && !isUuid(clinicId)) throw new ApplicationError(422, "invalid_query", "Unknown clinic");
  if (overallStatus && !visitOverallStatuses.includes(overallStatus as VisitOverallStatus)) {
    throw new ApplicationError(422, "invalid_query", "Unknown status");
  }
  return {
    page,
    pageSize,
    q,
    clinicId: clinicId || null,
    overallStatus: (overallStatus || null) as VisitOverallStatus | null,
  };
}

function readSampleQuery(query: unknown) {
  const source = query !== null && typeof query === "object" ? query as Record<string, unknown> : {};
  const clinicId = typeof source.clinic_id === "string" ? source.clinic_id.trim() : "";
  if (clinicId && !isUuid(clinicId)) throw new ApplicationError(422, "invalid_query", "Unknown clinic");
  return { clinicId: clinicId || null };
}

function statusLabel(status: string) {
  if (status === "ordered") return "Ordered";
  if (status === "collected") return "Collected";
  if (status === "sent") return "Sent";
  if (status === "result_uploaded") return "Result uploaded";
  if (status === "completed") return "Completed";
  return status;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
