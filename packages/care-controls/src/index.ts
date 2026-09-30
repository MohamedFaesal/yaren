import { DomainError } from "@yaren/shared-kernel";

export const encounterStatuses = [
  "waiting",
  "priority",
  "in_triage",
  "ready_for_doctor",
  "in_consultation",
  "treatment",
  "billing",
  "follow_up",
  "closed",
  "cancelled",
] as const;

export type EncounterStatus = (typeof encounterStatuses)[number];

const transitions: Record<EncounterStatus, readonly EncounterStatus[]> = {
  waiting: ["priority", "in_triage", "cancelled"],
  priority: ["in_triage", "cancelled"],
  in_triage: ["ready_for_doctor", "cancelled"],
  ready_for_doctor: ["in_consultation", "cancelled"],
  in_consultation: ["treatment", "billing", "follow_up", "cancelled"],
  treatment: ["billing", "follow_up", "cancelled"],
  billing: ["follow_up", "closed", "cancelled"],
  follow_up: ["closed", "cancelled"],
  closed: [],
  cancelled: [],
};

export function assertEncounterTransition(from: EncounterStatus, to: EncounterStatus): void {
  if (!transitions[from].includes(to)) {
    throw new DomainError(
      "invalid_status_transition",
      `Cannot move an encounter from ${from.replaceAll("_", " ")} to ${to.replaceAll("_", " ")}`,
    );
  }
}

export function priceLine(input: { quantity: number; unitPrice: number; discountPercent: number; taxPercent: number }) {
  if (input.quantity <= 0) throw new DomainError("quantity_invalid", "Quantity must be greater than zero");
  if (input.unitPrice < 0) throw new DomainError("price_invalid", "Unit price cannot be negative");
  const gross = roundMoney(input.quantity * input.unitPrice);
  const discount = roundMoney(gross * (input.discountPercent / 100));
  const taxable = roundMoney(gross - discount);
  const tax = roundMoney(taxable * (input.taxPercent / 100));
  const net = roundMoney(taxable + tax);
  return { gross, discount, tax, net };
}

export function invoiceTotals(lines: { gross: number; discount: number; tax: number; net: number }[], insuranceCover: number) {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.gross, 0));
  const discount = roundMoney(lines.reduce((sum, line) => sum + line.discount, 0));
  const tax = roundMoney(lines.reduce((sum, line) => sum + line.tax, 0));
  const net = roundMoney(lines.reduce((sum, line) => sum + line.net, 0));
  const cover = roundMoney(Math.min(Math.max(insuranceCover, 0), net));
  const patientPayable = roundMoney(net - cover);
  return { subtotal, discount, tax, net, insuranceCover: cover, patientPayable };
}

export function applyPayment(outstanding: number, amount: number) {
  if (amount <= 0) throw new DomainError("payment_invalid", "Payment amount must be greater than zero");
  if (amount - outstanding > 0.009) throw new DomainError("payment_exceeds_balance", "Payment exceeds the outstanding balance");
  const remaining = roundMoney(outstanding - amount);
  const status = remaining === 0 ? "paid" : "part_paid";
  return { remaining, status: status as "paid" | "part_paid" };
}

export type ReadinessCheck = { code: string; label: string; ok: boolean };

export function claimReadiness(input: {
  hasSignedReport: boolean;
  hasIssuedInvoice: boolean;
  hasDiagnosisCode: boolean;
  coverageVerified: boolean;
}): { ready: boolean; checks: ReadinessCheck[] } {
  const checks: ReadinessCheck[] = [
    { code: "report", label: "Signed medical report", ok: input.hasSignedReport },
    { code: "invoice", label: "Issued invoice", ok: input.hasIssuedInvoice },
    { code: "coding", label: "Diagnosis with ICD-10", ok: input.hasDiagnosisCode },
    { code: "coverage", label: "Coverage verified", ok: input.coverageVerified },
  ];
  return { ready: checks.every((check) => check.ok), checks };
}

export const claimTransitions: Record<string, readonly string[]> = {
  draft: ["ready", "cancelled"],
  ready: ["submitted", "draft"],
  submitted: ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected"],
  rejected: ["submitted"],
  approved: ["paid"],
  paid: [],
  cancelled: [],
};

export function assertClaimTransition(from: string, to: string): void {
  const allowed = claimTransitions[from] ?? [];
  if (!allowed.includes(to)) {
    throw new DomainError("invalid_claim_transition", `Cannot move a claim from ${from} to ${to}`);
  }
}

