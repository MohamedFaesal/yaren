import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import { changed, noteActivity } from "./activity.js";

const priceSchema = z.number().min(0, "Enter a price of 0 or more").max(9_999_999_999.99).refine(
  (value) => Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
  "Use up to two decimal places",
);

const descriptionSchema = z.string().trim().max(500, "Description must be 500 characters or fewer").nullish().transform((value) => {
  if (value === undefined) return undefined;
  return value || null;
});

const serviceTypes = [
  "Professional Services",
  "Administrative & Coordination Services",
  "Medical Procedures Services",
  "Surgical Procedures Services",
  "Investigations [Laboratory & Imaging] Services",
  "Others",
] as const;
const serviceTypeSchema = z.enum(serviceTypes, { error: "Choose a service type" });

const categorySchema = z.string().trim().min(1, "Enter a category").max(80);
const unitSchema = z.string().trim().min(1, "Enter a unit").max(40);
const codeSchema = z.string().trim().min(1, "Enter a service code").max(32);

const createSchema = z.object({
  name: z.string().trim().min(1, "Enter the service name").max(160),
  description: descriptionSchema,
  service_type: serviceTypeSchema,
  category: categorySchema,
  unit: unitSchema,
  code: codeSchema,
  price: priceSchema,
});

const updateSchema = z.object({
  clinic_id: z.union([z.string().uuid(), z.null()]).optional(),
  name: z.string().trim().min(1, "Enter the service name").max(160).optional(),
  description: descriptionSchema,
  service_type: serviceTypeSchema.optional(),
  category: categorySchema.optional(),
  unit: unitSchema.optional(),
  code: codeSchema.optional(),
  price: priceSchema,
});

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  service_type: string;
  category: string;
  unit: string;
  code: string;
  shared_price: string;
  clinic_price: string | null;
};

