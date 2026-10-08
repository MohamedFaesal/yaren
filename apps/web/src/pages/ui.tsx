import { Children, cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router";

export const field = "mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-blue disabled:bg-surface-3";
export const fieldInvalid = "border-danger focus:border-danger";
export const label = "block text-[13px] font-medium text-muted-strong";
export const primary = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60";
export const secondary = "inline-flex items-center justify-center rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink";
export const danger = "inline-flex items-center justify-center rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60";

const actionTone = {
  view: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
  edit: "bg-blue text-white hover:bg-blue-strong",
  delete: "border border-danger-line bg-surface text-danger hover:bg-danger-soft",
} as const;

export function IconAction({
  kind,
  to,
  onClick,
}: {
  kind: keyof typeof actionTone;
  to?: string;
  onClick?: () => void;
}) {
  const label = kind === "view" ? "View" : kind === "edit" ? "Edit" : "Delete";
  const className = `inline-grid h-9 w-9 place-items-center rounded-lg ${actionTone[kind]}`;
  const icon = kind === "view" ? <EyeIcon /> : kind === "edit" ? <PencilIcon /> : <TrashIcon />;
  if (to) return <Link to={to} className={className} aria-label={label} title={label}>{icon}</Link>;
  return <button type="button" className={className} aria-label={label} title={label} onClick={onClick}>{icon}</button>;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function SecretValue({ value, mono = false }: { value: string | null | undefined; mono?: boolean }) {
  const [open, setOpen] = useState(false);
  const text = value?.trim() ? value : "";
  if (!text || text === "—") return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span className={`min-w-0 truncate ${mono ? "font-mono" : ""} ${open ? "" : "select-none blur-[5px]"}`} aria-hidden={!open}>
        {text}
      </span>
      <button
        type="button"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-ink"
        aria-label={open ? "Hide value" : "View value"}
        aria-pressed={open}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        {open ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </span>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-4.1 4.8" />
      <path d="M6.1 6.1C3.5 7.8 2 12 2 12s3.5 7 10 7c1.6 0 3-.3 4.2-.9" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M7 7l1 13h8l1-13" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

export function Field({
  label: title,
  error,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  error?: string | null;
  hint?: string;
  children: ReactElement<{ className?: string; invalid?: boolean; "aria-invalid"?: boolean }>;
  className?: string;
}) {
  const invalid = Boolean(error);
  const child = Children.only(children);
  const native = typeof child.type === "string" && ["input", "textarea", "select"].includes(child.type);
  const nextClass = native
    ? [child.props.className ?? field, invalid ? fieldInvalid : ""].filter(Boolean).join(" ")
    : child.props.className;

  return (
    <div className={className}>
      <label className={label}>
        {title}
        {cloneElement(child, {
          className: nextClass,
          "aria-invalid": invalid || undefined,
          ...(native ? {} : { invalid }),
        })}
      </label>
      {error ? <p className="mt-1 text-sm font-medium text-danger" role="alert">{error}</p> : null}
      {!error && hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function clearField(name: string) {
    setErrors((current) => {
      if (!(name in current)) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function clearAll() {
    setErrors({});
  }

  function validateForm(form: HTMLFormElement) {
    const next = readFormFieldErrors(form);
    setErrors(next);
    if (Object.keys(next).length === 0) return true;
    const first = form.elements.namedItem(Object.keys(next)[0]!);
    if (first instanceof HTMLElement) first.focus();
    return false;
  }

  function applyServerMessage(message: string) {
    const mapped = parseServerFieldErrors(message);
    if (Object.keys(mapped).length > 0) setErrors((current) => ({ ...current, ...mapped }));
    return mapped;
  }

  return {
    errors,
    setErrors,
    clearField,
    clearAll,
    validateForm,
    applyServerMessage,
    errorOf: (name: string) => errors[name] ?? null,
  };
}

export function readFormFieldErrors(form: HTMLFormElement) {
  const errors: Record<string, string> = {};
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
    if (!element.name || element.disabled) continue;
    if (element.validity.valid) continue;
    errors[element.name] = fieldValidityMessage(element);
  }
  return errors;
}

export function fieldValidityMessage(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const validity = element.validity;
  if (validity.valueMissing) return "This field is required.";
  if (validity.typeMismatch && element instanceof HTMLInputElement && element.type === "email") return "Enter a valid email address.";
  if (validity.typeMismatch && element instanceof HTMLInputElement && element.type === "url") return "Enter a valid URL.";
  if (validity.tooShort) {
    const min = "minLength" in element ? element.minLength : 0;
    return `Use at least ${min} characters.`;
  }
  if (validity.tooLong) {
    const max = "maxLength" in element ? element.maxLength : 0;
    return `Use at most ${max} characters.`;
  }
  if (validity.rangeUnderflow || validity.rangeOverflow || validity.stepMismatch) return "Enter a valid value.";
  if (validity.patternMismatch) return "Enter a valid value.";
  if (validity.badInput) return "Enter a valid value.";
  return element.validationMessage || "This value is invalid.";
}

export function parseServerFieldErrors(message: string) {
  const errors: Record<string, string> = {};
  for (const part of message.split(";")) {
    const index = part.indexOf(":");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key || !value || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(key)) continue;
    errors[key] = value;
  }
  return errors;
}

export function AgeBadge({ age }: { age: number }) {
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1 rounded-full bg-blue px-2.5 py-1 text-white">
      <span className="text-sm font-bold tabular-nums leading-none">{age}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-90">yrs</span>
    </span>
  );
}

export function formatWhen(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function typeLabel(type: string) {
  if (type === "super-admin") return "Super admin";
  if (type === "admin") return "Admin";
  return "Staff";
}

const roles = ["Doctor", "Nurse", "Receptionist", "Accountant", "CEO", "CTO"] as const;

export function roleOption(role: string) {
  return { value: role, label: role, icon: <RoleIcon role={role} /> };
}

export function RoleLabel({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <RoleIcon role={role} />
      <span>{role}</span>
    </span>
  );
}

export function RoleIcon({ role, boxed = true }: { role: string; boxed?: boolean }) {
  const mark = (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {role === "Doctor" ? (
        <>
          <path d="M6 3v7a4 4 0 0 0 8 0V3" />
          <path d="M6 8H4a2 2 0 0 0 0 4h2" />
          <circle cx="18" cy="11" r="2" />
          <path d="M18 13v3a3 3 0 0 1-3 3h-2" />
        </>
      ) : role === "Nurse" ? (
        <>
          <path d="M12 3v18" />
          <path d="M3 12h18" />
          <circle cx="12" cy="12" r="9" />
        </>
      ) : role === "Receptionist" ? (
        <>
          <path d="M3 13a9 9 0 0 1 18 0" />
          <path d="M3 13h2a1 1 0 0 1 1 1v5H5a2 2 0 0 1-2-2z" />
          <path d="M21 13h-2a1 1 0 0 0-1 1v5h1a2 2 0 0 0 2-2z" />
          <path d="M15 19v1a2 2 0 0 1-2 2h-1" />
        </>
      ) : role === "Accountant" ? (
        <>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8 7h8" />
          <path d="M8 12h.01M12 12h.01M16 12h.01" />
          <path d="M8 16h.01M12 16h.01M16 16h.01" />
        </>
      ) : role === "CEO" ? (
        <>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M3 12h18" />
        </>
      ) : role === "CTO" ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M8 9l-3 3 3 3" />
          <path d="M13 15h5" />
        </>
      ) : (
        <circle cx="12" cy="12" r="7" />
      )}
    </svg>
  );
  if (!boxed) return mark;
  return <span className={`inline-grid h-6 w-6 shrink-0 place-items-center rounded-md text-blue ${roles.includes(role as (typeof roles)[number]) ? "bg-panel" : "bg-surface-3"}`}>{mark}</span>;
}

export function Page({
  title,
  description,
  crumbs,
  action,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  crumbs: { label: string; to?: string }[];
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <header className="border-b border-line pb-4 sm:pb-5">
        <nav className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {crumb.to ? <Link className="hover:text-blue" to={crumb.to}>{crumb.label}</Link> : <span className="text-muted-strong">{crumb.label}</span>}
            </span>
          ))}
        </nav>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
            {description ? <p className="mt-1 max-w-2xl text-sm text-muted-strong">{description}</p> : null}
          </div>
          {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
        </div>
      </header>
      <div className="mt-4 sm:mt-5">{children}</div>
    </section>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-surface p-4 shadow-[0_8px_24px_rgba(16,42,67,0.06)] sm:p-5">{children}</div>;
}

export function Section({ index, title }: { index: string; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-blue text-sm font-bold text-white">{index}</span>
      <h2 className="font-semibold text-blue">{title}</h2>
    </div>
  );
}

export function CollapsibleSection({
  index,
  title,
  open,
  onToggle,
  summary,
  children,
  className = "",
}: {
  index: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const toggleLabel = open ? `Collapse ${title}` : `Expand ${title}`;
  return (
    <section className={`overflow-hidden rounded-2xl border border-panel-strong bg-surface shadow-sm ${className}`}>
      <div className={`flex items-stretch gap-3 border-b border-line-soft px-3 py-3 sm:px-4 ${open ? "bg-panel" : "bg-panel/70"}`}>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 rounded-xl px-1 py-1 text-left transition-colors hover:bg-panel-strong/60"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue text-sm font-bold text-white shadow-sm">{index}</span>
          <span className="min-w-0 flex-1">
            <h2 className="font-semibold text-blue">{title}</h2>
            {!open && summary ? (
              <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-strong">{summary}</span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          className="inline-grid h-11 w-11 shrink-0 place-items-center self-center rounded-xl border border-panel-strong bg-blue text-white shadow-sm transition-colors hover:bg-blue-strong"
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={open}
          onClick={onToggle}
        >
          <svg
            viewBox="0 0 20 20"
            className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
          >
            <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className={`px-4 pb-4 pt-4 ${open ? "" : "hidden"}`}>{children}</div>
    </section>
  );
}

export function SectionSummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-baseline gap-1">
      <span className="shrink-0 text-muted">{label}:</span>
      <span className="truncate font-semibold text-ink">{value || "—"}</span>
    </span>
  );
}

export function Detail({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl bg-surface-2 px-4 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{item.label}</dt>
          <dd className="mt-1 text-sm font-semibold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line-soft bg-surface shadow-[0_8px_24px_rgba(16,42,67,0.05)]">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  pending?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel, pending]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-shell/45 px-4" role="presentation" onMouseDown={() => {
        if (!pending) onCancel();
      }}>
      <div
        className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-[0_24px_60px_rgba(11,28,46,0.28)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-danger">Confirm delete</p>
        <h2 id="confirm-title" className="mt-2 text-xl font-bold text-ink">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-strong">{body}</p>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={`${secondary} w-full sm:w-auto`} onClick={onCancel} disabled={pending}>Keep</button>
          <button type="button" className={`${danger} w-full sm:w-auto`} onClick={onConfirm} disabled={pending}>{pending ? "Deleting" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function Summary({ title, lines }: { title: ReactNode; lines: ReactNode[] }) {
  return (
    <aside className="rounded-2xl border border-success-soft bg-success-soft p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-success">Selected</p>
      <h2 className="mt-2 text-lg font-bold text-ink">{title}</h2>
      <div className="mt-3 space-y-1 text-sm text-muted-strong">
        {lines.map((line, index) => <p key={index}>{line}</p>)}
      </div>
    </aside>
  );
}

export function Status({ active }: { active: boolean }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{active ? "Active" : "Inactive"}</span>;
}

export function Filters({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="mb-4 rounded-2xl bg-surface shadow-[0_8px_24px_rgba(16,42,67,0.06)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="text-sm font-semibold text-ink">Filters</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
          {open ? "Collapse" : "Expand"}
          <svg
            viewBox="0 0 20 20"
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open ? (
        <div id={panelId} className="grid gap-3 border-t border-line-soft px-4 pb-4 pt-3 md:grid-cols-2 xl:grid-cols-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  required,
  name,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; icon?: ReactNode; hint?: string; group?: string }[];
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const needle = query.trim().toLowerCase();
  const matches = options.filter((option) => `${option.group ?? ""} ${option.label} ${option.hint ?? ""}`.toLowerCase().includes(needle));

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative mt-1" ref={root}>
      {required ? <input name={name} className="pointer-events-none absolute h-0 w-0 opacity-0" value={value} required onChange={() => undefined} tabIndex={-1} /> : null}
      <button
        type="button"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={`flex w-full items-center justify-between rounded-lg border bg-surface px-3 py-2.5 text-left text-sm disabled:bg-surface-3 ${invalid ? "border-danger" : "border-line-strong"}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`inline-flex min-w-0 items-center gap-2 ${selected ? "text-ink" : "text-muted-soft"}`}>{selected?.icon}{selected?.label ?? placeholder}</span>
        <span className="text-muted-soft">▾</span>
      </button>
      {open && !disabled ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line-strong bg-surface shadow-lg">
          <input
            autoFocus
            className="w-full border-b border-line-soft px-3 py-2 text-sm outline-none"
            placeholder="Type to search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul className="max-h-72 overflow-auto py-1">
            {matches.length === 0 ? <li className="px-3 py-2 text-sm text-muted-soft">No matches</li> : matches.map((option, index) => (
              <li key={option.value || option.label}>
                {option.group && option.group !== matches[index - 1]?.group ? <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{option.group}</p> : null}
                <button
                  type="button"
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-panel ${option.value === value ? "bg-panel" : ""}`}
                  onClick={() => {
                    onChange(option.value);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {option.icon}
                  <span className="min-w-0">
                    <span className={`block ${option.value === value ? "font-semibold" : ""}`}>{option.label}</span>
                    {option.hint ? <span className="block text-xs font-normal text-muted">{option.hint}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
