import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse, type Actor } from "../http.js";
import { canList, loadAccess, viewWhere, workspaceClinicOptionsWhere } from "../permissions.js";

const kinds = ["waiting_for_triage", "to_doctor"] as const;
type Kind = (typeof kinds)[number];

type Notice = {
  visit_id: string;
  patient_id: string;
  kind: Kind;
  title: string;
  body: string;
  clinic_name: string;
  created_at: string;
  read: boolean;
  href: string;
};

export function registerNotifications(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/notifications", { preHandler: authenticate }, async (request) => {
    const clinicId = readClinic(request.query);
    const { items, filters } = await listNotices(pool, request.user, clinicId);
    return { items, unread: items.filter((item) => !item.read).length, filters };
  });

  app.post("/api/notifications/read", { preHandler: authenticate }, async (request) => {
    const body = parse(z.object({
      all: z.boolean().optional(),
      clinic_id: z.string().uuid().nullable().optional(),
      visit_id: z.string().uuid().optional(),
      kind: z.enum(kinds).optional(),
    }), request.body);
    if (body.all) {
      const { items } = await listNotices(pool, request.user, body.clinic_id ?? null);
      for (const item of items) await markRead(pool, request.user.sub, item.visit_id, item.kind);
    } else {
      if (!body.visit_id || !body.kind) throw new ApplicationError(422, "invalid_body", "Choose a notification");
      await markRead(pool, request.user.sub, body.visit_id, body.kind);
    }
    const clinicId = body.clinic_id ?? null;
    const { items, filters } = await listNotices(pool, request.user, clinicId);
    return { items, unread: items.filter((item) => !item.read).length, filters };
  });
}

async function listNotices(pool: pg.Pool, user: Actor, clinicId: string | null) {
  const seesAll = user.type === "super-admin" || user.type === "admin";
  const access = await loadAccess(pool, user);
  const filters: Kind[] = [];
  const items: Notice[] = [];
  if (seesAll || (user.role === "Nurse" && canList(access, "triage"))) {
    filters.push("waiting_for_triage");
    items.push(...await triageNotices(pool, user, access, clinicId));
  }
  if (seesAll || user.role === "Doctor") {
    filters.push("to_doctor");
    items.push(...await doctorNotices(pool, user, access, clinicId, seesAll));
  }
  items.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  return { items: items.slice(0, 40), filters };
}

async function triageNotices(pool: pg.Pool, user: Actor, access: Awaited<ReturnType<typeof loadAccess>>, clinicId: string | null) {
  const scope = viewWhere(access, user.sub, "triage", { owner: "p.added_by", clinic: "v.clinic_id" });
  const values: unknown[] = [...scope.params, user.sub];
  const reader = values.length;
  const clauses = [
    "v.deleted_at IS NULL",
    "p.deleted_at IS NULL",
    "v.status = 'waiting_for_triage'",
    scope.sql,
  ];
  if (clinicId) {
    values.push(clinicId);
    clauses.push(`v.clinic_id = $${values.length}`);
  }
  const result = await pool.query(
    `SELECT v.id AS visit_id, v.patient_id, p.name AS patient_name, p.mrn AS patient_mrn,
            c.name AS clinic_name, v.hotel_room_no, v.created_at,
            r.read_at IS NOT NULL AS read
     FROM patient_visits v
     JOIN patients p ON p.id = v.patient_id
     JOIN clinics c ON c.id = v.clinic_id
     LEFT JOIN notification_reads r
       ON r.user_id = $${reader} AND r.visit_id = v.id AND r.kind = 'waiting_for_triage'
     WHERE ${clauses.join(" AND ")}
     ORDER BY v.created_at DESC
     LIMIT 40`,
    values,
  );
  return result.rows.map((row) => present(row, "waiting_for_triage"));
}

async function doctorNotices(
  pool: pg.Pool,
  user: Actor,
  access: Awaited<ReturnType<typeof loadAccess>>,
  clinicId: string | null,
  seesAll: boolean,
) {
  const values: unknown[] = [user.sub];
  const reader = 1;
  const clauses = [
    "v.deleted_at IS NULL",
    "p.deleted_at IS NULL",
    "v.status = 'to_doctor'",
    "v.assigned_doctor_id IS NOT NULL",
    "t.completed_at IS NOT NULL",
  ];
  if (!seesAll) clauses.push("v.assigned_doctor_id = $1");
  const workspace = workspaceClinicOptionsWhere(access);
  if (workspace && !workspace.allClinics) {
    values.push(workspace.params[0]);
    clauses.push(`v.clinic_id = ANY($${values.length}::uuid[])`);
  }
  if (clinicId) {
    values.push(clinicId);
    clauses.push(`v.clinic_id = $${values.length}`);
  }
  const result = await pool.query(
    `SELECT v.id AS visit_id, v.patient_id, p.name AS patient_name, p.mrn AS patient_mrn,
            c.name AS clinic_name, v.hotel_room_no, t.completed_at AS created_at,
            r.read_at IS NOT NULL AS read
     FROM patient_visits v
     JOIN patients p ON p.id = v.patient_id
     JOIN clinics c ON c.id = v.clinic_id
     JOIN patient_visit_triages t ON t.visit_id = v.id
     LEFT JOIN notification_reads r
       ON r.user_id = $${reader} AND r.visit_id = v.id AND r.kind = 'to_doctor'
     WHERE ${clauses.join(" AND ")}
     ORDER BY t.completed_at DESC
     LIMIT 40`,
    values,
  );
  return result.rows.map((row) => present(row, "to_doctor"));
}

function present(row: {
  visit_id: string;
  patient_id: string;
  patient_name: string;
  patient_mrn: string;
  clinic_name: string;
  hotel_room_no: string | null;
  created_at: string;
  read: boolean;
}, kind: Kind): Notice {
  const place = [row.patient_mrn, row.clinic_name, row.hotel_room_no ? `Room ${row.hotel_room_no}` : null].filter(Boolean).join(" · ");
  return {
    visit_id: row.visit_id,
    patient_id: row.patient_id,
    kind,
    title: kind === "waiting_for_triage"
      ? `${row.patient_name} is waiting for triage`
      : `${row.patient_name} is waiting to be seen`,
    body: place,
    clinic_name: row.clinic_name,
    created_at: row.created_at,
    read: row.read,
    href: kind === "waiting_for_triage"
      ? `/patients/triage?patient=${row.patient_id}&visit=${row.visit_id}`
      : `/patients/to-doctor/${row.visit_id}/encounter`,
  };
}

async function markRead(pool: pg.Pool, userId: string, visitId: string, kind: Kind) {
  await pool.query(
    `INSERT INTO notification_reads (user_id, visit_id, kind)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, visit_id, kind) DO UPDATE SET read_at = now()`,
    [userId, visitId, kind],
  );
}

function readClinic(query: unknown) {
  const source = query !== null && typeof query === "object" ? query as Record<string, unknown> : {};
  const clinicId = typeof source.clinic_id === "string" ? source.clinic_id.trim() : "";
  if (!clinicId) return null;
  if (!z.string().uuid().safeParse(clinicId).success) throw new ApplicationError(422, "invalid_query", "Unknown clinic");
  return clinicId;
}
