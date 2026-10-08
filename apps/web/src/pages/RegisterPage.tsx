import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type Clinic, type Patient, type PatientMatch, type PatientVisit, type User } from "../api";
import { canAct } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { nationalityOption } from "../nationalities";
import { useToast } from "../toast";
import { type VisitDocumentMeta, type VisitDocumentType, visitDocumentAccept, visitDocumentIssue, visitDocumentMeta, visitDocumentSizeLabel } from "../visitDocuments";
import { Card, CollapsibleSection, Field, Page, PlusIcon, SearchSelect, SectionSummaryItem, Summary, field, messageOf, primary, secondary, useFieldErrors } from "./ui";

type RegisterSection = "patient" | "contact" | "hotel" | "consent";

const sectionFields: Record<RegisterSection, string[]> = {
  patient: ["name", "birthdate", "nationality", "passport_number", "gender"],
  contact: [
    "phone_number",
    "alternative_phone_number",
    "email",
    "preferred_contact_method",
    "home_address",
    "emergency_contact_name",
    "emergency_contact_phone",
    "emergency_contact_relationship",
  ],
  hotel: ["clinic_id", "hotel_room_no", "hotel_checkin_date", "hotel_checkout_date"],
  consent: visitDocumentMeta.map((item) => `document_${item.type}`),
};

const genderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

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

