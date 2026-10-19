import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import { changed, noteActivity } from "./activity.js";

const routes = ["IV Infusion / Drip", "IV Injection", "IM injection", "Oral", "SC injection", "Inhalation / Nebulization", "Topical"] as const;
const dosageForms = [
  "Tablet",
  "Capsule",
  "Chewable tablet",
  "Syrup",
  "Suspension",
  "Oral Drops",
  "Ampule",
  "Vial",
  "Prefilled Syringe",
  "Infusion Solution",
  "Infusion Concentrate",
  "Inhaler",
  "Nebule",
  "Cream",
  "Ointment",
  "Gel",
  "Lotion",
  "Spray",
  "Eye drops",
  "Eye ointment",
  "Ear drops",
  "Nasal drops",
  "Nasal spray",
  "Rectal Suppository",
  "Enema",
  "Vaginal Tablet",
  "Vaginal Cream",
  "Vaginal Pessary",
  "Patch",
  "Oral powder",
  "Sachet",
  "Mouthwash",
] as const;

const routeAssignmentSchema = z.object({
  route: z.enum(routes, { error: "Choose a route" }),
  service_ids: z.array(z.string().uuid()).max(30).optional().transform((value) => value ?? []),
});

const optionalPrice = z.number().min(0, "Enter a price of 0 or more").max(9_999_999_999.99).refine(
  (value) => Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
  "Use up to two decimal places",
).nullable().optional().transform((value) => value ?? null);

const medicationSchema = z.object({
  name: z.string().trim().min(1, "Enter the active ingredient").max(160),
  strength: z.string().trim().max(80).optional().transform((value) => value ?? ""),
  dosage_form: z.enum(dosageForms, { error: "Choose a dosage form" }),
  unit_price_egp: optionalPrice,
  unit_price_eur: optionalPrice,
  route: z.enum(routes).optional(),
  routes: z.array(routeAssignmentSchema).max(routes.length).optional(),
}).superRefine((value, context) => {
  const assigned = value.routes?.length ? value.routes : value.route ? [{ route: value.route, service_ids: [] }] : [];
  if (assigned.length === 0) {
    context.addIssue({ code: "custom", message: "Choose at least one route", path: ["routes"] });
  }
  const seen = new Set<string>();
  for (const item of assigned) {
    if (seen.has(item.route)) {
      context.addIssue({ code: "custom", message: "Each route can be chosen once", path: ["routes"] });
    }
    seen.add(item.route);
  }
}).transform((value) => {
  const assigned = value.routes?.length ? value.routes : [{ route: value.route!, service_ids: [] as string[] }];
  return {
    name: value.name,
    strength: value.strength,
    dosage_form: value.dosage_form,
    unit_price_egp: value.unit_price_egp,
    unit_price_eur: value.unit_price_eur,
    route: assigned[0]?.route ?? value.route!,
    routes: assigned.map((item) => ({ route: item.route, service_ids: [...new Set(item.service_ids)] })),
  };
});

type MedicationRow = {
  id: string;
  name: string;
  strength: string;
  dosage_form: string;
  route: string;
  unit_price_egp: string | null;
  unit_price_eur: string | null;
};

type MedicationRoute = {
  route: string;
  services: { id: string; name: string; code: string; unit: string; price: number | null; unit_price_egp: number | null; unit_price_eur: number | null }[];
};

