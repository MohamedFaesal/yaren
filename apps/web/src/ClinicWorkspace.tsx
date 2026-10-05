import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Clinic } from "./api";

const storageKey = "yaren.activeClinicId";
export const ALL_CLINICS = "";

function readStoredActiveClinicId(): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeStoredActiveClinicId(clinicId: string) {
  try {
    localStorage.setItem(storageKey, clinicId);
  } catch {
    // Ignore private-mode storage failures; in-memory selection still works.
  }
}

type WorkspaceClinics = { items: Clinic[]; all_clinics: boolean };

type ActiveClinicContextValue = {
  clinics: Clinic[];
  clinicId: string;
  clinic: Clinic | null;
  allClinicsAllowed: boolean;
  loading: boolean;
  setClinicId: (clinicId: string) => void;
};

const ActiveClinicContext = createContext<ActiveClinicContextValue | null>(null);

export function ActiveClinicProvider({ token, children }: { token: string; children: ReactNode }) {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [allClinicsAllowed, setAllClinicsAllowed] = useState(false);
  const [clinicId, setClinicIdState] = useState(() => readStoredActiveClinicId() ?? ALL_CLINICS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<WorkspaceClinics>("/api/clinics?for=workspace", {}, token)
      .then((data) => {
        if (cancelled) return;
        const items = data.items ?? [];
        const allowAll = Boolean(data.all_clinics);
        setClinics(items);
        setAllClinicsAllowed(allowAll);
        setClinicIdState((current) => resolveClinicId(current, items, allowAll, true));
      })
      .catch(() => {
        if (cancelled) return;
        setClinics([]);
        setAllClinicsAllowed(false);
        setClinicIdState(ALL_CLINICS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== storageKey) return;
      setClinicIdState(resolveClinicId(event.newValue ?? ALL_CLINICS, clinics, allClinicsAllowed, false));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [clinics, allClinicsAllowed]);

  function setClinicId(next: string) {
    const resolved = resolveClinicId(next, clinics, allClinicsAllowed, false);
    writeStoredActiveClinicId(resolved);
    setClinicIdState(resolved);
  }

  const value = useMemo<ActiveClinicContextValue>(() => ({
    clinics,
    clinicId,
    clinic: clinics.find((item) => item.id === clinicId) ?? null,
    allClinicsAllowed,
    loading,
    setClinicId,
  }), [clinics, clinicId, allClinicsAllowed, loading]);

  return <ActiveClinicContext.Provider value={value}>{children}</ActiveClinicContext.Provider>;
}

export function useActiveClinic() {
  const value = useContext(ActiveClinicContext);
  if (!value) {
    return {
      clinics: [] as Clinic[],
      clinicId: ALL_CLINICS,
      clinic: null as Clinic | null,
      allClinicsAllowed: false,
      loading: false,
      setClinicId: (_clinicId: string) => undefined,
    };
  }
  return value;
}

export function ClinicSwitcher() {
  const { clinics, clinicId, clinic, allClinicsAllowed, loading, setClinicId } = useActiveClinic();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (loading || clinics.length === 0) return null;

  const label = clinic ? clinic.name : "All clinics";
  const detail = clinic ? clinic.hotel_name : allClinicsAllowed ? "Every clinic" : "All assigned clinics";
  const showAllOption = allClinicsAllowed || clinics.length > 1;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="flex min-w-[12rem] max-w-[16rem] items-center gap-2.5 rounded-xl border border-panel-strong bg-panel px-3 py-1.5 text-left text-blue shadow-sm transition-colors hover:bg-panel-strong hover:text-blue-strong"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch clinic"
        onClick={() => setOpen((current) => !current)}
      >
        <ClinicGlyph />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight text-ink">{label}</span>
          <span className="block truncate text-[11px] text-muted">{detail}</span>
        </span>
        <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 max-h-80 w-72 overflow-auto rounded-xl border border-line bg-surface py-1 shadow-[var(--menu-shadow)]"
        >
          {showAllOption ? (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={clinicId === ALL_CLINICS}
              className={`block w-full px-3.5 py-2.5 text-left hover:bg-surface-2 ${clinicId === ALL_CLINICS ? "bg-panel" : ""}`}
              onClick={() => {
                setClinicId(ALL_CLINICS);
                setOpen(false);
              }}
            >
              <span className="block text-sm font-semibold text-ink">All clinics</span>
              <span className="block text-[11px] text-muted">{allClinicsAllowed ? "No clinic filter" : "Every clinic you can access"}</span>
            </button>
          ) : null}
          {clinics.map((item) => {
            const selected = clinicId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`block w-full px-3.5 py-2.5 text-left hover:bg-surface-2 ${selected ? "bg-panel" : ""}`}
                onClick={() => {
                  setClinicId(item.id);
                  setOpen(false);
                }}
              >
                <span className="block truncate text-sm font-semibold text-ink">{item.name}</span>
                <span className="block truncate text-[11px] text-muted">{item.hotel_name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function resolveClinicId(candidate: string, clinics: Clinic[], allClinicsAllowed: boolean, preferDeskDefault: boolean) {
  if (candidate && clinics.some((item) => item.id === candidate)) return candidate;
  if (candidate === ALL_CLINICS) {
    if (allClinicsAllowed || clinics.length > 1 || clinics.length === 0) return ALL_CLINICS;
    return clinics[0]?.id ?? ALL_CLINICS;
  }
  if (preferDeskDefault && !allClinicsAllowed && clinics.length > 0) return clinics[0].id;
  if (allClinicsAllowed || clinics.length > 1 || clinics.length === 0) return ALL_CLINICS;
  return clinics[0]?.id ?? ALL_CLINICS;
}

function ClinicGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20V7.5A1.5 1.5 0 0 1 5.5 6H11v14H4Z" strokeLinejoin="round" />
      <path d="M11 20V4.5A1.5 1.5 0 0 1 12.5 3H18.5A1.5 1.5 0 0 1 20 4.5V20" strokeLinejoin="round" />
      <path d="M14.5 8h3M14.5 11.5h3M7 10.5h2M7 14h2" strokeLinecap="round" />
    </svg>
  );
}
