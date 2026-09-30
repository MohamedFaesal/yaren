import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { api } from "./api";
import { Mark } from "./brand";
import { QrMark } from "./qr";

type Pack = {
  encounter: Record<string, string>;
  patient: Record<string, string | boolean | null>;
  triage: Record<string, string | number | null> | null;
  consultation: Record<string, string | null> & { exam_systems?: Record<string, string> | null } | null;
  report: Record<string, string | null> | null;
  invoice: Record<string, string | number | null> | null;
  lines: Record<string, string | number>[];
  payments?: Record<string, string | number | null>[];
  items: Record<string, string | number>[];
      investigations: { request_no: string; tests: string[]; priority: string; indication: string; anatomical_site?: string; contrast?: boolean; safety_acknowledged?: boolean; diagnosis?: string; icd10?: string; status?: string; created_at?: string; safety?: Record<string, string | string[] | undefined> | null }[];
  claim?: { claim_no: string; status: string; claim_type: string; amount: number | null; settlement_amount: number | null; insurer_reference: string | null; authorization_ref: string | null; rejection_reason: string | null; created_at: string; channel: string | null; submittedAt: string | null; submissionVersion: string | null } | null;
  coverage: Record<string, string | null> | null;
  referral: Record<string, string | null> | null;
  transfer: Record<string, string | null> | null;
  physician: { display_name: string; license_no: string | null } | null;
  amendments: { reason: string; target: string; created_at: string }[];
  notes?: { note: string; follow_up: string | null; follow_up_due: string | null; created_at: string }[];
  prescription?: { rx_no: string; indication: string | null; instructions: string | null; follow_up: string | null; created_at: string; pharmacist: string | null; dispensed_at: string | null } | null;
  prescriptionSignedAt?: string | null;
  settings: Record<string, string>;
};

