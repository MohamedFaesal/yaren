import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, type PatientVisit, type User, type VisitCareStatus } from "../api";
import { canAct } from "../access";
import { useToast } from "../toast";
import { visitDocumentAccept, visitDocumentIssue, visitDocumentMeta, visitDocumentSizeLabel } from "../visitDocuments";
import { AgeBadge, Card, ConfirmDialog, Detail, IconAction, Page, SecretValue, Section, Summary, formatWhen, messageOf, secondary } from "./ui";

export function VisitViewPage({ token, actor }: { token: string; actor: User }) {
  const { patientId, id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "workflow" ? "workflow" : "details";
  const toast = useToast();
  const [visit, setVisit] = useState<PatientVisit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [fileError, setFileError] = useState<{ type: string; message: string } | null>(null);
  const canWrite = canAct(actor, "visit", "update", { ownerId: visit?.patient_added_by, clinicId: visit?.clinic_id })
    || canAct(actor, "visit", "create", { clinicId: visit?.clinic_id });
  const canDelete = canAct(actor, "visit", "delete", { ownerId: visit?.patient_added_by, clinicId: visit?.clinic_id });

  useEffect(() => {
    api<PatientVisit>(`/api/patients/${patientId}/visits/${id}`, {}, token).then(setVisit).catch((caught) => setError(messageOf(caught)));
  }, [patientId, id, token]);

  async function uploadDocument(documentType: string, file: File) {
    if (!patientId || !id) return;
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
        `/api/patients/${patientId}/visits/${id}/documents/${documentType}`,
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
          <VisitStatus status={visit.status} />
        </span>
      ) : "Visit"}
      description={visit
        ? `${visit.patient_name ?? "Patient"} · ${visit.patient_mrn ?? ""}${visit.patient_age_at_visit != null ? ` · ${visit.patient_age_at_visit} years at visit` : ""}`
        : "Visit details"}
      crumbs={[
        { label: "Patients", to: "/patients" },
        { label: visit?.patient_name ?? "Patient", to: `/patients/${patientId}?tab=visits` },
        { label: "Visit" },
      ]}
      action={
        <>
          <Link className={secondary} to={`/patients/${patientId}?tab=visits`}>Back to patient</Link>
          {canWrite ? <IconAction kind="edit" to={`/patients/${patientId}/visits/${id}/edit`} /> : null}
          {canDelete ? <IconAction kind="delete" onClick={() => { setDeleteError(null); setConfirmOpen(true); }} /> : null}
        </>
      }
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {visit ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="mb-5 flex gap-2 border-b border-line-soft" role="tablist" aria-label="Visit sections">
              <TabButton selected={tab === "details"} onClick={() => setParams({}, { replace: true })}>Details</TabButton>
              <TabButton selected={tab === "workflow"} onClick={() => setParams({ tab: "workflow" }, { replace: true })}>Workflow</TabButton>
            </div>
            {tab === "workflow" ? <VisitWorkflow visit={visit} /> : <VisitDetails
              visit={visit}
              canWrite={canWrite}
              uploadingType={uploadingType}
              fileError={fileError}
              uploadDocument={uploadDocument}
            />}
          </div>
          <Summary
            title={visit.patient_name ?? "Patient"}
            lines={[
              visit.patient_mrn ?? "MRN",
              <VisitStatus status={visit.status} />,
              visit.assigned_doctor_name ? `Doctor: ${visit.assigned_doctor_name}` : null,
              visit.patient_age_at_visit != null ? <AgeBadge age={visit.patient_age_at_visit} /> : "Age unknown",
              visit.clinic_name,
              visit.hotel_room_no ? <SecretValue value={`Room ${visit.hotel_room_no}`} /> : "Room not set",
              canAct(actor, "triage", "view", { ownerId: visit.patient_added_by, clinicId: visit.clinic_id })
                ? <Link className="font-semibold text-blue hover:underline" to="/patients/triage">Open triage queue</Link>
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
          api(`/api/patients/${patientId}/visits/${id}`, { method: "DELETE" }, token)
            .then(() => {
              toast.success("Visit deleted", `The visit for ${visit?.patient_name ?? "the patient"} was removed.`);
              navigate(`/patients/${patientId}?tab=visits`);
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

function VisitStatus({ status }: { status?: VisitCareStatus }) {
  if (status === "to_doctor") {
    return <span className="inline-flex rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">To see the doctor</span>;
  }
  if (status === "waiting_for_triage") {
    return <span className="inline-flex rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">Waiting for triage</span>;
  }
  return <span className="text-muted">—</span>;
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
              <VisitStatus status={visit.status} />
              {visit.status_changed_at ? <span className="text-sm font-medium text-muted-strong">{formatWhen(visit.status_changed_at)}</span> : null}
            </span>
          ),
        },
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

const workflowSteps: { status: VisitCareStatus; title: string; body: string }[] = [
  {
    status: "waiting_for_triage",
    title: "Waiting for triage",
    body: "The visit is registered and waits for a nurse to complete triage.",
  },
  {
    status: "to_doctor",
    title: "To see the doctor",
    body: "Triage is complete and the visit is sent to the assigned doctor.",
  },
];

function VisitWorkflow({ visit }: { visit: PatientVisit }) {
  const current = visit.status === "to_doctor" ? 1 : 0;
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue">Care path</p>
          <h2 className="mt-1 text-lg font-bold text-ink">{current === 1 ? "With the doctor" : "Waiting for triage"}</h2>
          <p className="mt-1 text-sm text-muted-strong">Registration, triage, then the doctor.</p>
        </div>
        <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-blue">Step {current + 1} of 2</span>
      </div>
      <div className="mt-5 flex gap-2" aria-hidden="true">
        <span className={`h-1.5 flex-1 rounded-full ${current === 0 ? "bg-blue" : "bg-success"}`} />
        <span className={`h-1.5 flex-1 rounded-full ${current >= 1 ? "bg-blue" : "bg-line"}`} />
      </div>
      <ol className="mt-7">
        {workflowSteps.map((step, index) => {
          const state = index < current ? "done" : index === current ? "current" : "next";
          const event = visit.status_history?.find((item) => item.to_status === step.status);
          const reached = index <= current;
          const when = reached
            ? event?.created_at ?? (step.status === "waiting_for_triage" ? visit.created_at : visit.status_changed_at)
            : null;
          const last = index === workflowSteps.length - 1;
          return (
            <li key={step.status} className="triage-rise relative flex gap-4" style={{ animationDelay: `${index * 90}ms` }}>
              <div className="flex w-11 shrink-0 flex-col items-center">
                <span
                  className={`grid h-11 w-11 place-items-center rounded-full ${state === "current" ? "care-pulse bg-blue text-white" : state === "done" ? "bg-success text-white" : "bg-surface-3 text-muted"}`}
                  aria-hidden="true"
                >
                  {state === "done" ? <CheckIcon /> : step.status === "waiting_for_triage" ? <QueueIcon /> : <DoctorIcon />}
                </span>
                {last ? null : <span className={`my-1.5 w-0.5 flex-1 rounded-full ${index < current ? "bg-success" : "bg-line"}`} />}
              </div>
              <div
                className={`min-w-0 flex-1 rounded-2xl px-4 py-3.5 ${last ? "" : "mb-3"} ${state === "current" ? "bg-panel shadow-[0_8px_24px_rgba(47,111,237,0.08)]" : state === "done" ? "bg-success-soft" : "bg-surface-2"}`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`font-semibold ${state === "next" ? "text-muted-strong" : "text-ink"}`}>{step.title}</p>
                  {state === "current" ? <span className="rounded-full bg-blue px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Now</span> : null}
                  {state === "done" ? <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success">Done</span> : null}
                </div>
                <p className="mt-1 text-sm text-muted-strong">{step.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {when ? <span className="rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-muted-strong">{formatWhen(when)}</span> : <span className="rounded-lg bg-white/70 px-2.5 py-1 text-xs font-medium text-muted">Still ahead</span>}
                  {event?.changed_by_name ? <span className="rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-muted-strong">{event.changed_by_name}</span> : null}
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
