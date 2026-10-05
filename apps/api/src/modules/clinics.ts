import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import { assertCan, assertCreateClinic, canList, loadAccess, viewWhere, visitClinicOptionsWhere, workspaceClinicOptionsWhere } from "../permissions.js";
import { changed, noteActivity } from "./activity.js";

const clinicSchema = z.object({
  name: z.string().trim().min(1),
  hotel_id: z.string().uuid(),
});

const columns = `c.id, c.name, c.hotel_id, h.name AS hotel_name,
  h.location->>'city' AS city, h.location->>'area' AS area,
  (h.location->>'lat')::float8 AS lat, (h.location->>'lng')::float8 AS lng,
  c.added_by, u.name AS added_by_name, c.created_at, c.updated_at, c.deleted_at`;

export function registerClinics(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/clinics", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    const purpose = typeof (request.query as { for?: unknown }).for === "string"
      ? (request.query as { for: string }).for
      : "";
    const workspace = purpose === "workspace" ? workspaceClinicOptionsWhere(access) : null;
    const where = purpose === "visit"
      ? visitClinicOptionsWhere(access)
      : purpose === "workspace"
        ? workspace
        : canList(access, "clinic")
          ? viewWhere(access, request.user.sub, "clinic", { owner: "c.added_by", clinic: "c.id" })
          : null;
    if (!where) {
      throw new ApplicationError(
        403,
        "forbidden",
        purpose === "visit"
          ? "You cannot register visits"
          : purpose === "workspace"
            ? "You do not have clinic access"
            : "You cannot view clinics",
      );
    }
    const orderBy = purpose === "visit" || purpose === "workspace" ? "c.name ASC, h.name ASC" : "c.created_at DESC";
    const result = await pool.query(
      `SELECT ${columns}
       FROM clinics c
       JOIN hotels h ON h.id = c.hotel_id
       JOIN users u ON u.id = c.added_by
       WHERE c.deleted_at IS NULL AND ${where.sql}
       ORDER BY ${orderBy}`,
      where.params,
    );
    if (purpose === "workspace") {
      return { items: result.rows, all_clinics: workspace?.allClinics ?? false };
    }
    return result.rows;
  });

  app.get("/api/clinics/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await pool.query(
      `SELECT ${columns}
       FROM clinics c
       JOIN hotels h ON h.id = c.hotel_id
       JOIN users u ON u.id = c.added_by
       WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [id],
    );
    const row = result.rows[0] as { added_by: string } | undefined;
    if (!row) throw new ApplicationError(404, "not_found", "Clinic was not found");
    await assertCan(pool, request, { resource: "clinic", action: "view", ownerId: row.added_by, clinicId: id });
    return row;
  });

  app.post("/api/clinics", { preHandler: authenticate }, async (request, reply) => {
    const body = parse(clinicSchema, request.body);
    await assertHotel(pool, body.hotel_id);
    const access = await loadAccess(pool, request.user);
    await assertCreateClinic(pool, access, body.hotel_id);
    const result = await pool.query(
      `INSERT INTO clinics (name, hotel_id, added_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, hotel_id, added_by, created_at, updated_at, deleted_at`,
      [body.name, body.hotel_id, request.user.sub],
    );
    const row = result.rows[0] as { hotel_id: string; added_by: string };
    const place = await hotelPlace(pool, row.hotel_id);
    return reply.status(201).send({
      ...row,
      ...place,
      added_by_name: await nameOf(pool, row.added_by),
    });
  });

  app.patch("/api/clinics/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(clinicSchema, request.body);
    await assertHotel(pool, body.hotel_id);
    const current = await pool.query<{ added_by: string; name: string; hotel_id: string; hotel_name: string }>(
      `SELECT c.added_by, c.name, c.hotel_id, h.name AS hotel_name
       FROM clinics c JOIN hotels h ON h.id = c.hotel_id
       WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [id],
    );
    const previous = current.rows[0];
    if (!previous) throw new ApplicationError(404, "not_found", "Clinic was not found");
    await assertCan(pool, request, { resource: "clinic", action: "update", ownerId: previous.added_by, clinicId: id });
    const result = await pool.query(
      `UPDATE clinics SET name = $2, hotel_id = $3, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, name, hotel_id, added_by, created_at, updated_at, deleted_at`,
      [id, body.name, body.hotel_id],
    );
    const row = result.rows[0] as { hotel_id: string; added_by: string };
    const place = await hotelPlace(pool, row.hotel_id);
    noteActivity(request, {
      changes: [
        changed("Name", previous.name, body.name),
        changed("Hotel", previous.hotel_name, place.hotel_name),
      ].filter((item) => item !== null),
    });
    return {
      ...row,
      ...place,
      added_by_name: await nameOf(pool, row.added_by),
    };
  });

  app.delete("/api/clinics/:id", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = await pool.query<{ added_by: string }>("SELECT added_by FROM clinics WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (!current.rows[0]) throw new ApplicationError(404, "not_found", "Clinic was not found");
    await assertCan(pool, request, { resource: "clinic", action: "delete", ownerId: current.rows[0].added_by, clinicId: id });
    await pool.query("UPDATE clinics SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
    return reply.status(204).send();
  });
}

async function assertHotel(pool: pg.Pool, id: string) {
  const result = await pool.query("SELECT id FROM hotels WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!result.rows[0]) throw new ApplicationError(422, "hotel_missing", "Choose an existing hotel");
}

async function hotelPlace(pool: pg.Pool, id: string) {
  const result = await pool.query(
    `SELECT name AS hotel_name, location->>'city' AS city, location->>'area' AS area,
            (location->>'lat')::float8 AS lat, (location->>'lng')::float8 AS lng
     FROM hotels WHERE id = $1`,
    [id],
  );
  return result.rows[0] as { hotel_name: string; city: string; area: string; lat: number; lng: number };
}

async function nameOf(pool: pg.Pool, id: string) {
  const result = await pool.query("SELECT name FROM users WHERE id = $1", [id]);
  return result.rows[0]?.name ?? "";
}