export function Documents({ token }: { token: string }) {
  const { id = "" } = useParams();
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Pack>(`/api/yaren/encounters/${id}/pack`, {}, token).then(setPack).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not open the documents"));
  }, [id, token]);
  if (error) return <p className="error">{error}</p>;
  if (!pack) return <p>Preparing the clinical pack…</p>;
  const patient = pack.patient;
  const name = `${patient.given_name ?? ""} ${patient.family_name ?? ""}`;
  return (
    <section>
      <div className="top no-print"><div><p className="muted">Clinical document pack</p><h1>{name}</h1></div><button type="button" className="primary" onClick={() => window.print()}>Print pack</button></div>
      <Sheet title="Patient information · OPE-08" code="OPE-08">
        <Grid rows={[["Name", name], ["MRN", String(patient.medical_record_number ?? "")], ["Date of birth", String(patient.date_of_birth ?? "")], ["Nationality", String(patient.nationality ?? "")], ["Phone", String(patient.phone ?? "")], ["Email", String(patient.email ?? "")], ["Hotel", String(patient.hotel_name ?? "")], ["City", String(patient.hotel_city ?? "")], ["Room", String(patient.room_no ?? "")], ["Arrival", String(patient.arrival_date ?? "")], ["Departure", String(patient.departure_date ?? "")], ["Passport", String(patient.passport_no ?? "")], ["Insurer", String(patient.insurer_name ?? "")], ["Policy", String(patient.policy_number ?? "")], ["Tour operator", String(patient.tour_operator ?? "")], ["Allergies", String(patient.allergies ?? "")], ["Past history", String(patient.chronic_conditions ?? "")], ["Regular medications", String(patient.regular_medications ?? "")]]} />
        <p>The guest confirms this information and agrees to pay incidental costs not covered before departure.</p>
      </Sheet>
      <Sheet title="Consent for examination and treatment" code="YH-CON-001">
        <p>{name} agrees to examination, treatment, and the sharing of clinical information required for care, referral, and insurance. Recorded: {String(patient.consent_recorded_at ?? "Not yet recorded")}</p>
      </Sheet>
      <Sheet title="Standard medical report" code="YH-CLN-RPT-001">
        <h3>1. Patient and stay</h3>
        <Grid rows={[["Name", name], ["MRN", text(patient.medical_record_number)], ["Date of birth", text(patient.date_of_birth)], ["Sex", text(patient.sex)], ["Nationality", text(patient.nationality)], ["Passport", text(patient.passport_no)], ["Phone", text(patient.phone)], ["Email", text(patient.email)], ["Hotel", text(patient.hotel_name)], ["City", text(patient.hotel_city)], ["Room", text(patient.room_no)], ["Arrival", text(patient.arrival_date)], ["Departure", text(patient.departure_date)], ["Insurer", text(patient.insurer_name)], ["Policy", text(patient.policy_number)], ["Coverage", pack.coverage?.status ?? ""], ["Tour operator", text(patient.tour_operator)]]} />
        <h3>2. Encounter</h3>
        <Grid rows={[["Encounter", pack.encounter.encounter_no], ["Visit", pack.encounter.visit_type], ["Arrived", pack.encounter.arrival_at ? new Date(pack.encounter.arrival_at).toLocaleString() : ""], ["Place of care", pack.encounter.visit_type === "room_visit" ? "Guest room" : "Clinic"], ["Triage", text(pack.triage?.category)], ["Physician", pack.consultation?.display_name ?? pack.physician?.display_name ?? ""], ["License", pack.consultation?.license_no ?? pack.physician?.license_no ?? ""]]} />
        <h3>3. Clinical assessment</h3>
        <Grid rows={[["Complaint", text(pack.consultation?.chief_complaint ?? pack.triage?.chief_complaint)], ["History", pack.consultation?.hpi ?? ""], ["Past history", pack.consultation?.past_history ?? text(patient.chronic_conditions)], ["Allergies", text(patient.allergies || pack.consultation?.allergies || "NKDA")], ["Regular medications", text(patient.regular_medications)], ["Consent", text(patient.consent_recorded_at)], ["Examination", pack.consultation?.examination ?? ""], ["Findings", pack.report?.findings ?? ""]]} />
        <Vitals triage={pack.triage} />
        {pack.consultation?.exam_systems ? <Grid rows={Object.entries(pack.consultation.exam_systems).map(([label, value]) => [label, value ?? ""])} /> : null}
        {pack.investigations.length ? <p>Investigations: {pack.investigations.map((request) => `${request.request_no} ${(request.tests ?? []).join(", ")}`).join(" · ")}</p> : null}
        <h3>4. Diagnosis and coding</h3>
        <Grid rows={[["Diagnosis", pack.consultation?.diagnosis ?? ""], ["ICD-10", pack.consultation?.icd10 ?? ""], ["Secondary", pack.consultation?.secondary_diagnoses ?? ""], ["Summary", pack.report?.summary ?? ""]]} />
        <h3>5. Treatment and medications</h3>
        <MedicationTable items={pack.items} />
        <h3>6. Plan, outcome, and follow-up</h3>
        <Grid rows={[["Plan", pack.consultation?.plan ?? ""], ["Treatment", pack.report?.treatment ?? ""], ["Referral", pack.referral ? `${pack.referral.facility ?? ""} · ${pack.referral.status ?? "requested"}` : "Not required"], ["Ambulance", pack.transfer ? pack.transfer.status ?? "Requested" : "Not required"], ["Fit to travel", pack.report?.fit_decision ?? ""], ["Restrictions", pack.report?.restrictions ?? ""], ["Follow-up", pack.report?.follow_up ?? ""]]} />
        <h3>7. Progress notes</h3>
        {(pack.notes ?? []).length ? (pack.notes ?? []).map((note, index) => <p key={note.created_at}>Progress {index + 1} · {new Date(note.created_at).toLocaleString()}: {note.note}{note.follow_up ? ` · ${note.follow_up}` : ""}{note.follow_up_due ? ` · due ${String(note.follow_up_due).slice(0, 10)}` : ""}</p>) : <p>—</p>}
        <h3>8. Clinician certification</h3>
        <Signature name={pack.consultation?.display_name ?? pack.physician?.display_name ?? ""} license={pack.consultation?.license_no ?? pack.physician?.license_no ?? ""} at={pack.consultation?.finalized_at ?? pack.report?.signed_at} />
        <p className="muted">Confidential. Disclose only to authorized parties for care, payment, operations, or a legally permitted purpose.</p>
        <QrMark value={pack.encounter.encounter_no} />
      </Sheet>
      <Sheet title="Prescription / e-prescription" code="YH-CLN-RX-001">
        <h3>Patient and stay</h3>
        <Grid rows={[["Prescription", pack.prescription?.rx_no ?? ""], ["Issued", pack.prescription?.created_at ? new Date(pack.prescription.created_at).toLocaleString() : ""], ["Encounter", pack.encounter.encounter_no], ["Name", name], ["Date of birth", text(patient.date_of_birth)], ["Age", ageOf(patient.date_of_birth)], ["Hotel", text(patient.hotel_name)], ["Room", text(patient.room_no)], ["Nationality", text(patient.nationality)], ["Passport", text(patient.passport_no)], ["Allergies", text(patient.allergies || "NKDA")]]} />
        <h3>Clinical indication</h3>
        <Grid rows={[["Diagnosis", pack.consultation?.diagnosis ?? ""], ["ICD-10", pack.consultation?.icd10 ?? ""], ["Indication", pack.prescription?.indication ?? ""], ["Visit", pack.encounter.visit_type]]} />
        <h3>Prescribed medications</h3>
        <MedicationTable items={pack.items} />
        <h3>Instructions and follow-up</h3>
        <Grid rows={[["Special instructions", pack.prescription?.instructions ?? ""], ["Follow-up", pack.prescription?.follow_up ?? ""]]} />
        <h3>Dispensing</h3>
        <Grid rows={[["Dispensed by", pack.prescription?.pharmacist ?? ""], ["Dispensed", pack.prescription?.dispensed_at ? new Date(pack.prescription.dispensed_at).toLocaleString() : ""]]} />
        <Signature name={pack.physician?.display_name ?? pack.consultation?.display_name ?? ""} license={pack.physician?.license_no ?? pack.consultation?.license_no ?? ""} at={pack.prescriptionSignedAt} />
        <QrMark value={pack.prescription?.rx_no ?? pack.encounter.encounter_no} />
      </Sheet>
      <Sheet title="Laboratory / imaging request" code="YH-CLN-FRM-09">
        {pack.investigations.length === 0 ? <p>No investigation on this visit.</p> : pack.investigations.map((request) => <div key={request.request_no}>
          <h3>{request.request_no}</h3>
          <Grid rows={[["Encounter", pack.encounter.encounter_no], ["Requested", request.created_at ? new Date(request.created_at).toLocaleString() : ""], ["Priority", request.priority], ["Status", request.status ?? ""], ["Physician", pack.physician?.display_name ?? ""], ["License", pack.physician?.license_no ?? ""], ["Name", name], ["MRN", text(patient.medical_record_number)], ["Date of birth", text(patient.date_of_birth)], ["Sex", text(patient.sex)], ["Nationality", text(patient.nationality)], ["Passport", text(patient.passport_no)], ["Hotel", text(patient.hotel_name)], ["Room", text(patient.room_no)], ["Phone", text(patient.phone)], ["Insurer", text(patient.insurer_name)], ["Policy", text(patient.policy_number)], ["Complaint", text(pack.consultation?.chief_complaint)], ["Indication", request.indication], ["Diagnosis", request.diagnosis ?? pack.consultation?.diagnosis ?? ""], ["ICD-10", request.icd10 ?? pack.consultation?.icd10 ?? ""], ["Tests", (request.tests ?? []).join(", ")], ["Site", request.anatomical_site ?? ""], ["Contrast", request.contrast ? "Yes" : "No"]]} />
          {request.safety ? <Grid rows={Object.entries(request.safety).filter(([, value]) => value && !Array.isArray(value)).map(([label, value]) => [label, String(value)])} /> : null}
          <p className="muted">{request.safety_acknowledged ? "Safety screening recorded." : "Safety screening is not recorded."} Results are filed when the provider returns them.</p>
        </div>)}
      </Sheet>
      <Sheet title="Fit to travel / discharge" code="YHC-CLN-FRM-008">
        <h3>1. Certificate</h3>
        <Grid rows={[["Certificate", pack.report?.certificate_type ?? ""], ["Decision", pack.report?.fit_decision ?? ""]]} />
        <h3>2. Patient and stay</h3>
        <Grid rows={[["Name", name], ["MRN", text(patient.medical_record_number)], ["Date of birth", text(patient.date_of_birth)], ["Sex", text(patient.sex)], ["Nationality", text(patient.nationality)], ["Passport", text(patient.passport_no)], ["Hotel", text(patient.hotel_name)], ["Room", text(patient.room_no)], ["Encounter", pack.encounter.encounter_no], ["Arrival", text(patient.arrival_date)], ["Departure", text(patient.departure_date)], ["Phone", text(patient.phone)], ["Email", text(patient.email)]]} />
        <h3>3. Clinical assessment</h3>
        <Grid rows={[["Assessed", pack.report?.signed_at ? new Date(String(pack.report.signed_at)).toLocaleString() : ""], ["Complaint", text(pack.consultation?.chief_complaint)], ["Diagnosis", pack.consultation?.diagnosis ?? ""], ["ICD-10", pack.consultation?.icd10 ?? ""], ["Secondary", pack.consultation?.secondary_diagnoses ?? ""], ["Examination", pack.consultation?.examination ?? ""], ["Findings", pack.report?.findings ?? ""]]} />
        <Vitals triage={pack.triage} />
        <h3>4. Decision and restrictions</h3>
        <Grid rows={[["Decision", pack.report?.fit_decision ?? ""], ["Restrictions", pack.report?.restrictions ?? ""], ["Airline", pack.report?.airline ?? ""], ["Travel date", pack.report?.travel_date ? String(pack.report.travel_date).slice(0, 10) : ""]]} />
        <h3>5. Summary, treatment, and follow-up</h3>
        <Grid rows={[["Summary", pack.report?.summary ?? ""], ["Treatment", pack.report?.treatment ?? ""], ["Follow-up", pack.report?.follow_up ?? ""], ["Allergies", text(patient.allergies || "NKDA")]]} />
        <MedicationTable items={pack.items} />
        <p>{pack.investigations.length ? pack.investigations.map((request) => `${request.request_no} ${(request.tests ?? []).join(", ")}`).join(" · ") : ""}</p>
        <h3>6. Physician certification</h3>
        <p>The attending physician assessed this guest. The certificate describes the condition at the time of signature. Airline, border, and insurer rules may still apply.</p>
        <Signature name={pack.physician?.display_name ?? pack.consultation?.display_name ?? ""} license={pack.physician?.license_no ?? pack.consultation?.license_no ?? ""} at={pack.report?.signed_at} />
        <QrMark value={`${pack.encounter.encounter_no}-FIT`} />
      </Sheet>
      <Sheet title="Referral letter" code="YH-CLN-FRM-006">
        {pack.referral ? <>
          <h3>1. Patient and stay</h3>
          <Grid rows={[["Name", name], ["MRN", text(patient.medical_record_number)], ["Date of birth", text(patient.date_of_birth)], ["Sex", text(patient.sex)], ["Nationality", text(patient.nationality)], ["Passport", text(patient.passport_no)], ["Hotel", text(patient.hotel_name)], ["Room", text(patient.room_no)], ["Phone", text(patient.phone)], ["Email", text(patient.email)], ["Insurer", text(patient.insurer_name)], ["Encounter", pack.encounter.encounter_no]]} />
          <h3>2. Referral</h3>
          <Grid rows={[["Referral", pack.referral.referral_no ?? ""], ["When", pack.referral.created_at ? new Date(String(pack.referral.created_at)).toLocaleString() : ""], ["Physician", pack.physician?.display_name ?? ""], ["License", pack.physician?.license_no ?? ""], ["Facility", pack.referral.facility ?? ""], ["Department", pack.referral.department ?? ""], ["Type", pack.referral.referral_type ?? ""], ["Priority", pack.referral.priority ?? ""], ["Transport", pack.referral.transport ?? ""], ["Reason", pack.referral.reason ?? ""]]} />
          <h3>3. Clinical summary</h3>
          <Grid rows={[["Complaint", text(pack.consultation?.chief_complaint)], ["Allergies", text(patient.allergies || "NKDA")], ["Past history", text(pack.consultation?.past_history ?? patient.chronic_conditions)], ["Regular medications", text(patient.regular_medications)], ["History", pack.consultation?.hpi ?? ""], ["Examination", pack.consultation?.examination ?? ""]]} />
          <Vitals triage={pack.triage} />
          <h3>4. Diagnosis</h3>
          <Grid rows={[["Diagnosis", pack.consultation?.diagnosis ?? ""], ["ICD-10", pack.consultation?.icd10 ?? ""], ["Secondary", pack.consultation?.secondary_diagnoses ?? ""]]} />
          <h3>5. Treatment already given</h3>
          <MedicationTable items={pack.items} />
          <h3>6. Investigations</h3>
          <p>{pack.investigations.length ? pack.investigations.map((request) => `${request.request_no} ${(request.tests ?? []).join(", ")}`).join(" · ") : "—"}</p>
          <Signature name={pack.physician?.display_name ?? ""} license={pack.physician?.license_no ?? ""} at={pack.referral?.created_at} />
        </> : <p>No referral on this visit.</p>}
      </Sheet>
      <Sheet title="Ambulance handover" code="YH-OPS-TRF-007">
        {pack.transfer ? <>
          <h3>1. Transfer</h3>
          <Grid rows={[["Transfer", pack.transfer.transfer_no ?? ""], ["Encounter", pack.encounter.encounter_no], ["Referral", pack.referral?.referral_no ?? ""], ["Status", pack.transfer.status ?? ""], ["Priority", pack.transfer.priority ?? ""], ["Dispatch", when(pack.transfer.dispatch_at)], ["Ambulance arrival", when(pack.transfer.arrival_at)], ["Departure", when(pack.transfer.departure_at)], ["Destination arrival", when(pack.transfer.destination_arrival_at)], ["Handover", when(pack.transfer.handover_at)], ["Closed", when(pack.transfer.closed_at)]]} />
          <h3>2. Patient and hotel</h3>
          <Grid rows={[["Name", name], ["Date of birth", text(patient.date_of_birth)], ["Age", ageOf(patient.date_of_birth)], ["Sex", text(patient.sex)], ["Nationality", text(patient.nationality)], ["Passport", text(patient.passport_no)], ["Phone", text(patient.phone)], ["Hotel", text(patient.hotel_name)], ["Room", text(patient.room_no)], ["Insurer", text(patient.insurer_name)], ["Policy", text(patient.policy_number)]]} />
          <h3>3. Destination</h3>
          <Grid rows={[["Facility", pack.transfer.destination ?? ""], ["Department", handoverText(pack.transfer.handover, "receivingDepartment")], ["Reason", pack.transfer.reason ?? ""], ["Referring clinician", handoverText(pack.transfer.handover, "referringClinician") || pack.physician?.display_name || ""]]} />
          <h3>4. Clinical status</h3>
          <Vitals triage={pack.triage} />
          <Grid rows={[["Diagnosis", pack.consultation?.diagnosis ?? ""], ["ICD-10", pack.consultation?.icd10 ?? ""], ["Allergies", text(patient.allergies || "NKDA")], ["GCS", handoverText(pack.transfer.handover, "gcs")], ["Isolation", handoverText(pack.transfer.handover, "isolation")], ["Snapshot", pack.transfer.snapshot ?? ""]]} />
          <h3>5. Treatment, observations, and documents</h3>
          <HandoverTables handover={pack.transfer.handover} />
          <h3>6. Transport</h3>
          <Grid rows={[["Oxygen", handoverText(pack.transfer.handover, "oxygen")], ["Cardiac monitor", handoverText(pack.transfer.handover, "monitor")], ["Crew", handoverText(pack.transfer.handover, "ambulanceCrew")]]} />
          <h3>7. Receiving handover</h3>
          <Grid rows={[["Receiving clinician", handoverText(pack.transfer.handover, "receivingClinician")], ["Closure notes", handoverText(pack.transfer.handover, "closureNotes")]]} />
          <h3>8. Signatures</h3>
          <Signature name={handoverText(pack.transfer.handover, "referringClinician") || pack.physician?.display_name || ""} license={pack.physician?.license_no ?? ""} at={pack.transfer.created_at} />
          <Signature name={handoverText(pack.transfer.handover, "ambulanceCrew")} license="Ambulance" at={pack.transfer.departure_at} />
          <Signature name={handoverText(pack.transfer.handover, "receivingClinician")} license="Receiving" at={pack.transfer.handover_at} />
        </> : <p>No ambulance transfer on this visit.</p>}
      </Sheet>
      <Sheet title="Tax invoice / فاتورة ضريبية" code="YH-FIN-INV-01">
        {pack.invoice ? <>
          <Grid rows={[["Invoice", String(pack.invoice.invoice_no)], ["Status", String(pack.invoice.status)], ["Issued", pack.invoice.issued_at ? new Date(String(pack.invoice.issued_at)).toLocaleString() : ""], ["Entity", pack.settings.legal_entity ?? ""], ["Tax registration", pack.settings.tax_reg_no ?? ""], ["Commercial registration", pack.settings.commercial_reg ?? ""], ["Currency", String(pack.invoice.currency)], ["Clinic", pack.settings.clinic_name ?? ""], ["Payer", String(pack.invoice.payer_type)], ["Patient", name], ["MRN", text(patient.medical_record_number)], ["Nationality", text(patient.nationality)], ["Passport", text(patient.passport_no)], ["Hotel / room", `${patient.hotel_name ?? ""} / ${patient.room_no ?? ""}`], ["Arrival", text(patient.arrival_date)], ["Departure", text(patient.departure_date)], ["Encounter", pack.encounter.encounter_no], ["Insurer", text(patient.insurer_name ?? pack.coverage?.insurer_name)], ["Policy", text(patient.policy_number ?? pack.coverage?.policy_number)], ["Coverage", pack.coverage?.status ?? ""]]} />
          <table><thead><tr><th>Code</th><th>Description</th><th>Qty</th><th>Unit</th><th>Gross</th><th>Discount</th><th>Tax</th><th>Net</th></tr></thead><tbody>{pack.lines.map((line, index) => <tr key={index}><td>{line.code}</td><td>{line.description}</td><td>{line.quantity}</td><td>{line.unit_price}</td><td>{line.gross}</td><td>{line.discount}</td><td>{line.tax}</td><td>{line.net}</td></tr>)}</tbody></table>
          <Grid rows={[["Subtotal", String(pack.invoice.subtotal)], ["Discount", String(pack.invoice.discount)], ["Tax", String(pack.invoice.tax)], ["Cover", String(pack.invoice.insurance_cover)], ["Patient payable", String(pack.invoice.patient_payable)], ["Paid", String(pack.invoice.amount_paid)], ["Outstanding", String(pack.invoice.outstanding)]]} />
          {(pack.payments ?? []).map((payment, index) => <p key={index}>{payment.method} · {payment.amount} · {payment.reference || "no reference"} · {payment.cashier || ""} · {payment.paid_at ? new Date(String(payment.paid_at)).toLocaleString() : ""}</p>)}
          <Signature name={pack.physician?.display_name ?? "Cashier"} license="" at={pack.invoice.issued_at == null ? null : String(pack.invoice.issued_at)} />
          <QrMark value={String(pack.invoice.invoice_no)} />
        </> : <p>No invoice on this visit.</p>}
      </Sheet>
      <Sheet title="Claim pack cover" code="YH-CLM-FRM-001">
        <h3>1. Claim</h3>
        <Grid rows={[["Claim", pack.claim?.claim_no ?? ""], ["Status", pack.claim?.status ?? ""], ["Type", pack.claim?.claim_type ?? ""], ["Opened", pack.claim?.created_at ? new Date(pack.claim.created_at).toLocaleString() : ""], ["Encounter", pack.encounter.encounter_no], ["Invoice", text(pack.invoice?.invoice_no)], ["Insurer reference", pack.claim?.insurer_reference ?? ""], ["Authorization", pack.claim?.authorization_ref ?? ""]]} />
        <h3>2. Patient and stay</h3>
        <Grid rows={[["Name", name], ["Passport", text(patient.passport_no)], ["Date of birth", text(patient.date_of_birth)], ["Sex", text(patient.sex)], ["Nationality", text(patient.nationality)], ["Phone", text(patient.phone)], ["Email", text(patient.email)], ["Hotel", text(patient.hotel_name)], ["Room", text(patient.room_no)], ["Arrival", text(patient.arrival_date)], ["Departure", text(patient.departure_date)]]} />
        <h3>3. Coverage</h3>
        <Grid rows={[["Insurer", text(patient.insurer_name ?? pack.coverage?.insurer_name)], ["Policy", text(patient.policy_number ?? pack.coverage?.policy_number)], ["Coverage", pack.coverage?.status ?? ""], ["Patient payable", text(pack.invoice?.patient_payable)]]} />
        <h3>4. Clinical summary</h3>
        <Grid rows={[["Arrived", pack.encounter.arrival_at ? new Date(pack.encounter.arrival_at).toLocaleString() : ""], ["Place of care", pack.encounter.visit_type === "room_visit" ? "Guest room" : "Clinic"], ["Complaint", text(pack.consultation?.chief_complaint)], ["Diagnosis", pack.consultation?.diagnosis ?? ""], ["ICD-10", pack.consultation?.icd10 ?? ""], ["Secondary", pack.consultation?.secondary_diagnoses ?? ""]]} />
        <Vitals triage={pack.triage} />
        <h3>5. Services and amount</h3>
        <table><thead><tr><th>Code</th><th>Description</th><th>Qty</th><th>Net</th></tr></thead><tbody>{pack.lines.map((line, index) => <tr key={index}><td>{line.code}</td><td>{line.description}</td><td>{line.quantity}</td><td>{line.net}</td></tr>)}</tbody></table>
        <Grid rows={[["Claimed", text(pack.claim?.amount ?? pack.invoice?.patient_payable)], ["Approved", text(pack.claim?.settlement_amount)], ["Cover", text(pack.invoice?.insurance_cover)], ["Paid", text(pack.invoice?.amount_paid)], ["Outstanding", text(pack.invoice?.outstanding)]]} />
        <MedicationTable items={pack.items} />
        <h3>6. Pack checklist</h3>
        <ClaimChecklist pack={pack} />
        <h3>7. Submission</h3>
        <Grid rows={[["Channel", pack.claim?.channel ?? ""], ["Submitted", pack.claim?.submittedAt ? new Date(pack.claim.submittedAt).toLocaleString() : ""], ["Version", pack.claim?.submissionVersion ?? ""], ["Rejection", pack.claim?.rejection_reason ?? ""]]} />
        <Signature name={pack.consultation?.display_name ?? pack.physician?.display_name ?? ""} license={pack.consultation?.license_no ?? pack.physician?.license_no ?? ""} at={pack.consultation?.finalized_at ?? pack.report?.signed_at} />
        <QrMark value={pack.claim?.claim_no ?? pack.encounter.encounter_no} />
      </Sheet>
      {pack.amendments.length ? <Sheet title="Amendment history" code="AUDIT"><ul>{pack.amendments.map((item) => <li key={item.created_at}>{item.target}: {item.reason}</li>)}</ul></Sheet> : null}
    </section>
  );
}

