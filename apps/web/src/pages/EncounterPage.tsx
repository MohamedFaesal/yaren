import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  api,
  formatPrice,
  type CatalogMedication,
  type ClinicalEncounter,
  type EncounterRecord,
  type Icd10Code,
  type MedicalService,
  type MedicationOrder,
  type ProcedureOrder,
} from "../api";
import { useToast } from "../toast";
import { ConfirmDialog, Page, RemoveButton, SearchSelect, field, fieldInvalid, label, messageOf, primary, secondary } from "./ui";

type EncounterTab = "history" | "vitals" | "examination" | "investigations" | "diagnosis" | "plan";
type PlanTab = "medications" | "procedures" | "advice";

const tabs: { id: EncounterTab; label: string }[] = [
  { id: "history", label: "History" },
  { id: "vitals", label: "Vital Signs" },
  { id: "examination", label: "Examination" },
  { id: "investigations", label: "Investigations" },
  { id: "diagnosis", label: "Diagnosis" },
  { id: "plan", label: "Management Plan" },
];

const frequencies = ["Once", "Once daily", "Every 6 hours", "Every 8 hours", "Every 12 hours", "Three times daily", "As prescribed"];
const doseUnits = ["mg", "g", "mcg", "mL", "Ampule", "Vial", "Nebule", "Syringe"] as const;
const flowRateUnits = ["mL/hr", "drops/min", "mL/min", "mg/hr", "mcg/min"] as const;
const clearedFlowRate: Pick<MedicationOrder, "flow_rate" | "flow_rate_value" | "flow_rate_unit"> = { flow_rate: "", flow_rate_value: null, flow_rate_unit: "" };
const clearedAdministration: Pick<MedicationOrder, "flow_rate" | "flow_rate_value" | "flow_rate_unit" | "diluent_medication_id" | "diluent_volume_value" | "infusion_duration_value" | "infusion_input" | "monitoring_duration_value" | "monitoring_duration_unit"> = {
  ...clearedFlowRate,
  diluent_medication_id: null,
  diluent_volume_value: null,
  infusion_duration_value: null,
  infusion_input: "rate",
  monitoring_duration_value: null,
  monitoring_duration_unit: "",
};
const incompleteOrdersMessage = "Complete the highlighted medication orders, or remove them.";

const investigationPriorities = [
  { value: "emergency", label: "Emergency" },
  { value: "urgent", label: "Urgent" },
  { value: "normal", label: "Normal" },
] as const;

