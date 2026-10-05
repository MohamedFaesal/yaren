import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type PatientVisit, type User } from "../api";
import { canAct } from "../access";
import { useToast } from "../toast";
import { visitDocumentAccept, visitDocumentIssue, visitDocumentMeta, visitDocumentSizeLabel } from "../visitDocuments";
import { AgeBadge, Card, ConfirmDialog, Detail, IconAction, Page, Section, Summary, formatWhen, messageOf, secondary } from "./ui";

export function VisitViewPage({ token, actor }: { token: string; actor: User }) {
  const { patientId, id } = useParams();
  const navigate = useNavigate();
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
      title={visit ? `${visit.clinic_name} visit` : "Visit"}
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
          <Card>
            <Section index="1" title="Stay" />
            <Detail items={[
              { label: "Clinic", value: visit.clinic_name },
              { label: "Hotel", value: visit.hotel_name },
              { label: "Room", value: visit.hotel_room_no || "—" },
              { label: "Check-in", value: visit.hotel_checkin_date || "—" },
              { label: "Check-out", value: visit.hotel_checkout_date || "—" },
              {
                label: "Age at visit",
                value: visit.patient_age_at_visit != null
                  ? <span className="inline-flex items-center gap-2"><AgeBadge age={visit.patient_age_at_visit} /><span className="text-sm font-medium text-muted-strong">at visit</span></span>
                  : "—",
              },
              { label: "Passport number", value: visit.passport_number || "—" },
              { label: "Preferred contact", value: visit.preferred_contact_method ? titleCase(visit.preferred_contact_method) : "—" },
            ]} />
            <div className="mt-6"><Section index="2" title="Emergency contact" /></div>
            <Detail items={[
              { label: "Name", value: visit.emergency_contact_name || "—" },
              { label: "Phone", value: visit.emergency_contact_phone || "—" },
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
          <Summary
            title={visit.patient_name ?? "Patient"}
            lines={[
              visit.patient_mrn ?? "MRN",
              visit.patient_age_at_visit != null ? <AgeBadge age={visit.patient_age_at_visit} /> : "Age unknown",
              visit.clinic_name,
              visit.hotel_room_no ? `Room ${visit.hotel_room_no}` : "Room not set",
            ]}
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

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