function Sheet({ title, code, children }: { title: string; code: string; children: React.ReactNode }) {
  return <article className="doc" style={{ marginBottom: 18 }}><header><div><Mark /><p>{code}</p></div></header><h2>{title}</h2>{children}<p className="muted">Care Beyond Your Stay · رعاية تتجاوز حدود الإقامة</p></article>;
}

function text(value: unknown) {
  return value == null || value === "" ? "" : String(value);
}

function when(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function ageOf(value: unknown) {
  if (!value) return "";
  const born = new Date(String(value));
  if (Number.isNaN(born.getTime())) return "";
  let years = new Date().getFullYear() - born.getFullYear();
  const today = new Date();
  if (today.getMonth() < born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())) years -= 1;
  return years >= 0 ? String(years) : "";
}

function Grid({ rows }: { rows: [string, string | null][] }) {
  return <div className="grid">{rows.map(([label, value]) => <p key={label}><strong>{label}</strong><br />{value || "—"}</p>)}</div>;
}

function handoverText(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const found = (value as Record<string, unknown>)[key];
  return found == null ? "" : String(found);
}

function MedicationTable({ items }: { items: Pack["items"] }) {
  if (!items.length) return null;
  return <table><thead><tr><th>Medication</th><th>Dose</th><th>Route</th><th>Frequency</th><th>Duration</th><th>Qty</th></tr></thead><tbody>{items.map((item, index) => <tr key={index}><td>{item.medication_name} {item.strength}</td><td>{item.dose}</td><td>{item.route}</td><td>{item.frequency}</td><td>{item.duration}</td><td>{item.quantity}</td></tr>)}</tbody></table>;
}

