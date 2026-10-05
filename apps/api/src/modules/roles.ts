import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import { assertCan, loadAccess } from "../permissions.js";
import { changed, noteActivity, permissionLabel } from "./activity.js";

const roleSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().default(""),
  permission_ids: z.array(z.string().trim().min(1)).min(1),
});

export function registerRoles(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/permissions", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    if (!access.bypass && !canReadCatalog(access)) throw new ApplicationError(403, "forbidden", "You do not have permission to do that");
    const result = await pool.query(
      `SELECT id, resource, action, ownership, clinic_scoped, description
       FROM permissions
       ORDER BY resource,
         CASE action WHEN 'manage' THEN 0 WHEN 'view' THEN 1 WHEN 'create' THEN 2 WHEN 'update' THEN 3 WHEN 'delete' THEN 4 ELSE 5 END,
         ownership`,
    );
    return result.rows;
  });

  app.get("/api/roles", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    if (!access.bypass && !canReadCatalog(access)) throw new ApplicationError(403, "forbidden", "You cannot view roles");
    const result = await pool.query(
      `SELECT r.id, r.name, r.description, r.created_at, r.updated_at,
              COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') AS permission_ids,
              (SELECT count(*)::int FROM user_access_roles u WHERE u.role_id = r.id) AS assigned_count,
              EXISTS (
                SELECT 1 FROM access_role_permissions rp2
                JOIN permissions p ON p.id = rp2.permission_id
                WHERE rp2.role_id = r.id AND p.clinic_scoped
              ) AS scopes_clinics
       FROM access_roles r
       LEFT JOIN access_role_permissions rp ON rp.role_id = r.id
       WHERE r.deleted_at IS NULL
       GROUP BY r.id
       ORDER BY r.name`,
    );
    return result.rows;
  });

  app.get("/api/roles/:id", { preHandler: authenticate }, async (request) => {
    await assertCan(pool, request, { resource: "role", action: "view" });
    const role = await findRole(pool, (request.params as { id: string }).id);
    if (!role) throw new ApplicationError(404, "not_found", "Role was not found");
    return role;
  });

  app.post("/api/roles", { preHandler: authenticate }, async (request, reply) => {
    await assertCan(pool, request, { resource: "role", action: "create" });
    const body = parse(roleSchema, request.body);
    await assertPermissions(pool, body.permission_ids);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query<{ id: string }>(
        "INSERT INTO access_roles (name, description) VALUES ($1, $2) RETURNING id",
        [body.name, body.description],
      );
      const createdId = created.rows[0]?.id;
      if (!createdId) throw new ApplicationError(500, "insert_failed", "The role could not be saved");
      await writePermissions(client, createdId, body.permission_ids);
      await client.query("COMMIT");
      return reply.status(201).send(await findRole(pool, createdId));
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUnique(error)) throw new ApplicationError(409, "name_taken", "A role with this name already exists");
      throw error;
    } finally {
      client.release();
    }
  });

  app.patch("/api/roles/:id", { preHandler: authenticate }, async (request) => {
    await assertCan(pool, request, { resource: "role", action: "update" });
    const { id } = request.params as { id: string };
    const previous = await findRole(pool, id);
    if (!previous) throw new ApplicationError(404, "not_found", "Role was not found");
    const body = parse(roleSchema, request.body);
    await assertPermissions(pool, body.permission_ids);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE access_roles SET name = $2, description = $3, updated_at = now() WHERE id = $1 AND deleted_at IS NULL", [id, body.name, body.description]);
      await client.query("DELETE FROM access_role_permissions WHERE role_id = $1", [id]);
      await writePermissions(client, id, body.permission_ids);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUnique(error)) throw new ApplicationError(409, "name_taken", "A role with this name already exists");
      throw error;
    } finally {
      client.release();
    }
    const saved = await findRole(pool, id);
    const beforePermissions = Array.isArray(previous.permission_ids) ? previous.permission_ids : [];
    noteActivity(request, {
      changes: [
        changed("Name", previous.name, body.name),
        changed("Description", previous.description, body.description),
        changed("Permissions", permissionList(beforePermissions), permissionList(body.permission_ids)),
      ].filter((item) => item !== null),
    });
    return saved;
  });

  app.delete("/api/roles/:id", { preHandler: authenticate }, async (request, reply) => {
    await assertCan(pool, request, { resource: "role", action: "delete" });
    const { id } = request.params as { id: string };
    if (!await findRole(pool, id)) throw new ApplicationError(404, "not_found", "Role was not found");
    const assigned = await pool.query(
      `SELECT a.id FROM user_access_roles a
       JOIN users u ON u.id = a.user_id
       WHERE a.role_id = $1 AND u.deleted_at IS NULL
       LIMIT 1`,
      [id],
    );
    if ((assigned.rowCount ?? 0) > 0) throw new ApplicationError(422, "role_in_use", "Remove this role from every user before deleting it");
    await pool.query("UPDATE access_roles SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
    return reply.status(204).send();
  });
}

function canReadCatalog(access: Awaited<ReturnType<typeof loadAccess>>) {
  return canReadRoles(access) || access.summary.user.create.level !== "none" || access.summary.user.update.level !== "none";
}

function canReadRoles(access: Awaited<ReturnType<typeof loadAccess>>) {
  return access.summary.role.view.level !== "none";
}

async function findRole(pool: pg.Pool, id: string) {
  const result = await pool.query(
    `SELECT r.id, r.name, r.description, r.created_at, r.updated_at,
            COALESCE(array_agg(rp.permission_id ORDER BY rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') AS permission_ids,
            (SELECT count(*)::int FROM user_access_roles u WHERE u.role_id = r.id) AS assigned_count,
            EXISTS (
              SELECT 1 FROM access_role_permissions rp2
              JOIN permissions p ON p.id = rp2.permission_id
              WHERE rp2.role_id = r.id AND p.clinic_scoped
            ) AS scopes_clinics
     FROM access_roles r
     LEFT JOIN access_role_permissions rp ON rp.role_id = r.id
     WHERE r.id = $1 AND r.deleted_at IS NULL
     GROUP BY r.id`,
    [id],
  );
  return result.rows[0];
}

async function assertPermissions(pool: pg.Pool, ids: string[]) {
  const unique = [...new Set(ids)];
  const result = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM permissions WHERE id = ANY($1::text[])", [unique]);
  if (result.rows[0]?.count !== unique.length) throw new ApplicationError(422, "unknown_permission", "Choose a permission that exists");
}

async function writePermissions(client: pg.PoolClient, roleId: string, ids: string[]) {
  for (const permissionId of [...new Set(ids)]) {
    await client.query("INSERT INTO access_role_permissions (role_id, permission_id) VALUES ($1, $2)", [roleId, permissionId]);
  }
}

function isUnique(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function permissionList(ids: string[]) {
  return [...new Set(ids)].map(permissionLabel).sort().join(", ");
}
