import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import {
  api,
  type TriageAllergy,
  type TriageCategory,
  type TriageDetail,
  type TriageMedication,
  type TriageQueueItem,
  visitTypeLabel,
  waitMinutes,
  type GeneralSettings,
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
] as const;

const nurseTabs = [
  { status: "waiting_for_triage", label: "Waiting for triage", count: "bg-warning-soft text-warning", tab: "border-warning text-warning" },
  { status: "waiting_for_investigation", label: "Waiting for investigation", count: "bg-panel-strong text-blue-strong", tab: "border-blue text-blue" },
  { status: "to_doctor", label: "To doctor", count: "bg-blue text-white", tab: "border-blue text-blue" },
] as const;

type NurseTab = (typeof nurseTabs)[number]["status"];

const pageSize = 10;

type FormState = {
  chief_complaint: string;
  temperature_c: string;
  pulse: string;
  respiratory_rate: string;
  spo2: string;
  blood_pressure: string;
  allergies: TriageAllergy[];
  medications: TriageMedication[];
  relevant_history: string[];
  relevant_history_items: TriageMedication[];
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
  blood_pressure: "",
  allergies: [],
  medications: [],
  relevant_history: [],
  relevant_history_items: [],
  initial_assessment: "",
  triage_category: "",
  assigned_doctor_id: "",
});

