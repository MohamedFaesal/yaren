import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { api, investigationStatusLabel, monitoringStatusClass, monitoringStatusLabel, nursingPlanStatusClass, nursingPlanStatusLabel, visitStatusChips, visitStatusText, visitTypeLabel, waitMinutes, type CasePriority, type CatalogMedication, type CloseEncounterPreview, type CloseEncounterRequest, type CloseEncounterResult, type CloseResolutionAction, type DoctorAttentionItem, type DoctorAttentionReason, type DoctorAttentionUrgency, type DoctorCase, type DoctorCaseDetail, type DoctorCasePage, type DoctorCaseSummary, type DoctorMonitoringRecord, type GeneralSettings, type InvestigationPhase, type ManagementPlanRecord, type MedicalService, type MedicationOrder, type MonitoringStatus, type NursingPlanDetail, type ProcedureOrder, type TriageCategory, type User, type VisitCareStatus } from "../api";
import { canAct } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { useToast } from "../toast";
import { ConfirmDialog, Page, field, messageOf, primary, secondary, th } from "./ui";
import { emptyOrder, emptyProcedure, MedicationOrderDialog, ProcedureOrderDialog, reconcileProcedures, standaloneProcedures } from "./EncounterPage";
import { assessPressure, assessVital, AutomaticAssessment, DoctorReadingAssessment, parsePressure, PriorityChip, ReadingTimeline, trendText, VitalShell, type VitalCheck } from "./NurseDashboardPanels";

const pageSize = 5;
const emptySummary: DoctorCaseSummary = {
  waiting: 0,
  today: 0,
  to_see_now: 0,
  emergency: 0,
  urgent: 0,
  normal: 0,
  consultation_in_progress: 0,
  waiting_for_investigation: 0,
  awaiting_collection: 0,
  collected: 0,
  at_lab: 0,
  results_ready: 0,
  under_nursing_care: 0,
  encounter_complete: 0,
  referred: 0,
  closed: 0,
  average_wait_minutes: 0,
  needs_attention: 0,
};

type CaseFocus =
  | ""
  | "today"
  | "now"
  | "waiting"
  | "emergency"
  | "urgent"
  | "normal"
  | "consultation_in_progress"
  | "waiting_for_investigation"
  | "awaiting_collection"
  | "collected"
  | "at_lab"
  | "results_ready"
  | "under_nursing_care"
  | "encounter_complete";

