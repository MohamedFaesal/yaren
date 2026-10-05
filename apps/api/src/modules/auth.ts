import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse, type Actor } from "../http.js";
import { hashPassword, verifyPassword } from "../password.js";
import type { Env } from "../env.js";
import { loadAccess } from "../permissions.js";
import { photoUrl, removeUpload, saveAvatar } from "../uploads.js";
import { changed, noteActivity } from "./activity.js";

const columns = `id, name, email, phone, type, role, is_active, created_by, created_at, updated_at, deleted_at,
  CASE WHEN photo_path IS NOT NULL THEN '/uploads/' || photo_path ELSE NULL END AS photo_url`;

const profileSchema = z.object({
  name: z.string().trim().min(1),
  password: z.string().min(8).optional(),
  current_password: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (value.password && !value.current_password) {
    context.addIssue({ code: "custom", message: "Enter your current password to set a new one", path: ["current_password"] });
  }
});

export function registerAuth(app: FastifyInstance, pool: pg.Pool) {
  app.post("/api/auth/login", async (request) => {
    const body = parse(z.object({ email: z.string().trim().email(), password: z.string().min(1) }), request.body);
    const result = await pool.query(
      `SELECT id, name, email, phone, type, role, is_active, created_by, created_at, updated_at, deleted_at, photo_path, password_hash
       FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
      [body.email],
    );
    const user = result.rows[0] as {
      id: string;
      name: string;
      type: string;
      role: string;
      is_active: boolean;
      photo_path: string | null;
      password_hash: string;
    } | undefined;
    const valid = user ? await verifyPassword(body.password, user.password_hash) : false;
    if (!user || !valid) throw new ApplicationError(401, "invalid_credentials", "Email or password is incorrect");
    if (!user.is_active) throw new ApplicationError(401, "inactive", "This account is inactive");
    const token = await app.jwt.sign({ sub: user.id, type: user.type as Actor["type"], role: user.role as Actor["role"] }, { expiresIn: "12h" });
    const { password_hash: _password, photo_path, ...safe } = user;
    noteActivity(request, { actorId: user.id, actorLabel: safe.name, summary: `Signed in as ${safe.name}` });
    return {
      token,
      user: {
        ...safe,
        photo_url: photoUrl(photo_path),
        access: await publicAccess(pool, { sub: user.id, type: user.type }),
      },
    };
  });

  app.post("/api/auth/logout", { preHandler: authenticate }, async (_request, reply) => {
    return reply.status(204).send();
  });

  app.get("/api/auth/me", { preHandler: authenticate }, async (request) => {
    const user = await findSelf(pool, request.user.sub);
    if (!user || !user.is_active) throw new ApplicationError(401, "unauthorized", "Sign in is required");
    return { ...user, access: await publicAccess(pool, request.user) };
  });

  app.patch("/api/auth/me", { preHandler: authenticate }, async (request) => {
    const body = parse(profileSchema, request.body);
    const current = await pool.query<{
      name: string;
      password_hash: string;
      is_active: boolean;
    }>("SELECT name, password_hash, is_active FROM users WHERE id = $1 AND deleted_at IS NULL", [request.user.sub]);
    const previous = current.rows[0];
    if (!previous || !previous.is_active) throw new ApplicationError(401, "unauthorized", "Sign in is required");

    let passwordHash: string | null = null;
    if (body.password) {
      const matches = await verifyPassword(body.current_password ?? "", previous.password_hash);
      if (!matches) throw new ApplicationError(422, "invalid_password", "Current password is incorrect");
      passwordHash = await hashPassword(body.password);
    }

    await pool.query(
      `UPDATE users
       SET name = $2, password_hash = COALESCE($3, password_hash), updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL`,
      [request.user.sub, body.name, passwordHash],
    );

    noteActivity(request, {
      changes: [
        changed("Name", previous.name, body.name),
        body.password ? changed("Password", "••••••••", "Updated") : null,
      ].filter((item) => item !== null),
      summary: "Updated their profile",
    });

    const user = await findSelf(pool, request.user.sub);
    if (!user) throw new ApplicationError(404, "not_found", "Account was not found");
    return { ...user, access: await publicAccess(pool, request.user) };
  });

  app.post("/api/auth/me/photo", { preHandler: authenticate }, async (request) => {
    const current = await pool.query<{ photo_path: string | null; is_active: boolean }>(
      "SELECT photo_path, is_active FROM users WHERE id = $1 AND deleted_at IS NULL",
      [request.user.sub],
    );
    const previous = current.rows[0];
    if (!previous || !previous.is_active) throw new ApplicationError(401, "unauthorized", "Sign in is required");
    const file = await request.file();
    if (!file) throw new ApplicationError(422, "photo_required", "Choose a photo to upload");
    const photoPath = await saveAvatar(request.user.sub, file, previous.photo_path);
    await pool.query("UPDATE users SET photo_path = $2, updated_at = now() WHERE id = $1 AND deleted_at IS NULL", [request.user.sub, photoPath]);
    noteActivity(request, { summary: "Updated their profile photo", changes: [changed("Photo", previous.photo_path ? "Set" : "Not set", "Updated")].filter((item) => item !== null) });
    const user = await findSelf(pool, request.user.sub);
    if (!user) throw new ApplicationError(404, "not_found", "Account was not found");
    return { ...user, access: await publicAccess(pool, request.user) };
  });

  app.delete("/api/auth/me/photo", { preHandler: authenticate }, async (request) => {
    const current = await pool.query<{ photo_path: string | null; is_active: boolean }>(
      "SELECT photo_path, is_active FROM users WHERE id = $1 AND deleted_at IS NULL",
      [request.user.sub],
    );
    const previous = current.rows[0];
    if (!previous || !previous.is_active) throw new ApplicationError(401, "unauthorized", "Sign in is required");
    await pool.query("UPDATE users SET photo_path = NULL, updated_at = now() WHERE id = $1 AND deleted_at IS NULL", [request.user.sub]);
    await removeUpload(previous.photo_path);
    noteActivity(request, { summary: "Removed their profile photo", changes: [changed("Photo", "Set", "Not set")].filter((item) => item !== null) });
    const user = await findSelf(pool, request.user.sub);
    if (!user) throw new ApplicationError(404, "not_found", "Account was not found");
    return { ...user, access: await publicAccess(pool, request.user) };
  });
}

async function findSelf(pool: pg.Pool, id: string) {
  const result = await pool.query(`SELECT ${columns} FROM users WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return result.rows[0] as { id: string; is_active: boolean; photo_url: string | null } | undefined;
}

async function publicAccess(pool: pg.Pool, actor: { sub: string; type: string }) {
  const access = await loadAccess(pool, actor);
  return { bypass: access.bypass, ...access.summary };
}

export async function seedSuperAdmin(pool: pg.Pool, env: Env) {
  const existing = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL", [env.SEED_SUPER_ADMIN_EMAIL]);
  if ((existing.rowCount ?? 0) > 0) return;
  await pool.query(
    `INSERT INTO users (name, email, phone, type, role, password_hash, is_active)
     VALUES ($1, $2, $3, 'super-admin', 'CEO', $4, true)`,
    [env.SEED_SUPER_ADMIN_NAME, env.SEED_SUPER_ADMIN_EMAIL.toLowerCase(), env.SEED_SUPER_ADMIN_PHONE, await hashPassword(env.SEED_SUPER_ADMIN_PASSWORD)],
  );
}