export function registerServices(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/services", { preHandler: authenticate }, async (request) => {
    const query = readListQuery(request.query);
    const values: unknown[] = [];
    const clauses = ["s.deleted_at IS NULL"];
    let clinicJoin = "FALSE";
    if (query.clinicId) {
      values.push(query.clinicId);
      clinicJoin = `csp.clinic_id = $${values.length}`;
    }
    if (query.serviceTypes.length > 0) {
      values.push(query.serviceTypes);
      clauses.push(`s.service_type = ANY($${values.length}::text[])`);
    }
    if (query.category) {
      values.push(query.category);
      clauses.push(`s.category = $${values.length}`);
    }
    if (query.q) {
      values.push(`%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
      clauses.push(`(
        s.name ILIKE $${values.length} ESCAPE '\\'
        OR s.code ILIKE $${values.length} ESCAPE '\\'
        OR s.service_type ILIKE $${values.length} ESCAPE '\\'
        OR s.category ILIKE $${values.length} ESCAPE '\\'
        OR s.unit ILIKE $${values.length} ESCAPE '\\'
        OR COALESCE(s.description, '') ILIKE $${values.length} ESCAPE '\\'
      )`);
    }
    const result = await pool.query<ServiceRow>(
      `SELECT s.id, s.name, s.description, s.service_type, s.category, s.unit, s.code,
              s.price AS shared_price, csp.price AS clinic_price
       FROM medical_services s
       LEFT JOIN clinic_service_prices csp ON csp.service_id = s.id AND ${clinicJoin}
       WHERE ${clauses.join(" AND ")}
       ORDER BY s.position ASC, lower(s.name) ASC`,
      values,
    );
    const categories = await pool.query<{ category: string }>(
      `SELECT DISTINCT category
       FROM medical_services
       WHERE deleted_at IS NULL
       ORDER BY category ASC`,
    );
    const units = await pool.query<{ unit: string }>(
      `SELECT DISTINCT unit
       FROM medical_services
       WHERE deleted_at IS NULL
       ORDER BY unit ASC`,
    );
    return {
      items: result.rows.map((row) => present(row)),
      service_types: [...serviceTypes],
      categories: categories.rows.map((row) => row.category),
      units: units.rows.map((row) => row.unit),
    };
  });

  app.post("/api/services", { preHandler: authenticate }, async (request, reply) => {
    assertManager(request.user.type);
    const body = parse(createSchema, request.body);
    const price = money(body.price);
    try {
      const created = await pool.query<{ id: string }>(
        `INSERT INTO medical_services (name, description, service_type, category, unit, code, price, position, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT COALESCE(MAX(position), 0) + 1 FROM medical_services), $8)
         RETURNING id`,
        [body.name, body.description, body.service_type, body.category, body.unit, body.code, price, request.user.sub],
      );
      const id = created.rows[0]?.id;
      if (!id) throw new ApplicationError(500, "internal_error", "Unexpected server error");
      noteActivity(request, {
        entity: "service",
        entityId: id,
        summary: `Added professional service ${body.name}`,
        changes: [
          changed("Name", null, body.name),
          changed("Type", null, body.service_type),
          changed("Category", null, body.category),
          changed("Unit", null, body.unit),
          changed("Code", null, body.code),
          changed("Description", null, body.description),
          changed("Price", null, formatPrice(price)),
        ].filter((item) => item !== null),
      });
      const row = await findService(pool, id, null);
      return reply.status(201).send(row);
    } catch (error) {
      if (isUnique(error)) throw new ApplicationError(409, "name_taken", "A service with this name already exists");
      throw error;
    }
  });

  app.patch("/api/services/:id", { preHandler: authenticate }, async (request) => {
    assertManager(request.user.type);
    const id = readId(request.params);
    const body = parse(updateSchema, request.body);
    const clinicId = body.clinic_id ?? null;
    const price = money(body.price);
    const current = await findService(pool, id, clinicId);
    if (!current) throw new ApplicationError(404, "not_found", "Service was not found");

    if (clinicId) {
      await assertClinic(pool, clinicId);
      const description = body.description === undefined ? current.description : body.description;
      await pool.query(
        `INSERT INTO clinic_service_prices (service_id, clinic_id, price, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (service_id, clinic_id) DO UPDATE
         SET price = EXCLUDED.price, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [id, clinicId, price, request.user.sub],
      );
      await pool.query(
        `UPDATE medical_services
         SET description = $2, updated_at = now(), updated_by = $3
         WHERE id = $1 AND deleted_at IS NULL`,
        [id, description, request.user.sub],
      );
      const clinic = await clinicName(pool, clinicId);
      noteActivity(request, {
        entity: "service",
        entityId: id,
        summary: `Updated the price of ${current.name} for ${clinic.name}`,
        changes: [
          changed("Description", current.description, description),
          changed("Price", formatPrice(current.price), formatPrice(price)),
        ].filter((item) => item !== null),
      });
      return findService(pool, id, clinicId);
    }

    const name = body.name ?? current.name;
    const description = body.description === undefined ? current.description : body.description;
    const serviceType = body.service_type ?? current.service_type;
    const category = body.category ?? current.category;
    const unit = body.unit ?? current.unit;
    const code = body.code ?? current.code;
    try {
      await pool.query(
        `UPDATE medical_services
         SET name = $2, description = $3, service_type = $4, category = $5, unit = $6, code = $7,
             price = $8, updated_at = now(), updated_by = $9
         WHERE id = $1 AND deleted_at IS NULL`,
        [id, name, description, serviceType, category, unit, code, price, request.user.sub],
      );
    } catch (error) {
      if (isUnique(error)) throw new ApplicationError(409, "name_taken", "A service with this name already exists");
      throw error;
    }
    noteActivity(request, {
      entity: "service",
      entityId: id,
      summary: `Updated professional service ${name}`,
      changes: [
        changed("Name", current.name, name),
        changed("Type", current.service_type, serviceType),
        changed("Category", current.category, category),
        changed("Unit", current.unit, unit),
        changed("Code", current.code, code),
        changed("Description", current.description, description),
        changed("Price", formatPrice(current.shared_price), formatPrice(price)),
      ].filter((item) => item !== null),
    });
    return findService(pool, id, null);
  });

  app.delete("/api/services/:id", { preHandler: authenticate }, async (request, reply) => {
    assertManager(request.user.type);
    const id = readId(request.params);
    const current = await findService(pool, id, null);
    if (!current) throw new ApplicationError(404, "not_found", "Service was not found");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM clinic_service_prices WHERE service_id = $1", [id]);
      await client.query(
        `UPDATE medical_services
         SET deleted_at = now(), updated_at = now(), updated_by = $2
         WHERE id = $1 AND deleted_at IS NULL`,
        [id, request.user.sub],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    noteActivity(request, {
      entity: "service",
      entityId: id,
      summary: `Removed professional service ${current.name}`,
    });
    return reply.status(204).send();
  });

  app.delete("/api/services/:id/clinics/:clinicId", { preHandler: authenticate }, async (request, reply) => {
    assertManager(request.user.type);
    const { id, clinicId } = request.params as { id: string; clinicId: string };
    if (!z.string().uuid().safeParse(id).success) throw new ApplicationError(404, "not_found", "Service was not found");
    if (!z.string().uuid().safeParse(clinicId).success) throw new ApplicationError(404, "not_found", "Clinic was not found");
    const current = await findService(pool, id, clinicId);
    if (!current) throw new ApplicationError(404, "not_found", "Service was not found");
    const clinic = await clinicName(pool, clinicId);
    const removed = await pool.query(
      "DELETE FROM clinic_service_prices WHERE service_id = $1 AND clinic_id = $2",
      [id, clinicId],
    );
    if ((removed.rowCount ?? 0) > 0) {
      noteActivity(request, {
        entity: "service",
        entityId: id,
        summary: `${current.name} at ${clinic.name} now uses the shared price`,
        changes: [changed("Price", formatPrice(current.price), formatPrice(current.shared_price))].filter((item) => item !== null),
      });
    }
    return reply.status(204).send();
  });
}