function rowsOf(value: unknown, key: string): Record<string, string>[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const found = (value as Record<string, unknown>)[key];
  if (!Array.isArray(found)) return [];
  return found.filter((row): row is Record<string, string> => Boolean(row) && typeof row === "object");
}

function HandoverTables({ handover }: { handover: unknown }) {
  const treatment = rowsOf(handover, "treatment");
  const observations = rowsOf(handover, "observations");
  const checklist = handover && typeof handover === "object" && !Array.isArray(handover) ? (handover as Record<string, unknown>).checklist : null;
  const marks = checklist && typeof checklist === "object" && !Array.isArray(checklist) ? Object.entries(checklist as Record<string, boolean>) : [];
  return <>
    {treatment.length ? <table><thead><tr><th>Time</th><th>Item</th><th>Dose</th><th>Response</th><th>By</th></tr></thead><tbody>{treatment.map((row, index) => <tr key={index}><td>{row.time}</td><td>{row.item}</td><td>{row.dose}</td><td>{row.response}</td><td>{row.by}</td></tr>)}</tbody></table> : null}
    {observations.length ? <table><thead><tr><th>Time</th><th>Event</th><th>Temp</th><th>BP</th><th>Pulse</th><th>SpO2</th><th>Notes</th></tr></thead><tbody>{observations.map((row, index) => <tr key={index}><td>{row.time}</td><td>{row.event}</td><td>{row.temp}</td><td>{row.bp}</td><td>{row.pulse}</td><td>{row.spo2}</td><td>{row.notes}</td></tr>)}</tbody></table> : null}
    {marks.length ? <ul>{marks.map(([label, included]) => <li key={label}>{included ? "Included" : "Missing"}: {label}</li>)}</ul> : null}
  </>;
}

