import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import { changed, noteActivity } from "./activity.js";

const optionalPrice = z.number().min(0, "Enter a price of 0 or more").max(9_999_999_999.99).refine(
  (value) => Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
  "Use up to two decimal places",
).nullable().optional();

const descriptionSchema = z.string().trim().max(500, "Description must be 500 characters or fewer").nullish().transform((value) => {
  if (value === undefined) return undefined;
  return value || null;
});

const serviceTypes = [
  "Professional Services",
  "Administrative, Coordination and Other Services",
  "Procedures & Interventions Services",
  "Investigations [Laboratory & Imaging] Services",
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
  unit_price_egp: optionalPrice,
  unit_price_eur: optionalPrice,
});

const updateSchema = z.object({
  clinic_id: z.union([z.string().uuid(), z.null()]).optional(),
  name: z.string().trim().min(1, "Enter the service name").max(160).optional(),
  description: descriptionSchema,
  service_type: serviceTypeSchema.optional(),
  category: categorySchema.optional(),
  unit: unitSchema.optional(),
  code: codeSchema.optional(),
  unit_price_egp: optionalPrice,
  unit_price_eur: optionalPrice,
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
  unit_price_egp: string | null;
  unit_price_eur: string | null;
};

export function registerServices(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/services", { preHandler: authenticate }, async (request) => {
    const query = readListQuery(request.query);
    const values: unknown[] = [];
    const clauses = ["s.deleted_at IS NULL"];
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
              s.price AS shared_price, NULL::numeric AS clinic_price, s.unit_price_egp, s.unit_price_eur
       FROM medical_services s
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
    const priceEgp = money(body.unit_price_egp);
    const priceEur = money(body.unit_price_eur);
    const price = priceEur ?? priceEgp ?? 0;
    try {
      const created = await pool.query<{ id: string }>(
        `INSERT INTO medical_services (name, description, service_type, category, unit, code, price, unit_price_egp, unit_price_eur, position, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT COALESCE(MAX(position), 0) + 1 FROM medical_services), $10)
         RETURNING id`,
        [body.name, body.description, body.service_type, body.category, body.unit, body.code, price, priceEgp, priceEur, request.user.sub],
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
          changed("Unit price (EGP)", null, formatMoney(priceEgp)),
          changed("Unit price (EUR)", null, formatMoney(priceEur)),
        ].filter((item) => item !== null),
      });
      const row = await findService(pool, id);
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
    const current = await findService(pool, id);
    if (!current) throw new ApplicationError(404, "not_found", "Service was not found");

    const name = body.name ?? current.name;
    const description = body.description === undefined ? current.description : body.description;
    const serviceType = body.service_type ?? current.service_type;
    const category = body.category ?? current.category;
    const unit = body.unit ?? current.unit;
    const code = body.code ?? current.code;
    const priceEgp = body.unit_price_egp === undefined ? current.unit_price_egp : body.unit_price_egp;
    const priceEur = body.unit_price_eur === undefined ? current.unit_price_eur : body.unit_price_eur;
    const price = priceEur ?? priceEgp ?? 0;
    try {
      await pool.query(
        `UPDATE medical_services
         SET name = $2, description = $3, service_type = $4, category = $5, unit = $6, code = $7,
             price = $8, unit_price_egp = $9, unit_price_eur = $10, updated_at = now(), updated_by = $11
         WHERE id = $1 AND deleted_at IS NULL`,
        [id, name, description, serviceType, category, unit, code, price, priceEgp, priceEur, request.user.sub],
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
        changed("Unit price (EGP)", formatMoney(current.unit_price_egp), formatMoney(priceEgp)),
        changed("Unit price (EUR)", formatMoney(current.unit_price_eur), formatMoney(priceEur)),
      ].filter((item) => item !== null),
    });
    return findService(pool, id);
  });

  app.delete("/api/services/:id", { preHandler: authenticate }, async (request, reply) => {
    assertManager(request.user.type);
    const id = readId(request.params);
    const current = await findService(pool, id);
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
}

function present(row: ServiceRow) {
  const shared = Number(row.shared_price);
  const unitPriceEgp = moneyOrNull(row.unit_price_egp);
  const unitPriceEur = moneyOrNull(row.unit_price_eur);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    service_type: row.service_type,
    category: row.category,
    unit: row.unit,
    code: row.code,
    shared_price: shared,
    clinic_price: null,
    price: unitPriceEur ?? unitPriceEgp ?? shared,
    unit_price_egp: unitPriceEgp,
    unit_price_eur: unitPriceEur,
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

async function findService(pool: pg.Pool, id: string) {
  const result = await pool.query<ServiceRow>(
    `SELECT s.id, s.name, s.description, s.service_type, s.category, s.unit, s.code, s.price AS shared_price, NULL::numeric AS clinic_price,
            s.unit_price_egp, s.unit_price_eur
     FROM medical_services s
     WHERE s.id = $1 AND s.deleted_at IS NULL`,
    [id],
  );
  const row = result.rows[0];
  return row ? present(row) : undefined;
}

function assertManager(type: string) {
  if (type !== "super-admin" && type !== "admin") {
    throw new ApplicationError(403, "forbidden", "You do not have permission to do that");
  }
}

function money(value: number | null | undefined) {
  return value == null ? null : Math.round(value * 100) / 100;
}

function moneyOrNull(value: string | null) {
  return value == null ? null : Number(value);
}

function formatMoney(value: number | null) {
  return value == null ? null : formatPrice(value);
}

function formatPrice(value: number) {
  return value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isUnique(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}
