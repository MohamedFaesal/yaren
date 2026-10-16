import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, formatPrice, type MedicalService, type User } from "../api";
import { canManageSettings } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { useToast } from "../toast";
import { ConfirmDialog, DataTable, Field, Filters, IconAction, Page, PlusIcon, SearchSelect, field, messageOf, primary, secondary, th, useFieldErrors } from "./ui";

const serviceTypes = ["Medical service", "Investigation service", "Procedure service"];

export function ServicesPage({ token, actor }: { token: string; actor: User }) {
  const toast = useToast();
  const { clinicId } = useActiveClinic();
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
    if (clinicId) params.set("clinic_id", clinicId);
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
  }, [token, search, serviceType, category, clinicId, reloadKey]);

  const columns = 6 + (clinicId ? 1 : 0) + (canManage ? 1 : 0);

  async function remove(service: MedicalService) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/api/services/${service.id}`, { method: "DELETE" }, token);
      toast.success("Service removed", `${service.name} was removed from medical services.`);
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
      title="Medical Services"
      description={clinicId ? "Prices for this clinic. A service without its own price uses the shared amount." : "Shared prices used by every clinic that does not set its own."}
      crumbs={[{ label: "Care" }, { label: "Medical Services" }]}
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
            <th className={th}>Price</th>
            {clinicId ? <th className={th}>Source</th> : null}
            {canManage ? <th className={th}>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td className="px-4 py-10 text-center text-sm text-muted" colSpan={columns}>{loading ? "Loading medical services…" : search || serviceType || category ? "No services match this search." : "No services yet."}</td></tr>
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
              <td className="px-4 py-3 tabular-nums">{formatPrice(row.price)}</td>
              {clinicId ? (
                <td className="px-4 py-3">
                  {row.clinic_price == null
                    ? <span className="text-sm text-muted">Shared</span>
                    : <span className="inline-flex rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-blue">This clinic</span>}
                </td>
              ) : null}
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
          clinicId={clinicId}
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

function selectOptions(values: string[], current: string) {
  const options = current && !values.includes(current) ? [current, ...values] : values;
  return options.map((item) => ({ value: item, label: item }));
}

function ServiceDialog({
  token,
  clinicId,
  service,
  categories,
  units,
  onClose,
  onSaved,
}: {
  token: string;
  clinicId: string;
  service: MedicalService | null;
  categories: string[];
  units: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const fields = useFieldErrors();
  const clinicPrice = Boolean(clinicId && service);
  const [name, setName] = useState(service?.name ?? "");
  const [serviceType, setServiceType] = useState(service?.service_type ?? "Medical service");
  const [category, setCategory] = useState(service?.category || categories[0] || "");
  const [unit, setUnit] = useState(service?.unit || units[0] || "");
  const [code, setCode] = useState(service?.code ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [price, setPrice] = useState(service ? formatPrice(service.price) : "0.00");
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
    const amount = Number(price.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount < 0) {
      fields.setErrors({ price: "Enter a price of 0 or more." });
      return;
    }
    const cents = Math.round(amount * 100);
    if (Math.abs(amount * 100 - cents) > 1e-6) {
      fields.setErrors({ price: "Use up to two decimal places." });
      return;
    }
    setPending(true);
    setError(null);
    const body = clinicPrice
      ? { clinic_id: clinicId, description: description.trim(), price: cents / 100 }
      : {
          name: name.trim(),
          service_type: serviceType,
          category: category.trim(),
          unit: unit.trim(),
          code: code.trim(),
          description: description.trim(),
          price: cents / 100,
        };
    try {
      if (service) {
        await api(`/api/services/${service.id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
        toast.success("Price saved", clinicPrice ? `${service.name} now has a price for this clinic.` : `${name.trim()} was updated.`);
      } else {
        await api("/api/services", { method: "POST", body: JSON.stringify(body) }, token);
        toast.success("Service added", `${name.trim()} was added to medical services.`);
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

  async function useShared() {
    if (!service || !clinicId) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/services/${service.id}/clinics/${clinicId}`, { method: "DELETE" }, token);
      toast.success("Using shared price", `${service.name} now uses the price for all clinics.`);
      onSaved();
    } catch (caught) {
      setError(messageOf(caught));
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
        <h2 id="service-dialog-title" className="text-lg font-semibold text-ink">
          {service ? (clinicPrice ? service.name : "Edit service") : "Add service"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {clinicPrice ? "This price applies only to the clinic selected in the header. Other clinics keep the shared price." : "These details and the price are shared by every clinic until a clinic sets its own price."}
        </p>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 grid gap-4">
          {clinicPrice ? null : (
            <>
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
            </>
          )}
          <Field label="Description" error={fields.errorOf("description")}>
            <textarea className={`${field} min-h-20`} name="description" value={description} maxLength={500} onChange={(event) => { setDescription(event.target.value); fields.clearField("description"); }} placeholder="Optional" />
          </Field>
          <Field label="Price" error={fields.errorOf("price")}>
            <input className={field} name="price" inputMode="decimal" value={price} onChange={(event) => { setPrice(event.target.value); fields.clearField("price"); }} placeholder="0.00" required />
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {clinicPrice && service?.clinic_price != null ? (
            <button type="button" className={secondary} disabled={pending} onClick={() => void useShared()}>Use shared price</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className={secondary} disabled={pending} onClick={onClose}>Cancel</button>
            <button type="submit" className={primary} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
