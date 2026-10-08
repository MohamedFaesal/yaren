import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import {
  api,
  type TriageAllergy,
  type TriageCategory,
  type TriageDetail,
  type TriageMedication,
  type TriageQueueItem,
  type TriageQueueResult,
  type User,
  type VisitCareStatus,
} from "../api";
import { canAct } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { useToast } from "../toast";
import { field, label, messageOf, primary, secondary } from "./ui";

const historyOptions = [
  { value: "hypertension", label: "Hypertension" },
  { value: "copd", label: "COPD" },
  { value: "diabetes_mellitus", label: "Diabetes mellitus" },
  { value: "immunosuppression", label: "Immunosuppression" },
  { value: "asthma", label: "Asthma" },
  { value: "hypothyroidism", label: "Hypothyroidism" },
  { value: "cardiac_disease", label: "Cardiac disease" },
  { value: "other", label: "Other" },
] as const;

const pageSize = 10;

type FormState = {
  chief_complaint: string;
  temperature_c: string;
  pulse: string;
  respiratory_rate: string;
  spo2: string;
  allergies: TriageAllergy[];
  medications: TriageMedication[];
  relevant_history: string[];
  relevant_history_other: string;
  initial_assessment: string;
  triage_category: TriageCategory | "";
  assigned_doctor_id: string;
};

const emptyForm = (): FormState => ({
  chief_complaint: "",
  temperature_c: "",
  pulse: "",
  respiratory_rate: "",
  spo2: "",
  allergies: [],
  medications: [],
  relevant_history: [],
  relevant_history_other: "",
  initial_assessment: "",
  triage_category: "",
  assigned_doctor_id: "",
});

