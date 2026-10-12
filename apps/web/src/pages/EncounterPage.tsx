import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  api,
  formatPrice,
  type CatalogMedication,
  type CatalogProcedure,
  type ClinicalEncounter,
  type EncounterRecord,
  type MedicalService,
  type MedicationOrder,
  type TriageCategory,
} from "../api";
import { useToast } from "../toast";
import { ConfirmDialog, Page, SearchSelect, field, messageOf, primary, secondary } from "./ui";

type EncounterTab = "info" | "history" | "vitals" | "examination" | "investigations" | "diagnosis" | "plan";
type PlanTab = "medications" | "procedures" | "advice";

const tabs: { id: EncounterTab; label: string }[] = [
  { id: "info", label: "Patient Info" },
  { id: "history", label: "History" },
  { id: "vitals", label: "Vital Signs" },
  { id: "examination", label: "Examination" },
  { id: "investigations", label: "Investigations" },
  { id: "diagnosis", label: "Diagnosis" },
  { id: "plan", label: "Management Plan" },
];

const routes = ["IV Infusion / Drip", "IM injection", "Oral", "SC injection", "Inhalation / Nebulization", "Topical"];
const dosageForms = ["Powder for injection", "Injection (ampoule)", "Injection (prefilled syringe)", "Tablet", "Nebule", "Ointment", "Capsule", "Syrup"];
const frequencies = ["Once", "Once daily", "Every 6 hours", "Every 8 hours", "Every 12 hours", "Three times daily", "As prescribed"];

const categoryLabel: Record<TriageCategory, string> = {
  emergency: "Emergency",
  urgent: "Urgent",
  normal: "Normal",
};

const cell = "w-full min-w-[6.5rem] rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-blue disabled:bg-surface-3";

