import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type Clinic, type Patient, type PatientVisit, type User } from "../api";
import { canAct } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { useToast } from "../toast";
import { type VisitDocumentType, visitDocumentAccept, visitDocumentIssue, visitDocumentMeta, visitDocumentSizeLabel } from "../visitDocuments";
import { Card, Field, Page, PlusIcon, SearchSelect, Section, Summary, field, messageOf, primary, secondary, useFieldErrors } from "./ui";

const contactOptions = [
  { value: "", label: "Not set" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
];

const relationshipOptions = [
  { value: "", label: "Not set" },
  { value: "spouse", label: "Spouse" },
  { value: "girlfriend", label: "Girlfriend" },
  { value: "boyfriend", label: "Boyfriend" },
  { value: "son", label: "Son" },
  { value: "daughter", label: "Daughter" },
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "cousin", label: "Cousin" },
  { value: "grandfather", label: "Grandfather" },
  { value: "grandmother", label: "Grandmother" },
];

export function VisitFormPage({ token, actor }: { token: string; actor: User }) {
  const { patientId, id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const fields = useFieldErrors();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [passport, setPassport] = useState("");
  const [contact, setContact] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [room, setRoom] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [documents, setDocuments] = useState<Partial<Record<VisitDocumentType, File | null>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { clinicId: activeClinicId } = useActiveClinic();
  const canWrite = id
    ? canAct(actor, "visit", "update", { ownerId: patient?.added_by, clinicId: clinicId || undefined })
    : canAct(actor, "visit", "create");

  useEffect(() => {
    api<Patient>(`/api/patients/${patientId}`, {}, token).then((next) => {
      setPatient(next);
      if (!id && next.identity_number) setPassport(next.identity_number);
    }).catch((caught) => setError(messageOf(caught)));
    api<Clinic[]>("/api/clinics?for=visit", {}, token).then(setClinics).catch(() => setClinics([]));
  }, [patientId, token, id]);

  useEffect(() => {
    if (id) return;
    setClinicId((current) => {
      if (activeClinicId && clinics.some((item) => item.id === activeClinicId)) return activeClinicId;
      if (current && clinics.some((item) => item.id === current)) return current;
      return clinics.length === 1 ? clinics[0].id : current;
    });
  }, [activeClinicId, clinics, id]);

  useEffect(() => {
    if (!id || !patientId) return;
    api<PatientVisit>(`/api/patients/${patientId}/visits/${id}`, {}, token).then((visit) => {
      setPassport(visit.passport_number);
      setContact(visit.preferred_contact_method ?? "");
      setEmergencyName(visit.emergency_contact_name ?? "");
      setEmergencyPhone(visit.emergency_contact_phone ?? "");
      setRelationship(visit.emergency_contact_relationship ?? "");
      setCheckin(visit.hotel_checkin_date ?? "");
      setCheckout(visit.hotel_checkout_date ?? "");
      setRoom(visit.hotel_room_no ?? "");
      setClinicId(visit.clinic_id);
    }).catch((caught) => setError(messageOf(caught)));
  }, [id, patientId, token]);

  return (
    <Page
      title={id ? "Edit visit" : "New visit"}
      description={patient ? `Hotel stay details for ${patient.name}.` : "Hotel stay details for this patient."}
      crumbs={[
        { label: "Patients", to: "/patients" },
        { label: patient?.name ?? "Patient", to: `/patients/${patientId}?tab=visits` },
        { label: id ? "Edit visit" : "New visit" },
      ]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <form
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              if (!canWrite || !patientId) return;
              if (!fields.validateForm(event.currentTarget)) return;
              if (!id) {
                const missingDocs = visitDocumentMeta.filter((item) => item.required && !documents[item.type]).map((item) => `document_${item.type}`);
                if (missingDocs.length > 0) {
                  fields.setErrors(Object.fromEntries(missingDocs.map((name) => [name, "This file is required."])));
                  setError("Upload the required consent and privacy files.");
                  return;
                }
              }
              setPending(true);
              setError(null);
              const body = {
                passport_number: passport,
                preferred_contact_method: contact,
                emergency_contact_name: emergencyName,
                emergency_contact_phone: emergencyPhone,
                emergency_contact_relationship: relationship,
                hotel_checkin_date: checkin,
                hotel_checkout_date: checkout,
                hotel_room_no: room,
                clinic_id: clinicId,
              };
              try {
                if (id) {
                  await api(`/api/patients/${patientId}/visits/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
                  toast.success("Visit updated", `Stay details for ${patient?.name ?? "the patient"} were saved.`);
                  navigate(`/patients/${patientId}/visits/${id}`);
                } else {
                  const created = await api<{ id: string }>(`/api/patients/${patientId}/visits`, { method: "POST", body: JSON.stringify(body) }, token);
                  for (const item of visitDocumentMeta) {
                    const file = documents[item.type];
                    if (!file) continue;
                    const upload = new FormData();
                    upload.append("file", file);
                    await api(
                      `/api/patients/${patientId}/visits/${created.id}/documents/${item.type}`,
                      { method: "POST", body: upload },
                      token,
                    );
                  }
                  toast.success("Visit created", `A new visit was added for ${patient?.name ?? "the patient"}.`);
                  navigate(`/patients/${patientId}/visits/${created.id}`);
                }
              } catch (caught) {
                const message = messageOf(caught);
                const mapped = fields.applyServerMessage(message);
                setError(Object.keys(mapped).length ? null : message);
                toast.error("Couldn't save visit", message);
              } finally {
                setPending(false);
              }
            }}
          >
            <Section index="1" title="Stay" />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Clinic" error={fields.errorOf("clinic_id")}>
                <SearchSelect
                  name="clinic_id"
                  value={clinicId}
                  onChange={(value) => { setClinicId(value); fields.clearField("clinic_id"); }}
                  options={clinics.map((clinic) => ({ value: clinic.id, label: `${clinic.name} · ${clinic.hotel_name}` }))}
                  placeholder="Choose clinic"
                  disabled={!canWrite}
                  required
                />
              </Field>
              <Field label="Hotel room" error={fields.errorOf("hotel_room_no")}>
                <input className={field} name="hotel_room_no" value={room} onChange={(event) => { setRoom(event.target.value); fields.clearField("hotel_room_no"); }} required disabled={!canWrite} />
              </Field>
              <Field label="Check-in" error={fields.errorOf("hotel_checkin_date")}>
                <input className={field} name="hotel_checkin_date" type="date" value={checkin} onChange={(event) => { setCheckin(event.target.value); fields.clearField("hotel_checkin_date"); }} disabled={!canWrite} />
              </Field>
              <Field label="Check-out" error={fields.errorOf("hotel_checkout_date")}>
                <input className={field} name="hotel_checkout_date" type="date" value={checkout} onChange={(event) => { setCheckout(event.target.value); fields.clearField("hotel_checkout_date"); }} disabled={!canWrite} />
              </Field>
              <Field label="Passport number" error={fields.errorOf("passport_number")}>
                <input className={field} name="passport_number" value={passport} onChange={(event) => { setPassport(event.target.value); fields.clearField("passport_number"); }} placeholder="Optional" disabled={!canWrite} />
              </Field>
              <Field label="Preferred contact" error={fields.errorOf("preferred_contact_method")}>
                <SearchSelect name="preferred_contact_method" value={contact} onChange={(value) => { setContact(value); fields.clearField("preferred_contact_method"); }} options={contactOptions} placeholder="Optional" disabled={!canWrite} />
              </Field>
            </div>
            <div className="mt-6"><Section index="2" title="Emergency contact" /></div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name" error={fields.errorOf("emergency_contact_name")}>
                <input className={field} name="emergency_contact_name" value={emergencyName} onChange={(event) => { setEmergencyName(event.target.value); fields.clearField("emergency_contact_name"); }} placeholder="Optional" disabled={!canWrite} />
              </Field>
              <Field label="Phone" error={fields.errorOf("emergency_contact_phone")}>
                <input className={field} name="emergency_contact_phone" value={emergencyPhone} onChange={(event) => { setEmergencyPhone(event.target.value); fields.clearField("emergency_contact_phone"); }} placeholder="Optional" disabled={!canWrite} />
              </Field>
              <Field className="md:col-span-2" label="Relationship" error={fields.errorOf("emergency_contact_relationship")}>
                <SearchSelect name="emergency_contact_relationship" value={relationship} onChange={(value) => { setRelationship(value); fields.clearField("emergency_contact_relationship"); }} options={relationshipOptions} placeholder="Not set" disabled={!canWrite} />
              </Field>
            </div>
            {!id ? (
              <>
                <div className="mt-6"><Section index="3" title="Consent & Privacy" /></div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-strong">PDF, JPEG, PNG, or WebP. Each file must be {visitDocumentSizeLabel} or smaller. Required forms must be attached before creating the visit.</p>
                  {visitDocumentMeta.map((item) => {
                    const selected = documents[item.type] ?? null;
                    const fieldName = `document_${item.type}`;
                    const fileError = fields.errorOf(fieldName);
                    return (
                      <div key={item.type}>
                        <p className="text-[13px] font-medium text-muted-strong">
                          {item.label}
                          {item.required ? "" : " (optional)"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                          <label className={`${secondary} cursor-pointer ${!canWrite ? "pointer-events-none opacity-60" : ""}`}>
                            Choose file
                            <input
                              className="sr-only"
                              name={fieldName}
                              type="file"
                              accept={visitDocumentAccept}
                              disabled={!canWrite}
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                if (!file) return;
                                const issue = visitDocumentIssue(file);
                                if (issue) {
                                  fields.setErrors((current) => ({ ...current, [fieldName]: issue }));
                                  return;
                                }
                                setDocuments((current) => ({ ...current, [item.type]: file }));
                                fields.clearField(fieldName);
                              }}
                            />
                          </label>
                          <span className="min-w-0 flex-1 truncate text-sm text-muted-strong">
                            {selected ? selected.name : item.required ? "Required file not selected" : "No file selected"}
                          </span>
                          {selected ? (
                            <button
                              type="button"
                              className="text-sm font-semibold text-danger"
                              disabled={!canWrite}
                              onClick={() => {
                                setDocuments((current) => ({ ...current, [item.type]: null }));
                                fields.clearField(fieldName);
                              }}
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                        {fileError ? <p className="mt-1 text-sm font-medium text-danger" role="alert">{fileError}</p> : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Link className={secondary} to={id ? `/patients/${patientId}/visits/${id}` : `/patients/${patientId}?tab=visits`}>Cancel</Link>
              <button className={primary} disabled={pending || !canWrite}>{pending ? "Saving" : id ? "Save visit" : <><PlusIcon />Create visit</>}</button>
            </div>
          </form>
        </Card>
        <Summary title={patient?.name ?? "Patient"} lines={[patient?.mrn ?? "MRN", clinics.find((clinic) => clinic.id === clinicId)?.name ?? "Clinic", room || "Room"]} />
      </div>
    </Page>
  );
}
