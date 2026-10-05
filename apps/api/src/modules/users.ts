import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, isUniqueViolation, manageableTypes, parse, roles } from "../http.js";
import { hashPassword } from "../password.js";
import { assertCan, loadAccess, readUserAccess, saveUserAccess, validateUserAccess, viewWhere } from "../permissions.js";
import { changed, noteActivity, permissionLabel } from "./activity.js";

const columns = `id, name, email, phone, type, role, is_active, created_by, created_at, updated_at, deleted_at,
  CASE WHEN photo_path IS NOT NULL THEN '/uploads/' || photo_path ELSE NULL END AS photo_url`;

const assignmentSchema = z.object({
  role_id: z.string().uuid(),
  all_clinics: z.boolean(),
  clinic_ids: z.array(z.string().uuid()).default([]),
});
const grantSchema = z.object({
  permission_id: z.string().trim().min(1),
  all_clinics: z.boolean(),
  clinic_ids: z.array(z.string().uuid()).default([]),
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
  password: z.string().min(8),
  type: z.enum(manageableTypes),
  role: z.enum(roles),
  is_active: z.boolean().default(true),
  assignments: z.array(assignmentSchema).default([]),
  grants: z.array(grantSchema).default([]),
});

const updateSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
  password: z.string().min(8).optional(),
  type: z.enum(manageableTypes),
  role: z.enum(roles),
  is_active: z.boolean(),
  assignments: z.array(assignmentSchema).optional(),
  grants: z.array(grantSchema).optional(),
});

async function clinicAccessByUser(pool: pg.Pool, users: { id: string; type: string }[]) {
  const access = new Map<string, { all: boolean; items: { id: string; name: string }[] }>();
  for (const user of users) access.set(user.id, { all: user.type === "super-admin", items: [] });
  if (users.length === 0) return access;
  const scoped = await pool.query<{ user_id: string; all_clinics: boolean; clinic_id: string | null }>(
    `SELECT a.user_id, a.all_clinics, c.clinic_id
     FROM user_access_roles a
     JOIN access_roles r ON r.id = a.role_id AND r.deleted_at IS NULL
     JOIN access_role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id AND p.clinic_scoped
     LEFT JOIN user_access_role_clinics c ON c.assignment_id = a.id AND NOT a.all_clinics
     WHERE a.user_id = ANY($1::uuid[])
     UNION ALL
     SELECT g.user_id, g.all_clinics, c.clinic_id
     FROM user_permission_grants g
     JOIN permissions p ON p.id = g.permission_id AND p.clinic_scoped
     LEFT JOIN user_permission_grant_clinics c ON c.grant_id = g.id AND NOT g.all_clinics
     WHERE g.user_id = ANY($1::uuid[])`,
    [users.map((user) => user.id)],
  );
  const named = new Map<string, string>();
  const clinicIds = [...new Set(scoped.rows.flatMap((row) => (row.clinic_id ? [row.clinic_id] : [])))];
  if (clinicIds.length > 0) {
    const clinics = await pool.query<{ id: string; name: string }>("SELECT id, name FROM clinics WHERE deleted_at IS NULL AND id = ANY($1::uuid[])", [clinicIds]);
    for (const clinic of clinics.rows) named.set(clinic.id, clinic.name);
  }
  const chosen = new Map<string, { id: string; name: string }[]>();
  for (const row of scoped.rows) {
    const current = access.get(row.user_id);
    if (!current) continue;
    if (row.all_clinics) current.all = true;
    const name = row.clinic_id ? named.get(row.clinic_id) : undefined;
    if (!row.clinic_id || !name) continue;
    const items = chosen.get(row.user_id) ?? [];
    if (!items.some((item) => item.id === row.clinic_id)) items.push({ id: row.clinic_id, name });
    chosen.set(row.user_id, items);
  }
  for (const [userId, current] of access) {
    current.items = current.all ? [] : (chosen.get(userId) ?? []).sort((left, right) => left.name.localeCompare(right.name));
  }
  return access;
}

