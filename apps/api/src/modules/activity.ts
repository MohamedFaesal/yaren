import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate } from "../http.js";
import { assertCan } from "../permissions.js";

export type ActivityChange = { attribute: string; from: string; to: string };

type ActivityNote = {
  actorId?: string;
  actorLabel?: string;
  summary?: string;
  changes?: ActivityChange[];
  entity?: string | null;
  entityId?: string | null;
};

type ActivityEntry = {
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  summary: string;
  changes: ActivityChange[] | null;
  method: string;
  path: string;
  statusCode: number;
};

export function changed(attribute: string, from: string | null | undefined, to: string | null | undefined): ActivityChange | null {
  const previous = from ?? "";
  const next = to ?? "";
  if (previous === next) return null;
  return { attribute, from: previous || "Empty", to: next || "Empty" };
}

const permissionAreas: Record<string, string> = {
  user: "users",
  hotel: "hotels",
  clinic: "clinics",
  patient: "patients",
  visit: "visits",
  triage: "triage",
  activity: "activity",
  role: "roles",
};

export function permissionLabel(id: string) {
  const [resource, action, ownership] = id.split(".");
  const area = (resource ? permissionAreas[resource] : undefined) ?? resource ?? id;
  if (!action) return id;
  if (action === "manage") return `Manage all ${area}`;
  if (action === "create") return `Create ${area}`;
  const verb = action === "view" ? "View" : action === "update" ? "Update" : action === "delete" ? "Delete" : action;
  return ownership === "own" ? `${verb} ${area} I created` : `${verb} all ${area}`;
}

const notes = new WeakMap<FastifyRequest, ActivityNote>();
const queue: ActivityEntry[] = [];
const queueLimit = 2000;
let flushing = false;
let timer: NodeJS.Timeout | undefined;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function noteActivity(request: FastifyRequest, note: ActivityNote) {
  notes.set(request, { ...notes.get(request), ...note });
}

const actions = ["login", "logout", "create", "update", "delete", "view"] as const;
const entities = ["user", "hotel", "clinic", "patient", "session", "dashboard", "tourism", "activity", "role"] as const;

