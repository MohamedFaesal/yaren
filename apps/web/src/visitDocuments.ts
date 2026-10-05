export const visitDocumentTypes = [
  "patient_personal_information_form",
  "gdpr_form",
  "patient_satisfaction_form",
  "travel_voucher",
  "flight_ticket",
  "claim_form",
  "refusal_of_treatment_hospital_referral",
] as const;

export type VisitDocumentType = (typeof visitDocumentTypes)[number];

export type VisitDocumentMeta = {
  type: VisitDocumentType;
  label: string;
  required: boolean;
};

export const visitDocumentMeta: VisitDocumentMeta[] = [
  { type: "patient_personal_information_form", label: "Patient Personal Information Form", required: true },
  { type: "gdpr_form", label: "GDPR Form", required: true },
  { type: "patient_satisfaction_form", label: "Patient Satisfaction Form", required: false },
  { type: "travel_voucher", label: "Travel Voucher", required: false },
  { type: "flight_ticket", label: "Flight Ticket", required: false },
  { type: "claim_form", label: "Claim Form", required: false },
  { type: "refusal_of_treatment_hospital_referral", label: "Refusal of treatment & Hospital Referral", required: false },
];

export function visitDocumentLabel(type: string) {
  return visitDocumentMeta.find((item) => item.type === type)?.label ?? type;
}

export const maxVisitDocumentBytes = 10 * 1024 * 1024;
export const visitDocumentSizeLabel = "10 MB";
export const visitDocumentAccept = ".pdf,image/jpeg,image/png,image/webp,application/pdf";

export function visitDocumentIssue(file: File) {
  const allowed = file.type === "application/pdf"
    || file.type === "image/jpeg"
    || file.type === "image/png"
    || file.type === "image/webp"
    || /\.(pdf|jpe?g|png|webp)$/i.test(file.name);
  if (!allowed) return "Use a PDF, JPEG, PNG, or WebP file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > maxVisitDocumentBytes) return `File must be ${visitDocumentSizeLabel} or smaller.`;
  return null;
}
