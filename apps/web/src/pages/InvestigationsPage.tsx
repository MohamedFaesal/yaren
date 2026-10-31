import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  api,
  investigationPriorityLabel,
  investigationStatusClass,
  investigationStatusLabel,
  type InvestigationPage,
  type InvestigationPriority,
  type InvestigationStatus,
  type User,
  type VisitInvestigation,
} from "../api";
import { useActiveClinic } from "../ClinicWorkspace";
import { useToast } from "../toast";
import { Page, field, messageOf, primary, secondary } from "./ui";

const statusTabs: { id: InvestigationStatus | ""; label: string; active: string }[] = [
  { id: "", label: "All", active: "bg-blue text-white" },
  { id: "ordered", label: "Ordered", active: "bg-panel text-blue ring-1 ring-blue/30" },
  { id: "collected", label: "Collected", active: "bg-warning-soft text-warning ring-1 ring-warning/30" },
  { id: "sent", label: "Sent", active: "bg-panel-strong text-blue-strong ring-1 ring-blue/25" },
  { id: "completed", label: "Completed", active: "bg-success-soft text-success ring-1 ring-success/30" },
];

const pageSize = 25;

export function InvestigationsPage({ token, actor }: { token: string; actor: User }) {
  const toast = useToast();
  const { clinicId } = useActiveClinic();
  const [page, setPage] = useState<InvestigationPage>({
    items: [],
    total: 0,
    page: 1,
    page_size: pageSize,
    summary: { ordered: 0, collected: 0, sent: 0, result_uploaded: 0, completed: 0 },
  });
  const [status, setStatus] = useState<InvestigationStatus | "">("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const canUpload = actor.type === "super-admin" || actor.type === "admin" || actor.role === "Nurse";

  useEffect(() => {
    if (query === search) return;
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setCurrentPage(1);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [clinicId, status]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(currentPage), page_size: String(pageSize) });
    if (clinicId) params.set("clinic_id", clinicId);
    if (status) params.set("status", status);
    if (search) params.set("q", search);
    api<InvestigationPage>(`/api/investigations?${params}`, {}, token)
      .then((data) => {
        if (!cancelled) setPage(data);
      })
      .catch((caught) => {
        if (!cancelled) setError(messageOf(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, clinicId, status, search, currentPage, uploadingId]);

  async function uploadResult(item: VisitInvestigation, file: File) {
    setUploadingId(item.id);
    try {
      const body = new FormData();
      body.append("file", file);
      await api(`/api/investigations/${item.id}/result`, { method: "POST", body }, token);
      toast.success("Result uploaded", `${item.name} is completed for ${item.patient_name}.`);
      setUploadingId(null);
    } catch (caught) {
      toast.error("Upload failed", messageOf(caught));
      setUploadingId(null);
    }
  }

  const pages = Math.max(1, Math.ceil(page.total / page.page_size));
  const start = page.total === 0 ? 0 : (page.page - 1) * page.page_size + 1;
  const end = Math.min(page.page * page.page_size, page.total);

  return (
    <Page
      title="Investigations"
      description="Track ordered laboratory and imaging studies from collection through result upload."
      crumbs={[{ label: "Care" }, { label: "Investigations" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {statusTabs.map((tab) => {
          const count = tab.id ? page.summary[tab.id] ?? 0 : page.summary.ordered + page.summary.collected + page.summary.sent + page.summary.result_uploaded + page.summary.completed;
          const active = status === tab.id;
          return (
            <button
              key={tab.id || "all"}
              type="button"
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${active ? tab.active : "bg-surface-2 text-muted-strong hover:bg-panel hover:text-ink"}`}
              onClick={() => setStatus(tab.id)}
            >
              {tab.label} <span className="tabular-nums opacity-80">{count}</span>
            </button>
          );
        })}
      </div>

      <label className="relative mb-4 block max-w-md">
        <span className="sr-only">Search investigations</span>
        <input
          className={field}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search patient, MRN, or test"
        />
      </label>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Patient</th>
              <th className="px-4 py-3">Test</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ordered</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && page.items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">Loading investigations…</td></tr>
            ) : page.items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No investigations match this filter.</td></tr>
            ) : page.items.map((item) => (
              <tr key={item.id} className="border-b border-line-soft last:border-0">
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{item.patient_name}</p>
                  <p className="text-xs text-muted">{item.patient_mrn} · {item.clinic_name}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{item.name}</p>
                  <p className="text-xs text-muted">{item.category || "Laboratory"}{item.code ? ` · ${item.code}` : ""}</p>
                </td>
                <td className="px-4 py-3"><PriorityPill priority={item.priority} /></td>
                <td className="px-4 py-3"><StatusPill status={item.status} /></td>
                <td className="px-4 py-3 text-muted">{item.ordered_at ? formatWhen(item.ordered_at) : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {item.patient_id ? (
                      <Link className={`${secondary} h-8 px-3 text-xs`} to={`/patients/${item.patient_id}`}>Patient</Link>
                    ) : null}
                    {item.status === "sent" && canUpload ? (
                      <>
                        <input
                          ref={(node) => { fileRefs.current[item.id] = node; }}
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadResult(item, file);
                            event.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          className={`${primary} h-8 px-3 text-xs`}
                          disabled={uploadingId === item.id}
                          onClick={() => fileRefs.current[item.id]?.click()}
                        >
                          {uploadingId === item.id ? "Uploading…" : "Upload result"}
                        </button>
                      </>
                    ) : null}
                    {item.result_file_url ? (
                      <a className={`${secondary} h-8 px-3 text-xs`} href={item.result_file_url} target="_blank" rel="noreferrer">
                        Open report
                      </a>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted">
        <p>{page.total === 0 ? "0 shown" : `${start}–${end} of ${page.total}`}</p>
        <div className="flex items-center gap-1">
          <button type="button" className={secondary} disabled={currentPage <= 1 || loading} onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}>Prev</button>
          <span className="px-1 font-semibold text-ink">{page.page}/{pages}</span>
          <button type="button" className={secondary} disabled={currentPage >= pages || loading} onClick={() => setCurrentPage((value) => Math.min(pages, value + 1))}>Next</button>
        </div>
      </div>
    </Page>
  );
}

function PriorityPill({ priority }: { priority: InvestigationPriority }) {
  const styles = priority === "emergency"
    ? "bg-danger-soft text-danger"
    : priority === "urgent"
      ? "bg-warning-soft text-warning"
      : "bg-panel text-blue";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles}`}>{investigationPriorityLabel(priority)}</span>;
}

function StatusPill({ status }: { status?: InvestigationStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${investigationStatusClass(status)}`}>{investigationStatusLabel(status)}</span>;
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
