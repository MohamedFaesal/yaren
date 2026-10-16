import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  api,
  formatPrice,
  type CatalogMedication,
  type ClinicalEncounter,
  type DoctorCaseDetail,
  type EncounterRecord,
  type Icd10Code,
  type MedicalService,
  type MedicationOrder,
  type ProcedureOrder,
} from "../api";
import { useToast } from "../toast";
import { ConfirmDialog, Page, RemoveButton, SearchSelect, field, label, messageOf, primary, secondary } from "./ui";

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

const routes = ["IV Infusion / Drip", "IM injection", "Oral", "SC injection", "Inhalation / Nebulization", "Topical"];
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
const frequencies = ["Once", "Once daily", "Every 6 hours", "Every 8 hours", "Every 12 hours", "Three times daily", "As prescribed"];

const investigationPriorities = [
  { value: "emergency", label: "Emergency" },
  { value: "urgent", label: "Urgent" },
  { value: "normal", label: "Normal" },
] as const;

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
  const [tab, setTab] = useState<EncounterTab>("history");
  const [planTab, setPlanTab] = useState<PlanTab>("medications");
  const [allergyName, setAllergyName] = useState("");
  const [allergyReaction, setAllergyReaction] = useState("");
  const [medicationName, setMedicationName] = useState("");
  const [services, setServices] = useState<MedicalService[]>([]);
  const [procedureServices, setProcedureServices] = useState<MedicalService[]>([]);
  const [catalog, setCatalog] = useState<CatalogMedication[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [adviceText, setAdviceText] = useState("");
  const [triageOpen, setTriageOpen] = useState(false);
  const triageButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!triageOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setTriageOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [triageOpen]);

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
    api<{ items: MedicalService[] }>(`/api/services?clinic_id=${clinic}&service_type=${encodeURIComponent("Surgical Procedures Services")}`, {}, token)
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

  function readyToSave() {
    if (!form) return false;
    if (form.medication_orders.some((row) => !row.medication.trim())) {
      setTab("plan");
      setPlanTab("medications");
      setError("Enter a medication for each order, or remove the empty row.");
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

  function missingRequired(): { tab: EncounterTab; message: string } | null {
    if (!form) return null;
    if (!form.chief_complaint.trim()) return { tab: "history", message: "Enter the chief complaint." };
    if (form.temperature_c == null || Number.isNaN(form.temperature_c)) return { tab: "vitals", message: "Enter the temperature." };
    if (form.pulse == null || Number.isNaN(form.pulse)) return { tab: "vitals", message: "Enter the pulse." };
    if (form.respiratory_rate == null || Number.isNaN(form.respiratory_rate)) return { tab: "vitals", message: "Enter the respiratory rate." };
    if (!/^\d{2,3}\/\d{2,3}$/.test(form.blood_pressure.trim())) return { tab: "vitals", message: "Enter blood pressure as systolic/diastolic, for example 120/80." };
    if (form.spo2 == null || Number.isNaN(form.spo2)) return { tab: "vitals", message: "Enter the oxygen saturation." };
    if (!form.examination.findings.trim()) return { tab: "examination", message: "Enter the examination findings." };
    if (form.provisional_diagnoses.length === 0) return { tab: "diagnosis", message: "Add at least one ICD-10-CM diagnosis." };
    return null;
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
            <button type="button" className={primary} disabled={saving} onClick={requestFinish}>Finish Encounter</button>
          )}
        </>
      ) : null}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {!form || !visit || !record ? <p className="text-sm text-muted">{error ? "" : "Loading encounter…"}</p> : (
        <div className="space-y-4 pr-10">
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

          <button
            ref={triageButtonRef}
            type="button"
            aria-expanded={triageOpen}
            aria-controls="triage-summary"
            className={`fixed top-48 right-0 z-40 flex items-center gap-1.5 rounded-l-2xl bg-blue py-3 pr-1.5 pl-2 text-white shadow-card transition-transform duration-200 hover:-translate-x-1 hover:bg-blue-strong ${triageOpen ? "pointer-events-none invisible" : ""}`}
            onClick={() => setTriageOpen(true)}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 6 9 12l6 6" /></svg>
            <span className="text-[11px] font-semibold tracking-wide [writing-mode:vertical-lr]">Triage Summary</span>
            {triageHasAlert(visit) ? <span className="absolute -left-1 top-2 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-canvas" aria-hidden="true" /> : null}
            {triageHasAlert(visit) ? <span className="sr-only">Abnormal vital signs</span> : null}
          </button>
          {triageOpen ? <TriageSummary visit={visit} onClose={() => { setTriageOpen(false); triageButtonRef.current?.focus(); }} /> : null}

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
              <Panel title="Background" optional>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className={label}>Past medical and surgical history
                    <textarea className={`${field} min-h-32`} disabled={locked} value={form.past_history} onChange={(event) => update({ past_history: event.target.value })} />
                  </label>
                  <label className={label}>History of allergies to medications
                    <textarea className={`${field} min-h-32`} disabled={locked} value={form.medication_allergy_history} onChange={(event) => update({ medication_allergy_history: event.target.value })} />
                  </label>
                </div>
              </Panel>
              <div className="grid items-start gap-4 md:grid-cols-2">
                <Panel title="Allergies" optional>
                  {form.allergies.length === 0 ? <p className="text-sm text-muted">No allergies recorded.</p> : (
                    <ul className="grid gap-2">
                      {form.allergies.map((item, index) => (
                        <li key={`${item.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-line-soft bg-canvas px-3 py-2 text-sm">
                          <span className="min-w-0"><span className="font-semibold text-danger">{item.name}</span>{item.reaction ? <span className="text-muted"> · {item.reaction}</span> : null}</span>
                          {locked ? null : <RemoveButton onClick={() => update({ allergies: form.allergies.filter((_, itemIndex) => itemIndex !== index) })} />}
                        </li>
                      ))}
                    </ul>
                  )}
                  {locked ? null : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <label className={label}>Allergy
                        <input className={field} value={allergyName} placeholder="Penicillin" onChange={(event) => setAllergyName(event.target.value)} />
                      </label>
                      <label className={label}>Reaction
                        <input className={field} value={allergyReaction} placeholder="Rash" onChange={(event) => setAllergyReaction(event.target.value)} />
                      </label>
                      <button type="button" className={secondary} onClick={() => {
                        const name = allergyName.trim();
                        if (!name) return;
                        update({ allergies: [...form.allergies, { name, reaction: allergyReaction.trim() || undefined }] });
                        setAllergyName("");
                        setAllergyReaction("");
                      }}>Add</button>
                    </div>
                  )}
                </Panel>
                <Panel title="Current medications" optional>
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
              <Panel
                title="Documents and images"
                optional
                action={locked ? null : (
                  <label className={`${secondary} cursor-pointer`}>
                    Add file
                    <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadFile(file);
                      event.currentTarget.value = "";
                    }} />
                  </label>
                )}
              >
                {record.files.length === 0 ? <p className="text-sm text-muted">No documents yet.</p> : (
                  <ul className="grid gap-2">
                    {record.files.map((file) => (
                      <li key={file.id} className="flex items-center justify-between gap-2 rounded-lg border border-line-soft bg-canvas px-3 py-2 text-sm">
                        {file.file_url ? <a className="min-w-0 truncate font-medium text-blue hover:underline" href={file.file_url} target="_blank" rel="noreferrer">{file.original_name}</a> : <span className="truncate">{file.original_name}</span>}
                        {locked ? null : <RemoveButton onClick={() => void removeFile(file.id)} />}
                      </li>
                    ))}
                  </ul>
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
                        <td className="px-2 py-2">{item.price == null ? "—" : formatPrice(item.price)}</td>
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
              <p className="mt-1 text-sm text-muted">Document medications, surgical procedures, and advice for this encounter.</p>
              <div className="mt-4 flex gap-2 overflow-x-auto border-b border-line-soft">
                <PlanTabButton selected={planTab === "medications"} count={form.medication_orders.length} onClick={() => setPlanTab("medications")}>Medication Orders</PlanTabButton>
                <PlanTabButton selected={planTab === "procedures"} count={form.procedure_orders.length} onClick={() => setPlanTab("procedures")}>Surgical Procedures</PlanTabButton>
                <PlanTabButton selected={planTab === "advice"} count={form.patient_advices.length} onClick={() => setPlanTab("advice")}>Patient Advices</PlanTabButton>
              </div>

              {planTab === "medications" ? (
                <div className="mt-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h4 className="text-base font-bold text-ink">Medication Orders <span className="text-xs font-medium text-muted">Optional</span></h4>
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
                        <td className="px-2 py-2"><SelectCell disabled={locked} value={row.route} options={routeOptions(catalog, row)} onChange={(route) => applyOrder(form, update, catalog, row.id, { route })} /></td>
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
                              const route = item.routes?.[0]?.route ?? item.route;
                              applyOrder(form, update, catalog, row.id, {
                                medication_id: item.id,
                                medication: item.name,
                                strength: item.strength,
                                dosage_form: item.dosage_form,
                                route,
                              });
                            }}
                          />
                        </td>
                        <td className="px-2 py-2"><input className={cell} disabled={locked} value={row.strength} onChange={(event) => patchOrder(form, update, row.id, { strength: event.target.value })} /></td>
                        <td className="min-w-[12rem] px-2 py-2">
                          <SearchSelect
                            fixedMenu
                            disabled={locked}
                            value={row.dosage_form}
                            placeholder="Search dosage form"
                            options={dosageFormOptions(row.dosage_form)}
                            onChange={(dosage_form) => patchOrder(form, update, row.id, { dosage_form })}
                          />
                        </td>
                        <td className="px-2 py-2"><input className={cell} disabled={locked} value={row.dose} onChange={(event) => patchOrder(form, update, row.id, { dose: event.target.value })} /></td>
                        <td className="px-2 py-2"><SelectCell disabled={locked} value={row.frequency} options={frequencies} onChange={(frequency) => patchOrder(form, update, row.id, { frequency })} /></td>
                        <td className="px-2 py-2"><input className={cell} disabled={locked} value={row.duration} placeholder="5 days" onChange={(event) => patchOrder(form, update, row.id, { duration: event.target.value })} /></td>
                        <td className="px-2 py-2"><input className={`${cell} min-w-[12rem]`} disabled={locked} value={row.instructions} onChange={(event) => patchOrder(form, update, row.id, { instructions: event.target.value })} /></td>
                        <td className="px-2 py-2">
                          {locked ? null : (
                            <div className="flex gap-1">
                              <IconButton label="Copy order" onClick={() => {
                                const medication_orders = [...form.medication_orders, { ...row, id: crypto.randomUUID() }];
                                update({ medication_orders, procedure_orders: reconcileProcedures(medication_orders, form.procedure_orders, catalog) });
                              }}><CopyIcon /></IconButton>
                              <RemoveButton label="Remove order" onClick={() => {
                                const medication_orders = form.medication_orders.filter((item) => item.id !== row.id);
                                update({ medication_orders, procedure_orders: reconcileProcedures(medication_orders, form.procedure_orders, catalog) });
                              }} />
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
                      <h4 className="text-base font-bold text-ink">Surgical Procedures <span className="text-xs font-medium text-muted">Optional</span></h4>
                      <p className="text-sm text-muted">Choose a surgical procedure service for this clinic. Procedure services linked to a medication route are added here when that medication and route are chosen.</p>
                    </div>
                  </div>
                  {locked ? null : (
                    <div className="mt-3 flex min-w-[16rem] flex-1 items-end gap-2 sm:max-w-xl">
                      <label className="min-w-0 flex-1 text-sm font-medium text-muted-strong">Service
                        <SearchSelect
                          value={procedureId}
                          placeholder="Search surgical procedure services"
                          options={procedureServices.map((service) => ({
                            value: service.id,
                            label: service.name,
                            hint: `${service.service_type} · ${service.code} · ${service.unit} · ${formatPrice(service.price)}`,
                            group: service.category,
                          }))}
                          onChange={setProcedureId}
                        />
                      </label>
                      <button type="button" className={primary} onClick={() => {
                        const service = procedureServices.find((item) => item.id === procedureId);
                        if (!service || form.procedure_orders.some((item) => item.procedure_id === service.id)) return;
                        update({
                          procedure_orders: [...form.procedure_orders, {
                            id: crypto.randomUUID(),
                            procedure_id: service.id,
                            name: service.name,
                            code: service.code,
                            unit: service.unit,
                            price: service.price,
                            notes: "",
                          }],
                        });
                        setProcedureId("");
                      }}>Add surgical procedure</button>
                    </div>
                  )}
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-muted">
                        <tr><th className="px-2 py-2">#</th><th className="px-2 py-2">Code</th><th className="px-2 py-2">Surgical procedure</th><th className="px-2 py-2">Unit</th><th className="px-2 py-2">Price</th><th className="px-2 py-2">Notes</th><th className="px-2 py-2">Actions</th></tr>
                      </thead>
                      <tbody>
                        {form.procedure_orders.length === 0 ? (
                          <tr><td className="px-2 py-6 text-muted" colSpan={7}>No surgical procedures yet.</td></tr>
                        ) : form.procedure_orders.map((item, index) => (
                          <tr key={item.id} className="border-t border-line-soft">
                            <td className="px-2 py-2 text-muted">{index + 1}</td>
                            <td className="px-2 py-2 font-mono text-xs">{item.code || "—"}</td>
                            <td className="px-2 py-2 font-medium">{item.name}</td>
                            <td className="px-2 py-2 text-muted">{item.unit || "—"}</td>
                            <td className="px-2 py-2">{item.price == null ? "—" : formatPrice(item.price)}</td>
                            <td className="px-2 py-2"><input className={`${cell} min-w-[12rem]`} disabled={locked} value={item.notes} onChange={(event) => update({ procedure_orders: form.procedure_orders.map((row) => row.id === item.id ? { ...row, notes: event.target.value } : row) })} /></td>
                            <td className="px-2 py-2">{locked ? null : <RemoveButton label="Remove procedure" onClick={() => update({ procedure_orders: form.procedure_orders.filter((row) => row.id !== item.id) })} />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {planTab === "advice" ? (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h4 className="text-base font-bold text-ink">Patient Advices <span className="text-xs font-medium text-muted">Optional</span></h4>
                      <p className="text-sm text-muted">Instructions the patient should follow after this visit.</p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {form.patient_advices.length === 0 ? <li className="text-sm text-muted">No advice yet.</li> : form.patient_advices.map((item, index) => (
                      <li key={item.id} className="flex items-center gap-2">
                        <span className="w-6 text-sm text-muted">{index + 1}</span>
                        <input className={cell} disabled={locked} value={item.text} onChange={(event) => update({ patient_advices: form.patient_advices.map((row) => row.id === item.id ? { ...row, text: event.target.value } : row) })} />
                        {locked ? null : <RemoveButton label="Remove advice" onClick={() => update({ patient_advices: form.patient_advices.filter((row) => row.id !== item.id) })} />}
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
                  <label className="block text-sm font-medium text-muted-strong">Additional notes <span className="text-xs font-medium text-muted">Optional</span>
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
        body="The visit leaves the doctor queue and the note can no longer be edited."
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
    medication_orders: (encounter.medication_orders ?? []).map((item) => ({ ...item, medication_id: item.medication_id ?? null })),
    procedure_orders: (encounter.procedure_orders ?? []).map((item) => ({
      ...item,
      procedure_id: item.procedure_id ?? null,
      code: item.code ?? "",
      unit: item.unit ?? "",
      price: item.price ?? null,
      notes: item.notes ?? "",
      linked_medication_order_id: item.linked_medication_order_id ?? null,
    })),
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

function dosageFormOptions(current: string) {
  const options = dosageForms.map((item) => ({ value: item, label: item }));
  if (current && !dosageForms.includes(current)) options.unshift({ value: current, label: current });
  return options;
}

function medicationOptions(catalog: CatalogMedication[], row: MedicationOrder) {
  const options = catalog.map((item) => ({
    value: item.id,
    label: item.name,
    hint: `${item.strength} · ${item.dosage_form} · ${(item.routes?.map((entry) => entry.route) ?? [item.route]).join(", ")}`,
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

function applyOrder(
  form: ClinicalEncounter,
  update: (patch: Partial<ClinicalEncounter>) => void,
  catalog: CatalogMedication[],
  id: string,
  patch: Partial<MedicationOrder>,
) {
  const medication_orders = form.medication_orders.map((row) => row.id === id ? { ...row, ...patch } : row);
  update({
    medication_orders,
    procedure_orders: reconcileProcedures(medication_orders, form.procedure_orders, catalog),
  });
}

function routeOptions(catalog: CatalogMedication[], row: MedicationOrder) {
  const item = catalog.find((entry) => entry.id === row.medication_id);
  const assigned = item?.routes?.map((entry) => entry.route) ?? [];
  if (assigned.length === 0) return row.route && !routes.includes(row.route) ? [row.route, ...routes] : routes;
  return assigned.includes(row.route) ? assigned : [row.route, ...assigned].filter(Boolean);
}

function reconcileProcedures(orders: MedicationOrder[], procedures: ProcedureOrder[], catalog: CatalogMedication[]) {
  const needed = new Map<string, { id: string; name: string; code: string; unit: string; price: number | null }>();
  const neededByOrder = new Map<string, { id: string; name: string; code: string; unit: string; price: number | null }[]>();
  for (const order of orders) {
    const item = catalog.find((entry) => entry.id === order.medication_id);
    const services = item?.routes?.find((entry) => entry.route === order.route)?.services ?? [];
    neededByOrder.set(order.id, services);
    for (const service of services) needed.set(service.id, service);
  }
  const next = procedures.filter((item) => !item.linked_medication_order_id || (item.procedure_id != null && needed.has(item.procedure_id)));
  for (const [orderId, services] of neededByOrder) {
    for (const service of services) {
      if (next.some((item) => item.procedure_id === service.id)) continue;
      next.push({
        id: crypto.randomUUID(),
        procedure_id: service.id,
        name: service.name,
        code: service.code,
        unit: service.unit,
        price: service.price,
        notes: "",
        linked_medication_order_id: orderId,
      });
    }
  }
  return next;
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

function TriageSummary({ visit, onClose }: { visit: DoctorCaseDetail; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const history = triageHistory(visit);
  const category = visit.triage_category;
  const categoryTone = category === "emergency"
    ? "bg-danger-soft text-danger"
    : category === "urgent"
      ? "bg-warning-soft text-warning"
      : "bg-success-soft text-success";
  const completed = visit.triage_completed_at ? formatDay(visit.triage_completed_at) : null;
  const vitals = [
    { label: "Temp °C", value: visit.temperature_c == null || visit.temperature_c === "" ? "—" : String(visit.temperature_c), alert: abnormal("temp", numberOrNull(visit.temperature_c)) },
    { label: "Pulse", value: visit.pulse == null ? "—" : String(visit.pulse), alert: abnormal("pulse", visit.pulse) },
    { label: "RR", value: visit.respiratory_rate == null ? "—" : String(visit.respiratory_rate), alert: abnormal("rr", visit.respiratory_rate) },
    { label: "BP", value: visit.blood_pressure || "—", alert: false },
    { label: "SpO2", value: visit.spo2 == null ? "—" : `${visit.spo2}%`, alert: abnormal("spo2", visit.spo2) },
  ];
  const alertCount = vitals.filter((item) => item.alert).length;
  const complaint = visit.chief_complaint?.trim();
  const assessment = visit.initial_assessment?.trim();
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div className="triage-dialog-backdrop fixed inset-0 z-[60] flex justify-end bg-shell/45" role="presentation" onMouseDown={onClose}>
      <aside
        id="triage-summary"
        role="dialog"
        aria-modal="true"
        aria-label="Triage summary"
        className="triage-drawer flex h-full w-[min(26rem,100vw)] flex-col border-l border-line bg-surface shadow-card"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-ink">Triage summary</h3>
              {category ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${categoryTone}`}>{triageCategoryLabel[category]}</span> : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">
              {completed ? `${completed.day} · ${completed.time}` : "Not completed"}
              {visit.completed_by_name ? ` · ${visit.completed_by_name}` : ""}
            </p>
            {visit.assigned_doctor_name ? <p className="text-xs leading-5 text-muted">Assigned to {visit.assigned_doctor_name}</p> : null}
          </div>
          <button ref={closeRef} type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-strong hover:bg-surface-2" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {alertCount > 0 ? (
            <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
              {alertCount === 1 ? "1 vital sign is outside the usual range" : `${alertCount} vital signs are outside the usual range`}
            </p>
          ) : null}
          <dl className="grid grid-cols-3 gap-2">
            {vitals.map((item) => (
              <div key={item.label} className={`rounded-xl px-3 py-2 ${item.alert ? "bg-danger-soft" : "bg-canvas"}`}>
                <dt className={`text-[11px] font-semibold uppercase tracking-wide ${item.alert ? "text-danger" : "text-muted"}`}>{item.label}</dt>
                <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${item.alert ? "text-danger" : "text-ink"}`}>{item.value}</dd>
              </div>
            ))}
          </dl>
          <section className="mt-5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Chief complaint</h4>
            <p className={`mt-1 text-base ${complaint ? "font-semibold text-ink" : "text-muted"}`}>{complaint || "None recorded"}</p>
          </section>
          <section className="mt-4 border-t border-line-soft pt-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Initial assessment</h4>
            <p className={`mt-1 text-sm ${assessment ? "text-ink" : "text-muted"}`}>{assessment || "None recorded"}</p>
          </section>
          <SummaryChips title="Allergies" empty="No allergies recorded" items={visit.allergies.map((item) => ({ label: item.name, detail: item.reaction }))} />
          <SummaryChips title="Current medications" empty="No medications recorded" items={visit.medications.map((item) => ({ label: item.name }))} />
          <SummaryChips title="Relevant history" empty="No history recorded" items={history.map((item) => ({ label: item }))} />
        </div>
      </aside>
    </div>
  );
}

function SummaryChips({ title, empty, items }: { title: string; empty: string; items: { label: string; detail?: string }[] }) {
  const filled = items.filter((item) => item.label.trim());
  return (
    <section className="mt-4 border-t border-line-soft pt-4">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {filled.length === 0 ? <p className="mt-1 text-sm text-muted">{empty}</p> : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {filled.map((item) => (
            <li key={`${item.label}-${item.detail ?? ""}`} className="rounded-full bg-canvas px-3 py-1 text-sm text-ink">
              <span className="font-semibold">{item.label}</span>
              {item.detail?.trim() ? <span className="text-muted"> · {item.detail.trim()}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function triageHasAlert(visit: DoctorCaseDetail) {
  return abnormal("temp", numberOrNull(visit.temperature_c))
    || abnormal("pulse", visit.pulse)
    || abnormal("rr", visit.respiratory_rate)
    || abnormal("spo2", visit.spo2);
}

function triageHistory(visit: DoctorCaseDetail) {
  const history = (visit.relevant_history ?? []).filter((item) => item !== "other").map((item) => triageHistoryLabel[item] ?? item);
  for (const item of visit.relevant_history_items ?? []) {
    if (item.name?.trim()) history.push(item.name.trim());
  }
  const other = visit.relevant_history_other?.trim();
  if (other && !history.some((item) => item.toLowerCase() === other.toLowerCase())) history.push(other);
  return history;
}

function numberOrNull(value: number | string | null) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const triageCategoryLabel = { emergency: "Emergency", urgent: "Urgent", normal: "Normal" };
const triageHistoryLabel: Record<string, string> = {
  hypertension: "Hypertension",
  copd: "COPD",
  diabetes_mellitus: "Diabetes mellitus",
  immunosuppression: "Immunosuppression",
  asthma: "Asthma",
  hypothyroidism: "Hypothyroidism",
  cardiac_disease: "Cardiac disease",
};

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

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-9 w-9 place-items-center rounded-lg border border-line-strong bg-surface text-ink hover:bg-surface-2">
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
