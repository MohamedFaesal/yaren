import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import { changed, noteActivity } from "./activity.js";

const routes = ["IV Infusion / Drip", "IM injection", "Oral", "SC injection", "Inhalation / Nebulization", "Topical"] as const;
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

const medicationSchema = z.object({
  name: z.string().trim().min(1, "Enter the active ingredient").max(160),
  strength: z.string().trim().min(1, "Enter the strength").max(80),
  dosage_form: z.enum(dosageForms, { error: "Choose a dosage form" }),
  route: z.enum(routes, { error: "Choose a route" }),
});

type MedicationRow = {
  id: string;
  name: string;
  strength: string;
  dosage_form: string;
  route: string;
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
      )`);
    }
    const result = await pool.query<MedicationRow>(
      `SELECT id, name, strength, dosage_form, route
       FROM medications
       WHERE ${clauses.join(" AND ")}
       ORDER BY lower(name) ASC, lower(strength) ASC, dosage_form ASC`,
      values,
    );
    return {
      items: result.rows,
      dosage_forms: [...dosageForms],
      routes: [...routes],
    };
  });

  app.post("/api/medications", { preHandler: authenticate }, async (request, reply) => {
    assertManager(request.user.type);
    const body = parse(medicationSchema, request.body);
    try {
      const created = await pool.query<{ id: string }>(
        `INSERT INTO medications (name, strength, dosage_form, route, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [body.name, body.strength, body.dosage_form, body.route, request.user.sub],
      );
      const id = created.rows[0]?.id;
      if (!id) throw new ApplicationError(500, "internal_error", "Unexpected server error");
      noteActivity(request, {
        entity: "medication",
        entityId: id,
        summary: `Added medication ${label(body)}`,
        changes: changes(null, body),
      });
      const row = await findMedication(pool, id);
      return reply.status(201).send(row);
    } catch (error) {
      if (isUnique(error)) throw new ApplicationError(409, "name_taken", "This medication, strength, and form already exists");
      throw error;
    }
  });

  app.patch("/api/medications/:id", { preHandler: authenticate }, async (request) => {
    assertManager(request.user.type);
    const id = readId(request.params);
    const body = parse(medicationSchema, request.body);
    const current = await findMedication(pool, id);
    if (!current) throw new ApplicationError(404, "not_found", "Medication was not found");
    try {
      await pool.query(
        `UPDATE medications
         SET name = $2, strength = $3, dosage_form = $4, route = $5, updated_at = now(), updated_by = $6
         WHERE id = $1 AND deleted_at IS NULL`,
        [id, body.name, body.strength, body.dosage_form, body.route, request.user.sub],
      );
    } catch (error) {
      if (isUnique(error)) throw new ApplicationError(409, "name_taken", "This medication, strength, and form already exists");
      throw error;
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
    `SELECT id, name, strength, dosage_form, route FROM medications WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return result.rows[0];
}

function label(row: { name: string; strength: string; dosage_form: string }) {
  return `${row.name} ${row.strength} ${row.dosage_form}`;
}

function changes(current: MedicationRow | null, next: z.infer<typeof medicationSchema>) {
  return [
    changed("Active ingredient", current?.name ?? null, next.name),
    changed("Strength", current?.strength ?? null, next.strength),
    changed("Dosage form", current?.dosage_form ?? null, next.dosage_form),
    changed("Route", current?.route ?? null, next.route),
  ].filter((item) => item !== null);
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
