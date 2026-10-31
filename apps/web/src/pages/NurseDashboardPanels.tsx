import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  api,
  investigationPriorityClass,
  investigationPriorityLabel,
  investigationStatusClass,
  investigationStatusLabel,
  monitoringStatusClass,
  monitoringStatusLabel,
  nursingPlanStatusClass,
  nursingPlanStatusLabel,
  visitTypeLabel,
  type EncounterInvestigation,
  type InvestigationPriority,
  type MonitoringItem,
  type MonitoringOrderedService,
  type NurseDashboardSummary,
  type NursingCareItem,
  type NursingPlanDetail,
  type SampleCollectionItem,
} from "../api";
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
    { label: "To See Doctor", value: summary.to_doctor, tone: "border-success/20 bg-success-soft text-success" },
    { label: "Under Nursing Care", value: summary.under_nursing_care, tone: "border-panel-strong bg-panel-strong text-blue-strong" },
    { label: "Samples to Collect", value: summary.samples_to_collect, tone: "border-warning-line bg-warning-soft text-warning" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {tiles.map((tile) => (
        <article key={tile.label} className={`rounded-2xl border px-4 py-4 shadow-card ${tile.tone}`}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{tile.label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{loading ? "—" : tile.value}</p>
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
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-panel text-blue"><CareIcon /></span>
        <div>
          <h2 className="text-sm font-semibold text-ink">Nursing Tasks & Ongoing Care</h2>
          <p className="text-xs text-muted">{loading ? "Loading" : `${items.length} patient${items.length === 1 ? "" : "s"}`}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-muted">{loading ? "Loading nursing tasks…" : "No patients under nursing care."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-2 py-2">Patient</th>
                <th className="px-2 py-2">Order Time</th>
                <th className="px-2 py-2">Elapsed</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const elapsed = item.order_time ? Math.max(0, now - new Date(item.order_time).getTime()) : 0;
                return (
                  <tr key={item.visit_id} className="border-b border-line-soft last:border-0">
                    <td className="px-2 py-3">
                      <p className="font-semibold text-ink">{item.patient_name}</p>
                      <p className="text-xs text-muted">{item.patient_mrn}</p>
                    </td>
                    <td className="px-2 py-3 text-muted">{item.order_time ? formatClock(item.order_time) : "—"}</td>
                    <td className="px-2 py-3 font-mono text-sm tabular-nums text-ink">{clockLabel(elapsed)}</td>
                    <td className="px-2 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${nursingPlanStatusClass(item.nursing_plan_status)}`}>
                        {nursingPlanStatusLabel(item.nursing_plan_status)}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        className={`${secondary} h-8 px-3 text-xs`}
                        disabled={busyId === item.visit_id}
                        onClick={() => onViewPlan(item)}
                      >
                        View management plan
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
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
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-warning-soft text-warning"><SampleIcon /></span>
        <div>
          <h2 className="text-sm font-semibold text-ink">Sample Collection</h2>
          <p className="text-xs text-muted">{loading ? "Loading" : `${items.length} patient${items.length === 1 ? "" : "s"}`}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-muted">{loading ? "Loading samples…" : "No samples waiting."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-2 py-2">Patient</th>
                <th className="px-2 py-2">Priority</th>
                <th className="px-2 py-2">Tests</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.visit_id} className="border-b border-line-soft last:border-0">
                  <td className="px-2 py-3">
                    <p className="font-semibold text-ink">{item.patient_name}</p>
                    <p className="text-xs text-muted">{item.patient_mrn} · Room {item.hotel_room_no || "—"}</p>
                  </td>
                  <td className="px-2 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${investigationPriorityClass(item.highest_priority)}`}>
                      {investigationPriorityLabel(item.highest_priority)}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <button type="button" className={`${secondary} h-8 px-3 text-xs`} onClick={() => onViewTests(item)}>
                      View tests ordered
                    </button>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-2">
                      {item.collectable_count > 0 ? (
                        <button
                          type="button"
                          className={`${secondary} h-8 px-3 text-xs`}
                          disabled={busyId === `${item.visit_id}:collect` || busyId === `${item.visit_id}:send`}
                          onClick={() => onCollect(item)}
                        >
                          {busyId === `${item.visit_id}:collect` ? "Collecting…" : "Mark as Collected"}
                        </button>
                      ) : null}
                      {item.sendable_count > 0 ? (
                        <button
                          type="button"
                          className={`${primary} h-8 px-3 text-xs`}
                          disabled={busyId === `${item.visit_id}:collect` || busyId === `${item.visit_id}:send`}
                          onClick={() => onSend(item)}
                        >
                          {busyId === `${item.visit_id}:send` ? "Sending…" : "Send to Lab"}
                        </button>
                      ) : null}
                      {item.collectable_count === 0 && item.sendable_count === 0 ? (
                        <span className="text-xs text-muted">—</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function MonitoringPanel({
  items,
  loading,
  onRecord,
}: {
  items: MonitoringItem[];
  loading?: boolean;
  onRecord: (item: MonitoringItem) => void;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-panel text-blue"><MonitorIcon /></span>
        <div>
          <h2 className="text-sm font-semibold text-ink">Monitoring / Observations</h2>
          <p className="text-xs text-muted">{loading ? "Loading" : `${items.length} patient${items.length === 1 ? "" : "s"}`}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-muted">{loading ? "Loading monitoring…" : "No patients in monitoring."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-2 py-2">Patient</th>
                <th className="px-2 py-2">Ordered services</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.visit_id} className="border-b border-line-soft last:border-0 align-top">
                  <td className="px-2 py-3">
                    <p className="font-semibold text-ink">{item.patient_name}</p>
                    <p className="text-xs text-muted">{item.patient_mrn}</p>
                  </td>
                  <td className="px-2 py-3">
                    <OrderedServicesList services={item.ordered_services} />
                  </td>
                  <td className="px-2 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${monitoringStatusClass(item.monitoring_status)}`}>
                      {monitoringStatusLabel(item.monitoring_status)}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    {item.monitoring_status === "in_progress" ? (
                      <button type="button" className={`${primary} h-8 px-3 text-xs`} onClick={() => onRecord(item)}>
                        Record
                      </button>
                    ) : (
                      <span className="text-xs text-muted">Done</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function TestsOrderedModal({
  token,
  item,
  busyId,
  onClose,
  onCollect,
  onSend,
}: {
  token: string;
  item: SampleCollectionItem;
  busyId: string | null;
  onClose: () => void;
  onCollect: (item: SampleCollectionItem) => void;
  onSend: (item: SampleCollectionItem) => void;
}) {
  const [items, setItems] = useState<EncounterInvestigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const collectBusy = busyId === `${item.visit_id}:collect`;
  const sendBusy = busyId === `${item.visit_id}:send`;

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

  return (
    <ModalShell
      title="Tests Ordered"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className={`${secondary} w-full sm:w-auto`} disabled={collectBusy || sendBusy} onClick={onClose}>
            Close
          </button>
          {item.collectable_count > 0 ? (
            <button
              type="button"
              className={`${secondary} w-full sm:w-auto`}
              disabled={collectBusy || sendBusy}
              onClick={() => onCollect(item)}
            >
              {collectBusy ? "Collecting…" : "Mark as Collected"}
            </button>
          ) : null}
          {item.sendable_count > 0 ? (
            <button
              type="button"
              className={`${primary} w-full sm:w-auto`}
              disabled={collectBusy || sendBusy}
              onClick={() => onSend(item)}
            >
              {sendBusy ? "Sending…" : "Send to Lab"}
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
        priority={item.highest_priority}
      />
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="bg-panel text-[11px] font-semibold uppercase tracking-wide text-blue">
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Test Name</th>
              <th className="px-3 py-2.5">Priority</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Ordered Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">Loading tests…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">No investigations ordered.</td></tr>
            ) : items.map((row, index) => (
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
              </tr>
            ))}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<NursingPlanDetail>(`/api/patients/${item.patient_id}/visits/${item.visit_id}/nursing-plan`, {}, token)
      .then((data) => {
        if (!cancelled) setDetail(data);
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
    setPending(true);
    try {
      await api(`/api/patients/${item.patient_id}/visits/${item.visit_id}/nursing-plan/start`, { method: "POST" }, token);
      toast.success("Management plan started", `${item.patient_name} is now in progress.`);
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

  const priority = detail?.visit.triage_category === "emergency" || detail?.visit.triage_category === "urgent"
    ? detail.visit.triage_category
    : "normal";

  const canStart = detail?.visit.nursing_plan_status === "ordered" || detail?.visit.nursing_plan_status === "in_progress";
  const canMonitor = detail != null && detail.visit.monitoring_status !== "completed";

  return (
    <ModalShell
      title="Management Plan"
      onClose={onClose}
      wide
      footer={detail ? (
        <>
          <button type="button" className={`${secondary} w-full sm:w-auto`} disabled={pending} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className={`${secondary} w-full sm:w-auto`}
            disabled={pending || !canMonitor || detail.visit.monitoring_status === "in_progress"}
            onClick={() => void sendMonitoring()}
          >
            {detail.visit.monitoring_status === "in_progress" ? "Already in Monitoring" : "Send to Monitoring"}
          </button>
          <button
            type="button"
            className={`${primary} w-full sm:w-auto`}
            disabled={pending || !canStart || detail.visit.nursing_plan_status !== "ordered"}
            onClick={() => void startPlan()}
          >
            {pending
              ? "Saving…"
              : detail.visit.nursing_plan_status === "in_progress"
                ? "Plan In Progress"
                : detail.visit.nursing_plan_status === "completed"
                  ? "Plan Completed"
                  : "Start Management Plan"}
          </button>
        </>
      ) : (
        <button type="button" className={`${secondary} w-full sm:w-auto`} onClick={onClose}>Close</button>
      )}
    >
      {loading ? <p className="text-sm text-muted">Loading plan…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {detail ? (
        <>
          <PatientHero
            name={detail.visit.patient_name}
            mrn={detail.visit.patient_mrn}
            age={detail.visit.patient_age_at_visit}
            gender={detail.visit.patient_gender}
            nationality={detail.visit.patient_nationality}
            room={detail.visit.hotel_room_no}
            clinicName={detail.visit.clinic_name}
            visitType={visitTypeLabel(detail.visit.visit_type)}
          />
          <div className="mt-4 space-y-3">
            <PlanSection title="Diagnosis" tone="bg-panel border-panel-strong text-blue">
              {detail.plan.provisional_diagnoses.length === 0 ? (
                <p className="text-sm text-muted">No diagnoses recorded.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                  {detail.plan.provisional_diagnoses.map((row) => (
                    <li key={row.code}><span className="font-mono text-xs text-blue">{row.code}</span> {row.title}</li>
                  ))}
                </ul>
              )}
            </PlanSection>
            <PlanSection title="Priority" tone="bg-danger-soft border-danger-line text-danger">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${investigationPriorityClass(priority === "emergency" ? "emergency" : priority === "urgent" ? "urgent" : "normal")}`}>
                {priority === "emergency" ? "Emergency" : priority === "urgent" ? "Urgent" : "Normal"}
              </span>
            </PlanSection>
            <PlanSection title="Medication Orders" tone="bg-warning-soft border-warning-line text-warning">
              {detail.plan.medication_orders.length === 0 ? (
                <p className="text-sm text-muted">No medications ordered.</p>
              ) : (
                <ul className="space-y-2 text-sm text-ink">
                  {detail.plan.medication_orders.map((order) => (
                    <li key={order.id}>
                      <p className="font-semibold">{order.medication}{order.strength ? ` ${order.strength}` : ""}{order.dosage_form ? ` ${order.dosage_form}` : ""}</p>
                      <p className="text-xs text-muted-strong">
                        {[order.dose, order.route, order.frequency, order.duration].filter(Boolean).join(" · ") || "As prescribed"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </PlanSection>
            <PlanSection title="Procedures & Interventions" tone="bg-success-soft border-success/20 text-success">
              {detail.plan.procedure_orders.length === 0 ? (
                <p className="text-sm text-muted">No procedures ordered.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                  {detail.plan.procedure_orders.map((order) => (
                    <li key={order.id}>{order.name}{order.notes ? ` — ${order.notes}` : ""}</li>
                  ))}
                </ul>
              )}
            </PlanSection>
            <PlanSection title="Advices" tone="bg-panel-strong border-panel-strong text-blue-strong">
              {detail.plan.patient_advices.length === 0 && !detail.plan.management_plan.trim() ? (
                <p className="text-sm text-muted">No advice recorded.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                  {detail.plan.patient_advices.map((advice) => <li key={advice.id}>{advice.text}</li>)}
                  {detail.plan.management_plan.trim() ? <li>{detail.plan.management_plan}</li> : null}
                </ul>
              )}
            </PlanSection>
          </div>
        </>
      ) : null}
    </ModalShell>
  );
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
  const [temperature, setTemperature] = useState("36.8");
  const [pulse, setPulse] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [respiratory, setRespiratory] = useState("");
  const [spo2, setSpo2] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
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
      toast.success("Sent to the doctor", `Monitoring recorded for ${item.patient_name}.`);
      onSaved();
      onClose();
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
          <button type="button" className={`${secondary} w-full sm:w-auto`} disabled={pending} onClick={onClose}>
            Close
          </button>
          <button type="submit" form="record-monitoring-form" className={`${primary} w-full sm:w-auto`} disabled={pending}>
            {pending ? "Saving…" : "Save and Send to the Doctor"}
          </button>
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
      />
      <div className="mt-4 rounded-xl border border-panel-strong bg-panel px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue">Ordered from management plan</p>
        <div className="mt-2">
          <OrderedServicesList services={item.ordered_services} empty="No management plan services ordered for monitoring." />
        </div>
      </div>
      <form id="record-monitoring-form" className="mt-4 space-y-4" onSubmit={(event) => void submit(event)}>
        <VitalRow label="Temperature" unit="°C" range="(36.0 – 37.5)" value={temperature} onChange={setTemperature} />
        <VitalRow label="Heart Rate" unit="bpm" range="(60 – 100)" value={pulse} onChange={setPulse} />
        <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
          <p className="text-sm font-semibold text-ink">Blood Pressure</p>
          <div className="flex items-center gap-2">
            <input className={field} value={systolic} onChange={(event) => setSystolic(event.target.value)} placeholder="120" />
            <span className="text-muted">/</span>
            <input className={field} value={diastolic} onChange={(event) => setDiastolic(event.target.value)} placeholder="80" />
            <span className="text-xs text-muted">mmHg</span>
          </div>
          <p className="text-xs text-muted sm:text-right">(90/60 – 120/80)</p>
        </div>
        <VitalRow label="Respiratory Rate" unit="/min" range="(12 – 20)" value={respiratory} onChange={setRespiratory} />
        <VitalRow label="Oxygen Saturation" unit="%" range="(≥ 95)" value={spo2} onChange={setSpo2} />
        <div>
          <label className="text-sm font-semibold text-ink">Notes</label>
          <textarea
            className={`${field} mt-1.5 min-h-28`}
            maxLength={500}
            value={notes}
            placeholder="Enter nursing notes..."
            onChange={(event) => setNotes(event.target.value)}
          />
          <p className="mt-1 text-right text-xs text-muted">{notes.length}/500</p>
        </div>
      </form>
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
    <div className="triage-dialog-backdrop fixed inset-0 z-[60] grid place-items-center bg-shell/50 px-4 py-6" role="presentation" onMouseDown={onClose}>
      <div
        className={`triage-dialog-panel flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-dialog ${wide ? "max-w-3xl" : "max-w-xl"}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
          <h2 className="text-xl font-bold text-blue">{title}</h2>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-line-soft bg-surface px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
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
          <p className="text-xs text-muted">{[visitType, `Room: ${room || clinicName || "—"}`].filter(Boolean).join(" | ")}</p>
        </div>
      </div>
      {priority ? (
        <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${investigationPriorityClass(priority === "emergency" ? "emergency" : priority === "urgent" ? "urgent" : "normal")}`}>
          Patient Priority: {investigationPriorityLabel(priority === "emergency" ? "emergency" : priority === "urgent" ? "urgent" : "normal")}
        </p>
      ) : null}
    </div>
  );
}

function PlanSection({ title, tone, children }: { title: string; tone: string; children: ReactNode }) {
  return (
    <section className={`rounded-xl border px-4 py-3 ${tone}`}>
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function OrderedServicesList({
  services,
  empty = "No services ordered in the management plan.",
}: {
  services: MonitoringOrderedService[];
  empty?: string;
}) {
  if (!services.length) {
    return <p className="text-xs text-muted">{empty}</p>;
  }
  return (
    <ul className="space-y-2">
      {services.map((service) => (
        <li key={service.id} className="min-w-[10rem]">
          <p className="font-semibold text-ink">{service.name}</p>
          {service.code ? <p className="text-[11px] font-mono text-blue">{service.code}</p> : null}
          {service.detail ? <p className="text-xs text-muted-strong">{service.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function VitalRow({
  label,
  unit,
  range,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  range: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <div className="flex items-center gap-2">
        <input className={field} value={value} onChange={(event) => onChange(event.target.value)} />
        <span className="text-xs text-muted">{unit}</span>
      </div>
      <p className="text-xs text-muted sm:text-right">{range}</p>
    </div>
  );
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