function present(row: ServiceRow) {
  const shared = Number(row.shared_price);
  const clinic = row.clinic_price == null ? null : Number(row.clinic_price);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    service_type: row.service_type,
    category: row.category,
    unit: row.unit,
    code: row.code,
    shared_price: shared,
    clinic_price: clinic,
    price: clinic ?? shared,
  };
}

function readListQuery(query: unknown) {
  const source = query !== null && typeof query === "object" ? query as Record<string, unknown> : {};
  const text = (key: string) => (typeof source[key] === "string" ? source[key].trim() : "");
  const q = text("q");
  const clinicId = text("clinic_id");
  const category = text("category");
  const serviceTypesQuery = text("service_type").split(",").map((item) => item.trim()).filter(Boolean);
  if (q.length > 200) throw new ApplicationError(422, "invalid_query", "Search is too long");
  if (category.length > 80) throw new ApplicationError(422, "invalid_query", "Unknown category");
  if (serviceTypesQuery.some((item) => !serviceTypes.includes(item as (typeof serviceTypes)[number]))) {
    throw new ApplicationError(422, "invalid_query", "Unknown service type");
  }
  if (clinicId && !z.string().uuid().safeParse(clinicId).success) throw new ApplicationError(422, "invalid_query", "Unknown clinic");
  return { q, clinicId: clinicId || null, category: category || null, serviceTypes: serviceTypesQuery };
}

function readId(params: unknown) {
  const id = params !== null && typeof params === "object" && "id" in params ? String((params as { id: unknown }).id) : "";
  if (!z.string().uuid().safeParse(id).success) throw new ApplicationError(404, "not_found", "Service was not found");
  return id;
}

async function findService(pool: pg.Pool, id: string, clinicId: string | null) {
  const result = await pool.query<ServiceRow>(
    `SELECT s.id, s.name, s.description, s.service_type, s.category, s.unit, s.code, s.price AS shared_price, csp.price AS clinic_price
     FROM medical_services s
     LEFT JOIN clinic_service_prices csp ON csp.service_id = s.id AND csp.clinic_id = $2
     WHERE s.id = $1 AND s.deleted_at IS NULL`,
    [id, clinicId],
  );
  const row = result.rows[0];
  return row ? present(row) : undefined;
}

async function assertClinic(pool: pg.Pool, clinicId: string) {
  const result = await pool.query("SELECT id FROM clinics WHERE id = $1 AND deleted_at IS NULL", [clinicId]);
  if (!result.rows[0]) throw new ApplicationError(422, "unknown_clinic", "Choose a clinic that exists");
}

async function clinicName(pool: pg.Pool, clinicId: string) {
  const result = await pool.query<{ name: string }>("SELECT name FROM clinics WHERE id = $1 AND deleted_at IS NULL", [clinicId]);
  const clinic = result.rows[0];
  if (!clinic) throw new ApplicationError(404, "not_found", "Clinic was not found");
  return clinic;
}

function assertManager(type: string) {
  if (type !== "super-admin" && type !== "admin") {
    throw new ApplicationError(403, "forbidden", "You do not have permission to do that");
  }
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function formatPrice(value: number) {
  return value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isUnique(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}
