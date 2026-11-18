import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  api,
  casePriorityClass,
  casePriorityLabel,
  investigationPriorityClass,
  investigationPriorityLabel,
  investigationStatusClass,
  investigationStatusLabel,
  monitoringStatusClass,
  monitoringStatusLabel,
  nursingPlanStatusClass,
  nursingPlanStatusLabel,
  visitTypeLabel,
  type CasePriority,
  type CatalogMedication,
  type EncounterInvestigation,
  type InvestigationPriority,
  type ManagementPlanRecord,
  type MedicationOrder,
  type MonitoringItem,
  type MonitoringObservation,
  type NurseDashboardSummary,
  type NursingCareItem,
  type NursingPlanDetail,
  type ProcedureOrder,
  type SampleCollectionItem,
} from "../api";
import { procedureServiceCharges, type ProcedureDetails } from "@yaren/shared-kernel";
import { useToast } from "../toast";
import { field, messageOf, primary, secondary } from "./ui";

export function NurseSummaryTiles({
  summary,
  loading,
}: {
  summary: NurseDashboardSummary;
  loading?: boolean;
}) {
  const tiles = [
    { label: "Waiting for Triage", value: summary.waiting_for_triage, tone: "border-blue/20 bg-panel text-blue" },
    { label: "Triage in Progress", value: summary.triage_in_progress, tone: "border-warning-line bg-warning-soft text-warning" },
    { label: "Waiting for doctor", value: summary.to_doctor, tone: "border-success/20 bg-success-soft text-success" },
    { label: "Under Nursing Care", value: summary.under_nursing_care, tone: "border-panel-strong bg-panel-strong text-blue-strong" },
    { label: "Samples to Collect", value: summary.samples_to_collect, tone: "border-warning-line bg-warning-soft text-warning" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <article key={tile.label} className={`rounded-2xl border px-3 py-3 shadow-card sm:px-4 sm:py-4 ${tile.tone} ${tile.label === "Samples to Collect" ? "col-span-2 lg:col-span-1" : ""}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80 sm:text-xs">{tile.label}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums sm:mt-2 sm:text-3xl">{loading ? "—" : tile.value}</p>
        </article>
      ))}
    </div>
  );
}

export function NursingTasksPanel({
  items,
  loading,
  now,
  busyId,
  onViewPlan,
}: {
  items: NursingCareItem[];
  loading?: boolean;
  now: number;
  busyId: string | null;
  onViewPlan: (item: NursingCareItem) => void;
}) {
  const visibleItems = items.filter((item) => (
    item.nursing_plan_status === "ordered"
    || item.nursing_plan_status === "in_progress"
    || item.nursing_plan_status === "cancelled"
  ));
  const groups = groupNursingCareByVisit(visibleItems);
  const activeGroups = groups.filter((group) => group.plans.some((plan) => plan.nursing_plan_status === "ordered" || plan.nursing_plan_status === "in_progress")).length;
  return (
    <section className="rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-panel text-blue"><CareIcon /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Nursing Tasks & Ongoing Care</h2>
          <p className="text-xs text-muted">
            {loading
              ? "Loading"
              : `${groups.length} patient${groups.length === 1 ? "" : "s"}${activeGroups < groups.length ? ` · ${activeGroups} active` : ""}`}
          </p>
        </div>
      </div>
      {groups.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-muted">{loading ? "Loading nursing tasks…" : "No management plans waiting."}</p>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const item = group.primary;
            const elapsed = group.latestOrderTime ? Math.max(0, now - new Date(group.latestOrderTime).getTime()) : 0;
            const orderedCount = group.plans.filter((plan) => plan.nursing_plan_status === "ordered").length;
            const inProgressCount = group.plans.filter((plan) => plan.nursing_plan_status === "in_progress").length;
            const cancelledCount = group.plans.filter((plan) => plan.nursing_plan_status === "cancelled").length;
            const onlyCancelled = orderedCount + inProgressCount === 0 && cancelledCount > 0;
            const busy = group.plans.some((plan) => busyId === `${plan.visit_id}:${plan.plan_position}`);
            return (
              <article
                key={item.visit_id}
                className={onlyCancelled ? "rounded-xl border border-line bg-surface-3/40 p-3" : "rounded-xl border border-line-soft bg-surface-2/40 p-3"}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{item.patient_name}</p>
                    <p className="text-xs text-muted">
                      {item.patient_mrn}
                      {" · "}
                      {group.plans.length === 1
                        ? `Management plan ${group.plans[0].plan_position}`
                        : `${group.plans.length} management plans`}
                      {onlyCancelled ? " · View only" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {inProgressCount > 0 && item.monitoring_status === "in_progress" ? <OnMonitoringChip /> : null}
                    {orderedCount > 0 ? (
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${nursingPlanStatusClass("ordered")}`}>
                        {orderedCount === 1 ? "Ordered" : `${orderedCount} ordered`}
                      </span>
                    ) : null}
                    {inProgressCount > 0 ? (
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${nursingPlanStatusClass("in_progress")}`}>
                        {inProgressCount === 1 ? "In Progress" : `${inProgressCount} in progress`}
                      </span>
                    ) : null}
                    {cancelledCount > 0 ? (
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${nursingPlanStatusClass("cancelled")}`}>
                        {cancelledCount === 1 ? "Cancelled" : `${cancelledCount} cancelled`}
                      </span>
                    ) : null}
                  </div>
                </div>
                {group.plans.length > 1 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {group.plans.map((plan) => (
                      <li
                        key={`${plan.visit_id}:${plan.plan_position}`}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          plan.nursing_plan_status === "ordered"
                            ? "border-warning-line bg-warning-soft text-warning"
                            : plan.nursing_plan_status === "cancelled"
                              ? "border-line bg-surface-3 text-muted-strong"
                              : "border-panel-strong bg-panel text-blue"
                        }`}
                      >
                        Plan {plan.plan_position}
                        <span className="font-medium opacity-80">{nursingPlanStatusLabel(plan.nursing_plan_status)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-strong">
                  <span>Latest order {group.latestOrderTime ? formatClock(group.latestOrderTime) : "—"}</span>
                  <span className="font-mono tabular-nums text-ink">{clockLabel(elapsed)}</span>
                </div>
                <button
                  type="button"
                  className={`${secondary} mt-3 h-9 w-full px-3 text-xs sm:w-auto`}
                  disabled={busy}
                  onClick={() => onViewPlan(item)}
                >
                  {onlyCancelled
                    ? (group.plans.length === 1 ? "View cancelled plan" : "View cancelled plans")
                    : (group.plans.length === 1 ? "View management plan" : "View management plans")}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function groupNursingCareByVisit(items: NursingCareItem[]) {
  const byVisit = new Map<string, NursingCareItem[]>();
  for (const item of items) {
    const list = byVisit.get(item.visit_id) ?? [];
    list.push(item);
    byVisit.set(item.visit_id, list);
  }
  return [...byVisit.values()].map((plans) => {
    const sorted = [...plans].sort((left, right) => {
      const statusRank = (status: NursingCareItem["nursing_plan_status"]) => {
        if (status === "ordered") return 0;
        if (status === "in_progress") return 1;
        if (status === "cancelled") return 2;
        return 3;
      };
      const byStatus = statusRank(left.nursing_plan_status) - statusRank(right.nursing_plan_status);
      if (byStatus !== 0) return byStatus;
      return left.plan_position - right.plan_position;
    });
    const latestOrderTime = sorted
      .map((plan) => plan.order_time)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
    const hasActive = sorted.some((plan) => plan.nursing_plan_status === "ordered" || plan.nursing_plan_status === "in_progress");
    return {
      primary: sorted[0],
      plans: sorted,
      latestOrderTime,
      hasActive,
    };
  }).sort((left, right) => {
    if (left.hasActive !== right.hasActive) return left.hasActive ? -1 : 1;
    const leftTime = left.latestOrderTime ? new Date(left.latestOrderTime).getTime() : 0;
    const rightTime = right.latestOrderTime ? new Date(right.latestOrderTime).getTime() : 0;
    return rightTime - leftTime;
  });
}

export function SampleCollectionCard({
  items,
  loading,
  busyId,
  onViewTests,
  onCollect,
  onSend,
}: {
  items: SampleCollectionItem[];
  loading?: boolean;
  busyId: string | null;
  onViewTests: (item: SampleCollectionItem) => void;
  onCollect: (item: SampleCollectionItem) => void;
  onSend: (item: SampleCollectionItem) => void;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning"><SampleIcon /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Sample Collection</h2>
          <p className="text-xs text-muted">{loading ? "Loading" : `${items.length} patient${items.length === 1 ? "" : "s"}`}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-muted">{loading ? "Loading samples…" : "No samples waiting."}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <article key={item.visit_id} className="rounded-xl border border-line-soft bg-surface-2/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{item.patient_name}</p>
                  <p className="text-xs text-muted">{item.patient_mrn} · Room {item.hotel_room_no || "—"}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${casePriorityClass(item.case_priority)}`}>
                  {casePriorityLabel(item.case_priority)}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                <button type="button" className={`${secondary} h-9 w-full px-3 text-xs`} onClick={() => onViewTests(item)}>
                  View tests ordered
                </button>
                {item.collectable_count > 0 ? (
                  <button
                    type="button"
                    className={`${secondary} h-9 w-full px-3 text-xs`}
                    disabled={busyId === `${item.visit_id}:collect` || busyId === `${item.visit_id}:send`}
                    onClick={() => onCollect(item)}
                  >
                    {busyId === `${item.visit_id}:collect` ? "Collecting…" : "Mark as Collected"}
                  </button>
                ) : null}
                {item.sendable_count > 0 ? (
                  <button
                    type="button"
                    className={`${primary} h-9 w-full px-3 text-xs`}
                    disabled={busyId === `${item.visit_id}:collect` || busyId === `${item.visit_id}:send`}
                    onClick={() => onSend(item)}
                  >
                    {busyId === `${item.visit_id}:send` ? "Sending…" : "Send to Lab"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function MonitoringPanel({
  items,
  loading,
  now,
  token,
  onRecord,
  onChanged,
}: {
  items: MonitoringItem[];
  loading?: boolean;
  now: number;
  token: string;
  onRecord: (item: MonitoringItem) => void;
  onChanged: () => void;
}) {
  const [viewing, setViewing] = useState<{ item: MonitoringItem; tab: "readings" | "plan" } | null>(null);
  const sorted = [...items].sort((left, right) => {
    const leftWaiting = doctorNoteUnviewedSince(left);
    const rightWaiting = doctorNoteUnviewedSince(right);
    if (leftWaiting && !rightWaiting) return -1;
    if (!leftWaiting && rightWaiting) return 1;
    if (leftWaiting && rightWaiting) return new Date(leftWaiting).getTime() - new Date(rightWaiting).getTime();
    return new Date(right.monitoring_started_at ?? 0).getTime() - new Date(left.monitoring_started_at ?? 0).getTime();
  });

  function openRecords(item: MonitoringItem, tab: "readings" | "plan" = "readings") {
    setViewing({ item, tab });
    if (tab !== "readings" || !doctorNoteUnviewedSince(item)) return;
    void api(`/api/patients/${item.patient_id}/visits/${item.visit_id}/monitoring/doctor-notes/viewed`, { method: "POST" }, token)
      .then(() => onChanged())
      .catch(() => undefined);
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-panel text-blue"><MonitorIcon /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Monitoring / Observations</h2>
          <p className="text-xs text-muted">{loading ? "Loading" : `${items.length} patient${items.length === 1 ? "" : "s"}`}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-muted">{loading ? "Loading monitoring…" : "No patients in monitoring."}</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => {
            const serviceCount = item.ordered_services.length;
            const waitingSince = doctorNoteUnviewedSince(item);
            const age = waitingSince ? Math.max(0, now - new Date(waitingSince).getTime()) : 0;
            const activePlans = (item.plans ?? []).filter((plan) => plan.status === "in_progress");
            const planSummary = activePlans.length > 0
              ? activePlans.map((plan) => `Plan ${plan.position}`).join(", ")
              : (item.plans ?? []).length > 1
                ? `${item.plans!.length} management plans`
                : null;
            return (
              <article
                key={item.visit_id}
                className={waitingSince ? "rounded-xl border border-warning-line bg-warning-soft p-3" : "rounded-xl border border-line-soft bg-surface-2/40 p-3"}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{item.patient_name}</p>
                    <p className="truncate text-xs text-muted">
                      {item.patient_mrn}
                      {serviceCount > 0 ? ` · ${serviceCount} service${serviceCount === 1 ? "" : "s"}` : " · No services"}
                    </p>
                    {planSummary ? (
                      <p className="mt-1 truncate text-xs font-medium text-blue-strong">
                        {activePlans.length > 0 ? `In progress: ${planSummary}` : planSummary}
                      </p>
                    ) : null}
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-strong">
                      <span>Started {item.monitoring_started_at ? formatClock(item.monitoring_started_at) : "—"}</span>
                      <span className="font-mono font-semibold tabular-nums text-ink">
                        {clockLabel(item.monitoring_started_at ? Math.max(0, now - new Date(item.monitoring_started_at).getTime()) : 0)}
                      </span>
                    </p>
                    {waitingSince ? (
                      <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-warning px-2.5 py-1 text-xs font-semibold text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
                        Doctor note · {clockLabel(age)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${monitoringStatusClass(item.monitoring_status)}`}>
                      {monitoringStatusLabel(item.monitoring_status)}
                    </span>
                    <PriorityChip priority={item.case_priority} />
                  </div>
                </div>
                {item.monitoring_status === "in_progress" ? (
                  <div className="mt-2.5 grid gap-2">
                    <button type="button" className={`${waitingSince ? primary : secondary} h-9 w-full px-3 text-xs`} onClick={() => openRecords(item)}>
                      {waitingSince ? "View doctor note" : recordLabel(item.observations?.length ?? 0)}
                    </button>
                    {(item.plans?.length ?? 0) > 0 ? (
                      <button type="button" className={`${secondary} h-9 w-full px-3 text-xs`} onClick={() => openRecords(item, "plan")}>
                        {(item.plans?.length ?? 0) === 1 ? "View management plan" : "View management plans"}
                      </button>
                    ) : null}
                    <button type="button" className={`${primary} h-9 w-full px-3 text-xs`} onClick={() => onRecord(item)}>
                      Record
                    </button>
                  </div>
                ) : (
                  <div className="mt-2.5 grid gap-2">
                    <button type="button" className={`${waitingSince ? primary : secondary} h-9 w-full px-3 text-xs`} onClick={() => openRecords(item)}>
                      {waitingSince ? "View doctor note" : recordLabel(item.observations?.length ?? 0)}
                    </button>
                    {(item.plans?.length ?? 0) > 0 ? (
                      <button type="button" className={`${secondary} h-9 w-full px-3 text-xs`} onClick={() => openRecords(item, "plan")}>
                        {(item.plans?.length ?? 0) === 1 ? "View management plan" : "View management plans"}
                      </button>
                    ) : null}
                    <p className="text-center text-xs text-muted">Done</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {viewing ? (
        <MonitoringRecordsModal
          token={token}
          item={viewing.item}
          now={now}
          initialTab={viewing.tab}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </section>
  );
}

function doctorNoteUnviewedSince(item: MonitoringItem) {
  const waiting = (item.observations ?? [])
    .filter((row) => Boolean(row.doctor_noted_at) && !row.nurse_viewed_at && (row.doctor_assessment || (row.clinical_assessment ?? "").trim()))
    .map((row) => row.doctor_noted_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
  return waiting[0] ?? null;
}

function OnMonitoringChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue/20 bg-panel px-2.5 py-1 text-xs font-semibold text-blue">
      <span className="h-1.5 w-1.5 rounded-full bg-blue" aria-hidden="true" />
      Already on Monitoring
    </span>
  );
}

function recordLabel(count: number) {
  if (count === 0) return "View records";
  return count === 1 ? "View 1 record" : `View ${count} records`;
}

export function MonitoringRecordsModal({
  token,
  item,
  now,
  initialTab = "readings",
  onClose,
}: {
  token?: string;
  item: MonitoringItem;
  now: number;
  initialTab?: "readings" | "plan";
  onClose: () => void;
}) {
  const records = item.observations ?? [];
  const plans = sortMonitoringPlans(item.plans ?? []);
  const [tab, setTab] = useState<"readings" | "plan">(initialTab);
  const [catalog, setCatalog] = useState<CatalogMedication[]>([]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, item.visit_id]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
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
  }, [token]);

  return (
    <ModalShell
      title="Monitoring records"
      onClose={onClose}
      wide
      footer={<button type="button" className={`${secondary} w-full sm:w-auto`} onClick={onClose}>Close</button>}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <PatientHero
          name={item.patient_name}
          mrn={item.patient_mrn}
          age={item.patient_age_at_visit}
          gender={item.patient_gender}
          nationality={item.patient_nationality}
          room={item.hotel_room_no}
          clinicName={item.clinic_name}
        />
        <PatientPriorityBanner priority={item.case_priority} compact />
      </div>
      {(item.assigned_doctor_name || item.assigned_nurse_name) ? (
        <p className="mt-3 text-sm text-muted-strong">
          {[
            item.assigned_doctor_name ? `Doctor: ${item.assigned_doctor_name}` : null,
            item.assigned_nurse_name ? `Nurse: ${item.assigned_nurse_name}` : null,
          ].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2 border-b border-line-soft" role="tablist" aria-label="Monitoring history detail">
        <button
          type="button"
          role="tab"
          id="history-records-tab-readings"
          aria-selected={tab === "readings"}
          aria-controls="history-records-panel-readings"
          className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${tab === "readings" ? "border-blue text-blue" : "border-transparent text-muted-strong"}`}
          onClick={() => setTab("readings")}
        >
          Readings
          <span className={`rounded-full px-2 py-0.5 text-xs ${tab === "readings" ? "bg-panel text-blue" : "bg-surface-3 text-muted"}`}>{records.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="history-records-tab-plan"
          aria-selected={tab === "plan"}
          aria-controls="history-records-panel-plan"
          className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${tab === "plan" ? "border-blue text-blue" : "border-transparent text-muted-strong"}`}
          onClick={() => setTab("plan")}
        >
          {plans.length === 1 ? "Management plan" : "Management plans"}
          <span className={`rounded-full px-2 py-0.5 text-xs ${tab === "plan" ? "bg-panel text-blue" : "bg-surface-3 text-muted"}`}>{plans.length}</span>
        </button>
      </div>
      {tab === "readings" ? (
        records.length === 0 ? (
          <p id="history-records-panel-readings" role="tabpanel" aria-labelledby="history-records-tab-readings" className="mt-4 text-sm text-muted">
            No readings recorded yet.
          </p>
        ) : (
          <ul id="history-records-panel-readings" role="tabpanel" aria-labelledby="history-records-tab-readings" className="mt-4 space-y-3">
            {records.map((row, index) => (
              <ReadingCard key={row.id} row={row} latest={index === 0} now={now} />
            ))}
          </ul>
        )
      ) : (
        <div id="history-records-panel-plan" role="tabpanel" aria-labelledby="history-records-tab-plan" className="mt-4">
          <MonitoringPlansDetail plans={plans} catalog={catalog} />
        </div>
      )}
    </ModalShell>
  );
}

function sortMonitoringPlans(plans: ManagementPlanRecord[]) {
  const rank = (status: ManagementPlanRecord["status"]) => {
    if (status === "in_progress") return 0;
    if (status === "ordered") return 1;
    if (status === "completed") return 2;
    if (status === "cancelled") return 3;
    return 4;
  };
  return [...plans].sort((left, right) => {
    const byStatus = rank(left.status) - rank(right.status);
    if (byStatus !== 0) return byStatus;
    return left.position - right.position;
  });
}

function MonitoringPlansDetail({
  plans,
  catalog,
}: {
  plans: ManagementPlanRecord[];
  catalog: CatalogMedication[];
}) {
  if (plans.length === 0) {
    return <p className="text-sm text-muted">No management plan recorded for this monitoring.</p>;
  }
  return (
    <div className="space-y-4">
      {plans.map((plan) => (
        <MonitoringPlanDetailCard key={`${plan.position}:${plan.id ?? "encounter"}`} plan={plan} catalog={catalog} />
      ))}
    </div>
  );
}

function MonitoringPlanDetailCard({
  plan,
  catalog,
}: {
  plan: ManagementPlanRecord;
  catalog: CatalogMedication[];
}) {
  const medicationOrders = plan.medication_orders;
  const standaloneProcedures = plan.procedure_orders.filter((order) => !order.linked_medication_order_id && order.billing_scope !== "plan");
  const planScopedServices = plan.procedure_orders.filter((order) => order.billing_scope === "plan");
  const adviceCount = plan.patient_advices.length + (plan.management_plan.trim() ? 1 : 0);
  const cancelled = plan.status === "cancelled";

  return (
    <section className={`space-y-3 rounded-2xl border px-4 py-4 ${cancelled ? "border-line bg-surface-3/40 opacity-90" : "border-line bg-surface-2/50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-strong">Management plan</p>
          <h4 className="mt-0.5 text-base font-bold text-ink">Plan {plan.position}</h4>
          {plan.created_at ? <p className="mt-1 text-xs text-muted">Ordered {formatWhen(plan.created_at)}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${nursingPlanStatusClass(plan.status)}`}>
            {nursingPlanStatusLabel(plan.status)}
          </span>
          {plan.assessment_status ? <PlanAssessmentStatus status={plan.assessment_status} /> : null}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        <PlanStat label="Medications" value={medicationOrders.length} />
        <PlanStat label="Procedures" value={standaloneProcedures.length} />
        <PlanStat label="Advice" value={adviceCount} />
      </dl>

      {cancelled ? (
        <div className="rounded-xl border border-line bg-surface-3 px-3 py-2 text-sm text-muted-strong">
          <p>This management plan was cancelled. Details below are view only.</p>
          {plan.cancellation_reason?.trim() ? (
            <p className="mt-2 whitespace-pre-wrap text-ink">
              <span className="font-semibold text-muted-strong">Reason: </span>
              {plan.cancellation_reason}
            </p>
          ) : null}
        </div>
      ) : null}

      {plan.clinical_assessment.trim() ? (
        <div className="rounded-xl border border-line bg-surface px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-strong">Clinical assessment</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink">{plan.clinical_assessment}</p>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h5 className="text-sm font-bold text-ink">Medication orders</h5>
          <span className="text-xs font-semibold text-muted-strong">{medicationOrders.length}</span>
        </div>
        {medicationOrders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">No medications ordered.</p>
        ) : (
          <ol className="space-y-3">
            {medicationOrders.map((order, index) => (
              <NurseMedicationCard
                key={order.id}
                index={index}
                order={order}
                catalog={catalog}
                linked={plan.procedure_orders.filter((procedure) => procedure.linked_medication_order_id === order.id)}
                planServices={planScopedServices.filter((service) => firstMedicationForPlanService(medicationOrders, catalog, service.procedure_id) === order.id)}
              />
            ))}
          </ol>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h5 className="text-sm font-bold text-ink">Procedures & interventions</h5>
          <span className="text-xs font-semibold text-muted-strong">{standaloneProcedures.length}</span>
        </div>
        {standaloneProcedures.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">No standalone procedures ordered.</p>
        ) : (
          <ol className="space-y-3">
            {standaloneProcedures.map((order, index) => (
              <NurseProcedureCard key={order.id} index={index} order={order} />
            ))}
          </ol>
        )}
      </div>

      {(plan.patient_advices.length > 0 || plan.management_plan.trim()) ? (
        <div className="rounded-2xl border border-panel-strong bg-panel-strong/40 px-4 py-3">
          <h5 className="text-sm font-bold text-blue-strong">Advice & nursing plan notes</h5>
          <div className="mt-3 space-y-3">
            {plan.patient_advices.length > 0 ? (
              <ul className="space-y-2">
                {plan.patient_advices.map((advice) => (
                  <li key={advice.id} className="rounded-xl border border-panel-strong/50 bg-surface px-3 py-2.5 text-sm leading-6 text-ink">
                    {advice.text}
                  </li>
                ))}
              </ul>
            ) : null}
            {plan.management_plan.trim() ? (
              <div className="rounded-xl border border-panel-strong/50 bg-surface px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-strong">Management plan notes</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink">{plan.management_plan}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ImplementedPlanCard({ plan }: { plan: ManagementPlanRecord }) {
  const procedures = plan.procedure_orders.filter((item) => !item.linked_medication_order_id);
  return (
    <section className={`rounded-xl border px-3 py-3 ${plan.status === "cancelled" ? "border-line bg-surface-3/50 opacity-80" : "border-line bg-surface-2"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">Management plan {plan.position}</h4>
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${nursingPlanStatusClass(plan.status)}`}>
          {nursingPlanStatusLabel(plan.status)}
        </span>
      </div>
      {plan.assessment_status ? (
        <p className="mt-2 text-xs text-muted-strong">
          Assessment: {plan.assessment_status === "needs_review" ? "Needs Review" : plan.assessment_status === "deteriorating" ? "Deteriorating" : "Stable"}
        </p>
      ) : null}
      {plan.status === "cancelled" && plan.cancellation_reason?.trim() ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
          <span className="font-semibold text-muted-strong">Cancellation reason: </span>
          {plan.cancellation_reason}
        </p>
      ) : null}
      {plan.clinical_assessment.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{plan.clinical_assessment}</p> : null}
      {plan.medication_orders.length > 0 ? (
        <div className="mt-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-strong">Medications</p>
          <ul className="mt-1 space-y-1 text-sm text-ink">
            {plan.medication_orders.map((order) => (
              <li key={order.id}>
                <span className="font-medium">{order.medication}{order.strength ? ` ${order.strength}` : ""}</span>
                <span className="text-xs text-muted"> · {[order.dose, order.route, order.frequency].filter(Boolean).join(" · ") || "As prescribed"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {procedures.length > 0 ? (
        <div className="mt-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-strong">Procedures</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink">
            {procedures.map((order) => (
              <li key={order.id}>{order.name}{order.notes ? ` — ${order.notes}` : ""}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {plan.patient_advices.length > 0 || plan.management_plan.trim() ? (
        <div className="mt-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-strong">Advice</p>
          {plan.patient_advices.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink">
              {plan.patient_advices.map((advice) => <li key={advice.id}>{advice.text}</li>)}
            </ul>
          ) : null}
          {plan.management_plan.trim() ? <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.management_plan}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export function DoctorReadingAssessment({
  status,
  clinical,
}: {
  status?: "stable" | "needs_review" | "deteriorating" | null;
  clinical?: string | null;
}) {
  const text = clinical?.trim() ?? "";
  if (!status && !text) return null;
  const label = status === "needs_review" ? "Needs Review" : status === "deteriorating" ? "Deteriorating" : "Stable";
  const tone = status === "needs_review"
    ? "border-warning bg-warning-soft text-warning"
    : status === "deteriorating"
      ? "border-danger bg-danger-soft text-danger"
      : "border-success bg-success-soft text-success";
  return (
    <div className="mt-2 space-y-1.5 rounded-xl bg-surface px-3 py-2">
      {status ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <span className="font-semibold text-muted-strong">Doctor assessment</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
        </p>
      ) : null}
      {text ? <p className="whitespace-pre-wrap text-sm text-ink"><span className="font-semibold text-muted-strong">Clinical assessment: </span>{text}</p> : null}
    </div>
  );
}

function ReadingCard({ row, latest = false, compact = false, now }: { row: MonitoringObservation; latest?: boolean; compact?: boolean; now?: number }) {
  const elapsed = row.recorded_at && now != null ? Math.max(0, now - new Date(row.recorded_at).getTime()) : null;
  const doctorNoteNew = Boolean(row.doctor_noted_at) && !row.nurse_viewed_at && (Boolean(row.doctor_assessment) || Boolean(row.clinical_assessment?.trim()));
  return (
    <li className={doctorNoteNew ? "rounded-2xl border border-warning-line bg-warning-soft p-3" : "rounded-2xl border border-line bg-canvas p-3"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3">
          <p className="text-sm font-bold text-ink">{row.recorded_at ? formatWhen(row.recorded_at) : "—"}</p>
          {elapsed != null ? <span className="font-mono text-xs font-semibold tabular-nums text-ink">{clockLabel(elapsed)}</span> : null}
          {doctorNoteNew ? <span className="rounded-full bg-warning px-2 py-0.5 text-[11px] font-semibold text-white">New doctor note</span> : null}
        </div>
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          {row.case_priority ? <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${casePriorityClass(row.case_priority)}`}>{casePriorityLabel(row.case_priority)}</span> : null}
          {latest ? <span className="rounded-full bg-blue px-2 py-0.5 text-[11px] font-semibold text-white">Latest</span> : null}
          <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">{row.recorded_by_name?.trim() || "Nurse"}</span>
        </span>
      </div>
      <dl className={`mt-3 grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-5"}`}>
        <ReadingVital tone="temp" label="Temp" value={row.temperature_c == null ? "—" : `${row.temperature_c} °C`} alert={outOfRange("temp", row.temperature_c)} />
        <ReadingVital tone="pulse" label="Pulse" value={row.pulse == null ? "—" : `${row.pulse} /min`} alert={outOfRange("pulse", row.pulse)} />
        <ReadingVital tone="bp" label="BP" value={row.blood_pressure?.trim() ? `${row.blood_pressure}` : "—"} alert={outOfRangePressure(row.blood_pressure)} />
        <ReadingVital tone="rr" label="RR" value={row.respiratory_rate == null ? "—" : `${row.respiratory_rate} /min`} alert={outOfRange("rr", row.respiratory_rate)} />
        <ReadingVital tone="spo2" label="SpO2" value={row.spo2 == null ? "—" : `${row.spo2}%`} alert={outOfRange("spo2", row.spo2)} />
      </dl>
      {row.notes.trim() ? <p className="mt-2 whitespace-pre-wrap rounded-xl bg-surface px-3 py-2 text-sm text-ink">{row.notes}</p> : null}
      <DoctorReadingAssessment status={row.doctor_assessment} clinical={row.clinical_assessment} />
    </li>
  );
}

function ReadingVital({
  tone,
  label,
  value,
  alert,
}: {
  tone: "temp" | "pulse" | "bp" | "rr" | "spo2";
  label: string;
  value: string;
  alert?: boolean;
}) {
  const palette = alert
    ? "bg-danger-soft text-danger ring-1 ring-danger-line"
    : tone === "temp"
      ? "bg-warning-soft text-warning"
      : tone === "pulse"
        ? "bg-panel text-blue"
        : tone === "bp"
          ? "bg-surface text-warning ring-1 ring-gold"
          : tone === "rr"
            ? "bg-success-soft text-success"
            : "bg-panel-strong text-blue-strong";
  return (
    <div className={`rounded-xl px-2.5 py-2 ${palette}`}>
      <dt className="text-[10px] font-bold uppercase tracking-wide">{label}</dt>
      <dd className={`mt-0.5 text-sm font-bold ${alert ? "text-danger" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function outOfRange(kind: "temp" | "pulse" | "rr" | "spo2", value: number | null) {
  if (value == null || !Number.isFinite(value)) return false;
  if (kind === "temp") return value >= 38;
  if (kind === "pulse") return value >= 100;
  if (kind === "rr") return value >= 22;
  return value < 94;
}

function outOfRangePressure(value: string | null) {
  if (!value) return false;
  const match = value.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return false;
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  return systolic >= 140 || diastolic >= 90 || systolic < 90;
}

export function TestsOrderedModal({
  token,
  item,
  busyId,
  onClose,
  onCollect,
  onCollectOne,
  onSend,
  onSendOne,
}: {
  token: string;
  item: SampleCollectionItem;
  busyId: string | null;
  onClose: () => void;
  onCollect: (item: SampleCollectionItem) => void;
  onCollectOne: (item: SampleCollectionItem, investigation: EncounterInvestigation) => Promise<void> | void;
  onSend: (item: SampleCollectionItem) => void;
  onSendOne: (item: SampleCollectionItem, investigation: EncounterInvestigation) => Promise<void> | void;
}) {
  const [items, setItems] = useState<EncounterInvestigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const collectBusy = busyId === `${item.visit_id}:collect`;
  const sendBusy = busyId === `${item.visit_id}:send`;
  const oneBusy = (busyId?.startsWith(`${item.visit_id}:collect:`) || busyId?.startsWith(`${item.visit_id}:send:`)) ?? false;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ items: EncounterInvestigation[] }>(`/api/patients/${item.patient_id}/visits/${item.visit_id}/investigations`, {}, token)
      .then((data) => {
        if (!cancelled) setItems(data.items);
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
  }, [token, item.patient_id, item.visit_id, item.collectable_count, item.sendable_count]);

  async function collectOne(row: EncounterInvestigation) {
    await onCollectOne(item, row);
    setItems((current) => current.map((entry) => (
      entry.id === row.id ? { ...entry, status: "collected" as const } : entry
    )));
  }

  async function sendOne(row: EncounterInvestigation) {
    await onSendOne(item, row);
    setItems((current) => current.map((entry) => (
      entry.id === row.id ? { ...entry, status: "sent" as const } : entry
    )));
  }

  function printOrderedTests() {
    const popup = window.open("", "_blank", "width=800,height=900");
    if (!popup) return;
    const patientLine = [
      item.patient_age_at_visit != null ? `${item.patient_age_at_visit} years` : null,
      item.patient_gender === "male" ? "Male" : item.patient_gender === "female" ? "Female" : null,
      item.patient_nationality,
    ].filter(Boolean).join(" · ");
    const rows = items.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td class="code">${escapeHtml(row.code || "—")}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(investigationPriorityLabel(row.priority))}</td>
        <td>${escapeHtml(investigationStatusLabel(row.status))}</td>
        <td>${escapeHtml(row.ordered_at ? formatWhen(row.ordered_at) : "—")}</td>
      </tr>
    `).join("");
    popup.document.open();
    popup.document.write(`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Tests ordered ${escapeHtml(item.patient_name)}</title>
          <style>
            body { margin: 24px; color: #12263a; font: 14px/1.45 Inter, ui-sans-serif, system-ui, sans-serif; }
            h1 { margin: 4px 0 0; font-size: 22px; }
            .eyebrow { margin: 0; color: #0f7f91; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #d0dbe1; padding: 8px 10px; text-align: left; vertical-align: top; }
            th { background: #f4f7f8; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; }
            .facts { margin-top: 16px; }
            .facts td { width: 50%; }
            .label { display: block; color: #6b7f8f; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
            .code { font-family: ui-monospace, monospace; font-weight: 700; white-space: nowrap; }
          </style>
        </head>
        <body>
          <p class="eyebrow">Yaren Healthcare</p>
          <h1>Tests ordered</h1>
          <table class="facts">
            <tr>
              <td><span class="label">Patient</span>${escapeHtml(item.patient_name)}<br />${escapeHtml(item.patient_mrn)}${patientLine ? ` / ${escapeHtml(patientLine)}` : ""}</td>
              <td><span class="label">Clinic</span>${escapeHtml(item.clinic_name)}<br /><span class="label">Passport number</span>${escapeHtml(item.passport_number?.trim() || "—")}</td>
            </tr>
            <tr>
              <td><span class="label">Patient priority</span>${escapeHtml(casePriorityLabel(item.case_priority))}</td>
              <td><span class="label">Printed</span>${escapeHtml(formatWhen(new Date().toISOString()))}</td>
            </tr>
          </table>
          <table>
            <thead><tr><th>#</th><th>Code</th><th>Test</th><th>Priority</th><th>Status</th><th>Ordered</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <script>window.addEventListener("load", function () { window.focus(); window.print(); });</script>
        </body>
      </html>`);
    popup.document.close();
  }

  return (
    <ModalShell
      title="Tests Ordered"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className={`${secondary} w-full sm:w-auto`} disabled={collectBusy || sendBusy || oneBusy} onClick={onClose}>
            Close
          </button>
          <button type="button" className={`${secondary} w-full gap-1.5 sm:w-auto`} disabled={loading || items.length === 0} onClick={printOrderedTests}>
            <PrintIcon />
            Print
          </button>
          {item.collectable_count > 0 ? (
            <button
              type="button"
              className={`${secondary} w-full sm:w-auto`}
              disabled={collectBusy || sendBusy || oneBusy}
              onClick={() => onCollect(item)}
            >
              {collectBusy ? "Collecting…" : "Mark all as Collected"}
            </button>
          ) : null}
          {item.sendable_count > 0 ? (
            <button
              type="button"
              className={`${primary} w-full sm:w-auto`}
              disabled={collectBusy || sendBusy || oneBusy}
              onClick={() => onSend(item)}
            >
              {sendBusy ? "Sending…" : "Send all to Lab"}
            </button>
          ) : null}
        </>
      }
    >
      <PatientHero
        name={item.patient_name}
        mrn={item.patient_mrn}
        age={item.patient_age_at_visit}
        gender={item.patient_gender}
        nationality={item.patient_nationality}
        room={item.hotel_room_no}
        clinicName={item.clinic_name}
        casePriority={item.case_priority}
      />
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 -mx-1 overflow-x-auto rounded-xl border border-line sm:mx-0">
        <table className="min-w-[42rem] w-full text-left text-sm">
          <thead>
            <tr className="bg-panel text-[11px] font-semibold uppercase tracking-wide text-blue">
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Test Name</th>
              <th className="px-3 py-2.5">Priority</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Ordered Time</th>
              <th className="px-3 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">Loading tests…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">No investigations ordered.</td></tr>
            ) : items.map((row, index) => {
              const canCollect = Boolean(row.requires_collection) && row.status === "ordered";
              const canSend = row.requires_collection ? row.status === "collected" : row.status === "ordered";
              const collectRowBusy = busyId === `${item.visit_id}:collect:${row.id}`;
              const sendRowBusy = busyId === `${item.visit_id}:send:${row.id}`;
              return (
                <tr key={row.id} className="border-t border-line-soft">
                  <td className="px-3 py-3 tabular-nums text-muted">{index + 1}</td>
                  <td className="px-3 py-3 font-semibold text-blue">{row.name}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${investigationPriorityClass(row.priority)}`}>
                      {investigationPriorityLabel(row.priority)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${investigationStatusClass(row.status)}`}>
                      {investigationStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted">{row.ordered_at ? formatWhen(row.ordered_at) : "—"}</td>
                  <td className="px-3 py-3">
                    {canCollect || canSend ? (
                      <div className="flex flex-wrap gap-1.5">
                        {canCollect ? (
                          <button
                            type="button"
                            className={`${secondary} h-8 px-2.5 py-0 text-xs`}
                            disabled={collectBusy || sendBusy || oneBusy}
                            onClick={() => void collectOne(row)}
                          >
                            {collectRowBusy ? "Collecting…" : "Mark as collected"}
                          </button>
                        ) : null}
                        {canSend ? (
                          <button
                            type="button"
                            className={`${primary} h-8 px-2.5 py-0 text-xs`}
                            disabled={collectBusy || sendBusy || oneBusy}
                            onClick={() => void sendOne(row)}
                          >
                            {sendRowBusy ? "Sending…" : "Send to Lab"}
                          </button>
                        ) : null}
                      </div>
                    ) : <span className="text-xs text-muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}

export function ManagementPlanModal({
  token,
  item,
  onClose,
  onChanged,
}: {
  token: string;
  item: NursingCareItem;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<NursingPlanDetail | null>(null);
  const [catalog, setCatalog] = useState<CatalogMedication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(item.plan_position);

  useEffect(() => {
    setSelectedPosition(item.plan_position);
  }, [item.plan_position, item.visit_id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api<NursingPlanDetail>(`/api/patients/${item.patient_id}/visits/${item.visit_id}/nursing-plan`, {}, token),
      api<{ items: CatalogMedication[] }>("/api/medications", {}, token).catch(() => ({ items: [] as CatalogMedication[] })),
    ])
      .then(([data, medications]) => {
        if (cancelled) return;
        setDetail(data);
        setCatalog(medications.items);
        const visiblePlans = data.plans.filter((plan) => (
          plan.status === "ordered" || plan.status === "in_progress" || plan.status === "cancelled"
        ));
        if (visiblePlans.length > 0 && !visiblePlans.some((plan) => plan.position === selectedPosition)) {
          const preferred = visiblePlans.find((plan) => plan.status === "ordered")
            ?? visiblePlans.find((plan) => plan.status === "in_progress")
            ?? visiblePlans[0];
          setSelectedPosition(preferred.position);
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
  }, [token, item.patient_id, item.visit_id]);

  async function startPlan() {
    if (selectedPlan?.status !== "ordered") return;
    setPending(true);
    try {
      await api(`/api/patients/${item.patient_id}/visits/${item.visit_id}/nursing-plan/start`, {
        method: "POST",
        body: JSON.stringify({ position: selectedPosition }),
      }, token);
      toast.success("Management plan started", `Management plan ${selectedPosition} for ${item.patient_name} is now in progress.`);
      onChanged();
      onClose();
    } catch (caught) {
      toast.error("Could not start", messageOf(caught));
    } finally {
      setPending(false);
    }
  }

  async function sendMonitoring() {
    setPending(true);
    try {
      await api(`/api/patients/${item.patient_id}/visits/${item.visit_id}/nursing-plan/monitoring`, { method: "POST" }, token);
      toast.success("Sent to monitoring", `${item.patient_name} is ready for observations.`);
      onChanged();
      onClose();
    } catch (caught) {
      toast.error("Could not send", messageOf(caught));
    } finally {
      setPending(false);
    }
  }

  const visiblePlans = (detail?.plans ?? []).filter((plan) => (
    plan.status === "ordered" || plan.status === "in_progress" || plan.status === "cancelled"
  ));
  const selectedPlan = detail?.plans.find((entry) => entry.position === selectedPosition)
    ?? visiblePlans[0]
    ?? null;
  const activePosition = selectedPlan?.position ?? selectedPosition;
  const viewOnly = selectedPlan?.status === "cancelled" || selectedPlan?.status === "completed";
  const casePriority = detail?.visit.case_priority ?? null;
  const planStarted = selectedPlan?.status === "in_progress";
  const onMonitoring = detail?.visit.monitoring_status === "in_progress";
  const showMonitoringMessage = planStarted && onMonitoring;
  const medicationOrders = selectedPlan?.medication_orders ?? [];
  const standaloneProcedures = selectedPlan?.procedure_orders.filter((order) => !order.linked_medication_order_id && order.billing_scope !== "plan") ?? [];
  const planScopedServices = selectedPlan?.procedure_orders.filter((order) => order.billing_scope === "plan") ?? [];
  const medicationCount = medicationOrders.length;
  const procedureCount = standaloneProcedures.length;
  const adviceCount = selectedPlan
    ? selectedPlan.patient_advices.length + (selectedPlan.management_plan.trim() ? 1 : 0)
    : 0;

  return (
    <ModalShell
      title={visiblePlans.length > 1 ? "Management plans" : `Management plan ${activePosition}`}
      onClose={onClose}
      wide
      footer={detail ? (
        <>
          <button type="button" className={`${secondary} w-full sm:w-auto`} disabled={pending} onClick={onClose}>
            Close
          </button>
          {(detail.visit.monitoring_status === "none" || detail.visit.monitoring_status === "completed") && !viewOnly ? (
            <button
              type="button"
              className={`${secondary} w-full sm:w-auto`}
              disabled={pending}
              onClick={() => void sendMonitoring()}
            >
              {detail.visit.monitoring_status === "completed" ? "Resume Monitoring" : "Send to Monitoring"}
            </button>
          ) : null}
          {viewOnly ? (
            <span className={`inline-flex items-center rounded-lg px-3 py-2.5 text-sm font-semibold ${nursingPlanStatusClass(selectedPlan?.status)}`}>
              {selectedPlan?.status === "cancelled" ? "Cancelled · View only" : "Completed · View only"}
            </span>
          ) : (
            <button
              type="button"
              className={`${primary} w-full sm:w-auto`}
              disabled={pending || selectedPlan?.status !== "ordered"}
              onClick={() => void startPlan()}
            >
              {pending
                ? "Saving…"
                : selectedPlan?.status === "in_progress"
                  ? "Plan In Progress"
                  : `Start Management Plan ${activePosition}`}
            </button>
          )}
        </>
      ) : (
        <button type="button" className={`${secondary} w-full sm:w-auto`} onClick={onClose}>Close</button>
      )}
    >
      {loading ? <p className="text-sm text-muted">Loading plan…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {detail ? (
        <div className="space-y-4">
          <PatientHero
            name={detail.visit.patient_name}
            mrn={detail.visit.patient_mrn}
            age={detail.visit.patient_age_at_visit}
            gender={detail.visit.patient_gender}
            nationality={detail.visit.patient_nationality}
            room={[
              detail.visit.hotel_room_no ? `Room ${detail.visit.hotel_room_no}` : null,
              detail.visit.hotel_name || null,
              detail.visit.clinic_name || null,
            ].filter(Boolean).join(" · ") || null}
            clinicName={detail.visit.clinic_name}
            visitType={visitTypeLabel(detail.visit.visit_type)}
          />

          <PatientPriorityBanner priority={casePriority} />

          {visiblePlans.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {visiblePlans.map((plan) => {
                const active = plan.position === activePosition;
                return (
                  <button
                    key={plan.position}
                    type="button"
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                      active
                        ? plan.status === "cancelled"
                          ? "border-muted-strong bg-surface-3 text-ink"
                          : "border-blue bg-blue text-white"
                        : plan.status === "cancelled"
                          ? "border-line bg-surface-3/60 text-muted-strong hover:bg-surface-3"
                          : "border-line bg-surface text-ink hover:bg-surface-2"
                    }`}
                    onClick={() => setSelectedPosition(plan.position)}
                  >
                    Plan {plan.position}
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${active && plan.status !== "cancelled" ? "bg-white/20 text-white" : nursingPlanStatusClass(plan.status)}`}>
                      {nursingPlanStatusLabel(plan.status)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {selectedPlan?.status === "cancelled" ? (
            <div className="rounded-xl border border-line bg-surface-3 px-3 py-2 text-sm text-muted-strong">
              <p>This management plan was cancelled. You can review the orders below, but it cannot be started.</p>
              {selectedPlan.cancellation_reason?.trim() ? (
                <p className="mt-2 whitespace-pre-wrap text-ink">
                  <span className="font-semibold text-muted-strong">Reason: </span>
                  {selectedPlan.cancellation_reason}
                </p>
              ) : null}
            </div>
          ) : null}

          <section className={`rounded-2xl border px-4 py-3 ${selectedPlan?.status === "cancelled" ? "border-line bg-surface-3/50" : "border-line bg-surface-2"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-strong">This plan</p>
                <h3 className="mt-0.5 text-base font-bold text-ink">Management plan {activePosition}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedPlan ? (
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${nursingPlanStatusClass(selectedPlan.status)}`}>
                    {nursingPlanStatusLabel(selectedPlan.status)}
                  </span>
                ) : null}
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${monitoringStatusClass(detail.visit.monitoring_status)}`}>
                  Monitoring: {monitoringStatusLabel(detail.visit.monitoring_status)}
                </span>
                {showMonitoringMessage ? <OnMonitoringChip /> : null}
                {selectedPlan?.assessment_status ? <PlanAssessmentStatus status={selectedPlan.assessment_status} /> : null}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <PlanStat label="Medications" value={medicationCount} />
              <PlanStat label="Procedures" value={procedureCount} />
              <PlanStat label="Advice" value={adviceCount} />
            </dl>
            {selectedPlan?.created_at ? (
              <p className="mt-2 text-xs text-muted">Ordered {formatWhen(selectedPlan.created_at)}</p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-panel-strong bg-panel px-4 py-3">
            <h3 className="text-sm font-bold text-blue">Diagnosis</h3>
            {detail.plan.provisional_diagnoses.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No diagnoses recorded.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {detail.plan.provisional_diagnoses.map((row) => (
                  <li key={row.id || `${row.code}:${row.title}`} className="rounded-xl border border-panel-strong/60 bg-surface px-3 py-2.5">
                    <p className="text-sm font-semibold text-ink">{row.title}</p>
                    <p className="mt-0.5 text-xs text-muted-strong">
                      {row.source === "icd11" && row.code ? <span className="font-mono text-blue">{row.code}</span> : null}
                      {row.source === "icd11" && row.code ? " · " : null}
                      {row.source === "free_text" ? "Free-text diagnosis" : "ICD-11"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selectedPlan?.clinical_assessment.trim() ? (
            <section className="rounded-2xl border border-line bg-surface px-4 py-3">
              <h3 className="text-sm font-bold text-ink">Clinical assessment</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{selectedPlan.clinical_assessment}</p>
            </section>
          ) : null}

          {selectedPlan ? (
            <>
              <section>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink">Medication orders</h3>
                  <span className="text-xs font-semibold text-muted-strong">{medicationCount}</span>
                </div>
                {medicationCount === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No medications ordered.</p>
                ) : (
                  <ol className="space-y-3">
                    {medicationOrders.map((order, index) => (
                      <NurseMedicationCard
                        key={order.id}
                        index={index}
                        order={order}
                        catalog={catalog}
                        linked={selectedPlan.procedure_orders.filter((procedure) => procedure.linked_medication_order_id === order.id)}
                        planServices={planScopedServices.filter((service) => firstMedicationForPlanService(medicationOrders, catalog, service.procedure_id) === order.id)}
                      />
                    ))}
                  </ol>
                )}
              </section>

              <section>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink">Procedures & interventions</h3>
                  <span className="text-xs font-semibold text-muted-strong">{procedureCount}</span>
                </div>
                {procedureCount === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No standalone procedures ordered.</p>
                ) : (
                  <ol className="space-y-3">
                    {standaloneProcedures.map((order, index) => (
                      <NurseProcedureCard key={order.id} index={index} order={order} />
                    ))}
                  </ol>
                )}
              </section>

              {(selectedPlan.position === 1 || selectedPlan.patient_advices.length > 0 || selectedPlan.management_plan.trim()) ? (
                <section className="rounded-2xl border border-panel-strong bg-panel-strong/40 px-4 py-3">
                  <h3 className="text-sm font-bold text-blue-strong">Advice & nursing plan notes</h3>
                  {selectedPlan.patient_advices.length === 0 && !selectedPlan.management_plan.trim() ? (
                    <p className="mt-2 text-sm text-muted">No advice recorded.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {selectedPlan.patient_advices.length > 0 ? (
                        <ul className="space-y-2">
                          {selectedPlan.patient_advices.map((advice) => (
                            <li key={advice.id} className="rounded-xl border border-panel-strong/50 bg-surface px-3 py-2.5 text-sm leading-6 text-ink">
                              {advice.text}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {selectedPlan.management_plan.trim() ? (
                        <div className="rounded-xl border border-panel-strong/50 bg-surface px-3 py-2.5">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-strong">Management plan notes</p>
                          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink">{selectedPlan.management_plan}</p>
                        </div>
                      ) : null}
                    </div>
                  )}
                </section>
              ) : null}
            </>
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">This management plan was not found on the visit.</p>
          )}
        </div>
      ) : null}
    </ModalShell>
  );
}

function PlanStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-center">
      <p className="text-lg font-bold tabular-nums text-ink">{value}</p>
      <p className="text-[11px] font-semibold text-muted-strong">{label}</p>
    </div>
  );
}

function NurseMedicationCard({
  index,
  order,
  catalog,
  linked,
  planServices,
}: {
  index: number;
  order: MedicationOrder;
  catalog: CatalogMedication[];
  linked: ProcedureOrder[];
  planServices: ProcedureOrder[];
}) {
  const identity = [order.strength, order.dosage_form].filter((part) => part.trim()).join(" · ");
  const dose = order.dose.trim()
    || (order.dose_value != null && order.dose_unit ? `${order.dose_value} ${order.dose_unit}` : null);
  const duration = order.duration.trim()
    || (order.duration_value != null && order.duration_unit ? `${order.duration_value} ${order.duration_unit}` : null);
  const diluent = catalog.find((entry) => entry.id === order.diluent_medication_id) ?? null;
  const diluentName = diluent
    ? [diluent.name, diluent.strength, diluent.dosage_form].filter((part) => part.trim()).join(" · ")
    : null;
  const details = [
    { label: "Dose", value: dose },
    { label: "Route", value: order.route.trim() || null },
    { label: "Frequency", value: order.frequency.trim() || null },
    { label: "Duration", value: duration },
  ];
  const administration = [
    { label: "Flow rate", value: order.flow_rate.trim() || (order.flow_rate_value != null && order.flow_rate_unit ? `${order.flow_rate_value} ${order.flow_rate_unit}` : null) },
    { label: "Infusion duration", value: order.infusion_duration_value != null ? `${order.infusion_duration_value} h` : null },
    { label: "Diluent", value: diluentName },
    { label: "Diluent volume", value: order.diluent_volume_value != null ? `${order.diluent_volume_value} mL` : null },
    {
      label: "Monitoring duration",
      value: order.monitoring_duration_value != null
        ? `${order.monitoring_duration_value} ${order.monitoring_duration_unit || "hours"}`
        : null,
    },
  ].filter((item) => item.value);
  const attached = [
    ...linked.filter((item) => !item.id.startsWith("diluent:") && !item.id.startsWith("medication:")),
    ...planServices,
  ];

  return (
    <li className="rounded-2xl border border-warning-line bg-warning-soft/40 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-warning text-xs font-bold text-white">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-ink">
            {order.medication || "Medication"}
            {identity ? <span className="ml-2 text-sm font-medium text-muted-strong">{identity}</span> : null}
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {details.map((item) => (
              <div key={item.label} className="rounded-xl border border-line bg-surface px-3 py-2">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-strong">{item.label}</dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">{item.value || "—"}</dd>
              </div>
            ))}
          </dl>
          {administration.length > 0 ? (
            <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-strong">Administration details</p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {administration.map((item) => (
                  <div key={item.label} className="rounded-lg bg-surface-2 px-3 py-2">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-strong">{item.label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-ink">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {order.instructions.trim() ? (
            <div className="mt-3 rounded-xl border border-blue/20 bg-panel px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-blue">Nursing instructions</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">{order.instructions}</p>
            </div>
          ) : null}
          {attached.length > 0 ? (
            <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-strong">Attached to this order</p>
              <ul className="mt-2 space-y-2">
                {attached.map((item) => (
                  <li key={item.id} className="rounded-lg border border-line-soft bg-surface-2 px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{item.name}</p>
                        <p className="mt-0.5 text-xs text-muted-strong">
                          {[
                            item.code || null,
                            item.unit || null,
                            item.quantity > 0 ? `Qty ${item.quantity}` : null,
                            item.billing_scope === "plan" ? "Once for this plan" : null,
                          ].filter(Boolean).join(" · ") || "Service attached to this medication"}
                        </p>
                      </div>
                    </div>
                    {item.notes.trim() ? <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{item.notes}</p> : null}
                    <ProcedureDetailBlocks details={item.details} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function firstMedicationForPlanService(orders: MedicationOrder[], catalog: CatalogMedication[], procedureId: string | null) {
  if (!procedureId) return null;
  for (const order of orders) {
    if (!order.medication_id || !order.route) continue;
    const item = catalog.find((entry) => entry.id === order.medication_id);
    const services = item?.routes?.find((entry) => entry.route === order.route)?.services ?? [];
    if (services.some((service) => service.charge_once_per_plan && service.id === procedureId)) return order.id;
  }
  return orders[0]?.id ?? null;
}

function NurseProcedureCard({ index, order }: { index: number; order: ProcedureOrder }) {
  const meta = [
    order.code ? `Code ${order.code}` : null,
    order.unit || null,
    order.quantity > 0 ? `Qty ${order.quantity}` : null,
    order.billing_scope === "plan" ? "Charged once for this plan" : null,
  ].filter(Boolean);
  const associated = procedureServiceCharges(order.details);

  return (
    <li className="rounded-2xl border border-success/20 bg-success-soft/30 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-xs font-bold text-white">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-ink">{order.name || "Procedure"}</p>
          {meta.length > 0 ? <p className="mt-0.5 text-xs text-muted-strong">{meta.join(" · ")}</p> : null}
          <ProcedureDetailBlocks details={order.details} />
          {associated.length > 0 ? (
            <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-strong">Associated services</p>
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {associated.map((service) => (
                  <li key={service.service_id}>
                    <span className="font-semibold">{service.name}</span>
                    {service.code ? <span className="text-xs text-muted"> · {service.code}</span> : null}
                    {service.quantity > 1 ? <span className="text-xs text-muted"> · Qty {service.quantity}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {order.notes.trim() ? (
            <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-strong">Order notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">{order.notes}</p>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

const procedureDetailLabels: Record<string, string> = {
  performed_by: "Performed by",
  assistant: "Assistant",
  anatomical_site: "Anatomical site",
  steps: "Steps",
  findings: "Findings / Outcome",
  outcome: "Outcome",
  complications: "Complications",
  notes: "Clinical note",
  catheter_type: "Catheter type",
  catheter_material: "Catheter material",
  route: "Route",
  size_fr: "Size (Fr)",
  sample_collection: "Sample collection",
  delivery_method: "Delivery method",
  flow_rate: "Flow rate (L/min)",
  oxygen_hours: "Oxygen duration (hours)",
  monitoring_hours: "Monitoring duration (hours)",
  quantity: "Quantity",
};

const longProcedureDetailIds = new Set(["steps", "findings", "outcome", "complications", "notes"]);

function ProcedureDetailBlocks({ details }: { details?: ProcedureDetails }) {
  const rows = procedureDetailRows(details);
  if (rows.length === 0) return null;
  const shortRows = rows.filter((row) => !row.long);
  const longRows = rows.filter((row) => row.long);
  return (
    <div className="mt-3 space-y-2">
      {shortRows.length > 0 ? (
        <dl className="grid gap-2 sm:grid-cols-2">
          {shortRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-line bg-surface px-3 py-2">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-strong">{row.label}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {longRows.map((row) => (
        <div key={row.id} className="rounded-xl border border-line bg-surface px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-strong">{row.label}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">{row.value}</p>
        </div>
      ))}
    </div>
  );
}

function procedureDetailRows(details?: ProcedureDetails) {
  if (!details) return [] as { id: string; label: string; value: string; long: boolean }[];
  return Object.entries(details).flatMap(([id, value]) => {
    if (id === "associated_services") return [];
    if (value == null) return [];
    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return [];
      return [{ id, label: procedureDetailLabels[id] ?? humanizeDetailId(id), value: text, long: longProcedureDetailIds.has(id) || text.length > 80 }];
    }
    if (typeof value === "number") {
      return [{ id, label: procedureDetailLabels[id] ?? humanizeDetailId(id), value: String(value), long: false }];
    }
    if (typeof value === "object" && !Array.isArray(value) && "name" in value) {
      const name = typeof value.name === "string" ? value.name.trim() : "";
      if (!name) return [];
      return [{ id, label: procedureDetailLabels[id] ?? humanizeDetailId(id), value: name, long: false }];
    }
    return [];
  });
}

function humanizeDetailId(id: string) {
  return id.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function RecordMonitoringModal({
  token,
  item,
  onClose,
  onSaved,
}: {
  token: string;
  item: MonitoringItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [temperature, setTemperature] = useState("");
  const [pulse, setPulse] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [respiratory, setRespiratory] = useState("");
  const [spo2, setSpo2] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<MonitoringObservation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [tab, setTab] = useState<"record" | "history" | "plan">("record");
  const [catalog, setCatalog] = useState<CatalogMedication[]>([]);
  const plans = sortMonitoringPlans(item.plans ?? []);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const data = await api<{ items: MonitoringObservation[] }>(
        `/api/patients/${item.patient_id}/visits/${item.visit_id}/monitoring/observations`,
        {},
        token,
      );
      setHistory(data.items);
    } catch (caught) {
      toast.error("Could not load history", messageOf(caught));
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, [token, item.patient_id, item.visit_id]);

  useEffect(() => {
    let cancelled = false;
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
  }, [token]);

  function clearForm() {
    setTemperature("");
    setPulse("");
    setSystolic("");
    setDiastolic("");
    setRespiratory("");
    setSpo2("");
    setNotes("");
  }

  const priority = readingPriority({
    temperature: numberOrNull(temperature),
    pulse: numberOrNull(pulse),
    respiratory: numberOrNull(respiratory),
    spo2: numberOrNull(spo2),
    systolic: numberOrNull(systolic),
    diastolic: numberOrNull(diastolic),
  });

  const last = history[0] ?? null;
  const lastPressure = parsePressure(last?.blood_pressure ?? null);
  const checks = {
    temp: assessVital("temp", numberOrNull(temperature)),
    pulse: assessVital("pulse", numberOrNull(pulse)),
    bp: assessPressure(systolic, diastolic),
    rr: assessVital("rr", numberOrNull(respiratory)),
    spo2: assessVital("spo2", numberOrNull(spo2)),
  };
  const vitalNames: Record<keyof typeof checks, string> = { temp: "Temperature", pulse: "Heart rate", bp: "Blood pressure", rr: "Respiratory rate", spo2: "Oxygen saturation" };
  const entries = Object.entries(checks) as [keyof typeof checks, VitalCheck][];
  const invalid = entries.filter(([, check]) => check.state === "invalid");
  const flagged = entries.filter(([, check]) => check.state === "abnormal" || check.state === "critical");
  const entered = entries.some(([, check]) => check.state !== "empty" && check.state !== "invalid");
  const blocker = invalid.length > 0
    ? `Check ${invalid.map(([key]) => vitalNames[key].toLowerCase()).join(", ")}.`
    : !entered
      ? "Enter at least one vital sign to save."
      : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (blocker) return;
    setPending(true);
    try {
      const blood_pressure = systolic && diastolic ? `${systolic}/${diastolic}` : "";
      await api(`/api/patients/${item.patient_id}/visits/${item.visit_id}/monitoring`, {
        method: "POST",
        body: JSON.stringify({
          temperature_c: temperature ? Number(temperature) : null,
          pulse: pulse ? Number(pulse) : null,
          respiratory_rate: respiratory ? Number(respiratory) : null,
          spo2: spo2 ? Number(spo2) : null,
          blood_pressure,
          notes,
        }),
      }, token);
      toast.success("Observation saved", `Reading recorded for ${item.patient_name}.`);
      clearForm();
      await loadHistory();
      onSaved();
    } catch (caught) {
      toast.error("Could not save", messageOf(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <ModalShell
      title="Record Monitoring / Observation"
      onClose={onClose}
      wide
      footer={
        <>
          {tab === "record" && blocker ? <p className="text-center text-xs font-medium text-muted-strong sm:mr-auto sm:self-center sm:text-left">{blocker}</p> : null}
          <button type="button" className={`${secondary} w-full sm:w-auto`} disabled={pending} onClick={onClose}>
            Close
          </button>
          {tab === "record" ? (
            <>
              <button type="submit" form="record-monitoring-form" className={`${primary} w-full sm:w-auto`} disabled={pending || Boolean(blocker)}>
                {pending ? "Saving…" : "Save Observation"}
              </button>
            </>
          ) : (
            <button type="button" className={`${primary} w-full sm:w-auto`} onClick={() => setTab("record")}>
              Record new reading
            </button>
          )}
        </>
      }
    >
      <PatientHero
        name={item.patient_name}
        mrn={item.patient_mrn}
        age={item.patient_age_at_visit}
        gender={item.patient_gender}
        nationality={item.patient_nationality}
        room={item.hotel_room_no}
        clinicName={item.clinic_name}
        casePriority={last?.case_priority ?? item.case_priority}
      />
      <div className="mt-4 flex flex-wrap gap-2 border-b border-line-soft" role="tablist" aria-label="Monitoring record">
        <button
          type="button"
          role="tab"
          id="monitoring-tab-record"
          aria-selected={tab === "record"}
          aria-controls="record-monitoring-form"
          className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${tab === "record" ? "border-blue text-blue" : "border-transparent text-muted-strong"}`}
          onClick={() => setTab("record")}
        >
          New reading
        </button>
        <button
          type="button"
          role="tab"
          id="monitoring-tab-history"
          aria-selected={tab === "history"}
          aria-controls="monitoring-panel-history"
          className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${tab === "history" ? "border-blue text-blue" : "border-transparent text-muted-strong"}`}
          onClick={() => setTab("history")}
        >
          Previous readings
          <span className={`rounded-full px-2 py-0.5 text-xs ${tab === "history" ? "bg-panel text-blue" : "bg-surface-3 text-muted"}`}>{history.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="monitoring-tab-plan"
          aria-selected={tab === "plan"}
          aria-controls="monitoring-panel-plan"
          className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${tab === "plan" ? "border-blue text-blue" : "border-transparent text-muted-strong"}`}
          onClick={() => setTab("plan")}
        >
          {plans.length === 1 ? "Management plan" : "Management plans"}
          <span className={`rounded-full px-2 py-0.5 text-xs ${tab === "plan" ? "bg-panel text-blue" : "bg-surface-3 text-muted"}`}>{plans.length}</span>
        </button>
      </div>
      {tab === "record" ? (
        <form
          id="record-monitoring-form"
          className="mt-4"
          role="tabpanel"
          aria-labelledby="monitoring-tab-record"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-ink">Vital signs</h3>
            <p className="text-xs text-muted">
              {last?.recorded_at ? `Compared with the last reading, ${formatWhen(last.recorded_at)}` : "First reading for this visit"}
            </p>
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <VitalInput
              label="Temperature"
              unit="°C"
              range="36.0 – 37.5"
              value={temperature}
              onChange={(value) => setTemperature(decimalInput(value))}
              placeholder="36.8"
              inputMode="decimal"
              check={checks.temp}
              last={last?.temperature_c ?? null}
              autoFocus
            />
            <VitalInput
              label="Heart rate"
              unit="bpm"
              range="60 – 100"
              value={pulse}
              onChange={(value) => setPulse(wholeInput(value))}
              placeholder="72"
              check={checks.pulse}
              last={last?.pulse ?? null}
            />
            <VitalInput
              label="Respiratory rate"
              unit="/min"
              range="12 – 20"
              value={respiratory}
              onChange={(value) => setRespiratory(wholeInput(value))}
              placeholder="16"
              check={checks.rr}
              last={last?.respiratory_rate ?? null}
            />
            <VitalInput
              label="Oxygen saturation"
              unit="%"
              range="95 – 100"
              value={spo2}
              onChange={(value) => setSpo2(wholeInput(value))}
              placeholder="98"
              check={checks.spo2}
              last={last?.spo2 ?? null}
            />
            <PressureInput
              className="sm:col-span-2"
              systolic={systolic}
              diastolic={diastolic}
              onSystolic={setSystolic}
              onDiastolic={setDiastolic}
              check={checks.bp}
              last={lastPressure}
            />
          </div>
          <AutomaticAssessment
            priority={entered ? priority : null}
            flagged={flagged.map(([key, check]) => ({ name: vitalNames[key], check }))}
          />
          <label className="mt-3 block rounded-2xl border border-line-strong bg-surface px-3 py-2.5 focus-within:ring-2 focus-within:ring-blue/20">
            <span className="flex min-h-6 items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-strong">Nursing notes</span>
              <span className="text-[11px] text-muted">Optional · {notes.length}/500</span>
            </span>
            <textarea
              className="mt-1 min-h-20 w-full resize-y bg-transparent text-sm text-ink outline-none placeholder:text-muted-soft"
              maxLength={500}
              value={notes}
              placeholder="How the patient looks, complaints, actions taken…"
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </form>
      ) : tab === "history" ? (
        <section
          className="mt-4"
          role="tabpanel"
          id="monitoring-panel-history"
          aria-labelledby="monitoring-tab-history"
        >
          {historyLoading && history.length === 0 ? <p className="py-6 text-center text-sm text-muted">Loading readings…</p> : null}
          {!historyLoading && history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center">
              <p className="text-sm font-semibold text-ink">No readings yet</p>
              <p className="mt-1 text-sm text-muted">Readings you save appear here, newest first.</p>
            </div>
          ) : null}
          {history.length > 0 ? <ReadingTimeline rows={history} /> : null}
        </section>
      ) : (
        <section
          className="mt-4"
          role="tabpanel"
          id="monitoring-panel-plan"
          aria-labelledby="monitoring-tab-plan"
        >
          <MonitoringPlansDetail plans={plans} catalog={catalog} />
        </section>
      )}
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  wide,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="triage-dialog-backdrop fixed inset-0 z-[60] grid place-items-stretch bg-shell/50 p-0 sm:place-items-center sm:px-4 sm:py-6"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className={`triage-dialog-panel flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-surface shadow-dialog sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl ${wide ? "sm:max-w-4xl" : "sm:max-w-xl"}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line-soft px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="pr-2 text-lg font-bold text-blue sm:text-xl">{title}</h2>
          <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">{children}</div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-line-soft bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap sm:justify-end sm:px-6 sm:py-4 sm:pb-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PatientHero({
  name,
  mrn,
  age,
  gender,
  nationality,
  room,
  clinicName,
  priority,
  casePriority,
  visitType,
}: {
  name: string;
  mrn: string;
  age: number | null;
  gender: string | null;
  nationality: string | null;
  room: string | null;
  clinicName: string;
  priority?: InvestigationPriority | "emergency" | "urgent" | "normal";
  casePriority?: CasePriority | null;
  visitType?: string;
}) {
  return (
    <div className="rounded-2xl border border-panel-strong bg-panel px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface text-sm font-bold text-blue">{initials(name)}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-blue">{name}</p>
          <p className="text-sm text-muted-strong">MRN: {mrn}</p>
          <p className="text-sm text-muted-strong">
            {[age != null ? `${age} years` : null, gender === "male" ? "Male" : gender === "female" ? "Female" : gender, nationality].filter(Boolean).join(" | ")}
          </p>
          <p className="text-xs text-muted">{[visitType, room || clinicName || null].filter(Boolean).join(" · ") || "—"}</p>
        </div>
      </div>
      {casePriority ? (
        <p className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${casePriorityClass(casePriority)}`}>
          Patient Priority: {casePriorityLabel(casePriority)}
        </p>
      ) : priority ? (
        <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${investigationPriorityClass(priority === "emergency" ? "emergency" : priority === "urgent" ? "urgent" : "normal")}`}>
          Lab Priority: {investigationPriorityLabel(priority === "emergency" ? "emergency" : priority === "urgent" ? "urgent" : "normal")}
        </p>
      ) : null}
    </div>
  );
}

function numberOrNull(value: string) {
  const parsed = Number(value.trim());
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

function readingPriority(reading: {
  temperature: number | null;
  pulse: number | null;
  respiratory: number | null;
  spo2: number | null;
  systolic: number | null;
  diastolic: number | null;
}): CasePriority {
  const emergency = (reading.temperature != null && (reading.temperature >= 39 || reading.temperature < 35))
    || (reading.pulse != null && (reading.pulse >= 130 || reading.pulse < 50))
    || (reading.respiratory != null && (reading.respiratory >= 30 || reading.respiratory < 10))
    || (reading.spo2 != null && reading.spo2 < 90)
    || (reading.systolic != null && (reading.systolic >= 180 || reading.systolic < 90))
    || (reading.diastolic != null && reading.diastolic >= 110);
  if (emergency) return "emergency";
  const urgent = (reading.temperature != null && reading.temperature >= 38)
    || (reading.pulse != null && reading.pulse >= 100)
    || (reading.respiratory != null && reading.respiratory >= 22)
    || (reading.spo2 != null && reading.spo2 < 94)
    || (reading.systolic != null && reading.systolic >= 140)
    || (reading.diastolic != null && reading.diastolic >= 90);
  if (urgent) return "urgent";
  return "stable";
}

function PatientPriorityBanner({ priority, compact = false }: { priority?: CasePriority | null; compact?: boolean }) {
  const tone = priority === "emergency"
    ? { card: "border-danger bg-danger-soft text-danger", chip: "bg-danger text-white" }
    : priority === "urgent"
      ? { card: "border-warning bg-warning-soft text-warning", chip: "bg-warning text-white" }
      : priority === "stable"
        ? { card: "border-success bg-success-soft text-success", chip: "bg-success text-white" }
        : { card: "border-line bg-surface-2 text-muted-strong", chip: "bg-surface-3 text-muted" };
  const hint = priority === "emergency"
    ? "Immediate action required"
    : priority === "urgent"
      ? "Needs prompt attention; monitor closely"
      : priority === "stable"
        ? "Condition is controlled; routine nursing care"
        : "No priority was saved on this encounter";
  const iconClass = compact ? "h-4 w-4" : "h-5 w-5";
  const icon = priority === "emergency"
    ? <PriorityEmergencyIcon className={iconClass} />
    : priority === "urgent"
      ? <PriorityUrgentIcon className={iconClass} />
      : priority === "stable"
        ? <PriorityStableIcon className={iconClass} />
        : <PriorityMissingIcon className={iconClass} />;
  if (compact) {
    return (
      <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${tone.card}`}>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tone.chip}`}>{icon}</span>
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-80">Patient priority</span>
          <span className="block truncate text-sm font-bold">{casePriorityLabel(priority)}</span>
        </span>
      </div>
    );
  }
  return (
    <div className={`flex items-start gap-3 rounded-2xl border-2 px-4 py-3.5 ${tone.card}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone.chip}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wide opacity-80">Patient priority</span>
        <span className="mt-0.5 block text-lg font-bold leading-6">{casePriorityLabel(priority)}</span>
        <span className="mt-1 block text-sm font-medium leading-5 opacity-90">{hint}</span>
      </span>
    </div>
  );
}

export function PriorityChip({ priority }: { priority?: CasePriority | null }) {
  if (!priority) {
    return <span className="inline-flex rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">No priority</span>;
  }
  const icon = priority === "emergency"
    ? <PriorityEmergencyIcon className="h-3.5 w-3.5" />
    : priority === "urgent"
      ? <PriorityUrgentIcon className="h-3.5 w-3.5" />
      : <PriorityStableIcon className="h-3.5 w-3.5" />;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${casePriorityClass(priority)}`} title="Patient priority">
      {icon}
      {casePriorityLabel(priority)}
    </span>
  );
}

function PriorityStableIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.5l2.2 2.2 4.8-5.2" />
    </svg>
  );
}

function PriorityUrgentIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5l9 16H3l9-16z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function PriorityEmergencyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M4.9 6.5l2.8 2.8" />
      <path d="M16.3 14.7l2.8 2.8" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  );
}

function PriorityMissingIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function PlanAssessmentStatus({ status }: { status: "stable" | "needs_review" | "deteriorating" }) {
  const label = status === "needs_review" ? "Needs Review" : status === "deteriorating" ? "Deteriorating" : "Stable";
  const tone = status === "needs_review"
    ? "border-warning bg-warning-soft text-warning"
    : status === "deteriorating"
      ? "border-danger bg-danger-soft text-danger"
      : "border-success bg-success-soft text-success";
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}

function PlanSection({ title, tone, children }: { title: string; tone: string; children: ReactNode }) {
  return (
    <section className={`rounded-xl border px-4 py-3 ${tone}`}>
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

type VitalKind = "temp" | "pulse" | "rr" | "spo2";
type VitalState = "empty" | "normal" | "abnormal" | "critical" | "invalid";
export type VitalCheck = { state: VitalState; label: string; message?: string };

const vitalLimits: Record<VitalKind, [number, number]> = { temp: [30, 45], pulse: [20, 250], rr: [4, 80], spo2: [50, 100] };

export function assessVital(kind: VitalKind, value: number | null): VitalCheck {
  if (value == null) return { state: "empty", label: "" };
  const [min, max] = vitalLimits[kind];
  if (value < min || value > max || (kind !== "temp" && !Number.isInteger(value))) {
    return { state: "invalid", label: "Check", message: `Enter a value between ${min} and ${max}.` };
  }
  if (kind === "temp") {
    if (value >= 39) return { state: "critical", label: "Critical high" };
    if (value < 35) return { state: "critical", label: "Critical low" };
    if (value >= 38) return { state: "abnormal", label: "High" };
  } else if (kind === "pulse") {
    if (value >= 130) return { state: "critical", label: "Critical high" };
    if (value < 50) return { state: "critical", label: "Critical low" };
    if (value >= 100) return { state: "abnormal", label: "High" };
  } else if (kind === "rr") {
    if (value >= 30) return { state: "critical", label: "Critical high" };
    if (value < 10) return { state: "critical", label: "Critical low" };
    if (value >= 22) return { state: "abnormal", label: "High" };
  } else {
    if (value < 90) return { state: "critical", label: "Critical low" };
    if (value < 94) return { state: "abnormal", label: "Low" };
  }
  return { state: "normal", label: "Normal" };
}

export function assessPressure(systolic: string, diastolic: string): VitalCheck {
  if (!systolic && !diastolic) return { state: "empty", label: "" };
  if (!systolic || !diastolic) return { state: "invalid", label: "Check", message: "Enter both numbers, for example 120/80." };
  const top = Number(systolic);
  const bottom = Number(diastolic);
  if (top < 50 || top > 300 || bottom < 20 || bottom > 200 || bottom >= top) {
    return { state: "invalid", label: "Check", message: "These numbers do not look like a blood pressure." };
  }
  if (top >= 180 || bottom >= 110) return { state: "critical", label: "Critical high" };
  if (top < 90) return { state: "critical", label: "Critical low" };
  if (top >= 140 || bottom >= 90) return { state: "abnormal", label: "High" };
  return { state: "normal", label: "Normal" };
}

export function parsePressure(value: string | null) {
  const match = value?.match(/(\d+)\s*\/\s*(\d+)/);
  return match ? { systolic: Number(match[1]), diastolic: Number(match[2]) } : null;
}

function decimalInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  if (rest.length === 0) return whole.slice(0, 2);
  return `${whole.slice(0, 2)}.${rest.join("").slice(0, 1)}`;
}

function wholeInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 3);
}

export function vitalTone(state: VitalState) {
  if (state === "critical") return { card: "border-danger bg-danger-soft/60", chip: "bg-danger text-white" };
  if (state === "abnormal") return { card: "border-warning bg-warning-soft/60", chip: "bg-warning text-white" };
  if (state === "invalid") return { card: "border-danger bg-surface", chip: "bg-danger-soft text-danger" };
  if (state === "normal") return { card: "border-success/50 bg-surface", chip: "bg-success-soft text-success" };
  return { card: "border-line-strong bg-surface", chip: "" };
}

export function trendText(current: number | null, previous: number | null, decimals = 0) {
  if (current == null || previous == null) return null;
  const diff = Number((current - previous).toFixed(decimals));
  if (diff === 0) return "no change";
  return `${diff > 0 ? "↑" : "↓"} ${Math.abs(diff).toFixed(decimals)}`;
}

export function AutomaticAssessment({
  priority,
  flagged,
  emptyText = "Enter vital signs to see the priority for this reading.",
}: {
  priority: CasePriority | null;
  flagged: { name: string; check: VitalCheck }[];
  emptyText?: string;
}) {
  const tone = priority === "emergency"
    ? { box: "border-danger bg-danger-soft text-danger", chip: "bg-danger text-white", icon: <PriorityEmergencyIcon className="h-5 w-5" />, hint: "Immediate action required." }
    : priority === "urgent"
      ? { box: "border-warning bg-warning-soft text-warning", chip: "bg-warning text-white", icon: <PriorityUrgentIcon className="h-5 w-5" />, hint: "Needs prompt attention; monitor closely." }
      : priority === "stable"
        ? { box: "border-success bg-success-soft text-success", chip: "bg-success text-white", icon: <PriorityStableIcon className="h-5 w-5" />, hint: "Vital signs are within range." }
        : { box: "border-line bg-surface-2 text-muted-strong", chip: "bg-surface-3 text-muted", icon: <PriorityMissingIcon className="h-5 w-5" />, hint: emptyText };
  return (
    <section className={`mt-3 flex flex-col gap-3 rounded-2xl border-2 px-4 py-3 sm:flex-row sm:items-center ${tone.box}`} role="status" aria-live="polite">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone.chip}`}>{tone.icon}</span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">Automatic assessment</p>
          <p className="text-base font-bold leading-6">{priority ? casePriorityLabel(priority) : "Waiting for vitals"}</p>
          <p className="text-xs font-medium opacity-90">{tone.hint}</p>
        </div>
      </div>
      {flagged.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 sm:max-w-[55%] sm:justify-end">
          {flagged.map(({ name, check }) => (
            <li key={name} className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${check.state === "critical" ? "bg-danger text-white" : "bg-surface text-warning ring-1 ring-warning"}`}>
              {name} · {check.label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function VitalShell({
  label,
  check,
  range,
  lastText,
  trend,
  lastLabel = "Last",
  className = "",
  children,
}: {
  label: string;
  check: VitalCheck;
  range: string;
  lastText: string | null;
  trend: string | null;
  lastLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const tone = vitalTone(check.state);
  return (
    <div className={`rounded-2xl border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-blue/20 ${tone.card} ${className}`}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-muted-strong" title={label}>{label}</span>
        {check.state !== "empty" ? <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${tone.chip}`}>{check.label}</span> : null}
      </div>
      {children}
      {check.message ? (
        <p className="mt-1 text-xs font-medium text-danger">{check.message}</p>
      ) : (
        <div className="mt-1.5 space-y-0.5 border-t border-line-soft pt-1.5 text-[11px] leading-4 text-muted">
          <p className="whitespace-nowrap">Normal {range}</p>
          {lastText ? (
            <p className="whitespace-nowrap">
              {lastLabel} {lastText}
              {trend ? <span className="ml-1 font-semibold text-muted-strong">{trend}</span> : null}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function VitalInput({
  label,
  unit,
  range,
  value,
  onChange,
  placeholder,
  inputMode = "numeric",
  check,
  last,
  autoFocus,
}: {
  label: string;
  unit: string;
  range: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "numeric" | "decimal";
  check: VitalCheck;
  last: number | null;
  autoFocus?: boolean;
}) {
  const decimals = inputMode === "decimal" ? 1 : 0;
  return (
    <VitalShell label={label} check={check} range={range} lastText={last == null ? null : `${last} ${unit}`} trend={trendText(numberOrNull(value), last, decimals)}>
      <label className="mt-1 flex items-baseline gap-1.5">
        <span className="sr-only">{label}</span>
        <input
          className="w-full min-w-0 bg-transparent text-2xl font-bold tracking-tight text-ink outline-none placeholder:font-semibold placeholder:text-muted-soft"
          inputMode={inputMode}
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={check.state === "invalid"}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="shrink-0 text-xs font-semibold text-muted-strong">{unit}</span>
      </label>
    </VitalShell>
  );
}

function PressureInput({
  className,
  systolic,
  diastolic,
  onSystolic,
  onDiastolic,
  check,
  last,
}: {
  className?: string;
  systolic: string;
  diastolic: string;
  onSystolic: (value: string) => void;
  onDiastolic: (value: string) => void;
  check: VitalCheck;
  last: { systolic: number; diastolic: number } | null;
}) {
  const systolicRef = useRef<HTMLInputElement>(null);
  const diastolicRef = useRef<HTMLInputElement>(null);
  const inputClass = "w-full min-w-0 bg-transparent text-2xl font-bold tracking-tight text-ink outline-none placeholder:font-semibold placeholder:text-muted-soft";
  return (
    <VitalShell
      className={className}
      label="Blood pressure"
      check={check}
      range="90/60 – 120/80"
      lastText={last ? `${last.systolic}/${last.diastolic}` : null}
      trend={trendText(numberOrNull(systolic), last?.systolic ?? null)}
    >
      <div className="mt-1 flex items-baseline gap-1">
        <input
          ref={systolicRef}
          className={`${inputClass} text-right`}
          inputMode="numeric"
          autoComplete="off"
          aria-label="Systolic"
          aria-invalid={check.state === "invalid"}
          value={systolic}
          placeholder="120"
          onChange={(event) => {
            const next = wholeInput(event.target.value);
            onSystolic(next);
            if (next.length === 3 || (next.length === 2 && !/^[12]/.test(next))) diastolicRef.current?.focus();
          }}
        />
        <span className="text-xl font-bold text-muted">/</span>
        <input
          ref={diastolicRef}
          className={inputClass}
          inputMode="numeric"
          autoComplete="off"
          aria-label="Diastolic"
          aria-invalid={check.state === "invalid"}
          value={diastolic}
          placeholder="80"
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !diastolic) systolicRef.current?.focus();
          }}
          onChange={(event) => onDiastolic(wholeInput(event.target.value))}
        />
        <span className="shrink-0 text-xs font-semibold text-muted-strong">mmHg</span>
      </div>
    </VitalShell>
  );
}

export function ReadingTimeline({ rows }: { rows: MonitoringObservation[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[42rem] text-sm">
        <thead className="bg-surface-2 text-left text-[11px] font-bold uppercase tracking-wide text-muted-strong">
          <tr>
            <th className="px-3 py-2.5">Recorded</th>
            <th className="px-3 py-2.5">Temp <span className="font-medium normal-case text-muted">°C</span></th>
            <th className="px-3 py-2.5">Heart rate <span className="font-medium normal-case text-muted">bpm</span></th>
            <th className="px-3 py-2.5">BP <span className="font-medium normal-case text-muted">mmHg</span></th>
            <th className="px-3 py-2.5">RR <span className="font-medium normal-case text-muted">/min</span></th>
            <th className="px-3 py-2.5">SpO2 <span className="font-medium normal-case text-muted">%</span></th>
            <th className="px-3 py-2.5">Priority</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const previous = rows[index + 1] ?? null;
            const pressure = parsePressure(row.blood_pressure);
            const previousPressure = parsePressure(previous?.blood_pressure ?? null);
            const notes = row.notes.trim();
            const clinical = row.clinical_assessment?.trim() ?? "";
            const doctorNoteNew = Boolean(row.doctor_noted_at) && !row.nurse_viewed_at && (Boolean(row.doctor_assessment) || Boolean(clinical));
            const rowTone = doctorNoteNew ? "bg-warning-soft" : index === 0 ? "bg-panel/40" : "";
            return (
              <Fragment key={row.id}>
                <tr className={`border-t border-line-soft align-top ${rowTone}`}>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                      {row.recorded_at ? formatWhen(row.recorded_at) : "—"}
                      {index === 0 ? <span className="rounded-full bg-blue px-2 py-0.5 text-[10px] font-semibold text-white">Latest</span> : null}
                      {doctorNoteNew ? <span className="rounded-full bg-warning px-2 py-0.5 text-[10px] font-semibold text-white">New doctor note</span> : null}
                    </span>
                    <span className="block text-xs text-muted">{row.recorded_by_name?.trim() || "Nurse"}</span>
                  </td>
                  <TimelineCell value={row.temperature_c} check={assessVital("temp", row.temperature_c)} trend={trendText(row.temperature_c, previous?.temperature_c ?? null, 1)} />
                  <TimelineCell value={row.pulse} check={assessVital("pulse", row.pulse)} trend={trendText(row.pulse, previous?.pulse ?? null)} />
                  <TimelineCell
                    value={pressure ? `${pressure.systolic}/${pressure.diastolic}` : null}
                    check={pressure ? assessPressure(String(pressure.systolic), String(pressure.diastolic)) : { state: "empty", label: "" }}
                    trend={trendText(pressure?.systolic ?? null, previousPressure?.systolic ?? null)}
                  />
                  <TimelineCell value={row.respiratory_rate} check={assessVital("rr", row.respiratory_rate)} trend={trendText(row.respiratory_rate, previous?.respiratory_rate ?? null)} />
                  <TimelineCell value={row.spo2} check={assessVital("spo2", row.spo2)} trend={trendText(row.spo2, previous?.spo2 ?? null)} />
                  <td className="px-3 py-2.5">
                    {row.case_priority ? <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${casePriorityClass(row.case_priority)}`}>{casePriorityLabel(row.case_priority)}</span> : <span className="text-muted">—</span>}
                  </td>
                </tr>
                {notes || row.doctor_assessment || clinical ? (
                  <tr className={rowTone}>
                    <td colSpan={7} className="px-3 pb-2.5">
                      {notes ? <p className="whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-ink"><span className="font-semibold text-muted-strong">Note: </span>{notes}</p> : null}
                      <DoctorReadingAssessment status={row.doctor_assessment} clinical={clinical} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TimelineCell({ value, check, trend }: { value: number | string | null; check: VitalCheck; trend: string | null }) {
  const tone = check.state === "critical"
    ? "bg-danger-soft text-danger"
    : check.state === "abnormal"
      ? "bg-warning-soft text-warning"
      : "text-ink";
  return (
    <td className="px-3 py-2.5">
      {value == null ? (
        <span className="text-muted">—</span>
      ) : (
        <>
          <span className={`inline-flex rounded-md px-1.5 py-0.5 font-bold tabular-nums ${tone}`} title={check.state === "abnormal" || check.state === "critical" ? check.label : undefined}>{value}</span>
          {trend && trend !== "no change" ? <span className="ml-1 text-[11px] font-semibold text-muted">{trend}</span> : null}
        </>
      )}
    </td>
  );
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
    </svg>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
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

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function clockLabel(ms: number) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function CareIcon() {
  return <Icon><path d="M12 21s-6.5-4.1-6.5-9A3.5 3.5 0 0 1 12 8.2 3.5 3.5 0 0 1 18.5 12c0 4.9-6.5 9-6.5 9z" /></Icon>;
}
function SampleIcon() {
  return <Icon><path d="M9 3h6" /><path d="M10 3v6l-4 8a3 3 0 0 0 2.6 4.5h6.8A3 3 0 0 0 18 17l-4-8V3" /><path d="M9 14h6" /></Icon>;
}
function MonitorIcon() {
  return <Icon><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 11h2l1.5-3 2 6 1.5-3H17" /></Icon>;
}
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
