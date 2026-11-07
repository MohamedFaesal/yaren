import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
  type EncounterInvestigation,
  type InvestigationPriority,
  type MonitoringItem,
  type MonitoringObservation,
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
  return (
    <section className="rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-panel text-blue"><CareIcon /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Nursing Tasks & Ongoing Care</h2>
          <p className="text-xs text-muted">{loading ? "Loading" : `${items.length} patient${items.length === 1 ? "" : "s"}`}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-muted">{loading ? "Loading nursing tasks…" : "No patients under nursing care."}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const elapsed = item.order_time ? Math.max(0, now - new Date(item.order_time).getTime()) : 0;
            return (
              <article key={item.visit_id} className="rounded-xl border border-line-soft bg-surface-2/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{item.patient_name}</p>
                    <p className="text-xs text-muted">{item.patient_mrn}</p>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${nursingPlanStatusClass(item.nursing_plan_status)}`}>
                    {nursingPlanStatusLabel(item.nursing_plan_status)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-strong">
                  <span>Ordered {item.order_time ? formatClock(item.order_time) : "—"}</span>
                  <span className="font-mono tabular-nums text-ink">{clockLabel(elapsed)}</span>
                </div>
                <button
                  type="button"
                  className={`${secondary} mt-3 h-9 w-full px-3 text-xs sm:w-auto`}
                  disabled={busyId === item.visit_id}
                  onClick={() => onViewPlan(item)}
                >
                  View management plan
                </button>
              </article>
            );
          })}
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
  busyId,
  onRecord,
  onComplete,
}: {
  items: MonitoringItem[];
  loading?: boolean;
  busyId?: string | null;
  onRecord: (item: MonitoringItem) => void;
  onComplete: (item: MonitoringItem) => void;
}) {
  const [viewing, setViewing] = useState<MonitoringItem | null>(null);
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
          {items.map((item) => {
            const serviceCount = item.ordered_services.length;
            const completing = busyId === `${item.visit_id}:complete`;
            return (
              <article key={item.visit_id} className="rounded-xl border border-line-soft bg-surface-2/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{item.patient_name}</p>
                    <p className="truncate text-xs text-muted">
                      {item.patient_mrn}
                      {serviceCount > 0 ? ` · ${serviceCount} service${serviceCount === 1 ? "" : "s"}` : " · No services"}
                    </p>
                  </div>
                  <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${monitoringStatusClass(item.monitoring_status)}`}>
                    {monitoringStatusLabel(item.monitoring_status)}
                  </span>
                </div>
                <div className="mt-2">
                  <PatientPriorityBanner priority={item.case_priority} compact />
                </div>
                {item.monitoring_status === "in_progress" ? (
                  <div className="mt-2.5 grid gap-2">
                    <button type="button" className={`${secondary} h-9 w-full px-3 text-xs`} onClick={() => setViewing(item)}>
                      {recordLabel(item.observations?.length ?? 0)}
                    </button>
                    <button type="button" className={`${primary} h-9 w-full px-3 text-xs`} disabled={completing} onClick={() => onRecord(item)}>
                      Record
                    </button>
                    <button
                      type="button"
                      className={`${secondary} h-9 w-full px-3 text-xs`}
                      disabled={completing}
                      onClick={() => onComplete(item)}
                    >
                      {completing ? "Completing…" : "Complete"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2.5 grid gap-2">
                    <button type="button" className={`${secondary} h-9 w-full px-3 text-xs`} onClick={() => setViewing(item)}>
                      {recordLabel(item.observations?.length ?? 0)}
                    </button>
                    <p className="text-center text-xs text-muted">Done</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {viewing ? <MonitoringRecordsModal item={viewing} onClose={() => setViewing(null)} /> : null}
    </section>
  );
}

function recordLabel(count: number) {
  if (count === 0) return "View records";
  return count === 1 ? "View 1 record" : `View ${count} records`;
}

function MonitoringRecordsModal({ item, onClose }: { item: MonitoringItem; onClose: () => void }) {
  const records = item.observations ?? [];
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
      {records.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No readings recorded yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {records.map((row, index) => (
            <ReadingCard key={row.id} row={row} latest={index === 0} />
          ))}
        </ul>
      )}
    </ModalShell>
  );
}

