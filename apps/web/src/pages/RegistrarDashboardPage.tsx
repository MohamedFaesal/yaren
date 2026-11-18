import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import {
  api,
  visitTypeLabel,
  type RegistrarDashboard,
  type RegistrarOutcome,
  type RegistrarQueueStage,
  type User,
  type VisitType,
} from "../api";
import { canAct } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { DataTable, IconAction, Page, field, label, messageOf, primary, secondary, th } from "./ui";

const flowStages = [
  "waiting_for_triage",
  "to_doctor",
  "with_the_doctor",
  "waiting_for_investigations",
  "waiting_for_doctor_review",
  "under_monitoring",
  "pending_payment",
  "encounter_complete",
  "referred",
] as const;

const emptyDashboard: RegistrarDashboard = {
  from: localCalendarDay(),
  to: localCalendarDay(),
  kpis: {
    registered_today: 0,
    active_in_clinic: 0,
    encounter_complete: 0,
    referred: 0,
    left_encounter_complete: 0,
    left_encounter_incomplete: 0,
  },
  flow: flowStages.map((stage) => ({ stage, count: 0 })),
  queue: [],
  completed: [],
};

const queueFilters: { id: RegistrarQueueStage | ""; label: string }[] = [
  { id: "", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "with_doctor", label: "With doctor" },
  { id: "investigations", label: "Investigations" },
  { id: "monitoring", label: "Monitoring" },
];

