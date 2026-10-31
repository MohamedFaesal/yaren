import type pg from "pg";
import { fileUrl } from "./uploads.js";

export const investigationStatuses = ["ordered", "collected", "sent", "result_uploaded", "completed"] as const;
export type InvestigationStatus = (typeof investigationStatuses)[number];

export const investigationPriorities = ["emergency", "urgent", "normal"] as const;
export type InvestigationPriority = (typeof investigationPriorities)[number];

export function requiresCollectionForCategory(category: string | null | undefined) {
  return (category ?? "Laboratory").trim().toLowerCase() === "laboratory";
}

export type DraftInvestigation = {
  id: string;
  service_id: string | null;
  name: string;
  code: string;
  unit: string;
  price: number | null;
  priority: InvestigationPriority;
};

export type PresentedInvestigation = DraftInvestigation & {
  category: string;
  status: InvestigationStatus;
  requires_collection: boolean;
  ordered_at: string | null;
  ordered_by_name: string | null;
  collected_at: string | null;
  collected_by_name: string | null;
  sent_at: string | null;
  sent_by_name: string | null;
  result_uploaded_at: string | null;
  result_uploaded_by_name: string | null;
  completed_at: string | null;
  result_file_url: string | null;
  result_original_name: string | null;
};

type Db = pg.Pool | pg.PoolClient;

export async function materializeInvestigations(
  db: Db,
  visitId: string,
  drafts: DraftInvestigation[],
  orderedBy: string,
) {
  if (drafts.length === 0) return;
  const serviceIds = [...new Set(drafts.map((item) => item.service_id).filter((id): id is string => Boolean(id)))];
  const categories = new Map<string, string>();
  if (serviceIds.length > 0) {
    const result = await db.query<{ id: string; category: string }>(
      `SELECT id, category FROM medical_services WHERE id = ANY($1::uuid[])`,
      [serviceIds],
    );
    for (const row of result.rows) categories.set(row.id, row.category);
  }

  for (const draft of drafts) {
    const category = draft.service_id ? (categories.get(draft.service_id) ?? "Laboratory") : "Laboratory";
    const requiresCollection = requiresCollectionForCategory(category);
    await db.query(
      `INSERT INTO patient_visit_investigations (
         id, visit_id, service_id, name, code, unit, price, category, priority,
         status, requires_collection, ordered_at, ordered_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         'ordered', $10, now(), $11
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        draft.id,
        visitId,
        draft.service_id,
        draft.name,
        draft.code,
        draft.unit,
        draft.price,
        category,
        draft.priority,
        requiresCollection,
        orderedBy,
      ],
    );
  }
}

export async function listVisitInvestigations(db: Db, visitId: string): Promise<PresentedInvestigation[]> {
  const result = await db.query(
    `SELECT i.*,
            o.name AS ordered_by_name,
            c.name AS collected_by_name,
            s.name AS sent_by_name,
            r.name AS result_uploaded_by_name
     FROM patient_visit_investigations i
     LEFT JOIN users o ON o.id = i.ordered_by
     LEFT JOIN users c ON c.id = i.collected_by
     LEFT JOIN users s ON s.id = i.sent_by
     LEFT JOIN users r ON r.id = i.result_uploaded_by
     WHERE i.visit_id = $1
     ORDER BY
       CASE i.priority WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
       i.ordered_at ASC`,
    [visitId],
  );
  return result.rows.map((row) => presentInvestigationRow(row as Record<string, unknown>));
}

export function presentInvestigationRow(row: Record<string, unknown>): PresentedInvestigation {
  const price = row.price == null || row.price === "" ? null : Number(row.price);
  const priority = investigationPriorities.includes(row.priority as InvestigationPriority)
    ? row.priority as InvestigationPriority
    : "normal";
  const status = investigationStatuses.includes(row.status as InvestigationStatus)
    ? row.status as InvestigationStatus
    : "ordered";
  return {
    id: String(row.id),
    service_id: typeof row.service_id === "string" ? row.service_id : null,
    name: String(row.name ?? ""),
    code: typeof row.code === "string" ? row.code : "",
    unit: typeof row.unit === "string" ? row.unit : "",
    price: price != null && Number.isFinite(price) ? price : null,
    priority,
    category: typeof row.category === "string" ? row.category : "Laboratory",
    status,
    requires_collection: Boolean(row.requires_collection),
    ordered_at: iso(row.ordered_at),
    ordered_by_name: textOrNull(row.ordered_by_name),
    collected_at: iso(row.collected_at),
    collected_by_name: textOrNull(row.collected_by_name),
    sent_at: iso(row.sent_at),
    sent_by_name: textOrNull(row.sent_by_name),
    result_uploaded_at: iso(row.result_uploaded_at),
    result_uploaded_by_name: textOrNull(row.result_uploaded_by_name),
    completed_at: iso(row.completed_at),
    result_file_url: fileUrl(typeof row.result_file_path === "string" ? row.result_file_path : null),
    result_original_name: textOrNull(row.result_original_name),
  };
}

export async function maybeCompleteVisitInvestigations(db: Db, visitId: string, actorId: string) {
  const pending = await db.query<{ remaining: number }>(
    `SELECT count(*)::int AS remaining
     FROM patient_visit_investigations
     WHERE visit_id = $1 AND status <> 'completed'`,
    [visitId],
  );
  if ((pending.rows[0]?.remaining ?? 0) > 0) return false;
  const updated = await db.query<{ id: string }>(
    `UPDATE patient_visits
     SET status = 'diagnosed', status_changed_at = now(), updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL AND status = 'waiting_for_investigation'
     RETURNING id`,
    [visitId],
  );
  if (!updated.rows[0]) return false;
  await db.query(
    `INSERT INTO patient_visit_status_history (visit_id, from_status, to_status, changed_by, note)
     VALUES ($1, 'waiting_for_investigation', 'diagnosed', $2, 'All investigation results completed')`,
    [visitId, actorId],
  );
  return true;
}

function iso(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
