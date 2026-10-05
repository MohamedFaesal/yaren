import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import { findTourismArea, findTourismCity } from "./tourism.js";
import { assertCan, canList, loadAccess, viewWhere } from "../permissions.js";
import { changed, noteActivity } from "./activity.js";

const locationSchema = z.object({
  city: z.string().trim().min(1),
  area: z.string().trim().min(1),
  lat: z.number(),
  lng: z.number(),
});

const hotelSchema = z.object({
  name: z.string().trim().min(1),
  location: locationSchema,
});

const columns = `h.id, h.name, h.location, h.added_by, u.name AS added_by_name, h.created_at, h.updated_at, h.deleted_at`;

export function registerHotels(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/hotels", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    if (!canList(access, "hotel")) throw new ApplicationError(403, "forbidden", "You cannot view hotels");
    const where = viewWhere(access, request.user.sub, "hotel", { owner: "h.added_by" });
    const result = await pool.query(
      `SELECT ${columns}
       FROM hotels h JOIN users u ON u.id = h.added_by
       WHERE h.deleted_at IS NULL AND ${where.sql}
       ORDER BY h.created_at DESC`,
      where.params,
    );
    return result.rows;
  });

  app.get("/api/hotels/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await pool.query(
      `SELECT ${columns} FROM hotels h JOIN users u ON u.id = h.added_by WHERE h.id = $1 AND h.deleted_at IS NULL`,
      [id],
    );
    const row = result.rows[0] as { added_by: string } | undefined;
    if (!row) throw new ApplicationError(404, "not_found", "Hotel was not found");
    await assertCan(pool, request, { resource: "hotel", action: "view", ownerId: row.added_by });
    return row;
  });

  app.post("/api/hotels", { preHandler: authenticate }, async (request, reply) => {
    await assertCan(pool, request, { resource: "hotel", action: "create" });
    const body = parse(hotelSchema, request.body);
    assertTourismLocation(body.location);
    const result = await pool.query(
      `INSERT INTO hotels (name, location, added_by)
       VALUES ($1, $2::jsonb, $3)
       RETURNING id, name, location, added_by, created_at, updated_at, deleted_at`,
      [body.name, JSON.stringify(body.location), request.user.sub],
    );
    const row = result.rows[0];
    return reply.status(201).send({ ...row, added_by_name: await actorName(pool, request.user.sub) });
  });

  app.patch("/api/hotels/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(hotelSchema, request.body);
    assertTourismLocation(body.location);
    const current = await pool.query<{ added_by: string; name: string; location: { city?: string; area?: string; lat?: number; lng?: number } | string }>(
      "SELECT added_by, name, location FROM hotels WHERE id = $1 AND deleted_at IS NULL",
      [id],
    );
    const previous = current.rows[0];
    if (!previous) throw new ApplicationError(404, "not_found", "Hotel was not found");
    await assertCan(pool, request, { resource: "hotel", action: "update", ownerId: previous.added_by });
    const result = await pool.query(
      `UPDATE hotels SET name = $2, location = $3::jsonb, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, name, location, added_by, created_at, updated_at, deleted_at`,
      [id, body.name, JSON.stringify(body.location)],
    );
    const row = result.rows[0] as { added_by: string };
    const place = locationOf(previous.location);
    noteActivity(request, {
      changes: [
        changed("Name", previous.name, body.name),
        changed("City", place.city, body.location.city),
        changed("Area", place.area, body.location.area),
        changed("Map pin", pin(place.lat, place.lng), pin(body.location.lat, body.location.lng)),
      ].filter((item) => item !== null),
    });
    return { ...row, added_by_name: await actorName(pool, row.added_by) };
  });

  app.delete("/api/hotels/:id", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = await pool.query<{ added_by: string }>("SELECT added_by FROM hotels WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (!current.rows[0]) throw new ApplicationError(404, "not_found", "Hotel was not found");
    await assertCan(pool, request, { resource: "hotel", action: "delete", ownerId: current.rows[0].added_by });
    const clinics = await pool.query("SELECT id FROM clinics WHERE hotel_id = $1 AND deleted_at IS NULL LIMIT 1", [id]);
    if ((clinics.rowCount ?? 0) > 0) throw new ApplicationError(422, "hotel_has_clinics", "This hotel still has clinics");
    await pool.query("UPDATE hotels SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
    return reply.status(204).send();
  });
}

function locationOf(value: { city?: string; area?: string; lat?: number; lng?: number } | string) {
  const location = typeof value === "string" ? JSON.parse(value) as { city?: string; area?: string; lat?: number; lng?: number } : value;
  return { city: location.city ?? "", area: location.area ?? "", lat: Number(location.lat), lng: Number(location.lng) };
}

function pin(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Empty";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function assertTourismLocation(location: { city: string; area: string; lat: number; lng: number }) {
  const city = findTourismCity(location.city);
  if (!city) throw new ApplicationError(422, "unknown_city", "Choose a tourism city from the list");
  const area = findTourismArea(location.city, location.area);
  if (!area) throw new ApplicationError(422, "unknown_area", "Choose an area that belongs to this city");
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    throw new ApplicationError(422, "invalid_pin", "Place the hotel on the map");
  }
}

async function actorName(pool: pg.Pool, id: string) {
  const result = await pool.query("SELECT name FROM users WHERE id = $1", [id]);
  return result.rows[0]?.name ?? "";
}