export function registerMedications(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/medications", { preHandler: authenticate }, async (request) => {
    const query = readListQuery(request.query);
    const values: unknown[] = [];
    const clauses = ["deleted_at IS NULL"];
    if (query.dosageForm) {
      values.push(query.dosageForm);
      clauses.push(`dosage_form = $${values.length}`);
    }
    if (query.q) {
      values.push(`%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
      clauses.push(`(
        name ILIKE $${values.length} ESCAPE '\\'
        OR strength ILIKE $${values.length} ESCAPE '\\'
        OR dosage_form ILIKE $${values.length} ESCAPE '\\'
        OR route ILIKE $${values.length} ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM medication_routes mr
          WHERE mr.medication_id = medications.id AND mr.route ILIKE $${values.length} ESCAPE '\\'
        )
      )`);
    }
    const result = await pool.query<MedicationRow>(
      `SELECT id, name, strength, dosage_form, route, unit_price_egp, unit_price_eur
       FROM medications
       WHERE ${clauses.join(" AND ")}
       ORDER BY lower(name) ASC, lower(strength) ASC, dosage_form ASC`,
      values,
    );
    const routesByMedication = await loadRoutes(pool, result.rows.map((row) => row.id));
    return {
      items: result.rows.map((row) => present(row, routesByMedication.get(row.id) ?? [])),
      dosage_forms: [...dosageForms],
      routes: [...routes],
    };
  });

  app.post("/api/medications", { preHandler: authenticate }, async (request, reply) => {
    assertManager(request.user.type);
    const body = parse(medicationSchema, request.body);
    await assertProcedureServices(pool, body.routes.flatMap((item) => item.service_ids));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query<{ id: string }>(
        `INSERT INTO medications (name, strength, dosage_form, route, unit_price_egp, unit_price_eur, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [body.name, body.strength, body.dosage_form, body.route, body.unit_price_egp, body.unit_price_eur, request.user.sub],
      );
      const id = created.rows[0]?.id;
      if (!id) throw new ApplicationError(500, "internal_error", "Unexpected server error");
      await replaceRoutes(client, id, body.routes);
      await client.query("COMMIT");
      noteActivity(request, {
        entity: "medication",
        entityId: id,
        summary: `Added medication ${label(body)}`,
        changes: changes(null, body),
      });
      const row = await findMedication(pool, id);
      return reply.status(201).send(row);
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUnique(error)) throw new ApplicationError(409, "name_taken", "This medication, strength, and form already exists");
      throw error;
    } finally {
      client.release();
    }
  });

  app.patch("/api/medications/:id", { preHandler: authenticate }, async (request) => {
    assertManager(request.user.type);
    const id = readId(request.params);
    const body = parse(medicationSchema, request.body);
    const current = await findMedication(pool, id);
    if (!current) throw new ApplicationError(404, "not_found", "Medication was not found");
    await assertProcedureServices(pool, body.routes.flatMap((item) => item.service_ids));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE medications
         SET name = $2, strength = $3, dosage_form = $4, route = $5, unit_price_egp = $6, unit_price_eur = $7, updated_at = now(), updated_by = $8
         WHERE id = $1 AND deleted_at IS NULL`,
        [id, body.name, body.strength, body.dosage_form, body.route, body.unit_price_egp, body.unit_price_eur, request.user.sub],
      );
      await replaceRoutes(client, id, body.routes);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUnique(error)) throw new ApplicationError(409, "name_taken", "This medication, strength, and form already exists");
      throw error;
    } finally {
      client.release();
    }
    noteActivity(request, {
      entity: "medication",
      entityId: id,
      summary: `Updated medication ${label(body)}`,
      changes: changes(current, body),
    });
    return findMedication(pool, id);
  });

  app.delete("/api/medications/:id", { preHandler: authenticate }, async (request) => {
    assertManager(request.user.type);
    const id = readId(request.params);
    const current = await findMedication(pool, id);
    if (!current) throw new ApplicationError(404, "not_found", "Medication was not found");
    await pool.query(
      `UPDATE medications SET deleted_at = now(), updated_at = now(), updated_by = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [id, request.user.sub],
    );
    noteActivity(request, {
      entity: "medication",
      entityId: id,
      summary: `Removed medication ${label(current)}`,
      changes: [changed("Medication", label(current), null)].filter((item) => item !== null),
    });
    return { ok: true };
  });
}