function ClaimChecklist({ pack }: { pack: Pack }) {
  const marks: [string, boolean][] = [
    ["Signed medical report", pack.report?.status === "signed"],
    ["Itemized invoice", Boolean(pack.invoice)],
    ["Prescription", pack.items.length > 0],
    ["Laboratory or imaging", pack.investigations.length > 0],
    ["Referral or transfer", Boolean(pack.referral || pack.transfer)],
    ["Consent recorded", Boolean(pack.patient.consent_recorded_at)],
    ["Coverage verified", pack.coverage?.status === "verified"],
  ];
  return <ul>{marks.map(([label, included]) => <li key={label}>{included ? "Included" : "Missing"}: {label}</li>)}</ul>;
}

function Signature({ name, license, at }: { name: string; license: string | null; at?: string | null }) {
  const when = at ? new Date(at).toLocaleString() : "Unsigned";
  return <p className="signature">Electronically signed by {name || "the attending clinician"}{license ? ` · ${license}` : ""} · {when}</p>;
}

function Vitals({ triage }: { triage: Pack["triage"] }) {
  if (!triage) return null;
  return <p>Temp {triage.temperature ?? "—"} · BP {triage.systolic ?? "—"}/{triage.diastolic ?? "—"} · Pulse {triage.pulse ?? "—"} · RR {triage.respiratory_rate ?? "—"} · SpO₂ {triage.spo2 ?? "—"} · Pain {triage.pain_score ?? "—"}</p>;
}