export function RegistrarDashboardPage({ token, actor }: { token: string; actor: User }) {
  const navigate = useNavigate();
  const { clinicId } = useActiveClinic();
  const [board, setBoard] = useState<RegistrarDashboard>(emptyDashboard);
  const [from, setFrom] = useState(localCalendarDay);
  const [to, setTo] = useState(localCalendarDay);
  const [stage, setStage] = useState<RegistrarQueueStage | "">("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef(0);
  const canOpenVisit = canAct(actor, "visit", "view");
  const canRegister = canAct(actor, "patient", "create");

  useEffect(() => {
    if (query === search) return;
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const id = ++requestId.current;
    const params = new URLSearchParams({ from, to });
    if (search) params.set("q", search);
    if (stage) params.set("stage", stage);
    if (clinicId) params.set("clinic_id", clinicId);
    setLoading(true);
    setError(null);
    api<RegistrarDashboard>(`/api/registrar/dashboard?${params}`, {}, token)
      .then((data) => {
        if (id === requestId.current) setBoard(data);
      })
      .catch((caught) => {
        if (id === requestId.current) setError(messageOf(caught));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [token, from, to, search, stage, clinicId]);

  const flowCount = (name: string) => board.flow.find((item) => item.stage === name)?.count ?? 0;
  const filterCount = (id: RegistrarQueueStage | "") => {
    if (id === "waiting") return flowCount("waiting_for_triage");
    if (id === "with_doctor") return flowCount("to_doctor") + flowCount("with_the_doctor");
    if (id === "investigations") return flowCount("waiting_for_investigations") + flowCount("waiting_for_doctor_review");
    if (id === "monitoring") return flowCount("under_monitoring");
    return board.kpis.active_in_clinic;
  };
  const flowMax = Math.max(1, ...board.flow.map((item) => item.count));

  return (
    <Page
      title="Registrar Dashboard"
      description="Registrations in the selected dates, who is still in clinic, and visits whose encounter is complete."
      crumbs={[{ label: "Care" }, { label: "Registrar Dashboard" }]}
      action={
        <div className="flex flex-wrap items-end gap-2">
          <DateRangeField from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} />
          {canRegister ? <Link className={primary} to="/patients/new">Register New Patient</Link> : null}
        </div>
      }
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Kpi label="Registered" value={board.kpis.registered_today} detail="Active plus everyone who left" loading={loading} tone="border-blue/20 bg-panel text-blue" />
        <Kpi label="Active in clinic" value={board.kpis.active_in_clinic} detail="Still here, including completed encounters" loading={loading} tone="border-success/20 bg-success-soft text-success" />
        <Kpi label="Encounter complete" value={board.kpis.encounter_complete} detail={`${board.kpis.referred} referred to hospital`} loading={loading} tone="border-panel-strong bg-panel-strong text-blue-strong" />
        <Kpi label="Patient left" value={board.kpis.left_encounter_complete + board.kpis.left_encounter_incomplete} detail={`${board.kpis.left_encounter_complete} after the encounter · ${board.kpis.left_encounter_incomplete} before it`} loading={loading} tone="border-line bg-surface text-ink" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start">
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <h2 className="text-sm font-semibold text-ink">Patient flow</h2>
          <p className="mt-0.5 text-xs text-muted">Where the {board.kpis.active_in_clinic} patients still in clinic are.</p>
          <ul className="mt-4 grid gap-2.5">
            {board.flow.map((item) => (
              <li key={item.stage} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
                <span className="truncate text-muted-strong">{flowLabel(item.stage)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full rounded-full bg-blue" style={{ width: `${(item.count / flowMax) * 100}%` }} />
                </span>
                <span className="text-right font-semibold tabular-nums text-ink">{item.count}</span>
              </li>
            ))}
          </ul>
        </section>
        <aside className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <h2 className="text-sm font-semibold text-ink">Visit overview</h2>
          <p className="mt-0.5 text-xs text-muted">Registrations in this range split into who is here and who left. Referred is part of the completed encounters.</p>
          <ul className="mt-3 grid gap-2">
            <OverviewRow label="Registered" count={board.kpis.registered_today} />
            <OverviewRow label="Active in clinic" count={board.kpis.active_in_clinic} />
            <OverviewRow label="Encounter complete" count={board.kpis.encounter_complete} />
            <OverviewRow label="Left (encounter complete)" count={board.kpis.left_encounter_complete} />
            <OverviewRow label="Referred to hospital" count={board.kpis.referred} nested />
            <OverviewRow label="Left (encounter incomplete)" count={board.kpis.left_encounter_incomplete} />
          </ul>
        </aside>
      </div>

      <section className="mt-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Live patient queue</h2>
            <p className="mt-0.5 text-xs text-muted">{loading ? "Loading" : `${board.queue.length} shown`}</p>
          </div>
          <label className={`${label} w-full sm:max-w-xs`}>Search
            <input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patient, MRN, or passport" />
          </label>
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {queueFilters.map((filter) => {
            const selected = stage === filter.id;
            return (
              <button
                key={filter.id || "all"}
                type="button"
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${selected ? "border-blue bg-panel text-blue" : "border-line bg-surface text-muted-strong hover:bg-surface-2"}`}
                onClick={() => setStage(filter.id)}
              >
                {filter.label}
                <span className="tabular-nums">{filterCount(filter.id)}</span>
              </button>
            );
          })}
        </div>
        <DataTable>
          <thead className="bg-surface-2">
            <tr>
              <th className={th}>Patient</th>
              <th className={th}>Type</th>
              <th className={th}>Current stage</th>
              <th className={th}>Elapsed</th>
              <th className={th}>Assigned to</th>
              {canOpenVisit ? <th className={th}>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {board.queue.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-muted" colSpan={canOpenVisit ? 6 : 5}>
                  {search || stage ? "No patients match this queue." : "No patients are in clinic for these dates."}
                </td>
              </tr>
            ) : board.queue.map((row) => {
              const href = `/visits/${row.visit_number}`;
              return (
                <tr
                  key={row.id}
                  className={`border-t border-line-soft ${canOpenVisit ? "cursor-pointer hover:bg-surface-2" : ""}`}
                  onClick={canOpenVisit ? () => navigate(href) : undefined}
                >
                  <td className="px-4 py-3">
                    <span className="block font-semibold">{row.patient_name}</span>
                    <span className="text-xs text-muted">{patientMeta(row.patient_age, row.patient_gender)}</span>
                  </td>
                  <td className="px-4 py-3"><VisitTypeBadge type={row.visit_type} /></td>
                  <td className="px-4 py-3"><span className="inline-flex rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink">{flowLabel(row.stage)}</span></td>
                  <td className="px-4 py-3 font-mono text-sm font-semibold tabular-nums text-ink">{elapsedLabel(row.created_at, now)}</td>
                  <td className="px-4 py-3">{row.assigned_doctor_name ?? "—"}</td>
                  {canOpenVisit ? (
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <IconAction kind="view" to={href} />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </section>

      <section className="mt-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-ink">Recently completed visits</h2>
          <p className="mt-0.5 text-xs text-muted">Encounters that are clinically complete, including patients who are still in clinic.</p>
        </div>
        <DataTable>
          <thead className="bg-surface-2">
            <tr>
              <th className={th}>Patient</th>
              <th className={th}>MRN</th>
              <th className={th}>Type</th>
              <th className={th}>Registration</th>
              <th className={th}>Completion</th>
              <th className={th}>Duration</th>
              <th className={th}>Outcome</th>
              {canOpenVisit ? <th className={th}>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {board.completed.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-muted" colSpan={canOpenVisit ? 8 : 7}>
                  No completed encounters for these dates.
                </td>
              </tr>
            ) : board.completed.map((row) => {
              const href = `/visits/${row.visit_number}`;
              return (
                <tr
                  key={row.id}
                  className={`border-t border-line-soft ${canOpenVisit ? "cursor-pointer hover:bg-surface-2" : ""}`}
                  onClick={canOpenVisit ? () => navigate(href) : undefined}
                >
                  <td className="px-4 py-3 font-semibold">{row.patient_name}</td>
                  <td className="px-4 py-3 font-mono text-sm">{row.patient_mrn}</td>
                  <td className="px-4 py-3"><VisitTypeBadge type={row.visit_type} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-strong">{formatWhen(row.registered_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-strong">{row.completed_at ? formatWhen(row.completed_at) : "—"}</td>
                  <td className="px-4 py-3 font-mono text-sm tabular-nums">{durationLabel(row.registered_at, row.completed_at)}</td>
                  <td className="px-4 py-3"><OutcomeBadge outcome={row.outcome} /></td>
                  {canOpenVisit ? (
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <IconAction kind="view" to={href} />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </section>
    </Page>
  );
}

function Kpi({ label: title, value, detail, loading, tone }: { label: string; value: number; detail: string; loading: boolean; tone: string }) {
  return (
    <article className={`rounded-2xl border px-3 py-3 shadow-card sm:px-4 sm:py-4 ${tone}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80 sm:text-xs">{title}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums sm:mt-2 sm:text-3xl">{loading ? "—" : value}</p>
      <p className="mt-1 text-xs opacity-80">{detail}</p>
    </article>
  );
}

function OverviewRow({ label: title, count, nested }: { label: string; count: number; nested?: boolean }) {
  return (
    <li className={`flex items-center justify-between gap-3 text-sm ${nested ? "pl-3" : ""}`}>
      <span className="text-muted-strong">{title}</span>
      <span className="font-semibold tabular-nums text-ink">{count}</span>
    </li>
  );
}

function flowLabel(stage: string) {
  if (stage === "waiting_for_triage") return "Waiting for triage";
  if (stage === "to_doctor") return "Waiting for the doctor";
  if (stage === "with_the_doctor") return "With the doctor";
  if (stage === "waiting_for_investigations") return "Waiting for investigations";
  if (stage === "waiting_for_doctor_review") return "Waiting for doctor review";
  if (stage === "under_monitoring") return "Under monitoring";
  if (stage === "pending_payment") return "Pending payment";
  if (stage === "encounter_complete") return "Encounter complete";
  if (stage === "referred") return "Referred to hospital";
  return stage.replaceAll("_", " ");
}

function patientMeta(age: number | null, gender: string) {
  const sex = gender === "female" ? "Female" : gender === "male" ? "Male" : gender;
  return age == null ? sex : `${age} y · ${sex}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function elapsedLabel(from: string, now: number) {
  const total = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

function durationLabel(start: string, end: string | null) {
  if (!end) return "—";
  const total = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  return `${minutes}m`;
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function localCalendarDay(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function DateRangeField({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => monthOf(from));
  const today = localCalendarDay();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish(true);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, draft]);

  function finish(keepSingleDay: boolean) {
    if (keepSingleDay && draft) onChange(draft, draft);
    setDraft(null);
    setHover(null);
    setOpen(false);
  }

  function pick(day: string) {
    if (!draft) {
      setDraft(day);
      return;
    }
    onChange(draft < day ? draft : day, draft < day ? day : draft);
    setDraft(null);
    setHover(null);
    setOpen(false);
  }

  const other = draft ? hover ?? draft : to;
  const rangeStart = draft ? (draft < other ? draft : other) : from;
  const rangeEnd = draft ? (draft < other ? other : draft) : to;
  const cells = monthCells(cursor.year, cursor.month);
  const shown = draft ? `${formatCalendarDay(draft)} –` : formatCalendarRange(from, to);

  return (
    <div>
      <label className={label}>Dates
        <button
          type="button"
          className={`${field} min-w-[16rem] text-left`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            if (open) finish(true);
            else {
              setCursor(monthOf(from));
              setDraft(null);
              setOpen(true);
            }
          }}
        >
          {shown}
        </button>
      </label>
      {open ? createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-shell/45 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={() => finish(true)}>
        <div role="dialog" aria-label="Date range" className="w-72 rounded-2xl border border-line bg-surface p-3 shadow-dialog" onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-2">
            <button type="button" className={`${secondary} px-2 py-1 text-xs`} aria-label="Previous month" onClick={() => setCursor((current) => shiftMonth(current, -1))}>‹</button>
            <p className="text-sm font-semibold text-ink">{new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
            <button type="button" className={`${secondary} px-2 py-1 text-xs`} aria-label="Next month" onClick={() => setCursor((current) => shiftMonth(current, 1))}>›</button>
          </div>
          <p className="mt-2 truncate text-center text-xs text-muted-strong">{shown}</p>
          <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-muted">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7">
            {cells.map((day, index) => day ? (
              <button
                key={day}
                type="button"
                className={`h-8 text-sm font-semibold tabular-nums ${rangeDayClass(day, rangeStart, rangeEnd, today)}`}
                onMouseEnter={() => setHover(day)}
                onMouseLeave={() => setHover(null)}
                onClick={() => pick(day)}
              >
                {Number(day.slice(8))}
              </button>
            ) : <span key={`empty-${index}`} />)}
          </div>
          <button
            type="button"
            className={`${secondary} mt-3 w-full py-1.5 text-xs`}
            onClick={() => {
              onChange(today, today);
              setDraft(null);
              setOpen(false);
            }}
          >
            Today
          </button>
        </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function rangeDayClass(day: string, start: string, end: string, today: string) {
  const inRange = day >= start && day <= end;
  if (!inRange) return `rounded-md text-ink hover:bg-surface-2 ${day === today ? "ring-1 ring-inset ring-blue/40" : ""}`;
  if (day === start && day === end) return "rounded-md bg-blue text-white";
  if (day === start) return "rounded-l-md bg-blue text-white";
  if (day === end) return "rounded-r-md bg-blue text-white";
  return "bg-panel text-blue";
}

function monthOf(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year, month: month - 1 };
}

function shiftMonth(cursor: { year: number; month: number }, delta: number) {
  const date = new Date(cursor.year, cursor.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function monthCells(year: number, month: number) {
  const pad = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: pad }, () => null);
  for (let day = 1; day <= count; day += 1) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatCalendarDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatCalendarRange(from: string, to: string) {
  if (from === to) return formatCalendarDay(from);
  return `${formatCalendarDay(from)} – ${formatCalendarDay(to)}`;
}

function VisitTypeBadge({ type }: { type?: VisitType }) {
  if (type === "follow-up") return <span className="inline-flex rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-blue">Follow-up</span>;
  if (type === "new") return <span className="inline-flex rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink">New</span>;
  return <span className="text-muted">{visitTypeLabel(type)}</span>;
}

function OutcomeBadge({ outcome }: { outcome: RegistrarOutcome }) {
  const tone = outcome === "referred"
    ? "bg-warning-soft text-warning"
    : outcome === "left"
      ? "bg-surface-3 text-muted-strong"
      : "bg-success-soft text-success";
  const text = outcome === "referred" ? "Referred" : outcome === "left" ? "Left" : "In clinic";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{text}</span>;
}