async function findMedication(pool: pg.Pool, id: string) {
  const result = await pool.query<MedicationRow>(
    `SELECT id, name, strength, dosage_form, route, unit_price_egp, unit_price_eur FROM medications WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  const routesByMedication = await loadRoutes(pool, [id]);
  return present(row, routesByMedication.get(id) ?? []);
}

function present(row: MedicationRow, assigned: MedicationRoute[]) {
  const ordered = [...assigned].sort((left, right) => {
    if (left.route === row.route) return -1;
    if (right.route === row.route) return 1;
    return routes.indexOf(left.route as (typeof routes)[number]) - routes.indexOf(right.route as (typeof routes)[number]);
  });
  const routesForRow = ordered.length > 0 ? ordered : [{ route: row.route, services: [] }];
  return {
    ...row,
    unit_price_egp: money(row.unit_price_egp),
    unit_price_eur: money(row.unit_price_eur),
    route: row.route,
    routes: routesForRow,
  };
}

async function loadRoutes(db: pg.Pool | pg.PoolClient, medicationIds: string[]) {
  const grouped = new Map<string, MedicationRoute[]>();
  if (medicationIds.length === 0) return grouped;
  const result = await db.query<{
    medication_id: string;
    route: string;
    service_id: string | null;
    name: string | null;
    code: string | null;
    unit: string | null;
    price: string | null;
    unit_price_egp: string | null;
    unit_price_eur: string | null;
  }>(
    `SELECT mr.medication_id, mr.route, s.id AS service_id, s.name, s.code, s.unit, s.price, s.unit_price_egp, s.unit_price_eur
     FROM medication_routes mr
     LEFT JOIN medication_route_services mrs ON mrs.medication_route_id = mr.id
     LEFT JOIN medical_services s ON s.id = mrs.service_id AND s.deleted_at IS NULL
     WHERE mr.medication_id = ANY($1::uuid[])
     ORDER BY mr.route ASC, lower(s.name) ASC`,
    [medicationIds],
  );
  for (const row of result.rows) {
    const list = grouped.get(row.medication_id) ?? [];
    let assignment = list.find((item) => item.route === row.route);
    if (!assignment) {
      assignment = { route: row.route, services: [] };
      list.push(assignment);
      grouped.set(row.medication_id, list);
    }
    if (row.service_id && row.name && row.code) {
      assignment.services.push({
        id: row.service_id,
        name: row.name,
        code: row.code,
        unit: row.unit ?? "",
        price: row.unit_price_eur == null ? (row.price == null ? null : Number(row.price)) : Number(row.unit_price_eur),
        unit_price_egp: row.unit_price_egp == null ? null : Number(row.unit_price_egp),
        unit_price_eur: row.unit_price_eur == null ? null : Number(row.unit_price_eur),
      });
    }
  }
  return grouped;
}

async function replaceRoutes(
  db: pg.PoolClient,
  medicationId: string,
  assigned: { route: string; service_ids: string[] }[],
) {
  await db.query(`DELETE FROM medication_routes WHERE medication_id = $1`, [medicationId]);
  for (const item of assigned) {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO medication_routes (medication_id, route) VALUES ($1, $2) RETURNING id`,
      [medicationId, item.route],
    );
    const routeId = inserted.rows[0]?.id;
    if (!routeId) throw new ApplicationError(500, "internal_error", "Unexpected server error");
    for (const serviceId of item.service_ids) {
      await db.query(
        `INSERT INTO medication_route_services (medication_route_id, service_id) VALUES ($1, $2)`,
        [routeId, serviceId],
      );
    }
  }
}

async function assertProcedureServices(db: pg.Pool, serviceIds: string[]) {
  const ids = [...new Set(serviceIds)];
  if (ids.length === 0) return;
  const result = await db.query<{ id: string }>(
    `SELECT id FROM medical_services
     WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND service_type = 'Procedures & Interventions Services'`,
    [ids],
  );
  if (result.rows.length !== ids.length) {
    throw new ApplicationError(422, "invalid_body", "Choose a procedure or intervention");
  }
}

function label(row: { name: string; strength: string; dosage_form: string }) {
  return [row.name, row.strength, row.dosage_form].filter((part) => part.trim()).join(" ");
}

function changes(current: { name: string; strength: string; dosage_form: string; route: string; unit_price_egp: number | null; unit_price_eur: number | null; routes?: MedicationRoute[] } | null, next: z.infer<typeof medicationSchema>) {
  const previousRoutes = current?.routes?.map((item) => item.route).join(", ") || current?.route || null;
  return [
    changed("Active ingredient", current?.name ?? null, next.name),
    changed("Strength", current?.strength ?? null, next.strength),
    changed("Dosage form", current?.dosage_form ?? null, next.dosage_form),
    changed("Unit price (EGP)", formatMoney(current?.unit_price_egp), formatMoney(next.unit_price_egp)),
    changed("Unit price (EUR)", formatMoney(current?.unit_price_eur), formatMoney(next.unit_price_eur)),
    changed("Routes", previousRoutes, next.routes.map((item) => item.route).join(", ")),
  ].filter((item) => item !== null);
}

function money(value: string | null) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function formatMoney(value: number | null | undefined) {
  if (value == null) return null;
  return value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function readListQuery(query: unknown) {
  const source = query !== null && typeof query === "object" ? query as Record<string, unknown> : {};
  const text = (key: string) => (typeof source[key] === "string" ? source[key].trim() : "");
  const q = text("q");
  const dosageForm = text("dosage_form");
  if (q.length > 200) throw new ApplicationError(422, "invalid_query", "Search is too long");
  if (dosageForm && !dosageForms.includes(dosageForm as (typeof dosageForms)[number])) {
    throw new ApplicationError(422, "invalid_query", "Unknown dosage form");
  }
  return { q, dosageForm };
}

function readId(params: unknown) {
  const id = params !== null && typeof params === "object" ? (params as { id?: unknown }).id : "";
  if (typeof id !== "string" || !z.string().uuid().safeParse(id).success) {
    throw new ApplicationError(404, "not_found", "Medication was not found");
  }
  return id;
}

function assertManager(type: string) {
  if (type !== "super-admin" && type !== "admin") {
    throw new ApplicationError(403, "forbidden", "You do not have permission to do that");
  }
}

function isUnique(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}