export function TriagePage({ token, actor }: { token: string; actor: User }) {
  const toast = useToast();
  const { clinicId } = useActiveClinic();
  const [queue, setQueue] = useState<TriageQueueResult>({
    items: [],
    total: 0,
    page: 1,
    page_size: pageSize,
    summary: { waiting_for_triage: 0, to_doctor: 0 },
  });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | VisitCareStatus>("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<TriageDetail | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [doctors, setDoctors] = useState<{ id: string; name: string }[]>([]);
  const [allergyDraft, setAllergyDraft] = useState({ name: "", reaction: "" });
  const [medicationDraft, setMedicationDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const requestId = useRef(0);
  const selected = detail?.visit ?? null;
  const canEdit = canAct(actor, "triage", "update", selected ? { ownerId: selected.patient_added_by, clinicId: selected.clinic_id } : undefined);
  const readonly = !canEdit || selected?.status === "to_doctor";
  const pages = Math.max(1, Math.ceil(queue.total / pageSize));
  const start = queue.total === 0 ? 0 : (queue.page - 1) * pageSize + 1;
  const end = Math.min(queue.page * pageSize, queue.total);

  useEffect(() => {
    if (query === search) return;
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    setPage(1);
  }, [clinicId, statusFilter]);

  useEffect(() => {
    const id = ++requestId.current;
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (clinicId) params.set("clinic_id", clinicId);
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("q", search);
    setLoading(true);
    setError(null);
    api<TriageQueueResult>(`/api/triage/queue?${params}`, {}, token)
      .then((data) => {
        if (id !== requestId.current) return;
        setQueue(data);
        setPage(data.page);
      })
      .catch((caught) => {
        if (id === requestId.current) setError(messageOf(caught));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [token, clinicId, statusFilter, search, page]);

  useEffect(() => {
    if (!selectedKey) {
      setDetail(null);
      setForm(emptyForm());
      return;
    }
    const [patientId, visitId] = selectedKey.split(":");
    if (!patientId || !visitId) return;
    let cancelled = false;
    setDetailLoading(true);
    api<TriageDetail>(`/api/patients/${patientId}/visits/${visitId}/triage`, {}, token)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setForm(formFromTriage(data));
        if (window.matchMedia("(max-width: 767px)").matches) {
          window.scrollTo({ top: 0, behavior: "auto" });
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(messageOf(caught));
          setSelectedKey(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKey, token]);

  useEffect(() => {
    const targetClinic = selected?.clinic_id || clinicId;
    if (!targetClinic) {
      setDoctors([]);
      return;
    }
    let cancelled = false;
    api<{ items: { id: string; name: string }[] }>(`/api/clinics/${targetClinic}/doctors`, {}, token)
      .then((data) => {
        if (!cancelled) setDoctors(data.items);
      })
      .catch(() => {
        if (!cancelled) setDoctors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selected?.clinic_id, clinicId]);

  const doctorOptions = useMemo(
    () => [{ value: "", label: "Select doctor" }, ...doctors.map((item) => ({ value: item.id, label: item.name }))],
    [doctors],
  );

  const keyPoints = useMemo(() => buildKeyPoints(form), [form]);

  async function refreshQueue() {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (clinicId) params.set("clinic_id", clinicId);
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("q", search);
    const data = await api<TriageQueueResult>(`/api/triage/queue?${params}`, {}, token);
    setQueue(data);
  }

  async function sendToDoctor(event: FormEvent) {
    event.preventDefault();
    if (!selected || readonly) return;
    const missing = validateRequired(form);
    if (missing) {
      setError(missing);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await api<TriageDetail>(
        `/api/patients/${selected.patient_id}/visits/${selected.id}/triage/complete`,
        { method: "POST", body: JSON.stringify(payloadFromForm(form)) },
        token,
      );
      setDetail(data);
      setForm(formFromTriage(data));
      toast.success("Sent to doctor", `${selected.patient_name} is now waiting to see the doctor.`);
      await refreshQueue();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  }

  function selectVisit(item: TriageQueueItem) {
    setError(null);
    setSelectedKey(itemKey(item));
  }

  function closeAssessment() {
    setSelectedKey(null);
    setDetail(null);
    setForm(emptyForm());
    setError(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  useEffect(() => {
    if (!selectedKey) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeAssessment();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedKey]);

  return (
    <section className="space-y-4">
      {!selectedKey ? (
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Patient Queue & Triage</h1>
          <p className="mt-1 text-sm text-muted-strong">Choose a patient, complete triage, then send them to a doctor.</p>
        </header>
      ) : null}

      {error ? <p className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p> : null}

      <div className={`grid gap-3 sm:grid-cols-2 ${selectedKey ? "max-lg:hidden" : ""}`}>
        <SummaryTile
          label="Waiting for Triage"
          value={queue.summary.waiting_for_triage}
          active={statusFilter === "waiting_for_triage"}
          tone="waiting"
          icon={<WaitingIcon />}
          onClick={() => setStatusFilter((current) => (current === "waiting_for_triage" ? "" : "waiting_for_triage"))}
        />
        <SummaryTile
          label="To See the Doctor"
          value={queue.summary.to_doctor}
          active={statusFilter === "to_doctor"}
          tone="doctor"
          icon={<DoctorIcon />}
          onClick={() => setStatusFilter((current) => (current === "to_doctor" ? "" : "to_doctor"))}
        />
      </div>

      <div className={`grid items-start gap-5 ${selectedKey ? "lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)_16rem]" : ""}`}>
        <div className={`min-w-0 rounded-2xl bg-surface p-4 shadow-[0_8px_24px_rgba(16,42,67,0.06)] ${selectedKey ? "max-lg:hidden" : ""}`}>
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-panel text-blue"><QueueIcon /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-ink">Patient queue</h2>
              <p className="text-xs text-muted">{loading ? "Loading" : `${queue.total} visit${queue.total === 1 ? "" : "s"}`}</p>
            </div>
          </div>
          <label className="relative mb-3 block">
            <span className="sr-only">Search queue</span>
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" />
              <path d="M13.5 13.5L17 17" strokeLinecap="round" />
            </svg>
            <input
              className={`${field} pl-9`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, MRN or room"
            />
          </label>

          <div className="space-y-2">
            {queue.items.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted">{loading ? "Loading queue…" : "No patients match this queue."}</p>
            ) : (
              queue.items.map((item) => {
                const active = selectedKey === itemKey(item);
                const elapsed = elapsedMinutes(item.created_at);
                const waiting = item.status === "waiting_for_triage" && !item.triage_id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectVisit(item)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${active ? "border-blue bg-panel" : "border-line-soft bg-surface hover:border-line hover:bg-surface-2"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{item.patient_name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted">{item.patient_mrn} · Room {item.hotel_room_no || "—"}</p>
                      </div>
                      <StatusBadge status={item.status} compact />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className={`font-semibold ${elapsed >= 20 ? "text-danger" : "text-muted"}`}>
                        {formatTime(item.created_at)} · {elapsedLabel(elapsed)}
                      </span>
                      <span className="font-semibold text-blue">{waiting ? "Start" : "View"}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted">
            <p>{queue.total === 0 ? "0 shown" : `${start}–${end} of ${queue.total}`}</p>
            <div className="flex items-center gap-1">
              <button type="button" className={secondary} disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Prev</button>
              <span className="px-1 font-semibold text-ink">{page}/{pages}</span>
              <button type="button" className={secondary} disabled={page >= pages || loading} onClick={() => setPage((current) => Math.min(pages, current + 1))}>Next</button>
            </div>
          </div>
        </div>

        {selectedKey ? (
          <>
            <div className="min-w-0">
              {detailLoading || !selected ? (
                <div className="rounded-2xl bg-surface p-5 shadow-[0_8px_24px_rgba(16,42,67,0.06)]">
                  <div className="flex items-center gap-3">
                    <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-line-strong text-ink hover:bg-surface-2" aria-label="Back to queue" onClick={closeAssessment}>
                      <BackIcon />
                    </button>
                    <p className="text-sm text-muted">Loading assessment…</p>
                  </div>
                </div>
              ) : (
                <form id="triage-assessment-form" className="space-y-4" onSubmit={(event) => void sendToDoctor(event)}>
                  <div className="rounded-2xl bg-surface p-4 shadow-[0_8px_24px_rgba(16,42,67,0.06)] sm:p-5">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line-strong text-ink hover:bg-surface-2"
                        aria-label="Back to queue"
                        onClick={closeAssessment}
                      >
                        <BackIcon />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-lg font-bold text-ink sm:text-xl">{selected.patient_name}</h2>
                          <StatusBadge status={selected.status} compact />
                        </div>
                        <p className="mt-1 text-sm leading-6 text-muted-strong">
                          {selected.patient_mrn}
                          <span className="text-muted"> · </span>
                          Room {selected.hotel_room_no || "—"}
                          {selected.patient_age_at_visit != null ? <><span className="text-muted"> · </span>{selected.patient_age_at_visit}y</> : null}
                          {selected.patient_gender ? <><span className="text-muted"> · </span>{titleCase(selected.patient_gender)}</> : null}
                          {selected.patient_nationality ? <><span className="text-muted"> · </span>{selected.patient_nationality}</> : null}
                        </p>
                        <Link className="mt-2 inline-flex text-sm font-semibold text-blue hover:underline" to={`/patients/${selected.patient_id}`}>
                          View profile
                        </Link>
                      </div>
                    </div>
                  </div>

                  <Panel index="1" title="Chief Complaint" icon={<ComplaintIcon />} required>
                    <textarea
                      className={`${field} min-h-28`}
                      value={form.chief_complaint}
                      disabled={readonly}
                      required
                      onChange={(event) => setForm((current) => ({ ...current, chief_complaint: event.target.value }))}
                      placeholder="Describe the main reason for the visit"
                    />
                  </Panel>

                  <Panel index="2" title="Vital Signs" icon={<VitalsIcon />} required>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <VitalField label="Temperature" unit="°C" icon={<TempIcon />} value={form.temperature_c} disabled={readonly} required alert={form.temperature_c !== "" && Number(form.temperature_c) >= 38} onChange={(value) => setForm((current) => ({ ...current, temperature_c: value }))} />
                      <VitalField label="Pulse" unit="/min" icon={<PulseIcon />} value={form.pulse} disabled={readonly} required alert={form.pulse !== "" && Number(form.pulse) >= 100} onChange={(value) => setForm((current) => ({ ...current, pulse: value }))} />
                      <VitalField label="RR" unit="/min" icon={<LungsIcon />} value={form.respiratory_rate} disabled={readonly} required alert={form.respiratory_rate !== "" && Number(form.respiratory_rate) >= 22} onChange={(value) => setForm((current) => ({ ...current, respiratory_rate: value }))} />
                      <VitalField label="SpO2" unit="%" icon={<OxygenIcon />} value={form.spo2} disabled={readonly} required alert={form.spo2 !== "" && Number(form.spo2) < 94} onChange={(value) => setForm((current) => ({ ...current, spo2: value }))} />
                    </div>
                  </Panel>

                  <Panel index="3" title="Allergies" icon={<AllergyIcon />}>
                    <TagList
                      tone="danger"
                      items={form.allergies.map((item) => (item.reaction ? `${item.name} (${item.reaction})` : item.name))}
                      onRemove={readonly ? undefined : (index) => setForm((current) => ({ ...current, allergies: current.allergies.filter((_, i) => i !== index) }))}
                    />
                    {!readonly ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <input className={field} value={allergyDraft.name} placeholder="Allergy" onChange={(event) => setAllergyDraft((current) => ({ ...current, name: event.target.value }))} />
                        <input className={field} value={allergyDraft.reaction} placeholder="Reaction (optional)" onChange={(event) => setAllergyDraft((current) => ({ ...current, reaction: event.target.value }))} />
                        <button
                          type="button"
                          className={secondary}
                          onClick={() => {
                            const name = allergyDraft.name.trim();
                            if (!name) return;
                            setForm((current) => ({
                              ...current,
                              allergies: [...current.allergies, { name, reaction: allergyDraft.reaction.trim() || undefined }],
                            }));
                            setAllergyDraft({ name: "", reaction: "" });
                          }}
                        >
                          Add allergy
                        </button>
                      </div>
                    ) : null}
                  </Panel>

                  <Panel index="4" title="Current Medications" icon={<MedsIcon />}>
                    <TagList
                      tone="blue"
                      items={form.medications.map((item) => item.name)}
                      onRemove={readonly ? undefined : (index) => setForm((current) => ({ ...current, medications: current.medications.filter((_, i) => i !== index) }))}
                    />
                    {!readonly ? (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input className={field} value={medicationDraft} placeholder="Medication" onChange={(event) => setMedicationDraft(event.target.value)} />
                        <button
                          type="button"
                          className={secondary}
                          onClick={() => {
                            const name = medicationDraft.trim();
                            if (!name) return;
                            setForm((current) => ({ ...current, medications: [...current.medications, { name }] }));
                            setMedicationDraft("");
                          }}
                        >
                          Add medication
                        </button>
                      </div>
                    ) : null}
                  </Panel>

                  <Panel index="5" title="Relevant History" icon={<HistoryIcon />}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {historyOptions.map((option) => {
                        const checked = form.relevant_history.includes(option.value);
                        return (
                          <label key={option.value} className="flex items-center gap-2 rounded-lg border border-line-soft px-3 py-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              className="accent-[var(--blue)]"
                              checked={checked}
                              disabled={readonly}
                              onChange={() => {
                                setForm((current) => ({
                                  ...current,
                                  relevant_history: checked
                                    ? current.relevant_history.filter((value) => value !== option.value)
                                    : [...current.relevant_history, option.value],
                                }));
                              }}
                            />
                            {option.label}
                          </label>
                        );
                      })}
                    </div>
                    {form.relevant_history.includes("other") ? (
                      <label className={`${label} mt-3`}>Other history
                        <input className={field} value={form.relevant_history_other} disabled={readonly} onChange={(event) => setForm((current) => ({ ...current, relevant_history_other: event.target.value }))} />
                      </label>
                    ) : null}
                  </Panel>

                  <Panel index="6" title="Initial Assessment (Nurse)" icon={<NotesIcon />} required>
                    <textarea
                      className={`${field} min-h-28`}
                      value={form.initial_assessment}
                      disabled={readonly}
                      required
                      onChange={(event) => setForm((current) => ({ ...current, initial_assessment: event.target.value }))}
                      placeholder="Nurse clinical notes"
                    />
                  </Panel>

                  <Panel index="7" title="Triage Category" icon={<CategoryIcon />} required>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {([
                        { value: "emergency", label: "Emergency", className: "border-danger/40 bg-danger-soft text-danger", icon: <AlertIcon /> },
                        { value: "urgent", label: "Urgent", className: "border-amber-400/50 bg-amber-50 text-amber-800", icon: <UrgentIcon /> },
                        { value: "normal", label: "Normal", className: "border-success/40 bg-success-soft text-success", icon: <CheckIcon /> },
                      ] as const).map((option) => {
                        const active = form.triage_category === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            disabled={readonly}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-4 text-sm font-bold transition ${option.className} ${active ? "ring-2 ring-blue ring-offset-2" : "opacity-80 hover:opacity-100"}`}
                            onClick={() => setForm((current) => ({ ...current, triage_category: option.value }))}
                          >
                            {option.icon}
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </Panel>

                  <Panel index="8" title="Assign to" icon={<AssignIcon />} required>
                    <label className={label}>Doctor
                      <select
                        className={field}
                        value={form.assigned_doctor_id}
                        disabled={readonly}
                        required
                        onChange={(event) => setForm((current) => ({ ...current, assigned_doctor_id: event.target.value }))}
                      >
                        {doctorOptions.map((option) => (
                          <option key={option.value || "empty"} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    {doctors.length === 0 ? (
                      <p className="mt-2 text-xs text-muted">No doctors found for this clinic. Assign clinic access to a Doctor user.</p>
                    ) : null}
                  </Panel>

                  <div className="flex flex-col gap-2 xl:hidden">
                    {!readonly ? (
                      <button type="submit" className={`${primary} w-full`} disabled={saving}>
                        <SendIcon />{saving ? "Sending…" : "Save Triage & Send to Doctor"}
                      </button>
                    ) : null}
                    <button type="button" className={`${secondary} w-full`} onClick={() => window.print()}>
                      <PrintIcon />Print Triage Note
                    </button>
                  </div>
                </form>
              )}
            </div>

            <aside className="hidden xl:block">
              <div className="sticky top-24 space-y-4">
                <div className="rounded-2xl bg-surface p-5 shadow-[0_8px_24px_rgba(16,42,67,0.06)]">
                  <h3 className="text-sm font-semibold text-ink">Triage summary</h3>
                  <CategoryBanner category={form.triage_category || null} />
                  <ul className="mt-4 space-y-3">
                    <VitalSummaryRow label="Temperature" icon={<TempIcon />} value={form.temperature_c ? `${form.temperature_c} °C` : "—"} alert={Number(form.temperature_c) >= 38} />
                    <VitalSummaryRow label="Pulse" icon={<PulseIcon />} value={form.pulse ? `${form.pulse} /min` : "—"} alert={Number(form.pulse) >= 100} />
                    <VitalSummaryRow label="RR" icon={<LungsIcon />} value={form.respiratory_rate ? `${form.respiratory_rate} /min` : "—"} alert={Number(form.respiratory_rate) >= 22} />
                    <VitalSummaryRow label="SpO2" icon={<OxygenIcon />} value={form.spo2 ? `${form.spo2} %` : "—"} alert={form.spo2 !== "" && Number(form.spo2) < 94} />
                  </ul>
                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Key points</p>
                    {keyPoints.length === 0 ? (
                      <p className="mt-2 text-sm text-muted">Complete the assessment to see highlights.</p>
                    ) : (
                      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-muted-strong">
                        {keyPoints.map((point) => <li key={point}>{point}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {!readonly ? (
                    <button type="submit" form="triage-assessment-form" className={`${primary} w-full`} disabled={saving || detailLoading}>
                      <SendIcon />{saving ? "Sending…" : "Save Triage & Send to Doctor"}
                    </button>
                  ) : null}
                  <button type="button" className={`${secondary} w-full`} onClick={() => window.print()}>
                    <PrintIcon />Print Triage Note
                  </button>
                </div>
              </div>
            </aside>
          </>
        ) : null}
      </div>
    </section>
  );
}

function itemKey(item: { patient_id: string; id: string }) {
  return `${item.patient_id}:${item.id}`;
}

function validateRequired(form: FormState) {
  if (!form.chief_complaint.trim()) return "Enter the chief complaint";
  if (!form.temperature_c.trim()) return "Enter temperature";
  if (!form.pulse.trim()) return "Enter pulse";
  if (!form.respiratory_rate.trim()) return "Enter respiratory rate";
  if (!form.spo2.trim()) return "Enter SpO2";
  if ([form.temperature_c, form.pulse, form.respiratory_rate, form.spo2].some((value) => !Number.isFinite(Number(value)))) {
    return "Vital signs must be valid numbers";
  }
  if (!form.initial_assessment.trim()) return "Enter the nurse initial assessment";
  if (!form.triage_category) return "Choose a triage category";
  if (!form.assigned_doctor_id) return "Assign a doctor before sending";
  return null;
}

function formFromTriage(detail: TriageDetail): FormState {
  const triage = detail.triage;
  if (!triage) {
    return {
      ...emptyForm(),
      assigned_doctor_id: detail.visit.assigned_doctor_id ?? "",
    };
  }
  return {
    chief_complaint: triage.chief_complaint ?? "",
    temperature_c: triage.temperature_c == null ? "" : String(triage.temperature_c),
    pulse: triage.pulse == null ? "" : String(triage.pulse),
    respiratory_rate: triage.respiratory_rate == null ? "" : String(triage.respiratory_rate),
    spo2: triage.spo2 == null ? "" : String(triage.spo2),
    allergies: Array.isArray(triage.allergies) ? triage.allergies : [],
    medications: Array.isArray(triage.medications) ? triage.medications : [],
    relevant_history: triage.relevant_history ?? [],
    relevant_history_other: triage.relevant_history_other ?? "",
    initial_assessment: triage.initial_assessment ?? "",
    triage_category: triage.triage_category ?? "",
    assigned_doctor_id: triage.assigned_doctor_id ?? detail.visit.assigned_doctor_id ?? "",
  };
}

function payloadFromForm(form: FormState) {
  const numberOrNull = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    chief_complaint: form.chief_complaint.trim() || null,
    temperature_c: numberOrNull(form.temperature_c),
    pulse: numberOrNull(form.pulse) === null ? null : Math.round(numberOrNull(form.pulse)!),
    respiratory_rate: numberOrNull(form.respiratory_rate) === null ? null : Math.round(numberOrNull(form.respiratory_rate)!),
    spo2: numberOrNull(form.spo2) === null ? null : Math.round(numberOrNull(form.spo2)!),
    allergies: form.allergies,
    medications: form.medications,
    relevant_history: form.relevant_history,
    relevant_history_other: form.relevant_history.includes("other") ? (form.relevant_history_other.trim() || null) : null,
    initial_assessment: form.initial_assessment.trim() || null,
    triage_category: form.triage_category || null,
    assigned_doctor_id: form.assigned_doctor_id || null,
  };
}

function buildKeyPoints(form: FormState) {
  const points: string[] = [];
  if (form.chief_complaint.trim()) points.push(form.chief_complaint.trim());
  if (form.spo2 !== "" && Number(form.spo2) < 94) points.push(`Low oxygen saturation (${form.spo2}%)`);
  if (form.temperature_c !== "" && Number(form.temperature_c) >= 38) points.push(`Fever (${form.temperature_c} °C)`);
  if (form.pulse !== "" && Number(form.pulse) >= 100) points.push(`Tachycardia (${form.pulse} /min)`);
  if (form.respiratory_rate !== "" && Number(form.respiratory_rate) >= 22) points.push(`Raised respiratory rate (${form.respiratory_rate} /min)`);
  if (form.allergies.length > 0) points.push(`Allergies: ${form.allergies.map((item) => item.name).join(", ")}`);
  if (form.initial_assessment.trim()) points.push(form.initial_assessment.trim());
  return points.slice(0, 5);
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function elapsedMinutes(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
}

function elapsedLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${rest}m`;
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function statusLabel(status: VisitCareStatus) {
  return status === "waiting_for_triage" ? "Waiting for Triage" : "To See the Doctor";
}

function StatusBadge({ status, compact = false }: { status: VisitCareStatus; compact?: boolean }) {
  const waiting = status === "waiting_for_triage";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${waiting ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
      {waiting ? <WaitingIcon /> : <DoctorIcon />}
      {compact ? (waiting ? "Waiting" : "To doctor") : statusLabel(status)}
    </span>
  );
}

function SummaryTile({
  label: title,
  value,
  active,
  tone,
  icon,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  tone: "waiting" | "doctor";
  icon: ReactNode;
  onClick: () => void;
}) {
  const toneClass = tone === "waiting"
    ? "border-danger/20 bg-danger-soft"
    : "border-success/20 bg-success-soft";
  const valueClass = tone === "waiting" ? "text-danger" : "text-success";
  const iconClass = tone === "waiting" ? "bg-white/70 text-danger" : "bg-white/70 text-success";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-5 py-4 text-left shadow-sm transition ${toneClass} ${active ? "ring-2 ring-blue ring-offset-2" : "hover:brightness-[0.98]"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-strong">{title}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${iconClass}`}>{icon}</span>
      </div>
      <p className={`mt-2 text-4xl font-bold tracking-tight ${valueClass}`}>{value}</p>
    </button>
  );
}

function Panel({ index, title, icon, required, children }: { index: string; title: string; icon: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface p-5 shadow-[0_8px_24px_rgba(16,42,67,0.06)]">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-blue text-white shadow-sm">{icon}</span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Section {index}</p>
          <h3 className="font-semibold text-blue">
            {title}
            {required ? <span className="ml-2 text-xs font-semibold text-danger">Required</span> : null}
          </h3>
        </div>
      </div>
      {children}
    </div>
  );
}

function VitalField({
  label: title,
  unit,
  icon,
  value,
  disabled,
  required,
  alert,
  onChange,
}: {
  label: string;
  unit: string;
  icon: ReactNode;
  value: string;
  disabled?: boolean;
  required?: boolean;
  alert?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={label}>
      <span className={`inline-flex items-center gap-1.5 ${alert ? "text-danger" : ""}`}>
        <span className={alert ? "text-danger" : "text-blue"}>{icon}</span>
        {title}{required ? <span className="text-danger"> *</span> : null}
      </span>
      <span className="relative mt-1 block">
        <input className={`${field} pr-14 ${alert ? "border-danger text-danger" : ""}`} inputMode="decimal" value={value} disabled={disabled} required={required} onChange={(event) => onChange(event.target.value)} />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted">{unit}</span>
      </span>
    </label>
  );
}

function TagList({
  items,
  onRemove,
  tone,
}: {
  items: string[];
  onRemove?: (index: number) => void;
  tone: "danger" | "blue";
}) {
  if (items.length === 0) return <p className="text-sm text-muted">None added.</p>;
  const toneClass = tone === "danger" ? "bg-danger-soft text-danger" : "bg-panel text-blue";
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${toneClass}`}>
          {tone === "danger" ? <AllergyIcon /> : <MedsIcon />}
          {item}
          {onRemove ? (
            <button type="button" className="opacity-70 hover:opacity-100" aria-label={`Remove ${item}`} onClick={() => onRemove(index)}>
              ×
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function CategoryBanner({ category }: { category: TriageCategory | null }) {
  if (!category) {
    return <p className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">Choose a triage category to see urgency guidance.</p>;
  }
  const copy = {
    emergency: { title: "Emergency", body: "Requires immediate doctor review.", icon: <AlertIcon /> },
    urgent: { title: "Urgent", body: "Requires doctor review within 5 minutes.", icon: <UrgentIcon /> },
    normal: { title: "Normal", body: "Routine doctor review.", icon: <CheckIcon /> },
  }[category];
  const tone = category === "emergency"
    ? "bg-danger-soft text-danger"
    : category === "urgent"
      ? "bg-amber-50 text-amber-800"
      : "bg-success-soft text-success";
  return (
    <div className={`mt-3 rounded-xl px-4 py-3 ${tone}`}>
      <p className="inline-flex items-center gap-2 text-sm font-bold">{copy.icon}{copy.title}</p>
      <p className="mt-1 text-sm">{copy.body}</p>
    </div>
  );
}

function VitalSummaryRow({ label: title, icon, value, alert }: { label: string; icon: ReactNode; value: string; alert?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="inline-flex items-center gap-2 text-muted-strong">
        <span className={`grid h-7 w-7 place-items-center rounded-full ${alert ? "bg-danger-soft text-danger" : "bg-panel text-blue"}`}>
          {icon}
        </span>
        {title}
      </span>
      <span className={`font-semibold ${alert ? "text-danger" : "text-ink"}`}>{value}</span>
    </li>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function WaitingIcon() {
  return <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></Icon>;
}

function DoctorIcon() {
  return <Icon><path d="M9 11a3 3 0 1 0 6 0 3 3 0 0 0-6 0" /><path d="M6 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1" /><path d="M12 3v2" /><path d="M9 5h6" /></Icon>;
}

function QueueIcon() {
  return <Icon><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /></Icon>;
}

function PersonIcon() {
  return <Icon><path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" /></Icon>;
}

function IdIcon() {
  return <Icon><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h4" /><path d="M7 14h6" /><circle cx="16.5" cy="12" r="1.5" /></Icon>;
}

function RoomIcon() {
  return <Icon><path d="M4 20V8l8-4 8 4v12" /><path d="M9 20v-6h6v6" /><path d="M4 12h16" /></Icon>;
}

function ClockIcon() {
  return <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Icon>;
}

function TimerIcon() {
  return <Icon><path d="M10 3h4" /><path d="M12 3v2" /><circle cx="12" cy="14" r="7" /><path d="M12 11v3l2 1" /></Icon>;
}

function PlayIcon() {
  return <Icon><circle cx="12" cy="12" r="8" /><path d="M10 9l5 3-5 3V9z" /></Icon>;
}

function EyeIcon() {
  return <Icon><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="2.5" /></Icon>;
}

function ClosePanelIcon() {
  return <Icon><path d="M6 6l12 12" /><path d="M18 6l-12 12" /></Icon>;
}

function BackIcon() {
  return <Icon><path d="M15 6l-6 6 6 6" /><path d="M9 12h10" /></Icon>;
}

function ComplaintIcon() {
  return <Icon><path d="M5 5h14v10H9l-4 4V5z" /><path d="M8 9h8" /><path d="M8 12h5" /></Icon>;
}

function VitalsIcon() {
  return <Icon><path d="M3 12h3l2-5 3 10 2-5h8" /></Icon>;
}

function TempIcon() {
  return <Icon><path d="M10 14.5V6a2 2 0 1 1 4 0v8.5a3 3 0 1 1-4 0z" /><path d="M12 17v-6" /></Icon>;
}

function PulseIcon() {
  return <Icon><path d="M12 19.5s-6.5-4.1-6.5-9A3.5 3.5 0 0 1 12 7.2 3.5 3.5 0 0 1 18.5 10.5c0 4.9-6.5 9-6.5 9z" /></Icon>;
}

function LungsIcon() {
  return <Icon><path d="M12 4v7" /><path d="M12 11c-2 0-5 1.2-5 5.5S9.5 21 12 21" /><path d="M12 11c2 0 5 1.2 5 5.5S14.5 21 12 21" /><path d="M8.5 9.5c-1.5-.8-3-.5-3.5 1" /><path d="M15.5 9.5c1.5-.8 3-.5 3.5 1" /></Icon>;
}

function OxygenIcon() {
  return <Icon><circle cx="12" cy="12" r="8" /><path d="M9 12h6" /><path d="M12 9v6" /></Icon>;
}

function AllergyIcon() {
  return <Icon><path d="M12 3l2.2 4.5L19 8.2l-3.5 3.4.8 4.9L12 14.8 7.7 16.5l.8-4.9L5 8.2l4.8-.7L12 3z" /></Icon>;
}

function MedsIcon() {
  return <Icon><rect x="8" y="3" width="8" height="18" rx="4" /><path d="M8 12h8" /></Icon>;
}

function HistoryIcon() {
  return <Icon><path d="M4 5h16v14H4z" /><path d="M8 9h8" /><path d="M8 13h5" /><path d="M8 17h6" /></Icon>;
}

function NotesIcon() {
  return <Icon><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M9 12h6" /><path d="M9 16h4" /></Icon>;
}

function CategoryIcon() {
  return <Icon><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M12 12l8-4.5" /><path d="M12 12v9" /><path d="M12 12L4 7.5" /></Icon>;
}

function AssignIcon() {
  return <Icon><path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" /><circle cx="10" cy="8" r="3" /><path d="M19 8v6" /><path d="M16 11h6" /></Icon>;
}

function AlertIcon() {
  return <Icon><path d="M12 4l8 14H4L12 4z" /><path d="M12 10v3" /><path d="M12 16h.01" /></Icon>;
}

function UrgentIcon() {
  return <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8v5" /><path d="M12 16h.01" /></Icon>;
}

function CheckIcon() {
  return <Icon><circle cx="12" cy="12" r="8" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></Icon>;
}

function SendIcon() {
  return <Icon><path d="M4 12l15-7-4 14-3-5-8-2z" /></Icon>;
}

function PrintIcon() {
  return <Icon><path d="M7 9V4h10v5" /><path d="M7 15H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2" /><rect x="7" y="13" width="10" height="7" rx="1" /></Icon>;
}