export function startActivityLog(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/activity", { preHandler: authenticate }, async (request) => {
    await assertCan(pool, request, { resource: "activity", action: "view" });
    const query = readActivityQuery(request.query);
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      clauses.push(clause.replaceAll("?", `$${values.length}`));
    };
    if (query.action) add("l.action = ?", query.action);
    if (query.entity) add("l.entity = ?", query.entity);
    if (query.entityId) add("l.entity_id = ?", query.entityId);
    if (query.from) add("l.created_at >= ?", query.from);
    if (query.to) add("l.created_at <= ?", query.to);
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      values.push(pattern, pattern, pattern, pattern);
      const start = values.length - 3;
      clauses.push(`(l.summary ILIKE $${start} ESCAPE '\\' OR COALESCE(u.name, l.actor_label, '') ILIKE $${start + 1} ESCAPE '\\' OR l.path ILIKE $${start + 2} ESCAPE '\\' OR COALESCE(l.changes::text, '') ILIKE $${start + 3} ESCAPE '\\')`);
    }
    clauses.push("(l.action <> 'view' OR l.entity_id IS NOT NULL)");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const from = `FROM activity_logs l LEFT JOIN users u ON u.id = l.actor_id ${where}`;
    const counted = await pool.query<{ total: number }>(`SELECT count(*)::int AS total ${from}`, values);
    const total = counted.rows[0]?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, pages);
    const rows = await pool.query(
      `SELECT l.id, l.actor_id, COALESCE(u.name, l.actor_label) AS actor_name, l.action, l.entity,
              COALESCE(case_visit.patient_id, l.entity_id) AS entity_id,
              l.summary, l.changes, l.method, l.path, l.status_code, l.created_at
       FROM activity_logs l
       LEFT JOIN users u ON u.id = l.actor_id
       LEFT JOIN patient_visits case_visit ON l.path = '/api/doctor-cases/' || case_visit.id::text
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.pageSize, (page - 1) * query.pageSize],
    );
    return { items: rows.rows, total, page, page_size: query.pageSize };
  });

  app.addHook("onSend", (request, reply, payload, done) => {
    if (reply.statusCode >= 200 && reply.statusCode < 300) {
      const path = request.url.split("?")[0] ?? request.url;
      const described = describe(request, path, reply.statusCode);
      const noted = notes.get(request);
      if (!described.entityId && !noted?.entityId) {
        const id = extractEntityId(payload);
        if (id) noteActivity(request, { entityId: id });
      }
    }
    done(null, payload);
  });

  app.addHook("onResponse", (request, reply, done) => {
    const path = request.url.split("?")[0] ?? request.url;
    const listingTheLog = request.method === "GET" && path === "/api/activity";
    if (!listingTheLog && path !== "/api/health" && path.startsWith("/api/")) {
      const entry = entryFrom(request, reply.statusCode, path);
      if (entry.action !== "view" || entry.entityId) enqueue(entry);
    }
    done();
  });

  timer = setInterval(() => {
    void flush(pool, app);
  }, 500);
  timer.unref();

  app.addHook("onClose", async () => {
    if (timer) clearInterval(timer);
    await flush(pool, app);
  });
}

function readActivityQuery(query: unknown) {
  const source = query !== null && typeof query === "object" ? query as Record<string, unknown> : {};
  const text = (key: string) => (typeof source[key] === "string" ? source[key].trim() : "");
  const page = Number(text("page") || "1");
  const pageSize = Number(text("page_size") || "20");
  const action = text("action");
  const entity = text("entity");
  const entityId = text("entity_id");
  const from = text("from");
  const to = text("to");
  const q = text("q");
  if (!Number.isInteger(page) || page < 1) throw new ApplicationError(422, "invalid_query", "Page must be 1 or greater");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new ApplicationError(422, "invalid_query", "Page size must be between 1 and 100");
  if (action && !actions.includes(action as (typeof actions)[number])) throw new ApplicationError(422, "invalid_query", "Unknown action");
  if (entity && !entities.includes(entity as (typeof entities)[number])) throw new ApplicationError(422, "invalid_query", "Unknown area");
  if (entityId && !uuidPattern.test(entityId)) throw new ApplicationError(422, "invalid_query", "Entity id must be a valid id");
  if (q.length > 200) throw new ApplicationError(422, "invalid_query", "Search is too long");
  const fromDate = from ? parsedDate(from, "From") : null;
  const toDate = to ? parsedDate(to, "To") : null;
  if (fromDate && toDate && fromDate > toDate) throw new ApplicationError(422, "invalid_range", "From must be earlier than To");
  return { page, pageSize, action, entity, entityId: entityId || null, q, from: fromDate?.toISOString() ?? null, to: toDate?.toISOString() ?? null };
}

function parsedDate(value: string, label: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApplicationError(422, "invalid_query", `${label} must be a valid date and time`);
  return date;
}

const recentKeys = new Map<string, number>();
const duplicateWindowMs = 3000;
const viewRepeatWindowMs = 120_000;

function enqueue(entry: ActivityEntry) {
  const now = Date.now();
  const windowMs = entry.action === "view" ? viewRepeatWindowMs : entry.action === "login" || entry.action === "logout" ? 15_000 : duplicateWindowMs;
  const key = [entry.actorId, entry.action, entry.entity, entry.entityId, entry.method, entry.path, entry.statusCode].join("|");
  const seenAt = recentKeys.get(key);
  if (seenAt !== undefined && now - seenAt < windowMs) return;
  recentKeys.set(key, now);
  if (recentKeys.size > 500) {
    for (const [stored, at] of recentKeys) {
      if (now - at >= viewRepeatWindowMs) recentKeys.delete(stored);
    }
  }
  if (queue.length >= queueLimit) queue.shift();
  queue.push(entry);
}

async function flush(pool: pg.Pool, app: FastifyInstance) {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, 100);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const raw of batch) {
      const entry = await namedView(client, raw);
      await client.query(
        `INSERT INTO activity_logs (actor_id, actor_label, action, entity, entity_id, summary, changes, method, path, status_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
        [entry.actorId, entry.actorLabel, entry.action, entry.entity, entry.entityId, entry.summary, entry.changes ? JSON.stringify(entry.changes) : null, entry.method, entry.path, entry.statusCode],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    app.log.error(error, "Activity log flush failed");
  } finally {
    client.release();
    flushing = false;
  }
}

