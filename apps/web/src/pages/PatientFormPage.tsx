import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type Patient, type User } from "../api";
import { canAct } from "../access";
import { NationalityLabel, nationalityOption } from "../nationalities";
import { useToast } from "../toast";
import { Card, Field, Page, PlusIcon, SearchSelect, Section, Summary, field, messageOf, primary, secondary, useFieldErrors } from "./ui";

const genderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export function PatientFormPage({ token, actor }: { token: string; actor: User }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const fields = useFieldErrors();
  const [name, setName] = useState("");
  const [mrn, setMrn] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [nationality, setNationality] = useState("Egyptian");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [identity, setIdentity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [alternativePhone, setAlternativePhone] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const canWrite = id ? canAct(actor, "patient", "update", { ownerId }) : canAct(actor, "patient", "create");

  useEffect(() => {
    api<string[]>("/api/nationalities", {}, token).then(setNationalities).catch((caught) => setError(messageOf(caught)));
  }, [token]);

  useEffect(() => {
    if (!id) return;
    api<Patient>(`/api/patients/${id}`, {}, token).then((patient) => {
      setName(patient.name);
      setMrn(patient.mrn);
      setBirthdate(patient.birthdate);
      setNationality(patient.nationality);
      setGender(patient.gender);
      setIdentity(patient.identity_number ?? "");
      setPhone(patient.phone_number ?? "");
      setEmail(patient.email ?? "");
      setAlternativePhone(patient.alternative_phone_number ?? "");
      setHomeAddress(patient.home_address ?? "");
      setOwnerId(patient.added_by);
    }).catch((caught) => setError(messageOf(caught)));
  }, [id, token]);

  return (
    <Page
      title={id ? "Edit patient" : "New patient"}
      description={id ? "Update this patient record. The medical record number cannot change." : "Create a patient record. A medical record number is assigned automatically."}
      crumbs={id
        ? [{ label: "Patients", to: "/patients" }, { label: name || "Patient", to: `/patients/${id}` }, { label: "Edit" }]
        : [{ label: "Patients", to: "/patients" }, { label: "New patient" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <form noValidate onSubmit={async (event) => {
            event.preventDefault();
            if (!canWrite) return;
            if (!fields.validateForm(event.currentTarget)) return;
            setPending(true);
            setError(null);
            const body = {
              name,
              birthdate,
              nationality,
              gender,
              identity_number: identity,
              email,
              phone_number: phone,
              alternative_phone_number: alternativePhone,
              home_address: homeAddress,
            };
            try {
              if (id) {
                await api(`/api/patients/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
                toast.success("Patient updated", `${name} was saved.`);
                navigate(`/patients/${id}`);
              } else {
                const created = await api<{ id: string }>("/api/patients", { method: "POST", body: JSON.stringify(body) }, token);
                toast.success("Patient created", `${name} was added to the records.`);
                navigate(`/patients/${created.id}`);
              }
            } catch (caught) {
              const message = messageOf(caught);
              const mapped = fields.applyServerMessage(message);
              setError(Object.keys(mapped).length ? null : message);
              toast.error("Couldn't save patient", message);
            } finally {
              setPending(false);
            }
          }}>
            <Section index="1" title="Patient information" />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name" error={fields.errorOf("name")}>
                <input className={field} name="name" value={name} onChange={(event) => { setName(event.target.value); fields.clearField("name"); }} placeholder="Ahmed Hassan" required disabled={!canWrite} />
              </Field>
              {id ? <Field label="MRN"><input className={field} value={mrn} readOnly disabled /></Field> : <p className="self-end text-sm text-muted">MRN is set automatically when you save.</p>}
              <Field label="Birth date" error={fields.errorOf("birthdate")}>
                <input className={field} name="birthdate" type="date" value={birthdate} onChange={(event) => { setBirthdate(event.target.value); fields.clearField("birthdate"); }} required disabled={!canWrite} />
              </Field>
              <Field label="Passport / National ID" error={fields.errorOf("identity_number")}>
                <input className={field} name="identity_number" value={identity} onChange={(event) => { setIdentity(event.target.value); fields.clearField("identity_number"); }} placeholder="A12345678" required disabled={!canWrite} />
              </Field>
              <Field label="Biological Gender" error={fields.errorOf("gender")}>
                <SearchSelect name="gender" value={gender} onChange={(value) => { setGender(value as "male" | "female"); fields.clearField("gender"); }} options={genderOptions} placeholder="Choose biological gender" disabled={!canWrite} required />
              </Field>
              <Field className="md:col-span-2" label="Nationality" error={fields.errorOf("nationality")}>
                <SearchSelect
                  name="nationality"
                  value={nationality}
                  onChange={(value) => { setNationality(value); fields.clearField("nationality"); }}
                  options={nationalities.map(nationalityOption)}
                  placeholder="Search nationality"
                  disabled={!canWrite}
                  required
                />
              </Field>
            </div>
            <div className="mt-6"><Section index="2" title="Contact" /></div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Email" error={fields.errorOf("email")}>
                <input className={field} name="email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); fields.clearField("email"); }} placeholder="Optional" disabled={!canWrite} />
              </Field>
              <Field label="Phone" error={fields.errorOf("phone_number")}>
                <input className={field} name="phone_number" value={phone} onChange={(event) => { setPhone(event.target.value); fields.clearField("phone_number"); }} placeholder="01012345678" disabled={!canWrite} />
              </Field>
              <Field label="Alternative phone" error={fields.errorOf("alternative_phone_number")}>
                <input className={field} name="alternative_phone_number" value={alternativePhone} onChange={(event) => { setAlternativePhone(event.target.value); fields.clearField("alternative_phone_number"); }} placeholder="Optional" disabled={!canWrite} />
              </Field>
              <Field className="md:col-span-2" label="Home address" error={fields.errorOf("home_address")}>
                <textarea className={`${field} min-h-24`} name="home_address" value={homeAddress} onChange={(event) => { setHomeAddress(event.target.value); fields.clearField("home_address"); }} placeholder="Optional" disabled={!canWrite} />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Link className={secondary} to={id ? `/patients/${id}` : "/patients"}>{id ? "Cancel" : "Back"}</Link>
              <button className={primary} disabled={pending || !canWrite}>{pending ? "Saving" : id ? "Save patient" : <><PlusIcon />Create patient</>}</button>
            </div>
          </form>
        </Card>
        <Summary title={name || "New patient"} lines={[id ? mrn || "MRN" : "MRN on save", identity || "Passport / National ID", nationality ? <NationalityLabel nationality={nationality} /> : "Nationality", gender === "female" ? "Female" : "Male"]} />
      </div>
    </Page>
  );
}
