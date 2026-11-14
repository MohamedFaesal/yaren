import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  api,
  casePriorityClass,
  casePriorityLabel,
  visitStatusChips,
  visitStatusText,
  type InvestigationPhase,
  type MonitoringHistoryPage as MonitoringHistoryResult,
  type MonitoringItem,
  type User,
  type VisitCareStatus,
} from "../api";
import { canAct } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { MonitoringRecordsModal } from "./NurseDashboardPanels";
import { DataTable, Filters, IconAction, Page, field, label, messageOf, secondary, th } from "./ui";

const pageSize = 20;

export function MonitoringHistoryPage({ token, actor }: { token: string; actor: User }) {
  const navigate = useNavigate();
  const { clinicId } = useActiveClinic();
  const [result, setResult] = useState<MonitoringHistoryResult>({ items: [], total: 0, page: 1, page_size: pageSize });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<MonitoringItem | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef(0);
  const canOpenVisit = canAct(actor, "visit", "view");
  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  const start = result.total === 0 ? 0 : (result.page - 1) * pageSize + 1;
  const end = Math.min(result.page * pageSize, result.total);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (query === search) return;
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    setPage(1);
  }, [clinicId]);

  useEffect(() => {
    const id = ++requestId.current;
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set("q", search);
    if (clinicId) params.set("clinic_id", clinicId);
    setLoading(true);
    setError(null);
    api<MonitoringHistoryResult>(`/api/nurse/monitoring/history?${params}`, {}, token)
      .then((data) => {
        if (id !== requestId.current) return;
        setResult(data);
        setPage(data.page);
      })
      .catch((caught) => {
        if (id === requestId.current) setError(messageOf(caught));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [token, page, search, clinicId]);

  return (
    <Page
      title="Monitoring / Observations History"
      description="Patients whose monitoring has been completed."
      crumbs={[{ label: "Care" }, { label: "Monitoring / Observations History" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Filters>
        <label className={label}>Search
          <input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by patient, MRN, clinic, hotel, or room" />
        </label>
      </Filters>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        {loading ? "Loading" : result.total === 0 ? "0 shown" : `Showing ${start}–${end} of ${result.total}`}
      </p>
      <DataTable>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>Patient</th>
            <th className={th}>Doctor</th>
            <th className={th}>Nurse</th>
            <th className={th}>Status</th>
            <th className={th}>Priority</th>
            <th className={th}>Readings</th>
            <th className={th}>Spent time</th>
            <th className={th}>Clinic</th>
            <th className={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 ? (
            <tr>
              <td className="px-4 py-10 text-center text-sm text-muted" colSpan={9}>
                {search ? "No completed monitoring matches this search." : "No completed monitoring yet."}
              </td>
            </tr>
          ) : result.items.map((row) => {
            const href = row.visit_number ? `/visits/${row.visit_number}` : null;
            const readingCount = row.observations?.length ?? 0;
            const spent = monitoringSpentMs(row.monitoring_started_at, row.monitoring_completed_at);
            return (
              <tr
                key={row.visit_id}
                className={`border-t border-line-soft ${canOpenVisit && href ? "cursor-pointer hover:bg-surface-2" : ""}`}
                onClick={canOpenVisit && href ? () => navigate(href) : undefined}
              >
                <td className="px-4 py-3">
                  <span className="font-semibold">{row.patient_name}</span>
                  <span className="block font-mono text-xs text-muted">{row.patient_mrn}</span>
                </td>
                <td className="px-4 py-3 text-sm">{row.assigned_doctor_name || <span className="text-muted">—</span>}</td>
                <td className="px-4 py-3 text-sm">{row.assigned_nurse_name || <span className="text-muted">—</span>}</td>
                <td className="px-4 py-3"><VisitStatuses status={row.status} phase={row.investigation_phase} /></td>
                <td className="px-4 py-3">
                  {row.case_priority ? (
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${casePriorityClass(row.case_priority)}`}>
                      {casePriorityLabel(row.case_priority)}
                    </span>
                  ) : <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-3 tabular-nums">{readingCount}</td>
                <td
                  className="whitespace-nowrap px-4 py-3 font-mono text-sm font-semibold tabular-nums text-ink"
                  title={spentTitle(row.monitoring_started_at, row.monitoring_completed_at)}
                >
                  {spent != null ? clockLabel(spent) : "—"}
                </td>
                <td className="px-4 py-3">
                  {row.clinic_name}
                  <span className="block text-xs text-muted">{row.hotel_name}{row.hotel_room_no ? ` · Room ${row.hotel_room_no}` : ""}</span>
                </td>
                <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={`${secondary} h-9 px-3 py-0 text-xs`} onClick={() => setViewing(row)}>
                      View Details
                    </button>
                    {canOpenVisit && href ? <IconAction kind="view" to={href} /> : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-strong">Page {result.total === 0 ? 0 : result.page} of {result.total === 0 ? 0 : pages}</p>
        <div className="flex gap-2">
          <button type="button" className={`${secondary} disabled:opacity-50`} disabled={loading || result.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
          <button type="button" className={`${secondary} disabled:opacity-50`} disabled={loading || result.page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      </div>
      {viewing ? <MonitoringRecordsModal item={viewing} now={now} onClose={() => setViewing(null)} /> : null}
    </Page>
  );
}

function monitoringSpentMs(startedAt: string | null | undefined, completedAt: string | null | undefined) {
  if (!startedAt || !completedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

function spentTitle(startedAt: string | null | undefined, completedAt: string | null | undefined) {
  if (!startedAt || !completedAt) return undefined;
  return `${formatWhen(startedAt)} → ${formatWhen(completedAt)}`;
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function clockLabel(ms: number) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function VisitStatuses({ status, phase }: { status?: VisitCareStatus; phase?: InvestigationPhase | null }) {
  const chips = visitStatusChips({ status, monitoring_status: "completed" });
  if (chips.length === 0) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {chips.map((item) => {
        const tone = item === "encounter_complete" || item === "under_nursing_care" || (item === "waiting_for_investigation" && phase === "results_ready")
          ? "bg-success-soft text-success"
          : item === "waiting_for_investigation"
            ? "bg-warning-soft text-warning"
            : "bg-panel text-blue";
        return (
          <span key={item} className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
            {visitStatusText({ status: item, investigation_phase: item === "waiting_for_investigation" ? phase : null })}
          </span>
        );
      })}
    </span>
  );
}