function entryFrom(request: FastifyRequest, statusCode: number, path: string): ActivityEntry {
  const note = notes.get(request);
  const described = describe(request, path, statusCode);
  let actorId = note?.actorId ?? null;
  if (!actorId) {
    try {
      actorId = request.user?.sub ?? null;
    } catch {
      actorId = null;
    }
  }
  return {
    actorId,
    actorLabel: note?.actorLabel ?? described.actorLabel,
    action: described.action,
    entity: note?.entity !== undefined ? note.entity : described.entity,
    entityId: note?.entityId !== undefined ? note.entityId : described.entityId,
    summary: note?.summary ?? described.summary,
    changes: note?.changes ?? null,
    method: request.method,
    path,
    statusCode,
  };
}

function describe(request: FastifyRequest, path: string, statusCode: number) {
  const parts = path.split("/").filter(Boolean);
  const resource = parts[1] ?? "";
  const target = parts[2];
  const extra = parts[3];
  const body = recordOf(request.body);
  const name = textOf(body.name);
  const email = textOf(body.email);
  const entityId = target && uuidPattern.test(target) ? target : null;

  if (resource === "auth" && target === "login") {
    const failed = statusCode >= 400;
    return {
      action: "login",
      entity: "session",
      entityId: null,
      actorLabel: email,
      summary: failed ? `Sign-in failed${email ? ` for ${email}` : ""}` : `Signed in${email ? ` as ${email}` : ""}`,
    };
  }
  if (resource === "auth" && target === "logout") {
    return { action: "logout", entity: "session", entityId: null, actorLabel: null, summary: "Signed out" };
  }
  if (resource === "auth" && target === "me") {
    let selfId: string | null = null;
    try {
      selfId = request.user?.sub ?? null;
    } catch {
      selfId = null;
    }
    if (request.method === "PATCH") {
      return { action: "update", entity: "user", entityId: selfId, actorLabel: null, summary: "Updated their profile" };
    }
    if (extra === "photo" && request.method === "POST") {
      return { action: "update", entity: "user", entityId: selfId, actorLabel: null, summary: "Updated their profile photo" };
    }
    if (extra === "photo" && request.method === "DELETE") {
      return { action: "update", entity: "user", entityId: selfId, actorLabel: null, summary: "Removed their profile photo" };
    }
    return { action: "view", entity: "session", entityId: null, actorLabel: null, summary: "Checked the signed-in account" };
  }
  if (resource === "dashboard") {
    return { action: "view", entity: "dashboard", entityId: null, actorLabel: null, summary: "Opened the dashboard" };
  }
  if (resource === "tourism") {
    return { action: "view", entity: "tourism", entityId: null, actorLabel: null, summary: "Opened the tourism directory" };
  }
  if (resource === "activity") {
    return { action: "view", entity: "activity", entityId: null, actorLabel: null, summary: "Opened the activity log" };
  }

  if (resource === "visits") {
    return { action: "view", entity: "patient", entityId: null, actorLabel: null, summary: "Opened the visits list" };
  }
  if (resource === "doctor-cases") {
    return { action: "view", entity: "patient", entityId: null, actorLabel: null, summary: "Opened the doctor cases" };
  }
  const entity = resource === "users" ? "user" : resource === "hotels" ? "hotel" : resource === "clinics" ? "clinic" : resource === "patients" ? "patient" : resource === "roles" ? "role" : resource || null;
  const label = entity ?? "record";
  const named = name ? ` ${name}` : "";
  if (resource === "patients" && target === "lookup") {
    return { action: "view", entity: "patient", entityId: null, actorLabel: null, summary: "Looked up a patient by passport or national ID" };
  }
  if (resource === "patients" && target === "match") {
    return { action: "view", entity: "patient", entityId: null, actorLabel: null, summary: "Checked registration details against existing patients" };
  }
  if (resource === "patients" && target === "register" && request.method === "POST") {
    const patientBody = recordOf(body.patient);
    const registerName = textOf(patientBody.name);
    return {
      action: "create",
      entity: "patient",
      entityId: null,
      actorLabel: null,
      summary: registerName ? `Registered patient ${registerName} with a visit` : "Registered a patient visit",
    };
  }
  if (resource === "patients" && extra === "visits") {
    if (request.method === "POST") {
      return { action: "create", entity: "patient", entityId, actorLabel: null, summary: `Created a visit for patient${named}` };
    }
    if (request.method === "PATCH") {
      return { action: "update", entity: "patient", entityId, actorLabel: null, summary: `Updated a visit for patient${named}` };
    }
    if (request.method === "DELETE") {
      return { action: "delete", entity: "patient", entityId, actorLabel: null, summary: "Deleted a patient visit" };
    }
  }
  if (request.method === "POST" && !target) {
    return { action: "create", entity, entityId: null, actorLabel: null, summary: `Created ${label}${named}` };
  }
  if (request.method === "PATCH") {
    return { action: "update", entity, entityId, actorLabel: null, summary: `Updated ${label}${named}` };
  }
  if (request.method === "DELETE") {
    return { action: "delete", entity, entityId, actorLabel: null, summary: `Deleted ${label}` };
  }
  if (extra === "edit") {
    return { action: "view", entity, entityId, actorLabel: null, summary: `Opened ${label} for editing` };
  }
  return {
    action: "view",
    entity,
    entityId,
    actorLabel: null,
    summary: entityId ? `Viewed ${label}` : `Opened the ${label} list`,
  };
}

