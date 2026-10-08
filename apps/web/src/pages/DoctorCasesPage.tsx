import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api, type DoctorCaseDetail, type DoctorCasePage, type TriageCategory, type User } from "../api";
import { canAct } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { DataTable, Filters, Page, field, label, messageOf, secondary, th } from "./ui";

const pageSize = 20;

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
  other: "Other",
};

export function DoctorCasesPage({ token, actor }: { token: string; actor: User }) {
  const { clinicId } = useActiveClinic();
  const [result, setResult] = useState<DoctorCasePage>({ items: [], total: 0, page: 1, page_size: pageSize });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
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
  const columns = seesAll ? 7 : 6;

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
  }, [token, page, search, clinicId]);

  return (
    <Page
      title="To doctor"
      description={seesAll ? "Visits sent to a doctor from triage." : "Visits triage assigned to you."}
      crumbs={[{ label: "Care" }, { label: "To doctor" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Filters>
        <label className={label}>Search<input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by patient, MRN, or complaint" /></label>
      </Filters>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        {loading ? "Loading" : result.total === 0 ? "0 shown" : `Showing ${start}–${end} of ${result.total}`}
      </p>
      <DataTable>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>Patient</th>
            <th className={th}>Clinic</th>
            <th className={th}>Complaint</th>
            <th className={th}>Category</th>
            {seesAll ? <th className={th}>Doctor</th> : null}
            <th className={th}>Sent</th>
            <th className={th}>Triage</th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-muted" colSpan={columns}>
                {search ? "No cases match this search." : seesAll ? "No visits have been sent to a doctor." : "No visits have been assigned to you."}
              </td>
            </tr>
          ) : result.items.map((row) => (
            <tr
              key={row.id}
              className={`cursor-pointer border-t border-line-soft hover:bg-surface-2 ${selectedId === row.id ? "bg-panel" : ""}`}
              onClick={() => setSelectedId(row.id)}
            >
              <td className="px-4 py-3 font-semibold">
                {row.patient_name}
                <span className="mt-0.5 block font-mono text-xs font-normal text-muted">{row.patient_mrn}</span>
              </td>
              <td className="px-4 py-3">{row.clinic_name}<span className="block text-xs text-muted">{row.hotel_name}</span></td>
              <td className="max-w-xs px-4 py-3 text-sm">{row.chief_complaint || "—"}</td>
              <td className="px-4 py-3">{row.triage_category ? categoryLabel[row.triage_category] : "—"}</td>
              {seesAll ? <td className="px-4 py-3">{row.assigned_doctor_name || "—"}</td> : null}
              <td className="px-4 py-3 text-sm">{row.triage_completed_at ? formatWhen(row.triage_completed_at) : "—"}</td>
              <td className="px-4 py-3 text-sm font-semibold text-blue">View</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {selectedId ? (
        <TriageRecord
          detail={detail}
          loading={detailLoading}
          error={detailError}
          canOpenVisit={canOpenVisit}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
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
  const history = (detail?.relevant_history ?? []).map((item) => historyLabel[item] ?? item);
  if (detail?.relevant_history_other) history.push(detail.relevant_history_other);

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
        className="triage-dialog-panel max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-[0_24px_60px_rgba(11,28,46,0.28)] sm:p-6"
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
                {detail.patient_mrn} · {detail.clinic_name}
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
          <div className="mt-5 space-y-3">
            <Section index={1} title="Chief complaint" icon={<ComplaintIcon />} body={detail.chief_complaint} />
            <Section index={2} title="Vital signs" icon={<VitalsIcon />}>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Vital icon={<TempIcon />} label="Temp" value={detail.temperature_c == null ? "—" : `${detail.temperature_c} °C`} alert={abnormalVital("temp", detail.temperature_c)} />
                <Vital icon={<PulseIcon />} label="Pulse" value={detail.pulse == null ? "—" : `${detail.pulse} /min`} alert={abnormalVital("pulse", detail.pulse)} />
                <Vital icon={<LungsIcon />} label="RR" value={detail.respiratory_rate == null ? "—" : `${detail.respiratory_rate} /min`} alert={abnormalVital("rr", detail.respiratory_rate)} />
                <Vital icon={<OxygenIcon />} label="SpO2" value={detail.spo2 == null ? "—" : `${detail.spo2}%`} alert={abnormalVital("spo2", detail.spo2)} />
              </dl>
            </Section>
            <Section index={3} title="Allergies" icon={<AllergyIcon />} body={listText(detail.allergies.map((item) => item.reaction ? `${item.name} (${item.reaction})` : item.name))} />
            <Section index={4} title="Medications" icon={<MedsIcon />} body={listText(detail.medications.map((item) => item.name))} />
            <Section index={5} title="Relevant history" icon={<HistoryIcon />} body={history.length ? history.join(", ") : null} />
            <Section index={6} title="Initial assessment" icon={<NotesIcon />} body={detail.initial_assessment} />
            <Section index={7} title="Triage category" icon={<CategoryIcon />} body={detail.triage_category ? categoryLabel[detail.triage_category] : null} />
            <Section index={8} title="Assigned to" icon={<AssignIcon />} body={[
              detail.assigned_doctor_name,
              detail.triage_completed_at ? `Sent ${formatWhen(detail.triage_completed_at)}` : null,
              detail.completed_by_name ? `by ${detail.completed_by_name}` : null,
            ].filter(Boolean).join(" · ") || null} />
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button type="button" className={`${secondary} w-full sm:w-auto`} onClick={onClose}>Close</button>
              {canOpenVisit ? (
                <Link className={`${secondary} w-full sm:w-auto`} to={`/patients/${detail.patient_id}/visits/${detail.id}`}>Open visit</Link>
              ) : null}
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
  children,
}: {
  index: number;
  title: string;
  icon: ReactNode;
  body?: string | null;
  children?: ReactNode;
}) {
  const delay = `${70 + (index - 1) * 60}ms`;
  return (
    <div className="triage-rise rounded-xl bg-surface-2/70 px-3 py-3" style={{ animationDelay: delay }}>
      <div className="mb-2 flex items-center gap-2.5">
        <span className="triage-badge grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue text-xs font-bold text-white shadow-sm" style={{ animationDelay: delay }}>{index}</span>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-panel text-blue">{icon}</span>
        <h3 className="font-semibold text-blue">{title}</h3>
      </div>
      {children ?? <p className="whitespace-pre-wrap pl-[4.25rem] text-sm text-ink">{body?.trim() ? body : "None recorded"}</p>}
    </div>
  );
}

function Vital({ icon, label: name, value, alert }: { icon: ReactNode; label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${alert ? "bg-danger-soft" : "bg-surface"}`}>
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

function VitalsIcon() {
  return <Icon><path d="M3 12h3l2-5 3 10 2-5h8" /></Icon>;
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

function CategoryIcon() {
  return <Icon><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /></Icon>;
}

function AssignIcon() {
  return <Icon><path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" /><circle cx="10" cy="8" r="3" /></Icon>;
}

function listText(items: string[]) {
  const names = items.map((item) => item.trim()).filter(Boolean);
  return names.length ? names.join(", ") : null;
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
