import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type CatalogMedication, type User } from "../api";
import { canManageSettings } from "../access";
import { useToast } from "../toast";
import { ConfirmDialog, DataTable, Field, Filters, IconAction, Page, PlusIcon, SearchSelect, field, messageOf, primary, secondary, th, useFieldErrors } from "./ui";

const dosageForms = [
  "Tablet",
  "Capsule",
  "Chewable tablet",
  "Syrup",
  "Suspension",
  "Oral Drops",
  "Ampule",
  "Vial",
  "Prefilled Syringe",
  "Infusion Solution",
  "Infusion Concentrate",
  "Inhaler",
  "Cream",
  "Ointment",
  "Gel",
  "Lotion",
  "Spray",
  "Eye drops",
  "Eye ointment",
  "Ear drops",
  "Nasal drops",
  "Nasal spray",
  "Rectal Suppository",
  "Enema",
  "Vaginal Tablet",
  "Vaginal Cream",
  "Vaginal Pessary",
  "Patch",
  "Oral powder",
  "Sachet",
  "Mouthwash",
];
const routes = ["IV Infusion / Drip", "IM injection", "Oral", "SC injection", "Inhalation / Nebulization", "Topical"];

export function MedicationsPage({ token, actor }: { token: string; actor: User }) {
  const toast = useToast();
  const canManage = canManageSettings(actor);
  const [items, setItems] = useState<CatalogMedication[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [dosageForm, setDosageForm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<CatalogMedication | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<CatalogMedication | null>(null);
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
    if (dosageForm) params.set("dosage_form", dosageForm);
    setLoading(true);
    setError(null);
    api<{ items: CatalogMedication[] }>(`/api/medications?${params}`, {}, token)
      .then((data) => {
        if (id === requestId.current) setItems(data.items);
      })
      .catch((caught) => {
        if (id === requestId.current) setError(messageOf(caught));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [token, search, dosageForm, reloadKey]);

  async function remove(medication: CatalogMedication) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/api/medications/${medication.id}`, { method: "DELETE" }, token);
      toast.success("Medication removed", `${medication.name} was removed from the list.`);
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
      title="Medications"
      description="The list doctors choose from when they write a medication order."
      crumbs={[{ label: "Care" }, { label: "Medications" }]}
      action={canManage ? <button type="button" className={primary} onClick={() => setEditor(null)}><PlusIcon />Add medication</button> : null}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Filters>
        <label className="block text-[13px] font-medium text-muted-strong">Search
          <input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, strength, form, or route" />
        </label>
        <label className="block text-[13px] font-medium text-muted-strong">Dosage form
          <SearchSelect
            value={dosageForm}
            placeholder="All forms"
            options={[{ value: "", label: "All forms" }, ...dosageForms.map((item) => ({ value: item, label: item }))]}
            onChange={setDosageForm}
          />
        </label>
      </Filters>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{loading ? "Loading" : `${items.length} shown`}</p>
      <DataTable>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>Active ingredient</th>
            <th className={th}>Strength</th>
            <th className={th}>Dosage form</th>
            <th className={th}>Route</th>
            {canManage ? <th className={th}>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td className="px-4 py-10 text-center text-sm text-muted" colSpan={canManage ? 5 : 4}>{loading ? "Loading medications…" : search || dosageForm ? "No medications match this search." : "No medications yet."}</td></tr>
          ) : items.map((row) => (
            <tr key={row.id} className="border-t border-line-soft">
              <td className="px-4 py-3 font-semibold">{row.name}</td>
              <td className="px-4 py-3">{row.strength}</td>
              <td className="px-4 py-3 text-sm text-muted-strong">{row.dosage_form}</td>
              <td className="px-4 py-3 text-sm text-muted-strong">{row.route}</td>
              {canManage ? (
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <IconAction kind="edit" onClick={() => setEditor(row)} />
                    <button
                      type="button"
                      className="inline-grid h-9 w-9 place-items-center rounded-lg border border-danger bg-surface text-danger hover:bg-danger-soft"
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
        <MedicationDialog
          token={token}
          medication={editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => { setEditor(undefined); setReloadKey((current) => current + 1); }}
        />
      ) : null}
      <ConfirmDialog
        open={pendingDelete != null}
        title="Remove medication"
        body={pendingDelete ? `${pendingDelete.name} ${pendingDelete.strength} will no longer appear when writing an order. Orders already written keep their text.` : ""}
        confirmLabel="Remove"
        pending={deleting}
        error={deleteError}
        onCancel={() => { if (!deleting) setPendingDelete(null); }}
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete); }}
      />
    </Page>
  );
}

function MedicationDialog({
  token,
  medication,
  onClose,
  onSaved,
}: {
  token: string;
  medication: CatalogMedication | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const fields = useFieldErrors();
  const [name, setName] = useState(medication?.name ?? "");
  const [strength, setStrength] = useState(medication?.strength ?? "");
  const [dosageForm, setDosageForm] = useState(medication?.dosage_form ?? "Tablet");
  const [route, setRoute] = useState(medication?.route ?? "Oral");
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
    const body = { name: name.trim(), strength: strength.trim(), dosage_form: dosageForm, route };
    try {
      if (medication) {
        await api(`/api/medications/${medication.id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
        toast.success("Medication saved", `${body.name} was updated.`);
      } else {
        await api("/api/medications", { method: "POST", body: JSON.stringify(body) }, token);
        toast.success("Medication added", `${body.name} can now be used in a medication order.`);
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
        className="triage-dialog-panel w-full max-w-lg rounded-2xl bg-surface p-5 shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="medication-dialog-title"
        noValidate
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void save(event)}
      >
        <h2 id="medication-dialog-title" className="text-lg font-semibold text-ink">{medication ? "Edit medication" : "Add medication"}</h2>
        <p className="mt-1 text-sm text-muted">This is shared by every clinic. Choosing it on an order fills the ingredient, strength, form, and route.</p>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 grid gap-4">
          <Field label="Active ingredient" error={fields.errorOf("name")}>
            <input className={field} name="name" value={name} onChange={(event) => { setName(event.target.value); fields.clearField("name"); }} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Strength" error={fields.errorOf("strength")}>
              <input className={field} name="strength" value={strength} placeholder="500 mg" onChange={(event) => { setStrength(event.target.value); fields.clearField("strength"); }} required />
            </Field>
            <Field label="Dosage form" error={fields.errorOf("dosage_form")}>
              <SearchSelect
                name="dosage_form"
                required
                value={dosageForm}
                placeholder="Search dosage form"
                options={dosageFormOptions(dosageForm)}
                onChange={(value) => { setDosageForm(value); fields.clearField("dosage_form"); }}
              />
            </Field>
          </div>
          <Field label="Route of administration" error={fields.errorOf("route")}>
            <select className={field} name="route" value={route} onChange={(event) => setRoute(event.target.value)}>
              {routes.map((item) => <option key={item} value={item}>{item}</option>)}
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

function dosageFormOptions(current: string) {
  const options = dosageForms.map((item) => ({ value: item, label: item }));
  if (current && !dosageForms.includes(current)) options.unshift({ value: current, label: current });
  return options;
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
