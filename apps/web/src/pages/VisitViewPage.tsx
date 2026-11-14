import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, type InvestigationPhase, type PatientVisit, type User, type VisitCareProfile, type VisitCareStatus, type VisitInvestigation, visitStatusChips, visitStatusText, visitTypeLabel } from "../api";
import { canAct } from "../access";
import { useToast } from "../toast";
import { visitDocumentAccept, visitDocumentIssue, visitDocumentMeta, visitDocumentSizeLabel } from "../visitDocuments";
import { EncounterDetailsPanel, InvestigationDetailsPanel, MonitoringDetailsPanel, TriageDetailsPanel } from "./VisitCarePanels";
import { AgeBadge, Card, ConfirmDialog, Detail, IconAction, Page, SecretValue, Section, Summary, formatWhen, messageOf, primary, secondary } from "./ui";

type VisitTab = "details" | "workflow" | "triage" | "encounter" | "monitoring" | "investigations";

export function VisitViewPage({ token, actor }: { token: string; actor: User }) {
  const { patientId, id, visitNumber } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [visit, setVisit] = useState<PatientVisit | null>(null);
  const [care, setCare] = useState<VisitCareProfile | null>(null);
  const [careError, setCareError] = useState<string | null>(null);
  const [careLoading, setCareLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [fileError, setFileError] = useState<{ type: string; message: string } | null>(null);
  const canWrite = canAct(actor, "visit", "update", { ownerId: visit?.patient_added_by, clinicId: visit?.clinic_id })
    || canAct(actor, "visit", "create", { clinicId: visit?.clinic_id });
  const canDelete = canAct(actor, "visit", "delete", { ownerId: visit?.patient_added_by, clinicId: visit?.clinic_id });

  const search = params.toString();
  const showEncounter = Boolean(care?.encounter);
  const showMonitoring = Boolean(care?.monitoring);
  const showInvestigations = (care?.investigations.length ?? 0) > 0;
  const tab = resolveVisitTab(params.get("tab"), { showEncounter, showMonitoring, showInvestigations });

  useEffect(() => {
    const request = visitNumber
      ? api<PatientVisit>(`/api/visits/by-number/${encodeURIComponent(visitNumber)}`, {}, token)
      : api<PatientVisit>(`/api/patients/${patientId}/visits/${id}`, {}, token);
    request.then((next) => {
      setVisit(next);
      if (next.visit_number && visitNumber !== next.visit_number) {
        navigate(`/visits/${next.visit_number}${search ? `?${search}` : ""}`, { replace: true });
      }
    }).catch((caught) => setError(messageOf(caught)));
  }, [patientId, id, visitNumber, token, navigate, search]);

  useEffect(() => {
    if (!visit) return;
    let cancelled = false;
    setCareLoading(true);
    setCareError(null);
    api<VisitCareProfile>(`/api/patients/${visit.patient_id}/visits/${visit.id}/care-profile`, {}, token)
      .then((next) => {
        if (!cancelled) setCare(next);
      })
      .catch((caught) => {
        if (!cancelled) {
          setCare(null);
          setCareError(messageOf(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setCareLoading(false);
      });
    return () => { cancelled = true; };
  }, [visit, token]);

  async function markPendingPayment() {
    if (!visit) return;
    setPending(true);
    setError(null);
    try {
      const next = await api<PatientVisit>(`/api/patients/${visit.patient_id}/visits/${visit.id}/pending-payment`, { method: "POST" }, token);
      setVisit(next);
      toast.success("Pending payment", "This visit is ready to be paid.");
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setPending(false);
    }
  }

  async function uploadDocument(documentType: string, file: File) {
    if (!visit) return;
    const issue = visitDocumentIssue(file);
    if (issue) {
      setFileError({ type: documentType, message: issue });
      return;
    }
    setFileError(null);
    setUploadingType(documentType);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const next = await api<PatientVisit>(
        `/api/patients/${visit.patient_id}/visits/${visit.id}/documents/${documentType}`,
        { method: "POST", body },
        token,
      );
      setVisit(next);
      toast.success("File uploaded", "The visit document was saved.");
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setUploadingType(null);
    }
  }

  return (
    <Page
      title={visit ? (
        <span className="inline-flex flex-wrap items-center gap-3">
          {visit.clinic_name} visit
          <VisitStatuses status={visit.status} monitoring={visit.monitoring_status} phase={visit.investigation_phase} />
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink">{visitTypeLabel(visit.visit_type)}</span>
        </span>
      ) : "Visit"}
      description={visit
        ? `${visit.patient_name ?? "Patient"} · ${visit.patient_mrn ?? ""}${visit.patient_age_at_visit != null ? ` · ${visit.patient_age_at_visit} years at visit` : ""}`
        : "Visit details"}
      crumbs={[
        { label: "Patients", to: "/patients" },
        { label: visit?.patient_name ?? "Patient", to: `/patients/${visit?.patient_mrn ?? ""}?tab=visits` },
        { label: "Visit" },
      ]}
      action={
        <>
          <Link className={secondary} to={`/patients/${visit?.patient_mrn ?? ""}?tab=visits`}>Back to patient</Link>
          {canWrite && visit?.visit_number ? <IconAction kind="edit" to={`/visits/${visit.visit_number}/edit`} /> : null}
          {canDelete ? <IconAction kind="delete" onClick={() => { setDeleteError(null); setConfirmOpen(true); }} /> : null}
        </>
      }
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {visit ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="mb-5 flex flex-wrap gap-2 border-b border-line-soft" role="tablist" aria-label="Visit sections">
              <TabButton selected={tab === "details"} onClick={() => setParams({}, { replace: true })}>Details</TabButton>
              <TabButton selected={tab === "workflow"} onClick={() => setParams({ tab: "workflow" }, { replace: true })}>Workflow</TabButton>
              <TabButton selected={tab === "triage"} onClick={() => setParams({ tab: "triage" }, { replace: true })}>Triage Details</TabButton>
              {showEncounter ? (
                <TabButton selected={tab === "encounter"} onClick={() => setParams({ tab: "encounter" }, { replace: true })}>Clinical Encounter</TabButton>
              ) : null}
              {showMonitoring ? (
                <TabButton selected={tab === "monitoring"} onClick={() => setParams({ tab: "monitoring" }, { replace: true })}>Monitoring Details</TabButton>
              ) : null}
              {showInvestigations ? (
                <TabButton selected={tab === "investigations"} onClick={() => setParams({ tab: "investigations" }, { replace: true })}>Investigation Details</TabButton>
              ) : null}
            </div>
            {careError && tab !== "details" && tab !== "workflow" ? <p className="mb-4 text-sm text-danger">{careError}</p> : null}
            {tab === "workflow" ? (
              careLoading && !care && visit.status === "waiting_for_investigation"
                ? <Card><p className="text-sm text-muted">Loading workflow…</p></Card>
                : <VisitWorkflow visit={visit} investigations={care?.investigations ?? []} />
            ) : null}
            {tab === "details" ? (
              <VisitDetails
                visit={visit}
                canWrite={canWrite}
                uploadingType={uploadingType}
                fileError={fileError}
                uploadDocument={uploadDocument}
              />
            ) : null}
            {tab === "triage" ? (
              careLoading && !care ? <Card><p className="text-sm text-muted">Loading triage…</p></Card> : <TriageDetailsPanel triage={care?.triage ?? null} />
            ) : null}
            {tab === "encounter" && care?.encounter ? <EncounterDetailsPanel record={care.encounter} /> : null}
            {tab === "monitoring" && care?.monitoring ? <MonitoringDetailsPanel monitoring={care.monitoring} /> : null}
            {tab === "investigations" && care ? <InvestigationDetailsPanel items={care.investigations} /> : null}
          </div>
          <Summary
            title={visit.patient_name ?? "Patient"}
            lines={[
              visit.patient_mrn ?? "MRN",
              <VisitStatuses status={visit.status} monitoring={visit.monitoring_status} phase={visit.investigation_phase} />,
              visitTypeLabel(visit.visit_type),
              visit.assigned_doctor_name ? `Doctor: ${visit.assigned_doctor_name}` : null,
              visit.patient_age_at_visit != null ? <AgeBadge age={visit.patient_age_at_visit} /> : "Age unknown",
              visit.clinic_name,
              visit.hotel_room_no ? <SecretValue value={`Room ${visit.hotel_room_no}`} /> : "Room not set",
              canAct(actor, "triage", "view", { ownerId: visit.patient_added_by, clinicId: visit.clinic_id })
                ? <Link className={`${secondary} h-8 px-3 py-0 text-xs`} to="/patients/triage">Open nurse dashboard</Link>
                : null,
              (visit.status === "to_doctor" || visit.status === "consultation_in_progress" || visit.status === "seen" || visit.status === "waiting_for_investigation" || visit.status === "under_nursing_care" || visit.status === "encounter_complete" || visit.status === "referred" || visit.status === "pending_payment") && (actor.type === "super-admin" || actor.type === "admin" || actor.role === "Doctor")
                ? <Link className={`${secondary} h-8 px-3 py-0 text-xs`} to={`/patients/to-doctor/${visit.visit_number}/encounter`}>{visit.status === "consultation_in_progress" ? "Resume Encounter" : visit.status === "to_doctor" ? "Start encounter" : "View encounter"}</Link>
                : null,
              visit.status === "encounter_complete" && canWrite
                ? <button type="button" className={`${primary} h-8 px-3 py-0 text-xs`} disabled={pending} onClick={() => void markPendingPayment()}>Mark pending payment</button>
                : null,
            ].filter((line) => line !== null)}
          />
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete this visit?"
        body="This visit will be removed from the patient record."
        confirmLabel="Delete visit"
        pending={pending}
        error={deleteError}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setPending(true);
          setDeleteError(null);
          api(`/api/patients/${visit?.patient_id}/visits/${visit?.id}`, { method: "DELETE" }, token)
            .then(() => {
              toast.success("Visit deleted", `The visit for ${visit?.patient_name ?? "the patient"} was removed.`);
              navigate(`/patients/${visit?.patient_mrn}?tab=visits`);
            })
            .catch((caught) => {
              const message = messageOf(caught);
              setDeleteError(message);
              toast.error("Couldn't delete visit", message);
            })
            .finally(() => setPending(false));
        }}
      />
    </Page>
  );
}

function VisitStatuses({ status, monitoring, phase }: { status?: VisitCareStatus; monitoring?: "none" | "in_progress" | "completed" | null; phase?: InvestigationPhase | null }) {
  const chips = visitStatusChips({ status, monitoring_status: monitoring });
  if (chips.length === 0) return <span className="text-muted">—</span>;
  return <span className="inline-flex flex-wrap gap-1">{chips.map((item) => <VisitStatus key={item} status={item} phase={item === "waiting_for_investigation" ? phase : null} />)}</span>;
}

function VisitStatus({ status, phase }: { status?: VisitCareStatus; phase?: InvestigationPhase | null }) {
  if (!status) return <span className="text-muted">—</span>;
  const tone = status === "patient_left"
    ? "bg-surface-3 text-muted-strong"
    : status === "consultation_in_progress" || (status === "waiting_for_investigation" && phase !== "results_ready")
      ? "bg-warning-soft text-warning"
      : status === "seen" || status === "encounter_complete" || status === "under_nursing_care" || (status === "waiting_for_investigation" && phase === "results_ready")
        ? "bg-success-soft text-success"
        : status === "referred"
          ? "bg-panel text-blue"
          : status === "pending_payment" || status === "waiting_for_triage"
            ? "bg-warning-soft text-warning"
            : "bg-panel text-blue";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{visitStatusText({ status, investigation_phase: phase })}</span>;
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function TabButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${selected ? "border-blue text-blue" : "border-transparent text-muted-strong"}`}
    >
      {children}
    </button>
  );
}

function resolveVisitTab(
  value: string | null,
  options: { showEncounter: boolean; showMonitoring: boolean; showInvestigations: boolean },
): VisitTab {
  if (value === "workflow") return "workflow";
  if (value === "triage") return "triage";
  if (value === "encounter" && options.showEncounter) return "encounter";
  if (value === "monitoring" && options.showMonitoring) return "monitoring";
  if (value === "investigations" && options.showInvestigations) return "investigations";
  return "details";
}

function VisitDetails({
  visit,
  canWrite,
  uploadingType,
  fileError,
  uploadDocument,
}: {
  visit: PatientVisit;
  canWrite: boolean;
  uploadingType: string | null;
  fileError: { type: string; message: string } | null;
  uploadDocument: (documentType: string, file: File) => void;
}) {
  return (
    <Card>
      <Section index="1" title="Stay" />
      <Detail items={[
        {
          label: "Status",
          value: (
            <span className="inline-flex flex-wrap items-center gap-2">
              <VisitStatuses status={visit.status} monitoring={visit.monitoring_status} phase={visit.investigation_phase} />
              {visit.status_changed_at ? <span className="text-sm font-medium text-muted-strong">{formatWhen(visit.status_changed_at)}</span> : null}
            </span>
          ),
        },
        { label: "Type", value: visitTypeLabel(visit.visit_type) },
        { label: "Currency", value: visit.patient_nationality === "Egyptian" ? "EGP" : "EUR" },
        { label: "Professional medical service", value: visit.professional_service_code ? `${visit.professional_service_code}${visit.professional_service_name ? ` · ${visit.professional_service_name}` : ""}` : "—" },
        { label: "Clinic", value: visit.clinic_name },
        { label: "Hotel", value: visit.hotel_name },
        { label: "Room", value: <SecretValue value={visit.hotel_room_no} /> },
        { label: "Check-in", value: <SecretValue value={visit.hotel_checkin_date} /> },
        { label: "Check-out", value: <SecretValue value={visit.hotel_checkout_date} /> },
        {
          label: "Age at visit",
          value: visit.patient_age_at_visit != null
            ? <span className="inline-flex items-center gap-2"><AgeBadge age={visit.patient_age_at_visit} /><span className="text-sm font-medium text-muted-strong">at visit</span></span>
            : "—",
        },
        { label: "Passport number", value: <SecretValue value={visit.passport_number} mono /> },
        { label: "Preferred contact", value: visit.preferred_contact_method ? titleCase(visit.preferred_contact_method) : "—" },
      ]} />
      <div className="mt-6"><Section index="2" title="Emergency contact" /></div>
      <Detail items={[
        { label: "Name", value: visit.emergency_contact_name || "—" },
        { label: "Phone", value: <SecretValue value={visit.emergency_contact_phone} mono /> },
        { label: "Relationship", value: visit.emergency_contact_relationship ? titleCase(visit.emergency_contact_relationship) : "—" },
        { label: "Created", value: formatWhen(visit.created_at) },
        { label: "Updated", value: formatWhen(visit.updated_at) },
      ]} />
      <div className="mt-6"><Section index="3" title="Consent & Privacy" /></div>
      <p className="mb-3 text-sm text-muted-strong">PDF, JPEG, PNG, or WebP. Each file must be {visitDocumentSizeLabel} or smaller.</p>
      <div className="space-y-3">
        {visitDocumentMeta.map((item) => {
          const current = visit.documents?.find((doc) => doc.document_type === item.type);
          return (
            <div key={item.type} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {item.label}
                  {item.required ? <span className="ml-2 text-xs font-semibold text-danger">Required</span> : <span className="ml-2 text-xs font-semibold text-muted">Optional</span>}
                </p>
                <p className="mt-0.5 truncate text-sm text-muted-strong">
                  {current ? current.original_name : "Not uploaded"}
                </p>
                {fileError?.type === item.type ? <p className="mt-1 text-sm font-medium text-danger" role="alert">{fileError.message}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                {current?.file_url ? (
                  <a className={secondary} href={current.file_url} target="_blank" rel="noreferrer">
                    View
                  </a>
                ) : null}
                {canWrite ? (
                  <label className={`${secondary} cursor-pointer ${uploadingType === item.type ? "opacity-60" : ""}`}>
                    {uploadingType === item.type ? "Uploading" : current ? "Replace" : "Upload"}
                    <input
                      className="sr-only"
                      type="file"
                      accept={visitDocumentAccept}
                      disabled={uploadingType !== null}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadDocument(item.type, file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

type WorkflowStep = {
  status: string;
  title: string;
  body: string;
  when?: string | null;
  actor?: string | null;
  spentMs?: number;
  spentOpen?: boolean;
};

function VisitWorkflow({ visit, investigations }: { visit: PatientVisit; investigations: VisitInvestigation[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const steps = workflowSteps(visit, investigations, now);
  const spent = statusDurations(visit, now);
  const both = visit.status === "waiting_for_investigation" && visit.monitoring_status === "in_progress";
  const currentKey = visit.status === "waiting_for_investigation" && visit.investigation_phase
    ? `investigation:${visit.investigation_phase}`
    : visit.status;
  const current = Math.max(0, steps.findIndex((step) => step.status === currentKey));
  const stateOf = (index: number) => {
    const step = steps[index];
    if (both && (step?.status.startsWith("investigation:") || step?.status === "under_nursing_care")) {
      if (step.status === currentKey || step.status === "under_nursing_care") return "current";
    }
    if (index < current) return "done";
    if (index === current) return "current";
    return "next";
  };
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue">Care path</p>
          <h2 className="mt-1 text-lg font-bold text-ink">{both ? `${visitStatusText(visit)} and Under Nursing Care` : steps[current]?.title ?? visitStatusText(visit)}</h2>
          <p className="mt-1 text-sm text-muted-strong">Registration, triage, the doctor, then the next step for this visit.</p>
        </div>
        <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-blue">Step {current + 1} of {steps.length}</span>
      </div>
      <div className="mt-5 flex gap-2" aria-hidden="true">
        {steps.map((step, index) => {
          const state = stateOf(index);
          return <span key={step.status} className={`h-1.5 flex-1 rounded-full ${state === "done" ? "bg-success" : state === "current" ? "bg-blue" : "bg-line"}`} />;
        })}
      </div>
      <ol className="mt-7">
        {steps.map((step, index) => {
          const state = stateOf(index);
          const registration = step.status === "registered";
          const investigation = step.status.startsWith("investigation:");
          const event = registration
            ? visit.status_history?.find((item) => item.from_status == null)
            : investigation
              ? null
              : visit.status_history?.find((item) => item.to_status === step.status);
          const reached = state !== "next";
          const duration = investigation
            ? (reached && step.spentMs != null ? { ms: step.spentMs, open: Boolean(step.spentOpen) } : undefined)
            : reached ? spent.get(step.status) : undefined;
          const when = reached
            ? investigation
              ? step.when ?? null
              : registration
                ? visit.created_at
                : event?.created_at ?? (step.status === "waiting_for_triage" ? visit.created_at : visit.status_changed_at)
            : null;
          const actor = investigation ? step.actor : event?.changed_by_name;
          const last = index === steps.length - 1;
          const nextState = stateOf(index + 1);
          return (
            <li key={step.status} className="triage-rise relative flex gap-4" style={{ animationDelay: `${index * 90}ms` }}>
              <div className="flex w-11 shrink-0 flex-col items-center">
                <span
                  className={`grid h-11 w-11 place-items-center rounded-full ${state === "current" ? "care-pulse bg-blue text-white" : state === "done" ? "bg-success text-white" : "bg-surface-3 text-muted"}`}
                  aria-hidden="true"
                >
                  {state === "done" ? <CheckIcon /> : step.status === "waiting_for_triage" ? <QueueIcon /> : <DoctorIcon />}
                </span>
                {last ? null : <span className={`my-1.5 w-0.5 flex-1 rounded-full ${state === "done" ? "bg-success" : state === "current" && nextState !== "next" ? "bg-blue" : "bg-line"}`} />}
              </div>
              <div
                className={`min-w-0 flex-1 rounded-2xl px-4 py-3.5 ${last ? "" : "mb-3"} ${state === "current" ? "bg-panel shadow-[0_8px_24px_rgba(15,127,145,0.1)]" : state === "done" ? "bg-success-soft" : "bg-surface-2"}`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`font-semibold ${state === "next" ? "text-muted-strong" : "text-ink"}`}>{step.title}</p>
                  {state === "current" ? <span className="rounded-full bg-blue px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Now</span> : null}
                  {state === "done" ? <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success">Done</span> : null}
                  {duration ? <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink">{formatSpent(duration.ms, duration.open)}</span> : null}
                </div>
                <p className="mt-1 text-sm text-muted-strong">{step.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {when ? <span className="rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-muted-strong">{formatWhen(when)}</span> : <span className="rounded-lg bg-white/70 px-2.5 py-1 text-xs font-medium text-muted">Still ahead</span>}
                  {actor ? <span className="rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-muted-strong">{actor}</span> : null}
                  {step.status === "to_doctor" && reached && visit.assigned_doctor_name ? <span className="rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-ink">Doctor {visit.assigned_doctor_name}</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function workflowSteps(visit: PatientVisit, investigations: VisitInvestigation[], now: number): WorkflowStep[] {
  const steps = [registrationStep(), ...careSteps(visit, investigations, now)];
  const seen = new Set(steps.map((step) => step.status));
  const order: VisitCareStatus[] = [];
  for (const event of [...(visit.status_history ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    if (!isVisitStatus(event.to_status) || order.includes(event.to_status)) continue;
    order.push(event.to_status);
  }
  const result = [...steps];
  for (const status of order) {
    if (status === "waiting_for_investigation" && result.some((step) => step.status.startsWith("investigation:"))) continue;
    if (seen.has(status)) continue;
    const historyIndex = order.indexOf(status);
    const later = result.findIndex((step) => isVisitStatus(step.status) && order.indexOf(step.status) > historyIndex);
    result.splice(later === -1 ? result.length : later, 0, statusStep(status, visit));
    seen.add(status);
  }
  return result;
}

function statusDurations(visit: PatientVisit, now: number) {
  const history = [...(visit.status_history ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const totals = new Map<string, { ms: number; open: boolean }>();
  const add = (status: string, start: number, end: number, open: boolean) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return;
    const current = totals.get(status) ?? { ms: 0, open: false };
    current.ms += end - start;
    current.open = current.open || open;
    totals.set(status, current);
  };
  if (history.length === 0 && visit.status) {
    add(visit.status, Date.parse(visit.created_at), now, true);
  }
  history.forEach((event, index) => {
    const start = Date.parse(event.created_at);
    const next = history[index + 1];
    const stillHere = !next && event.to_status === visit.status;
    const end = next ? Date.parse(next.created_at) : stillHere ? now : Date.parse(visit.status_changed_at ?? event.created_at);
    add(event.to_status, start, end, stillHere);
  });
  if (visit.status && !history.some((event) => event.to_status === visit.status)) {
    add(visit.status, Date.parse(visit.status_changed_at ?? visit.created_at), now, true);
  }
  if (visit.status === "waiting_for_investigation" && visit.monitoring_status === "in_progress" && !totals.has("under_nursing_care")) {
    const investigation = totals.get("waiting_for_investigation");
    if (investigation) totals.set("under_nursing_care", { ...investigation });
  }
  const registeredAt = Date.parse(visit.created_at);
  const triageAt = Date.parse(history.find((event) => event.to_status === "waiting_for_triage")?.created_at ?? visit.created_at);
  add("registered", registeredAt, Math.max(registeredAt, triageAt), false);
  return totals;
}

function formatSpent(ms: number, open: boolean) {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  let label = "less than a minute";
  if (minutes >= 1 && minutes < 60) label = minutes === 1 ? "1 min" : `${minutes} min`;
  else if (minutes >= 60 && minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const hourLabel = hours === 1 ? "1 hour" : `${hours} hours`;
    label = rest ? `${hourLabel} ${rest} min` : hourLabel;
  } else if (minutes >= 24 * 60) {
    const days = Math.floor(minutes / (24 * 60));
    const hourRest = Math.floor((minutes % (24 * 60)) / 60);
    const dayLabel = days === 1 ? "1 day" : `${days} days`;
    label = hourRest ? `${dayLabel} ${hourRest} h` : dayLabel;
  }
  return open ? `${label} so far` : `Spent ${label}`;
}

function isVisitStatus(status: string): status is VisitCareStatus {
  return status === "waiting_for_triage"
    || status === "to_doctor"
    || status === "consultation_in_progress"
    || status === "seen"
    || status === "waiting_for_investigation"
    || status === "under_nursing_care"
    || status === "encounter_complete"
    || status === "referred"
    || status === "pending_payment"
    || status === "patient_left";
}

function investigationStepCopy(phase: InvestigationPhase) {
  if (phase === "awaiting_collection") {
    return { title: "Waiting for Sample Collection", body: "Investigations were ordered. Samples still need to be collected." };
  }
  if (phase === "collected") {
    return { title: "Sample Collected", body: "Samples were collected and are ready to be sent to the lab." };
  }
  if (phase === "at_lab") {
    return { title: "Sent to Lab", body: "Investigations were sent to the lab. Waiting for results." };
  }
  return { title: "Results Ready", body: "All investigation results are in. The doctor can review them and end the encounter." };
}

function earliestIso(values: Array<string | null | undefined>) {
  const times = values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, ms: Date.parse(value) }))
    .filter((item) => Number.isFinite(item.ms))
    .sort((left, right) => left.ms - right.ms);
  return times[0]?.value ?? null;
}

function latestIso(values: Array<string | null | undefined>) {
  const times = values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, ms: Date.parse(value) }))
    .filter((item) => Number.isFinite(item.ms))
    .sort((left, right) => right.ms - left.ms);
  return times[0]?.value ?? null;
}

function actorAt(items: VisitInvestigation[], when: string | null, field: "ordered_by_name" | "collected_by_name" | "sent_by_name" | "result_uploaded_by_name") {
  if (!when) return null;
  const match = items.find((item) => {
    if (field === "ordered_by_name") return item.ordered_at === when;
    if (field === "collected_by_name") return item.collected_at === when;
    if (field === "sent_by_name") return item.sent_at === when;
    return item.result_uploaded_at === when || item.completed_at === when;
  });
  const name = match?.[field];
  return typeof name === "string" && name.trim() ? name : null;
}

function investigationPhaseSteps(visit: PatientVisit, investigations: VisitInvestigation[], now: number): WorkflowStep[] {
  const phase = visit.investigation_phase ?? "awaiting_collection";
  const phaseOrder: InvestigationPhase[] = ["awaiting_collection", "collected", "at_lab", "results_ready"];
  const currentIndex = Math.max(0, phaseOrder.indexOf(phase));
  const needsCollection = investigations.length === 0 || investigations.some((item) => item.requires_collection);
  const orderedAt = earliestIso(investigations.map((item) => item.ordered_at))
    ?? visit.status_history?.find((item) => item.to_status === "waiting_for_investigation")?.created_at
    ?? visit.status_changed_at
    ?? null;
  const collectedAt = latestIso(investigations.map((item) => {
    if (item.collected_at) return item.collected_at;
    if (!item.requires_collection && item.status && item.status !== "ordered") return item.ordered_at;
    return null;
  }));
  const sentAt = latestIso(investigations.map((item) => item.sent_at));
  const resultsAt = latestIso(investigations.map((item) => item.completed_at ?? item.result_uploaded_at));

  // Sent to Lab (and earlier) always shows the collection → collected → lab path vertically.
  const path: InvestigationPhase[] = needsCollection
    ? ["awaiting_collection", "collected", "at_lab"]
    : ["collected", "at_lab"];
  if (phase === "results_ready") path.push("results_ready");

  return path.map((item) => {
    const copy = investigationStepCopy(item);
    const itemIndex = phaseOrder.indexOf(item);
    const reached = itemIndex <= currentIndex;
    const open = item === phase;
    const when = item === "awaiting_collection"
      ? orderedAt
      : item === "collected"
        ? collectedAt
        : item === "at_lab"
          ? sentAt
          : resultsAt;
    const nextWhen = item === "awaiting_collection"
      ? collectedAt
      : item === "collected"
        ? sentAt
        : item === "at_lab"
          ? resultsAt
          : null;
    const startMs = when ? Date.parse(when) : Number.NaN;
    const endMs = open ? now : nextWhen ? Date.parse(nextWhen) : Number.NaN;
    const spentMs = reached && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
      ? endMs - startMs
      : undefined;
    const actor = item === "awaiting_collection"
      ? actorAt(investigations, orderedAt, "ordered_by_name")
      : item === "collected"
        ? actorAt(investigations, collectedAt, "collected_by_name")
        : item === "at_lab"
          ? actorAt(investigations, sentAt, "sent_by_name")
          : actorAt(investigations, resultsAt, "result_uploaded_by_name");
    return {
      status: `investigation:${item}`,
      title: copy.title,
      body: copy.body,
      when: reached ? when : null,
      actor: reached ? actor : null,
      spentMs,
      spentOpen: open,
    };
  });
}

function finishedAfterMonitoring(visit: PatientVisit) {
  if (visit.monitoring_status === "completed" || visit.monitoring_status === "in_progress") return true;
  return (visit.status_history ?? []).some((event) => event.to_status === "under_nursing_care");
}

function encounterCompleteBody(visit: PatientVisit) {
  if (finishedAfterMonitoring(visit)) return "The doctor ended the encounter after monitoring was completed.";
  return "The doctor completed the encounter with no investigations or monitoring.";
}

function statusStep(status: VisitCareStatus, visit: PatientVisit): WorkflowStep {
  const copy: Record<VisitCareStatus, { title: string; body: string }> = {
    waiting_for_triage: { title: "Waiting for triage", body: "The visit is registered and waits for a nurse to complete triage." },
    to_doctor: { title: "Waiting for doctor", body: "Triage is complete and the visit is sent to the assigned doctor." },
    consultation_in_progress: { title: "Consultation In Progress", body: "The doctor has started the consultation." },
    seen: { title: "Seen by the doctor", body: "The doctor has finished the clinical encounter." },
    waiting_for_investigation: { title: "Waiting for Investigation", body: "The doctor ordered investigations. Results are still outstanding." },
    under_nursing_care: { title: "Under Nursing Care", body: "The doctor ordered monitoring for the nurse." },
    encounter_complete: { title: "Encounter Complete", body: encounterCompleteBody(visit) },
    referred: { title: "Referred", body: "The doctor referred the patient." },
    pending_payment: { title: "Pending payment", body: "The visit is encounter complete and ready to be paid." },
    patient_left: { title: "Patient Left", body: "The patient left before being sent to the doctor." },
  };
  return { status, ...copy[status] };
}

function registrationStep(): WorkflowStep {
  return {
    status: "registered",
    title: "Registration",
    body: "The visit is registered and the patient enters the care path.",
  };
}

function careSteps(visit: PatientVisit, investigations: VisitInvestigation[], now: number): WorkflowStep[] {
  const shared: WorkflowStep[] = [
    {
      status: "waiting_for_triage",
      title: "Waiting for triage",
      body: "The visit is registered and waits for a nurse to complete triage.",
    },
    {
      status: "to_doctor",
      title: "Waiting for doctor",
      body: "Triage is complete and the visit is sent to the assigned doctor.",
    },
  ];
  if (visit.status === "patient_left") {
    return [shared[0], { status: "patient_left", title: "Patient Left", body: "The patient left before being sent to the doctor." }];
  }
  if (visit.status === "consultation_in_progress") {
    return [...shared, { status: "consultation_in_progress", title: "Consultation In Progress", body: "The doctor has started the consultation." }];
  }
  if (visit.status === "seen") {
    return [...shared, { status: "seen", title: "Seen by the doctor", body: "The doctor has finished the clinical encounter." }];
  }
  if (visit.status === "encounter_complete") {
    return [...shared, { status: "encounter_complete", title: "Encounter Complete", body: encounterCompleteBody(visit) }];
  }
  if (visit.status === "referred") {
    return [...shared, { status: "referred", title: "Referred", body: "The doctor referred the patient." }];
  }
  if (visit.status === "under_nursing_care") {
    return [...shared, { status: "under_nursing_care", title: "Under Nursing Care", body: "The doctor ordered monitoring for the nurse." }];
  }
  if (visit.status === "waiting_for_investigation") {
    const investigation = investigationPhaseSteps(visit, investigations, now);
    const monitoring: WorkflowStep = { status: "under_nursing_care", title: "Under Nursing Care", body: "The doctor also ordered monitoring for the nurse." };
    return visit.monitoring_status === "in_progress" ? [...shared, ...investigation, monitoring] : [...shared, ...investigation];
  }
  if (visit.status === "pending_payment") {
    return [
      ...shared,
      { status: "encounter_complete", title: "Encounter Complete", body: encounterCompleteBody(visit) },
      { status: "pending_payment", title: "Pending payment", body: "The visit is encounter complete and ready to be paid." },
    ];
  }
  return shared;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5 9.2 17 19 7" />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </svg>
  );
}

function DoctorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 20v-2a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v2" />
      <circle cx="12" cy="8" r="3" />
      <path d="M19 8v4" />
      <path d="M17 10h4" />
    </svg>
  );
}
