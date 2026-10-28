import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, type AppNotification, type NotificationList } from "./api";
import { useActiveClinic } from "./ClinicWorkspace";

type Filter = "" | AppNotification["kind"];

export function NotificationsMenu({ token }: { token: string }) {
  const { clinicId } = useActiveClinic();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<NotificationList>({ items: [], unread: 0, filters: [] });
  const [filter, setFilter] = useState<Filter>("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      const params = new URLSearchParams();
      if (clinicId) params.set("clinic_id", clinicId);
      api<NotificationList>(`/api/notifications?${params}`, {}, token)
        .then((data) => {
          if (!cancelled) setResult(data);
        })
        .catch(() => {
          if (!cancelled) setResult({ items: [], unread: 0, filters: [] });
        });
    }
    load();
    const timer = window.setInterval(load, 20000);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [token, clinicId]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const visible = result.items.filter((item) => !filter || item.kind === filter);
  const showFilters = result.filters.length > 1;

  function openNotice(item: AppNotification) {
    setOpen(false);
    if (!item.read) {
      const params = clinicId ? { clinic_id: clinicId } : {};
      api<NotificationList>("/api/notifications/read", {
        method: "POST",
        body: JSON.stringify({ visit_id: item.visit_id, kind: item.kind, ...params }),
      }, token).then(setResult).catch(() => undefined);
    }
  }

  async function markAll() {
    const data = await api<NotificationList>("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify({ all: true, clinic_id: clinicId || null }),
    }, token);
    setResult(data);
  }

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-ink hover:bg-surface-2"
        aria-label={result.unread ? `${result.unread} unread notifications` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon />
        {result.unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {result.unread > 99 ? "99+" : result.unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="ui-pop absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--menu-shadow)]">
          <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
            <p className="text-sm font-bold text-ink">Notifications</p>
            {result.unread > 0 ? (
              <button type="button" className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-surface px-3 text-xs font-semibold text-ink hover:bg-surface-2" onClick={() => void markAll()}>Mark all read</button>
            ) : null}
          </div>
          {showFilters ? (
            <div className="flex gap-1 px-3 pt-3">
              <FilterChip label="All" selected={filter === ""} onClick={() => setFilter("")} />
              {result.filters.includes("waiting_for_triage") ? <FilterChip label="Triage" selected={filter === "waiting_for_triage"} onClick={() => setFilter("waiting_for_triage")} /> : null}
              {result.filters.includes("to_doctor") ? <FilterChip label="To doctor" selected={filter === "to_doctor"} onClick={() => setFilter("to_doctor")} /> : null}
            </div>
          ) : null}
          <ul className="max-h-96 overflow-y-auto p-2">
            {visible.length === 0 ? (
              <li className="px-2 py-8 text-center text-sm text-muted">No patients are waiting.</li>
            ) : visible.map((item) => (
              <li key={`${item.kind}-${item.visit_id}`}>
                <Link to={item.href} className="flex w-full gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2" onClick={() => openNotice(item)}>
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-blue"}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{item.body}</span>
                    <span className="mt-1 block text-[11px] font-medium text-muted-strong">{item.kind === "waiting_for_triage" ? "Triage" : "To doctor"} · {ago(item.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${selected ? "bg-blue text-white" : "bg-surface-2 text-ink"}`}>
      {label}
    </button>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 7H4s2 0 2-7" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function ago(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