function ReadingCard({ row, latest = false, compact = false }: { row: MonitoringObservation; latest?: boolean; compact?: boolean }) {
  return (
    <li className="rounded-2xl border border-line bg-canvas p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">{row.recorded_at ? formatWhen(row.recorded_at) : "—"}</p>
        <span className="flex items-center gap-1.5">
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
              <td><span class="label">Clinic</span>${escapeHtml(item.clinic_name)}<br />Room ${escapeHtml(item.hotel_room_no || "—")}</td>
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
          <button type="button" className={`${secondary} w-full sm:w-auto`} disabled={collectBusy || sendBusy} onClick={onClose}>
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
        casePriority={item.case_priority}
      />
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 -mx-1 overflow-x-auto rounded-xl border border-line sm:mx-0">
        <table className="min-w-[36rem] w-full text-left text-sm">
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

  const casePriority = detail?.visit.case_priority ?? null;
  const priorityTone = casePriority === "emergency"
    ? "bg-danger-soft border-danger-line text-danger"
    : casePriority === "urgent"
      ? "bg-warning-soft border-warning-line text-warning"
      : casePriority === "stable"
        ? "bg-success-soft border-success/20 text-success"
        : "bg-surface-2 border-line text-muted-strong";

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
            casePriority={casePriority}
          />
          <div className="mt-4 space-y-3">
            <PlanSection title="Diagnosis" tone="bg-panel border-panel-strong text-blue">
              {detail.plan.provisional_diagnoses.length === 0 ? (
                <p className="text-sm text-muted">No diagnoses recorded.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                  {detail.plan.provisional_diagnoses.map((row) => (
                    <li key={row.id || `${row.code}:${row.title}`}>
                      {row.source === "icd11" && row.code ? <span className="font-mono text-xs text-blue">{row.code} </span> : null}
                      {row.title}
                      {row.source === "free_text" ? <span className="text-xs text-muted"> (Free Diagnose)</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </PlanSection>
            <PlanSection title="Patient Priority" tone={priorityTone}>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${casePriorityClass(casePriority)}`}>
                {casePriorityLabel(casePriority)}
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
  onCompleted,
}: {
  token: string;
  item: MonitoringItem;
  onClose: () => void;
  onSaved: () => void;
  onCompleted: () => void;
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
  const [completing, setCompleting] = useState(false);
  const [history, setHistory] = useState<MonitoringObservation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

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

  function clearForm() {
    setTemperature("36.8");
    setPulse("");
    setSystolic("");
    setDiastolic("");
    setRespiratory("");
    setSpo2("");
    setNotes("");
  }

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

  async function completeMonitoring() {
    setCompleting(true);
    try {
      await api(`/api/patients/${item.patient_id}/visits/${item.visit_id}/monitoring/complete`, { method: "POST" }, token);
      toast.success("Monitoring completed", `${item.patient_name} is done with observations.`);
      onCompleted();
      onClose();
    } catch (caught) {
      toast.error("Could not complete", messageOf(caught));
    } finally {
      setCompleting(false);
    }
  }

  const busy = pending || completing;
  const canComplete = history.length > 0;

  return (
    <ModalShell
      title="Record Monitoring / Observation"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className={`${secondary} w-full sm:w-auto`} disabled={busy} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className={`${secondary} w-full sm:w-auto`}
            disabled={busy || !canComplete}
            onClick={() => void completeMonitoring()}
          >
            {completing ? "Completing…" : "Complete monitoring"}
          </button>
          <button type="submit" form="record-monitoring-form" className={`${primary} w-full sm:w-auto`} disabled={busy}>
            {pending ? "Saving…" : "Save Observation"}
          </button>
        </>
      }
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
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)] lg:items-start">
        <form id="record-monitoring-form" className="rounded-2xl border border-line bg-canvas p-3 sm:p-4" onSubmit={(event) => void submit(event)}>
          <h3 className="text-sm font-bold text-ink">New reading</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <VitalField tone="temp" label="Temperature" unit="°C" hint="36.0 – 37.5" value={temperature} onChange={setTemperature} placeholder="36.8" />
            <VitalField tone="pulse" label="Heart rate" unit="bpm" hint="60 – 100" value={pulse} onChange={setPulse} placeholder="72" />
            <div className="rounded-2xl border border-gold bg-surface px-3 py-2.5 sm:col-span-2">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-warning">Blood pressure</span>
                <span className="text-[11px] font-medium text-warning/80">90/60 – 120/80</span>
              </span>
              <span className="mt-1 flex items-baseline gap-2">
                <input className="w-full bg-transparent text-2xl font-bold tracking-tight text-ink outline-none placeholder:text-muted-soft" inputMode="numeric" value={systolic} placeholder="120" aria-label="Systolic" onChange={(event) => setSystolic(event.target.value)} />
                <span className="text-lg font-bold text-muted">/</span>
                <input className="w-full bg-transparent text-2xl font-bold tracking-tight text-ink outline-none placeholder:text-muted-soft" inputMode="numeric" value={diastolic} placeholder="80" aria-label="Diastolic" onChange={(event) => setDiastolic(event.target.value)} />
                <span className="shrink-0 text-xs font-semibold text-warning">mmHg</span>
              </span>
            </div>
            <VitalField tone="rr" label="Respiratory rate" unit="/min" hint="12 – 20" value={respiratory} onChange={setRespiratory} placeholder="16" />
            <VitalField tone="spo2" label="Oxygen saturation" unit="%" hint="≥ 95" value={spo2} onChange={setSpo2} placeholder="98" />
          </div>
          <label className="mt-3 block">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-strong">Notes</span>
            <textarea
              className={`${field} mt-1.5 min-h-24 bg-surface`}
              maxLength={500}
              value={notes}
              placeholder="Enter nursing notes..."
              onChange={(event) => setNotes(event.target.value)}
            />
            <span className="mt-1 block text-right text-xs text-muted">{notes.length}/500</span>
          </label>
        </form>
        <div className="grid gap-3">
          <section className="rounded-2xl border border-panel-strong bg-panel/60 p-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-blue">Ordered services</h3>
            <div className="mt-2">
              <OrderedServicesList services={item.ordered_services} empty="No management plan services ordered for monitoring." />
            </div>
          </section>
          <section className="rounded-2xl border border-success/30 bg-success-soft/70 p-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-success">Previous readings{history.length > 0 ? ` · ${history.length}` : ""}</h3>
            {historyLoading ? <p className="mt-2 text-sm text-muted">Loading history…</p> : null}
            {!historyLoading && history.length === 0 ? <p className="mt-2 text-sm text-muted">No readings yet.</p> : null}
            {history.length > 0 ? (
              <ul className="mt-2 max-h-[28rem] space-y-2 overflow-y-auto">
                {history.map((row, index) => (
                  <ReadingCard key={row.id} row={row} latest={index === 0} compact />
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      </div>
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
        className={`triage-dialog-panel flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-surface shadow-dialog sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-xl"}`}
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
          <p className="text-xs text-muted">{[visitType, `Room: ${room || clinicName || "—"}`].filter(Boolean).join(" | ")}</p>
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
  detailed = false,
}: {
  services: MonitoringOrderedService[];
  empty?: string;
  detailed?: boolean;
}) {
  if (!services.length) {
    return <p className="text-xs text-muted">{empty}</p>;
  }
  return (
    <ul className={detailed ? "space-y-3" : "space-y-2"}>
      {services.map((service, index) => (
        <li
          key={service.id}
          className={detailed ? "rounded-lg border border-panel-strong/60 bg-surface px-3 py-2.5" : "min-w-0"}
        >
          <div className="flex items-start gap-2">
            {detailed ? <span className="mt-0.5 text-xs font-semibold tabular-nums text-muted">{index + 1}.</span> : null}
            <div className="min-w-0 flex-1">
              <p className="break-words font-semibold text-ink">{service.name}</p>
              {service.code ? <p className="text-[11px] font-mono text-blue">{service.code}</p> : null}
              {service.detail ? <p className="mt-0.5 text-xs text-muted-strong">{service.detail}</p> : null}
              {detailed && (service.quantity != null || service.unit || service.kind !== "procedure") ? (
                <p className="mt-1 text-[11px] text-muted">
                  {[
                    service.quantity != null ? `Qty ${service.quantity}${service.unit ? ` ${service.unit}` : ""}` : null,
                    service.kind === "associated" ? "Associated service" : service.kind === "medication_monitoring" ? "From medication order" : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function VitalField({
  tone,
  label,
  unit,
  hint,
  value,
  onChange,
  placeholder,
}: {
  tone: "temp" | "pulse" | "rr" | "spo2";
  label: string;
  unit: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const palette = tone === "temp"
    ? "border-warning-line bg-warning-soft text-warning"
    : tone === "pulse"
      ? "border-panel-strong bg-panel text-blue"
      : tone === "rr"
        ? "border-success/30 bg-success-soft text-success"
        : "border-panel-strong bg-panel-strong text-blue-strong";
  return (
    <label className={`block rounded-2xl border px-3 py-2.5 ${palette}`}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
        <span className="text-[11px] font-medium opacity-75">{hint}</span>
      </span>
      <span className="mt-1 flex items-baseline gap-1.5">
        <input
          className="w-full bg-transparent text-2xl font-bold tracking-tight text-ink outline-none placeholder:text-muted-soft"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="shrink-0 text-xs font-semibold">{unit}</span>
      </span>
    </label>
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
