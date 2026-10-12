import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { api, visitTypeLabel, waitMinutes, type DoctorCaseDetail, type DoctorCasePage, type DoctorCaseSummary, type GeneralSettings, type TriageCategory, type User } from "../api";
import { canAct } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { DataTable, Page, field, messageOf, secondary, th } from "./ui";

const pageSize = 10;
const emptySummary: DoctorCaseSummary = {
  waiting: 0,
  today: 0,
  to_see_now: 0,
  emergency: 0,
  urgent: 0,
  normal: 0,
  average_wait_minutes: 0,
};

type CaseFocus = "" | "today" | "now" | "emergency" | "urgent" | "normal";

const categoryLabel: Record<TriageCategory, string> = {
  emergency: "Emergency",
  urgent: "Urgent",
  normal: "Normal",
};

const historyLabel: Record<string, string> = {
  hypertension: "Hypertension",
  copd: "COPD",
  diabetes_mellitus: "Diabetes mellitus",
  immunosuppression: "Immunosuppression",
  asthma: "Asthma",
  hypothyroidism: "Hypothyroidism",
  cardiac_disease: "Cardiac disease",
};

export function DoctorCasesPage({ token, actor }: { token: string; actor: User }) {
  const { clinicId } = useActiveClinic();
  const [result, setResult] = useState<DoctorCasePage>({ items: [], total: 0, page: 1, page_size: pageSize });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<CaseFocus>("");
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [waitSettings, setWaitSettings] = useState<GeneralSettings>({ triage_wait_minutes: 20, doctor_wait_minutes: 20, clinics: [] });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DoctorCaseDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const requestId = useRef(0);
  const seesAll = actor.type === "super-admin" || actor.type === "admin";
  const canOpenVisit = canAct(actor, "visit", "view");
  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  const start = result.total === 0 ? 0 : (result.page - 1) * pageSize + 1;
  const end = Math.min(result.page * pageSize, result.total);
  const columns = seesAll ? 6 : 5;
  const summary = result.summary ?? emptySummary;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    api<GeneralSettings>("/api/settings", {}, token)
      .then(setWaitSettings)
      .catch(() => undefined);
  }, [token]);

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
    setSelectedId(null);
    setDetail(null);
  }, [clinicId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    api<DoctorCaseDetail>(`/api/doctor-cases/${selectedId}`, {}, token)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((caught) => {
        if (!cancelled) {
          setDetail(null);
          setDetailError(messageOf(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, token]);

  useEffect(() => {
    const id = ++requestId.current;
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set("q", search);
    if (focus) params.set("focus", focus);
    if (clinicId) params.set("clinic_id", clinicId);
    setLoading(true);
    setError(null);
    api<DoctorCasePage>(`/api/doctor-cases?${params}`, {}, token)
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
  }, [token, page, search, focus, clinicId]);

  const averageTarget = clinicId ? waitMinutes(waitSettings, clinicId, "doctor") : waitSettings.doctor_wait_minutes;
  const clinicHasOwnTarget = Boolean(clinicId && waitSettings.clinics.some((item) => item.clinic_id === clinicId));
  const averageHint = clinicHasOwnTarget ? "Set for this clinic" : "Set for all clinics";

  function chooseFocus(next: CaseFocus) {
    setFocus((current) => (current === next ? "" : next));
    setPage(1);
  }

  return (
    <Page
      title="Doctor Dashboard"
      description="Patients waiting to see the doctor after triage."
      crumbs={[{ label: "Care" }, { label: "Doctor Dashboard" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Patients today" value={summary.today} hint="Sent from triage today" tone="blue" active={focus === "today"} onClick={() => chooseFocus("today")} />
        <StatCard label="To see now" value={summary.to_see_now} hint="Emergency and urgent" tone="rose" active={focus === "now"} onClick={() => chooseFocus("now")} />
        <StatCard label="Average waiting time" value={waitedLabel(averageTarget)} hint={averageHint} tone="amber" />
      </div>
      <section className="rounded-2xl bg-surface p-4 shadow-[0_8px_24px_rgba(16,42,67,0.06)] sm:p-5">
        <h2 className="text-base font-bold text-ink">Patient queue</h2>
        <p className="mt-0.5 text-sm text-muted">Waiting to see the doctor</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <QueueChip label="All" count={summary.waiting} active={focus === ""} onClick={() => chooseFocus("")} />
          <QueueChip label="To see now" count={summary.to_see_now} active={focus === "now"} onClick={() => chooseFocus("now")} dot="bg-danger" />
          <QueueChip label="Emergency" count={summary.emergency} active={focus === "emergency"} onClick={() => chooseFocus("emergency")} dot="bg-danger" />
          <QueueChip label="Urgent" count={summary.urgent} active={focus === "urgent"} onClick={() => chooseFocus("urgent")} dot="bg-blue" />
          <QueueChip label="Normal" count={summary.normal} active={focus === "normal"} onClick={() => chooseFocus("normal")} dot="bg-success" />
        </div>
        <label className="relative mt-4 block max-w-xl">
          <span className="sr-only">Search queue</span>
          <input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, MRN, or hotel" />
        </label>
        <div className="mt-4">
          <DataTable>
            <thead className="bg-surface-2">
              <tr>
                <th className={th}>#</th>
                <th className={th}>Patient</th>
                <th className={th}>Triage</th>
                <th className={th}>Waiting time</th>
                {seesAll ? <th className={th}>Doctor</th> : null}
                <th className={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {result.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-muted" colSpan={columns}>
                    {loading ? "Loading queue…" : search || focus ? "No patients match this queue." : seesAll ? "No visits have been sent to a doctor." : "No visits have been assigned to you."}
                  </td>
                </tr>
              ) : result.items.map((row, index) => {
                const elapsed = row.triage_completed_at ? now - new Date(row.triage_completed_at).getTime() : null;
                const over = elapsed != null && elapsed >= waitMinutes(waitSettings, row.clinic_id, "doctor") * 60_000;
                return (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-t border-line-soft hover:bg-surface-2 ${selectedId === row.id ? "bg-panel" : ""}`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="px-4 py-3 text-sm text-muted">{start + index}</td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{row.patient_name}</span>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink">{visitTypeLabel(row.visit_type)}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        <span className="font-mono">{row.patient_mrn}</span>
                        {" · "}
                        {row.hotel_room_no ? `Room ${row.hotel_room_no}` : "No room"}
                        {" · "}
                        {row.hotel_name}
                      </span>
                    </td>
                    <td className="px-4 py-3"><CategoryPill category={row.triage_category} /></td>
                    <td className="px-4 py-3 text-sm">
                      {elapsed == null ? "—" : (
                        <>
                          <span className={`font-mono text-sm font-semibold tabular-nums ${over ? "text-danger" : "text-ink"}`}>{clockLabel(elapsed)}</span>
                          {over ? <span className="mt-0.5 block text-xs text-danger">Over the target</span> : null}
                        </>
                      )}
                    </td>
                    {seesAll ? <td className="px-4 py-3 text-sm">{row.assigned_doctor_name || "—"}</td> : null}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-strong bg-surface text-ink hover:bg-surface-2"
                          aria-label="View triage"
                          title="View triage"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(row.id);
                          }}
                        >
                          <EyeIcon />
                        </button>
                        <StartEncounterLink to={`/patients/to-doctor/${row.id}/encounter`} onClick={(event) => event.stopPropagation()} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-strong">{loading ? "Loading" : result.total === 0 ? "0 patients" : `Showing ${start}–${end} of ${result.total}`}</p>
          <div className="flex items-center gap-2">
            <button type="button" className={`${secondary} px-3 py-2 disabled:opacity-50`} disabled={loading || result.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <span className="grid h-9 min-w-9 place-items-center rounded-lg bg-blue px-2 text-sm font-semibold text-white">{result.total === 0 ? 0 : result.page}</span>
            <button type="button" className={`${secondary} px-3 py-2 disabled:opacity-50`} disabled={loading || result.page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </div>
      </section>
      {selectedId ? (
        <TriageRecord
          detail={detail}
          loading={detailLoading}
          error={detailError}
          canOpenVisit={canOpenVisit}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </Page>
  );
}

function StartEncounterLink({ to, onClick }: { to: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue px-3 text-sm font-semibold text-white hover:bg-blue-strong"
    >
      Start encounter
      <ArrowIcon />
    </Link>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function TriageRecord({
  detail,
  loading,
  error,
  canOpenVisit,
  onClose,
}: {
  detail: DoctorCaseDetail | null;
  loading: boolean;
  error: string | null;
  canOpenVisit: boolean;
  onClose: () => void;
}) {
  const history = (detail?.relevant_history ?? []).filter((item) => item !== "other").map((item) => historyLabel[item] ?? item);
  for (const item of detail?.relevant_history_items ?? []) {
    if (item.name?.trim()) history.push(item.name.trim());
  }
  const previousOther = detail?.relevant_history_other?.trim();
  if (previousOther && !history.some((item) => item.toLowerCase() === previousOther.toLowerCase())) history.push(previousOther);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="triage-dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-shell/45 p-4" role="presentation" onMouseDown={onClose}>
      <section
        className="triage-dialog-panel max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-2xl bg-surface p-4 shadow-[0_24px_60px_rgba(11,28,46,0.28)] sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="triage-record-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue">Triage record</p>
            <h2 id="triage-record-title" className="mt-1 text-lg font-semibold text-ink">{detail?.patient_name ?? "Triage record"}</h2>
            {detail ? (
              <p className="mt-0.5 text-sm text-muted">
                {detail.patient_mrn} · {visitTypeLabel(detail.visit_type)} · {detail.clinic_name}
                {detail.patient_age_at_visit != null ? ` · ${detail.patient_age_at_visit} yrs` : ""}
              </p>
            ) : null}
          </div>
          {detail?.triage_category ? (
            <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-blue">{categoryLabel[detail.triage_category]}</span>
          ) : null}
          <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {loading ? <p className="mt-6 text-sm text-muted">Loading triage…</p> : null}
        {error ? <p className="mt-6 text-sm text-danger">{error}</p> : null}
        {detail && !loading ? (
          <div className="mt-4">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Vital icon={<TempIcon />} label="Temp" value={detail.temperature_c == null ? "—" : `${detail.temperature_c} °C`} alert={abnormalVital("temp", detail.temperature_c)} />
              <Vital icon={<PulseIcon />} label="Pulse" value={detail.pulse == null ? "—" : `${detail.pulse} /min`} alert={abnormalVital("pulse", detail.pulse)} />
              <Vital icon={<LungsIcon />} label="RR" value={detail.respiratory_rate == null ? "—" : `${detail.respiratory_rate} /min`} alert={abnormalVital("rr", detail.respiratory_rate)} />
              <Vital icon={<OxygenIcon />} label="SpO2" value={detail.spo2 == null ? "—" : `${detail.spo2}%`} alert={abnormalVital("spo2", detail.spo2)} />
            </dl>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Section index={1} title="Chief complaint" icon={<ComplaintIcon />} body={detail.chief_complaint} />
              <Section index={2} title="Initial assessment" icon={<NotesIcon />} body={detail.initial_assessment} />
              <Section index={3} title="Allergies" icon={<AllergyIcon />} body={listText(detail.allergies.map((item) => item.reaction ? `${item.name} (${item.reaction})` : item.name))} />
              <Section index={4} title="Medications" icon={<MedsIcon />} body={listText(detail.medications.map((item) => item.name))} />
              <Section index={5} title="Relevant history" icon={<HistoryIcon />} body={history.length ? history.join(", ") : null} />
              <Section index={6} title="Assigned to" icon={<AssignIcon />} body={[
                detail.assigned_doctor_name,
                detail.triage_completed_at ? `Sent ${formatWhen(detail.triage_completed_at)}` : null,
                detail.completed_by_name ? `by ${detail.completed_by_name}` : null,
              ].filter(Boolean).join(" · ") || null} />
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:items-center sm:justify-between">
              {canOpenVisit ? (
                <Link className="text-sm font-semibold text-blue hover:underline" to={`/patients/${detail.patient_id}/visits/${detail.id}`}>Open visit</Link>
              ) : <span />}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" className={secondary} onClick={onClose}>Close</button>
                <StartEncounterLink to={`/patients/to-doctor/${detail.id}/encounter`} />
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Section({
  index,
  title,
  icon,
  body,
}: {
  index: number;
  title: string;
  icon: ReactNode;
  body?: string | null;
}) {
  const delay = `${40 + (index - 1) * 40}ms`;
  return (
    <div className="triage-rise min-w-0 rounded-xl bg-surface-2 px-3 py-2" style={{ animationDelay: delay }}>
      <div className="flex items-center gap-2">
        <span className="triage-badge grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue text-[11px] font-bold text-white" style={{ animationDelay: delay }}>{index}</span>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-panel text-blue">{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-blue">{title}</h3>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-ink">{body?.trim() ? body : "None recorded"}</p>
    </div>
  );
}

function Vital({ icon, label: name, value, alert }: { icon: ReactNode; label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl px-2.5 py-1.5 ${alert ? "bg-danger-soft" : "bg-surface-2"}`}>
      <dt className={`inline-flex items-center gap-1.5 text-xs ${alert ? "text-danger" : "text-muted"}`}><span className={alert ? "text-danger" : "text-blue"}>{icon}</span>{name}</dt>
      <dd className={`mt-0.5 text-sm font-semibold ${alert ? "text-danger" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function abnormalVital(kind: "temp" | "pulse" | "rr" | "spo2", raw: number | string | null) {
  if (raw == null || raw === "") return false;
  const value = Number(raw);
  if (!Number.isFinite(value)) return false;
  if (kind === "temp") return value >= 38;
  if (kind === "pulse") return value >= 100;
  if (kind === "rr") return value >= 22;
  return value < 94;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function ComplaintIcon() {
  return <Icon><path d="M5 5h14v10H9l-4 4V5z" /><path d="M8 9h8" /><path d="M8 12h5" /></Icon>;
}

function TempIcon() {
  return <Icon><path d="M10 14.5V6a2 2 0 1 1 4 0v8.5a3 3 0 1 1-4 0z" /><path d="M12 17v-6" /></Icon>;
}

function PulseIcon() {
  return <Icon><path d="M12 19.5s-6.5-4.1-6.5-9A3.5 3.5 0 0 1 12 7.2 3.5 3.5 0 0 1 18.5 10.5c0 4.9-6.5 9-6.5 9z" /></Icon>;
}

function LungsIcon() {
  return <Icon><path d="M12 4v7" /><path d="M12 11c-2 0-5 1.2-5 5.5S9.5 21 12 21" /><path d="M12 11c2 0 5 1.2 5 5.5S14.5 21 12 21" /></Icon>;
}

function OxygenIcon() {
  return <Icon><circle cx="12" cy="12" r="8" /><path d="M9 12h6" /><path d="M12 9v6" /></Icon>;
}

function AllergyIcon() {
  return <Icon><path d="M12 3l2.2 4.5L19 8.2l-3.5 3.4.8 4.9L12 14.8 7.7 16.5l.8-4.9L5 8.2l4.8-.7L12 3z" /></Icon>;
}

function MedsIcon() {
  return <Icon><rect x="8" y="3" width="8" height="18" rx="4" /><path d="M8 12h8" /></Icon>;
}

function HistoryIcon() {
  return <Icon><path d="M4 5h16v14H4z" /><path d="M8 9h8" /><path d="M8 13h5" /></Icon>;
}

function NotesIcon() {
  return <Icon><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M9 12h6" /></Icon>;
}

function AssignIcon() {
  return <Icon><path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" /><circle cx="10" cy="8" r="3" /></Icon>;
}

function listText(items: string[]) {
  const names = items.map((item) => item.trim()).filter(Boolean);
  return names.length ? names.join(", ") : null;
}

function StatCard({
  label: title,
  value,
  hint,
  tone,
  active = false,
  alert = false,
  onClick,
}: {
  label: string;
  value: number | string;
  hint: string;
  tone: "blue" | "rose" | "amber";
  active?: boolean;
  alert?: boolean;
  onClick?: () => void;
}) {
  const toneClass = tone === "rose" ? "bg-danger-soft text-danger" : tone === "amber" ? "bg-panel text-blue" : "bg-panel text-blue";
  const body = (
    <>
      <span className={`grid h-10 w-10 place-items-center rounded-full ${toneClass}`} aria-hidden="true">
        {tone === "amber" ? <ClockIcon /> : tone === "rose" ? <AlertIcon /> : <PeopleIcon />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-muted">{title}</span>
        <span className={`mt-0.5 block text-2xl font-bold tracking-tight ${alert ? "text-danger" : "text-ink"}`}>{value}</span>
        <span className={`mt-0.5 block text-xs ${alert ? "text-danger" : "text-muted"}`}>{hint}</span>
      </span>
    </>
  );
  const className = `flex items-center gap-3 rounded-2xl bg-surface px-4 py-4 text-left shadow-[0_8px_24px_rgba(16,42,67,0.06)] ${onClick ? "transition hover:bg-surface-2" : ""} ${active ? "ring-2 ring-blue" : ""}`;
  if (!onClick) return <div className={className}>{body}</div>;
  return <button type="button" className={className} onClick={onClick}>{body}</button>;
}

function QueueChip({
  label: title,
  count,
  active,
  dot,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${active ? "border-blue bg-blue text-white" : "border-line-strong bg-surface text-ink hover:bg-surface-2"}`}
    >
      {dot ? <span className={`h-2 w-2 rounded-full ${active ? "bg-white" : dot}`} aria-hidden="true" /> : null}
      {title}
      <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${active ? "bg-white/20 text-white" : "bg-surface-3 text-muted-strong"}`}>{count}</span>
    </button>
  );
}

function CategoryPill({ category }: { category: TriageCategory | null }) {
  if (category === "emergency" || category === "urgent") {
    return <span className="inline-flex rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">{categoryLabel[category]}</span>;
  }
  if (category === "normal") {
    return <span className="inline-flex rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">{categoryLabel.normal}</span>;
  }
  return <span className="text-muted">—</span>;
}

function clockLabel(ms: number) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

function waitedLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M16 14.2a4.5 4.5 0 0 1 4.5 4.3" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </svg>
  );
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
