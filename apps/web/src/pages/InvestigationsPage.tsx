import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import {
  api,
  casePriorityLabel,
  investigationPriorityLabel,
  investigationStatusClass,
  investigationStatusLabel,
  investigationVisitStatusClass,
  investigationVisitStatusLabel,
  type CasePriority,
  type EncounterInvestigation,
  type InvestigationPriority,
  type InvestigationPage,
  type InvestigationVisitItem,
  type User,
} from "../api";
import { useActiveClinic } from "../ClinicWorkspace";
import { useToast } from "../toast";
import { Page, field, messageOf } from "./ui";

type OverallFilter = "" | "sent" | "partially_completed" | "completed";

const statusTabs: { id: OverallFilter; label: string; active: string }[] = [
  { id: "", label: "All", active: "bg-blue text-white" },
  { id: "sent", label: "Sent", active: "bg-panel-strong text-blue-strong ring-1 ring-blue/25" },
  { id: "partially_completed", label: "Partially Completed", active: "bg-warning-soft text-warning ring-1 ring-warning/30" },
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
    summary: { all: 0, sent: 0, partially_completed: 0, completed: 0 },
  });
  const [status, setStatus] = useState<OverallFilter>("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InvestigationVisitItem | null>(null);
  const [detailItems, setDetailItems] = useState<EncounterInvestigation[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [detailTick, setDetailTick] = useState(0);
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
    if (status) params.set("overall_status", status);
    if (search) params.set("q", search);
    api<InvestigationPage>(`/api/investigations?${params}`, {}, token)
      .then((data) => {
        if (!cancelled) {
          setPage(data);
          setSelected((current) => {
            if (!current) return null;
            return data.items.find((item) => item.visit_id === current.visit_id) ?? current;
          });
        }
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
  }, [token, clinicId, status, search, currentPage, uploadingId, detailTick]);

  useEffect(() => {
    if (!selected) {
      setDetailItems([]);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    api<{ items: EncounterInvestigation[] }>(
      `/api/patients/${selected.patient_id}/visits/${selected.visit_id}/investigations`,
      {},
      token,
    )
      .then((data) => {
        if (!cancelled) setDetailItems(data.items);
      })
      .catch((caught) => {
        if (!cancelled) setDetailError(messageOf(caught));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selected?.patient_id, selected?.visit_id, uploadingId, detailTick]);

  async function uploadResult(item: EncounterInvestigation, file: File) {
    if (!selected) return;
    setUploadingId(item.id);
    try {
      const body = new FormData();
      body.append("file", file);
      await api(`/api/investigations/${item.id}/result`, { method: "POST", body }, token);
      toast.success(item.result_file_url ? "Result replaced" : "Result uploaded", `${item.name} is completed for ${selected.patient_name}.`);
      setDetailTick((value) => value + 1);
    } catch (caught) {
      toast.error("Upload failed", messageOf(caught));
    } finally {
      setUploadingId(null);
    }
  }

  function printResult(item: EncounterInvestigation) {
    if (!item.result_file_url) return;
    const popup = window.open("", "_blank", "width=900,height=1000");
    if (!popup) {
      window.open(item.result_file_url, "_blank", "noopener,noreferrer");
      return;
    }
    const fileName = item.result_original_name || "Result.pdf";
    const isPdf = /\.pdf($|\?)/i.test(item.result_file_url) || /\.pdf$/i.test(fileName);
    popup.document.open();
    popup.document.write(`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(fileName)}</title>
          <style>
            body { margin: 0; font: 14px/1.45 Inter, ui-sans-serif, system-ui, sans-serif; color: #12263a; }
            header { padding: 16px 20px; border-bottom: 1px solid #e1e8ec; }
            h1 { margin: 4px 0 0; font-size: 18px; }
            .eyebrow { margin: 0; color: #0f7f91; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
            .meta { margin-top: 8px; color: #6b7f8f; font-size: 12px; }
            .frame { width: 100%; height: calc(100vh - 96px); border: 0; }
            img { display: block; max-width: 100%; margin: 16px auto; }
          </style>
        </head>
        <body>
          <header>
            <p class="eyebrow">Yaren Healthcare</p>
            <h1>${escapeHtml(item.name)} result</h1>
            <p class="meta">${escapeHtml(selected?.patient_name ?? "")} · ${escapeHtml(selected?.patient_mrn ?? "")} · ${escapeHtml(fileName)}</p>
          </header>
          ${isPdf
            ? `<iframe class="frame" src="${escapeHtml(item.result_file_url)}"></iframe>`
            : `<img src="${escapeHtml(item.result_file_url)}" alt="${escapeHtml(fileName)}" />`}
          <script>window.addEventListener("load", function () { window.focus(); window.print(); });</script>
        </body>
      </html>`);
    popup.document.close();
  }

  const pages = Math.max(1, Math.ceil(page.total / page.page_size));
  const start = page.total === 0 ? 0 : (page.page - 1) * page.page_size + 1;
  const end = Math.min(page.page * page.page_size, page.total);

  return (
    <Page
      title="Investigations"
      crumbs={[{ label: "Care" }, { label: "Investigations" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap gap-2">
            {statusTabs.map((tab) => {
              const count = tab.id ? page.summary[tab.id] : page.summary.all;
              const active = status === tab.id;
              return (
                <button
                  key={tab.id || "all"}
                  type="button"
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${active ? tab.active : "bg-surface-2 text-muted-strong hover:bg-panel hover:text-ink"}`}
                  onClick={() => setStatus(tab.id)}
                >
                  {tab.label} <span className="tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>

          <label className="relative mt-4 block">
            <span className="sr-only">Search investigations</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <SearchIcon />
            </span>
            <input
              className={`${field} pl-10`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by patient name, MRN, or test name…"
            />
          </label>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[36rem] w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Patient</th>
                  <th className="px-3 py-2">Ordered Tests</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && page.items.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-10 text-center text-muted">Loading investigations…</td></tr>
                ) : page.items.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-10 text-center text-muted">No investigations match this filter.</td></tr>
                ) : page.items.map((item) => {
                  const active = selected?.visit_id === item.visit_id;
                  return (
                    <tr key={item.visit_id} className={active ? "bg-panel/80" : "hover:bg-surface-2/70"}>
                      <td className="rounded-l-xl px-3 py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue text-xs font-bold text-white">{initials(item.patient_name)}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-blue">{item.patient_name}</span>
                            <span className="block text-xs text-muted">MRN: {item.patient_mrn}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-strong">
                        {item.test_count} test{item.test_count === 1 ? "" : "s"}
                      </td>
                      <td className="px-3 py-3"><CasePriorityPill priority={item.case_priority} /></td>
                      <td className="rounded-r-xl px-3 py-3 text-right">
                        <button
                          type="button"
                          className={`inline-flex h-9 min-w-[6.5rem] items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold transition ${active ? "bg-blue-strong text-white shadow-sm" : "bg-blue text-white hover:bg-blue-strong"}`}
                          onClick={() => setSelected(item)}
                        >
                          <EyeIcon />
                          {active ? "Viewing" : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <p>{page.total === 0 ? "Showing 0 patients" : `Showing ${start} – ${end} of ${page.total} patients`}</p>
            <div className="flex items-center gap-1">
              {Array.from({ length: pages }, (_, index) => index + 1).slice(Math.max(0, currentPage - 3), Math.max(0, currentPage - 3) + 5).map((number) => (
                <button
                  key={number}
                  type="button"
                  className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold ${number === page.page ? "bg-blue text-white" : "text-muted-strong hover:bg-surface-2"}`}
                  disabled={loading}
                  onClick={() => setCurrentPage(number)}
                >
                  {number}
                </button>
              ))}
            </div>
          </div>
      </section>

      {selected ? (
        <InvestigationDetailPanel
          item={selected}
          tests={detailItems}
          loading={detailLoading}
          error={detailError}
          canUpload={canUpload}
          uploadingId={uploadingId}
          fileRefs={fileRefs}
          onClose={() => setSelected(null)}
          onUpload={(test, file) => void uploadResult(test, file)}
          onPrint={printResult}
        />
      ) : null}
    </Page>
  );
}

function InvestigationDetailPanel({
  item,
  tests,
  loading,
  error,
  canUpload,
  uploadingId,
  fileRefs,
  onClose,
  onUpload,
  onPrint,
}: {
  item: InvestigationVisitItem;
  tests: EncounterInvestigation[];
  loading: boolean;
  error: string | null;
  canUpload: boolean;
  uploadingId: string | null;
  fileRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onClose: () => void;
  onUpload: (item: EncounterInvestigation, file: File) => void;
  onPrint: (item: EncounterInvestigation) => void;
}) {
  const patientLine = [
    item.patient_age_at_visit != null ? `${item.patient_age_at_visit} years` : null,
    item.patient_gender === "male" ? "Male" : item.patient_gender === "female" ? "Female" : item.patient_gender,
  ].filter(Boolean).join(" · ");

  return (
    <div className="triage-dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-shell/45 p-3 sm:p-6" role="presentation" onMouseDown={onClose}>
    <aside
      className="triage-dialog-panel flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface p-4 shadow-dialog sm:max-h-[calc(100dvh-3rem)] sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="investigation-detail-title"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="investigation-detail-title" className="text-lg font-bold text-ink">Investigation Details</h2>
        <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-xl leading-none text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue text-sm font-bold text-white">{initials(item.patient_name)}</span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-blue">{item.patient_name}</p>
          <p className="text-sm text-muted-strong">
            MRN: {item.patient_mrn}
            {patientLine ? <span className="text-muted"> · {patientLine}</span> : null}
          </p>
          <p className="text-sm text-muted">
            Clinic: {item.clinic_name}
            <span className="mx-2 text-line-strong">|</span>
            Room: {item.hotel_room_no || "—"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard icon={<FlaskIcon />} label="Total Tests" value={String(item.test_count)} />
        <SummaryCard icon={<PriorityMark priority={item.case_priority} />} label="Priority" value={<CasePriorityPill priority={item.case_priority} />} />
        <SummaryCard
          icon={<PlaneIcon />}
          label="Overall Status"
          value={(
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${investigationVisitStatusClass(item.overall_status)}`}>
              {investigationVisitStatusLabel(item.overall_status)}
            </span>
          )}
        />
        <SummaryCard icon={<CalendarIcon />} label="Ordered On" value={item.ordered_at ? formatDay(item.ordered_at) : "—"} />
      </div>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      <h3 className="mt-5 text-sm font-bold text-ink">Investigations ({tests.length || item.test_count})</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-[36rem] w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Test Name</th>
              <th className="px-2 py-2">Priority</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Ordered Date & Time</th>
              <th className="px-2 py-2">Result</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-2 py-8 text-center text-muted">Loading tests…</td></tr>
            ) : tests.length === 0 ? (
              <tr><td colSpan={7} className="px-2 py-8 text-center text-muted">No investigations ordered.</td></tr>
            ) : tests.map((test, index) => (
              <tr key={test.id} className="border-t border-line-soft">
                <td className="px-2 py-3 tabular-nums text-muted">{index + 1}</td>
                <td className="px-2 py-3 font-semibold text-ink">{test.name}</td>
                <td className="px-2 py-3"><TestPriorityPill priority={test.priority} /></td>
                <td className="px-2 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${investigationStatusClass(test.status)}`}>
                    <StatusMark status={test.status} />
                    {investigationStatusLabel(test.status)}
                  </span>
                </td>
                <td className="px-2 py-3 text-xs text-muted-strong">{test.ordered_at ? formatWhen(test.ordered_at) : "—"}</td>
                <td className="px-2 py-3">
                  {test.result_file_url ? (
                    <a className="inline-flex items-center gap-1 text-xs font-semibold text-danger hover:underline" href={test.result_file_url} target="_blank" rel="noreferrer">
                      <FileIcon />
                      {shortName(test.result_original_name)}
                    </a>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="px-2 py-3">
                  <div className="flex flex-nowrap items-center gap-1">
                    {canUpload && (test.status === "sent" || test.status === "completed" || test.status === "result_uploaded" || test.result_file_url) ? (
                      <>
                        <input
                          ref={(node) => { fileRefs.current[test.id] = node; }}
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) onUpload(test, file);
                            event.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          title={test.result_file_url ? "Re-upload result" : "Upload result"}
                          className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-semibold text-blue hover:bg-panel disabled:opacity-60"
                          disabled={uploadingId === test.id}
                          onClick={() => fileRefs.current[test.id]?.click()}
                        >
                          <UploadIcon />
                          {uploadingId === test.id ? "Uploading…" : test.result_file_url ? "Re-upload" : "Upload"}
                        </button>
                      </>
                    ) : null}
                    {test.result_file_url ? (
                      <>
                        <IconAction label="View result" href={test.result_file_url}>
                          <EyeIcon />
                        </IconAction>
                        <IconAction label="Print result" onClick={() => onPrint(test)}>
                          <PrintIcon />
                        </IconAction>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </aside>
    </div>
  );
}

function IconAction({
  label,
  href,
  onClick,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const className = "grid h-8 w-8 place-items-center rounded-lg border border-line-strong bg-surface text-blue hover:bg-panel";
  if (href) {
    return (
      <a className={className} href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={className} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-line-soft bg-surface-2/50 px-2.5 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span className="text-blue">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 text-sm font-bold text-ink">{value}</div>
    </div>
  );
}

function TestPriorityPill({ priority }: { priority?: InvestigationPriority | null }) {
  const tone = priority === "emergency"
    ? "bg-danger-soft text-danger"
    : priority === "urgent"
      ? "bg-warning-soft text-warning"
      : priority === "normal"
        ? "bg-success-soft text-success"
        : "bg-surface-2 text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {priority === "normal" ? <StableMark /> : priority ? <AlertMark /> : null}
      {investigationPriorityLabel(priority)}
    </span>
  );
}

function CasePriorityPill({ priority }: { priority?: CasePriority | null }) {
  if (!priority) {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">—</span>;
  }
  const tone = priority === "emergency"
    ? "bg-danger-soft text-danger"
    : priority === "urgent"
      ? "bg-warning-soft text-warning"
      : "bg-success-soft text-success";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      <PriorityMark priority={priority} />
      {casePriorityLabel(priority)}
    </span>
  );
}

function PriorityMark({ priority }: { priority?: CasePriority | null }) {
  if (priority === "stable") return <StableMark />;
  return <AlertMark />;
}

function StableMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.5l2.2 2.2 4.8-5.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M12 3.2 22 20.2H2L12 3.2Zm0 6.2a.9.9 0 0 0-.9.9v4.2a.9.9 0 1 0 1.8 0V10.3a.9.9 0 0 0-.9-.9Zm0 8.2a1.05 1.05 0 1 0 0 2.1 1.05 1.05 0 0 0 0-2.1Z" />
    </svg>
  );
}

function StatusMark({ status }: { status?: string }) {
  if (status === "completed" || status === "result_uploaded") {
    return (
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M5 12.5 9.2 17 19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return <PlaneIcon />;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function shortName(name?: string | null) {
  const value = name?.trim();
  if (!value) return "Result.pdf";
  return value.length > 18 ? `${value.slice(0, 16)}…` : value;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16.5 20 20.5" strokeLinecap="round" />
    </svg>
  );
}

function FlaskIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M9 3h6M10 3v6L5.5 18.2A3 3 0 0 0 8.1 22h7.8a3 3 0 0 0 2.6-3.8L14 9V3" strokeLinejoin="round" />
    </svg>
  );
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M21.5 4.2 3.2 11.1c-.8.3-.8 1.4.1 1.6l5.2 1.3 1.4 5.1c.2.8 1.3.9 1.7.2l2.2-3.6 5.2 4.1c.6.5 1.6.1 1.7-.7l2.2-13.2c.2-.9-.7-1.6-1.4-1.3Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M4 10h16" strokeLinecap="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14 3.5V9h5" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 16V5M8 8.5 12 4.5 16 8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19.5h14" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2.5 12S6.2 6.5 12 6.5 21.5 12 21.5 12 17.8 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
    </svg>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