export function EncounterPage({ token }: { token: string }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [record, setRecord] = useState<EncounterRecord | null>(null);
  const [form, setForm] = useState<ClinicalEncounter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [tab, setTab] = useState<EncounterTab>("info");
  const [planTab, setPlanTab] = useState<PlanTab>("medications");
  const [allergyName, setAllergyName] = useState("");
  const [allergyReaction, setAllergyReaction] = useState("");
  const [medicationName, setMedicationName] = useState("");
  const [services, setServices] = useState<MedicalService[]>([]);
  const [catalog, setCatalog] = useState<CatalogMedication[]>([]);
  const [procedures, setProcedures] = useState<CatalogProcedure[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [adviceText, setAdviceText] = useState("");

  useEffect(() => {
    api<EncounterRecord>(`/api/doctor-cases/${id}/encounter`, {}, token)
      .then((data) => {
        setRecord(data);
        setForm(normalize(data.encounter));
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
    api<{ items: CatalogProcedure[] }>("/api/surgical-procedures", {}, token)
      .then((data) => {
        if (!cancelled) setProcedures(data.items);
      })
      .catch(() => {
        if (!cancelled) setProcedures([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!visit?.clinic_id) return;
    let cancelled = false;
    api<{ items: MedicalService[] }>(`/api/services?clinic_id=${visit.clinic_id}`, {}, token)
      .then((data) => {
        if (!cancelled) setServices(data.items);
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visit?.clinic_id, token]);

  function update(patch: Partial<ClinicalEncounter>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  function readyToSave() {
    if (!form) return false;
    if (form.medication_orders.some((row) => !row.medication.trim())) {
      setTab("plan");
      setPlanTab("medications");
      setError("Enter a medication for each order, or remove the empty row.");
      return false;
    }
    if (form.procedure_orders.some((row) => !row.name.trim())) {
      setTab("plan");
      setPlanTab("procedures");
      setError("Enter a name for each procedure, or remove the empty row.");
      return false;
    }
    if (form.patient_advices.some((row) => !row.text.trim())) {
      setTab("plan");
      setPlanTab("advice");
      setError("Enter each piece of advice, or remove the empty row.");
      return false;
    }
    return true;
  }

  async function saveDraft() {
    if (!form || locked || !readyToSave()) return;
    setSaving(true);
    setError(null);
    try {
      const data = await api<EncounterRecord>(`/api/doctor-cases/${id}/encounter`, {
        method: "PUT",
        body: JSON.stringify(form),
      }, token);
      setRecord(data);
      setForm(normalize(data.encounter));
      toast.success("Draft saved", "You can come back to this encounter from the doctor queue.");
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
    setSaving(true);
    setError(null);
    try {
      await api<EncounterRecord>(`/api/doctor-cases/${id}/encounter/finish`, {
        method: "POST",
        body: JSON.stringify(form),
      }, token);
      toast.success("Encounter finished", `${visit?.patient_name ?? "The patient"} has been seen.`);
      navigate("/patients/to-doctor");
    } catch (caught) {
      setError(messageOf(caught));
      setConfirmFinish(false);
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(file: File) {
    const body = new FormData();
    body.set("file", file);
    setSaving(true);
    setError(null);
    try {
      const data = await api<EncounterRecord>(`/api/doctor-cases/${id}/encounter/files`, { method: "POST", body }, token);
      setRecord(data);
      toast.success("File added", file.name);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  }

  async function removeFile(fileId: string) {
    setSaving(true);
    setError(null);
    try {
      const data = await api<EncounterRecord>(`/api/doctor-cases/${id}/encounter/files/${fileId}`, { method: "DELETE" }, token);
      setRecord(data);
    } catch (caught) {
      setError(messageOf(caught));
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
          {locked ? null : (
            <button type="button" className={secondary} disabled={saving} onClick={() => void saveDraft()}>{saving ? "Saving…" : "Save as Draft"}</button>
          )}
          {visit ? <Link className={secondary} to={`/patients/${visit.patient_id}`}>View Full Profile</Link> : null}
          {locked ? null : (
            <button type="button" className={primary} disabled={saving} onClick={() => setConfirmFinish(true)}>Finish Encounter</button>
          )}
        </>
      ) : null}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {!form || !visit || !record ? <p className="text-sm text-muted">{error ? "" : "Loading encounter…"}</p> : (
        <div className="space-y-4">
          <section className="rounded-2xl bg-surface p-4 shadow-[0_8px_24px_rgba(16,42,67,0.06)] sm:p-5">
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
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${locked ? "bg-panel text-blue" : "bg-success-soft text-success"}`}>
                {locked ? "Seen" : "Active Visit"}
              </span>
            </div>
          </section>

          <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-2 shadow-[0_8px_24px_rgba(16,42,67,0.06)]" role="tablist">
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
              </button>
            ))}
          </div>

          {tab === "info" ? (
            <div className="grid items-start gap-4 lg:grid-cols-2">
                <Panel title="Triage Summary">
                  <SideLine label="Level" value={visit.triage_category ? categoryLabel[visit.triage_category] : "—"} />
                  <SideLine label="Nurse concern" value={visit.chief_complaint || "—"} />
                  <SideLine label="Nurse notes" value={visit.initial_assessment || "—"} />
                  {visit.completed_by_name ? <p className="text-xs text-muted">Recorded by {visit.completed_by_name}</p> : null}
                </Panel>
                <Panel title="Allergies">
                  <ul className="space-y-2">
                    {form.allergies.length === 0 ? <li className="text-sm text-muted">No allergies recorded.</li> : form.allergies.map((item, index) => (
                      <li key={`${item.name}-${index}`} className="flex items-start justify-between gap-2 text-sm">
                        <span><span className="font-semibold text-danger">{item.name}</span>{item.reaction ? <span className="text-muted"> ({item.reaction})</span> : null}</span>
                        {locked ? null : <button type="button" className="text-xs font-semibold text-muted hover:text-danger" onClick={() => update({ allergies: form.allergies.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>}
                      </li>
                    ))}
                  </ul>
                  {locked ? null : (
                    <div className="mt-3 space-y-2">
                      <input className={field} value={allergyName} placeholder="Allergy" onChange={(event) => setAllergyName(event.target.value)} />
                      <input className={field} value={allergyReaction} placeholder="Reaction" onChange={(event) => setAllergyReaction(event.target.value)} />
                      <button type="button" className={`${secondary} w-full`} onClick={() => {
                        const name = allergyName.trim();
                        if (!name) return;
                        update({ allergies: [...form.allergies, { name, reaction: allergyReaction.trim() || undefined }] });
                        setAllergyName("");
                        setAllergyReaction("");
                      }}>Add allergy</button>
                    </div>
                  )}
                </Panel>
                <Panel title="Current Medications">
                  <ul className="space-y-2">
                    {form.medications.length === 0 ? <li className="text-sm text-muted">No medications recorded.</li> : form.medications.map((item, index) => (
                      <li key={`${item.name}-${index}`} className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{item.name}</span>
                        {locked ? null : <button type="button" className="text-xs font-semibold text-muted hover:text-danger" onClick={() => update({ medications: form.medications.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>}
                      </li>
                    ))}
                  </ul>
                  {locked ? null : (
                    <div className="mt-3 flex gap-2">
                      <input className={field} value={medicationName} placeholder="Medication" onChange={(event) => setMedicationName(event.target.value)} />
                      <button type="button" className={`${secondary} shrink-0`} onClick={() => {
                        const name = medicationName.trim();
                        if (!name) return;
                        update({ medications: [...form.medications, { name }] });
                        setMedicationName("");
                      }}>Add</button>
                    </div>
                  )}
                </Panel>
                <Panel title="Documents & Images">
                  <ul className="space-y-2">
                    {record.files.length === 0 ? <li className="text-sm text-muted">0 files</li> : record.files.map((file) => (
                      <li key={file.id} className="flex items-center justify-between gap-2 text-sm">
                        {file.file_url ? <a className="min-w-0 truncate font-medium text-blue hover:underline" href={file.file_url} target="_blank" rel="noreferrer">{file.original_name}</a> : <span className="truncate">{file.original_name}</span>}
                        {locked ? null : <button type="button" className="shrink-0 text-xs font-semibold text-danger" onClick={() => void removeFile(file.id)}>Remove</button>}
                      </li>
                    ))}
                  </ul>
                  {locked ? null : (
                    <label className={`${secondary} mt-3 w-full cursor-pointer`}>
                      Add file
                      <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadFile(file);
                        event.currentTarget.value = "";
                      }} />
                    </label>
                  )}
                </Panel>
            </div>
          ) : null}

          {tab === "history" ? (
            <div className="space-y-4">
              <Panel title="Chief Complaint">
                <textarea className={`${field} min-h-28`} disabled={locked} value={form.chief_complaint} onChange={(event) => update({ chief_complaint: event.target.value })} />
              </Panel>
              <Panel title="History of Present Illness">
                <textarea className={`${field} min-h-36`} disabled={locked} value={form.history_of_present_illness} onChange={(event) => update({ history_of_present_illness: event.target.value })} />
              </Panel>
              <Panel title="Past Medical & Surgical History">
                <textarea className={`${field} min-h-36`} disabled={locked} value={form.past_history} onChange={(event) => update({ past_history: event.target.value })} />
              </Panel>
            </div>
          ) : null}

          {tab === "vitals" ? (
            <Panel title="Vital Signs">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <VitalField label="Temperature" unit="°C" value={form.temperature_c} alert={abnormal("temp", form.temperature_c)} disabled={locked} onChange={(temperature_c) => update({ temperature_c })} />
                <VitalField label="Pulse" unit="/min" value={form.pulse} alert={abnormal("pulse", form.pulse)} disabled={locked} onChange={(pulse) => update({ pulse })} />
                <VitalField label="Respiratory rate" unit="/min" value={form.respiratory_rate} alert={abnormal("rr", form.respiratory_rate)} disabled={locked} onChange={(respiratory_rate) => update({ respiratory_rate })} />
                <label className="text-sm font-medium text-muted-strong">Blood pressure
                  <span className="mt-1 flex items-center gap-2">
                    <input className={field} value={form.blood_pressure} disabled={locked} placeholder="120/80" onChange={(event) => update({ blood_pressure: event.target.value })} />
                    <span className="shrink-0 text-xs text-muted">mmHg</span>
                  </span>
                </label>
                <VitalField label="SpO2" unit="%" value={form.spo2} alert={abnormal("spo2", form.spo2)} disabled={locked} onChange={(spo2) => update({ spo2 })} />
                <VitalField label="Pain score" unit="/10" value={form.pain_score} alert={form.pain_score != null && form.pain_score >= 7} disabled={locked} onChange={(pain_score) => update({ pain_score })} />
              </div>
            </Panel>
          ) : null}

          {tab === "examination" ? (
            <div className="space-y-4">
              <Panel title="Examination Findings">
                <textarea className={`${field} min-h-40`} disabled={locked} placeholder="Enter the examination findings" value={form.examination.findings} onChange={(event) => update({ examination: { ...form.examination, findings: event.target.value } })} />
              </Panel>
            </div>
          ) : null}

          {tab === "investigations" ? (
            <Panel
              title="Investigations"
              action={locked ? null : (
                <div className="flex min-w-[16rem] flex-1 items-end gap-2 sm:max-w-xl">
                  <label className="min-w-0 flex-1 text-sm font-medium text-muted-strong">Service
                    <SearchSelect
                      value={serviceId}
                      placeholder="Choose from the price list"
                      options={services.map((service) => ({
                        value: service.id,
                        label: service.name,
                        hint: `${service.code} · ${service.unit} · ${formatPrice(service.price)}`,
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
                        price: service.price,
                      }],
                    });
                    setServiceId("");
                  }}>Add service</button>
                </div>
              )}
            >
              <p className="mb-3 text-sm text-muted">Services from this clinic’s price list.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted">
                    <tr><th className="px-2 py-2">#</th><th className="px-2 py-2">Code</th><th className="px-2 py-2">Service</th><th className="px-2 py-2">Unit</th><th className="px-2 py-2">Price</th><th className="px-2 py-2">Actions</th></tr>
                  </thead>
                  <tbody>
                    {form.investigations.length === 0 ? (
                      <tr><td className="px-2 py-6 text-muted" colSpan={6}>No services added yet.</td></tr>
                    ) : form.investigations.map((item, index) => (
                      <tr key={item.id} className="border-t border-line-soft">
                        <td className="px-2 py-2 text-muted">{index + 1}</td>
                        <td className="px-2 py-2 font-mono text-xs">{item.code || "—"}</td>
                        <td className="px-2 py-2 font-medium">{item.name}</td>
                        <td className="px-2 py-2 text-muted">{item.unit || "—"}</td>
                        <td className="px-2 py-2">{item.price == null ? "—" : formatPrice(item.price)}</td>
                        <td className="px-2 py-2">
                          {locked ? null : <button type="button" className="text-sm font-semibold text-danger" onClick={() => update({ investigations: form.investigations.filter((row) => row.id !== item.id) })}>Remove</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}

          {tab === "diagnosis" ? (
            <Panel title="Provisional Diagnosis">
              <textarea className={`${field} min-h-36`} disabled={locked} value={form.provisional_diagnosis} onChange={(event) => update({ provisional_diagnosis: event.target.value })} />
            </Panel>
          ) : null}

          {tab === "plan" ? (
            <section className="rounded-2xl bg-surface p-4 shadow-[0_8px_24px_rgba(16,42,67,0.06)] sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-2xl font-bold text-ink">Management Plan</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${locked ? "bg-panel text-blue" : "bg-surface-2 text-muted-strong"}`}>{locked ? "Finished" : "Draft"}</span>
              </div>
              <p className="mt-1 text-sm text-muted">Document the treatment plan, medications and required services for this encounter.</p>
              <div className="mt-4 flex gap-2 overflow-x-auto border-b border-line-soft">
                <PlanTabButton selected={planTab === "medications"} onClick={() => setPlanTab("medications")}>Medication Orders</PlanTabButton>
                <PlanTabButton selected={planTab === "procedures"} onClick={() => setPlanTab("procedures")}>Surgical Procedures</PlanTabButton>
                <PlanTabButton selected={planTab === "advice"} onClick={() => setPlanTab("advice")}>Patient Advices</PlanTabButton>
              </div>

              {planTab === "medications" ? (
                <div className="mt-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h4 className="text-base font-bold text-ink">Medication Orders</h4>
                      <p className="text-sm text-muted">Choose a medication from the list. Strength, form, and route fill in. Dose, frequency, and duration stay with this order.</p>
                    </div>
                    {locked ? null : (
                      <button type="button" className={primary} onClick={() => update({ medication_orders: [...form.medication_orders, emptyOrder()] })}>+ Add Medication Order</button>
                    )}
                  </div>
                  <OrderTable
                    headers={["#", "Route of Administration", "Medication (Active Ingredient)", "Strength", "Dosage Form", "Prescribed Dose", "Frequency", "Duration", "Instructions / Notes", "Actions"]}
                    empty="No medication orders yet."
                    rows={form.medication_orders}
                    render={(row, index) => (
                      <>
                        <td className="px-2 py-2 text-muted">{index + 1}</td>
                        <td className="px-2 py-2"><SelectCell disabled={locked} value={row.route} options={routes} onChange={(route) => patchOrder(form, update, row.id, { route })} /></td>
                        <td className="px-2 py-2 min-w-[14rem]">
                          <SearchSelect
                            fixedMenu
                            disabled={locked}
                            value={row.medication_id ?? (row.medication ? row.id : "")}
                            placeholder={catalog.length ? "Choose a medication" : "No medications yet"}
                            options={medicationOptions(catalog, row)}
                            onChange={(medicationId) => {
                              const item = catalog.find((entry) => entry.id === medicationId);
                              if (!item) return;
                              patchOrder(form, update, row.id, {
                                medication_id: item.id,
                                medication: item.name,
                                strength: item.strength,
                                dosage_form: item.dosage_form,
                                route: item.route,
                              });
                            }}
                          />
                        </td>
                        <td className="px-2 py-2"><input className={cell} disabled={locked} value={row.strength} onChange={(event) => patchOrder(form, update, row.id, { strength: event.target.value })} /></td>
                        <td className="px-2 py-2"><SelectCell disabled={locked} value={row.dosage_form} options={dosageForms} onChange={(dosage_form) => patchOrder(form, update, row.id, { dosage_form })} /></td>
                        <td className="px-2 py-2"><input className={cell} disabled={locked} value={row.dose} onChange={(event) => patchOrder(form, update, row.id, { dose: event.target.value })} /></td>
                        <td className="px-2 py-2"><SelectCell disabled={locked} value={row.frequency} options={frequencies} onChange={(frequency) => patchOrder(form, update, row.id, { frequency })} /></td>
                        <td className="px-2 py-2"><input className={cell} disabled={locked} value={row.duration} placeholder="5 days" onChange={(event) => patchOrder(form, update, row.id, { duration: event.target.value })} /></td>
                        <td className="px-2 py-2"><input className={`${cell} min-w-[12rem]`} disabled={locked} value={row.instructions} onChange={(event) => patchOrder(form, update, row.id, { instructions: event.target.value })} /></td>
                        <td className="px-2 py-2">
                          {locked ? null : (
                            <div className="flex gap-1">
                              <IconButton label="Copy order" onClick={() => update({ medication_orders: [...form.medication_orders, { ...row, id: crypto.randomUUID() }] })}><CopyIcon /></IconButton>
                              <IconButton label="Remove order" danger onClick={() => update({ medication_orders: form.medication_orders.filter((item) => item.id !== row.id) })}><TrashIcon /></IconButton>
                            </div>
                          )}
                        </td>
                      </>
                    )}
                  />
                </div>
              ) : null}

              {planTab === "procedures" ? (
                <div className="mt-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h4 className="text-base font-bold text-ink">Surgical Procedures</h4>
                      <p className="text-sm text-muted">Choose a procedure from the list. Notes stay with this encounter.</p>
                    </div>
                    {locked ? null : (
                      <button type="button" className={primary} onClick={() => update({ procedure_orders: [...form.procedure_orders, { id: crypto.randomUUID(), procedure_id: null, name: "", notes: "" }] })}>+ Add Procedure</button>
                    )}
                  </div>
                  <OrderTable
                    headers={["#", "Procedure", "Notes", "Actions"]}
                    empty="No procedures yet."
                    rows={form.procedure_orders}
                    render={(row, index) => (
                      <>
                        <td className="px-2 py-2 text-muted">{index + 1}</td>
                        <td className="min-w-[16rem] px-2 py-2">
                          <SearchSelect
                            fixedMenu
                            disabled={locked}
                            value={row.procedure_id ?? (row.name ? row.id : "")}
                            placeholder={procedures.length ? "Choose a procedure" : "No procedures yet"}
                            options={procedureOptions(procedures, row)}
                            onChange={(procedureId) => {
                              const item = procedures.find((entry) => entry.id === procedureId);
                              if (!item) return;
                              update({
                                procedure_orders: form.procedure_orders.map((order) => order.id === row.id ? { ...order, procedure_id: item.id, name: item.name } : order),
                              });
                            }}
                          />
                        </td>
                        <td className="px-2 py-2"><input className={`${cell} min-w-[16rem]`} disabled={locked} value={row.notes} onChange={(event) => update({ procedure_orders: form.procedure_orders.map((item) => item.id === row.id ? { ...item, notes: event.target.value } : item) })} /></td>
                        <td className="px-2 py-2">{locked ? null : <IconButton label="Remove procedure" danger onClick={() => update({ procedure_orders: form.procedure_orders.filter((item) => item.id !== row.id) })}><TrashIcon /></IconButton>}</td>
                      </>
                    )}
                  />
                </div>
              ) : null}

              {planTab === "advice" ? (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h4 className="text-base font-bold text-ink">Patient Advices</h4>
                      <p className="text-sm text-muted">Instructions the patient should follow after this visit.</p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {form.patient_advices.length === 0 ? <li className="text-sm text-muted">No advice yet.</li> : form.patient_advices.map((item, index) => (
                      <li key={item.id} className="flex items-center gap-2">
                        <span className="w-6 text-sm text-muted">{index + 1}</span>
                        <input className={cell} disabled={locked} value={item.text} onChange={(event) => update({ patient_advices: form.patient_advices.map((row) => row.id === item.id ? { ...row, text: event.target.value } : row) })} />
                        {locked ? null : <IconButton label="Remove advice" danger onClick={() => update({ patient_advices: form.patient_advices.filter((row) => row.id !== item.id) })}><TrashIcon /></IconButton>}
                      </li>
                    ))}
                  </ul>
                  {locked ? null : (
                    <div className="flex gap-2">
                      <input className={cell} value={adviceText} placeholder="Add advice" onChange={(event) => setAdviceText(event.target.value)} />
                      <button type="button" className={primary} onClick={() => {
                        const text = adviceText.trim();
                        if (!text) return;
                        update({ patient_advices: [...form.patient_advices, { id: crypto.randomUUID(), text }] });
                        setAdviceText("");
                      }}>Add</button>
                    </div>
                  )}
                  <label className="block text-sm font-medium text-muted-strong">Additional notes
                    <textarea className={`${field} min-h-28`} disabled={locked} value={form.management_plan} onChange={(event) => update({ management_plan: event.target.value })} />
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={confirmFinish}
        title="Finish this encounter?"
        body="The visit leaves the doctor queue and the note can no longer be edited. Chief complaint, provisional diagnosis, and a management plan are required."
        confirmLabel="Finish encounter"
        pending={saving}
        onCancel={() => setConfirmFinish(false)}
        onConfirm={() => void finish()}
      />
    </Page>
  );
}

function normalize(encounter: ClinicalEncounter): ClinicalEncounter {
  return {
    ...encounter,
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
    })),
    medication_orders: (encounter.medication_orders ?? []).map((item) => ({ ...item, medication_id: item.medication_id ?? null })),
    procedure_orders: (encounter.procedure_orders ?? []).map((item) => ({ ...item, procedure_id: item.procedure_id ?? null })),
    patient_advices: encounter.patient_advices ?? [],
  };
}

function emptyOrder(): MedicationOrder {
  return {
    id: crypto.randomUUID(),
    medication_id: null,
    route: "Oral",
    medication: "",
    strength: "",
    dosage_form: "Tablet",
    dose: "",
    frequency: "Once daily",
    duration: "",
    instructions: "",
  };
}

function procedureOptions(procedures: CatalogProcedure[], row: { id: string; procedure_id: string | null; name: string }) {
  const options = procedures.map((item) => ({
    value: item.id,
    label: item.name,
    hint: item.category,
    group: item.category,
  }));
  if (row.name && !options.some((item) => item.value === row.procedure_id)) {
    options.unshift({ value: row.procedure_id ?? row.id, label: row.name, hint: "Saved on this order", group: "" });
  }
  return options;
}

function medicationOptions(catalog: CatalogMedication[], row: MedicationOrder) {
  const options = catalog.map((item) => ({
    value: item.id,
    label: item.name,
    hint: `${item.strength} · ${item.dosage_form} · ${item.route}`,
    group: item.dosage_form,
  }));
  if (row.medication && !options.some((item) => item.value === row.medication_id)) {
    options.unshift({ value: row.medication_id ?? row.id, label: row.medication, hint: "Saved on this order", group: "" });
  }
  return options;
}

function patchOrder(form: ClinicalEncounter, update: (patch: Partial<ClinicalEncounter>) => void, id: string, patch: Partial<MedicationOrder>) {
  update({ medication_orders: form.medication_orders.map((row) => row.id === id ? { ...row, ...patch } : row) });
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-[0_8px_24px_rgba(16,42,67,0.06)] sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function PlanTabButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${selected ? "border-blue text-blue" : "border-transparent text-muted-strong"}`}>
      {children}
    </button>
  );
}

function OrderTable<T extends { id: string }>({ headers, rows, empty, render }: { headers: string[]; rows: T[]; empty: string; render: (row: T, index: number) => ReactNode }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[72rem] text-left text-sm">
        <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
          <tr>{headers.map((header) => <th key={header} className="px-2 py-2 font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="px-2 py-8 text-muted" colSpan={headers.length}>{empty}</td></tr>
          ) : rows.map((row, index) => (
            <tr key={row.id} className="border-t border-line-soft">{render(row, index)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SelectCell({ value, options, disabled, onChange }: { value: string; options: string[]; disabled: boolean; onChange: (value: string) => void }) {
  const known = options.includes(value) || value === "";
  return (
    <select className={cell} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select</option>
      {known ? null : <option value={value}>{value}</option>}
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function IconButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`grid h-8 w-8 place-items-center rounded-lg ${danger ? "text-danger hover:bg-danger-soft" : "text-muted-strong hover:bg-surface-2"}`}>
      {children}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M5 15V5h10" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 12h8l1-12" />
    </svg>
  );
}

function VitalField({ label: name, unit, value, alert, disabled, onChange }: { label: string; unit: string; value: number | null; alert: boolean; disabled: boolean; onChange: (value: number | null) => void }) {
  return (
    <label className={`text-sm font-medium ${alert ? "text-danger" : "text-muted-strong"}`}>{name}
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

function SideLine({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{name}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{value}</p>
    </div>
  );
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

function formatDay(value: string) {
  const date = new Date(value);
  return {
    day: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
}
