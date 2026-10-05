import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastTone = "success" | "error";

type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  message: string;
  duration: number;
};

type ToastApi = {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

let seed = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const api = useMemo<ToastApi>(() => {
    function dismiss(id: string) {
      setItems((current) => current.filter((item) => item.id !== id));
    }
    function push(tone: ToastTone, title: string, message: string, duration: number) {
      const id = `toast-${Date.now()}-${seed += 1}`;
      setItems((current) => [...current.slice(-4), { id, tone, title, message, duration }]);
    }
    return {
      success(title, message = "") {
        push("success", title, message, 4200);
      },
      error(title, message = "") {
        push("error", title, message, 6500);
      },
      dismiss,
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-end p-4 sm:p-5" aria-live="polite" aria-relevant="additions text">
        <div className="flex w-full max-w-[380px] flex-col gap-2.5">
          {items.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={() => api.dismiss(item.id)} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within ToastProvider");
  return value;
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const remaining = useRef(item.duration);
  const started = useRef(Date.now());

  useEffect(() => {
    if (paused || leaving) return;
    started.current = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - started.current;
      const left = Math.max(0, remaining.current - elapsed);
      setProgress((left / item.duration) * 100);
      if (left <= 0) {
        window.clearInterval(tick);
        setLeaving(true);
      }
    }, 40);
    return () => window.clearInterval(tick);
  }, [paused, leaving, item.duration]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(onDismiss, 220);
    return () => window.clearTimeout(timer);
  }, [leaving, onDismiss]);

  const success = item.tone === "success";

  return (
    <div
      role={success ? "status" : "alert"}
      className={`pointer-events-auto overflow-hidden rounded-2xl border bg-header shadow-[0_18px_50px_-24px_rgba(11,28,46,0.45)] backdrop-blur ${
        success ? "border-success-soft" : "border-danger-line"
      } ${leaving ? "toast-leave" : "toast-enter"}`}
      onMouseEnter={() => {
        remaining.current = Math.max(0, remaining.current - (Date.now() - started.current));
        setPaused(true);
      }}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex gap-3 px-4 pb-3.5 pt-3.5">
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${success ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {success ? <CheckIcon /> : <AlertIcon />}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-semibold text-ink">{item.title}</p>
          {item.message ? <p className="mt-0.5 text-sm leading-snug text-muted-strong">{item.message}</p> : null}
        </div>
        <button
          type="button"
          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
          aria-label="Dismiss"
          onClick={() => setLeaving(true)}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="h-1 bg-line-soft">
        <div
          className={`h-full origin-left transition-[width] duration-75 ease-linear ${success ? "bg-success" : "bg-danger"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
