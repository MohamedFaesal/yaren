import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api, type DashboardStats, type User } from "../api";
import { Card, Page, RoleLabel, formatWhen, messageOf, typeLabel } from "./ui";

export function DashboardPage({ token, actor }: { token: string; actor: User }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DashboardStats>("/api/dashboard", {}, token).then(setStats).catch((caught) => setError(messageOf(caught)));
  }, [token]);

  return (
    <Page
      title="Dashboard"
      description={`Welcome back, ${actor.name}. This is the current picture of Yaren.`}
      crumbs={[{ label: "Overview" }, { label: "Dashboard" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {stats ? (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Stat to="/users" label="Users" value={stats.users.total} hint={`${stats.users.active} active · ${stats.users.inactive} inactive`} icon={<UsersGlyph />} />
            <Stat to="/hotels" label="Hotels" value={stats.hotels.total} hint={`${stats.hotels.with_clinics} with a clinic`} icon={<HotelGlyph />} />
            <Stat to="/clinics" label="Clinics" value={stats.clinics.total} hint={stats.clinics.by_city[0] ? `Most in ${stats.clinics.by_city[0].city}` : "None open yet"} icon={<ClinicGlyph />} />
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <Card>
              <h2 className="font-semibold text-ink">Users by role</h2>
              <Bars rows={stats.users.by_role.map((row) => ({ id: row.key, label: <RoleLabel role={row.key} />, count: row.count }))} />
            </Card>
            <Card>
              <h2 className="font-semibold text-ink">Users by type</h2>
              <Bars rows={stats.users.by_type.map((row) => ({ id: row.key, label: typeLabel(row.key), count: row.count }))} />
            </Card>
            <Card>
              <h2 className="font-semibold text-ink">Hotels by city</h2>
              {stats.hotels.by_city.length === 0 ? <Empty>No hotels yet.</Empty> : <Bars rows={stats.hotels.by_city.map((row) => ({ id: row.city, label: row.city, count: row.count }))} />}
            </Card>
            <Card>
              <h2 className="font-semibold text-ink">Clinics by city</h2>
              {stats.clinics.by_city.length === 0 ? <Empty>No clinics yet.</Empty> : <Bars rows={stats.clinics.by_city.map((row) => ({ id: row.city, label: row.city, count: row.count }))} />}
            </Card>
          </div>
          <Card>
            <h2 className="font-semibold text-ink">Recently added</h2>
            {stats.recent.length === 0 ? <Empty>Nothing has been added yet.</Empty> : (
              <ul className="mt-4 divide-y divide-line-soft">
                {stats.recent.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <Link className="flex items-center justify-between gap-4 py-3 hover:text-blue" to={hrefOf(item)}>
                      <span>
                        <span className="block text-sm font-semibold">{item.name}</span>
                        <span className="block text-xs text-muted">{kindLabel(item.kind)}</span>
                      </span>
                      <span className="text-xs text-muted">{formatWhen(item.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : error ? null : (
        <div className="grid gap-4 md:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl border border-line bg-surface shadow-card" />)}
        </div>
      )}
    </Page>
  );
}

function Stat({ to, label, value, hint, icon }: { to: string; label: string; value: number; hint: string; icon: ReactNode }) {
  return (
    <Link to={to} className="group flex items-start gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:border-panel-strong hover:shadow-[0_12px_32px_-12px_rgba(15,127,145,0.25)]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-panel text-blue" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="mt-1 block text-3xl font-bold tracking-tight text-ink">{value}</span>
        <span className="mt-1 block text-sm text-muted-strong">{hint}</span>
      </span>
      <span className="mt-1 text-muted-soft transition group-hover:translate-x-0.5 group-hover:text-blue" aria-hidden="true">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4l6 6-6 6" /></svg>
      </span>
    </Link>
  );
}

function UsersGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.5a5.5 5.5 0 0 1 3.5 5.5" />
    </svg>
  );
}

function HotelGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16" /><path d="M2 21h20" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
    </svg>
  );
}

function ClinicGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M12 12v6M9 15h6" />
    </svg>
  );
}

function Bars({ rows }: { rows: { id: string; label: ReactNode; count: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="mt-4 space-y-3">
      {rows.map((row) => (
        <div key={row.id}>
          <div className="flex items-center justify-between text-sm">
            <span>{row.label}</span>
            <span className="font-semibold">{row.count}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-blue transition-[width] duration-500" style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="mt-4 text-sm text-muted">{children}</p>;
}

function kindLabel(kind: DashboardStats["recent"][number]["kind"]) {
  if (kind === "user") return "User";
  if (kind === "hotel") return "Hotel";
  return "Clinic";
}

function hrefOf(item: DashboardStats["recent"][number]) {
  if (item.kind === "user") return `/users/${item.id}`;
  if (item.kind === "hotel") return `/hotels/${item.id}`;
  return `/clinics/${item.id}`;
}
