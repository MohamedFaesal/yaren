import {
  casePriorityClass,
  casePriorityLabel,
  investigationPriorityClass,
  investigationPriorityLabel,
  investigationStatusClass,
  investigationStatusLabel,
  monitoringStatusClass,
  monitoringStatusLabel,
  type ClinicalEncounter,
  type EncounterFile,
  type EncounterInvestigation,
  type ManagementPlanRecord,
  type VisitCareEncounter,
  type VisitCareMonitoring,
  type VisitTriage,
} from "../api";
import { ImplementedPlanCard, ReadingTimeline } from "./NurseDashboardPanels";
import { Card, Detail, Section, formatWhen } from "./ui";

export function TriageDetailsPanel({ triage }: { triage: VisitTriage | null }) {
  if (!triage) {
    return (
      <Card>
        <p className="text-sm text-muted">No triage has been recorded for this visit yet.</p>
      </Card>
    );
  }
  const allergies = triage.allergies ?? [];
  const medications = triage.medications ?? [];
  const historyItems = triage.relevant_history_items?.map((item) => item.name).filter(Boolean) ?? triage.relevant_history ?? [];
  return (
    <Card>
      <Section index="1" title="Triage summary" />
      <Detail items={[
        { label: "Category", value: triageCategoryLabel(triage.triage_category) },
        { label: "Chief complaint", value: triage.chief_complaint?.trim() || "—" },
        { label: "Initial assessment", value: triage.initial_assessment?.trim() || "—" },
        { label: "Assigned doctor", value: triage.assigned_doctor_name || "—" },
        { label: "Started", value: triage.started_at ? `${formatWhen(triage.started_at)}${triage.started_by_name ? ` · ${triage.started_by_name}` : ""}` : "—" },
        { label: "Completed", value: triage.completed_at ? `${formatWhen(triage.completed_at)}${triage.completed_by_name ? ` · ${triage.completed_by_name}` : ""}` : "—" },
      ]} />
      <div className="mt-6"><Section index="2" title="Vitals" /></div>
      <Detail items={[
        { label: "Temperature", value: triage.temperature_c == null ? "—" : `${triage.temperature_c} °C` },
        { label: "Pulse", value: triage.pulse == null ? "—" : `${triage.pulse} /min` },
        { label: "Respiratory rate", value: triage.respiratory_rate == null ? "—" : `${triage.respiratory_rate} /min` },
        { label: "Blood pressure", value: triage.blood_pressure ? `${triage.blood_pressure} mmHg` : "—" },
        { label: "SpO2", value: triage.spo2 == null ? "—" : `${triage.spo2}%` },
      ]} />
      <div className="mt-6"><Section index="3" title="History" /></div>
      <Detail items={[
        { label: "Allergies", value: allergies.length ? allergies.map((item) => item.reaction ? `${item.name} (${item.reaction})` : item.name).join(", ") : "None recorded" },
        { label: "Medications", value: medications.length ? medications.map((item) => item.name).join(", ") : "None recorded" },
        { label: "Relevant history", value: historyItems.length ? historyItems.join(", ") : "None recorded" },
        { label: "Other history", value: triage.relevant_history_other?.trim() || "—" },
      ]} />
    </Card>
  );
}