export const transferStatuses = ["requested", "assigned", "en_route", "arrived", "transferred", "handover", "closed"] as const;

const transferNext: Record<string, string> = {
  requested: "assigned",
  assigned: "en_route",
  en_route: "arrived",
  arrived: "transferred",
  transferred: "handover",
  handover: "closed",
};

export function nextTransferStatus(current: string): string {
  const next = transferNext[current];
  if (!next) throw new DomainError("transfer_closed", "This transfer cannot move further");
  return next;
}

export function takeStock(available: number, requested: number): number {
  if (!Number.isInteger(requested) || requested <= 0) {
    throw new DomainError("quantity_invalid", "Dispense quantity must be a positive whole number");
  }
  if (requested > available) {
    throw new DomainError("stock_insufficient", "Available stock is not enough for this dispense");
  }
  return available - requested;
}

export function returnStock(available: number, quantity: number): number {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new DomainError("quantity_invalid", "Return quantity must be a positive whole number");
  }
  return available + quantity;
}

export function voidInvoice(status: string, amountPaid: number): "void" {
  if (status === "void") throw new DomainError("invoice_void", "This invoice is already void");
  if (amountPaid > 0) throw new DomainError("refund_required", "Refund collected amounts before voiding the invoice");
  return "void";
}

export function refundInvoice(amountPaid: number, outstanding: number, patientPayable: number, refundAmount: number) {
  if (refundAmount <= 0) throw new DomainError("refund_invalid", "Refund amount must be greater than zero");
  if (refundAmount - amountPaid > 0.009) throw new DomainError("refund_exceeds_collected", "Refund cannot exceed the amount collected");
  const paid = roundMoney(amountPaid - refundAmount);
  const due = roundMoney(outstanding + refundAmount);
  const status = paid <= 0 ? "issued" : due <= 0 ? "paid" : "part_paid";
  return { amountPaid: paid, outstanding: Math.min(due, patientPayable), status };
}

export function assertNoAllergyConflict(allergies: string | null, medicationName: string, acknowledged: boolean): void {
  const text = (allergies ?? "").trim().toLowerCase();
  if (!text || text === "nkda" || text === "none" || text === "none recorded") return;
  const tokens = text.split(/[,;/|]/).map((part) => part.trim()).filter((part) => part.length > 2);
  const hit = tokens.find((token) => medicationName.toLowerCase().includes(token));
  if (hit && !acknowledged) {
    throw new DomainError("allergy_conflict", `This medicine conflicts with a documented allergy (${hit}). Acknowledge the conflict to continue.`);
  }
}

export function assertBatchUsable(expiry: Date, now: Date): void {
  const end = new Date(expiry);
  end.setHours(23, 59, 59, 999);
  if (end.getTime() < now.getTime()) throw new DomainError("batch_expired", "An expired batch cannot be dispensed");
}

export function assertPayerReady(payerType: string, policyNumber: string | null): void {
  if (payerType === "insurance" && !policyNumber?.trim()) {
    throw new DomainError("policy_required", "An insurance invoice needs a policy number before it is issued");
  }
}

export function assertClaimSettlement(status: string, settlementAmount: number | undefined): void {
  if (status === "paid" && !(Number(settlementAmount) > 0)) {
    throw new DomainError("settlement_required", "A claim cannot be marked paid without a settlement amount");
  }
}

export function assertIncidentClose(nextStatus: string, evidence: string | null | undefined): void {
  if (nextStatus === "closed" && !evidence?.trim()) {
    throw new DomainError("capa_evidence_required", "An incident cannot close without CAPA evidence");
  }
}

export function assertContrastSafety(contrast: boolean, safetyAcknowledged: boolean): void {
  if (contrast && !safetyAcknowledged) {
    throw new DomainError("contrast_safety_required", "Contrast imaging needs a completed safety check");
  }
}

export function assertHandoverEvidence(nextStatus: string, evidence: string | null | undefined): void {
  if (nextStatus === "closed" && !evidence?.trim()) {
    throw new DomainError("handover_required", "A transfer closes only after receiving-facility handover evidence");
  }
}

export function requireAmendment(status: string, reason: string): string {
  if (status !== "final" && status !== "signed") {
    throw new DomainError("not_final", "Draft records are edited directly. Amendments apply to signed records.");
  }
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new DomainError("amendment_reason_required", "An amendment needs a reason");
  return trimmed;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
