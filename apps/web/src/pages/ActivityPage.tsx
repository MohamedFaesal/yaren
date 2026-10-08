import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, type ActivityPageResult } from "../api";
import { nationalityFlag } from "../nationalities";
import { DataTable, Filters, Page, SearchSelect, field, label, messageOf, secondary, th, formatWhen } from "./ui";

const pageSize = 20;

const actionOptions = [
  { value: "", label: "All actions" },
  { value: "login", label: "Sign in" },
  { value: "logout", label: "Sign out" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "view", label: "View" },
];

const entityOptions = [
  { value: "", label: "All areas" },
  { value: "user", label: "Users" },
  { value: "hotel", label: "Hotels" },
  { value: "clinic", label: "Clinics" },
  { value: "patient", label: "Patients" },
  { value: "session", label: "Sign-in" },
  { value: "role", label: "Roles" },
];

export function ActivityPage({ token }: { token: string }) {
  const [result, setResult] = useState<ActivityPageResult>({ items: [], total: 0, page: 1, page_size: pageSize });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef(0);
  const rangeError = from && to && new Date(from) > new Date(to) ? "From must be earlier than To." : null;

  function load(nextPage = page) {
    if (rangeError) return;
    const id = ++requestId.current;
    const params = new URLSearchParams({ page: String(nextPage), page_size: String(pageSize) });
    if (search) params.set("q", search);
    if (action) params.set("action", action);
    if (entity) params.set("entity", entity);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", endOfMinute(to));
    setLoading(true);
    setError(null);
    api<ActivityPageResult>(`/api/activity?${params}`, {}, token)
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
  }

  useEffect(() => {
    if (query === search) return;
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    load(page);
  }, [token, page, search, action, entity, from, to]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  const start = result.total === 0 ? 0 : (result.page - 1) * pageSize + 1;
  const end = Math.min(result.page * pageSize, result.total);
  const filtered = Boolean(search || action || entity || from || to);

  return (
    <Page
      title="Activity"
      description="A record of sign-ins and of changes to a specific user, hotel, clinic, patient, or role. Opening a list is not recorded."
      crumbs={[{ label: "System" }, { label: "Activity" }]}
      action={<button type="button" className={secondary} onClick={() => load()}>{loading ? "Refreshing" : "Refresh"}</button>}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Filters>
        <label className={label}>Search<input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by person or what happened" /></label>
        <label className={label}>Action<SearchSelect value={action} onChange={(value) => { setAction(value); setPage(1); }} options={actionOptions} placeholder="All actions" /></label>
        <label className={label}>Area<SearchSelect value={entity} onChange={(value) => { setEntity(value); setPage(1); }} options={entityOptions} placeholder="All areas" /></label>
        <label className={label}>From<input className={field} type="datetime-local" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
        <label className={label}>To<input className={field} type="datetime-local" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
      </Filters>
      {rangeError ? <p className="mb-3 text-sm text-danger">{rangeError}</p> : null}
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        {result.total === 0 ? "0 shown" : `Showing ${start}–${end} of ${result.total}`}
      </p>
      <DataTable>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>When</th>
            <th className={th}>Who</th>
            <th className={th}>Action</th>
            <th className={th}>What happened</th>
            <th className={th}>Result</th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 ? (
            <tr><td className="px-4 py-8 text-muted" colSpan={5}>{filtered ? "No activity matches these filters." : "No activity yet."}</td></tr>
          ) : result.items.map((row) => (
            <tr key={row.id} className="border-t border-line-soft">
              <td className="whitespace-nowrap px-4 py-3 text-muted-strong" title={formatWhen(row.created_at)}>{timeAgo(row.created_at, now)}</td>
              <td className="px-4 py-3 font-semibold">{row.actor_name ?? "Unknown"}</td>
              <td className="px-4 py-3"><ActionLabel action={row.action} /></td>
              <td className="px-4 py-3">
                <SummaryLine summary={row.summary} entity={row.entity} entityId={row.entity_id} action={row.action} status={row.status_code} />
                <Changes changes={row.changes} />
              </td>
              <td className="px-4 py-3"><Result status={row.status_code} /></td>
            </tr>
          ))}
        </tbody>
      </DataTable>
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

export function timeAgo(value: string, now = Date.now()) {
  const elapsed = Math.max(0, now - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${unit(minutes, "minute")} ago`;
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  if (hours < 24) return `${pair(unit(hours, "hour"), remainderMinutes ? unit(remainderMinutes, "min") : "")} ago`;
  const days = Math.floor(hours / 24);
  const remainderHours = hours % 24;
  if (days < 7) return `${pair(unit(days, "day"), remainderHours ? unit(remainderHours, "hour") : "")} ago`;
  const weeks = Math.floor(days / 7);
  const remainderDays = days % 7;
  if (days < 30) return `${pair(unit(weeks, "week"), remainderDays ? unit(remainderDays, "day") : "")} ago`;
  const months = Math.floor(days / 30);
  const remainderMonthDays = days % 30;
  if (months < 12) return `${pair(unit(months, "month"), remainderMonthDays ? unit(remainderMonthDays, "day") : "")} ago`;
  const years = Math.floor(days / 365);
  const remainderYearDays = days % 365;
  return `${pair(unit(years, "year"), remainderYearDays ? unit(remainderYearDays, "day") : "")} ago`;
}

function unit(count: number, name: string) {
  const label = count === 1 ? name : name === "min" ? "mins" : `${name}s`;
  return `${count} ${label}`;
}

function pair(first: string, second: string) {
  return second ? `${first} and ${second}` : first;
}

function endOfMinute(value: string) {
  const date = new Date(value);
  date.setSeconds(59, 999);
  return date.toISOString();
}

export function SummaryLine({
  summary,
  entity,
  entityId,
  action,
  status = 200,
  linkEntity = true,
}: {
  summary: string;
  entity: string | null;
  entityId: string | null;
  action: string;
  status?: number;
  linkEntity?: boolean;
}) {
  const path = entityPath(entity, entityId);
  const canOpen = linkEntity && status < 400 && Boolean(path) && (action === "create" || action === "update" || action === "view");
  if (!canOpen || !path) return <p>{summary}</p>;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <p>
        <Link to={path} className="font-semibold text-blue hover:underline">{summary}</Link>
      </p>
      <Link
        to={path}
        className="shrink-0 rounded-md bg-panel px-2 py-1 text-xs font-semibold text-blue hover:bg-panel-strong"
      >
        Open {entityLabel(entity)}
      </Link>
    </div>
  );
}

function entityPath(entity: string | null, entityId: string | null) {
  if (!entity || !entityId) return null;
  if (entity === "user") return `/users/${entityId}`;
  if (entity === "hotel") return `/hotels/${entityId}`;
  if (entity === "clinic") return `/clinics/${entityId}`;
  if (entity === "patient") return `/patients/${entityId}`;
  if (entity === "role") return `/roles/${entityId}`;
  return null;
}

function entityLabel(entity: string | null) {
  if (entity === "user") return "user";
  if (entity === "hotel") return "hotel";
  if (entity === "clinic") return "clinic";
  if (entity === "patient") return "patient";
  if (entity === "role") return "role";
  return "record";
}

export function Changes({ changes }: { changes: ActivityPageResult["items"][number]["changes"] }) {
  if (!changes) return null;
  if (changes.length === 0) return <p className="mt-2 text-sm text-muted">No attributes changed.</p>;
  return (
    <div className="mt-2 space-y-2">
      {changes.map((change, index) => (
        <div key={`${change.attribute}-${index}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{change.attribute}</p>
          <p className="text-sm"><span className="text-muted">From </span><span className="rounded bg-danger-soft px-1.5 text-danger line-through decoration-dashed">{changeValue(change.attribute, change.from)}</span></p>
          <p className="text-sm"><span className="text-muted">To </span><span className="rounded bg-success-soft px-1.5 text-success">{changeValue(change.attribute, change.to)}</span></p>
        </div>
      ))}
    </div>
  );
}

function changeValue(attribute: string, value: string) {
  if (attribute !== "Nationality") return value;
  const flag = nationalityFlag(value);
  return flag ? `${flag} ${value}` : value;
}

export function ActionLabel({ action }: { action: string }) {
  const label = action === "login" ? "Sign in" : action === "logout" ? "Sign out" : action.slice(0, 1).toUpperCase() + action.slice(1);
  return <span className="rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-blue">{label}</span>;
}

export function Result({ status }: { status: number }) {
  const ok = status < 400;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{ok ? "Succeeded" : status}</span>;
}
