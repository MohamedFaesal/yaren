import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type User, type VisitCareStatus, type VisitPageResult } from "../api";
import { canAct } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { DataTable, Filters, IconAction, Page, PlusIcon, SearchSelect, field, label, messageOf, primary, secondary, th } from "./ui";

const pageSize = 20;

export function VisitsPage({ token, actor }: { token: string; actor: User }) {
  const navigate = useNavigate();
  const { clinicId } = useActiveClinic();
  const [result, setResult] = useState<VisitPageResult>({ items: [], total: 0, page: 1, page_size: pageSize });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | VisitCareStatus>("");
  const [sort, setSort] = useState<"created_at" | "updated_at">("updated_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const canCreate = canAct(actor, "visit", "create");
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
    if (status) params.set("status", status);
    params.set("sort", sort);
    params.set("dir", dir);
    if (clinicId) params.set("clinic_id", clinicId);
    setLoading(true);
    setError(null);
    api<VisitPageResult>(`/api/visits?${params}`, {}, token)
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
  }, [token, page, search, status, sort, dir, clinicId]);

  return (
    <Page
      title="Visits"
      description="Hotel stays linked to patient records."
      crumbs={[{ label: "Care" }, { label: "Visits" }]}
      action={canCreate ? <Link to="/patients/register" className={primary}><PlusIcon />Register</Link> : null}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Filters>
        <label className={label}>Search<input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by patient, MRN, passport, clinic, hotel, or room" /></label>
        <label className={label}>Status
          <SearchSelect
            value={status}
            onChange={(value) => { setStatus(value as "" | VisitCareStatus); setPage(1); }}
            options={[
              { value: "", label: "Any status" },
              { value: "waiting_for_triage", label: "Waiting for triage" },
              { value: "to_doctor", label: "To see the doctor" },
            ]}
            placeholder="Any status"
          />
        </label>
        <label className={label}>Sort
          <SearchSelect
            value={`${sort}:${dir}`}
            onChange={(value) => {
              const [nextSort, nextDir] = value.split(":") as ["created_at" | "updated_at", "asc" | "desc"];
              setSort(nextSort);
              setDir(nextDir);
              setPage(1);
            }}
            options={[
              { value: "updated_at:desc", label: "Updated, newest first" },
              { value: "updated_at:asc", label: "Updated, oldest first" },
              { value: "created_at:desc", label: "Created, newest first" },
              { value: "created_at:asc", label: "Created, oldest first" },
            ]}
            placeholder="Updated, newest first"
          />
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
            <th className={th}>Age at visit</th>
            <th className={th}>MRN</th>
            <th className={th}>Clinic</th>
            <th className={th}>Created</th>
            <th className={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 ? (
            <tr><td className="px-4 py-8 text-muted" colSpan={7}>{search || status ? "No visits match these filters." : "No visits yet."}</td></tr>
          ) : result.items.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-t border-line-soft hover:bg-surface-2"
              onClick={() => navigate(`/patients/${row.patient_id}/visits/${row.id}`)}
            >
              <td className="px-4 py-3 font-semibold">{row.patient_name}</td>
              <td className="px-4 py-3"><VisitStatus status={row.status} /></td>
              <td className="px-4 py-3 tabular-nums">{row.patient_age_at_visit != null ? `${row.patient_age_at_visit} yrs` : "—"}</td>
              <td className="px-4 py-3 font-mono text-sm">{row.patient_mrn}</td>
              <td className="px-4 py-3">{row.clinic_name}<span className="block text-xs text-muted">{row.hotel_name}</span></td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-strong" title={formatWhen(row.created_at)}>{createdAgo(row.created_at)}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                  <IconAction kind="view" to={`/patients/${row.patient_id}/visits/${row.id}`} />
                  {canAct(actor, "visit", "update", { ownerId: row.patient_added_by, clinicId: row.clinic_id })
                    ? <IconAction kind="edit" to={`/patients/${row.patient_id}/visits/${row.id}/edit`} />
                    : null}
                </div>
              </td>
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
    </Page>
  );
}

function createdAgo(value: string) {
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

function VisitStatus({ status }: { status?: VisitCareStatus }) {
  if (status === "to_doctor") {
    return <span className="inline-flex rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">To see the doctor</span>;
  }
  if (status === "waiting_for_triage") {
    return <span className="inline-flex rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">Waiting for triage</span>;
  }
  return <span className="text-muted">—</span>;
}