async function findUser(pool: pg.Pool, id: string) {
  const result = await pool.query(`SELECT ${columns} FROM users WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return result.rows[0] as { id: string; type: string; created_by: string | null } | undefined;
}

export function registerUsers(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/users", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    const where = viewWhere(access, request.user.sub, "user", { owner: "created_by" });
    const params = where.sql === "TRUE" ? [] : [...where.params, request.user.sub];
    const self = where.sql === "TRUE" ? "TRUE" : `(${where.sql} OR id = $${params.length})`;
    const result = await pool.query<{ id: string; type: string }>(`SELECT ${columns} FROM users WHERE deleted_at IS NULL AND ${self} ORDER BY created_at DESC`, params);
    const clinics = await clinicAccessByUser(pool, result.rows);
    return result.rows.map((row) => ({ ...row, clinics: clinics.get(row.id) ?? { all: false, items: [] } }));
  });

  app.get("/api/users/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const current = await findUser(pool, id);
    if (!current) throw new ApplicationError(404, "not_found", "User was not found");
    if (id !== request.user.sub) await assertCan(pool, request, { resource: "user", action: "view", ownerId: current.created_by });
    return { ...current, ...(await readUserAccess(pool, id)) };
  });

  app.post("/api/users", { preHandler: authenticate }, async (request, reply) => {
    await assertCan(pool, request, { resource: "user", action: "create" });
    const body = parse(createSchema, request.body);
    const uniqueAssignments = uniqueBy(body.assignments, (item) => item.role_id);
    const uniqueGrants = uniqueBy(body.grants, (item) => item.permission_id);
    await validateUserAccess(pool, request.user, uniqueAssignments, uniqueGrants);
    let createdId = "";
    try {
      const result = await pool.query(
        `INSERT INTO users (name, email, phone, type, role, password_hash, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${columns}`,
        [body.name, body.email.toLowerCase(), body.phone, body.type, body.role, await hashPassword(body.password), body.is_active, request.user.sub],
      );
      const created = result.rows[0] as { id: string };
      createdId = created.id;
      await saveUserAccess(pool, request.user, created.id, uniqueAssignments, uniqueGrants);
      return reply.status(201).send({ ...created, ...(await readUserAccess(pool, created.id)) });
    } catch (error) {
      if (createdId) await pool.query("DELETE FROM users WHERE id = $1", [createdId]);
      if (isUniqueViolation(error)) throw new ApplicationError(409, "email_taken", "A user with this email already exists");
      throw error;
    }
  });

  app.patch("/api/users/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const current = await findUser(pool, id);
    if (!current) throw new ApplicationError(404, "not_found", "User was not found");
    if (current.type === "super-admin") throw new ApplicationError(403, "forbidden", "A super admin is created manually");
    await assertCan(pool, request, { resource: "user", action: "update", ownerId: current.created_by });
    const body = parse(updateSchema, request.body);
    if (id === request.user.sub && !body.is_active) throw new ApplicationError(403, "forbidden", "You cannot deactivate your own account");
    const assignments = body.assignments ? uniqueBy(body.assignments, (item) => item.role_id) : null;
    const grants = body.grants ? uniqueBy(body.grants, (item) => item.permission_id) : null;
    if (assignments && grants) await validateUserAccess(pool, request.user, assignments, grants);
    const before = await pool.query<{ name: string; email: string; phone: string; type: string; role: string; is_active: boolean }>(
      "SELECT name, email, phone, type, role, is_active FROM users WHERE id = $1 AND deleted_at IS NULL",
      [id],
    );
    const previous = before.rows[0];
    if (!previous) throw new ApplicationError(404, "not_found", "User was not found");
    const previousAccess = assignments && grants ? await readUserAccess(pool, id) : null;
    try {
      const result = await pool.query(
        `UPDATE users
         SET name = $2, email = $3, phone = $4, type = $5, role = $6, is_active = $7,
             password_hash = COALESCE($8, password_hash), updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING ${columns}`,
        [id, body.name, body.email.toLowerCase(), body.phone, body.type, body.role, body.is_active, body.password ? await hashPassword(body.password) : null],
      );
      if (assignments && grants) await saveUserAccess(pool, request.user, id, assignments, grants);
      const changes = [
        changed("Name", previous.name, body.name),
        changed("Email", previous.email, body.email.toLowerCase()),
        changed("Phone", previous.phone, body.phone),
        changed("Type", typeName(previous.type), typeName(body.type)),
        changed("Position", previous.role, body.role),
        changed("Status", previous.is_active ? "Active" : "Inactive", body.is_active ? "Active" : "Inactive"),
        body.password ? changed("Password", "Hidden", "Replaced") : null,
        ...(previousAccess && assignments && grants ? await accessChanges(pool, previousAccess, assignments, grants) : []),
      ].filter((item) => item !== null);
      noteActivity(request, { changes });
      return { ...result.rows[0], ...(await readUserAccess(pool, id)) };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApplicationError(409, "email_taken", "A user with this email already exists");
      throw error;
    }
  });

  app.delete("/api/users/:id", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === request.user.sub) throw new ApplicationError(403, "forbidden", "You cannot delete your own account");
    const current = await findUser(pool, id);
    if (!current) throw new ApplicationError(404, "not_found", "User was not found");
    if (current.type === "super-admin") throw new ApplicationError(403, "forbidden", "A super admin is created manually");
    await assertCan(pool, request, { resource: "user", action: "delete", ownerId: current.created_by });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM user_access_roles WHERE user_id = $1", [id]);
      await client.query("DELETE FROM user_permission_grants WHERE user_id = $1", [id]);
      await client.query("UPDATE users SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return reply.status(204).send();
  });
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function typeName(type: string) {
  if (type === "super-admin") return "Super admin";
  if (type === "admin") return "Admin";
  return "Staff";
}

async function accessChanges(
  pool: pg.Pool,
  current: Awaited<ReturnType<typeof readUserAccess>>,
  assignments: { role_id: string; all_clinics: boolean; clinic_ids: string[] }[],
  grants: { permission_id: string; all_clinics: boolean; clinic_ids: string[] }[],
) {
  const roleIds = [...new Set([...current.assignments.map((item) => item.role_id), ...assignments.map((item) => item.role_id)])];
  const clinicIds = [...new Set([
    ...current.assignments.flatMap((item) => item.clinic_ids),
    ...current.grants.flatMap((item) => item.clinic_ids),
    ...assignments.flatMap((item) => item.clinic_ids),
    ...grants.flatMap((item) => item.clinic_ids),
  ])];
  const permissionIds = [...new Set([...current.grants.map((item) => item.permission_id), ...grants.map((item) => item.permission_id)])];
  const roles = new Map<string, string>();
  const clinics = new Map<string, string>();
  const scoped = new Set<string>();
  if (roleIds.length > 0) {
    const result = await pool.query<{ id: string; name: string }>("SELECT id, name FROM access_roles WHERE id = ANY($1::uuid[])", [roleIds]);
    for (const row of result.rows) roles.set(row.id, row.name);
  }
  if (clinicIds.length > 0) {
    const result = await pool.query<{ id: string; name: string }>("SELECT id, name FROM clinics WHERE deleted_at IS NULL AND id = ANY($1::uuid[])", [clinicIds]);
    for (const row of result.rows) clinics.set(row.id, row.name);
  }
  if (permissionIds.length > 0) {
    const result = await pool.query<{ id: string }>("SELECT id FROM permissions WHERE clinic_scoped AND id = ANY($1::text[])", [permissionIds]);
    for (const row of result.rows) scoped.add(row.id);
  }
  const roleText = (items: { role_id: string; role_name?: string; all_clinics: boolean; clinic_ids: string[] }[]) => items
    .map((item) => `${item.role_name ?? roles.get(item.role_id) ?? "Role"} (${scopeText(item.all_clinics, item.clinic_ids, clinics)})`)
    .sort()
    .join("; ");
  const grantText = (items: { permission_id: string; all_clinics: boolean; clinic_ids: string[] }[]) => items
    .map((item) => {
      const title = permissionLabel(item.permission_id);
      return scoped.has(item.permission_id) ? `${title} (${scopeText(item.all_clinics, item.clinic_ids, clinics)})` : title;
    })
    .sort()
    .join("; ");
  return [
    changed("Permission roles", roleText(current.assignments), roleText(assignments)),
    changed("Extra permissions", grantText(current.grants), grantText(grants)),
  ];
}

function scopeText(allClinics: boolean, clinicIds: string[], clinics: Map<string, string>) {
  if (allClinics) return "All clinics";
  const names = clinicIds.map((id) => clinics.get(id) ?? "Clinic").sort();
  return names.length > 0 ? names.join(", ") : "No clinic";
}
