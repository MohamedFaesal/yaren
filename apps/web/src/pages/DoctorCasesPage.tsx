import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { api, investigationPriorityClass, investigationPriorityLabel, investigationStatusClass, investigationStatusLabel, monitoringStatusClass, monitoringStatusLabel, visitStatusLabel, visitTypeLabel, waitMinutes, type DoctorCase, type DoctorCaseDetail, type DoctorCasePage, type DoctorCaseSummary, type GeneralSettings, type MonitoringObservation, type TriageCategory, type User, type VisitCareStatus, type VisitInvestigation } from "../api";
import { canAct } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { Page, field, messageOf, secondary } from "./ui";
import { encounterStepSaved } from "./EncounterPage";

const pageSize = 10;
const emptySummary: DoctorCaseSummary = {
  waiting: 0,
  today: 0,
  to_see_now: 0,
  emergency: 0,
  urgent: 0,
  normal: 0,
  diagnosed: 0,
  waiting_for_investigation: 0,
  average_wait_minutes: 0,
};

type CaseFocus = "" | "today" | "now" | "emergency" | "urgent" | "normal" | "diagnosed" | "waiting_for_investigation";

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
  const [observations, setObservations] = useState<MonitoringObservation[]>([]);
  const [observationsLoading, setObservationsLoading] = useState(false);
  const [investigations, setInvestigations] = useState<VisitInvestigation[]>([]);
  const [investigationsLoading, setInvestigationsLoading] = useState(false);
  const requestId = useRef(0);
  const seesAll = actor.type === "super-admin" || actor.type === "admin";
  const canOpenVisit = canAct(actor, "visit", "view");
  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  const start = result.total === 0 ? 0 : (result.page - 1) * pageSize + 1;
  const end = Math.min(result.page * pageSize, result.total);
  const summary = result.summary ?? emptySummary;
  const selected = result.items.find((item) => item.id === selectedId) ?? null;

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
      setObservations([]);
      setInvestigations([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setObservations([]);
    setInvestigations([]);
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
    if (!detail) return;
    let cancelled = false;
    setObservationsLoading(true);
    api<{ items: MonitoringObservation[] }>(
      `/api/patients/${detail.patient_id}/visits/${detail.id}/monitoring/observations`,
      {},
      token,
    )
      .then((data) => {
        if (!cancelled) setObservations(data.items);
      })
      .catch(() => {
        if (!cancelled) setObservations([]);
      })
      .finally(() => {
        if (!cancelled) setObservationsLoading(false);
      });
    setInvestigationsLoading(true);
    api<{ items: VisitInvestigation[] }>(
      `/api/patients/${detail.patient_id}/visits/${detail.id}/investigations`,
      {},
      token,
    )
      .then((data) => {
        if (!cancelled) setInvestigations(data.items);
      })
      .catch(() => {
        if (!cancelled) setInvestigations([]);
      })
      .finally(() => {
        if (!cancelled) setInvestigationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail, token]);

  useEffect(() => {
    if (result.items.length === 0) return;
    if (selectedId && result.items.some((item) => item.id === selectedId)) return;
    setSelectedId(result.items[0].id);
  }, [result.items, selectedId]);

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
      description="Patients waiting to see the doctor, plus diagnosed and waiting-for-investigation visits."
      crumbs={[{ label: "Care" }, { label: "Doctor Dashboard" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Patients today" value={summary.today} hint="Sent from triage today" tone="blue" active={focus === "today"} onClick={() => chooseFocus("today")} />
        <StatCard label="To see now" value={summary.to_see_now} hint="Emergency and urgent" tone="rose" active={focus === "now"} onClick={() => chooseFocus("now")} />
        <StatCard label="Average waiting time" value={waitedLabel(averageTarget)} hint={averageHint} tone="amber" />
      </div>
      <section className="rounded-2xl border border-line bg-surface shadow-card">
        <div className="border-b border-line-soft p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            <QueueChip label="All" count={summary.waiting + summary.diagnosed + summary.waiting_for_investigation} active={focus === ""} onClick={() => chooseFocus("")} />
            <QueueChip label="To see now" count={summary.to_see_now} active={focus === "now"} onClick={() => chooseFocus("now")} dot="bg-danger" />
            <QueueChip label="Emergency" count={summary.emergency} active={focus === "emergency"} onClick={() => chooseFocus("emergency")} dot="bg-danger" />
            <QueueChip label="Urgent" count={summary.urgent} active={focus === "urgent"} onClick={() => chooseFocus("urgent")} dot="bg-warning" />
            <QueueChip label="Normal" count={summary.normal} active={focus === "normal"} onClick={() => chooseFocus("normal")} dot="bg-success" />
            <QueueChip label="Diagnosed" count={summary.diagnosed} active={focus === "diagnosed"} onClick={() => chooseFocus("diagnosed")} dot="bg-success" />
            <QueueChip label="Waiting for investigation" count={summary.waiting_for_investigation} active={focus === "waiting_for_investigation"} onClick={() => chooseFocus("waiting_for_investigation")} dot="bg-blue" />
          </div>
          <label className="relative mt-4 block max-w-xl">
            <span className="sr-only">Search queue</span>
            <input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, MRN, or hotel" />
          </label>
        </div>
        <div className="grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
          <div className="border-b border-line-soft lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
            {result.items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted">
                {loading ? "Loading queue…" : search || focus ? "No patients match this queue." : seesAll ? "No visits have been sent to a doctor." : "No visits have been assigned to you."}
              </p>
            ) : result.items.map((row) => {
              const timing = waitFor(row, now);
              const over = timing.elapsed != null && timing.elapsed >= waitMinutes(waitSettings, row.clinic_id, "doctor") * 60_000;
              const readingCount = (result.monitoring ?? []).filter((item) => item.visit_id === row.id).length;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`block w-full border-b border-l-4 border-b-line-soft px-4 py-3 text-left last:border-b-0 ${triageEdge(row.triage_category)} ${selectedId === row.id ? triageWash(row.triage_category) : "bg-surface hover:bg-surface-2"}`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{row.patient_name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        <span className="font-mono">{row.patient_mrn}</span>
                        {" · "}
                        {row.hotel_room_no ? `Room ${row.hotel_room_no}` : "No room"}
                        {seesAll && row.assigned_doctor_name ? ` · ${row.assigned_doctor_name}` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-sm font-semibold tabular-nums ${over ? "bg-danger-soft text-danger" : "text-ink"}`}>
                      {timing.elapsed == null ? "—" : clockLabel(timing.elapsed)}
                    </span>
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    <CategoryPill category={row.triage_category} />
                    <QueueStatus status={row.status} />
                    {row.monitoring_status === "completed" || row.monitoring_status === "in_progress" ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${monitoringStatusClass(row.monitoring_status)}`}>
                        {readingCount > 0 ? `${readingCount} reading${readingCount === 1 ? "" : "s"}` : monitoringStatusLabel(row.monitoring_status)}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-3 py-3">
              <p className="text-xs text-muted-strong">{loading ? "Loading" : result.total === 0 ? "0 patients" : `${start}–${end} of ${result.total}`}</p>
              <div className="flex items-center gap-1.5">
                <button type="button" className={`${secondary} px-2.5 py-1.5 text-xs disabled:opacity-50`} disabled={loading || result.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
                <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-blue px-1.5 text-xs font-semibold text-white">{result.total === 0 ? 0 : result.page}</span>
                <button type="button" className={`${secondary} px-2.5 py-1.5 text-xs disabled:opacity-50`} disabled={loading || result.page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button>
              </div>
            </div>
          </div>
          <CasePanel
            row={selected}
            detail={detail}
            loading={detailLoading}
            error={detailError}
            observations={observationsLoading && observations.length === 0 ? (result.monitoring ?? []).filter((item) => item.visit_id === selectedId) : observations}
            observationsLoading={observationsLoading}
            investigations={investigations}
            investigationsLoading={investigationsLoading}
            now={now}
            waitMinutesTarget={selected ? waitMinutes(waitSettings, selected.clinic_id, "doctor") : waitSettings.doctor_wait_minutes}
            canOpenVisit={canOpenVisit}
            seesAll={seesAll}
          />
        </div>
      </section>
    </Page>
  );
}

function closedCase(status: VisitCareStatus) {
  return status === "diagnosed" || status === "waiting_for_investigation";
}

function waitFor(row: DoctorCase, now: number) {
  const done = Boolean(closedCase(row.status) && row.triage_completed_at && row.status_changed_at);
  const elapsed = done
    ? Math.max(0, new Date(row.status_changed_at).getTime() - new Date(row.triage_completed_at!).getTime())
    : row.triage_completed_at
      ? Math.max(0, now - new Date(row.triage_completed_at).getTime())
      : null;
  return { done, elapsed };
}

function encounterActionLabel(status: VisitCareStatus, visitId: string) {
  if (closedCase(status)) return "View encounter";
  return encounterStepSaved(visitId) ? "Resume Encounter" : "Start encounter";
}

function QueueStatus({ status }: { status: VisitCareStatus }) {
  const tone = status === "diagnosed" ? "bg-success-soft text-success" : "bg-panel text-blue";
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{visitStatusLabel(status)}</span>;
}

function StartEncounterLink({ to, label = "Start encounter", onClick }: { to: string; label?: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue px-3 text-sm font-semibold text-white hover:bg-blue-strong"
    >
      {label}
      <ArrowIcon />
    </Link>
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


function CasePanel({
  row,
  detail,
  loading,
  error,
  observations,
  observationsLoading,
  investigations,
  investigationsLoading,
  now,
  waitMinutesTarget,
  canOpenVisit,
  seesAll,
}: {
  row: DoctorCase | null;
  detail: DoctorCaseDetail | null;
  loading: boolean;
  error: string | null;
  observations: MonitoringObservation[];
  observationsLoading: boolean;
  investigations: VisitInvestigation[];
  investigationsLoading: boolean;
  now: number;
  waitMinutesTarget: number;
  canOpenVisit: boolean;
  seesAll: boolean;
}) {
  const chart = detail ?? row;
  const history = (detail?.relevant_history ?? []).filter((item) => item !== "other").map((item) => historyLabel[item] ?? item);
  for (const item of detail?.relevant_history_items ?? []) {
    if (item.name?.trim()) history.push(item.name.trim());
  }
  const previousOther = detail?.relevant_history_other?.trim();
  if (previousOther && !history.some((item) => item.toLowerCase() === previousOther.toLowerCase())) history.push(previousOther);
  const timing = row ? waitFor(row, now) : null;
  const over = timing?.elapsed != null && timing.elapsed >= waitMinutesTarget * 60_000;
  const gender = detail?.patient_gender === "male" ? "Male" : detail?.patient_gender === "female" ? "Female" : null;

  if (!chart) {
    return <div className="grid min-h-80 place-items-center px-6 text-sm text-muted">Select a patient to see the chart.</div>;
  }

  return (
    <div className="min-w-0 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
      <div className={`border-b border-line-soft p-4 sm:p-5 ${triageWash(chart.triage_category)}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold ${triageAvatar(chart.triage_category)}`}>{initials(chart.patient_name)}</span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-ink">{chart.patient_name}</h2>
              <p className="mt-0.5 text-sm text-muted">
                <span className="font-mono">{chart.patient_mrn}</span>
                {detail?.patient_age_at_visit != null ? ` · ${detail.patient_age_at_visit} yrs` : ""}
                {gender ? ` · ${gender}` : ""}
                {" · "}
                {chart.hotel_room_no ? `Room ${chart.hotel_room_no}` : "No room"}
                {" · "}
                {chart.hotel_name}
                {" · "}
                {chart.clinic_name}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <CategoryPill category={chart.triage_category} />
                <QueueStatus status={chart.status} />
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink">{visitTypeLabel(chart.visit_type)}</span>
                {row?.monitoring_status === "completed" || row?.monitoring_status === "in_progress" ? (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${monitoringStatusClass(row.monitoring_status)}`}>
                    {row.monitoring_status === "completed" ? "Monitoring completed" : "Monitoring in progress"}
                  </span>
                ) : null}
                {timing?.elapsed != null ? (
                  <span className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ${over ? "bg-danger text-white" : "bg-surface text-ink"}`}>
                    {timing.done ? "Seen in " : "Waiting "}
                    {clockLabel(timing.elapsed)}
                  </span>
                ) : null}
              </div>
              {seesAll && chart.assigned_doctor_name ? <p className="mt-1 text-xs text-muted">Assigned to {chart.assigned_doctor_name}</p> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canOpenVisit ? (
              <Link className={`${secondary} h-9 px-3 py-0 text-sm`} to={`/patients/${chart.patient_id}/visits/${chart.id}`}>Open visit</Link>
            ) : null}
            <StartEncounterLink to={`/patients/to-doctor/${chart.id}/encounter`} label={encounterActionLabel(chart.status, chart.id)} />
          </div>
        </div>
      </div>
      <div className="grid gap-5 p-4 sm:p-5">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {loading && !detail ? <p className="text-sm text-muted">Loading chart…</p> : null}
        {detail ? (
          <>
            <section className="rounded-2xl border border-panel-strong bg-panel/50 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-blue">Triage vitals</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Vital tone="temp" icon={<TempIcon />} label="Temp" value={detail.temperature_c == null ? "—" : `${detail.temperature_c} °C`} alert={abnormalVital("temp", detail.temperature_c)} />
                <Vital tone="pulse" icon={<PulseIcon />} label="Pulse" value={detail.pulse == null ? "—" : `${detail.pulse} /min`} alert={abnormalVital("pulse", detail.pulse)} />
                <Vital tone="rr" icon={<LungsIcon />} label="RR" value={detail.respiratory_rate == null ? "—" : `${detail.respiratory_rate} /min`} alert={abnormalVital("rr", detail.respiratory_rate)} />
                <Vital tone="bp" icon={<PulseIcon />} label="BP" value={detail.blood_pressure ? `${detail.blood_pressure} mmHg` : "—"} alert={abnormalBloodPressure(detail.blood_pressure)} />
                <Vital tone="spo2" icon={<OxygenIcon />} label="SpO2" value={detail.spo2 == null ? "—" : `${detail.spo2}%`} alert={abnormalVital("spo2", detail.spo2)} />
              </dl>
            </section>
            <div className="grid gap-2 sm:grid-cols-2">
              <Section tone="complaint" title="Chief complaint" icon={<ComplaintIcon />} body={detail.chief_complaint} />
              <Section tone="assessment" title="Initial assessment" icon={<NotesIcon />} body={detail.initial_assessment} />
              <Section tone="allergy" title="Allergies" icon={<AllergyIcon />} body={listText(detail.allergies.map((item) => item.reaction ? `${item.name} (${item.reaction})` : item.name))} />
              <Section tone="medication" title="Medications" icon={<MedsIcon />} body={listText(detail.medications.map((item) => item.name))} />
              <Section tone="history" title="Relevant history" icon={<HistoryIcon />} body={history.length ? history.join(", ") : null} />
              <Section tone="sent" title="Sent from triage" icon={<AssignIcon />} body={[
                detail.triage_completed_at ? formatWhen(detail.triage_completed_at) : null,
                detail.completed_by_name ? `by ${detail.completed_by_name}` : null,
              ].filter(Boolean).join(" · ") || null} />
            </div>
          </>
        ) : null}
        <NursingObservations items={observations} loading={observationsLoading && observations.length === 0} />
        <Investigations items={investigations} loading={investigationsLoading && investigations.length === 0} />
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function Investigations({ items, loading }: { items: VisitInvestigation[]; loading: boolean }) {
  return (
    <section className="rounded-2xl border border-warning-line bg-warning-soft/50 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-warning">Investigations</h3>
      {loading ? <p className="mt-2 text-sm text-muted">Loading investigations…</p> : null}
      {!loading && items.length === 0 ? <p className="mt-2 text-sm text-muted">No investigations ordered.</p> : null}
      {items.length > 0 ? (
        <ul className="mt-2 grid gap-2">
          {items.map((item) => (
            <li key={item.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 ${investigationPriorityClass(item.priority)}`}>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{item.name}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${investigationPriorityClass(item.priority)}`}>{investigationPriorityLabel(item.priority)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${investigationStatusClass(item.status)}`}>{investigationStatusLabel(item.status)}</span>
                </span>
              </span>
              {item.result_file_url ? (
                <a className="text-sm font-semibold text-blue hover:underline" href={item.result_file_url} target="_blank" rel="noreferrer">
                  {item.result_original_name || "Result"}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function NursingObservations({ items, loading }: { items: MonitoringObservation[]; loading: boolean }) {
  return (
    <section className="rounded-2xl border border-success/30 bg-success-soft/60 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-success">Nursing observations</h3>
      {loading ? <p className="mt-2 text-sm text-muted">Loading observations…</p> : null}
      {!loading && items.length === 0 ? <p className="mt-2 text-sm text-muted">No nursing observations recorded.</p> : null}
      {items.length > 0 ? (
        <ul className="mt-2 grid gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl bg-surface px-3 py-2">
              <p className="text-xs font-semibold text-ink">
                {item.recorded_at ? formatWhen(item.recorded_at) : "—"}
                <span className="font-medium text-muted"> · {item.recorded_by_name?.trim() || "Nurse"}</span>
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Vital tone="temp" icon={<TempIcon />} label="Temp" value={reading(item.temperature_c, "°C")} alert={abnormalVital("temp", item.temperature_c)} />
                <Vital tone="pulse" icon={<PulseIcon />} label="Pulse" value={reading(item.pulse, "/min")} alert={abnormalVital("pulse", item.pulse)} />
                <Vital tone="bp" icon={<PulseIcon />} label="BP" value={item.blood_pressure?.trim() ? `${item.blood_pressure} mmHg` : "—"} alert={abnormalBloodPressure(item.blood_pressure)} />
                <Vital tone="rr" icon={<LungsIcon />} label="RR" value={reading(item.respiratory_rate, "/min")} alert={abnormalVital("rr", item.respiratory_rate)} />
                <Vital tone="spo2" icon={<OxygenIcon />} label="SpO2" value={item.spo2 == null ? "—" : `${item.spo2}%`} alert={abnormalVital("spo2", item.spo2)} />
              </dl>
              {item.notes.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{item.notes}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function reading(value: number | null, unit: string) {
  return value == null ? "—" : `${value} ${unit}`;
}

function Section({
  tone,
  title,
  icon,
  body,
}: {
  tone: "complaint" | "assessment" | "allergy" | "medication" | "history" | "sent";
  title: string;
  icon: ReactNode;
  body?: string | null;
}) {
  const recorded = Boolean(body?.trim());
  const palette = sectionPalette(tone, recorded);
  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2 ${palette.box}`}>
      <div className="flex items-center gap-2">
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${palette.icon}`}>{icon}</span>
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${palette.title}`}>{title}</h3>
      </div>
      <p className={`mt-1 whitespace-pre-wrap text-sm leading-snug ${recorded ? "font-medium text-ink" : palette.empty}`}>{recorded ? body : "None recorded"}</p>
    </div>
  );
}

function sectionPalette(tone: "complaint" | "assessment" | "allergy" | "medication" | "history" | "sent", recorded: boolean) {
  if (tone === "allergy") {
    return recorded
      ? { box: "border-danger-line bg-danger-soft", icon: "bg-white text-danger", title: "text-danger", empty: "text-muted" }
      : { box: "border-success/20 bg-success-soft", icon: "bg-white text-success", title: "text-success", empty: "text-success" };
  }
  if (tone === "medication" && recorded) {
    return { box: "border-warning-line bg-warning-soft", icon: "bg-white text-warning", title: "text-warning", empty: "text-muted" };
  }
  if (tone === "complaint") {
    return { box: "border-panel-strong bg-panel", icon: "bg-white text-blue", title: "text-blue", empty: "text-muted" };
  }
  return { box: "border-line bg-surface", icon: "bg-surface-2 text-muted-strong", title: "text-muted-strong", empty: "text-muted" };
}

function Vital({
  tone,
  icon,
  label: name,
  value,
  alert,
}: {
  tone: "temp" | "pulse" | "bp" | "rr" | "spo2";
  icon: ReactNode;
  label: string;
  value: string;
  alert?: boolean;
}) {
  const palette = alert
    ? { box: "bg-danger-soft ring-1 ring-danger-line", text: "text-danger", icon: "text-danger" }
    : tone === "temp"
      ? { box: "bg-warning-soft", text: "text-warning", icon: "text-warning" }
      : tone === "pulse"
        ? { box: "bg-panel", text: "text-blue", icon: "text-blue" }
        : tone === "bp"
          ? { box: "bg-surface ring-1 ring-gold", text: "text-warning", icon: "text-warning" }
          : tone === "rr"
            ? { box: "bg-success-soft", text: "text-success", icon: "text-success" }
            : { box: "bg-panel-strong", text: "text-blue-strong", icon: "text-blue-strong" };
  return (
    <div className={`rounded-xl px-2.5 py-1.5 ${palette.box}`}>
      <dt className={`inline-flex items-center gap-1.5 text-xs font-semibold ${palette.text}`}><span className={palette.icon}>{icon}</span>{name}</dt>
      <dd className={`mt-0.5 text-sm font-bold ${alert ? "text-danger" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function triageWash(category: TriageCategory | null) {
  if (category === "emergency") return "bg-danger-soft";
  if (category === "urgent") return "bg-warning-soft";
  if (category === "normal") return "bg-success-soft";
  return "bg-surface";
}

function triageEdge(category: TriageCategory | null) {
  if (category === "emergency") return "border-l-danger";
  if (category === "urgent") return "border-l-warning";
  if (category === "normal") return "border-l-success";
  return "border-l-line-strong";
}

function triageAvatar(category: TriageCategory | null) {
  if (category === "emergency") return "bg-danger text-white";
  if (category === "urgent") return "bg-warning text-white";
  if (category === "normal") return "bg-success text-white";
  return "bg-blue text-white";
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

function abnormalBloodPressure(value: string | null) {
  if (!value) return false;
  const match = value.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return false;
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  return systolic >= 140 || diastolic >= 90 || systolic < 90;
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
  const toneClass = tone === "rose" ? "bg-danger-soft text-danger" : tone === "amber" ? "bg-warning-soft text-warning" : "bg-panel text-blue";
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
  const className = `flex items-center gap-3 rounded-2xl border bg-surface px-4 py-4 text-left shadow-card ${onClick ? "transition hover:border-panel-strong" : ""} ${active ? "border-blue" : "border-line"}`;
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
  if (category === "emergency") {
    return <span className="inline-flex rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">{categoryLabel.emergency}</span>;
  }
  if (category === "urgent") {
    return <span className="inline-flex rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">{categoryLabel.urgent}</span>;
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
