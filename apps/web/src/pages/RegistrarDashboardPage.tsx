import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api, visitStatusLabel, visitTypeLabel, type RegistrarLeftPage, type User, type VisitCareStatus, type VisitType } from "../api";
import { canAct } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { DataTable, Filters, IconAction, Page, field, label, messageOf, secondary, th } from "./ui";

const pageSize = 20;

export function RegistrarDashboardPage({ token, actor }: { token: string; actor: User }) {
  const navigate = useNavigate();
  const { clinicId } = useActiveClinic();
  const [result, setResult] = useState<RegistrarLeftPage>({ items: [], total: 0, page: 1, page_size: pageSize });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const canOpenVisit = canAct(actor, "visit", "view");
  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  const start = result.total === 0 ? 0 : (result.page - 1) * pageSize + 1;
  const end = Math.min(result.page * pageSize, result.total);

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
    api<RegistrarLeftPage>(`/api/registrar/left?${params}`, {}, token)
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
      title="Registrar Dashboard"
      description="Visits marked Patient Left or Encounter Complete."
      crumbs={[{ label: "Care" }, { label: "Registrar Dashboard" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Filters>
        <label className={label}>Search
          <input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by patient, MRN, passport, clinic, hotel, or room" />
        </label>
      </Filters>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        {loading ? "Loading" : result.total === 0 ? "0 shown" : `Showing ${start}–${end} of ${result.total}`}
      </p>
      <DataTable>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>Patient</th>
            <th className={th}>Status</th>
            <th className={th}>Type</th>
            <th className={th}>MRN</th>
            <th className={th}>Clinic</th>
            <th className={th}>Hotel</th>
            <th className={th}>When</th>
            {canOpenVisit ? <th className={th}>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 ? (
            <tr>
              <td className="px-4 py-10 text-center text-sm text-muted" colSpan={canOpenVisit ? 8 : 7}>
                {search ? "No visits match this search." : "No Patient Left or Encounter Complete visits."}
              </td>
            </tr>
          ) : result.items.map((row) => {
            const href = `/visits/${row.visit_number}`;
            return (
              <tr
                key={row.id}
                className={`border-t border-line-soft ${canOpenVisit ? "cursor-pointer hover:bg-surface-2" : ""}`}
                onClick={canOpenVisit ? () => navigate(href) : undefined}
              >
                <td className="px-4 py-3 font-semibold">{row.patient_name}</td>
                <td className="px-4 py-3"><RegistrarStatus status={row.status} /></td>
                <td className="px-4 py-3"><VisitTypeBadge type={row.visit_type} /></td>
                <td className="px-4 py-3 font-mono text-sm">{row.patient_mrn}</td>
                <td className="px-4 py-3">{row.clinic_name}</td>
                <td className="px-4 py-3">{row.hotel_name}<span className="block text-xs text-muted">{row.hotel_room_no ? `Room ${row.hotel_room_no}` : "—"}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-strong" title={formatWhen(row.recorded_at)}>{leftAgo(row.recorded_at)}</td>
                {canOpenVisit ? (
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <IconAction kind="view" to={href} />
                  </td>
                ) : null}
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
    </Page>
  );
}

function leftAgo(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function RegistrarStatus({ status }: { status?: VisitCareStatus }) {
  const tone = status === "encounter_complete" ? "bg-success-soft text-success" : "bg-surface-3 text-muted-strong";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{visitStatusLabel(status)}</span>;
}

function VisitTypeBadge({ type }: { type?: VisitType }) {
  if (type === "follow-up") return <span className="inline-flex rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-blue">Follow-up</span>;
  if (type === "new") return <span className="inline-flex rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink">New</span>;
  return <span className="text-muted">{visitTypeLabel(type)}</span>;
}
