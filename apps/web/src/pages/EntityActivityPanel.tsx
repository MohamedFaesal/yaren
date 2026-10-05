import { useEffect, useRef, useState } from "react";
import { api, type ActivityPageResult } from "../api";
import { ActionLabel, Changes, Result, SummaryLine, timeAgo } from "./ActivityPage";
import { DataTable, formatWhen, messageOf, secondary, th } from "./ui";

const pageSize = 20;

export function EntityActivityPanel({
  token,
  entity,
  entityId,
  active,
  onTotal,
}: {
  token: string;
  entity: "user" | "hotel" | "clinic" | "patient" | "role";
  entityId: string;
  active: boolean;
  onTotal?: (total: number) => void;
}) {
  const [result, setResult] = useState<ActivityPageResult>({ items: [], total: 0, page: 1, page_size: pageSize });
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef(0);
  const reportedTotal = useRef<number | null>(null);
  const onTotalRef = useRef(onTotal);
  onTotalRef.current = onTotal;

  useEffect(() => {
    setPage(1);
    reportedTotal.current = null;
  }, [entity, entityId]);

  useEffect(() => {
    if (!active && reportedTotal.current !== null) return;
    const id = ++requestId.current;
    const params = new URLSearchParams({
      page: String(active ? page : 1),
      page_size: String(active ? pageSize : 1),
      entity,
      entity_id: entityId,
    });
    setLoading(active);
    setError(null);
    api<ActivityPageResult>(`/api/activity?${params}`, {}, token)
      .then((data) => {
        if (id !== requestId.current) return;
        if (active) {
          setResult(data);
          setPage(data.page);
        }
        if (reportedTotal.current !== data.total) {
          reportedTotal.current = data.total;
          onTotalRef.current?.(data.total);
        }
      })
      .catch((caught) => {
        if (id !== requestId.current) return;
        if (active) setError(messageOf(caught));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [token, entity, entityId, active, page]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;

  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  const start = result.total === 0 ? 0 : (result.page - 1) * pageSize + 1;
  const end = Math.min(result.page * pageSize, result.total);

  return (
    <div role="tabpanel">
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        {result.total === 0 ? "0 shown" : `Showing ${start}–${end} of ${result.total}`}
      </p>
      <DataTable>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>When</th>
            <th className={th}>Who</th>
            <th className={th}>Action</th>
            <th className={th}>What happened</th>
            <th className={th}>Result</th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-muted" colSpan={5}>
                {loading ? "Loading activity…" : "No activity recorded for this record yet."}
              </td>
            </tr>
          ) : result.items.map((row) => (
            <tr key={row.id} className="border-t border-line-soft">
              <td className="whitespace-nowrap px-4 py-3 text-muted-strong" title={formatWhen(row.created_at)}>{timeAgo(row.created_at, now)}</td>
              <td className="px-4 py-3 font-semibold">{row.actor_name ?? "Unknown"}</td>
              <td className="px-4 py-3"><ActionLabel action={row.action} /></td>
              <td className="px-4 py-3">
                <SummaryLine summary={row.summary} entity={row.entity} entityId={row.entity_id} action={row.action} linkEntity={false} />
                <Changes changes={row.changes} />
              </td>
              <td className="px-4 py-3"><Result status={row.status_code} /></td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-strong">Page {result.total === 0 ? 0 : result.page} of {result.total === 0 ? 0 : pages}</p>
        <div className="flex gap-2">
          <button type="button" className={`${secondary} disabled:opacity-50`} disabled={loading || result.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
          <button type="button" className={`${secondary} disabled:opacity-50`} disabled={loading || result.page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
