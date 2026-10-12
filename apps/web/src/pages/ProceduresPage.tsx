import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type CatalogProcedure, type User } from "../api";
import { canManageSettings } from "../access";
import { useToast } from "../toast";
import { ConfirmDialog, DataTable, Field, Filters, IconAction, Page, PlusIcon, field, messageOf, primary, secondary, th, useFieldErrors } from "./ui";

const categories = ["Wound care", "Suturing", "Minor surgery", "Airway & breathing", "ENT", "Eye", "Lines & drainage", "Orthopedic"];

export function ProceduresPage({ token, actor }: { token: string; actor: User }) {
  const toast = useToast();
  const canManage = canManageSettings(actor);
  const [items, setItems] = useState<CatalogProcedure[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<CatalogProcedure | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<CatalogProcedure | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    if (query === search) return;
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    const id = ++requestId.current;
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (category) params.set("category", category);
    setLoading(true);
    setError(null);
    api<{ items: CatalogProcedure[] }>(`/api/surgical-procedures?${params}`, {}, token)
      .then((data) => {
        if (id === requestId.current) setItems(data.items);
      })
      .catch((caught) => {
        if (id === requestId.current) setError(messageOf(caught));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [token, search, category, reloadKey]);

  async function remove(procedure: CatalogProcedure) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/api/surgical-procedures/${procedure.id}`, { method: "DELETE" }, token);
      toast.success("Procedure removed", `${procedure.name} was removed from the list.`);
      setPendingDelete(null);
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setDeleteError(messageOf(caught));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Page
      title="Surgical Procedures"
      description="The list doctors choose from when they record a procedure on the management plan."
      crumbs={[{ label: "Care" }, { label: "Surgical Procedures" }]}
      action={canManage ? <button type="button" className={primary} onClick={() => setEditor(null)}><PlusIcon />Add procedure</button> : null}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Filters>
        <label className="block text-[13px] font-medium text-muted-strong">Search
          <input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or category" />
        </label>
        <label className="block text-[13px] font-medium text-muted-strong">Category
          <select className={field} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </Filters>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{loading ? "Loading" : `${items.length} shown`}</p>
      <DataTable>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>Procedure</th>
            <th className={th}>Category</th>
            {canManage ? <th className={th}>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td className="px-4 py-8 text-muted" colSpan={canManage ? 3 : 2}>{loading ? "Loading procedures…" : search || category ? "No procedures match this search." : "No procedures yet."}</td></tr>
          ) : items.map((row) => (
            <tr key={row.id} className="border-t border-line-soft">
              <td className="px-4 py-3 font-semibold">{row.name}</td>
              <td className="px-4 py-3 text-sm text-muted-strong">{row.category}</td>
              {canManage ? (
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <IconAction kind="edit" onClick={() => setEditor(row)} />
                    <button
                      type="button"
                      className="inline-grid h-9 w-9 place-items-center rounded-lg bg-danger text-white hover:bg-[#8f1c14]"
                      aria-label="Remove"
                      title="Remove"
                      onClick={() => { setDeleteError(null); setPendingDelete(row); }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </DataTable>
      {editor !== undefined ? (
        <ProcedureDialog
          token={token}
          procedure={editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => { setEditor(undefined); setReloadKey((current) => current + 1); }}
        />
      ) : null}
      <ConfirmDialog
        open={pendingDelete != null}
        title="Remove procedure"
        body={pendingDelete ? `${pendingDelete.name} will no longer appear when recording a procedure. Orders already written keep their text.` : ""}
        confirmLabel="Remove"
        pending={deleting}
        error={deleteError}
        onCancel={() => { if (!deleting) setPendingDelete(null); }}
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete); }}
      />
    </Page>
  );
}

function ProcedureDialog({
  token,
  procedure,
  onClose,
  onSaved,
}: {
  token: string;
  procedure: CatalogProcedure | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const fields = useFieldErrors();
  const [name, setName] = useState(procedure?.name ?? "");
  const [category, setCategory] = useState(procedure?.category ?? "Wound care");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fields.validateForm(event.currentTarget)) return;
    setPending(true);
    setError(null);
    const body = { name: name.trim(), category };
    try {
      if (procedure) {
        await api(`/api/surgical-procedures/${procedure.id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
        toast.success("Procedure saved", `${body.name} was updated.`);
      } else {
        await api("/api/surgical-procedures", { method: "POST", body: JSON.stringify(body) }, token);
        toast.success("Procedure added", `${body.name} can now be used on a management plan.`);
      }
      onSaved();
    } catch (caught) {
      const message = messageOf(caught);
      const mapped = fields.applyServerMessage(message);
      setError(Object.keys(mapped).length ? null : message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="triage-dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-shell/45 p-4" role="presentation" onMouseDown={() => { if (!pending) onClose(); }}>
      <form
        className="triage-dialog-panel w-full max-w-lg rounded-2xl bg-surface p-5 shadow-[0_24px_60px_rgba(11,28,46,0.28)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="procedure-dialog-title"
        noValidate
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void save(event)}
      >
        <h2 id="procedure-dialog-title" className="text-lg font-semibold text-ink">{procedure ? "Edit procedure" : "Add procedure"}</h2>
        <p className="mt-1 text-sm text-muted">This is shared by every clinic. Choosing it on a management plan fills the procedure name.</p>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 grid gap-4">
          <Field label="Procedure" error={fields.errorOf("name")}>
            <input className={field} name="name" value={name} onChange={(event) => { setName(event.target.value); fields.clearField("name"); }} required />
          </Field>
          <Field label="Category" error={fields.errorOf("category")}>
            <select className={field} name="category" value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={secondary} disabled={pending} onClick={onClose}>Cancel</button>
          <button type="submit" className={primary} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
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