async function namedView(client: pg.PoolClient, entry: ActivityEntry) {
  const table = entry.entity === "user" ? "users" : entry.entity === "hotel" ? "hotels" : entry.entity === "clinic" ? "clinics" : entry.entity === "patient" ? "patients" : entry.entity === "role" ? "access_roles" : null;
  if (entry.action !== "view" || !table || !entry.entityId) return entry;
  const result = await client.query<{ name: string }>(`SELECT name FROM ${table} WHERE id = $1`, [entry.entityId]);
  const name = result.rows[0]?.name;
  if (!name) return entry;
  return { ...entry, summary: `Viewed ${entry.entity} ${name}` };
}

function extractEntityId(payload: unknown): string | null {
  const body = bodyRecord(payload);
  if (!body) return null;
  const direct = textOf(body.id);
  if (direct && uuidPattern.test(direct)) return direct;
  const patient = recordOf(body.patient);
  const patientId = textOf(patient.id);
  if (patientId && uuidPattern.test(patientId)) return patientId;
  const user = recordOf(body.user);
  const userId = textOf(user.id);
  if (userId && uuidPattern.test(userId)) return userId;
  return null;
}

function bodyRecord(payload: unknown): Record<string, unknown> | null {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload) && !Buffer.isBuffer(payload)) {
    return payload as Record<string, unknown>;
  }
  const raw = typeof payload === "string"
    ? payload
    : Buffer.isBuffer(payload)
      ? payload.toString("utf8")
      : null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return recordOf(parsed);
  } catch {
    return null;
  }
}

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textOf(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