export function EncounterDetailsPanel({ record }: { record: VisitCareEncounter }) {
  const encounter = record.encounter;
  return (
    <Card>
      <Section index="1" title="Clinical encounter" />
      <Detail items={[
        { label: "Status", value: record.finished ? "Finished" : "In progress" },
        { label: "Chief complaint", value: encounter.chief_complaint.trim() || "—" },
        { label: "History of present illness", value: encounter.history_of_present_illness.trim() || "—" },
        { label: "Past history", value: encounter.past_history.trim() || "—" },
        { label: "Medication / allergy history", value: encounter.medication_allergy_history.trim() || "—" },
        { label: "Case priority", value: encounter.case_priority ? (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${casePriorityClass(encounter.case_priority)}`}>
            {casePriorityLabel(encounter.case_priority)}
          </span>
        ) : "—" },
      ]} />
      <div className="mt-6"><Section index="2" title="Encounter vitals" /></div>
      <Detail items={[
        { label: "Temperature", value: encounter.temperature_c == null ? "—" : `${encounter.temperature_c} °C` },
        { label: "Pulse", value: encounter.pulse == null ? "—" : `${encounter.pulse} /min` },
        { label: "Respiratory rate", value: encounter.respiratory_rate == null ? "—" : `${encounter.respiratory_rate} /min` },
        { label: "Blood pressure", value: encounter.blood_pressure.trim() ? `${encounter.blood_pressure} mmHg` : "—" },
        { label: "SpO2", value: encounter.spo2 == null ? "—" : `${encounter.spo2}%` },
        { label: "Pain score", value: encounter.pain_score == null ? "—" : String(encounter.pain_score) },
        { label: "Recorded", value: encounter.vitals_recorded_at ? formatWhen(encounter.vitals_recorded_at) : "—" },
      ]} />
      <div className="mt-6"><Section index="3" title="Examination" /></div>
      <Detail items={[
        { label: "General appearance", value: encounter.examination.general_appearance || "—" },
        { label: "Consciousness", value: encounter.examination.consciousness || "—" },
        { label: "Nutrition", value: encounter.examination.nutrition || "—" },
        { label: "Hydration", value: encounter.examination.hydration || "—" },
        { label: "Findings", value: encounter.examination.findings.trim() || "—" },
      ]} />
      <div className="mt-6"><Section index="4" title="Diagnoses" /></div>
      {encounter.provisional_diagnoses.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {encounter.provisional_diagnoses.map((item) => (
            <li key={item.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink">
              <span className="font-semibold">{item.code || "Free text"}</span>
              <span className="mt-0.5 block text-muted-strong">{item.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{encounter.provisional_diagnosis.trim() || "No diagnoses recorded."}</p>
      )}
      <div className="mt-6"><Section index="5" title="Management plan" /></div>
      <EncounterOrders encounter={encounter} />
      <EncounterFiles files={record.files} />
    </Card>
  );
}

export function MonitoringDetailsPanel({ monitoring }: { monitoring: VisitCareMonitoring }) {
  return (
    <Card>
      <Section index="1" title="Monitoring" />
      <Detail items={[
        {
          label: "Status",
          value: (
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${monitoringStatusClass(monitoring.monitoring_status)}`}>
              {monitoringStatusLabel(monitoring.monitoring_status)}
            </span>
          ),
        },
        { label: "Started", value: monitoring.monitoring_started_at ? formatWhen(monitoring.monitoring_started_at) : "—" },
        { label: "Completed", value: monitoring.monitoring_completed_at ? formatWhen(monitoring.monitoring_completed_at) : "—" },
        { label: "Readings", value: String(monitoring.observations.length) },
      ]} />
      {monitoring.plans.length > 0 ? (
        <div className="mt-6 space-y-3">
          <Section index="2" title="Management plans" />
          {monitoring.plans.map((plan) => (
            <ImplementedPlanCard key={`${plan.position}:${plan.id ?? "encounter"}`} plan={plan} />
          ))}
        </div>
      ) : null}
      <div className="mt-6"><Section index={monitoring.plans.length > 0 ? "3" : "2"} title="Observation readings" /></div>
      {monitoring.observations.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No readings recorded yet.</p>
      ) : (
        <div className="mt-3">
          <ReadingTimeline rows={monitoring.observations} />
        </div>
      )}
    </Card>
  );
}

export function InvestigationDetailsPanel({ items }: { items: EncounterInvestigation[] }) {
  return (
    <Card>
      <Section index="1" title="Investigations" />
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No investigations ordered for this visit.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 ${investigationPriorityClass(item.priority)}`}>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{item.name}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${investigationPriorityClass(item.priority)}`}>
                    {investigationPriorityLabel(item.priority)}
                  </span>
                  {item.status ? (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${investigationStatusClass(item.status)}`}>
                      {investigationStatusLabel(item.status)}
                    </span>
                  ) : null}
                  {item.ordered_at ? <span className="text-xs text-muted-strong">Ordered {formatWhen(item.ordered_at)}</span> : null}
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
      )}
    </Card>
  );
}

function EncounterOrders({ encounter }: { encounter: ClinicalEncounter }) {
  const procedures = encounter.procedure_orders.filter((item) => !item.linked_medication_order_id);
  const plans: ManagementPlanRecord[] = [{
    id: null,
    position: 1,
    status: "none",
    medication_orders: encounter.medication_orders,
    procedure_orders: encounter.procedure_orders,
    patient_advices: encounter.patient_advices,
    management_plan: encounter.management_plan,
    clinical_assessment: "",
    assessment_status: null,
    created_at: null,
  }];
  const hasOrders = encounter.medication_orders.length > 0
    || procedures.length > 0
    || encounter.patient_advices.length > 0
    || encounter.management_plan.trim().length > 0;
  if (!hasOrders) return <p className="mt-2 text-sm text-muted">No management plan recorded.</p>;
  return (
    <div className="mt-3 space-y-3">
      {plans.map((plan) => <ImplementedPlanCard key={plan.position} plan={plan} />)}
    </div>
  );
}

function EncounterFiles({ files }: { files: EncounterFile[] }) {
  if (files.length === 0) return null;
  return (
    <div className="mt-6">
      <Section index="6" title="Attached files" />
      <ul className="mt-2 space-y-2">
        {files.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-semibold text-ink">{file.original_name}</span>
              <span className="mt-0.5 block text-xs text-muted">{formatWhen(file.created_at)}</span>
            </span>
            {file.file_url ? (
              <a className="font-semibold text-blue hover:underline" href={file.file_url} target="_blank" rel="noreferrer">View</a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function triageCategoryLabel(value: VisitTriage["triage_category"]) {
  if (value === "emergency") return "Emergency";
  if (value === "urgent") return "Urgent";
  if (value === "normal") return "Normal";
  return "—";
}