export function RegisterPage({ token, actor }: { token: string; actor: User }) {
  const navigate = useNavigate();
  const toast = useToast();
  const fields = useFieldErrors();
  const [passport, setPassport] = useState("");
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [nationality, setNationality] = useState("Egyptian");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [alternativePhone, setAlternativePhone] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [contact, setContact] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [room, setRoom] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [documents, setDocuments] = useState<Partial<Record<VisitDocumentType, File | null>>>({});
  const [linkedPatient, setLinkedPatient] = useState<PatientMatch | null>(null);
  const [matches, setMatches] = useState<PatientMatch[]>([]);
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchMode, setMatchMode] = useState<"lookup" | "confirm">("lookup");
  const [matchChecked, setMatchChecked] = useState(false);
  const [matchPending, setMatchPending] = useState(false);
  const [matchNote, setMatchNote] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<RegisterSection, boolean>>({
    patient: true,
    contact: true,
    hotel: true,
    consent: true,
  });
  const { clinicId: activeClinicId } = useActiveClinic();
  const canRegister = canAct(actor, "patient", "create") && canAct(actor, "visit", "create");
  const selectedClinic = clinics.find((clinic) => clinic.id === clinicId);
  const contactLabel = contactOptions.find((option) => option.value === contact)?.label;
  const relationshipLabel = relationshipOptions.find((option) => option.value === relationship)?.label;
  const requiredDocuments = visitDocumentMeta.filter((item) => item.required);
  const optionalDocuments = visitDocumentMeta.filter((item) => !item.required);
  const requiredAttached = requiredDocuments.filter((item) => documents[item.type]).length;
  const optionalAttached = optionalDocuments.filter((item) => documents[item.type]).length;

  function assignDocument(type: VisitDocumentType, file: File | null) {
    const fieldName = `document_${type}`;
    if (!file) {
      setDocuments((current) => ({ ...current, [type]: null }));
      fields.clearField(fieldName);
      return;
    }
    const issue = visitDocumentIssue(file);
    if (issue) {
      fields.setErrors((current) => ({ ...current, [fieldName]: issue }));
      return;
    }
    setDocuments((current) => ({ ...current, [type]: file }));
    fields.clearField(fieldName);
  }

  function matchSignalCount() {
    let count = 0;
    if (name.trim().length >= 2) count += 1;
    if (/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) count += 1;
    if (passport.trim().length >= 2) count += 1;
    return count;
  }

  async function loadMatches() {
    const params = new URLSearchParams();
    if (name.trim()) params.set("name", name.trim());
    if (gender) params.set("gender", gender);
    if (phone.trim()) params.set("phone", phone.trim());
    if (nationality) params.set("nationality", nationality);
    if (birthdate) params.set("birthdate", birthdate);
    if (passport.trim()) params.set("passport", passport.trim());
    const result = await api<{ matches: PatientMatch[] }>(`/api/patients/match?${params}`, {}, token);
    return result.matches;
  }

  function applyMatch(patient: PatientMatch) {
    setLinkedPatient(patient);
    setName(patient.name);
    setBirthdate(patient.birthdate);
    setNationality(patient.nationality);
    setGender(patient.gender);
    setPassport(patient.identity_number || patient.last_passport || "");
    setEmail(patient.email ?? "");
    setPhone(patient.phone_number ?? "");
    setAlternativePhone(patient.alternative_phone_number ?? "");
    setHomeAddress(patient.home_address ?? "");
    setContact(patient.last_visit?.preferred_contact_method ?? "");
    setEmergencyName(patient.last_visit?.emergency_contact_name ?? "");
    setEmergencyPhone(patient.last_visit?.emergency_contact_phone ?? "");
    setRelationship(patient.last_visit?.emergency_contact_relationship ?? "");
    setMatchChecked(true);
    setMatchOpen(false);
    setMatchNote(`Visit will be added to ${patient.name} (${patient.mrn}).`);
    setOpenSections((current) => ({ ...current, patient: true, contact: true }));
  }

  function clearLinkedPatient() {
    setLinkedPatient(null);
    setMatchChecked(false);
    setMatchNote(null);
  }

  async function findMatches() {
    if (!canRegister) return;
    if (matchSignalCount() < 2) {
      setMatchNote("Enter at least two of name, birth date, and passport.");
      setMatches([]);
      return;
    }
    setMatchPending(true);
    setError(null);
    try {
      const found = await loadMatches();
      setMatches(found);
      setMatchChecked(true);
      if (found.length === 0) {
        setMatchOpen(false);
        setMatchNote("No matching patients. Register will create a new record.");
        return;
      }
      setMatchMode("lookup");
      setMatchOpen(true);
      setMatchNote(found.length === 1 ? "1 matching patient." : `${found.length} matching patients.`);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setMatchPending(false);
    }
  }

  async function saveRegistration(existingId: string | null) {
    setPending(true);
    setError(null);
    setMatchOpen(false);
    const passportValue = passport.trim();
    const visit = {
      passport_number: passportValue,
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
      const created = await api<{ patient: Patient; visit: PatientVisit }>("/api/patients/register", {
        method: "POST",
        body: JSON.stringify(existingId
          ? { patient_id: existingId, identity_number: passportValue, visit }
          : {
            identity_number: passportValue,
            patient: {
              name,
              birthdate,
              nationality,
              gender,
              email,
              phone_number: phone,
              alternative_phone_number: alternativePhone,
              home_address: homeAddress,
            },
            visit,
          }),
      }, token);
      for (const item of visitDocumentMeta) {
        const file = documents[item.type];
        if (!file) continue;
        const body = new FormData();
        body.append("file", file);
        await api(
          `/api/patients/${created.patient.id}/visits/${created.visit.id}/documents/${item.type}`,
          { method: "POST", body },
          token,
        );
      }
      toast.success(
        existingId ? "Visit added" : "Patient registered",
        existingId
          ? `A visit was added for ${created.patient.name}.`
          : `${created.patient.name} was registered with a new visit.`,
      );
      navigate(`/patients/${created.patient.id}/visits/${created.visit.id}`);
    } catch (caught) {
      const message = messageOf(caught);
      const mapped = fields.applyServerMessage(message);
      openSectionsForErrors(Object.keys(mapped));
      setError(Object.keys(mapped).length ? null : message);
      toast.error(existingId ? "Couldn't add visit" : "Couldn't complete registration", message);
    } finally {
      setPending(false);
    }
  }

  function toggleSection(section: RegisterSection) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function openSectionsForErrors(fieldNames: string[]) {
    if (fieldNames.length === 0) return;
    setOpenSections((current) => {
      const next = { ...current };
      for (const section of Object.keys(sectionFields) as RegisterSection[]) {
        if (sectionFields[section].some((name) => fieldNames.includes(name))) next[section] = true;
      }
      return next;
    });
  }

  useEffect(() => {
    api<Clinic[]>("/api/clinics?for=visit", {}, token).then(setClinics).catch(() => setClinics([]));
    api<string[]>("/api/nationalities", {}, token).then(setNationalities).catch(() => setNationalities([]));
  }, [token]);

  useEffect(() => {
    setClinicId((current) => {
      if (activeClinicId && clinics.some((item) => item.id === activeClinicId)) return activeClinicId;
      if (current && clinics.some((item) => item.id === current)) return current;
      return clinics.length === 1 ? clinics[0].id : current;
    });
  }, [activeClinicId, clinics]);

  return (
    <Page
      title="Register"
      description="Register a patient and their hotel clinic visit."
      crumbs={[{ label: "Patients", to: "/patients" }, { label: "Register" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <form
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              if (!canRegister) return;
              if (!fields.validateForm(event.currentTarget)) {
                const invalid = Array.from(event.currentTarget.elements)
                  .filter((element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
                    element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)
                  .filter((element) => element.name && !element.disabled && !element.validity.valid)
                  .map((element) => element.name);
                openSectionsForErrors(invalid);
                return;
              }
              const missingDocs = visitDocumentMeta.filter((item) => item.required && !documents[item.type]).map((item) => `document_${item.type}`);
              if (missingDocs.length > 0) {
                fields.setErrors(Object.fromEntries(missingDocs.map((name) => [name, "This file is required."])));
                openSectionsForErrors(missingDocs);
                setError("Upload the required consent and privacy files.");
                return;
              }
              if (!linkedPatient && !matchChecked) {
                setMatchPending(true);
                setError(null);
                try {
                  const found = await loadMatches();
                  if (found.length > 0) {
                    setMatches(found);
                    setMatchMode("confirm");
                    setMatchOpen(true);
                    return;
                  }
                  setMatchChecked(true);
                } catch (caught) {
                  setError(messageOf(caught));
                  return;
                } finally {
                  setMatchPending(false);
                }
              }
              await saveRegistration(linkedPatient?.id ?? null);
            }}
          >
            <div className="space-y-4">
              <CollapsibleSection
                index="1"
                title="Patient details"
                open={openSections.patient}
                onToggle={() => toggleSection("patient")}
                summary={(
                  <>
                    <SectionSummaryItem label="Name" value={name} />
                    <SectionSummaryItem label="Passport / ID" value={passport} />
                    <SectionSummaryItem label="Nationality" value={nationality} />
                    <SectionSummaryItem label="Gender" value={gender ? gender.slice(0, 1).toUpperCase() + gender.slice(1) : ""} />
                  </>
                )}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Full name" error={fields.errorOf("name")}>
                    <input className={field} name="name" value={name} onChange={(event) => { setName(event.target.value); fields.clearField("name"); }} placeholder="Ahmed Hassan" required disabled={!canRegister} />
                  </Field>
                  <Field label="Birth date" error={fields.errorOf("birthdate")}>
                    <input className={field} name="birthdate" type="date" value={birthdate} onChange={(event) => { setBirthdate(event.target.value); fields.clearField("birthdate"); }} required disabled={!canRegister} />
                  </Field>
                  <Field label="Nationality" error={fields.errorOf("nationality")}>
                    <SearchSelect name="nationality" value={nationality} onChange={(value) => { setNationality(value); fields.clearField("nationality"); }} options={nationalities.map(nationalityOption)} placeholder="Search nationality" disabled={!canRegister} required />
                  </Field>
                  <Field label="Passport / ID" error={fields.errorOf("passport_number")}>
                    <input className={field} name="passport_number" value={passport} onChange={(event) => { setPassport(event.target.value); fields.clearField("passport_number"); }} placeholder="Optional" disabled={!canRegister} />
                  </Field>
                  <Field label="Biological Gender" error={fields.errorOf("gender")}>
                    <SearchSelect name="gender" value={gender} onChange={(value) => { setGender(value as "male" | "female"); fields.clearField("gender"); }} options={genderOptions} placeholder="Choose biological gender" disabled={!canRegister} required />
                  </Field>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                index="2"
                title="Contact information"
                open={openSections.contact}
                onToggle={() => toggleSection("contact")}
                summary={(
                  <>
                    <SectionSummaryItem label="Phone" value={phone} />
                    <SectionSummaryItem label="Email" value={email} />
                    <SectionSummaryItem label="Preferred" value={contact ? contactLabel ?? contact : ""} />
                    <SectionSummaryItem label="Emergency" value={emergencyName || emergencyPhone} />
                    {relationship ? <SectionSummaryItem label="Relationship" value={relationshipLabel ?? relationship} /> : null}
                  </>
                )}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Phone number" error={fields.errorOf("phone_number")}>
                    <input className={field} name="phone_number" value={phone} onChange={(event) => { setPhone(event.target.value); fields.clearField("phone_number"); }} placeholder="01012345678" disabled={!canRegister} />
                  </Field>
                  <Field label="Alternative phone" error={fields.errorOf("alternative_phone_number")}>
                    <input className={field} name="alternative_phone_number" value={alternativePhone} onChange={(event) => { setAlternativePhone(event.target.value); fields.clearField("alternative_phone_number"); }} placeholder="Optional" disabled={!canRegister} />
                  </Field>
                  <Field label="Email" error={fields.errorOf("email")}>
                    <input className={field} name="email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); fields.clearField("email"); }} placeholder="Optional" disabled={!canRegister} />
                  </Field>
                  <Field label="Preferred contact" error={fields.errorOf("preferred_contact_method")}>
                    <SearchSelect name="preferred_contact_method" value={contact} onChange={(value) => { setContact(value); fields.clearField("preferred_contact_method"); }} options={contactOptions} placeholder="Optional" disabled={!canRegister} />
                  </Field>
                  <Field className="md:col-span-2" label="Home address" error={fields.errorOf("home_address")}>
                    <textarea className={`${field} min-h-24`} name="home_address" value={homeAddress} onChange={(event) => { setHomeAddress(event.target.value); fields.clearField("home_address"); }} placeholder="Optional" disabled={!canRegister} />
                  </Field>
                  <Field label="Emergency contact" error={fields.errorOf("emergency_contact_name")}>
                    <input className={field} name="emergency_contact_name" value={emergencyName} onChange={(event) => { setEmergencyName(event.target.value); fields.clearField("emergency_contact_name"); }} placeholder="Optional" disabled={!canRegister} />
                  </Field>
                  <Field label="Emergency phone" error={fields.errorOf("emergency_contact_phone")}>
                    <input className={field} name="emergency_contact_phone" value={emergencyPhone} onChange={(event) => { setEmergencyPhone(event.target.value); fields.clearField("emergency_contact_phone"); }} placeholder="Optional" disabled={!canRegister} />
                  </Field>
                  <Field className="md:col-span-2" label="Relationship" error={fields.errorOf("emergency_contact_relationship")}>
                    <SearchSelect name="emergency_contact_relationship" value={relationship} onChange={(value) => { setRelationship(value); fields.clearField("emergency_contact_relationship"); }} options={relationshipOptions} placeholder="Optional" disabled={!canRegister} />
                  </Field>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                index="3"
                title="Hotel information"
                open={openSections.hotel}
                onToggle={() => toggleSection("hotel")}
                summary={(
                  <>
                    <SectionSummaryItem
                      label="Clinic"
                      value={selectedClinic ? `${selectedClinic.name} · ${selectedClinic.hotel_name}` : ""}
                    />
                    <SectionSummaryItem label="Room" value={room} />
                    <SectionSummaryItem label="Check-in" value={checkin} />
                    <SectionSummaryItem label="Check-out" value={checkout} />
                  </>
                )}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field className="md:col-span-2" label="Clinic / Hotel" error={fields.errorOf("clinic_id")}>
                    <SearchSelect
                      name="clinic_id"
                      value={clinicId}
                      onChange={(value) => { setClinicId(value); fields.clearField("clinic_id"); }}
                      options={clinics.map((clinic) => ({ value: clinic.id, label: `${clinic.name} · ${clinic.hotel_name}` }))}
                      placeholder="Choose clinic and hotel"
                      disabled={!canRegister}
                      required
                    />
                  </Field>
                  <Field label="Hotel room" error={fields.errorOf("hotel_room_no")}>
                    <input className={field} name="hotel_room_no" value={room} onChange={(event) => { setRoom(event.target.value); fields.clearField("hotel_room_no"); }} required disabled={!canRegister} />
                  </Field>
                  <Field label="Check-in date" error={fields.errorOf("hotel_checkin_date")}>
                    <input className={field} name="hotel_checkin_date" type="date" value={checkin} onChange={(event) => { setCheckin(event.target.value); fields.clearField("hotel_checkin_date"); }} disabled={!canRegister} />
                  </Field>
                  <Field label="Check-out date" error={fields.errorOf("hotel_checkout_date")}>
                    <input className={field} name="hotel_checkout_date" type="date" value={checkout} onChange={(event) => { setCheckout(event.target.value); fields.clearField("hotel_checkout_date"); }} disabled={!canRegister} />
                  </Field>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                index="4"
                title="Consent & Privacy"
                open={openSections.consent}
                onToggle={() => toggleSection("consent")}
                summary={(
                  <>
                    <SectionSummaryItem label="Required" value={`${requiredAttached} of ${requiredDocuments.length}`} />
                    <SectionSummaryItem label="Optional" value={optionalAttached ? `${optionalAttached} attached` : "None"} />
                  </>
                )}
              >
                <div className="space-y-5">
                  <p className="text-sm text-muted-strong">PDF, JPEG, PNG, or WebP. Each file must be {visitDocumentSizeLabel} or smaller.</p>
                  <DocumentGroup
                    title="Required"
                    hint="Attach both forms before registering."
                    progress={requiredDocuments.length ? requiredAttached / requiredDocuments.length : 0}
                    count={`${requiredAttached} of ${requiredDocuments.length}`}
                    items={requiredDocuments}
                    documents={documents}
                    disabled={!canRegister}
                    errorOf={fields.errorOf}
                    onPick={assignDocument}
                  />
                  <DocumentGroup
                    title="Optional"
                    hint="Add these if the patient brought them."
                    items={optionalDocuments}
                    documents={documents}
                    disabled={!canRegister}
                    errorOf={fields.errorOf}
                    onPick={assignDocument}
                  />
                </div>
              </CollapsibleSection>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Link className={secondary} to="/patients">Cancel</Link>
              <button className={primary} disabled={pending || matchPending || !canRegister}>
                {pending ? "Saving" : matchPending ? "Checking records" : linkedPatient ? "Add visit" : <><PlusIcon />Register patient</>}
              </button>
            </div>
            {!canRegister ? <p className="mt-3 text-sm text-danger">You do not have permission to register this patient.</p> : null}
          </form>
        </Card>
        <aside className="space-y-5 xl:sticky xl:top-6">
          <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-[0_8px_24px_rgba(16,42,67,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue">Existing records</p>
            <h2 className="mt-2 text-lg font-bold text-ink">Check for a match</h2>
            <p className="mt-2 text-sm leading-6 text-muted-strong">
              A part of the name plus birth date, gender, and nationality is enough. Any two of name, birth date, and passport also count.
            </p>
            {linkedPatient ? (
              <div className="mt-3 rounded-xl bg-success-soft px-3 py-3">
                <p className="text-sm font-semibold text-ink">Visit will be added to {linkedPatient.name}</p>
                <p className="mt-1 text-sm text-muted-strong">{linkedPatient.mrn}</p>
                <button type="button" className="mt-2 text-sm font-semibold text-danger" onClick={clearLinkedPatient}>
                  Register as a new patient
                </button>
              </div>
            ) : null}
            {matchNote ? <p className="mt-3 text-sm text-muted-strong">{matchNote}</p> : null}
            <button type="button" className={`${secondary} mt-4 w-full`} disabled={!canRegister || matchPending || pending} onClick={() => void findMatches()}>
              {matchPending ? "Checking" : "Find matching patients"}
            </button>
          </div>
          <Summary
            title={name || "Registration"}
            lines={[
              passport || "Passport / ID",
              linkedPatient ? linkedPatient.mrn : "MRN on save",
              linkedPatient ? "Existing patient" : "New patient",
              clinics.find((clinic) => clinic.id === clinicId)?.name || "Clinic",
            ]}
          />
        </aside>
      </div>
      <MatchDialog
        open={matchOpen}
        mode={matchMode}
        matches={matches}
        pending={pending}
        onClose={() => { if (!pending) setMatchOpen(false); }}
        onUse={(patient) => {
          if (matchMode === "confirm") void saveRegistration(patient.id);
          else applyMatch(patient);
        }}
        onCreateNew={() => void saveRegistration(null)}
      />
    </Page>
  );
}

function MatchDialog({
  open,
  mode,
  matches,
  pending,
  onClose,
  onUse,
  onCreateNew,
}: {
  open: boolean;
  mode: "lookup" | "confirm";
  matches: PatientMatch[];
  pending: boolean;
  onClose: () => void;
  onUse: (patient: PatientMatch) => void;
  onCreateNew: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, pending]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-shell/45 px-4 py-6" role="presentation" onMouseDown={() => { if (!pending) onClose(); }}>
      <div
        className="flex max-h-full w-full max-w-2xl flex-col rounded-2xl bg-surface p-4 shadow-[0_24px_60px_rgba(11,28,46,0.28)] sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-blue">Existing records</p>
        <h2 id="match-title" className="mt-2 text-xl font-bold text-ink">
          {mode === "confirm" ? "This may be an existing patient" : "Matching patients"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-strong">
          {mode === "confirm"
            ? "A record matches these details. Add the visit to one of them, or register a new patient."
            : "Choose a record to fill the patient and contact sections. The visit is then added to that patient."}
        </p>
        <div className="mt-4 space-y-3 overflow-y-auto pr-1">
          {matches.map((patient) => (
            <article key={patient.id} className="rounded-xl border border-line-soft bg-surface-2 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/patients/${patient.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-blue hover:underline"
                  >
                    {patient.name}
                  </Link>
                  <p className="mt-0.5 text-xs font-semibold text-muted">{patient.mrn}</p>
                  <Link
                    to={`/patients/${patient.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex text-xs font-semibold text-blue hover:underline"
                  >
                    View profile
                  </Link>
                </div>
                <button type="button" className={primary} disabled={pending} onClick={() => onUse(patient)}>
                  {mode === "confirm" ? "Add visit" : "Use this patient"}
                </button>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <MatchDetail label="Gender" value={patient.gender === "female" ? "Female" : "Male"} />
                <MatchDetail label="Nationality" value={patient.nationality} />
                <MatchDetail label="Birth date" value={patient.age != null ? `${patient.birthdate} · ${patient.age} years` : patient.birthdate} />
                <MatchDetail label="Phone" value={patient.phone_number || "—"} />
                <MatchDetail label="Passport / ID" value={patient.identity_number || patient.last_passport || "—"} />
                <MatchDetail label="Visits" value={String(patient.visit_count)} />
                <MatchDetail label="Email" value={patient.email || "—"} />
                <MatchDetail label="Address" value={patient.home_address || "—"} />
              </dl>
              {patient.reasons.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {patient.reasons.map((reason) => (
                    <span key={reason} className="rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-blue">{reason}</span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={`${secondary} w-full sm:w-auto`} disabled={pending} onClick={onClose}>
            {mode === "confirm" ? "Back" : "Close"}
          </button>
          {mode === "confirm" ? (
            <button type="button" className={`${primary} w-full sm:w-auto`} disabled={pending} onClick={onCreateNew}>
              {pending ? "Saving" : "Register as a new patient"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MatchDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentGroup({
  title,
  hint,
  progress,
  count,
  items,
  documents,
  disabled,
  errorOf,
  onPick,
}: {
  title: string;
  hint: string;
  progress?: number;
  count?: string;
  items: VisitDocumentMeta[];
  documents: Partial<Record<VisitDocumentType, File | null>>;
  disabled: boolean;
  errorOf: (name: string) => string | null;
  onPick: (type: VisitDocumentType, file: File | null) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
        {count ? <p className="text-xs font-semibold text-ink">{count}</p> : null}
      </div>
      {progress != null ? (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line-strong" aria-hidden="true">
          <div className="h-full rounded-full bg-blue transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
      <p className="mb-2 text-sm text-muted-strong">{hint}</p>
      <div className="space-y-2">
        {items.map((item) => (
          <DocumentDrop
            key={item.type}
            item={item}
            file={documents[item.type] ?? null}
            error={errorOf(`document_${item.type}`)}
            disabled={disabled}
            onPick={(file) => onPick(item.type, file)}
            onClear={() => onPick(item.type, null)}
          />
        ))}
      </div>
    </div>
  );
}

function DocumentDrop({
  item,
  file,
  error,
  disabled,
  onPick,
  onClear,
}: {
  item: VisitDocumentMeta;
  file: File | null;
  error: string | null;
  disabled: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const tone = error
    ? "border-danger bg-danger-soft"
    : file
      ? "border-line-strong bg-surface"
      : over
        ? "border-blue bg-panel"
        : "border-dashed border-line-strong bg-surface-2";

  return (
    <div
      className={`rounded-xl border px-3 py-3 transition-colors ${tone} ${disabled ? "opacity-60" : ""}`}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        setOver(false);
        const next = event.dataTransfer.files?.[0];
        if (next) onPick(next);
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${file ? "bg-success-soft text-success" : "bg-panel text-blue"}`}>
          {file ? <CheckIcon /> : <FileIcon />}
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <p className="truncate text-sm font-semibold text-ink">{item.label}</p>
          <p className="mt-0.5 truncate text-xs text-muted-strong">
            {file ? `${file.name} · ${formatFileSize(file.size)}` : over ? "Drop to attach" : `Drop a PDF or image, up to ${visitDocumentSizeLabel}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {file ? (
            <button type="button" className="px-2 py-1.5 text-sm font-semibold text-danger" disabled={disabled} onClick={onClear}>
              Remove
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {file ? "Replace" : "Browse"}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm font-medium text-danger" role="alert">{error}</p> : null}
      <input
        ref={inputRef}
        className="sr-only"
        name={`document_${item.type}`}
        type="file"
        accept={visitDocumentAccept}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.files?.[0];
          if (next) onPick(next);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
