import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, formatPrice, type MedicalService, type User } from "../api";
import { canManageSettings } from "../access";
import { useToast } from "../toast";
import { ConfirmDialog, DataTable, Field, Filters, IconAction, Page, PlusIcon, SearchSelect, field, messageOf, primary, secondary, th, useFieldErrors } from "./ui";

const serviceTypes = [
  "Professional Services",
  "Administrative, Coordination and Other Services",
  "Procedures & Interventions Services",
  "Investigations [Laboratory & Imaging] Services",
];

export function ServicesPage({ token, actor }: { token: string; actor: User }) {
  const toast = useToast();
  const canManage = canManageSettings(actor);
  const [items, setItems] = useState<MedicalService[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<{ service: MedicalService | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MedicalService | null>(null);
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
    if (serviceType) params.set("service_type", serviceType);
    if (category) params.set("category", category);
    setLoading(true);
    setError(null);
    api<{ items: MedicalService[]; categories: string[]; units: string[] }>(`/api/services?${params}`, {}, token)
      .then((data) => {
        if (id === requestId.current) {
          setItems(data.items);
          setCategories(data.categories);
          setUnits(data.units);
        }
      })
      .catch((caught) => {
        if (id === requestId.current) setError(messageOf(caught));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [token, search, serviceType, category, reloadKey]);

  const columns = 7 + (canManage ? 1 : 0);

  async function remove(service: MedicalService) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/api/services/${service.id}`, { method: "DELETE" }, token);
      toast.success("Service removed", `${service.name} was removed from clinic services.`);
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
      title="Clinic Services"
      description="Professional services are used on visit registration. Administrative services are used at checkout. Prices are the same for every clinic, in EGP and euro."
      crumbs={[{ label: "Care" }, { label: "Clinic Services" }]}
      action={canManage ? <button type="button" className={primary} onClick={() => setEditor({ service: null })}><PlusIcon />Add service</button> : null}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Filters>
        <label className="block text-[13px] font-medium text-muted-strong">Search
          <input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, code, type, category, or unit" />
        </label>
        <label className="block text-[13px] font-medium text-muted-strong">Type
          <SearchSelect
            value={serviceType}
            placeholder="All types"
            options={[{ value: "", label: "All types" }, ...serviceTypes.map((item) => ({ value: item, label: item }))]}
            onChange={setServiceType}
          />
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
            <th className={th}>Code</th>
            <th className={th}>Type</th>
            <th className={th}>Category</th>
            <th className={th}>Service</th>
            <th className={th}>Unit</th>
            <th className={th}>Unit price (EGP)</th>
            <th className={th}>Unit price (EUR)</th>
            {canManage ? <th className={th}>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td className="px-4 py-10 text-center text-sm text-muted" colSpan={columns}>{loading ? "Loading clinic services…" : search || serviceType || category ? "No services match this search." : "No services yet."}</td></tr>
          ) : items.map((row) => (
            <tr key={row.id} className="border-t border-line-soft">
              <td className="px-4 py-3 font-mono text-xs font-semibold">{row.code}</td>
              <td className="px-4 py-3 text-sm text-muted-strong">{row.service_type}</td>
              <td className="px-4 py-3 font-medium">{row.category}</td>
              <td className="px-4 py-3">
                <span className="block font-semibold">{row.name}</span>
                {row.description ? <span className="mt-0.5 block text-sm text-muted">{row.description}</span> : null}
              </td>
              <td className="px-4 py-3 text-sm text-muted-strong">{row.unit}</td>
              <td className="px-4 py-3 tabular-nums">{row.unit_price_egp == null ? "—" : formatPrice(row.unit_price_egp)}</td>
              <td className="px-4 py-3 tabular-nums">{row.unit_price_eur == null ? "—" : formatPrice(row.unit_price_eur)}</td>
              {canManage ? (
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <IconAction kind="edit" onClick={() => setEditor({ service: row })} />
                    <IconAction kind="delete" onClick={() => { setDeleteError(null); setPendingDelete(row); }} />
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </DataTable>
      {editor ? (
        <ServiceDialog
          token={token}
          service={editor.service}
          categories={categories}
          units={units}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); setReloadKey((current) => current + 1); }}
        />
      ) : null}
      <ConfirmDialog
        open={pendingDelete != null}
        title="Remove service"
        body={pendingDelete ? `${pendingDelete.name} will be removed for every clinic.` : ""}
        confirmLabel="Remove"
        pending={deleting}
        error={deleteError}
        onCancel={() => { if (!deleting) setPendingDelete(null); }}
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete); }}
      />
    </Page>
  );
}

function readPrice(value: string) {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 1e-6) return undefined;
  return cents / 100;
}

function selectOptions(values: string[], current: string) {
  const options = current && !values.includes(current) ? [current, ...values] : values;
  return options.map((item) => ({ value: item, label: item }));
}

function ServiceDialog({
  token,
  service,
  categories,
  units,
  onClose,
  onSaved,
}: {
  token: string;
  service: MedicalService | null;
  categories: string[];
  units: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const fields = useFieldErrors();
  const [name, setName] = useState(service?.name ?? "");
  const [serviceType, setServiceType] = useState(service?.service_type ?? "Professional Services");
  const [category, setCategory] = useState(service?.category || categories[0] || "");
  const [unit, setUnit] = useState(service?.unit || units[0] || "");
  const [code, setCode] = useState(service?.code ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [priceEgp, setPriceEgp] = useState(service?.unit_price_egp == null ? "" : formatPrice(service.unit_price_egp));
  const [priceEur, setPriceEur] = useState(service?.unit_price_eur == null ? "" : formatPrice(service.unit_price_eur));
  const [chargeOnce, setChargeOnce] = useState(service?.charge_once_per_plan ?? false);
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
    const unitPriceEgp = readPrice(priceEgp);
    const unitPriceEur = readPrice(priceEur);
    if (unitPriceEgp === undefined || unitPriceEur === undefined) {
      fields.setErrors({
        ...(unitPriceEgp === undefined ? { unit_price_egp: "Enter a price of 0 or more." } : {}),
        ...(unitPriceEur === undefined ? { unit_price_eur: "Enter a price of 0 or more." } : {}),
      });
      return;
    }
    setPending(true);
    setError(null);
    const body = {
      name: name.trim(),
      service_type: serviceType,
      category: category.trim(),
      unit: unit.trim(),
      code: code.trim(),
      description: description.trim(),
      unit_price_egp: unitPriceEgp,
      unit_price_eur: unitPriceEur,
      charge_once_per_plan: serviceType === "Procedures & Interventions Services" && chargeOnce,
    };
    try {
      if (service) {
        await api(`/api/services/${service.id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
        toast.success("Service saved", `${name.trim()} was updated.`);
      } else {
        await api("/api/services", { method: "POST", body: JSON.stringify(body) }, token);
        toast.success("Service added", `${name.trim()} was added to clinic services.`);
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
        className="triage-dialog-panel max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-dialog-title"
        noValidate
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void save(event)}
      >
        <h2 id="service-dialog-title" className="text-lg font-semibold text-ink">{service ? "Edit service" : "Add service"}</h2>
        <p className="mt-1 text-sm text-muted">These details and both prices are the same for every clinic.</p>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 grid gap-4">
          <Field label="Type" error={fields.errorOf("service_type")}>
            <SearchSelect
              name="service_type"
              required
              value={serviceType}
              placeholder="Search type"
              options={serviceTypes.map((item) => ({ value: item, label: item }))}
              onChange={(value) => { setServiceType(value); fields.clearField("service_type"); }}
            />
          </Field>
          <Field label="Category" error={fields.errorOf("category")}>
            <SearchSelect
              name="category"
              required
              value={category}
              placeholder="Choose a category"
              options={selectOptions(categories, category)}
              onChange={(value) => { setCategory(value); fields.clearField("category"); }}
            />
          </Field>
          <Field label="Service name" error={fields.errorOf("name")}>
            <input className={field} name="name" value={name} onChange={(event) => { setName(event.target.value); fields.clearField("name"); }} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Unit" error={fields.errorOf("unit")}>
              <SearchSelect
                name="unit"
                required
                value={unit}
                placeholder="Choose a unit"
                options={selectOptions(units, unit)}
                onChange={(value) => { setUnit(value); fields.clearField("unit"); }}
              />
            </Field>
            <Field label="Service code" error={fields.errorOf("code")}>
              <input className={field} name="code" value={code} onChange={(event) => { setCode(event.target.value); fields.clearField("code"); }} placeholder="YAR-CONS-001" required />
            </Field>
          </div>
          <Field label="Description" error={fields.errorOf("description")}>
            <textarea className={`${field} min-h-20`} name="description" value={description} maxLength={500} onChange={(event) => { setDescription(event.target.value); fields.clearField("description"); }} placeholder="Optional" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={<>Unit price (EGP) <span className="font-medium text-muted">Optional</span></>} error={fields.errorOf("unit_price_egp")}>
              <input className={field} name="unit_price_egp" inputMode="decimal" value={priceEgp} onChange={(event) => { setPriceEgp(event.target.value); fields.clearField("unit_price_egp"); }} placeholder="0.00" />
            </Field>
            <Field label={<>Unit price (EUR) <span className="font-medium text-muted">Optional</span></>} error={fields.errorOf("unit_price_eur")}>
              <input className={field} name="unit_price_eur" inputMode="decimal" value={priceEur} onChange={(event) => { setPriceEur(event.target.value); fields.clearField("unit_price_eur"); }} placeholder="0.00" />
            </Field>
          </div>
          {serviceType === "Procedures & Interventions Services" ? (
            <label className="flex items-start gap-2 rounded-lg border border-line-soft bg-surface-2 px-3 py-2.5 text-sm text-ink">
              <input type="checkbox" className="mt-0.5" checked={chargeOnce} onChange={(event) => setChargeOnce(event.target.checked)} />
              <span>
                <span className="font-medium">Charge once per management plan</span>
                <span className="mt-0.5 block text-xs text-muted">Several medication orders share one line. Leave this off to charge the service on every order, such as I.V. infusion.</span>
              </span>
            </label>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={secondary} disabled={pending} onClick={onClose}>Cancel</button>
          <button type="submit" className={primary} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