export function TriagePage({ token, actor }: { token: string; actor: User }) {
  const toast = useToast();
  const { clinicId } = useActiveClinic();
  const [params, setParams] = useSearchParams();
  const [queue, setQueue] = useState<TriageQueueResult>({
    items: [],
    total: 0,
    page: 1,
    page_size: pageSize,
    summary: { waiting_for_triage: 0, waiting_for_investigation: 0, to_doctor: 0 },
  });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<NurseTab>("waiting_for_triage");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<TriageDetail | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [doctors, setDoctors] = useState<{ id: string; name: string }[]>([]);
  const [allergyDraft, setAllergyDraft] = useState("");
  const [medicationDraft, setMedicationDraft] = useState("");
  const [historyDraft, setHistoryDraft] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [waitSettings, setWaitSettings] = useState<GeneralSettings>({ triage_wait_minutes: 20, doctor_wait_minutes: 20, clinics: [] });
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const requestId = useRef(0);
  const selected = detail?.visit ?? null;
  const canEdit = canAct(actor, "triage", "update", selected ? { ownerId: selected.patient_added_by, clinicId: selected.clinic_id } : undefined);
  const readonly = !canEdit || selected?.status !== "waiting_for_triage";
  const pages = Math.max(1, Math.ceil(queue.total / pageSize));
  const start = queue.total === 0 ? 0 : (queue.page - 1) * pageSize + 1;
  const end = Math.min(queue.page * pageSize, queue.total);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function addHistoryItem() {
    const name = historyDraft.trim();
    if (!name) return;
    const known = historyOptions.some((option) => option.label.toLowerCase() === name.toLowerCase());
    setForm((current) => {
      const duplicate = current.relevant_history_items.some((item) => item.name.toLowerCase() === name.toLowerCase());
      if (known || duplicate) return current;
      return { ...current, relevant_history_items: [...current.relevant_history_items, { name }] };
    });
    setHistoryDraft("");
  }

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
    api<GeneralSettings>("/api/settings", {}, token)
      .then(setWaitSettings)
      .catch(() => undefined);
  }, [token]);

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
    const patientId = params.get("patient");
    const visitId = params.get("visit");
    if (patientId && visitId) setSelectedKey(`${patientId}:${visitId}`);
  }, [params]);

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

  async function changeDoctor() {
    if (!selected || selected.status !== "to_doctor" || !form.assigned_doctor_id) return;
    if (form.assigned_doctor_id === selected.assigned_doctor_id) return;
    setSaving(true);
    setError(null);
    try {
      const data = await api<TriageDetail>(
        `/api/patients/${selected.patient_id}/visits/${selected.id}/triage/doctor`,
        { method: "PATCH", body: JSON.stringify({ assigned_doctor_id: form.assigned_doctor_id }) },
        token,
      );
      setDetail(data);
      setForm(formFromTriage(data));
      const doctor = doctors.find((item) => item.id === form.assigned_doctor_id)?.name ?? "the new doctor";
      toast.success("Doctor changed", `${selected.patient_name} is now assigned to ${doctor}.`);
      await refreshQueue();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
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
    if (params.get("patient") || params.get("visit")) setParams({}, { replace: true });
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
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Nurse Dashboard</h1>
        <p className="mt-1 text-sm text-muted-strong">Choose a patient, complete triage, then send them to a doctor.</p>
      </header>

      {error && !selectedKey ? <p className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p> : null}

      <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="-mx-4 -mt-4 mb-4 flex flex-wrap gap-1 border-b border-line px-2" role="tablist">
            {nurseTabs.map((tab) => {
              const selected = statusFilter === tab.status;
              return (
                <button
                  key={tab.status}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold ${selected ? tab.tab : "border-transparent text-muted-strong hover:text-ink"}`}
                  onClick={() => setStatusFilter(tab.status)}
                >
                  {tab.label}
                  <span className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums ${tab.count}`}>{queue.summary[tab.status]}</span>
                </button>
              );
            })}
          </div>
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

          <div>
            {queue.items.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted">{loading ? "Loading queue…" : "No patients match this queue."}</p>
            ) : (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_7.5rem_6.75rem_13.5rem] gap-x-3 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <span>Name, MRN, room</span>
                  <span>Registration</span>
                  <span>Elapsed</span>
                  <span>Status</span>
                </div>
                <div className="space-y-2">
                  {queue.items.map((item) => {
                    const active = selectedKey === itemKey(item);
                    const triageDone = item.status !== "waiting_for_triage" && item.triage_completed_at;
                    const elapsed = triageDone
                      ? Math.max(0, new Date(item.triage_completed_at!).getTime() - new Date(item.created_at).getTime())
                      : Math.max(0, now - new Date(item.created_at).getTime());
                    const waiting = item.status === "waiting_for_triage" && !item.triage_id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectVisit(item)}
                        className={`grid w-full grid-cols-[minmax(0,1fr)_7.5rem_6.75rem_13.5rem] items-center gap-x-3 rounded-xl border px-3 py-2.5 text-left transition ${active ? "border-blue bg-panel" : "border-line-soft bg-surface hover:border-line hover:bg-surface-2"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink">{item.patient_name}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted">{item.patient_mrn} · {visitTypeLabel(item.visit_type)} · Room {item.hotel_room_no || "—"}</span>
                        </span>
                        <span className="text-xs font-medium text-muted-strong">{formatRegistered(item.created_at)}</span>
                        <span>
                          <span className={`block font-mono text-sm font-semibold tabular-nums ${elapsed >= waitMinutes(waitSettings, item.clinic_id, "triage") * 60_000 ? "text-danger" : "text-ink"}`}>{clockLabel(elapsed)}</span>
                          <span className={`mt-0.5 block text-xs font-semibold ${triageDone ? "text-success" : "text-blue"}`}>{triageDone ? "Finished" : waiting ? "Start" : "View"}</span>
                        </span>
                        <span className="justify-self-start">
                          <StatusBadge status={item.status} compact />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
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
        <div className="triage-dialog-backdrop fixed inset-0 z-50 grid place-items-center bg-shell/45 p-3 sm:p-4" role="presentation" onMouseDown={closeAssessment}>
          <section
            className="triage-dialog-panel flex max-h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-canvas shadow-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="triage-assessment-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {detailLoading || !selected ? (
              <div className="flex items-center gap-3 p-5">
                <p className="text-sm text-muted">Loading assessment…</p>
                <button type="button" className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close" onClick={closeAssessment}>
                  <ClosePanelIcon />
                </button>
              </div>
            ) : (
              <form id="triage-assessment-form" className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void sendToDoctor(event)}>
                <div className="flex items-start gap-3 border-b border-line-soft bg-surface px-4 py-4 sm:px-5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-panel text-sm font-bold text-blue">{initials(selected.patient_name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue">Triage</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <h2 id="triage-assessment-title" className="truncate text-lg font-bold text-ink sm:text-xl">{selected.patient_name}</h2>
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
                    <Link className={`${secondary} mt-2 h-9 px-3 py-0 text-sm`} to={`/patients/${selected.patient_id}`}>
                      View profile
                    </Link>
                  </div>
                  <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close" onClick={closeAssessment}>
                    <ClosePanelIcon />
                  </button>
                </div>
                {error ? <p className="border-b border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger sm:px-5" role="alert">{error}</p> : null}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="grid items-start gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:p-5">
                    <div className="space-y-4">
                  <Group title="Assessment" hint="What brought the patient in, and what the nurse found.">
                    <div>
                      <FieldLabel required>Chief complaint</FieldLabel>
                      <textarea
                        className={`${field} min-h-24`}
                        value={form.chief_complaint}
                        disabled={readonly}
                        required
                        onChange={(event) => setForm((current) => ({ ...current, chief_complaint: event.target.value }))}
                        placeholder="Describe the main reason for the visit"
                      />
                    </div>
                    <div>
                      <FieldLabel required>Initial assessment</FieldLabel>
                      <textarea
                        className={`${field} min-h-24`}
                        value={form.initial_assessment}
                        disabled={readonly}
                        required
                        onChange={(event) => setForm((current) => ({ ...current, initial_assessment: event.target.value }))}
                        placeholder="Nurse clinical notes"
                      />
                    </div>
                  </Group>

                  <Group title="Vital signs" hint="Abnormal values turn red.">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <VitalField label="Temperature" unit="°C" icon={<TempIcon />} value={form.temperature_c} disabled={readonly} required alert={form.temperature_c !== "" && Number(form.temperature_c) >= 38} onChange={(value) => setForm((current) => ({ ...current, temperature_c: value }))} />
                      <VitalField label="Pulse" unit="/min" icon={<PulseIcon />} value={form.pulse} disabled={readonly} required alert={form.pulse !== "" && Number(form.pulse) >= 100} onChange={(value) => setForm((current) => ({ ...current, pulse: value }))} />
                      <VitalField label="Respiratory rate" unit="/min" icon={<LungsIcon />} value={form.respiratory_rate} disabled={readonly} required alert={form.respiratory_rate !== "" && Number(form.respiratory_rate) >= 22} onChange={(value) => setForm((current) => ({ ...current, respiratory_rate: value }))} />
                      <VitalField label="Blood pressure" unit="mmHg" icon={<PulseIcon />} value={form.blood_pressure} disabled={readonly} required inputMode="text" placeholder="120/80" onChange={(value) => setForm((current) => ({ ...current, blood_pressure: value }))} />
                      <VitalField label="SpO2" unit="%" icon={<OxygenIcon />} value={form.spo2} disabled={readonly} required alert={form.spo2 !== "" && Number(form.spo2) < 94} onChange={(value) => setForm((current) => ({ ...current, spo2: value }))} />
                    </div>
                  </Group>

                  <Group title="History">
                    <div>
                      <FieldLabel>Allergies</FieldLabel>
                    <TagList
                      tone="danger"
                      items={form.allergies.map((item) => item.name)}
                      onRemove={readonly ? undefined : (index) => setForm((current) => ({ ...current, allergies: current.allergies.filter((_, i) => i !== index) }))}
                    />
                    {!readonly ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input className={field} value={allergyDraft} placeholder="Allergy" onChange={(event) => setAllergyDraft(event.target.value)} />
                        <button
                          type="button"
                          className={secondary}
                          onClick={() => {
                            const name = allergyDraft.trim();
                            if (!name) return;
                            setForm((current) => ({
                              ...current,
                              allergies: [...current.allergies, { name }],
                            }));
                            setAllergyDraft("");
                          }}
                        >
                          Add allergy
                        </button>
                      </div>
                    ) : null}
                    </div>
                    <div>
                      <FieldLabel>Current medications</FieldLabel>
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
                    </div>
                    <div>
                      <FieldLabel>Relevant history</FieldLabel>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {historyOptions.map((option) => {
                        const checked = form.relevant_history.includes(option.value);
                        return (
                          <label key={option.value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-ink ${checked ? "border-panel-strong bg-panel" : "border-line-soft bg-surface"}`}>
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
                      {form.relevant_history_items.map((item, index) => (
                        <label key={`${item.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-panel-strong bg-panel px-3 py-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            className="accent-[var(--blue)]"
                            checked
                            disabled={readonly}
                            onChange={() => {
                              setForm((current) => ({
                                ...current,
                                relevant_history_items: current.relevant_history_items.filter((_, i) => i !== index),
                              }));
                            }}
                          />
                          {item.name}
                        </label>
                      ))}
                      {readonly ? null : (
                        <label className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm text-ink">
                          <input
                            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted"
                            value={historyDraft}
                            placeholder="Add relevant history"
                            onChange={(event) => setHistoryDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              event.preventDefault();
                              addHistoryItem();
                            }}
                          />
                          <button type="button" className={`${secondary} h-8 shrink-0 px-3 py-0 text-xs`} onClick={addHistoryItem}>Add</button>
                        </label>
                      )}
                    </div>
                    </div>
                  </Group>

                  <Group title="Decision" hint="Set the urgency, then choose the doctor.">
                    <div>
                      <FieldLabel required>Triage category</FieldLabel>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {([
                        { value: "emergency", label: "Emergency", idle: "border-danger-line text-danger", active: "border-danger bg-danger text-white", icon: <AlertIcon /> },
                        { value: "urgent", label: "Urgent", idle: "border-warning-line text-warning", active: "border-warning bg-warning text-white", icon: <UrgentIcon /> },
                        { value: "normal", label: "Normal", idle: "border-line text-success", active: "border-success bg-success text-white", icon: <CheckIcon /> },
                      ] as const).map((option) => {
                        const active = form.triage_category === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            disabled={readonly}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition disabled:opacity-60 ${active ? option.active : `bg-surface hover:bg-surface-2 ${option.idle}`}`}
                            onClick={() => setForm((current) => ({ ...current, triage_category: option.value }))}
                          >
                            {option.icon}
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    </div>
                    <div>
                      <FieldLabel required>Doctor</FieldLabel>
                      <select
                        className={field}
                        value={form.assigned_doctor_id}
                        disabled={!canEdit || (selected != null && selected.status !== "waiting_for_triage" && selected.status !== "to_doctor")}
                        required
                        onChange={(event) => setForm((current) => ({ ...current, assigned_doctor_id: event.target.value }))}
                      >
                        {doctorOptions.map((option) => (
                          <option key={option.value || "empty"} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    {doctors.length === 0 ? (
                      <p className="mt-2 text-xs text-muted">No doctors found for this clinic. Assign clinic access to a Doctor user.</p>
                    ) : selected?.status === "to_doctor" ? (
                      <p className="mt-2 text-xs text-muted">The visit is still waiting to be seen, so you can assign a different doctor.</p>
                    ) : null}
                    </div>
                  </Group>
                    </div>
                    <aside className="hidden lg:block">
                      <div className="sticky top-0 rounded-2xl border border-line-soft bg-surface p-4">
                        <h3 className="text-sm font-semibold text-ink">Triage summary</h3>
                        <CategoryBanner category={form.triage_category || null} />
                        <ul className="mt-4 space-y-3">
                          <VitalSummaryRow label="Temperature" icon={<TempIcon />} value={form.temperature_c ? `${form.temperature_c} °C` : "—"} alert={Number(form.temperature_c) >= 38} />
                          <VitalSummaryRow label="Pulse" icon={<PulseIcon />} value={form.pulse ? `${form.pulse} /min` : "—"} alert={Number(form.pulse) >= 100} />
                          <VitalSummaryRow label="RR" icon={<LungsIcon />} value={form.respiratory_rate ? `${form.respiratory_rate} /min` : "—"} alert={Number(form.respiratory_rate) >= 22} />
                          <VitalSummaryRow label="Blood pressure" icon={<PulseIcon />} value={form.blood_pressure ? `${form.blood_pressure} mmHg` : "—"} />
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
                    </aside>
                  </div>
                </div>
                <div className="shrink-0 border-t border-line bg-surface px-4 py-3 sm:px-5">
                  <TriageActions
                    readonly={readonly}
                    saving={saving}
                    missing={missingFields(form)}
                    doctorChanged={selected?.status === "to_doctor" && form.assigned_doctor_id !== (selected.assigned_doctor_id ?? "")}
                    onChangeDoctor={() => void changeDoctor()}
                  />
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function itemKey(item: { patient_id: string; id: string }) {
  return `${item.patient_id}:${item.id}`;
}

function missingFields(form: FormState) {
  const missing: string[] = [];
  if (!form.chief_complaint.trim()) missing.push("Chief complaint");
  if (!form.temperature_c.trim() || !form.pulse.trim() || !form.respiratory_rate.trim() || !form.blood_pressure.trim() || !form.spo2.trim()) missing.push("Vital signs");
  if (!form.initial_assessment.trim()) missing.push("Nurse assessment");
  if (!form.triage_category) missing.push("Triage category");
  if (!form.assigned_doctor_id) missing.push("Doctor");
  return missing;
}

function TriageActions({
  readonly,
  saving,
  missing,
  doctorChanged,
  onChangeDoctor,
}: {
  readonly: boolean;
  saving: boolean;
  missing: string[];
  doctorChanged: boolean;
  onChangeDoctor: () => void;
}) {
  const ready = missing.length === 0;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 text-sm text-muted-strong">
          {readonly
            ? doctorChanged
              ? "This visit is still waiting to be seen. Save to assign the new doctor."
              : "This triage has been sent to the doctor."
            : ready
              ? "Ready to save and send this patient to the doctor."
              : <span>Still needed: <span className="font-semibold text-ink">{missing.join(", ")}</span></span>}
        </p>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button type="button" className={`${secondary} gap-1.5`} onClick={() => window.print()}>
            <PrintIcon />Print note
          </button>
          {readonly && doctorChanged ? (
            <button type="button" className={`${primary} whitespace-nowrap`} disabled={saving} onClick={onChangeDoctor}>
              {saving ? "Saving…" : "Change doctor"}
            </button>
          ) : null}
          {readonly ? null : (
            <button type="submit" className={`${primary} whitespace-nowrap`} disabled={saving || !ready}>
              <SendIcon />{saving ? "Sending…" : "Save triage & send to doctor"}
            </button>
          )}
        </div>
    </div>
  );
}

function validateRequired(form: FormState) {
  if (!form.chief_complaint.trim()) return "Enter the chief complaint";
  if (!form.temperature_c.trim()) return "Enter temperature";
  if (!form.pulse.trim()) return "Enter pulse";
  if (!form.respiratory_rate.trim()) return "Enter respiratory rate";
  if (!form.respiratory_rate.trim()) return "Enter respiratory rate";
  if (!/^\d{2,3}\/\d{2,3}$/.test(form.blood_pressure.trim())) return "Enter blood pressure as systolic/diastolic, for example 120/80";
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
    blood_pressure: triage.blood_pressure ?? "",
    allergies: Array.isArray(triage.allergies) ? triage.allergies : [],
    medications: Array.isArray(triage.medications) ? triage.medications : [],
    relevant_history: (triage.relevant_history ?? []).filter((item) => item !== "other"),
    relevant_history_items: historyItemsFromTriage(triage),
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
    blood_pressure: form.blood_pressure.trim() || null,
    allergies: form.allergies,
    medications: form.medications,
    relevant_history: form.relevant_history.filter((item) => item !== "other"),
    relevant_history_items: form.relevant_history_items,
    relevant_history_other: null,
    initial_assessment: form.initial_assessment.trim() || null,
    triage_category: form.triage_category || null,
    assigned_doctor_id: form.assigned_doctor_id || null,
  };
}

function historyItemsFromTriage(triage: { relevant_history_items?: TriageMedication[]; relevant_history_other?: string | null }) {
  const items = Array.isArray(triage.relevant_history_items) ? triage.relevant_history_items.filter((item) => item.name?.trim()) : [];
  const other = triage.relevant_history_other?.trim();
  if (other && !items.some((item) => item.name.trim().toLowerCase() === other.toLowerCase())) {
    items.push({ name: other });
  }
  return items;
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

function formatRegistered(value: string) {
  return new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function clockLabel(ms: number) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function statusLabel(status: VisitCareStatus) {
  if (status === "waiting_for_triage") return "Waiting for Triage";
  if (status === "waiting_for_investigation") return "Waiting for investigation";
  return "To See the Doctor";
}

function StatusBadge({ status, compact = false }: { status: VisitCareStatus; compact?: boolean }) {
  const waiting = status === "waiting_for_triage";
  const investigation = status === "waiting_for_investigation";
  const tone = waiting ? "bg-warning-soft text-warning" : "bg-panel text-blue";
  const compactLabel = waiting ? "Waiting for Triage" : investigation ? "Waiting for investigation" : "To doctor";
  return (
    <span className={`inline-flex w-max shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${tone}`}>
      {waiting || investigation ? <WaitingIcon /> : <DoctorIcon />}
      {compact ? compactLabel : statusLabel(status)}
    </span>
  );
}

function Group({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line-soft bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <p className="mb-1.5 text-sm font-medium text-muted-strong">
      {children}
      {required ? <span className="ml-1 text-danger">*</span> : null}
    </p>
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
  inputMode = "decimal",
  placeholder,
  onChange,
}: {
  label: string;
  unit: string;
  icon: ReactNode;
  value: string;
  disabled?: boolean;
  required?: boolean;
  alert?: boolean;
  inputMode?: "decimal" | "text";
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={label}>
      <span className={`inline-flex items-center gap-1.5 ${alert ? "text-danger" : ""}`}>
        <span className={alert ? "text-danger" : "text-blue"}>{icon}</span>
        {title}{required ? <span className="text-danger"> *</span> : null}
      </span>
      <span className="relative mt-1 block">
        <input className={`${field} pr-14 ${alert ? "border-danger bg-danger-soft text-danger" : ""}`} inputMode={inputMode} placeholder={placeholder} value={value} disabled={disabled} required={required} onChange={(event) => onChange(event.target.value)} />
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
      ? "bg-warning-soft text-warning"
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
