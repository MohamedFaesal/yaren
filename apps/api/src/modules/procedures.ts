import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import { changed, noteActivity } from "./activity.js";

const categories = ["Wound care", "Suturing", "Minor surgery", "Airway & breathing", "ENT", "Eye", "Lines & drainage", "Orthopedic"] as const;

const procedureSchema = z.object({
  name: z.string().trim().min(1, "Enter the procedure name").max(160),
  category: z.enum(categories, { error: "Choose a category" }),
});

type ProcedureRow = {
  id: string;
  name: string;
  category: string;
};

export function registerProcedures(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/surgical-procedures", { preHandler: authenticate }, async (request) => {
    const query = readListQuery(request.query);
    const values: unknown[] = [];
    const clauses = ["deleted_at IS NULL"];
    if (query.category) {
      values.push(query.category);
      clauses.push(`category = $${values.length}`);
    }
    if (query.q) {
      values.push(`%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
      clauses.push(`(name ILIKE $${values.length} ESCAPE '\\' OR category ILIKE $${values.length} ESCAPE '\\')`);
    }
    const result = await pool.query<ProcedureRow>(
      `SELECT id, name, category
       FROM surgical_procedures
       WHERE ${clauses.join(" AND ")}
       ORDER BY category ASC, lower(name) ASC`,
      values,
    );
    return { items: result.rows, categories: [...categories] };
  });

  app.post("/api/surgical-procedures", { preHandler: authenticate }, async (request, reply) => {
    assertManager(request.user.type);
    const body = parse(procedureSchema, request.body);
    try {
      const created = await pool.query<{ id: string }>(
        `INSERT INTO surgical_procedures (name, category, updated_by) VALUES ($1, $2, $3) RETURNING id`,
        [body.name, body.category, request.user.sub],
      );
      const id = created.rows[0]?.id;
      if (!id) throw new ApplicationError(500, "internal_error", "Unexpected server error");
      noteActivity(request, {
        entity: "procedure",
        entityId: id,
        summary: `Added surgical procedure ${body.name}`,
        changes: changes(null, body),
      });
      return reply.status(201).send(await findProcedure(pool, id));
    } catch (error) {
      if (isUnique(error)) throw new ApplicationError(409, "name_taken", "A procedure with this name already exists");
      throw error;
    }
  });

  app.patch("/api/surgical-procedures/:id", { preHandler: authenticate }, async (request) => {
    assertManager(request.user.type);
    const id = readId(request.params);
    const body = parse(procedureSchema, request.body);
    const current = await findProcedure(pool, id);
    if (!current) throw new ApplicationError(404, "not_found", "Procedure was not found");
    try {
      await pool.query(
        `UPDATE surgical_procedures
         SET name = $2, category = $3, updated_at = now(), updated_by = $4
         WHERE id = $1 AND deleted_at IS NULL`,
        [id, body.name, body.category, request.user.sub],
      );
    } catch (error) {
      if (isUnique(error)) throw new ApplicationError(409, "name_taken", "A procedure with this name already exists");
      throw error;
    }
    noteActivity(request, {
      entity: "procedure",
      entityId: id,
      summary: `Updated surgical procedure ${body.name}`,
      changes: changes(current, body),
    });
    return findProcedure(pool, id);
  });

  app.delete("/api/surgical-procedures/:id", { preHandler: authenticate }, async (request) => {
    assertManager(request.user.type);
    const id = readId(request.params);
    const current = await findProcedure(pool, id);
    if (!current) throw new ApplicationError(404, "not_found", "Procedure was not found");
    await pool.query(
      `UPDATE surgical_procedures SET deleted_at = now(), updated_at = now(), updated_by = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [id, request.user.sub],
    );
    noteActivity(request, {
      entity: "procedure",
      entityId: id,
      summary: `Removed surgical procedure ${current.name}`,
      changes: [changed("Procedure", current.name, null)].filter((item) => item !== null),
    });
    return { ok: true };
  });
}

async function findProcedure(pool: pg.Pool, id: string) {
  const result = await pool.query<ProcedureRow>(
    `SELECT id, name, category FROM surgical_procedures WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return result.rows[0];
}

function changes(current: ProcedureRow | null, next: z.infer<typeof procedureSchema>) {
  return [
    changed("Name", current?.name ?? null, next.name),
    changed("Category", current?.category ?? null, next.category),
  ].filter((item) => item !== null);
}

function readListQuery(query: unknown) {
  const source = query !== null && typeof query === "object" ? query as Record<string, unknown> : {};
  const text = (key: string) => (typeof source[key] === "string" ? source[key].trim() : "");
  const q = text("q");
  const category = text("category");
  if (q.length > 200) throw new ApplicationError(422, "invalid_query", "Search is too long");
  if (category && !categories.includes(category as (typeof categories)[number])) {
    throw new ApplicationError(422, "invalid_query", "Unknown category");
  }
  return { q, category };
}

function readId(params: unknown) {
  const id = params !== null && typeof params === "object" ? (params as { id?: unknown }).id : "";
  if (typeof id !== "string" || !z.string().uuid().safeParse(id).success) {
    throw new ApplicationError(404, "not_found", "Procedure was not found");
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