export function EncounterPage({ token }: { token: string }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [record, setRecord] = useState<EncounterRecord | null>(null);
  const [form, setForm] = useState<ClinicalEncounter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [tab, setTab] = useState<EncounterTab>("history");
  const [planTab, setPlanTab] = useState<PlanTab>("medications");
  const [allergyName, setAllergyName] = useState("");
  const [medicationName, setMedicationName] = useState("");
  const [savedSteps, setSavedSteps] = useState<EncounterTab[]>([]);
  const [snapshots, setSnapshots] = useState<Partial<Record<EncounterTab, string>>>({});
  const [services, setServices] = useState<MedicalService[]>([]);
  const [procedureServices, setProcedureServices] = useState<MedicalService[]>([]);
  const [catalog, setCatalog] = useState<CatalogMedication[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [showOrderErrors, setShowOrderErrors] = useState(false);
  const [orderDialog, setOrderDialog] = useState<MedicationOrder | null>(null);
  const [procedureDialog, setProcedureDialog] = useState<ProcedureOrder | null>(null);

  useEffect(() => {
    api<EncounterRecord>(`/api/doctor-cases/${id}/encounter`, {}, token)
      .then((data) => {
        const normalized = normalize(data.encounter);
        setRecord(data);
        setForm(normalized);
        if (!id) return;
        const stored = readSavedState(id);
        const nextSnapshots = { ...stored.snapshots };
        for (const step of stored.steps) {
          if (!nextSnapshots[step]) nextSnapshots[step] = stepSignature(normalized, step);
        }
        setSavedSteps(stored.steps);
        setSnapshots(nextSnapshots);
        writeSavedState(id, stored.steps, nextSnapshots);
      })
      .catch((caught) => setError(messageOf(caught)));
  }, [id, token]);

  const visit = record?.visit;
  const locked = Boolean(record?.finished);

  useEffect(() => {
    let cancelled = false;
    api<{ items: CatalogMedication[] }>("/api/medications", {}, token)
      .then((data) => {
        if (!cancelled) setCatalog(data.items);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!visit?.clinic_id) return;
    let cancelled = false;
    const clinic = encodeURIComponent(visit.clinic_id);
    api<{ items: MedicalService[] }>(`/api/services?clinic_id=${clinic}&service_type=${encodeURIComponent("Investigations [Laboratory & Imaging] Services")}`, {}, token)
      .then((data) => {
        if (!cancelled) setServices(data.items);
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      });
    api<{ items: MedicalService[] }>(`/api/services?clinic_id=${clinic}&service_type=${encodeURIComponent("Procedures & Interventions Services")}`, {}, token)
      .then((data) => {
        if (!cancelled) setProcedureServices(data.items);
      })
      .catch(() => {
        if (!cancelled) setProcedureServices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visit?.clinic_id, token]);

  function update(patch: Partial<ClinicalEncounter>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  const draftReady = Boolean(form) && !locked;
  useEffect(() => {
    if (!draftReady || catalog.length === 0) return;
    const nationality = record?.visit.patient_nationality;
    setForm((current) => {
      if (!current) return current;
      const procedure_orders = reconcileProcedures(current.medication_orders, current.procedure_orders, catalog, nationality);
      if (JSON.stringify(procedure_orders) === JSON.stringify(current.procedure_orders)) return current;
      return { ...current, procedure_orders };
    });
  }, [draftReady, catalog, record?.visit.patient_nationality]);

  const ordersInvalid = Boolean(form?.medication_orders.some((row) => hasOrderProblems(row, catalog)));
  useEffect(() => {
    if (!showOrderErrors || ordersInvalid) return;
    setShowOrderErrors(false);
    setError((current) => (current === incompleteOrdersMessage ? null : current));
  }, [showOrderErrors, ordersInvalid]);

  function readyToSave() {
    if (!form) return false;
    if (ordersInvalid) {
      setShowOrderErrors(true);
      setTab("plan");
      setPlanTab("medications");
      setError(incompleteOrdersMessage);
      return false;
    }
    return true;
  }

  function missingRequired(): { tab: EncounterTab; message: string } | null {
    if (!form) return null;
    for (const item of tabs) {
      const message = missingForStep(form, item.id);
      if (message) return { tab: item.id, message };
    }
    return null;
  }

  function stepChanged(step: EncounterTab) {
    if (!form || !savedSteps.includes(step)) return false;
    const saved = snapshots[step];
    if (!saved) return false;
    return stepSignature(form, step) !== saved;
  }

  function requestFinish() {
    if (!readyToSave()) return;
    const missing = missingRequired();
    if (missing) {
      setTab(missing.tab);
      setError(missing.message);
      return;
    }
    setError(null);
    setConfirmFinish(true);
  }

  async function saveStep() {
    if (!form || locked || !id) return;
    const step = tab;
    const missing = missingForStep(form, step);
    if (missing) {
      setError(missing);
      return;
    }
    if (step === "plan" && !readyToSave()) return;
    setSaving(true);
    setError(null);
    const keptOrders = form.medication_orders.filter((row) => !row.medication.trim());
    try {
      const data = await api<EncounterRecord>(`/api/doctor-cases/${id}/encounter`, {
        method: "PUT",
        body: JSON.stringify(withoutIncompleteRows(form)),
      }, token);
      const merged = normalize({
        ...data.encounter,
        medication_orders: [...data.encounter.medication_orders, ...keptOrders],
      });
      setRecord(data);
      setForm(merged);
      const nextSteps = savedSteps.includes(step) ? savedSteps : [...savedSteps, step];
      const nextSnapshots = { ...snapshots, [step]: stepSignature(merged, step) };
      setSavedSteps(nextSteps);
      setSnapshots(nextSnapshots);
      writeSavedState(id, nextSteps, nextSnapshots);
      const name = tabs.find((item) => item.id === step)?.label ?? "Step";
      const following = tabs[tabs.findIndex((item) => item.id === step) + 1];
      if (following) setTab(following.id);
      toast.success(`${name} saved`, following ? `Next: ${following.label}.` : "This was the last step.");
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    if (!form || locked || !readyToSave()) {
      setConfirmFinish(false);
      return;
    }
    const missing = missingRequired();
    if (missing) {
      setTab(missing.tab);
      setError(missing.message);
      setConfirmFinish(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api<EncounterRecord>(`/api/doctor-cases/${id}/encounter/finish`, {
        method: "POST",
        body: JSON.stringify(form),
      }, token);
      if (id) localStorage.removeItem(savedStepsKey(id));
      toast.success("Encounter finished", `${visit?.patient_name ?? "The patient"} has been seen.`);
      navigate("/patients/to-doctor");
    } catch (caught) {
      setError(messageOf(caught));
      setConfirmFinish(false);
    } finally {
      setSaving(false);
    }
  }

  const when = visit?.triage_completed_at ? formatDay(visit.triage_completed_at) : null;

  return (
    <Page
      title="Clinical Encounter"
      description={locked ? "This encounter is finished." : "Record the assessment, then finish the encounter."}
      crumbs={[{ label: "Care" }, { label: "Doctor Dashboard", to: "/patients/to-doctor" }, { label: "Clinical Encounter" }]}
      action={form ? (
        <>
          {visit ? <Link className={secondary} to={`/patients/${visit.patient_id}`}>View Full Profile</Link> : null}
          {locked ? null : (
            <button type="button" className={`${primary} !text-white`} disabled={saving} onClick={requestFinish}>Finish Encounter & Send to Nurse</button>
          )}
        </>
      ) : null}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {!form || !visit || !record ? <p className="text-sm text-muted">{error ? "" : "Loading encounter…"}</p> : (
        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-panel text-lg font-bold text-blue">{initials(visit.patient_name)}</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-ink">{visit.patient_name}</h2>
                <p className="mt-0.5 text-sm text-muted">
                  <span className="font-mono">{visit.patient_mrn}</span>
                  {visit.patient_age_at_visit != null ? ` · ${visit.patient_age_at_visit} years` : ""}
                  {visit.patient_gender ? ` · ${visit.patient_gender === "male" ? "Male" : "Female"}` : ""}
                  {visit.patient_nationality ? ` · ${visit.patient_nationality}` : ""}
                </p>
              </div>
              {when ? (
                <div className="text-sm">
                  <p className="font-semibold text-ink">{when.day}</p>
                  <p className="text-muted">{when.time}</p>
                </div>
              ) : null}
              <div className="text-sm">
                <p className="font-semibold text-ink">{visit.clinic_name}</p>
                <p className="text-muted">{visit.hotel_room_no ? `Room ${visit.hotel_room_no}` : "No room"}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${locked ? "bg-success-soft text-success" : "bg-panel text-blue"}`}>
                {locked ? "Finished" : "Active Visit"}
              </span>
            </div>
          </section>

          <div className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-2 shadow-card" role="tablist">
            {tabs.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${tab === item.id ? "bg-panel text-blue" : "text-muted-strong hover:bg-surface-2"}`}
              >
                <span className="text-xs">{index + 1}.</span>
                {item.label}
                {item.id === "investigations" ? (
                  <span className={`inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums ${tab === item.id ? "bg-surface text-blue" : "bg-surface-2 text-ink"}`}>{form.investigations.length}</span>
                ) : null}
                {!locked && stepChanged(item.id) ? <ChangedMark /> : !locked && savedSteps.includes(item.id) ? <SavedMark /> : null}
              </button>
            ))}
          </div>

          {tab === "history" ? (
            <div className="space-y-4">
              <Panel title="This visit">
                <div className="grid gap-4">
                  <label className={label}>Chief complaint<span className="text-danger"> *</span>
                    <textarea className={`${field} min-h-24`} disabled={locked} value={form.chief_complaint} onChange={(event) => update({ chief_complaint: event.target.value })} />
                  </label>
                  <label className={label}>History of present illness <span className="font-medium text-muted">Optional</span>
                    <textarea className={`${field} min-h-32`} disabled={locked} value={form.history_of_present_illness} onChange={(event) => update({ history_of_present_illness: event.target.value })} />
                  </label>
                </div>
              </Panel>
              <Panel title="Past medical and surgical history" optional>
                <textarea className={`${field} min-h-32`} disabled={locked} value={form.past_history} onChange={(event) => update({ past_history: event.target.value })} />
              </Panel>
              <Panel title="History of allergy to medications" optional>
                {form.allergies.length === 0 ? <p className="text-sm text-muted">No allergies recorded.</p> : (
                  <ul className="grid gap-2">
                    {form.allergies.map((item, index) => (
                      <li key={`${item.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-line-soft bg-canvas px-3 py-2 text-sm">
                        <span className="min-w-0 font-semibold text-danger">{item.name}</span>
                        {locked ? null : <RemoveButton onClick={() => update({ allergies: form.allergies.filter((_, itemIndex) => itemIndex !== index) })} />}
                      </li>
                    ))}
                  </ul>
                )}
                {locked ? null : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <label className={label}>Allergy
                      <input className={field} value={allergyName} placeholder="Penicillin" onChange={(event) => setAllergyName(event.target.value)} />
                    </label>
                    <button type="button" className={secondary} onClick={() => {
                      const name = allergyName.trim();
                      if (!name) return;
                      update({ allergies: [...form.allergies, { name }] });
                      setAllergyName("");
                    }}>Add</button>
                  </div>
                )}
              </Panel>
              <Panel title="Regular Medication List" optional>
                {form.medications.length === 0 ? <p className="text-sm text-muted">No medications recorded.</p> : (
                  <ul className="grid gap-2">
                    {form.medications.map((item, index) => (
                      <li key={`${item.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-line-soft bg-canvas px-3 py-2 text-sm">
                        <span className="min-w-0 font-medium">{item.name}</span>
                        {locked ? null : <RemoveButton onClick={() => update({ medications: form.medications.filter((_, itemIndex) => itemIndex !== index) })} />}
                      </li>
                    ))}
                  </ul>
                )}
                {locked ? null : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <label className={label}>Medication
                      <input className={field} value={medicationName} placeholder="Name and dose" onChange={(event) => setMedicationName(event.target.value)} />
                    </label>
                    <button type="button" className={secondary} onClick={() => {
                      const name = medicationName.trim();
                      if (!name) return;
                      update({ medications: [...form.medications, { name }] });
                      setMedicationName("");
                    }}>Add</button>
                  </div>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === "vitals" ? (
            <Panel title="Vital Signs" required>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <VitalField label="Temperature" unit="°C" value={form.temperature_c} alert={abnormal("temp", form.temperature_c)} disabled={locked} onChange={(temperature_c) => update({ temperature_c })} />
                <VitalField label="Pulse" unit="/min" value={form.pulse} alert={abnormal("pulse", form.pulse)} disabled={locked} onChange={(pulse) => update({ pulse })} />
                <VitalField label="Respiratory rate" unit="/min" value={form.respiratory_rate} alert={abnormal("rr", form.respiratory_rate)} disabled={locked} onChange={(respiratory_rate) => update({ respiratory_rate })} />
                <label className="text-sm font-medium text-muted-strong">Blood pressure<span className="text-danger"> *</span>
                  <span className="mt-1 flex items-center gap-2">
                    <input className={field} value={form.blood_pressure} disabled={locked} placeholder="120/80" onChange={(event) => update({ blood_pressure: event.target.value })} />
                    <span className="shrink-0 text-xs text-muted">mmHg</span>
                  </span>
                </label>
                <VitalField label="SpO2" unit="%" value={form.spo2} alert={abnormal("spo2", form.spo2)} disabled={locked} onChange={(spo2) => update({ spo2 })} />
              </div>
            </Panel>
          ) : null}

          {tab === "examination" ? (
            <div className="space-y-4">
              <Panel title="Examination Findings" required>
                <textarea className={`${field} min-h-40`} disabled={locked} placeholder="Enter the examination findings" value={form.examination.findings} onChange={(event) => update({ examination: { ...form.examination, findings: event.target.value } })} />
              </Panel>
            </div>
          ) : null}

          {tab === "investigations" ? (
            <Panel
              title="Investigations"
              optional
              action={locked ? null : (
                <div className="flex min-w-[16rem] flex-1 items-end gap-2 sm:max-w-xl">
                  <label className="min-w-0 flex-1 text-sm font-medium text-muted-strong">Service
                    <SearchSelect
                      value={serviceId}
                      placeholder="Search investigation services"
                      options={services.map((service) => ({
                        value: service.id,
                        label: service.name,
                        hint: `${service.code} · ${service.unit} · ${servicePriceLabel(service, visit.patient_nationality)}`,
                        group: service.category,
                      }))}
                      onChange={setServiceId}
                    />
                  </label>
                  <button type="button" className={primary} onClick={() => {
                    const service = services.find((item) => item.id === serviceId);
                    if (!service || form.investigations.some((item) => item.service_id === service.id)) return;
                    update({
                      investigations: [...form.investigations, {
                        id: crypto.randomUUID(),
                        service_id: service.id,
                        name: service.name,
                        code: service.code,
                        unit: service.unit,
                        price: servicePriceAmount(service, visit.patient_nationality),
                        priority: "normal",
                      }],
                    });
                    setServiceId("");
                  }}>Add service</button>
                </div>
              )}
            >
              <p className="mb-3 text-sm text-muted">Investigation services for this clinic.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted">
                    <tr><th className="px-2 py-2">#</th><th className="px-2 py-2">Code</th><th className="px-2 py-2">Service</th><th className="px-2 py-2">Priority</th><th className="px-2 py-2">Unit</th><th className="px-2 py-2">Price</th><th className="px-2 py-2">Actions</th></tr>
                  </thead>
                  <tbody>
                    {form.investigations.length === 0 ? (
                      <tr><td className="px-2 py-6 text-muted" colSpan={7}>No services added yet.</td></tr>
                    ) : form.investigations.map((item, index) => (
                      <tr key={item.id} className="border-t border-line-soft">
                        <td className="px-2 py-2 text-muted">{index + 1}</td>
                        <td className="px-2 py-2 font-mono text-xs">{item.code || "—"}</td>
                        <td className="px-2 py-2 font-medium">{item.name}</td>
                        <td className="px-2 py-2">
                          <select
                            className={`rounded-lg border px-2 py-1.5 text-sm font-semibold disabled:opacity-80 ${priorityClass(item.priority)}`}
                            value={item.priority}
                            disabled={locked}
                            onChange={(event) => update({
                              investigations: form.investigations.map((row) => row.id === item.id ? { ...row, priority: event.target.value as typeof item.priority } : row),
                            })}
                          >
                            {investigationPriorities.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-muted">{item.unit || "—"}</td>
                        <td className="px-2 py-2">{listedServicePrice(services, item.service_id, item.price, visit.patient_nationality)}</td>
                        <td className="px-2 py-2">
                          {locked ? null : <RemoveButton onClick={() => update({ investigations: form.investigations.filter((row) => row.id !== item.id) })} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}

          {tab === "diagnosis" ? (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <Panel title="Provisional Diagnoses" required>
                <p className="mb-3 text-sm text-muted">Add every problem for this visit. The first one is the principal diagnosis sent to insurance.</p>
                <Icd10Picker
                  token={token}
                  locked={locked}
                  items={form.provisional_diagnoses}
                  legacy={form.provisional_diagnosis}
                  onChange={(items) => update({ provisional_diagnoses: items, provisional_diagnosis: items.length > 0 ? "" : form.provisional_diagnosis })}
                />
              </Panel>
              <InsuranceDiagnosis visit={visit} items={form.provisional_diagnoses} />
            </div>
          ) : null}

          {tab === "plan" ? (
            <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-2xl font-bold text-ink">Management Plan</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${locked ? "bg-panel text-blue" : "bg-surface-2 text-muted-strong"}`}>{locked ? "Finished" : "Draft"}</span>
              </div>
              <p className="mt-1 text-sm text-muted">Document medications, procedures and interventions, and advice for this encounter.</p>
              <div className="mt-4 flex gap-2 overflow-x-auto border-b border-line-soft">
                <PlanTabButton selected={planTab === "medications"} count={form.medication_orders.length} onClick={() => setPlanTab("medications")}>Medication Orders</PlanTabButton>
                <PlanTabButton selected={planTab === "procedures"} count={form.procedure_orders.length} onClick={() => setPlanTab("procedures")}>Procedures & Interventions</PlanTabButton>
                <PlanTabButton selected={planTab === "advice"} count={form.patient_advices.some((row) => row.text.trim()) ? 1 : 0} onClick={() => setPlanTab("advice")}>Patient Advices</PlanTabButton>
              </div>

              {planTab === "medications" ? (
                <div className="mt-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h4 className="text-base font-bold text-ink">Medication Orders <span className="text-xs font-medium text-muted">Optional</span></h4>
                      <p className="text-sm text-muted">Each order records the drug, dose, frequency, and duration. The route adds the administration charge.</p>
                    </div>
                    {locked ? null : (
                      <button type="button" className={primary} onClick={() => setOrderDialog(emptyOrder())}>+ Add Medication Order</button>
                    )}
                  </div>
                  {form.medication_orders.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
                      <p className="text-sm font-medium text-ink">No medication orders yet</p>
                      <p className="mt-1 text-sm text-muted">{locked ? "Nothing was prescribed in this encounter." : "Add an order to prescribe a medication for this visit."}</p>
                      {locked ? null : (
                        <button type="button" className={`${secondary} mt-4`} onClick={() => setOrderDialog(emptyOrder())}>Add the first order</button>
                      )}
                    </div>
                  ) : (
                    <ol className="mt-4 space-y-2">
                      {form.medication_orders.map((row, index) => (
                        <MedicationOrderRow
                          key={row.id}
                          row={row}
                          index={index}
                          locked={locked}
                          nationality={visit.patient_nationality}
                          charges={[
                            ...form.procedure_orders.filter((item) => item.linked_medication_order_id === row.id),
                            ...(() => {
                              const fluid = diluentCharge(row, catalog, visit.patient_nationality);
                              return fluid ? [fluid] : [];
                            })(),
                          ]}
                          planNotes={servicesForOrder(catalog, row).filter((service) => service.charge_once_per_plan).map((service) => service.name)}
                          invalid={showOrderErrors && hasOrderProblems(row, catalog)}
                          diluent={catalog.find((item) => item.id === row.diluent_medication_id)?.name ?? ""}
                          onEdit={() => setOrderDialog(row)}
                          onRemove={() => {
                            const medication_orders = form.medication_orders.filter((item) => item.id !== row.id);
                            update({ medication_orders, procedure_orders: reconcileProcedures(medication_orders, form.procedure_orders, catalog, visit.patient_nationality) });
                          }}
                        />
                      ))}
                    </ol>
                  )}
                  {form.medication_orders.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-surface-2 px-4 py-3">
                      <p className="text-sm text-muted-strong">Administration charges for {form.medication_orders.length} {form.medication_orders.length === 1 ? "order" : "orders"}</p>
                      <p className="text-base font-bold tabular-nums text-ink">
                        {chargesTotal(administrationCharges(form.medication_orders, form.procedure_orders, catalog, visit.patient_nationality), visit.patient_nationality)}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {planTab === "procedures" ? (
                <div className="mt-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h4 className="text-base font-bold text-ink">Procedures & Interventions <span className="text-xs font-medium text-muted">Optional</span></h4>
                      <p className="text-sm text-muted">Add a procedure for this visit, or review the ones added by a medication order.</p>
                    </div>
                    {locked ? null : (
                      <button type="button" className={primary} onClick={() => setProcedureDialog(emptyProcedure())}>+ Add Procedure</button>
                    )}
                  </div>
                  {form.procedure_orders.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
                      <p className="text-sm font-medium text-ink">No procedures yet</p>
                      <p className="mt-1 text-sm text-muted">{locked ? "Nothing was recorded for this encounter." : "Add a procedure, or choose a medication route that includes one."}</p>
                      {locked ? null : (
                        <button type="button" className={`${secondary} mt-4`} onClick={() => setProcedureDialog(emptyProcedure())}>Add the first procedure</button>
                      )}
                    </div>
                  ) : (
                    <ol className="mt-4 space-y-2">
                      {form.procedure_orders.map((item, index) => (
                        <ProcedureOrderRow
                          key={item.id}
                          item={item}
                          index={index}
                          locked={locked}
                          nationality={visit.patient_nationality}
                          source={form.medication_orders.find((order) => order.id === item.linked_medication_order_id)?.medication ?? ""}
                          onEdit={() => setProcedureDialog(item)}
                          onRemove={() => update({ procedure_orders: reconcileProcedures(form.medication_orders, form.procedure_orders.filter((row) => row.id !== item.id), catalog, visit.patient_nationality) })}
                        />
                      ))}
                    </ol>
                  )}
                  {form.procedure_orders.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-surface-2 px-4 py-3">
                      <p className="text-sm text-muted-strong">{form.procedure_orders.length} {form.procedure_orders.length === 1 ? "procedure" : "procedures"}</p>
                      <p className="text-base font-bold tabular-nums text-ink">{chargesTotal(form.procedure_orders, visit.patient_nationality)}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {planTab === "advice" ? (
                <div className="mt-4">
                  <h4 className="text-base font-bold text-ink">Patient Advices <span className="text-xs font-medium text-muted">Optional</span></h4>
                  <textarea
                    className={`${field} mt-3 min-h-40`}
                    disabled={locked}
                    value={form.patient_advices.map((item) => item.text).join("\n")}
                    placeholder="Write the advice for this patient"
                    onChange={(event) => {
                      const text = event.target.value;
                      update({
                        patient_advices: text.trim()
                          ? [{ id: form.patient_advices[0]?.id ?? crypto.randomUUID(), text }]
                          : [],
                      });
                    }}
                  />
                </div>
              ) : null}
            </section>
          ) : null}

          {locked ? null : (
            <div className="flex justify-end">
              <button type="button" className={primary} disabled={saving} onClick={() => void saveStep()}>
                {saving ? "Saving…" : `Save ${tabs.find((item) => item.id === tab)?.label ?? "step"}`}
              </button>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmFinish}
        title="Finish this encounter?"
        body="The visit leaves the doctor queue and the note can no longer be edited."
        confirmLabel="Finish Encounter & Send to Nurse"
        pending={saving}
        onCancel={() => setConfirmFinish(false)}
        onConfirm={() => void finish()}
      />
      {orderDialog && form && visit ? (
        <MedicationOrderDialog
          order={orderDialog}
          existing={form.medication_orders.some((row) => row.id === orderDialog.id)}
          locked={locked}
          catalog={catalog}
          nationality={visit.patient_nationality}
          planOrders={form.medication_orders}
          onClose={() => setOrderDialog(null)}
          onSave={(order) => {
            const exists = form.medication_orders.some((row) => row.id === order.id);
            const medication_orders = exists
              ? form.medication_orders.map((row) => row.id === order.id ? order : row)
              : [...form.medication_orders, order];
            update({ medication_orders, procedure_orders: reconcileProcedures(medication_orders, form.procedure_orders, catalog, visit.patient_nationality) });
            setOrderDialog(null);
            toast.success(exists ? "Order updated" : "Order added", `${order.medication} · ${prescriptionSummary(order)}`);
          }}
        />
      ) : null}
      {procedureDialog && form && visit ? (
        <ProcedureOrderDialog
          order={procedureDialog}
          existing={form.procedure_orders.some((row) => row.id === procedureDialog.id)}
          locked={locked}
          services={procedureServices}
          takenIds={form.procedure_orders.filter((row) => !row.linked_medication_order_id && row.id !== procedureDialog.id).map((row) => row.procedure_id).filter((id): id is string => Boolean(id))}
          source={form.medication_orders.find((order) => order.id === procedureDialog.linked_medication_order_id)?.medication ?? ""}
          nationality={visit.patient_nationality}
          onClose={() => setProcedureDialog(null)}
          onSave={(order) => {
            const exists = form.procedure_orders.some((row) => row.id === order.id);
            update({ procedure_orders: exists ? form.procedure_orders.map((row) => row.id === order.id ? order : row) : [...form.procedure_orders, order] });
            setProcedureDialog(null);
            toast.success(exists ? "Procedure updated" : "Procedure added", order.name);
          }}
        />
      ) : null}
    </Page>
  );
}

function normalize(encounter: ClinicalEncounter): ClinicalEncounter {
  return {
    ...encounter,
    past_history: encounter.past_history ?? "",
    medication_allergy_history: encounter.medication_allergy_history ?? "",
    examination: {
      ...encounter.examination,
      findings: encounter.examination?.findings ?? "",
    },
    investigations: (encounter.investigations ?? []).map((item) => ({
      id: item.id,
      service_id: item.service_id ?? null,
      name: item.name,
      code: item.code ?? "",
      unit: item.unit ?? "",
      price: item.price ?? null,
      priority: item.priority ?? "normal",
    })),
    provisional_diagnoses: encounter.provisional_diagnoses ?? [],
    medication_orders: (encounter.medication_orders ?? []).map((item) => {
      const parsedDuration = item.duration_value == null ? parseDuration(item.duration ?? "") : null;
      const duration_unit: MedicationOrder["duration_unit"] = parsedDuration?.unit ?? item.duration_unit;
      const duration_value = parsedDuration?.value ?? item.duration_value;
      const parsedDose = item.dose_value == null ? parseDose(item.dose ?? "") : null;
      const dose_unit: MedicationOrder["dose_unit"] = parsedDose?.unit ?? item.dose_unit ?? "";
      const dose_value = parsedDose?.value ?? item.dose_value;
      const parsedFlow = item.flow_rate_value == null ? parseFlowRate(item.flow_rate ?? "") : null;
      const flow_rate_unit: MedicationOrder["flow_rate_unit"] = parsedFlow?.unit ?? item.flow_rate_unit ?? "";
      const flow_rate_value = parsedFlow?.value ?? item.flow_rate_value ?? null;
      return {
        ...item,
        medication_id: item.medication_id ?? null,
        flow_rate_value,
        flow_rate_unit,
        flow_rate: flow_rate_value != null && flow_rate_unit ? flowRateText(flow_rate_value, flow_rate_unit) : item.flow_rate ?? "",
        diluent_medication_id: item.diluent_medication_id ?? null,
        diluent_volume_value: item.diluent_volume_value ?? null,
        infusion_duration_value: item.infusion_duration_value ?? null,
        infusion_input: item.infusion_input === "duration" ? "duration" : "rate",
        monitoring_duration_value: item.monitoring_duration_value ?? null,
        monitoring_duration_unit: item.monitoring_duration_unit || "",
        duration_value,
        duration_unit,
        duration: duration_value != null && duration_unit ? durationText(duration_value, duration_unit) : item.duration ?? "",
        dose_value,
        dose_unit,
        dose: dose_value != null && dose_unit ? doseText(dose_value, dose_unit) : item.dose ?? "",
      };
    }),
    procedure_orders: (encounter.procedure_orders ?? []).map((item) => ({
      ...item,
      procedure_id: item.procedure_id ?? null,
      code: item.code ?? "",
      unit: item.unit ?? "",
      price: item.price ?? null,
      quantity: item.quantity ?? 1,
      notes: item.notes ?? "",
      linked_medication_order_id: item.linked_medication_order_id ?? null,
      billing_scope: item.billing_scope === "plan" ? "plan" : "order",
    })),
    patient_advices: encounter.patient_advices ?? [],
  };
}

function emptyOrder(): MedicationOrder {
  return {
    id: crypto.randomUUID(),
    medication_id: null,
    route: "",
    medication: "",
    strength: "",
    dosage_form: "",
    dose: "",
    dose_value: null,
    dose_unit: "",
    frequency: "Once daily",
    duration: "",
    duration_value: null,
    duration_unit: "days",
    flow_rate: "",
    flow_rate_value: null,
    flow_rate_unit: "",
    diluent_medication_id: null,
    diluent_volume_value: null,
    infusion_duration_value: null,
    infusion_input: "rate",
    monitoring_duration_value: null,
    monitoring_duration_unit: "hours",
    instructions: "",
  };
}

function emptyProcedure(): ProcedureOrder {
  return {
    id: crypto.randomUUID(),
    procedure_id: null,
    name: "",
    code: "",
    unit: "",
    price: null,
    quantity: 1,
    notes: "",
    linked_medication_order_id: null,
    billing_scope: "order",
  };
}

function medicationOptions(catalog: CatalogMedication[], row: MedicationOrder) {
  const options = catalog.map((item) => ({
    value: item.id,
    label: item.name,
    hint: [item.strength, item.dosage_form, (item.routes?.map((entry) => entry.route) ?? [item.route]).join(", ")].filter((part) => part.trim()).join(" · "),
    group: item.dosage_form,
  }));
  if (row.medication && !options.some((item) => item.value === row.medication_id)) {
    options.unshift({ value: row.medication_id ?? row.id, label: row.medication, hint: "Saved on this order", group: "" });
  }
  return options;
}

function routeOptions(catalog: CatalogMedication[], row: MedicationOrder) {
  const item = catalog.find((entry) => entry.id === row.medication_id);
  const assigned = item?.routes?.map((entry) => entry.route) ?? (item?.route ? [item.route] : []);
  if (row.route && !assigned.includes(row.route)) return [row.route, ...assigned];
  return assigned;
}

function servicePriceAmount(service: { unit_price_egp?: number | null; unit_price_eur?: number | null }, nationality: string | null | undefined) {
  return nationality === "Egyptian" ? service.unit_price_egp ?? null : service.unit_price_eur ?? null;
}

function servicePriceLabel(service: { unit_price_egp?: number | null; unit_price_eur?: number | null }, nationality: string | null | undefined) {
  const amount = servicePriceAmount(service, nationality);
  if (amount == null) return "—";
  return `${nationality === "Egyptian" ? "EGP" : "EUR"} ${formatPrice(amount)}`;
}

function listedServicePrice(catalog: MedicalService[], serviceId: string | null, stored: number | null, nationality: string | null | undefined) {
  const service = catalog.find((item) => item.id === serviceId);
  if (service) return servicePriceLabel(service, nationality);
  return stored == null ? "—" : formatPrice(stored);
}

function reconcileProcedures(orders: MedicationOrder[], procedures: ProcedureOrder[], catalog: CatalogMedication[], nationality: string | null | undefined) {
  const manual = procedures.filter((item) => !item.linked_medication_order_id && item.billing_scope !== "plan");
  const linked: ProcedureOrder[] = [];
  const planServices = new Map<string, NonNullable<CatalogMedication["routes"]>[number]["services"][number]>();
  for (const order of orders) {
    if (!order.medication_id || !order.route) continue;
    const item = catalog.find((entry) => entry.id === order.medication_id);
    const services = item?.routes?.find((entry) => entry.route === order.route)?.services ?? [];
    for (const service of services) {
      if (service.charge_once_per_plan) {
        planServices.set(service.id, service);
        continue;
      }
      const quantity = quantityForLinkedService(order, service);
      const previous = procedures.find((entry) => entry.linked_medication_order_id === order.id && entry.procedure_id === service.id);
      linked.push({
        id: previous?.id ?? crypto.randomUUID(),
        procedure_id: service.id,
        name: service.name,
        code: service.code,
        unit: service.unit,
        price: servicePriceAmount(service, nationality),
        quantity,
        notes: previous?.notes ?? "",
        linked_medication_order_id: order.id,
        billing_scope: "order",
      });
    }
  }
  const plan: ProcedureOrder[] = [];
  for (const service of planServices.values()) {
    if (manual.some((item) => item.procedure_id === service.id)) continue;
    const previous = procedures.find((entry) => entry.billing_scope === "plan" && entry.procedure_id === service.id);
    plan.push({
      id: previous?.id ?? crypto.randomUUID(),
      procedure_id: service.id,
      name: service.name,
      code: service.code,
      unit: service.unit,
      price: servicePriceAmount(service, nationality),
      quantity: 1,
      notes: previous?.notes ?? "",
      linked_medication_order_id: null,
      billing_scope: "plan",
    });
  }
  return [...manual, ...plan, ...linked];
}

function quantityForLinkedService(order: MedicationOrder, service: { code: string; name: string; unit: string }) {
  if (isMonitoringService(service)) {
    const hours = monitoringHours(order.monitoring_duration_value, order.monitoring_duration_unit);
    return hours == null ? 1 : hours;
  }
  if (isHourlyService(service)) return administrationQuantity(order);
  if (isPerProcedure(service)) return 1;
  return administrationQuantity(order);
}

function isMonitoringService(service: { code: string; name: string }) {
  return service.code === "YRN-MP-006" || /monitor/i.test(service.name);
}

function isPerProcedure(service: { unit: string }) {
  return /per procedure/i.test(service.unit);
}

function isHourlyService(service: { name: string; unit: string }) {
  return /per hour/i.test(`${service.name} ${service.unit}`);
}

function monitoringHours(value: number | null, unit: string) {
  if (value == null || value <= 0) return null;
  const hours = unit === "minutes" ? value / 60 : value;
  return Math.round(hours * 10000) / 10000;
}

function administrationQuantity(order: Pick<MedicationOrder, "route" | "duration_value" | "duration_unit" | "dose_value" | "dose_unit" | "flow_rate_value" | "flow_rate_unit">) {
  if (order.route === "IV Infusion / Drip") {
    const fromRate = infusionHours(order);
    if (fromRate != null) return Math.max(1, Math.ceil(fromRate));
  }
  const hourly = order.route === "IV Infusion / Drip" || order.route === "Inhalation / Nebulization";
  if (!hourly || (order.duration_unit !== "minutes" && order.duration_unit !== "hours") || order.duration_value == null || order.duration_value <= 0) return 1;
  const hours = order.duration_unit === "minutes" ? order.duration_value / 60 : order.duration_value;
  return Math.max(1, Math.ceil(hours));
}

/** Hours needed to give the dose at the stated rate. Drops assume a 20-drop/mL giving set. */
function infusionHours(order: Pick<MedicationOrder, "dose_value" | "dose_unit" | "flow_rate_value" | "flow_rate_unit">) {
  const { dose_value: doseValue, dose_unit: doseUnit, flow_rate_value: flowValue, flow_rate_unit: flowUnit } = order;
  if (doseValue == null || doseValue <= 0 || flowValue == null || flowValue <= 0) return null;
  const perHour = flowUnit === "mL/hr" || flowUnit === "mg/hr" ? flowValue
    : flowUnit === "mL/min" || flowUnit === "mcg/min" ? flowValue * 60
    : flowUnit === "drops/min" ? (flowValue / 20) * 60
    : null;
  if (perHour == null || perHour <= 0) return null;
  const amount = doseUnit === "mL" && (flowUnit === "mL/hr" || flowUnit === "mL/min" || flowUnit === "drops/min") ? doseValue
    : doseUnit === "mg" && flowUnit === "mg/hr" ? doseValue
    : doseUnit === "g" && flowUnit === "mg/hr" ? doseValue * 1000
    : doseUnit === "mcg" && flowUnit === "mcg/min" ? doseValue
    : doseUnit === "mg" && flowUnit === "mcg/min" ? doseValue * 1000
    : null;
  return amount == null ? null : amount / perHour;
}

function infusionVolume(order: Pick<MedicationOrder, "diluent_volume_value" | "dose_value" | "dose_unit">) {
  if (order.diluent_volume_value != null && order.diluent_volume_value > 0) return order.diluent_volume_value;
  if (order.dose_unit === "mL" && order.dose_value != null && order.dose_value > 0) return order.dose_value;
  return null;
}

function volumeRatePerHour(value: number | null, unit: string) {
  if (value == null || value <= 0) return null;
  if (unit === "mL/hr") return value;
  if (unit === "mL/min") return value * 60;
  if (unit === "drops/min") return (value / 20) * 60;
  return null;
}

function syncInfusion(order: MedicationOrder, input: MedicationOrder["infusion_input"] = order.infusion_input): Partial<MedicationOrder> {
  const volume = infusionVolume(order);
  if (volume == null) return { infusion_input: input };
  if (input === "duration") {
    if (order.infusion_duration_value == null || order.infusion_duration_value <= 0) return { infusion_input: "duration" };
    const mlPerHour = Math.round((volume / order.infusion_duration_value) * 100) / 100;
    return {
      infusion_input: "duration",
      flow_rate_value: mlPerHour,
      flow_rate_unit: "mL/hr",
      flow_rate: flowRateText(mlPerHour, "mL/hr"),
    };
  }
  const perHour = volumeRatePerHour(order.flow_rate_value, order.flow_rate_unit || "mL/hr");
  if (perHour == null) return { infusion_input: "rate", infusion_duration_value: null };
  return { infusion_input: "rate", infusion_duration_value: Math.round((volume / perHour) * 100) / 100 };
}

function flowRateHint(order: MedicationOrder) {
  const hours = infusionHours(order);
  if (hours == null) {
    if (order.flow_rate_value != null && order.dose_value != null) return "This rate does not match the dose type.";
    return "Set a rate that matches the dose, such as mL with mL/hr.";
  }
  const drops = order.flow_rate_unit === "drops/min" ? " Drops are counted on a 20-drop/mL giving set." : "";
  return `Giving ${order.dose} at this rate takes ${Math.round(hours * 100) / 100} hours.${drops}`;
}

function doseText(value: number | null, unit: MedicationOrder["dose_unit"]) {
  if (value == null || !unit) return "";
  const counted = unit === "Ampule" || unit === "Vial" || unit === "Nebule" || unit === "Syringe";
  return counted && value !== 1 ? `${value} ${unit}s` : `${value} ${unit}`;
}

function parseDose(text: string): { value: number | null; unit: MedicationOrder["dose_unit"] } {
  const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*(mcg|mg|g|ml|mls|milliliters?|millilitres?|ampules?|ampoules?|vials?|nebules?|syringes?)$/i);
  if (!match) return { value: null, unit: "" };
  const value = Math.round(Number(match[1]) * 100) / 100;
  const word = match[2].toLowerCase();
  const unit: MedicationOrder["dose_unit"] = word === "mcg" ? "mcg"
    : word === "mg" ? "mg"
    : word === "g" ? "g"
    : word.startsWith("amp") ? "Ampule"
    : word.startsWith("vial") ? "Vial"
    : word.startsWith("neb") ? "Nebule"
    : word.startsWith("syr") ? "Syringe"
    : "mL";
  return { value, unit };
}

function defaultDose(strength: string, dosageForm: string): { value: number | null; unit: MedicationOrder["dose_unit"] } {
  const formUnit = dosageForm === "Ampule" ? "Ampule"
    : dosageForm === "Vial" ? "Vial"
    : dosageForm === "Nebule" ? "Nebule"
    : dosageForm === "Prefilled Syringe" ? "Syringe"
    : dosageForm === "Infusion Solution" ? "mL"
    : "";
  const text = strength.trim().toLowerCase().replace(/\s+/g, "");
  if (!text || text.includes("%")) return { value: formUnit === "mL" ? null : formUnit ? 1 : null, unit: formUnit || "mg" };
  const [firstText, secondText] = text.split("/");
  const first = firstText?.match(/^(\d+(?:\.\d+)?)(mcg|mg|g|ml)$/);
  const second = secondText?.match(/^(\d+(?:\.\d+)?)?(mcg|mg|g|ml)$/);
  if (!first) return { value: formUnit ? 1 : null, unit: formUnit || "mg" };
  const firstUnit = massUnit(first[2]);
  if (second && second[2] !== "ml" && first[2] !== "ml") return { value: 1, unit: formUnit || firstUnit };
  return { value: Number(first[1]), unit: firstUnit };
}

function massUnit(unit: string): MedicationOrder["dose_unit"] {
  if (unit === "mcg") return "mcg";
  if (unit === "g") return "g";
  if (unit === "ml") return "mL";
  return "mg";
}

function flowRateText(value: number | null, unit: MedicationOrder["flow_rate_unit"]) {
  if (value == null || !unit) return "";
  return `${value} ${unit}`;
}

function parseFlowRate(text: string): { value: number | null; unit: MedicationOrder["flow_rate_unit"] } {
  const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*(ml\s*\/\s*h(?:ou)?r|ml\s*\/\s*min|drops?\s*\/\s*min|gtt\s*\/\s*min|mg\s*\/\s*h(?:ou)?r|mcg\s*\/\s*min)$/i);
  if (!match) return { value: null, unit: "" };
  const word = match[2].toLowerCase().replace(/\s+/g, "");
  const unit: MedicationOrder["flow_rate_unit"] = word.startsWith("ml/h") ? "mL/hr"
    : word === "ml/min" ? "mL/min"
    : word.startsWith("drop") || word.startsWith("gtt") ? "drops/min"
    : word.startsWith("mg/h") ? "mg/hr"
    : "mcg/min";
  return { value: Math.round(Number(match[1]) * 100) / 100, unit };
}

function durationText(value: number | null, unit: MedicationOrder["duration_unit"]) {
  if (value == null || !unit) return "";
  const singular = unit.slice(0, -1);
  return value === 1 ? `1 ${singular}` : `${value} ${unit}`;
}

function parseDuration(text: string): { value: number | null; unit: MedicationOrder["duration_unit"] } {
  const match = text.trim().match(/^(\d+)\s*(minutes?|mins?|hours?|hrs?|days?)$/i);
  if (!match) return { value: null, unit: "" };
  const value = Number(match[1]);
  const word = match[2].toLowerCase();
  const unit: MedicationOrder["duration_unit"] = word.startsWith("min") ? "minutes" : word.startsWith("h") ? "hours" : "days";
  return { value, unit };
}

function chargeSummary(charge: ProcedureOrder, nationality: string | null | undefined) {
  const quantity = charge.quantity || 1;
  if (charge.price == null) return `— × ${formatQuantity(quantity)}`;
  const currency = nationality === "Egyptian" ? "EGP" : "EUR";
  const total = Math.round(charge.price * quantity * 100) / 100;
  return `${currency} ${formatPrice(charge.price)} × ${formatQuantity(quantity)} · ${currency} ${formatPrice(total)}`;
}

function formatQuantity(quantity: number) {
  return String(Math.round(quantity * 10000) / 10000);
}
function Icd10Picker({
  token,
  locked,
  items,
  legacy,
  onChange,
}: {
  token: string;
  locked: boolean;
  items: Icd10Code[];
  legacy: string;
  onChange: (items: Icd10Code[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Icd10Code[]>([]);
  const [searching, setSearching] = useState(false);
  const chosen = new Set(items.map((item) => item.code));
  const legacyNote = items.length === 0 && legacy.trim();

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api<{ items: Icd10Code[] }>(`/api/icd10?q=${encodeURIComponent(needle)}`, {}, token)
        .then((data) => {
          if (!cancelled) setResults(data.items);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, token]);

  function add(item: Icd10Code) {
    if (chosen.has(item.code)) return;
    onChange([...items, item]);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? <p className="text-sm text-muted">{locked ? "No ICD-10 codes were recorded." : "No problems added yet."}</p> : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={item.code} className={`rounded-xl border px-4 py-3 ${index === 0 ? "border-blue bg-panel" : "border-line bg-surface"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`text-xs font-semibold ${index === 0 ? "text-blue" : "text-muted"}`}>{index === 0 ? "Principal diagnosis" : `Additional problem ${index}`}</span>
                  <div className="mt-1">
                    <span className="inline-flex rounded-md bg-blue px-2 py-0.5 font-mono text-xs font-bold text-white">{item.code}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-5 text-ink">{item.title}</p>
                </div>
                {locked ? null : <RemoveButton onClick={() => onChange(items.filter((row) => row.code !== item.code))} />}
              </div>
              {locked || index === 0 ? null : (
                <div className="mt-3 flex justify-end">
                  <button type="button" className={`${secondary} h-7 px-2.5 py-0 text-xs`} onClick={() => onChange([item, ...items.filter((row) => row.code !== item.code)])}>Make principal</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {legacyNote ? (
        <p className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
          The saved note is not an ICD-10 code: “{legacyNote}”. Add a code for each problem to replace it.
        </p>
      ) : null}
      {locked ? null : (
        <div className="relative">
          <input
            className={field}
            value={query}
            placeholder="Search, for example J06.9 or sore throat"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query.trim().length >= 2 ? (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-[var(--menu-shadow)]">
              {searching && results.length === 0 ? <li className="px-3 py-2 text-sm text-muted">Searching ICD-10…</li> : null}
              {!searching && results.length === 0 ? <li className="px-3 py-2 text-sm text-muted">No ICD-10 codes match.</li> : null}
              {results.map((item) => (
                <li key={item.code}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-panel disabled:opacity-50"
                    disabled={chosen.has(item.code)}
                    onClick={() => add(item)}
                  >
                    <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-blue">{item.code}</span>
                    <span className="text-sm text-ink">{item.title}{chosen.has(item.code) ? " · Added" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}

function InsuranceDiagnosis({ visit, items }: { visit: EncounterRecord["visit"]; items: Icd10Code[] }) {
  const when = visit.triage_completed_at ? formatDay(visit.triage_completed_at) : null;
  const patientLine = [
    visit.patient_age_at_visit != null ? `${visit.patient_age_at_visit} years` : null,
    visit.patient_gender === "male" ? "Male" : visit.patient_gender === "female" ? "Female" : null,
    visit.patient_nationality,
  ].filter(Boolean).join(" · ");
  function printDiagnosis() {
    const popup = window.open("", "_blank", "width=720,height=900");
    if (!popup) return;
    const problems = items.map((item, index) => `
      <tr>
        <td class="code">${escapeHtml(item.code)}</td>
        <td>${index === 0 ? "Principal" : "Additional"}</td>
        <td>${escapeHtml(item.title)}</td>
      </tr>
    `).join("");
    popup.document.open();
    popup.document.write(`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Diagnosis ${escapeHtml(visit.patient_name)}</title>
          <style>
            body { margin: 24px; color: #12263a; font: 14px/1.45 Inter, ui-sans-serif, system-ui, sans-serif; }
            h1 { margin: 4px 0 0; font-size: 22px; }
            .eyebrow { margin: 0; color: #0f7f91; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #d0dbe1; padding: 8px 10px; text-align: left; vertical-align: top; }
            th { background: #f4f7f8; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; }
            .facts { margin-top: 16px; }
            .facts td { width: 50%; }
            .label { display: block; color: #6b7f8f; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
            .code { font-family: ui-monospace, monospace; font-weight: 700; white-space: nowrap; }
          </style>
        </head>
        <body>
          <p class="eyebrow">Yaren Healthcare</p>
          <h1>Full diagnosis</h1>
          <table class="facts">
            <tr>
              <td><span class="label">Patient</span>${escapeHtml(visit.patient_name)}<br />${escapeHtml(visit.patient_mrn)}${patientLine ? ` / ${escapeHtml(patientLine)}` : ""}</td>
              <td><span class="label">Clinic</span>${escapeHtml(visit.clinic_name)}<br />${escapeHtml(visit.hotel_name)}${visit.assigned_doctor_name ? ` / ${escapeHtml(visit.assigned_doctor_name)}` : ""}</td>
            </tr>
            <tr>
              <td colspan="2"><span class="label">Date of service</span>${when ? escapeHtml(`${when.day}, ${when.time}`) : "-"}</td>
            </tr>
          </table>
          <table>
            <thead><tr><th>Code</th><th>Type</th><th>Diagnosis</th></tr></thead>
            <tbody>${problems}</tbody>
          </table>
          <script>window.addEventListener("load", function () { window.focus(); window.print(); });</script>
        </body>
      </html>`);
    popup.document.close();
  }

  return (
    <aside className="rounded-2xl border border-line bg-surface p-4 shadow-card lg:sticky lg:top-24 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue">For insurance</p>
          <h3 className="mt-1 text-base font-bold text-ink">Full diagnosis</h3>
        </div>
        <button type="button" className={`${secondary} h-9 shrink-0 gap-1.5 px-3 py-0 text-sm`} disabled={items.length === 0} onClick={printDiagnosis}>
          <PrintIcon />
          Print
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted">This statement is what the doctor sends to the insurer.</p>
      <dl className="mt-4 space-y-2 border-t border-line-soft pt-4 text-sm">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Patient</dt>
          <dd className="font-semibold text-ink">{visit.patient_name}</dd>
          <dd className="font-mono text-xs text-muted">{visit.patient_mrn}{patientLine ? ` · ${patientLine}` : ""}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Clinic</dt>
          <dd className="font-semibold text-ink">{visit.clinic_name}</dd>
          <dd className="text-xs text-muted">{visit.hotel_name}{visit.assigned_doctor_name ? ` · ${visit.assigned_doctor_name}` : ""}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Date of service</dt>
          <dd className="font-semibold text-ink">{when ? `${when.day}, ${when.time}` : "—"}</dd>
        </div>
      </dl>
      {items.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-2 px-3 py-4 text-sm text-muted">Add a diagnosis to prepare the insurance statement.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {items.map((item, index) => (
            <li key={item.code} className="rounded-xl border border-line bg-surface-2 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-bold text-blue">{item.code}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${index === 0 ? "bg-blue text-white" : "bg-surface text-muted-strong"}`}>
                  {index === 0 ? "Principal" : "Additional"}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold leading-5 text-ink">{item.title}</p>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function Panel({ title, action, required, optional, children }: { title: string; action?: ReactNode; required?: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold text-ink">
          {title}
          {required ? <span className="text-danger"> *</span> : null}
          {optional ? <span className="ml-2 text-xs font-medium text-muted">Optional</span> : null}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function PlanTabButton({ selected, count, onClick, children }: { selected: boolean; count: number; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${selected ? "border-blue text-blue" : "border-transparent text-muted-strong"}`}>
      <span>{children}</span>
      <span className={`inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums ${selected ? "bg-panel text-blue" : "bg-surface-2 text-ink"}`}>{count}</span>
    </button>
  );
}

type OrderProblems = Partial<Record<"medication" | "route" | "dose" | "duration" | "infusion" | "monitoring", string>>;

function isHourlyRoute(route: string) {
  return route === "IV Infusion / Drip" || route === "Inhalation / Nebulization";
}

function durationRequired(row: MedicationOrder) {
  if (row.route === "IV Infusion / Drip") return false;
  return row.route === "Inhalation / Nebulization" || row.frequency !== "Once";
}

function servicesForOrder(catalog: CatalogMedication[], row: MedicationOrder) {
  const item = catalog.find((entry) => entry.id === row.medication_id);
  return item?.routes?.find((entry) => entry.route === row.route)?.services ?? [];
}

function administrationCharges(orders: MedicationOrder[], procedures: ProcedureOrder[], catalog: CatalogMedication[], nationality: string | null | undefined) {
  const sharedIds = new Set<string>();
  for (const order of orders) {
    for (const service of servicesForOrder(catalog, order)) {
      if (service.charge_once_per_plan) sharedIds.add(service.id);
    }
  }
  return procedures.filter((item) => Boolean(item.linked_medication_order_id) || item.billing_scope === "plan" || (item.procedure_id != null && sharedIds.has(item.procedure_id)))
    .concat(orders.flatMap((order) => {
      const fluid = diluentCharge(order, catalog, nationality);
      return fluid ? [fluid] : [];
    }));
}

function diluentCharge(order: MedicationOrder, catalog: CatalogMedication[], nationality: string | null | undefined): ProcedureOrder | null {
  if (order.route !== "IV Infusion / Drip" || !order.diluent_medication_id) return null;
  const item = catalog.find((entry) => entry.id === order.diluent_medication_id);
  if (!item) return null;
  return {
    id: `diluent:${order.id}`,
    procedure_id: null,
    name: [item.name, item.strength].filter((part) => part.trim()).join(" "),
    code: "",
    unit: item.dosage_form,
    price: servicePriceAmount(item, nationality),
    quantity: 1,
    notes: "",
    linked_medication_order_id: order.id,
    billing_scope: "order",
  };
}

function firstOrderForPlanService(orders: MedicationOrder[], catalog: CatalogMedication[], procedureId: string | null) {
  for (const order of orders) {
    if (servicesForOrder(catalog, order).some((service) => service.charge_once_per_plan && service.id === procedureId)) return order.id;
  }
  return null;
}

/** Strict checks are used in the dialog. The list check accepts an older order whose dose or duration is only free text. */
function orderProblems(row: MedicationOrder, strict = false, services: { code: string; name: string }[] = []): OrderProblems {
  const problems: OrderProblems = {};
  if (!row.medication.trim() || !row.medication_id) problems.medication = "Choose a medication.";
  if (!row.route) problems.route = "Choose a route.";
  const legacyDose = !strict && row.dose.trim().length > 0;
  if (!legacyDose) {
    if (row.dose_value == null && !row.dose_unit) problems.dose = "Enter the amount and choose the type.";
    else if (row.dose_value == null) problems.dose = "Enter the amount.";
    else if (!row.dose_unit) problems.dose = "Choose the type.";
  }
  const legacyDuration = !strict && row.duration.trim().length > 0;
  if (durationRequired(row) && row.duration_value == null && !legacyDuration) {
    problems.duration = row.route === "Inhalation / Nebulization" ? "Enter how long it runs. This sets the charge." : "Enter how long to continue it.";
  }
  if (row.route === "IV Infusion / Drip" && infusionVolume(row) != null && (row.infusion_duration_value == null || row.infusion_duration_value <= 0)) {
    problems.infusion = row.infusion_input === "duration" ? "Enter how long the infusion runs." : "Enter the infusion rate so the duration can be calculated.";
  }
  if (strict && services.some(isMonitoringService) && row.monitoring_duration_value == null) {
    problems.monitoring = "Enter how long the patient is monitored.";
  }
  return problems;
}

function hasOrderProblems(row: MedicationOrder, catalog: CatalogMedication[]) {
  return Object.keys(orderProblems(row, false, servicesForOrder(catalog, row))).length > 0;
}

function prescriptionSummary(row: MedicationOrder) {
  return [row.dose, row.route, row.frequency, row.duration ? `for ${row.duration}` : ""].filter((part) => part.trim()).join(" · ");
}

function chargesTotal(charges: ProcedureOrder[], nationality: string | null | undefined) {
  if (charges.length === 0 || charges.some((charge) => charge.price == null)) return "—";
  const currency = nationality === "Egyptian" ? "EGP" : "EUR";
  const total = charges.reduce((sum, charge) => sum + (charge.price ?? 0) * (charge.quantity || 1), 0);
  return `${currency} ${formatPrice(Math.round(total * 100) / 100)}`;
}

/** A number box with the unit attached on the right, drawn as one control. */
function AmountWithUnit({
  amount,
  unit,
  units,
  unitPlaceholder,
  amountLabel,
  unitLabel,
  placeholder,
  step,
  disabled,
  invalid,
  onAmount,
  onUnit,
}: {
  amount: number | null;
  unit: string;
  units: { value: string; label: string }[];
  unitPlaceholder?: string;
  amountLabel: string;
  unitLabel: string;
  placeholder: string;
  step: number | "any";
  disabled: boolean;
  invalid: boolean;
  onAmount: (raw: string) => void;
  onUnit: (value: string) => void;
}) {
  return (
    <span
      className={`mt-1 flex overflow-hidden rounded-lg border bg-surface transition focus-within:ring-2 ${
        invalid ? "border-danger focus-within:ring-danger/15" : "border-line-strong focus-within:border-blue focus-within:ring-blue/15"
      } ${disabled ? "bg-surface-3" : ""}`}
    >
      <input
        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted"
        aria-label={amountLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        inputMode={step === "any" ? "decimal" : "numeric"}
        min={step === "any" ? 0 : 1}
        placeholder={placeholder}
        step={step}
        type="number"
        value={amount ?? ""}
        onChange={(event) => onAmount(event.target.value.trim())}
      />
      <select
        className={`w-[7.5rem] shrink-0 border-l bg-surface-2 px-2 py-2.5 text-sm font-medium outline-none ${invalid ? "border-danger" : "border-line-strong"} ${unit ? "text-ink" : "text-muted"}`}
        aria-label={unitLabel}
        disabled={disabled}
        value={unit}
        onChange={(event) => onUnit(event.target.value)}
      >
        {unitPlaceholder ? <option value="">{unitPlaceholder}</option> : null}
        {units.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="mt-1 block text-xs font-medium text-danger" role="alert">{message}</span> : null;
}

function MedicationOrderRow({
  row,
  index,
  locked,
  nationality,
  charges,
  planNotes,
  diluent,
  invalid,
  onEdit,
  onRemove,
}: {
  row: MedicationOrder;
  index: number;
  locked: boolean;
  nationality: string | null | undefined;
  charges: ProcedureOrder[];
  planNotes: string[];
  diluent: string;
  invalid: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const identity = [row.strength, row.dosage_form].filter((part) => part.trim()).join(" · ");
  const summary = prescriptionSummary(row);
  const administration = [
    row.infusion_duration_value != null ? `Infusion ${row.infusion_duration_value} h` : "",
    row.flow_rate ? `at ${row.flow_rate}` : "",
    diluent ? `in ${diluent}${row.diluent_volume_value != null ? ` ${row.diluent_volume_value} mL` : ""}` : "",
    row.monitoring_duration_value != null ? `Monitor ${row.monitoring_duration_value} ${row.monitoring_duration_unit || "hours"}` : "",
  ].filter(Boolean).join(" · ");
  return (
    <li className={`rounded-xl border bg-surface transition ${invalid ? "border-danger" : "border-line hover:border-line-strong"}`}>
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <span className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${invalid ? "bg-danger-soft text-danger" : "bg-panel text-blue"}`}>{index + 1}</span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onEdit} aria-label={`${locked ? "View" : "Edit"} order ${index + 1}: ${row.medication}`}>
          <p className="truncate text-base font-semibold text-ink">
            {row.medication}
            {identity ? <span className="ml-2 text-sm font-normal text-muted-strong">{identity}</span> : null}
          </p>
          <p className="mt-0.5 text-sm text-muted-strong">{summary || "No dose recorded yet"}</p>
          {administration ? <p className="mt-0.5 text-xs text-muted">{administration}</p> : null}
          {planNotes.map((name) => <p key={name} className="mt-1 text-xs font-medium text-blue">{name} is charged once for this plan.</p>)}
          {row.instructions ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{row.instructions}</p> : null}
          {invalid ? <p className="mt-1 text-xs font-medium text-danger">Open this order to complete it.</p> : null}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className="text-right text-sm font-bold tabular-nums text-ink" title={charges.map((charge) => `${charge.name} ${chargeSummary(charge, nationality)}`).join("\n")}>
            {charges.length === 0 ? <span className="font-medium text-muted">No charge</span>
              : charges.some((charge) => charge.price == null) ? <span className="font-medium text-muted">Price not set</span>
              : chargesTotal(charges, nationality)}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className={`${secondary} h-9 px-3 py-0`} onClick={onEdit}>{locked ? "View" : "Edit"}</button>
            {locked ? null : <RemoveButton label="Remove order" onClick={onRemove} />}
          </div>
        </div>
      </div>
    </li>
  );
}

function MedicationOrderDialog({
  order,
  existing,
  locked,
  catalog,
  nationality,
  planOrders,
  onClose,
  onSave,
}: {
  order: MedicationOrder;
  existing: boolean;
  locked: boolean;
  catalog: CatalogMedication[];
  nationality: string | null | undefined;
  planOrders: MedicationOrder[];
  onClose: () => void;
  onSave: (order: MedicationOrder) => void;
}) {
  const [draft, setDraft] = useState<MedicationOrder>(order);
  const [attempted, setAttempted] = useState(false);
  const titleId = useId();
  const services = servicesForOrder(catalog, draft);
  const problems = attempted ? orderProblems(draft, true, services) : {};
  const infusion = draft.route === "IV Infusion / Drip";
  const monitors = services.some(isMonitoringService);
  const previewOrders = existing
    ? planOrders.map((item) => item.id === draft.id ? draft : item)
    : [...planOrders, draft];
  const reconciled = reconcileProcedures(previewOrders, [], catalog, nationality);
  const charges = [
    ...reconciled.filter((item) => item.linked_medication_order_id === draft.id || (item.billing_scope === "plan" && firstOrderForPlanService(previewOrders, catalog, item.procedure_id) === draft.id)),
    ...(() => {
      const fluid = diluentCharge(draft, catalog, nationality);
      return fluid ? [fluid] : [];
    })(),
  ];
  const alreadyCharged = reconciled.filter((item) => item.billing_scope === "plan" && services.some((service) => service.charge_once_per_plan && service.id === item.procedure_id) && firstOrderForPlanService(previewOrders, catalog, item.procedure_id) !== draft.id);
  const control = (problem?: string) => `${field} ${problem ? fieldInvalid : ""}`;
  const names = [...new Set(catalog.map((item) => item.name))].sort((left, right) => left.localeCompare(right));
  if (draft.medication && !names.includes(draft.medication)) names.unshift(draft.medication);
  const named = catalog.filter((item) => item.name === draft.medication);
  const strengths = [...new Set(named.map((item) => item.strength))];
  const forms = named.filter((item) => item.strength === draft.strength).map((item) => item.dosage_form);
  const uniqueForms = [...new Set(forms)];
  const product = catalog.find((item) => item.id === draft.medication_id);
  const diluents = catalog.filter((item) => item.is_diluent);
  const currency = nationality === "Egyptian" ? "EGP" : "EUR";
  const rateLocked = locked || draft.infusion_input === "duration";
  const durationLocked = locked || draft.infusion_input !== "duration";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function chooseProduct(item: CatalogMedication) {
    setDraft((current) => {
      const same = current.medication_id === item.id;
      const dose = same ? { value: current.dose_value, unit: current.dose_unit } : defaultDose(item.strength, item.dosage_form);
      const route = same ? current.route : item.routes?.[0]?.route ?? item.route;
      const next: MedicationOrder = {
        ...current,
        medication_id: item.id,
        medication: item.name,
        strength: item.strength,
        dosage_form: item.dosage_form,
        route,
        dose_value: dose.value,
        dose_unit: dose.unit,
        dose: doseText(dose.value, dose.unit),
        ...(route === "IV Infusion / Drip" ? {} : clearedAdministration),
      };
      return route === "IV Infusion / Drip" ? { ...next, ...syncInfusion(next) } : next;
    });
  }

  function submit(event: FormEvent) {
    if (locked) return;
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(orderProblems(draft, true, services)).length > 0) return;
    onSave(draft);
  }

  const monitoringBilled = monitoringHours(draft.monitoring_duration_value, draft.monitoring_duration_unit);

  return (
    <div className="triage-dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-shell/45 p-4" role="presentation" onMouseDown={onClose}>
      <form
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-surface shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        noValidate
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-ink">{locked ? "Medication Order" : existing ? "Edit Medication Order" : "New Medication Order"}</h2>
            <p className="mt-0.5 text-sm text-muted">{locked ? "This encounter is finished, so the order is read-only." : existing ? "Update this medication order for the patient" : "Add a new medication order for the patient"}</p>
          </div>
          <button type="button" className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted-strong transition hover:bg-surface-2 hover:text-ink" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-3">
            <section className="min-w-0 rounded-xl border border-line-soft p-4">
              <SectionHeading step="1" title="Medication Details" hint="Medication name, strength and form" />
              <label className={label}>Medication <span className="text-danger">*</span>
                <SearchSelect
                  fixedMenu
                  disabled={locked}
                  invalid={Boolean(problems.medication)}
                  value={draft.medication}
                  placeholder={catalog.length ? "Search by name" : "No medications yet"}
                  options={names.map((name) => ({ value: name, label: name }))}
                  onChange={(name) => {
                    const matches = catalog.filter((item) => item.name === name);
                    const onlyStrength = [...new Set(matches.map((item) => item.strength))];
                    if (matches.length === 1 || (onlyStrength.length === 1 && new Set(matches.map((item) => item.dosage_form)).size === 1)) {
                      const match = matches[0];
                      if (match) chooseProduct(match);
                      return;
                    }
                    setDraft((current) => ({
                      ...current,
                      medication: name,
                      strength: onlyStrength.length === 1 ? onlyStrength[0] : "",
                      dosage_form: "",
                      medication_id: null,
                      route: "",
                      ...clearedAdministration,
                    }));
                  }}
                />
                <FieldError message={problems.medication} />
              </label>
              <label className={`${label} mt-4`}>Strength <span className="text-danger">*</span>
                <select
                  className={field}
                  disabled={locked || strengths.length <= 1}
                  value={draft.strength}
                  onChange={(event) => {
                    const strength = event.target.value;
                    const matches = named.filter((item) => item.strength === strength);
                    if (matches.length === 1) chooseProduct(matches[0]);
                    else {
                      const formsForStrength = [...new Set(matches.map((item) => item.dosage_form))];
                      if (formsForStrength.length === 1 && matches[0]) chooseProduct(matches[0]);
                      else setDraft((current) => ({ ...current, strength, dosage_form: "", medication_id: null, route: "" }));
                    }
                  }}
                >
                  {strengths.length === 0 ? <option value="">Choose a medication</option> : null}
                  {strengths.map((strength) => <option key={strength || "none"} value={strength}>{strength || "No strength"}</option>)}
                </select>
              </label>
              <label className={`${label} mt-4`}>Dosage Form <span className="text-danger">*</span>
                <select
                  className={field}
                  disabled={locked || uniqueForms.length <= 1}
                  value={draft.dosage_form}
                  onChange={(event) => {
                    const dosageForm = event.target.value;
                    const match = named.find((item) => item.strength === draft.strength && item.dosage_form === dosageForm);
                    if (match) chooseProduct(match);
                  }}
                >
                  {uniqueForms.length === 0 ? <option value="">Choose a strength</option> : null}
                  {uniqueForms.map((form) => <option key={form} value={form}>{form}</option>)}
                </select>
              </label>
              {product ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[product.strength, product.dosage_form].filter((part) => part.trim()).map((part) => (
                    <span key={part} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted-strong">{part}</span>
                  ))}
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted-strong">
                    Drug price {servicePriceAmount(product, nationality) == null ? "—" : `${currency} ${formatPrice(servicePriceAmount(product, nationality) ?? 0)}`}
                  </span>
                </div>
              ) : null}
            </section>

            <section className="min-w-0 rounded-xl border border-line-soft p-4">
              <SectionHeading step="2" title="Prescription Details" hint="Dose, frequency and duration" />
              <div>
                <span className={label}>Prescribed Dose / Volume <span className="text-danger">*</span></span>
                <AmountWithUnit
                  amountLabel="Dose amount"
                  unitLabel="Dose type"
                  amount={draft.dose_value}
                  unit={draft.dose_unit}
                  units={doseUnits.map((unit) => ({ value: unit, label: unit }))}
                  unitPlaceholder="Type"
                  placeholder="Amount"
                  step="any"
                  disabled={locked}
                  invalid={Boolean(problems.dose)}
                  onAmount={(raw) => {
                    const amount = raw ? Number(raw) : null;
                    const dose_value = amount != null && Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
                    setDraft((current) => {
                      const dose_unit = current.dose_unit || "mg";
                      const next = { ...current, dose_value, dose_unit, dose: doseText(dose_value, dose_unit) };
                      return next.route === "IV Infusion / Drip" ? { ...next, ...syncInfusion(next) } : next;
                    });
                  }}
                  onUnit={(value) => {
                    const dose_unit = value as MedicationOrder["dose_unit"];
                    setDraft((current) => {
                      const next = { ...current, dose_unit, dose: doseText(current.dose_value, dose_unit) };
                      return next.route === "IV Infusion / Drip" ? { ...next, ...syncInfusion(next) } : next;
                    });
                  }}
                />
                <FieldError message={problems.dose} />
              </div>
              <label className={`${label} mt-4`}>Frequency <span className="text-danger">*</span>
                <select className={field} disabled={locked} value={draft.frequency} onChange={(event) => setDraft((current) => ({ ...current, frequency: event.target.value }))}>
                  {frequencies.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}
                </select>
              </label>
              <div className="mt-4">
                <span className={label}>Duration {durationRequired(draft) ? <span className="text-danger">*</span> : <span className="font-medium text-muted">(Optional)</span>}</span>
                <AmountWithUnit
                  amountLabel="Duration amount"
                  unitLabel="Duration unit"
                  amount={draft.duration_value}
                  unit={draft.duration_unit || "days"}
                  units={[{ value: "minutes", label: "Minute(s)" }, { value: "hours", label: "Hour(s)" }, { value: "days", label: "Day(s)" }]}
                  placeholder="Amount"
                  step={1}
                  disabled={locked}
                  invalid={Boolean(problems.duration)}
                  onAmount={(raw) => {
                    const amount = raw ? Number(raw) : null;
                    const duration_value = amount != null && Number.isInteger(amount) && amount > 0 ? amount : null;
                    setDraft((current) => {
                      const duration_unit = current.duration_unit || "days";
                      return { ...current, duration_value, duration_unit, duration: durationText(duration_value, duration_unit) };
                    });
                  }}
                  onUnit={(value) => {
                    const duration_unit = value as MedicationOrder["duration_unit"];
                    setDraft((current) => ({ ...current, duration_unit, duration: durationText(current.duration_value, duration_unit) }));
                  }}
                />
                <FieldError message={problems.duration} />
                {!problems.duration && draft.route === "Inhalation / Nebulization" ? <span className="mt-1 block text-xs text-muted">{draft.duration_unit === "days" ? "A duration in days is charged as one session." : "Charged per started hour."}</span> : null}
                {!problems.duration && infusion ? <span className="mt-1 block text-xs text-muted">This is the course of treatment. Infusion time is set on the right.</span> : null}
              </div>
              <label className={`${label} mt-4`}>Additional Instructions <span className="font-medium text-muted">(Optional)</span>
                <textarea className={`${field} min-h-24`} disabled={locked} maxLength={500} value={draft.instructions} placeholder="e.g. Give after meals, or as clinically indicated..." onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} />
              </label>
            </section>

            <section className="min-w-0 rounded-xl border border-line-soft p-4">
              <SectionHeading step="3" title="Administration Details" hint="Route, diluent, infusion and monitoring" />
              <label className={label}>Route of Administration <span className="text-danger">*</span>
                <select
                  className={control(problems.route)}
                  disabled={locked || !draft.medication_id}
                  value={draft.route}
                  onChange={(event) => {
                    const route = event.target.value;
                    setDraft((current) => {
                      const next = { ...current, route, ...(route === "IV Infusion / Drip" ? {} : clearedAdministration) };
                      return route === "IV Infusion / Drip" ? { ...next, ...syncInfusion(next) } : next;
                    });
                  }}
                >
                  <option value="">Choose a route</option>
                  {routeOptions(catalog, draft).map((route) => <option key={route} value={route}>{route}</option>)}
                </select>
                <FieldError message={problems.route} />
              </label>

              {infusion ? (
                <>
                  <label className={`${label} mt-4`}>Diluent Fluid <span className="font-medium text-muted">(Optional)</span>
                    <select
                      className={field}
                      disabled={locked}
                      value={draft.diluent_medication_id ?? ""}
                      onChange={(event) => setDraft((current) => ({ ...current, diluent_medication_id: event.target.value || null }))}
                    >
                      <option value="">Select diluent fluid</option>
                      {diluents.map((item) => (
                        <option key={item.id} value={item.id}>{[item.name, item.strength, item.dosage_form].filter((part) => part.trim()).join(" · ")}</option>
                      ))}
                    </select>
                    {draft.diluent_medication_id ? <span className="mt-1 block text-xs text-muted">This fluid is added to the order price.</span> : null}
                  </label>
                  <div className="mt-4">
                    <span className={label}>Diluent Volume <span className="font-medium text-muted">(Optional)</span></span>
                    <AmountWithUnit
                      amountLabel="Diluent volume"
                      unitLabel="Diluent volume unit"
                      amount={draft.diluent_volume_value}
                      unit="mL"
                      units={[{ value: "mL", label: "mL" }]}
                      placeholder="Volume"
                      step="any"
                      disabled={locked}
                      invalid={false}
                      onAmount={(raw) => {
                        const amount = raw ? Number(raw) : null;
                        const diluent_volume_value = amount != null && Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
                        setDraft((current) => {
                          const next = { ...current, diluent_volume_value };
                          return { ...next, ...syncInfusion(next) };
                        });
                      }}
                      onUnit={() => undefined}
                    />
                  </div>
                  <div className="mt-4 rounded-lg bg-panel px-3 py-2 text-xs text-ink">
                    <p className="font-semibold">Automatic Calculation Rule</p>
                    <p className="mt-0.5">The system will use the Diluent Volume if entered; otherwise it will use the Prescribed Volume to calculate the infusion duration and rate.</p>
                  </div>
                  <div className="mt-4">
                    <span className={label}>Infusion Duration {durationLocked ? null : <span className="text-danger">*</span>}</span>
                    <AmountWithUnit
                      amountLabel="Infusion duration"
                      unitLabel="Infusion duration unit"
                      amount={draft.infusion_duration_value}
                      unit="hours"
                      units={[{ value: "hours", label: "Hour(s)" }]}
                      placeholder="Hours"
                      step="any"
                      disabled={durationLocked}
                      invalid={Boolean(problems.infusion) && !durationLocked}
                      onAmount={(raw) => {
                        const amount = raw ? Number(raw) : null;
                        const infusion_duration_value = amount != null && Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
                        setDraft((current) => {
                          const next = { ...current, infusion_duration_value, infusion_input: "duration" as const };
                          return { ...next, ...syncInfusion(next, "duration") };
                        });
                      }}
                      onUnit={() => undefined}
                    />
                    {durationLocked ? <p className="mt-1 text-xs text-muted">Calculated automatically from selected volume and infusion rate.</p> : null}
                  </div>
                  <div className="my-2 flex justify-center">
                    <button
                      type="button"
                      className="inline-grid size-9 place-items-center rounded-lg border border-line-strong text-blue hover:bg-panel"
                      aria-label="Swap which value is calculated"
                      disabled={locked}
                      onClick={() => setDraft((current) => {
                        const infusion_input = current.infusion_input === "rate" ? "duration" as const : "rate" as const;
                        return { ...current, infusion_input, ...syncInfusion({ ...current, infusion_input }, infusion_input) };
                      })}
                    >
                      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M8 7V19M8 19l-3-3M8 19l3-3M16 17V5M16 5l-3 3M16 5l3 3" /></svg>
                    </button>
                  </div>
                  <div>
                    <span className={label}>Infusion Rate {rateLocked ? null : <span className="text-danger">*</span>}</span>
                    <AmountWithUnit
                      amountLabel="Infusion rate"
                      unitLabel="Infusion rate unit"
                      amount={draft.flow_rate_value}
                      unit={draft.flow_rate_unit}
                      units={flowRateUnits.map((unit) => ({ value: unit, label: unit }))}
                      unitPlaceholder="Unit"
                      placeholder="Rate"
                      step="any"
                      disabled={rateLocked}
                      invalid={Boolean(problems.infusion) && !rateLocked}
                      onAmount={(raw) => {
                        const amount = raw ? Number(raw) : null;
                        const flow_rate_value = amount != null && Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
                        setDraft((current) => {
                          const flow_rate_unit = current.flow_rate_unit || "mL/hr";
                          const next = { ...current, flow_rate_value, flow_rate_unit, flow_rate: flowRateText(flow_rate_value, flow_rate_unit), infusion_input: "rate" as const };
                          return { ...next, ...syncInfusion(next, "rate") };
                        });
                      }}
                      onUnit={(value) => {
                        const flow_rate_unit = value as MedicationOrder["flow_rate_unit"];
                        setDraft((current) => {
                          const next = { ...current, flow_rate_unit, flow_rate: flowRateText(current.flow_rate_value, flow_rate_unit), infusion_input: "rate" as const };
                          return { ...next, ...syncInfusion(next, "rate") };
                        });
                      }}
                    />
                    {rateLocked ? <p className="mt-1 text-xs text-muted">Calculated automatically from selected volume and infusion duration.</p> : null}
                  </div>
                  <FieldError message={problems.infusion} />
                  <p className="mt-1 text-xs text-muted">I.V. infusion is charged once for this order.</p>
                  {monitors ? (
                    <div className="mt-4">
                      <span className={label}>Monitoring Duration <span className="text-danger">*</span></span>
                      <AmountWithUnit
                        amountLabel="Monitoring duration"
                        unitLabel="Monitoring duration unit"
                        amount={draft.monitoring_duration_value}
                        unit={draft.monitoring_duration_unit || "hours"}
                        units={[{ value: "minutes", label: "Minute(s)" }, { value: "hours", label: "Hour(s)" }]}
                        placeholder="Time"
                        step="any"
                        disabled={locked}
                        invalid={Boolean(problems.monitoring)}
                        onAmount={(raw) => {
                          const amount = raw ? Number(raw) : null;
                          const monitoring_duration_value = amount != null && Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
                          setDraft((current) => ({ ...current, monitoring_duration_value, monitoring_duration_unit: current.monitoring_duration_unit || "hours" }));
                        }}
                        onUnit={(value) => setDraft((current) => ({ ...current, monitoring_duration_unit: value as MedicationOrder["monitoring_duration_unit"] }))}
                      />
                      <FieldError message={problems.monitoring} />
                      {monitoringBilled != null ? <p className="mt-1 text-xs text-muted">{formatQuantity(monitoringBilled)} {monitoringBilled === 1 ? "hour is" : "hours are"} charged at the hourly rate.</p> : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="mt-4 rounded-xl border border-line-soft bg-surface-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Administration charge</p>
                  {charges.length > 0 ? <p className="text-sm font-bold tabular-nums text-ink">{charges.some((charge) => charge.price == null) ? "Price not set" : chargesTotal(charges, nationality)}</p> : null}
                </div>
                {charges.length === 0 && alreadyCharged.length === 0 ? (
                  <p className="mt-1 text-sm text-muted">{draft.route ? "No administration charge for this route." : "Choose a route to see the charge."}</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {charges.map((charge) => (
                      <li key={charge.id} className="flex justify-between gap-2 text-sm text-muted-strong">
                        <span>{charge.name}</span>
                        <span className="tabular-nums">{chargeSummary(charge, nationality)}</span>
                      </li>
                    ))}
                    {alreadyCharged.map((charge) => (
                      <li key={charge.id} className="flex justify-between gap-2 text-sm text-muted-strong">
                        <span>{charge.name}</span>
                        <span>Already charged once for this plan</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line-soft px-5 py-4">
          <p className="min-w-0 flex-1 truncate text-sm text-muted-strong">
            {draft.medication ? <><span className="font-semibold text-ink">{draft.medication}</span> {prescriptionSummary(draft) ? ` · ${prescriptionSummary(draft)}` : ""}</> : "Nothing chosen yet"}
          </p>
          <div className="flex gap-2">
            <button type="button" className={secondary} onClick={onClose}>{locked ? "Close" : "Cancel"}</button>
            {locked ? null : <button type="submit" className={primary}>{existing ? "Save changes" : "Add Order"}</button>}
          </div>
        </div>
      </form>
    </div>
  );
}

function SectionHeading({ step, title, hint }: { step: string; title: string; hint: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-panel text-sm font-bold text-blue">{step}</span>
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="text-xs text-muted">{hint}</p>
      </div>
    </div>
  );
}

function hourlyProcedure(item: { name: string; unit: string }) {
  return /per hour/i.test(`${item.name} ${item.unit}`);
}

function ProcedureOrderRow({
  item,
  index,
  locked,
  nationality,
  source,
  onEdit,
  onRemove,
}: {
  item: ProcedureOrder;
  index: number;
  locked: boolean;
  nationality: string | null | undefined;
  source: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const linked = Boolean(item.linked_medication_order_id);
  const shared = item.billing_scope === "plan";
  const hours = hourlyProcedure(item);
  return (
    <li className="rounded-xl border border-line bg-surface transition hover:border-line-strong">
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-panel text-xs font-bold text-blue">{index + 1}</span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onEdit} aria-label={`${locked ? "View" : "Edit"} procedure ${index + 1}: ${item.name}`}>
          <p className="truncate text-base font-semibold text-ink">
            {item.name}
            <span className="ml-2 text-sm font-normal text-muted-strong">{item.code}</span>
          </p>
          <p className="mt-0.5 text-sm text-muted-strong">
            {hours ? `${formatQuantity(item.quantity)} ${item.quantity === 1 ? "hour" : "hours"}` : `Quantity ${formatQuantity(item.quantity)}`}
            {item.unit ? ` · ${item.unit}` : ""}
          </p>
          {shared ? <p className="mt-1 text-xs font-medium text-blue">Charged once for this plan</p> : null}
          {linked ? <p className="mt-1 text-xs font-medium text-blue">Added with {source || "a medication order"}</p> : null}
          {item.notes ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.notes}</p> : null}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <p className="text-right text-sm font-bold tabular-nums text-ink">
            {item.price == null ? <span className="font-medium text-muted">Price not set</span> : chargesTotal([item], nationality)}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className={`${secondary} h-9 px-3 py-0`} onClick={onEdit}>{locked ? "View" : "Edit"}</button>
            {locked || linked || shared ? null : <RemoveButton label="Remove procedure" onClick={onRemove} />}
          </div>
        </div>
      </div>
    </li>
  );
}

function ProcedureOrderDialog({
  order,
  existing,
  locked,
  services,
  takenIds,
  source,
  nationality,
  onClose,
  onSave,
}: {
  order: ProcedureOrder;
  existing: boolean;
  locked: boolean;
  services: MedicalService[];
  takenIds: string[];
  source: string;
  nationality: string | null | undefined;
  onClose: () => void;
  onSave: (order: ProcedureOrder) => void;
}) {
  const [draft, setDraft] = useState(order);
  const [attempted, setAttempted] = useState(false);
  const titleId = useId();
  const linked = Boolean(draft.linked_medication_order_id);
  const shared = draft.billing_scope === "plan";
  const hours = hourlyProcedure(draft);
  const duplicate = Boolean(draft.procedure_id && takenIds.includes(draft.procedure_id));
  const serviceError = attempted && !draft.procedure_id ? "Choose a procedure." : attempted && duplicate ? "This procedure is already on the visit. Edit that line instead." : "";
  const quantityError = !linked && !shared && attempted && (!Number.isInteger(draft.quantity) || draft.quantity < 1) ? `Enter the ${hours ? "hours" : "quantity"}.` : "";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    setAttempted(true);
    if (!draft.procedure_id || duplicate || (!linked && !shared && (!Number.isInteger(draft.quantity) || draft.quantity < 1))) return;
    onSave(draft);
  }

  return (
    <div className="triage-dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-shell/45 p-4" role="presentation" onMouseDown={onClose}>
      <form
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        noValidate
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-ink">{locked ? "Procedure" : existing ? "Edit procedure" : "New procedure"}</h2>
            <p className="mt-0.5 text-sm text-muted">{shared ? "Charged once for this plan. The quantity stays 1." : linked ? `Added with ${source || "a medication order"}. The quantity follows that order.` : "Choose the service and how many to charge."}</p>
          </div>
          <button type="button" className="inline-grid size-9 shrink-0 place-items-center rounded-lg text-muted-strong transition hover:bg-surface-2 hover:text-ink" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className={label}>Procedure <span className="text-danger">*</span>
            <SearchSelect
              fixedMenu
              disabled={locked || linked || shared}
              invalid={Boolean(serviceError)}
              value={draft.procedure_id ?? ""}
              placeholder={services.length ? "Search procedures and interventions" : "No procedures yet"}
              options={services.map((service) => ({
                value: service.id,
                label: service.name,
                hint: `${service.code} · ${service.unit} · ${servicePriceLabel(service, nationality)}`,
                group: service.category,
              }))}
              onChange={(procedureId) => {
                const service = services.find((item) => item.id === procedureId);
                if (!service) return;
                setDraft((current) => ({
                  ...current,
                  procedure_id: service.id,
                  name: service.name,
                  code: service.code,
                  unit: service.unit,
                  price: servicePriceAmount(service, nationality),
                }));
              }}
            />
            <FieldError message={serviceError} />
          </label>
          {draft.procedure_id ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[draft.code, draft.unit].filter((part) => part.trim()).map((part) => (
                <span key={part} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted-strong">{part}</span>
              ))}
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted-strong">
                Unit price {draft.price == null ? "—" : `${nationality === "Egyptian" ? "EGP" : "EUR"} ${formatPrice(draft.price)}`}
              </span>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 border-t border-line-soft pt-4 sm:grid-cols-2">
            <label className={label}>{hours ? "Hours" : "Quantity"} <span className="text-danger">*</span>
              <input
                className={`${field} ${quantityError ? fieldInvalid : ""}`}
                aria-label={hours ? "Hours" : "Quantity"}
                disabled={locked || linked || shared}
                inputMode="numeric"
                min={1}
                step={1}
                type="number"
                value={draft.quantity || ""}
                onChange={(event) => {
                  const amount = Number(event.target.value);
                  setDraft((current) => ({ ...current, quantity: Number.isInteger(amount) && amount > 0 ? amount : 0 }));
                }}
              />
              <FieldError message={quantityError} />
              {!quantityError && (linked || shared) ? <span className="mt-1 block text-xs text-muted">{shared ? "This is charged once for the plan." : "Change the medication order to change these hours."}</span> : null}
              {!quantityError && !linked && hours ? <span className="mt-1 block text-xs text-muted">Charged for each started hour.</span> : null}
            </label>

            <label className={`${label} sm:col-span-2`}>Note <span className="font-medium text-muted">Optional</span>
              <textarea
                className={`${field} min-h-20`}
                disabled={locked}
                maxLength={500}
                placeholder="e.g. Right arm, patient tolerated well"
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
          </div>

          <section className="mt-5 rounded-xl border border-line-soft bg-surface-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Charge</h3>
              <p className="text-base font-bold tabular-nums text-ink">
                {!draft.procedure_id ? "" : draft.price == null ? <span className="text-sm font-medium text-muted">Price not set</span> : chargesTotal([draft], nationality)}
              </p>
            </div>
            <p className="mt-1 text-sm text-muted">
              {!draft.procedure_id ? "Choose a procedure to see the charge."
                : draft.price == null ? `No ${nationality === "Egyptian" ? "EGP" : "EUR"} price is set for this service yet.`
                : `${nationality === "Egyptian" ? "EGP" : "EUR"} ${formatPrice(draft.price)} × ${formatQuantity(draft.quantity || 0)}`}
            </p>
          </section>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line-soft px-5 py-4">
          <p className="min-w-0 flex-1 truncate text-sm text-muted-strong">
            {draft.name ? <span className="font-semibold text-ink">{draft.name}</span> : "Nothing chosen yet"}
          </p>
          <div className="flex gap-2">
            <button type="button" className={secondary} onClick={onClose}>{locked ? "Close" : "Cancel"}</button>
            {locked ? null : <button type="submit" className={primary}>{existing ? "Save changes" : "Add procedure"}</button>}
          </div>
        </div>
      </form>
    </div>
  );
}

function ChangedMark() {
  return (
    <span className="grid h-4 w-4 place-items-center rounded-full bg-warning text-white" title="Unsaved changes">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M12 8v5" /><path d="M12 16h.01" /></svg>
      <span className="sr-only">Unsaved changes</span>
    </span>
  );
}

function SavedMark() {
  return (
    <span className="grid h-4 w-4 place-items-center rounded-full bg-success text-white" title="Saved">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7" /></svg>
      <span className="sr-only">Saved</span>
    </span>
  );
}

export function encounterStepSaved(visitId: string) {
  return readSavedState(visitId).steps.length > 0;
}

function savedStepsKey(visitId: string) {
  return `encounter-saved-steps:${visitId}`;
}

function isEncounterTab(value: unknown): value is EncounterTab {
  return tabs.some((tab) => tab.id === value);
}

function readSavedState(visitId: string): { steps: EncounterTab[]; snapshots: Partial<Record<EncounterTab, string>> } {
  try {
    const raw = localStorage.getItem(savedStepsKey(visitId));
    if (!raw) return { steps: [], snapshots: {} };
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return { steps: parsed.filter(isEncounterTab), snapshots: {} };
    if (!parsed || typeof parsed !== "object") return { steps: [], snapshots: {} };
    const record = parsed as { steps?: unknown; snapshots?: unknown };
    const steps = Array.isArray(record.steps) ? record.steps.filter(isEncounterTab) : [];
    const snapshots: Partial<Record<EncounterTab, string>> = {};
    if (record.snapshots && typeof record.snapshots === "object") {
      for (const tab of tabs) {
        const value = (record.snapshots as Record<string, unknown>)[tab.id];
        if (typeof value === "string") snapshots[tab.id] = value;
      }
    }
    return { steps, snapshots };
  } catch {
    return { steps: [], snapshots: {} };
  }
}

function writeSavedState(visitId: string, steps: EncounterTab[], snapshots: Partial<Record<EncounterTab, string>>) {
  localStorage.setItem(savedStepsKey(visitId), JSON.stringify({ steps, snapshots }));
}

function missingForStep(form: ClinicalEncounter, step: EncounterTab) {
  if (step === "history" && !form.chief_complaint.trim()) return "Enter the chief complaint.";
  if (step === "vitals") {
    if (form.temperature_c == null || Number.isNaN(form.temperature_c)) return "Enter the temperature.";
    if (form.pulse == null || Number.isNaN(form.pulse)) return "Enter the pulse.";
    if (form.respiratory_rate == null || Number.isNaN(form.respiratory_rate)) return "Enter the respiratory rate.";
    if (!/^\d{2,3}\/\d{2,3}$/.test(form.blood_pressure.trim())) return "Enter blood pressure as systolic/diastolic, for example 120/80.";
    if (form.spo2 == null || Number.isNaN(form.spo2)) return "Enter the oxygen saturation.";
  }
  if (step === "examination" && !form.examination.findings.trim()) return "Enter the examination findings.";
  if (step === "diagnosis" && form.provisional_diagnoses.length === 0) return "Add at least one ICD-10-CM diagnosis.";
  return null;
}

function stepSignature(form: ClinicalEncounter, step: EncounterTab) {
  if (step === "history") {
    return JSON.stringify({
      chief_complaint: form.chief_complaint,
      history_of_present_illness: form.history_of_present_illness,
      past_history: form.past_history,
      allergies: form.allergies,
      medications: form.medications,
    });
  }
  if (step === "vitals") {
    return JSON.stringify({
      temperature_c: form.temperature_c,
      pulse: form.pulse,
      respiratory_rate: form.respiratory_rate,
      blood_pressure: form.blood_pressure,
      spo2: form.spo2,
    });
  }
  if (step === "examination") return JSON.stringify(form.examination);
  if (step === "investigations") return JSON.stringify(form.investigations);
  if (step === "diagnosis") {
    return JSON.stringify({
      provisional_diagnoses: form.provisional_diagnoses,
      provisional_diagnosis: form.provisional_diagnosis,
    });
  }
  return JSON.stringify({
    medication_orders: form.medication_orders,
    procedure_orders: form.procedure_orders,
    patient_advices: form.patient_advices,
    management_plan: form.management_plan,
  });
}

function withoutIncompleteRows(form: ClinicalEncounter): ClinicalEncounter {
  return {
    ...form,
    medication_orders: form.medication_orders.filter((row) => row.medication.trim()),
    patient_advices: form.patient_advices.filter((row) => row.text.trim()),
  };
}

function VitalField({ label: name, unit, value, alert, disabled, onChange }: { label: string; unit: string; value: number | null; alert: boolean; disabled: boolean; onChange: (value: number | null) => void }) {
  return (
    <label className={`text-sm font-medium ${alert ? "text-danger" : "text-muted-strong"}`}>{name}<span className="text-danger"> *</span>
      <span className="mt-1 flex items-center gap-2">
        <input
          className={`${field} ${alert ? "border-danger text-danger" : ""}`}
          inputMode="decimal"
          disabled={disabled}
          value={value ?? ""}
          onChange={(event) => {
            const next = event.target.value.trim();
            onChange(next === "" ? null : Number(next));
          }}
        />
        <span className="shrink-0 text-xs text-muted">{unit}</span>
      </span>
    </label>
  );
}

function priorityClass(priority: "emergency" | "urgent" | "normal") {
  if (priority === "emergency") return "border-danger bg-danger-soft text-danger";
  if (priority === "urgent") return "border-warning bg-warning-soft text-warning";
  return "border-success bg-success-soft text-success";
}

function abnormal(kind: "temp" | "pulse" | "rr" | "spo2", raw: number | null) {
  if (raw == null || Number.isNaN(raw)) return false;
  if (kind === "temp") return raw >= 38;
  if (kind === "pulse") return raw >= 100;
  if (kind === "rr") return raw >= 22;
  return raw < 94;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
    </svg>
  );
}

function formatDay(value: string) {
  const date = new Date(value);
  return {
    day: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
}