const categoryLabel: Record<TriageCategory, string> = {
  emergency: "Emergency",
  urgent: "Urgent",
  normal: "Stable",
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [attentionMonitoring, setAttentionMonitoring] = useState<NursePatientRecord | null>(null);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [closeEncounterItem, setCloseEncounterItem] = useState<DoctorAttentionItem | null>(null);
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
    if (!selectedId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId]);

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
  }, [token, page, search, focus, clinicId, refreshKey]);

  const nursePatients = groupNurseRecords(result.monitoring ?? []);
  const underObservation = nursePatients.filter((item) => item.monitoringStatus === "in_progress").length;
  const attentionItems = result.attention ?? [];
  const needsAttention = summary.needs_attention || attentionItems.length;
  const queueTotal = summary.waiting + summary.consultation_in_progress + summary.waiting_for_investigation + summary.closed;

  function chooseFocus(next: CaseFocus) {
    setFocus((current) => (current === next ? "" : next));
    setPage(1);
  }

  function openAttentionMonitoring(visitId: string) {
    const patient = nursePatients.find((item) => item.visitId === visitId) ?? null;
    if (!patient) {
      setSelectedId(visitId);
      return;
    }
    setAttentionMonitoring(patient);
    if (!unviewedSince(patient)) return;
    void api(`/api/doctor-cases/${patient.visitId}/monitoring/viewed`, { method: "POST" }, token)
      .then(() => setRefreshKey((value) => value + 1))
      .catch(() => undefined);
  }

  return (
    <Page
      title="Doctor Dashboard"
      description="Real-time patient flow, today's workload, and clinical activities."
      crumbs={[{ label: "Care" }, { label: "Doctor Dashboard" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Patients today" value={summary.today} hint="Sent from triage today" tone="blue" active={focus === "today"} onClick={() => chooseFocus("today")} />
        <StatCard label="To see now" value={summary.to_see_now} hint={`${summary.emergency} Emergency + ${summary.urgent} Urgent`} tone="rose" active={focus === "now"} onClick={() => chooseFocus("now")} />
        <StatCard
          label="Needs attention"
          value={needsAttention}
          hint={needsAttention > 0 ? "Open encounters needing you" : "No open attention items"}
          tone="rose"
          alert={needsAttention > 0}
          onClick={() => setAttentionOpen(true)}
        />
        <StatCard label="Under observation" value={underObservation} hint="Currently monitored by nursing" tone="green" />
        <StatCard label="Average waiting time" value={waitedLabel(summary.average_wait_minutes)} hint="Live average for waiting patients" tone="amber" />
      </div>
      <AttentionLauncher count={needsAttention} onOpen={() => setAttentionOpen(true)} />
      <AttentionDialog
        open={attentionOpen}
        items={attentionItems}
        now={now}
        onClose={() => setAttentionOpen(false)}
        onViewDetails={(visitId) => {
          setAttentionOpen(false);
          setSelectedId(visitId);
        }}
        onOpenMonitoring={(visitId) => {
          setAttentionOpen(false);
          openAttentionMonitoring(visitId);
        }}
        onCloseEncounter={(item) => setCloseEncounterItem(item)}
      />
      {closeEncounterItem ? (
        <CloseEncounterWizard
          item={closeEncounterItem}
          token={token}
          onClose={() => setCloseEncounterItem(null)}
          onCompleted={() => {
            setCloseEncounterItem(null);
            setRefreshKey((value) => value + 1);
          }}
        />
      ) : null}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-4">
          <section className="rounded-2xl border border-line bg-surface shadow-card">
            <div className="border-b border-line-soft p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">Patient Queue ({result.total})</h2>
                  <p className="mt-0.5 text-sm text-muted">Waiting to see the doctor, investigation phases, and nursing-care visits.</p>
                </div>
                <label className="relative block w-full max-w-sm">
                  <span className="sr-only">Search queue</span>
                  <input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, MRN, or hotel" />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <QueueChip label="All" count={queueTotal} active={focus === ""} onClick={() => chooseFocus("")} />
                <QueueChip label="To see now" count={summary.to_see_now} active={focus === "now"} onClick={() => chooseFocus("now")} dot="bg-danger" />
                <QueueChip label="Emergency" count={summary.emergency} active={focus === "emergency"} onClick={() => chooseFocus("emergency")} dot="bg-danger" />
                <QueueChip label="Urgent" count={summary.urgent} active={focus === "urgent"} onClick={() => chooseFocus("urgent")} dot="bg-warning" />
                <QueueChip label="Stable" count={summary.normal} active={focus === "normal"} onClick={() => chooseFocus("normal")} dot="bg-success" />
                <QueueChip label="Waiting for Doctor" count={summary.waiting} active={focus === "waiting"} onClick={() => chooseFocus("waiting")} dot="bg-blue" />
                <QueueChip label="Consultation In Progress" count={summary.consultation_in_progress} active={focus === "consultation_in_progress"} onClick={() => chooseFocus("consultation_in_progress")} dot="bg-warning" />
                <QueueChip label="Waiting for Sample Collection" count={summary.awaiting_collection} active={focus === "awaiting_collection"} onClick={() => chooseFocus("awaiting_collection")} dot="bg-warning" />
                <QueueChip label="Sample Collected" count={summary.collected} active={focus === "collected"} onClick={() => chooseFocus("collected")} dot="bg-blue" />
                <QueueChip label="Sent to Lab" count={summary.at_lab} active={focus === "at_lab"} onClick={() => chooseFocus("at_lab")} dot="bg-blue" />
                <QueueChip label="Results Ready" count={summary.results_ready} active={focus === "results_ready"} onClick={() => chooseFocus("results_ready")} dot="bg-success" />
                <QueueChip label="Under Nursing Care" count={summary.under_nursing_care} active={focus === "under_nursing_care"} onClick={() => chooseFocus("under_nursing_care")} dot="bg-success" />
                <QueueChip label="Encounter Complete" count={summary.encounter_complete} active={focus === "encounter_complete"} onClick={() => chooseFocus("encounter_complete")} dot="bg-success" />
              </div>
            </div>
            <div className="max-h-[min(32rem,55vh)] overflow-auto">
              {result.items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted">
                  {loading ? "Loading queue…" : search || focus ? "No patients match this queue." : seesAll ? "No visits have been sent to a doctor." : "No visits have been assigned to you."}
                </p>
              ) : (
                <table className="w-full min-w-[52rem] text-sm">
                  <thead className="sticky top-0 z-10 bg-surface-2">
                    <tr>
                      <th className={`${th} sticky top-0 bg-surface-2`}>#</th>
                      <th className={`${th} sticky top-0 bg-surface-2`}>Patient</th>
                      <th className={`${th} sticky top-0 bg-surface-2`}>MRN</th>
                      <th className={`${th} sticky top-0 bg-surface-2`}>Visit type</th>
                      <th className={`${th} sticky top-0 bg-surface-2`}>Triage</th>
                      <th className={`${th} sticky top-0 bg-surface-2`}>Status</th>
                      <th className={`${th} sticky top-0 bg-surface-2`}>Waiting</th>
                      <th className={`${th} sticky top-0 bg-surface-2 text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((row, index) => {
                      const timing = waitFor(row, now);
                      const target = waitMinutes(waitSettings, row.clinic_id, "doctor") * 60_000;
                      return (
                        <tr key={row.id} className={`border-t border-line-soft ${selectedId === row.id ? triageWash(row.triage_category) : "hover:bg-surface-2"}`}>
                          <td className="px-4 py-3 text-xs font-semibold text-muted">{start + index}</td>
                          <td className="px-4 py-3">
                            <button type="button" className="block max-w-56 text-left" onClick={() => setSelectedId(row.id)}>
                              <span className="block truncate font-semibold text-ink">{row.patient_name}</span>
                              <span className="mt-0.5 block truncate text-xs text-muted">
                                {row.hotel_room_no ? `Room ${row.hotel_room_no}` : "No room"}
                                {row.hotel_name ? ` · ${row.hotel_name}` : ""}
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-strong">{row.patient_mrn}</td>
                          <td className="px-4 py-3"><VisitTypeBox type={row.visit_type} /></td>
                          <td className="px-4 py-3"><CategoryPill category={row.triage_category} /></td>
                          <td className="px-4 py-3"><QueueStatus status={row.status} monitoring={row.monitoring_status} phase={row.investigation_phase} /></td>
                          <td className={`px-4 py-3 font-semibold tabular-nums ${waitTone(timing.elapsed, target)}`}>{waitMinutesLabel(timing.elapsed)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink transition hover:border-blue hover:bg-panel hover:text-blue"
                                aria-label={`View details for ${row.patient_name}`}
                                title="View details"
                                onClick={() => setSelectedId(row.id)}
                              >
                                <ViewDetailsIcon />
                              </button>
                              <StartEncounterLink to={`/patients/to-doctor/${row.visit_number}/encounter`} status={row.status} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-3 py-3">
              <p className="text-xs text-muted-strong">{loading ? "Loading" : result.total === 0 ? "0 patients" : `${start}–${end} of ${result.total}`}</p>
              <div className="flex items-center gap-1.5">
                <button type="button" className={`${secondary} px-2.5 py-1.5 text-xs disabled:opacity-50`} disabled={loading || result.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
                <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-blue px-1.5 text-xs font-semibold text-white">{result.total === 0 ? 0 : result.page}</span>
                <button type="button" className={`${secondary} px-2.5 py-1.5 text-xs disabled:opacity-50`} disabled={loading || result.page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button>
              </div>
            </div>
          </section>
          <NurseRecordsPanel patients={nursePatients} now={now} token={token} onChanged={() => setRefreshKey((value) => value + 1)} />
        </div>
        <AnalyticsRail summary={summary} nursePatients={nursePatients} underObservation={underObservation} />
      </div>
      {attentionMonitoring ? (
        <MonitoringAssessmentDialog
          token={token}
          patient={attentionMonitoring}
          now={now}
          onClose={() => setAttentionMonitoring(null)}
          onChanged={() => setRefreshKey((value) => value + 1)}
        />
      ) : null}
      {selected ? (
        <div className="triage-dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-shell/45 p-4" role="presentation" onMouseDown={() => setSelectedId(null)}>
          <section
            className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-surface shadow-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.patient_name} chart`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <CasePanel
              row={selected}
              detail={detail}
              loading={detailLoading}
              error={detailError}
              now={now}
              waitMinutesTarget={waitMinutes(waitSettings, selected.clinic_id, "doctor")}
              canOpenVisit={canOpenVisit}
              seesAll={seesAll}
              token={token}
              onEnded={() => {
                setRefreshKey((value) => value + 1);
                setSelectedId(null);
              }}
              onClose={() => setSelectedId(null)}
            />
          </section>
        </div>
      ) : null}
    </Page>
  );
}

function closedCase(status: VisitCareStatus) {
  return status === "waiting_for_investigation" || status === "under_nursing_care" || status === "encounter_complete" || status === "referred";
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

function encounterActionLabel(status: VisitCareStatus) {
  if (closedCase(status)) return "View encounter";
  if (status === "consultation_in_progress") return "Resume Encounter";
  return "Start encounter";
}

function encounterActionTone(status: VisitCareStatus): "start" | "resume" | "view" {
  if (closedCase(status)) return "view";
  if (status === "consultation_in_progress") return "resume";
  return "start";
}

function encounterActionClass(tone: "start" | "resume" | "view") {
  if (tone === "view") {
    return "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-success/30 bg-success-soft px-3 text-sm font-semibold text-success transition hover:border-success hover:bg-success hover:text-white";
  }
  if (tone === "resume") {
    return "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-warning px-3 text-sm font-semibold text-white transition hover:brightness-95";
  }
  return "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue px-3 text-sm font-semibold text-white transition hover:bg-blue-strong";
}

function VisitTypeBox({ type }: { type?: DoctorCase["visit_type"] }) {
  const tone = type === "follow-up"
    ? "bg-warning-soft text-warning"
    : type === "new"
      ? "bg-panel text-blue"
      : "bg-surface-2 text-muted";
  return <span className={`inline-flex whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold ${tone}`}>{visitTypeLabel(type)}</span>;
}

function QueueStatus({ status, monitoring, phase }: { status: VisitCareStatus; monitoring?: MonitoringStatus | null; phase?: InvestigationPhase | null }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {visitStatusChips({ status, monitoring_status: monitoring }).map((item) => {
        const tone = item === "encounter_complete" || (item === "waiting_for_investigation" && phase === "results_ready")
          ? "bg-success-soft text-success"
          : item === "seen"
            ? "bg-panel-strong text-blue-strong"
            : item === "waiting_for_investigation"
              ? "bg-warning-soft text-warning"
              : item === "under_nursing_care"
                ? "bg-success-soft text-success"
                : item === "referred"
                  ? "bg-panel text-blue"
                  : item === "pending_payment"
                    ? "bg-danger-soft text-danger"
                    : item === "waiting_for_triage"
                      ? "bg-surface-3 text-muted-strong"
                      : item === "consultation_in_progress"
                        ? "bg-warning-soft text-warning"
                        : item === "to_doctor"
                          ? "bg-panel text-blue"
                          : "bg-surface-2 text-muted";
        const label = item === "waiting_for_investigation"
          ? visitStatusText({ status: item, investigation_phase: phase })
          : visitStatusText({ status: item });
        return <span key={item} className={`inline-flex whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
      })}
    </span>
  );
}

function StartEncounterLink({
  to,
  status,
  label,
  onClick,
}: {
  to: string;
  status: VisitCareStatus;
  label?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const tone = encounterActionTone(status);
  return (
    <Link
      to={to}
      onClick={onClick}
      className={encounterActionClass(tone)}
    >
      {label ?? encounterActionLabel(status)}
      <ArrowIcon />
    </Link>
  );
}

function ViewDetailsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
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


function CasePanel({
  row,
  detail,
  loading,
  error,
  now,
  waitMinutesTarget,
  canOpenVisit,
  seesAll,
  token,
  onEnded,
  onClose,
}: {
  row: DoctorCase | null;
  detail: DoctorCaseDetail | null;
  loading: boolean;
  error: string | null;
  now: number;
  waitMinutesTarget: number;
  canOpenVisit: boolean;
  seesAll: boolean;
  token: string;
  onEnded?: () => void;
  onClose?: () => void;
}) {
  const toast = useToast();
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
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
  const phase = chart?.investigation_phase ?? null;
  const monitoring = chart?.monitoring_status ?? null;
  const canEndFromResults = Boolean(
    chart
    && canEndEncounter(chart.status, monitoring, phase)
    && phase === "results_ready"
    && monitoring !== "in_progress",
  );

  async function endFromResults() {
    if (!chart || !canEndFromResults || ending) return;
    setEnding(true);
    setEndError(null);
    try {
      await api(`/api/patients/${chart.patient_id}/visits/${chart.id}/monitoring/end-encounter`, { method: "POST" }, token);
      toast.success("Encounter complete", `${chart.patient_name} is now Encounter Complete.`);
      onEnded?.();
    } catch (caught) {
      setEndError(messageOf(caught));
    } finally {
      setEnding(false);
    }
  }

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
                <QueueStatus status={chart.status} monitoring={chart.monitoring_status} phase={phase} />
                <VisitTypeBox type={chart.visit_type} />
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
              <Link className={`${secondary} h-9 px-3 py-0 text-sm`} to={`/visits/${chart.visit_number}`}>Open visit</Link>
            ) : null}
            <StartEncounterLink to={`/patients/to-doctor/${chart.visit_number}/encounter`} status={chart.status} />
            {onClose ? (
              <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-xl leading-none text-muted hover:bg-surface hover:text-ink" aria-label="Close" onClick={onClose}>×</button>
            ) : null}
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
        {canEndFromResults ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/30 bg-success-soft/40 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">All investigation results are ready.</p>
              <p className="mt-0.5 text-sm text-muted">Review the results, then end the encounter.</p>
              {endError ? <p className="mt-1 text-sm text-danger">{endError}</p> : null}
            </div>
            <button type="button" className={primary} disabled={ending} onClick={() => void endFromResults()}>
              {ending ? "Ending…" : "End encounter"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type NursePatientRecord = {
  visitId: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  hotelRoomNo: string | null;
  hotelName: string | null;
  monitoringStatus: MonitoringStatus;
  monitoringStartedAt: string | null;
  chiefComplaint: string | null;
  latest: DoctorMonitoringRecord;
  records: DoctorMonitoringRecord[];
};

function groupNurseRecords(records: DoctorMonitoringRecord[]): NursePatientRecord[] {
  const grouped = new Map<string, DoctorMonitoringRecord[]>();
  for (const record of records) {
    const list = grouped.get(record.visit_id) ?? [];
    list.push(record);
    grouped.set(record.visit_id, list);
  }
  return [...grouped.values()].map((list) => {
    const sorted = [...list].sort((left, right) => new Date(right.recorded_at ?? 0).getTime() - new Date(left.recorded_at ?? 0).getTime());
    const latest = sorted[0];
    return {
      visitId: latest.visit_id,
      patientId: latest.patient_id,
      patientName: latest.patient_name,
      patientMrn: latest.patient_mrn,
      hotelRoomNo: latest.hotel_room_no,
      hotelName: latest.hotel_name ?? null,
      monitoringStatus: latest.monitoring_status,
      monitoringStartedAt: latest.monitoring_started_at ?? null,
      chiefComplaint: latest.chief_complaint ?? null,
      latest,
      records: sorted,
    };
  }).sort((left, right) => {
    const leftWaiting = unviewedSince(left);
    const rightWaiting = unviewedSince(right);
    if (leftWaiting && !rightWaiting) return -1;
    if (!leftWaiting && rightWaiting) return 1;
    if (leftWaiting && rightWaiting) return new Date(leftWaiting).getTime() - new Date(rightWaiting).getTime();
    return new Date(right.latest.recorded_at ?? 0).getTime() - new Date(left.latest.recorded_at ?? 0).getTime();
  });
}

const monitoringPageSize = 5;
const attentionPageSize = 5;

const attentionReasonLabel: Record<DoctorAttentionReason, string> = {
  waiting_for_doctor: "Waiting for doctor",
  consultation_in_progress: "Consultation in progress",
  waiting_for_investigation: "Waiting for investigation",
  under_nursing_care: "Under nursing care",
  results_ready: "Results ready",
  nurse_note_unviewed: "Nurse note waiting",
  ready_to_end: "Ready to end encounter",
};

function AttentionLauncher({ count, onOpen }: { count: number; onOpen: () => void }) {
  return createPortal(
    <button
      type="button"
      className={`attention-launcher ${count > 0 ? "attention-launcher-active" : ""}`}
      onClick={onOpen}
      aria-label={count > 0 ? `Needs doctor attention, ${count} patients` : "Needs doctor attention"}
      title="Needs Doctor Attention"
    >
      <AttentionFocusIcon active={count > 0} />
      {count > 0 ? (
        <span className="attention-launcher-badge">{count > 99 ? "99+" : count}</span>
      ) : null}
      {count > 0 ? <span className="attention-launcher-pulse care-pulse-danger" aria-hidden="true" /> : null}
    </button>,
    document.body,
  );
}

function AttentionDialog({
  open,
  items,
  now,
  onClose,
  onViewDetails,
  onOpenMonitoring,
  onCloseEncounter,
}: {
  open: boolean;
  items: DoctorAttentionItem[];
  now: number;
  onClose: () => void;
  onViewDetails: (visitId: string) => void;
  onOpenMonitoring: (visitId: string) => void;
  onCloseEncounter: (item: DoctorAttentionItem) => void;
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / attentionPageSize));
  const safePage = Math.min(page, pages);
  const start = items.length === 0 ? 0 : (safePage - 1) * attentionPageSize + 1;
  const end = Math.min(safePage * attentionPageSize, items.length);
  const paged = items.slice((safePage - 1) * attentionPageSize, safePage * attentionPageSize);
  const meter = {
    critical: items.filter((item) => item.urgency === "critical").length,
    action: items.filter((item) => item.urgency === "action").length,
    open: items.filter((item) => item.urgency === "open").length,
  };
  const meterTotal = Math.max(1, items.length);

  useEffect(() => {
    setPage(1);
  }, [items.length, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="triage-dialog-backdrop fixed inset-0 z-[70] grid place-items-center bg-shell/50 px-4 py-6 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="attention-panel triage-dialog-panel flex max-h-[min(40rem,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attention-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-line-soft p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="attention-dialog-title" className="text-base font-semibold text-ink">Needs Doctor Attention</h2>
              <p className="mt-0.5 text-sm text-muted">
                {items.length === 0
                  ? "No open encounters need attention right now."
                  : `${items.length} open encounter${items.length === 1 ? "" : "s"} still need your attention.`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ${items.length > 0 ? "bg-danger-soft text-danger" : "bg-surface-3 text-muted"}`}>
                {items.length}
              </span>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-xl leading-none text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close" onClick={onClose}>×</button>
            </div>
          </div>
          <div className="attention-meter mt-4" aria-hidden="true">
            <span className="attention-meter-seg attention-meter-critical" style={{ width: `${(meter.critical / meterTotal) * 100}%` }} />
            <span className="attention-meter-seg attention-meter-action" style={{ width: `${(meter.action / meterTotal) * 100}%` }} />
            <span className="attention-meter-seg attention-meter-open" style={{ width: `${(meter.open / meterTotal) * 100}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold text-muted-strong">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-danger" /> Critical {meter.critical}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-warning" /> Action {meter.action}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue" /> Open {meter.open}</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">All caught up — no incomplete encounters need attention.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {paged.map((item, index) => {
                const timing = attentionWaitMs(item, now);
                const secondaryReasons = item.reasons
                  .filter((reason) => reason !== item.headline_reason)
                  .map((reason) => attentionReasonLabel[reason])
                  .slice(0, 2);
                const showEncounter = item.status === "to_doctor" || item.status === "consultation_in_progress";
                const showMonitoring = item.reasons.includes("nurse_note_unviewed") || item.reasons.includes("ready_to_end");
                return (
                  <li
                    key={item.id}
                    className={`attention-row attention-row-${item.urgency} ui-rise px-4 py-3.5`}
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.urgency === "critical" ? <span className="attention-signal-dot care-pulse-danger" aria-hidden="true" /> : null}
                          <p className="truncate font-semibold text-ink">{item.patient_name}</p>
                          {item.triage_category ? <CategoryPill category={item.triage_category} /> : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          <span className="font-mono">{item.patient_mrn}</span>
                          {" · "}
                          {item.hotel_room_no ? `Room ${item.hotel_room_no}` : "No room"}
                          {item.hotel_name ? ` · ${item.hotel_name}` : ""}
                        </p>
                        <p className={`mt-2 text-sm font-bold ${attentionHeadlineTone(item.urgency)}`}>
                          {attentionReasonLabel[item.headline_reason]}
                        </p>
                        {secondaryReasons.length > 0 ? (
                          <p className="mt-0.5 text-xs text-muted-strong">{secondaryReasons.join(" · ")}</p>
                        ) : null}
                        {(item.plans ?? []).length > 0 ? (
                          <ul className="mt-2 grid gap-1">
                            {(item.plans ?? []).map((plan) => {
                              const settled = plan.status === "completed" || plan.status === "cancelled";
                              return (
                                <li key={plan.position} className={`text-xs font-semibold ${settled ? "text-muted-strong" : "text-ink"}`}>
                                  Plan {plan.position}
                                  <span className={`ml-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${nursingPlanStatusClass(plan.status as never)}`}>
                                    {nursingPlanStatusLabel(plan.status as never)}
                                  </span>
                                  <span className="font-medium text-muted-strong">
                                    {" · "}
                                    {plan.medication_count} meds · {plan.procedure_count} procedures
                                  </span>
                                  {plan.status === "cancelled" && plan.cancellation_reason?.trim() ? (
                                    <span className="mt-0.5 block font-medium text-muted">{plan.cancellation_reason.trim()}</span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                        <p className="mt-1.5 text-xs font-semibold tabular-nums text-ink">
                          {timing == null ? "—" : waitMinutesLabel(timing)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink transition hover:border-blue hover:bg-panel hover:text-blue"
                          aria-label={`View details for ${item.patient_name}`}
                          title="View details"
                          onClick={() => onViewDetails(item.id)}
                        >
                          <ViewDetailsIcon />
                        </button>
                        {showMonitoring ? (
                          <button type="button" className={`${item.urgency === "critical" ? primary : secondary} h-9 px-3 text-xs`} onClick={() => onOpenMonitoring(item.id)}>
                            {item.reasons.includes("nurse_note_unviewed") ? "Review note" : "Open monitoring"}
                          </button>
                        ) : null}
                        {showEncounter ? (
                          <StartEncounterLink
                            to={`/patients/to-doctor/${item.visit_number}/encounter`}
                            status={item.status}
                          />
                        ) : null}
                        <button
                          type="button"
                          className={`${secondary} h-9 px-3 text-xs`}
                          onClick={() => onCloseEncounter(item)}
                        >
                          Close encounter
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-3 py-3">
          <p className="text-xs text-muted-strong">{items.length === 0 ? "0 patients" : `${start}–${end} of ${items.length}`}</p>
          <div className="flex items-center gap-1.5">
            <button type="button" className={`${secondary} px-2.5 py-1.5 text-xs disabled:opacity-50`} disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-blue px-1.5 text-xs font-semibold text-white">{items.length === 0 ? 0 : safePage}</span>
            <button type="button" className={`${secondary} px-2.5 py-1.5 text-xs disabled:opacity-50`} disabled={safePage >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))}>Next</button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function AttentionFocusIcon({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Earpieces + tubing */}
      <path d="M7.25 3.75v5.9a3.75 3.75 0 0 0 7.5 0V7.5" />
      <path d="M7.25 3.75H5.9a1.35 1.35 0 0 0 0 2.7h1.35" />
      <path d="M14.75 3.75h1.35a1.35 1.35 0 0 1 0 2.7h-1.35" />
      {/* Tube to chest piece */}
      <path d="M14.75 7.5c2.85 0 4.85 2 4.85 4.75a3.35 3.35 0 0 1-3.35 3.35" />
      <circle cx="14.7" cy="18.05" r="2.45" />
      <circle cx="14.7" cy="18.05" r="0.85" fill="currentColor" stroke="none" />
      {/* Priority flare */}
      <path d="M4.6 13.4 7.7 19H1.5Z" fill={active ? "currentColor" : "none"} />
      <path d="M4.6 13.4 7.7 19H1.5Z" />
      <path d="M4.6 15.35v1.7" stroke={active ? "#fff" : "currentColor"} strokeWidth="1.55" />
      <circle cx="4.6" cy="18.05" r="0.4" fill={active ? "#fff" : "currentColor"} stroke="none" />
    </svg>
  );
}

function attentionWaitMs(item: DoctorAttentionItem, now: number) {
  const start = item.status === "to_doctor" || item.status === "consultation_in_progress"
    ? item.triage_completed_at
    : item.status_changed_at;
  if (!start) return null;
  const at = new Date(start).getTime();
  if (!Number.isFinite(at)) return null;
  return Math.max(0, now - at);
}

function attentionHeadlineTone(urgency: DoctorAttentionUrgency) {
  if (urgency === "critical") return "text-danger";
  if (urgency === "action") return "text-warning";
  return "text-blue";
}

type CloseWizardStep = "outcome" | "referral" | "blockers" | "confirm";
type ResolutionChoice = { action: CloseResolutionAction; reason: string };

function CloseEncounterWizard({
  item,
  token,
  onClose,
  onCompleted,
}: {
  item: DoctorAttentionItem;
  token: string;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<CloseWizardStep>("outcome");
  const [outcome, setOutcome] = useState<"complete" | "refer" | null>(null);
  const [referralNote, setReferralNote] = useState("");
  const [preview, setPreview] = useState<CloseEncounterPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [planResolutions, setPlanResolutions] = useState<Record<number, ResolutionChoice>>({});
  const [investigationResolutions, setInvestigationResolutions] = useState<Record<string, CloseResolutionAction>>({});
  const [investigationCancellationReason, setInvestigationCancellationReason] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void api<CloseEncounterPreview>(
      `/api/patients/${item.patient_id}/visits/${item.id}/close-encounter-preview`,
      {},
      token,
    )
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        const plans: Record<number, ResolutionChoice> = {};
        for (const plan of data.plans) {
          if (plan.allowed_actions.length === 0) continue;
          plans[plan.position] = {
            action: plan.allowed_actions.includes("complete") ? "complete" : "cancel",
            reason: "",
          };
        }
        setPlanResolutions(plans);
        const investigations: Record<string, CloseResolutionAction> = {};
        for (const investigation of data.investigations) {
          investigations[investigation.id] = investigation.allowed_actions.includes("complete") ? "complete" : "cancel";
        }
        setInvestigationResolutions(investigations);
        setInvestigationCancellationReason("");
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(messageOf(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.patient_id, token]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  const hasBlockers = Boolean(
    preview
    && (preview.plans.length > 0 || preview.investigations.length > 0),
  );

  function blockersValid() {
    if (!preview) return false;
    for (const plan of preview.plans) {
      if (plan.allowed_actions.length === 0) continue;
      const resolution = planResolutions[plan.position];
      if (!resolution || !plan.allowed_actions.includes(resolution.action)) return false;
      if (resolution.action === "cancel" && !resolution.reason.trim()) return false;
    }
    let cancellingInvestigations = false;
    for (const investigation of preview.investigations) {
      const action = investigationResolutions[investigation.id];
      if (!action || !investigation.allowed_actions.includes(action)) return false;
      if (action === "cancel") cancellingInvestigations = true;
    }
    if (cancellingInvestigations && !investigationCancellationReason.trim()) return false;
    return true;
  }

  function goNextFromOutcome(next: "complete" | "refer") {
    setOutcome(next);
    setSubmitError(null);
    if (next === "refer") {
      setStep("referral");
      return;
    }
    setStep(hasBlockers ? "blockers" : "confirm");
  }

  function goNextFromReferral() {
    if (!referralNote.trim()) {
      setSubmitError("Enter a hospital referral note");
      return;
    }
    setSubmitError(null);
    setStep(hasBlockers ? "blockers" : "confirm");
  }

  function goNextFromBlockers() {
    if (!blockersValid()) {
      setSubmitError("Resolve every open plan, monitoring, and investigation before continuing");
      return;
    }
    setSubmitError(null);
    setStep("confirm");
  }

  async function submitClose() {
    if (!outcome || !preview) return;
    if (outcome === "refer" && !referralNote.trim()) {
      setSubmitError("Enter a hospital referral note");
      return;
    }
    if (hasBlockers && !blockersValid()) {
      setSubmitError("Resolve every open plan, monitoring, and investigation before continuing");
      return;
    }
    const body: CloseEncounterRequest = {
      outcome,
      referral_note: outcome === "refer" ? referralNote.trim() : "",
      plan_resolutions: preview.plans.flatMap((plan) => {
        if (plan.allowed_actions.length === 0) return [];
        const resolution = planResolutions[plan.position];
        if (!resolution) return [];
        return [{
          position: plan.position,
          action: resolution.action,
          reason: resolution.action === "cancel" ? resolution.reason.trim() : undefined,
        }];
      }),
      monitoring_resolution: preview.monitoring.needs_resolution
        ? { action: "complete" }
        : null,
      investigation_resolutions: preview.investigations.map((investigation) => ({
        id: investigation.id,
        action: investigationResolutions[investigation.id]!,
      })),
      investigation_cancellation_reason: preview.investigations.some((investigation) => investigationResolutions[investigation.id] === "cancel")
        ? investigationCancellationReason.trim()
        : "",
    };
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api<CloseEncounterResult>(
        `/api/patients/${item.patient_id}/visits/${item.id}/close-encounter`,
        { method: "POST", body: JSON.stringify(body) },
        token,
      );
      toast.success(
        result.status === "referred" ? "Referred to hospital" : "Encounter completed",
        result.status === "referred"
          ? `${item.patient_name} was referred.`
          : `${item.patient_name} is now Encounter Complete.`,
      );
      onCompleted();
    } catch (caught) {
      setSubmitError(messageOf(caught));
    } finally {
      setSubmitting(false);
    }
  }

  const stepTitle = step === "outcome"
    ? "Choose outcome"
    : step === "referral"
      ? "Referral note"
      : step === "blockers"
        ? "Resolve open items"
        : "Confirm close";

  return createPortal(
    <div
      className="triage-dialog-backdrop fixed inset-0 z-[90] grid place-items-center bg-shell/55 px-4 py-6 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={() => {
        if (!submitting) onClose();
      }}
    >
      <section
        className="triage-dialog-panel flex max-h-[min(44rem,92vh)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-surface shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-encounter-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-line-soft p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-strong">Close encounter</p>
              <h2 id="close-encounter-title" className="mt-1 text-base font-semibold text-ink">{item.patient_name}</h2>
              <p className="mt-0.5 truncate text-sm text-muted">
                <span className="font-mono">{item.patient_mrn}</span>
                {" · "}
                {stepTitle}
              </p>
            </div>
            <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-xl leading-none text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50" aria-label="Close" disabled={submitting} onClick={onClose}>×</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted">Loading open items…</p>
          ) : loadError ? (
            <p className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-3 text-sm text-danger">{loadError}</p>
          ) : step === "outcome" ? (
            <div className="grid gap-3">
              <p className="text-sm text-muted-strong">How should this encounter end?</p>
              <button
                type="button"
                className="rounded-xl border border-line bg-surface-2 px-4 py-4 text-left transition hover:border-success hover:bg-success-soft/40"
                onClick={() => goNextFromOutcome("complete")}
              >
                <span className="block text-sm font-semibold text-ink">Complete Encounter</span>
                <span className="mt-1 block text-xs text-muted">Mark the visit as Encounter Complete after resolving open items.</span>
              </button>
              <button
                type="button"
                className="rounded-xl border border-line bg-surface-2 px-4 py-4 text-left transition hover:border-warning hover:bg-warning-soft/40"
                onClick={() => goNextFromOutcome("refer")}
              >
                <span className="block text-sm font-semibold text-ink">Refer to a hospital</span>
                <span className="mt-1 block text-xs text-muted">Close the visit as Referred with a hospital / reason note.</span>
              </button>
            </div>
          ) : step === "referral" ? (
            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-ink">Hospital / referral reason</span>
                <textarea
                  className={`${field} min-h-[7rem]`}
                  value={referralNote}
                  onChange={(event) => setReferralNote(event.target.value)}
                  placeholder="Hospital name and reason for referral"
                  maxLength={1000}
                />
              </label>
            </div>
          ) : step === "blockers" && preview ? (
            <div className="grid gap-5">
              {preview.plans.length > 0 ? (
                <section className="grid gap-2">
                  <h3 className="text-sm font-semibold text-ink">Management plans</h3>
                  {preview.plans.map((plan) => {
                    const viewOnly = plan.allowed_actions.length === 0;
                    const resolution = planResolutions[plan.position] ?? { action: "cancel" as const, reason: "" };
                    const reason = plan.status === "cancelled" && plan.cancellation_reason?.trim()
                      ? plan.cancellation_reason.trim()
                      : "";
                    return (
                      <CloseResolutionCard
                        key={plan.position}
                        title={`Plan ${plan.position}`}
                        detail={`${plan.medication_count} meds · ${plan.procedure_count} procedures · ${nursingPlanStatusLabel(plan.status as never)}${viewOnly ? " · View only" : ""}${reason ? ` · ${reason}` : ""}`}
                        allowed={plan.allowed_actions}
                        value={resolution}
                        showReason={!viewOnly}
                        onChange={(next) => setPlanResolutions((current) => ({ ...current, [plan.position]: next }))}
                      />
                    );
                  })}
                </section>
              ) : null}
              {preview.investigations.length > 0 ? (
                <section className="grid gap-2">
                  <h3 className="text-sm font-semibold text-ink">Investigations</h3>
                  {preview.investigations.map((investigation) => {
                    const action = investigationResolutions[investigation.id] ?? "cancel";
                    return (
                      <CloseResolutionCard
                        key={investigation.id}
                        title={investigation.name}
                        detail={investigationStatusLabel(investigation.status as never)}
                        allowed={investigation.allowed_actions}
                        value={{ action, reason: "" }}
                        showReason={false}
                        onChange={(next) => setInvestigationResolutions((current) => ({ ...current, [investigation.id]: next.action }))}
                      />
                    );
                  })}
                  {preview.investigations.some((investigation) => investigationResolutions[investigation.id] === "cancel") ? (
                    <label className="rounded-xl border border-line bg-surface-2 px-3 py-3 grid gap-1.5">
                      <span className="text-xs font-semibold text-muted-strong">Cancellation reason for investigations</span>
                      <textarea
                        className={`${field} min-h-[4.5rem]`}
                        value={investigationCancellationReason}
                        onChange={(event) => setInvestigationCancellationReason(event.target.value)}
                        placeholder="One reason applies to all cancelled investigations"
                        maxLength={500}
                      />
                    </label>
                  ) : null}
                </section>
              ) : null}
            </div>
          ) : step === "confirm" && preview ? (
            <div className="grid gap-3 text-sm">
              <div className="rounded-xl border border-line bg-surface-2 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-strong">Outcome</p>
                <p className="mt-1 font-semibold text-ink">
                  {outcome === "refer" ? "Refer to a hospital" : "Complete Encounter"}
                </p>
                {outcome === "refer" ? (
                  <p className="mt-1 whitespace-pre-wrap text-muted-strong">{referralNote.trim()}</p>
                ) : null}
              </div>
              {preview.plans.map((plan) => {
                const resolution = planResolutions[plan.position];
                if (plan.allowed_actions.length === 0 || !resolution) {
                  return (
                    <div key={`plan-${plan.position}`} className="rounded-xl border border-line px-3 py-2.5">
                      <p className="font-semibold text-ink">Plan {plan.position}</p>
                      <p className="mt-0.5 text-xs text-muted-strong">
                        {nursingPlanStatusLabel(plan.status as never)} · View only
                        {plan.status === "cancelled" && plan.cancellation_reason?.trim() ? ` · ${plan.cancellation_reason.trim()}` : ""}
                      </p>
                    </div>
                  );
                }
                return (
                  <CloseSummaryLine
                    key={`plan-${plan.position}`}
                    label={`Plan ${plan.position}`}
                    action={resolution.action}
                    reason={resolution.reason}
                  />
                );
              })}
              {preview.investigations.map((investigation) => {
                const action = investigationResolutions[investigation.id];
                if (!action) return null;
                return (
                  <CloseSummaryLine
                    key={investigation.id}
                    label={investigation.name}
                    action={action}
                    reason=""
                  />
                );
              })}
              {preview.investigations.some((investigation) => investigationResolutions[investigation.id] === "cancel") ? (
                <div className="rounded-xl border border-line px-3 py-2.5">
                  <p className="font-semibold text-ink">Investigation cancellation reason</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-strong">{investigationCancellationReason.trim()}</p>
                </div>
              ) : null}
              {!hasBlockers ? (
                <p className="text-muted-strong">No open plans, monitoring, or investigations need resolution.</p>
              ) : null}
            </div>
          ) : null}
          {submitError ? (
            <p className="mt-4 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{submitError}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-3">
          <button
            type="button"
            className={`${secondary} h-9 px-3 text-xs`}
            disabled={submitting || step === "outcome"}
            onClick={() => {
              setSubmitError(null);
              if (step === "confirm") setStep(hasBlockers ? "blockers" : outcome === "refer" ? "referral" : "outcome");
              else if (step === "blockers") setStep(outcome === "refer" ? "referral" : "outcome");
              else if (step === "referral") setStep("outcome");
            }}
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className={`${secondary} h-9 px-3 text-xs`} disabled={submitting} onClick={onClose}>
              Cancel
            </button>
            {step === "referral" ? (
              <button type="button" className={`${primary} h-9 px-3 text-xs`} onClick={goNextFromReferral}>Continue</button>
            ) : null}
            {step === "blockers" ? (
              <button type="button" className={`${primary} h-9 px-3 text-xs`} onClick={goNextFromBlockers}>Continue</button>
            ) : null}
            {step === "confirm" ? (
              <button type="button" className={`${primary} h-9 px-3 text-xs`} disabled={submitting || loading || Boolean(loadError)} onClick={() => void submitClose()}>
                {submitting ? "Closing…" : outcome === "refer" ? "Confirm referral" : "Confirm complete"}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function CloseResolutionCard({
  title,
  detail,
  allowed,
  value,
  onChange,
  showReason = true,
}: {
  title: string;
  detail: string;
  allowed: CloseResolutionAction[];
  value: ResolutionChoice;
  onChange: (next: ResolutionChoice) => void;
  showReason?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-muted">{detail}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allowed.includes("complete") ? (
            <button
              type="button"
              className={`h-8 rounded-lg px-2.5 text-xs font-semibold ${value.action === "complete" ? "bg-success text-white" : "border border-line bg-surface text-ink"}`}
              onClick={() => onChange({ action: "complete", reason: "" })}
            >
              Complete
            </button>
          ) : null}
          {allowed.includes("cancel") ? (
            <button
              type="button"
              className={`h-8 rounded-lg px-2.5 text-xs font-semibold ${value.action === "cancel" ? "bg-danger text-white" : "border border-line bg-surface text-ink"}`}
              onClick={() => onChange({ ...value, action: "cancel" })}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
      {showReason && allowed.includes("cancel") && value.action === "cancel" ? (
        <label className="mt-3 grid gap-1">
          <span className="text-xs font-semibold text-muted-strong">Cancellation reason</span>
          <textarea
            className={`${field} min-h-[4.5rem]`}
            value={value.reason}
            onChange={(event) => onChange({ ...value, reason: event.target.value })}
            placeholder="Required reason"
            maxLength={500}
          />
        </label>
      ) : null}
    </div>
  );
}

function CloseSummaryLine({
  label,
  action,
  reason,
}: {
  label: string;
  action: CloseResolutionAction;
  reason: string;
}) {
  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <p className="font-semibold text-ink">{label}</p>
      <p className="mt-0.5 text-xs text-muted-strong">
        {action === "complete" ? "Complete" : "Cancel"}
        {action === "cancel" && reason.trim() ? ` · ${reason.trim()}` : ""}
      </p>
    </div>
  );
}

function NurseRecordsPanel({ patients, now, token, onChanged }: { patients: NursePatientRecord[]; now: number; token: string; onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<"" | CasePriority>("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<NursePatientRecord | null>(null);
  const needle = query.trim().toLowerCase();
  const visible = patients.filter((item) => {
    if (focus && item.latest.case_priority !== focus) return false;
    if (!needle) return true;
    const place = [item.patientName, item.patientMrn, item.hotelRoomNo, item.hotelName, item.chiefComplaint].filter(Boolean).join(" ").toLowerCase();
    return place.includes(needle);
  });
  const pages = Math.max(1, Math.ceil(visible.length / monitoringPageSize));
  const safePage = Math.min(page, pages);
  const start = visible.length === 0 ? 0 : (safePage - 1) * monitoringPageSize + 1;
  const end = Math.min(safePage * monitoringPageSize, visible.length);
  const paged = visible.slice((safePage - 1) * monitoringPageSize, safePage * monitoringPageSize);
  const counts = {
    all: patients.length,
    stable: patients.filter((item) => item.latest.case_priority === "stable").length,
    urgent: patients.filter((item) => item.latest.case_priority === "urgent").length,
    emergency: patients.filter((item) => item.latest.case_priority === "emergency").length,
  };

  function openNurseRecord(item: NursePatientRecord) {
    setViewing(item);
    if (!unviewedSince(item)) return;
    void api(`/api/doctor-cases/${item.visitId}/monitoring/viewed`, { method: "POST" }, token)
      .then(() => onChanged())
      .catch(() => undefined);
  }

  return (
    <section className="rounded-2xl border border-line bg-surface shadow-card">
      <div className="border-b border-line-soft p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Patients Under Monitoring & Nursing Care</h2>
            <p className="mt-0.5 text-sm text-muted">Active nursing observations for your assigned patients.</p>
          </div>
          <label className="relative block w-full max-w-sm">
            <span className="sr-only">Search monitoring</span>
            <input
              className={field}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name, MRN, or hotel"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <QueueChip label="All" count={counts.all} active={focus === ""} onClick={() => { setFocus(""); setPage(1); }} />
          <QueueChip label="Stable" count={counts.stable} active={focus === "stable"} onClick={() => { setFocus("stable"); setPage(1); }} dot="bg-success" />
          <QueueChip label="Urgent" count={counts.urgent} active={focus === "urgent"} onClick={() => { setFocus("urgent"); setPage(1); }} dot="bg-warning" />
          <QueueChip label="Emergency" count={counts.emergency} active={focus === "emergency"} onClick={() => { setFocus("emergency"); setPage(1); }} dot="bg-danger" />
        </div>
      </div>
      <div className="overflow-auto">
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">{patients.length === 0 ? "No patients under monitoring." : "No records match this search."}</p>
        ) : (
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="sticky top-0 z-10 bg-surface-2">
              <tr>
                <th className={`${th} sticky top-0 bg-surface-2`}>Patient</th>
                <th className={`${th} sticky top-0 bg-surface-2`}>Reason</th>
                <th className={`${th} sticky top-0 bg-surface-2`}>Start</th>
                <th className={`${th} sticky top-0 bg-surface-2`}>Duration</th>
                <th className={`${th} sticky top-0 bg-surface-2`}>Nursing status</th>
                <th className={`${th} sticky top-0 bg-surface-2`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item) => {
                const waitingSince = unviewedSince(item);
                const startAt = item.monitoringStartedAt ?? item.latest.recorded_at;
                const durationMs = startAt ? Math.max(0, now - new Date(startAt).getTime()) : null;
                return (
                  <tr key={item.visitId} className={waitingSince ? "border-t border-warning-line bg-warning-soft" : "border-t border-line-soft"}>
                    <td className="px-4 py-3">
                      <p className="truncate font-semibold text-ink">{item.patientName}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        <span className="font-mono">{item.patientMrn}</span>
                        {" · "}
                        {item.hotelRoomNo ? `Room ${item.hotelRoomNo}` : "No room"}
                        {item.hotelName ? ` · ${item.hotelName}` : ""}
                      </p>
                      {waitingSince ? (
                        <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-warning px-2 py-0.5 text-[11px] font-semibold text-white">
                          Unviewed
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink">
                      <span className="line-clamp-2">{item.chiefComplaint?.trim() || item.latest.notes.trim() || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-strong">{startAt ? formatWhen(startAt) : "—"}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-ink">{durationMs == null ? "—" : waitMinutesLabel(durationMs)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${monitoringStatusClass(item.monitoringStatus)}`}>{monitoringStatusLabel(item.monitoringStatus)}</span>
                        <PriorityChip priority={item.latest.case_priority} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" className={`${waitingSince ? primary : secondary} h-8 px-3 py-0 text-xs`} onClick={() => openNurseRecord(item)}>
                        {waitingSince ? "Update" : "View"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-3 py-3">
        <p className="text-xs text-muted-strong">{visible.length === 0 ? "0 patients" : `${start}–${end} of ${visible.length}`}</p>
        <div className="flex items-center gap-1.5">
          <button type="button" className={`${secondary} px-2.5 py-1.5 text-xs disabled:opacity-50`} disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
          <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-blue px-1.5 text-xs font-semibold text-white">{visible.length === 0 ? 0 : safePage}</span>
          <button type="button" className={`${secondary} px-2.5 py-1.5 text-xs disabled:opacity-50`} disabled={safePage >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))}>Next</button>
        </div>
      </div>
      {viewing ? <MonitoringAssessmentDialog token={token} patient={viewing} now={now} onClose={() => setViewing(null)} onChanged={onChanged} /> : null}
    </section>
  );
}

function AnalyticsRail({
  summary,
  nursePatients,
  underObservation,
}: {
  summary: DoctorCaseSummary;
  nursePatients: NursePatientRecord[];
  underObservation: number;
}) {
  const triageTotal = Math.max(1, summary.emergency + summary.urgent + summary.normal);
  const triageSlices = [
    { label: "Emergency", count: summary.emergency, tone: "bg-danger" },
    { label: "Urgent", count: summary.urgent, tone: "bg-warning" },
    { label: "Stable", count: summary.normal, tone: "bg-success" },
  ];
  const workflow = [
    { label: "Waiting for Doctor", count: summary.waiting },
    { label: "Consultation In Progress", count: summary.consultation_in_progress },
    { label: "Waiting for Investigation", count: summary.waiting_for_investigation },
    { label: "Under Nursing Care", count: summary.under_nursing_care },
    { label: "Encounter Complete", count: summary.encounter_complete },
    { label: "Referred", count: summary.referred },
  ];
  const workflowMax = Math.max(1, ...workflow.map((item) => item.count));
  const nursing = {
    stable: nursePatients.filter((item) => item.latest.case_priority === "stable").length,
    urgent: nursePatients.filter((item) => item.latest.case_priority === "urgent").length,
    emergency: nursePatients.filter((item) => item.latest.case_priority === "emergency").length,
  };
  const overview = [
    { label: "Patients today", count: summary.today },
    { label: "Waiting for doctor", count: summary.waiting },
    { label: "To see now", count: summary.to_see_now },
    { label: "Waiting for investigation", count: summary.waiting_for_investigation },
    { label: "Results ready", count: summary.results_ready },
    { label: "Under observation", count: underObservation },
  ];

  return (
    <aside className="grid gap-4">
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Today&apos;s Overview</h3>
        <p className="mt-0.5 text-xs text-muted">Visit counts from your assigned cases.</p>
        <ul className="mt-3 grid gap-2">
          {overview.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-strong">{item.label}</span>
              <span className="font-semibold tabular-nums text-ink">{item.count}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Triage Priority</h3>
        <p className="mt-0.5 text-xs text-muted">Patients waiting to see the doctor.</p>
        <div className="mt-4 flex items-center gap-4">
          <div
            className="h-24 w-24 shrink-0 rounded-full"
            style={{
              background: `conic-gradient(#c23b3b 0 ${(summary.emergency / triageTotal) * 100}%, #d97706 ${(summary.emergency / triageTotal) * 100}% ${((summary.emergency + summary.urgent) / triageTotal) * 100}%, #1f8a5b ${((summary.emergency + summary.urgent) / triageTotal) * 100}% 100%)`,
            }}
            aria-hidden="true"
          />
          <ul className="grid gap-1.5 text-sm">
            {triageSlices.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} aria-hidden="true" />
                <span className="text-muted-strong">{item.label}</span>
                <span className="font-semibold tabular-nums text-ink">{item.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Clinical Workflow</h3>
        <p className="mt-0.5 text-xs text-muted">Where assigned visits sit right now.</p>
        <ul className="mt-3 grid gap-2.5">
          {workflow.map((item) => (
            <li key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-strong">{item.label}</span>
                <span className="font-semibold tabular-nums text-ink">{item.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-blue" style={{ width: `${Math.max(item.count === 0 ? 0 : 8, (item.count / workflowMax) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Nursing Observation</h3>
        <p className="mt-0.5 text-xs text-muted">Priority of monitored patients.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-success-soft px-2 py-3 text-center">
            <p className="text-lg font-bold text-success">{nursing.stable}</p>
            <p className="text-[11px] font-semibold text-success">Stable</p>
          </div>
          <div className="rounded-xl bg-warning-soft px-2 py-3 text-center">
            <p className="text-lg font-bold text-warning">{nursing.urgent}</p>
            <p className="text-[11px] font-semibold text-warning">Urgent</p>
          </div>
          <div className="rounded-xl bg-danger-soft px-2 py-3 text-center">
            <p className="text-lg font-bold text-danger">{nursing.emergency}</p>
            <p className="text-[11px] font-semibold text-danger">Emergency</p>
          </div>
        </div>
      </section>
    </aside>
  );
}

type DoctorAssessmentStatus = "stable" | "needs_review" | "deteriorating";

type OrderEditor =
  | { kind: "medication"; order: MedicationOrder; existing: boolean; locked: boolean; planOrders: MedicationOrder[] }
  | { kind: "procedure"; order: ProcedureOrder; existing: boolean; locked: boolean; medications: MedicationOrder[]; procedures: ProcedureOrder[] };

function MonitoringAssessmentDialog({
  token,
  patient,
  now,
  onClose,
  onChanged,
}: {
  token: string;
  patient: NursePatientRecord;
  now: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [savedOnReading, setSavedOnReading] = useState<{ id: string; doctor_assessment: DoctorAssessmentStatus | null; clinical_assessment: string } | null>(null);
  const [completeConfirmed, setCompleteConfirmed] = useState(false);
  const records = patient.records.map((row) => (
    savedOnReading && row.id === savedOnReading.id
      ? { ...row, doctor_assessment: savedOnReading.doctor_assessment, clinical_assessment: savedOnReading.clinical_assessment }
      : row
  ));
  const latest = records[0];
  const [plan, setPlan] = useState<NursingPlanDetail | null>(null);
  const [savedPlans, setSavedPlans] = useState<ManagementPlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogMedication[]>([]);
  const [services, setServices] = useState<MedicalService[]>([]);
  const [servicesReady, setServicesReady] = useState(false);
  const [medications, setMedications] = useState<MedicationOrder[]>([]);
  const [procedures, setProcedures] = useState<ProcedureOrder[]>([]);
  const [status, setStatus] = useState<DoctorAssessmentStatus | "">("");
  const [clinical, setClinical] = useState("");
  const [tab, setTab] = useState<"assessment" | "history">("assessment");
  const [editor, setEditor] = useState<OrderEditor | null>(null);
  const [pending, setPending] = useState<"send" | "note" | "complete" | "end" | "cancel" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [offerEnd, setOfferEnd] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancelPosition, setConfirmCancelPosition] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const nationality = plan?.visit.patient_nationality;
  const monitoringStatus = plan?.visit.monitoring_status ?? patient.monitoringStatus;
  const listedProcedures = standaloneProcedures(procedures);
  const nextPlanPosition = savedPlans.reduce((max, item) => Math.max(max, item.position), 0) + 1;
  const canSend = medications.length + listedProcedures.length > 0;
  const canSendNote = Boolean(latest) && (status === "stable" || status === "needs_review" || status === "deteriorating") && clinical.trim().length > 0;
  const canComplete = monitoringStatus === "in_progress" && records.length > 0;
  const visitStatus = plan?.visit.status;
  const canOfferEnd = offerEnd
    && Boolean(plan?.can_end_encounter)
    && canEndEncounter(visitStatus, monitoringStatus, plan?.visit.investigation_phase);
  const previous = records[1];
  const latestPressure = parsePressure(latest?.blood_pressure ?? null);
  const previousPressure = parsePressure(previous?.blood_pressure ?? null);
  const checks = {
    temp: assessVital("temp", latest?.temperature_c ?? null),
    pulse: assessVital("pulse", latest?.pulse ?? null),
    bp: latestPressure ? assessPressure(String(latestPressure.systolic), String(latestPressure.diastolic)) : { state: "empty", label: "" } as VitalCheck,
    rr: assessVital("rr", latest?.respiratory_rate ?? null),
    spo2: assessVital("spo2", latest?.spo2 ?? null),
  };
  const vitalNames: Record<keyof typeof checks, string> = { temp: "Temperature", pulse: "Heart rate", bp: "Blood pressure", rr: "Respiratory rate", spo2: "Oxygen saturation" };
  const flagged = (Object.entries(checks) as [keyof typeof checks, VitalCheck][])
    .filter(([, check]) => check.state === "abnormal" || check.state === "critical")
    .map(([key, check]) => ({ name: vitalNames[key], check }));

  useEffect(() => {
    if (editor || confirmComplete || confirmCancelPosition != null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editor, confirmComplete, confirmCancelPosition, onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setOfferEnd(false);
    api<NursingPlanDetail>(`/api/patients/${patient.patientId}/visits/${patient.visitId}/nursing-plan`, {}, token)
      .then((detail) => {
        if (cancelled) return;
        setPlan((current) => {
          if (current?.visit.monitoring_status === "completed" && detail.visit.monitoring_status !== "completed") {
            const canEnd = current.can_end_encounter && canEndEncounter(detail.visit.status, "completed", detail.visit.investigation_phase);
            return {
              ...detail,
              can_end_encounter: canEnd,
              visit: { ...detail.visit, monitoring_status: "completed" },
            };
          }
          return detail;
        });
        setOfferEnd((current) => {
          if (current && detail.visit.monitoring_status !== "completed") {
            return current && canEndEncounter(detail.visit.status, "completed", detail.visit.investigation_phase);
          }
          return detail.can_end_encounter;
        });
        setSavedPlans(detail.plans ?? []);
        setMedications([]);
        setProcedures([]);
        const params = new URLSearchParams({
          clinic_id: detail.visit.clinic_id,
          service_type: "Procedures & Interventions Services",
        });
        api<{ items: MedicalService[] }>(`/api/services?${params}`, {}, token)
          .then((data) => {
            if (!cancelled) setServices(data.items);
          })
          .catch(() => {
            if (!cancelled) setServices([]);
          })
          .finally(() => {
            if (!cancelled) setServicesReady(true);
          });
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(messageOf(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    api<{ items: CatalogMedication[] }>("/api/medications", {}, token)
      .then((data) => {
        if (!cancelled) setCatalog(data.items);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [patient.patientId, patient.visitId, token]);

  function saveMedication(order: MedicationOrder) {
    setMedications((current) => {
      const exists = current.some((item) => item.id === order.id);
      const next = exists ? current.map((item) => item.id === order.id ? order : item) : [...current, order];
      setProcedures((rows) => reconcileProcedures(next, rows, catalog, nationality));
      return next;
    });
    setEditor(null);
    setFormError(null);
  }

  function removeMedication(id: string) {
    setMedications((current) => {
      const next = current.filter((item) => item.id !== id);
      setProcedures((rows) => reconcileProcedures(next, rows, catalog, nationality));
      return next;
    });
  }

  function saveProcedure(order: ProcedureOrder) {
    setProcedures((current) => current.some((item) => item.id === order.id)
      ? current.map((item) => item.id === order.id ? order : item)
      : [...current, order]);
    setEditor(null);
    setFormError(null);
  }

  async function sendAssessment() {
    if (!canSend || pending || !latest) return;
    if (status !== "stable" && status !== "needs_review" && status !== "deteriorating") {
      setFormError("Choose Stable, Needs Review, or Deteriorating.");
      return;
    }
    setPending("send");
    setFormError(null);
    try {
      await api(`/api/patients/${patient.patientId}/visits/${patient.visitId}/monitoring/assessment`, {
        method: "POST",
        body: JSON.stringify({
          observation_id: latest.id,
          status,
          clinical_assessment: clinical.trim(),
          medication_orders: medications,
          procedure_orders: procedures,
        }),
      }, token);
      toast.success("Management plan sent", `Management plan ${nextPlanPosition} is with the nurse.`);
      onChanged();
      onClose();
    } catch (caught) {
      setFormError(messageOf(caught));
    } finally {
      setPending(null);
    }
  }

  async function cancelManagementPlan(position: number) {
    if (pending) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setFormError("Enter a cancellation reason.");
      return;
    }
    setPending("cancel");
    setFormError(null);
    try {
      await api(`/api/patients/${patient.patientId}/visits/${patient.visitId}/nursing-plan/cancel`, {
        method: "POST",
        body: JSON.stringify({ position, reason }),
      }, token);
      toast.success("Management plan cancelled", `Management plan ${position} was cancelled.`);
      setConfirmCancelPosition(null);
      setCancelReason("");
      const detail = await api<NursingPlanDetail>(`/api/patients/${patient.patientId}/visits/${patient.visitId}/nursing-plan`, {}, token);
      setPlan(detail);
      setSavedPlans(detail.plans ?? []);
      onChanged();
    } catch (caught) {
      setFormError(messageOf(caught));
      setConfirmCancelPosition(null);
      setCancelReason("");
    } finally {
      setPending(null);
    }
  }

  async function sendNoteToNurse() {
    if (!canSendNote || pending || !latest) return;
    if (status !== "stable" && status !== "needs_review" && status !== "deteriorating") {
      setFormError("Choose Stable, Needs Review, or Deteriorating.");
      return;
    }
    if (!clinical.trim()) {
      setFormError("Enter a clinical assessment for the nurse.");
      return;
    }
    setPending("note");
    setFormError(null);
    try {
      const result = await api<{ observation_id: string; doctor_assessment: DoctorAssessmentStatus; clinical_assessment: string }>(
        `/api/patients/${patient.patientId}/visits/${patient.visitId}/monitoring/note`,
        {
          method: "POST",
          body: JSON.stringify({
            doctor_assessment: status,
            clinical_assessment: clinical.trim(),
          }),
        },
        token,
      );
      setSavedOnReading({
        id: result.observation_id,
        doctor_assessment: result.doctor_assessment,
        clinical_assessment: result.clinical_assessment,
      });
      toast.success("Note sent to nurse", "The assessment is on the latest nursing record.");
      onChanged();
    } catch (caught) {
      setFormError(messageOf(caught));
    } finally {
      setPending(null);
    }
  }

  async function completeMonitoring() {
    if (!canComplete || pending) return;
    setPending("complete");
    setFormError(null);
    try {
      const result = await api<{ can_end_encounter: boolean; observation_id: string | null; status?: VisitCareStatus }>(`/api/patients/${patient.patientId}/visits/${patient.visitId}/monitoring/complete`, {
        method: "POST",
        body: JSON.stringify({
          doctor_assessment: status || null,
          clinical_assessment: clinical.trim(),
        }),
      }, token);
      setConfirmComplete(false);
      setCompleteConfirmed(true);
      if (result.observation_id) {
        setSavedOnReading({
          id: result.observation_id,
          doctor_assessment: status || null,
          clinical_assessment: clinical.trim(),
        });
      }
      toast.success("Monitoring completed", `${patient.patientName} is no longer under observation.`);
      onChanged();
      const nextStatus = result.status;
      if (result.can_end_encounter && canEndEncounter(nextStatus, "completed", plan?.visit.investigation_phase)) {
        setOfferEnd(true);
        setPlan((current) => current ? {
          ...current,
          can_end_encounter: true,
          visit: {
            ...current.visit,
            monitoring_status: "completed",
            status: nextStatus ?? current.visit.status,
          },
        } : current);
      } else {
        setOfferEnd(false);
        setPlan((current) => current ? {
          ...current,
          can_end_encounter: false,
          visit: {
            ...current.visit,
            monitoring_status: "completed",
            status: nextStatus ?? current.visit.status,
          },
        } : current);
        onClose();
      }
    } catch (caught) {
      setFormError(messageOf(caught));
      setConfirmComplete(false);
    } finally {
      setPending(null);
    }
  }

  async function endEncounter() {
    if (!canOfferEnd || pending) return;
    setPending("end");
    setFormError(null);
    try {
      await api(`/api/patients/${patient.patientId}/visits/${patient.visitId}/monitoring/end-encounter`, { method: "POST" }, token);
      toast.success("Encounter complete", `${patient.patientName} is now Encounter Complete.`);
      onChanged();
      onClose();
    } catch (caught) {
      setFormError(messageOf(caught));
    } finally {
      setPending(null);
    }
  }

  const name = plan?.visit.patient_name ?? patient.patientName;
  const mrn = plan?.visit.patient_mrn ?? patient.patientMrn;
  const room = plan?.visit.hotel_room_no ?? patient.hotelRoomNo;
  const hotel = plan?.visit.hotel_name ?? patient.hotelName;
  const age = plan?.visit.patient_age_at_visit;
  const gender = genderLabel(plan?.visit.patient_gender ?? null);

  return (
    <>
      <div
        className="triage-dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-shell/45 p-4"
        role="presentation"
        onMouseDown={() => {
          if (confirmComplete || confirmCancelPosition != null || pending) return;
          onClose();
        }}
      >
        <section
          className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface shadow-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="monitoring-assessment-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue text-sm font-bold text-white">{initials(name)}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue">Monitoring / Observation Details</p>
                <h2 id="monitoring-assessment-title" className="mt-0.5 truncate text-lg font-semibold text-ink">{name}</h2>
                <p className="mt-0.5 text-sm text-muted">
                  <span className="font-mono">{mrn}</span>
                  {age == null ? "" : ` · ${age} yrs`}
                  {plan ? ` · ${gender}` : ""}
                  {room ? ` · Room ${room}` : ""}
                  {hotel ? ` · ${hotel}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <div className="flex flex-col items-end gap-1.5">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${monitoringStatusClass(monitoringStatus)}`}>{monitoringStatusLabel(monitoringStatus)}</span>
                <PriorityChip priority={latest?.case_priority} />
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-xl leading-none text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close" onClick={onClose}>×</button>
            </div>
          </div>
          <div className="mt-3 flex gap-2 border-b border-line-soft px-5" role="tablist" aria-label="Monitoring details">
            <button
              type="button"
              role="tab"
              id="doctor-monitoring-tab-assessment"
              aria-selected={tab === "assessment"}
              aria-controls="doctor-monitoring-panel"
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${tab === "assessment" ? "border-blue text-blue" : "border-transparent text-muted-strong"}`}
              onClick={() => setTab("assessment")}
            >
              Assessment
            </button>
            <button
              type="button"
              role="tab"
              id="doctor-monitoring-tab-history"
              aria-selected={tab === "history"}
              aria-controls="doctor-monitoring-panel"
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${tab === "history" ? "border-blue text-blue" : "border-transparent text-muted-strong"}`}
              onClick={() => setTab("history")}
            >
              Previous readings
              <span className={`rounded-full px-2 py-0.5 text-xs ${tab === "history" ? "bg-panel text-blue" : "bg-surface-3 text-muted"}`}>{records.length}</span>
            </button>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
            role="tabpanel"
            id="doctor-monitoring-panel"
            aria-labelledby={tab === "assessment" ? "doctor-monitoring-tab-assessment" : "doctor-monitoring-tab-history"}
          >
            {tab === "history" ? (
              records.length > 0 ? <ReadingTimeline rows={records} /> : <p className="py-8 text-center text-sm text-muted">No readings recorded yet.</p>
            ) : (
            <>
            {loadError ? <p className="mb-4 text-sm text-danger">{loadError}</p> : null}
            {loading ? <p className="mb-4 text-sm text-muted">Loading the nursing plan…</p> : null}
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">Latest vital signs</h3>
                <p className="text-xs text-muted">
                  Recorded {agoLabel(latest?.recorded_at ?? null, now)} by {latest?.recorded_by_name?.trim() || "Nurse"}
                  {previous?.recorded_at ? ` · compared with ${formatWhen(previous.recorded_at)}` : ""}
                </p>
              </div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                <ReadVital label="Temperature" unit="°C" range="36.0 – 37.5" value={latest?.temperature_c ?? null} check={checks.temp} previous={previous?.temperature_c ?? null} decimals={1} />
                <ReadVital label="Heart rate" unit="bpm" range="60 – 100" value={latest?.pulse ?? null} check={checks.pulse} previous={previous?.pulse ?? null} />
                <VitalShell
                  label="Blood pressure"
                  check={checks.bp}
                  range="90/60 – 120/80"
                  lastLabel="Previous"
                  lastText={previousPressure ? `${previousPressure.systolic}/${previousPressure.diastolic}` : null}
                  trend={trendText(latestPressure?.systolic ?? null, previousPressure?.systolic ?? null)}
                >
                  <p className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tracking-tight text-ink">{latestPressure ? `${latestPressure.systolic}/${latestPressure.diastolic}` : "—"}</span>
                    <span className="text-xs font-semibold text-muted-strong">mmHg</span>
                  </p>
                </VitalShell>
                <ReadVital label="Respiratory rate" unit="/min" range="12 – 20" value={latest?.respiratory_rate ?? null} check={checks.rr} previous={previous?.respiratory_rate ?? null} />
                <ReadVital label="Oxygen saturation" unit="%" range="95 – 100" value={latest?.spo2 ?? null} check={checks.spo2} previous={previous?.spo2 ?? null} />
              </div>
            </section>
            <AutomaticAssessment priority={latest?.case_priority ?? null} flagged={flagged} emptyText="No vital signs recorded yet." />
            <section className="mt-3 rounded-2xl border border-line-strong bg-surface px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-strong">Nursing notes</h3>
                <p className="text-xs text-muted">{latest?.recorded_by_name?.trim() || "Nurse"} · {latest?.recorded_at ? formatWhen(latest.recorded_at) : "—"}</p>
              </div>
              <p className={`mt-1 whitespace-pre-wrap text-sm ${latest?.notes.trim() ? "text-ink" : "text-muted"}`}>{latest?.notes.trim() ? latest.notes : "No notes recorded."}</p>
              <DoctorReadingAssessment status={latest?.doctor_assessment} clinical={latest?.clinical_assessment} />
            </section>
            {monitoringStatus === "in_progress" && !completeConfirmed ? (
            <section className="mt-5">
              <h3 className="text-sm font-semibold text-ink">Doctor assessment</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Doctor assessment">
                {([
                  ["stable", "Stable", "border-success bg-success-soft text-success"],
                  ["needs_review", "Needs Review", "border-warning bg-warning-soft text-warning"],
                  ["deteriorating", "Deteriorating", "border-danger bg-danger-soft text-danger"],
                ] as const).map(([value, label, active]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={status === value}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold ${status === value ? active : "border-line bg-surface text-ink hover:bg-surface-2"}`}
                    onClick={() => {
                      setStatus(value);
                      setFormError(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-sm font-medium text-ink">
                Clinical assessment
                <textarea
                  className={`${field} min-h-28 resize-y`}
                  maxLength={1000}
                  value={clinical}
                  onChange={(event) => {
                    setClinical(event.target.value);
                    setFormError(null);
                  }}
                  placeholder="Clinical impression for the nurse"
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">{clinical.length}/1000</p>
                <button
                  type="button"
                  className={secondary}
                  disabled={!canSendNote || pending !== null}
                  title={canSendNote ? undefined : "Choose a doctor assessment and enter a clinical assessment"}
                  onClick={() => void sendNoteToNurse()}
                >
                  {pending === "note" ? "Sending…" : "Send a note to nurse"}
                </button>
              </div>
            </section>
            ) : null}
            {savedPlans.filter(planHasOrders).map((entry) => {
              const canCancel = entry.status === "ordered" || entry.status === "in_progress";
              return (
                <section
                  key={entry.position}
                  className={`mt-5 rounded-xl border px-4 py-3 ${entry.status === "cancelled" ? "border-line bg-surface-3/40 opacity-80" : "border-line bg-surface-2"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">Management plan {entry.position}</h3>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${nursingPlanStatusClass(entry.status)}`}>
                        {nursingPlanStatusLabel(entry.status)}
                      </span>
                      {entry.assessment_status ? <AssessmentStatus status={entry.assessment_status} /> : null}
                    </div>
                    {canCancel ? (
                      <button
                        type="button"
                        className={`${secondary} h-8 px-3 py-0 text-xs text-danger`}
                        disabled={pending !== null}
                        onClick={() => {
                          setCancelReason("");
                          setConfirmCancelPosition(entry.position);
                        }}
                      >
                        Cancel plan
                      </button>
                    ) : null}
                  </div>
                  {entry.status === "cancelled" && entry.cancellation_reason?.trim() ? (
                    <div className="mt-2 rounded-lg border border-line bg-surface px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-strong">Cancellation reason</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{entry.cancellation_reason}</p>
                    </div>
                  ) : null}
                  {entry.clinical_assessment.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{entry.clinical_assessment}</p> : null}
                  <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Medication orders</h4>
                  <OrderTable
                    empty="No medication orders."
                    headers={["#", "Medication", "Dose", "Route", "Frequency", "Duration", "Notes"]}
                    rows={entry.medication_orders.map((item, index) => ({
                      id: item.id,
                      cells: [String(index + 1), item.medication || "—", doseLabel(item), item.route || "—", item.frequency || "—", item.duration || "—", item.instructions.trim() || "—"],
                      onOpen: () => setEditor({ kind: "medication", order: item, existing: true, locked: true, planOrders: entry.medication_orders }),
                    }))}
                  />
                  <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Procedures & interventions</h4>
                  <OrderTable
                    empty="No procedures."
                    headers={["#", "Procedure", "Notes"]}
                    rows={standaloneProcedures(entry.procedure_orders).map((item, index) => ({
                      id: item.id,
                      cells: [String(index + 1), item.name || "—", item.notes.trim() || "—"],
                      onOpen: () => setEditor({
                        kind: "procedure",
                        order: item,
                        existing: true,
                        locked: true,
                        medications: entry.medication_orders,
                        procedures: entry.procedure_orders,
                      }),
                    }))}
                  />
                </section>
              );
            })}
            {monitoringStatus === "in_progress" && !completeConfirmed ? (
            <section className="mt-5 rounded-xl border border-panel-strong bg-panel/40 px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Management plan {nextPlanPosition}</h3>
              <p className="mt-1 text-xs text-muted">Orders added here are sent as a new management plan. Earlier plans stay unchanged.</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Medication orders</h4>
                <button
                  type="button"
                  className={`${secondary} h-9 px-3 py-0`}
                  disabled={!plan || catalog.length === 0}
                  onClick={() => setEditor({ kind: "medication", order: emptyOrder(), existing: false, locked: false, planOrders: medications })}
                >
                  Add Medication
                </button>
              </div>
              <OrderTable
                empty="No medication orders yet."
                headers={["#", "Medication", "Dose", "Route", "Frequency", "Duration", "Notes", ""]}
                rows={medications.map((item, index) => ({
                  id: item.id,
                  cells: [String(index + 1), item.medication || "—", doseLabel(item), item.route || "—", item.frequency || "—", item.duration || "—", item.instructions.trim() || "—"],
                  removable: true,
                  onOpen: () => setEditor({ kind: "medication", order: item, existing: true, locked: false, planOrders: medications }),
                  onRemove: () => removeMedication(item.id),
                }))}
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Procedures & interventions</h4>
                <button
                  type="button"
                  className={`${secondary} h-9 px-3 py-0`}
                  disabled={!plan || !servicesReady}
                  onClick={() => setEditor({ kind: "procedure", order: emptyProcedure(), existing: false, locked: false, medications, procedures })}
                >
                  Add Procedure
                </button>
              </div>
              <OrderTable
                empty="No procedures yet."
                headers={["#", "Procedure", "Notes", ""]}
                rows={listedProcedures.map((item, index) => ({
                  id: item.id,
                  cells: [String(index + 1), item.name || "—", item.notes.trim() || "—"],
                  removable: true,
                  onOpen: () => setEditor({ kind: "procedure", order: item, existing: true, locked: false, medications, procedures }),
                  onRemove: () => setProcedures((current) => current.filter((row) => row.id !== item.id)),
                }))}
              />
            </section>
            ) : null}
            </>
            )}
          </div>
          {formError ? <p className="px-5 text-sm text-danger">{formError}</p> : null}
          {canOfferEnd ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-5 py-4">
              <p className="text-sm text-ink">Monitoring is complete. End this encounter?</p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" className={secondary} disabled={pending !== null} onClick={onClose}>Not now</button>
                <button type="button" className={primary} disabled={pending !== null} onClick={() => void endEncounter()}>
                  {pending === "end" ? "Ending…" : "End encounter"}
                </button>
              </div>
            </div>
          ) : tab === "history" ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-5 py-4">
              <button type="button" className={secondary} onClick={onClose}>Close</button>
              <button type="button" className={primary} onClick={() => setTab("assessment")}>Back to assessment</button>
            </div>
          ) : (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-5 py-4">
            <button type="button" className={secondary} onClick={onClose}>Close</button>
            {monitoringStatus === "in_progress" && !completeConfirmed ? (
              <>
                <button
                  type="button"
                  className={secondary}
                  disabled={!canComplete || pending !== null}
                  title={canComplete ? undefined : "Monitoring can be completed while it is in progress and a reading exists"}
                  onClick={() => {
                    setFormError(null);
                    setConfirmComplete(true);
                  }}
                >
                  Complete monitoring
                </button>
                <button
                  type="button"
                  className={primary}
                  disabled={!canSend || pending !== null}
                  title={canSend ? undefined : "Add a medication or procedure to this management plan"}
                  onClick={() => void sendAssessment()}
                >
                  {pending === "send" ? "Sending…" : "Save Assessment and Send to Nurse"}
                </button>
              </>
            ) : null}
          </div>
          )}
        </section>
      </div>
      {editor?.kind === "medication" ? (
        <MedicationOrderDialog
          order={editor.order}
          existing={editor.existing}
          locked={editor.locked}
          catalog={catalog}
          nationality={nationality}
          planOrders={editor.planOrders}
          onClose={() => setEditor(null)}
          onSave={saveMedication}
        />
      ) : null}
      {editor?.kind === "procedure" ? (
        <ProcedureOrderDialog
          order={editor.order}
          existing={editor.existing}
          locked={editor.locked}
          services={services}
          takenIds={editor.procedures.filter((item) => !item.linked_medication_order_id && item.id !== editor.order.id).map((item) => item.procedure_id).filter((id): id is string => Boolean(id))}
          source={editor.medications.find((item) => item.id === editor.order.linked_medication_order_id)?.medication ?? ""}
          nationality={nationality}
          token={token}
          onClose={() => setEditor(null)}
          onSave={saveProcedure}
        />
      ) : null}
      <ConfirmDialog
        open={confirmComplete}
        className="z-[80]"
        eyebrow="Confirm"
        title="Complete monitoring?"
        body="This patient will leave active monitoring. Any doctor assessment entered here is saved on the latest nursing record."
        confirmLabel="Complete monitoring"
        cancelLabel="Cancel"
        pendingLabel="Completing…"
        pending={pending === "complete"}
        onCancel={() => { if (pending !== "complete") setConfirmComplete(false); }}
        onConfirm={() => void completeMonitoring()}
      />
      <ConfirmDialog
        open={confirmCancelPosition != null}
        className="z-[100]"
        eyebrow="Confirm cancel"
        title={`Cancel management plan ${confirmCancelPosition ?? ""}?`}
        body="Enter why this plan should be cancelled. Nurses can still view it as read-only with this reason."
        confirmLabel="Yes, cancel plan"
        cancelLabel="Keep plan"
        pendingLabel="Cancelling…"
        pending={pending === "cancel"}
        error={pending === "cancel" ? null : (formError && confirmCancelPosition != null ? formError : null)}
        reason={{
          label: "Cancellation reason",
          value: cancelReason,
          onChange: setCancelReason,
          placeholder: "e.g. Patient improved, wrong order, switched to another plan…",
          required: true,
          maxLength: 500,
        }}
        onCancel={() => {
          if (pending !== "cancel") {
            setConfirmCancelPosition(null);
            setCancelReason("");
            setFormError(null);
          }
        }}
        onConfirm={() => {
          if (confirmCancelPosition != null) void cancelManagementPlan(confirmCancelPosition);
        }}
      />
    </>
  );
}

function planHasOrders(plan: ManagementPlanRecord) {
  return plan.medication_orders.length > 0
    || standaloneProcedures(plan.procedure_orders).length > 0
    || plan.patient_advices.length > 0
    || plan.management_plan.trim().length > 0
    || plan.clinical_assessment.trim().length > 0;
}

function AssessmentStatus({ status }: { status: NonNullable<ManagementPlanRecord["assessment_status"]> }) {
  const label = status === "needs_review" ? "Needs Review" : status === "deteriorating" ? "Deteriorating" : "Stable";
  const tone = status === "needs_review"
    ? "border-warning bg-warning-soft text-warning"
    : status === "deteriorating"
      ? "border-danger bg-danger-soft text-danger"
      : "border-success bg-success-soft text-success";
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}

function OrderTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: { id: string; cells: string[]; removable?: boolean; onOpen: () => void; onRemove?: () => void }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="mt-3 text-sm text-muted">{empty}</p>;
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface-2">
          <tr>
            {headers.map((header) => <th key={header || "actions"} className={th}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-line-soft">
              {row.cells.map((cell, index) => (
                <td key={`${row.id}-${index}`} className="px-3 py-2">
                  <button type="button" className="text-left text-ink" onClick={row.onOpen}>{cell}</button>
                </td>
              ))}
              {row.removable != null ? (
                <td className="px-3 py-2 text-right">
                  {row.removable ? <button type="button" className="text-xs font-semibold text-danger" onClick={row.onRemove}>Remove</button> : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadVital({
  label,
  unit,
  range,
  value,
  check,
  previous,
  decimals = 0,
}: {
  label: string;
  unit: string;
  range: string;
  value: number | null;
  check: VitalCheck;
  previous: number | null;
  decimals?: number;
}) {
  return (
    <VitalShell
      label={label}
      check={check}
      range={range}
      lastLabel="Previous"
      lastText={previous == null ? null : `${previous} ${unit}`}
      trend={trendText(value, previous, decimals)}
    >
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tracking-tight text-ink">{value ?? "—"}</span>
        <span className="text-xs font-semibold text-muted-strong">{unit}</span>
      </p>
    </VitalShell>
  );
}

function doseLabel(order: MedicationOrder) {
  if (order.dose.trim()) return order.dose;
  if (order.dose_value != null && order.dose_unit) return `${order.dose_value} ${order.dose_unit}`;
  return "—";
}

function genderLabel(value: string | null) {
  if (value === "male") return "Male";
  if (value === "female") return "Female";
  return "—";
}

function canEndEncounter(
  status: VisitCareStatus | string | null | undefined,
  monitoring?: MonitoringStatus | null,
  phase?: InvestigationPhase | null,
) {
  if (status !== "under_nursing_care" && status !== "waiting_for_investigation") return false;
  if (monitoring === "in_progress") return false;
  if (monitoring === "completed") return true;
  return (monitoring === "none" || monitoring == null) && phase === "results_ready";
}

function unviewedSince(item: NursePatientRecord) {
  const sent = item.records
    .map((row) => row.sent_to_doctor_at && !row.doctor_viewed_at ? row.sent_to_doctor_at : null)
    .filter((value): value is string => Boolean(value));
  if (sent.length === 0) return null;
  return sent.reduce((oldest, value) => new Date(value).getTime() < new Date(oldest).getTime() ? value : oldest);
}

function agoLabel(value: string | null, now: number) {
  if (!value) return "—";
  const minutes = Math.floor(Math.max(0, now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
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
  tone: "blue" | "rose" | "amber" | "green";
  active?: boolean;
  alert?: boolean;
  onClick?: () => void;
}) {
  const toneClass = tone === "rose" ? "bg-danger-soft text-danger" : tone === "amber" ? "bg-warning-soft text-warning" : tone === "green" ? "bg-success-soft text-success" : "bg-panel text-blue";
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

function waitMinutesLabel(ms: number | null) {
  if (ms == null) return "—";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function waitTone(elapsed: number | null, targetMs: number) {
  if (elapsed == null) return "text-muted";
  if (elapsed >= targetMs) return "text-danger";
  if (elapsed >= targetMs * 0.6) return "text-warning";
  return "text-success";
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
