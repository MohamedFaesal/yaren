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
            <Stat to="/users" label="Users" value={stats.users.total} hint={`${stats.users.active} active · ${stats.users.inactive} inactive`} />
            <Stat to="/hotels" label="Hotels" value={stats.hotels.total} hint={`${stats.hotels.with_clinics} with a clinic`} />
            <Stat to="/clinics" label="Clinics" value={stats.clinics.total} hint={stats.clinics.by_city[0] ? `Most in ${stats.clinics.by_city[0].city}` : "None open yet"} />
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
      ) : error ? null : <p className="text-sm text-muted">Loading statistics</p>}
    </Page>
  );
}

function Stat({ to, label, value, hint }: { to: string; label: string; value: number; hint: string }) {
  return (
    <Link to={to} className="rounded-2xl bg-surface p-5 shadow-[0_8px_24px_rgba(16,42,67,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-4xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-2 text-sm text-muted-strong">{hint}</p>
    </Link>
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
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-blue" style={{ width: `${(row.count / max) * 100}%` }} />
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
