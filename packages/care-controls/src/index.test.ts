import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DomainError } from "@yaren/shared-kernel";
import { applyPayment, assertBatchUsable, assertClaimSettlement, assertContrastSafety, assertEncounterTransition, assertHandoverEvidence, assertIncidentClose, assertNoAllergyConflict, assertPayerReady, claimReadiness, invoiceTotals, priceLine, refundInvoice, requireAmendment, returnStock, takeStock, voidInvoice } from "./index.js";

describe("care controls", () => {
  it("prices an invoice line from quantity, discount and tax", () => {
    const line = priceLine({ quantity: 2, unitPrice: 100, discountPercent: 10, taxPercent: 14 });
    assert.equal(line.gross, 200);
    assert.equal(line.discount, 20);
    assert.equal(line.tax, 25.2);
    assert.equal(line.net, 205.2);
  });

  it("keeps the patient payable equal to net minus approved cover", () => {
    const totals = invoiceTotals([{ gross: 200, discount: 20, tax: 25.2, net: 205.2 }], 100);
    assert.equal(totals.patientPayable, 105.2);
  });

  it("blocks a payment above the outstanding balance", () => {
    assert.throws(() => applyPayment(50, 80), (error: unknown) => error instanceof DomainError);
  });

  it("refuses to send a waiting guest straight to the doctor", () => {
    assert.throws(() => assertEncounterTransition("waiting", "in_consultation"), (error: unknown) => error instanceof DomainError);
  });

  it("marks a claim ready only when report, invoice, coding and coverage exist", () => {
    const missing = claimReadiness({ hasSignedReport: true, hasIssuedInvoice: false, hasDiagnosisCode: true, coverageVerified: true });
    assert.equal(missing.ready, false);
    const ready = claimReadiness({ hasSignedReport: true, hasIssuedInvoice: true, hasDiagnosisCode: true, coverageVerified: true });
    assert.equal(ready.ready, true);
  });

  it("refuses to dispense more than the batch holds", () => {
    assert.equal(takeStock(10, 4), 6);
    assert.throws(() => takeStock(2, 5), (error: unknown) => error instanceof DomainError && error.code === "stock_insufficient");
  });

  it("returns stock as a new movement instead of erasing the dispense", () => {
    assert.equal(returnStock(6, 4), 10);
  });

  it("voids an issued invoice only after collected money is refunded", () => {
    assert.equal(voidInvoice("issued", 0), "void");
    assert.throws(() => voidInvoice("paid", 100), (error: unknown) => error instanceof DomainError && error.code === "refund_required");
  });

  it("reduces collected cash when a refund is recorded", () => {
    assert.deepEqual(refundInvoice(100, 0, 100, 40), { amountPaid: 60, outstanding: 40, status: "part_paid" });
  });

  it("blocks a medicine that matches a documented allergy until the prescriber acknowledges it", () => {
    assert.throws(() => assertNoAllergyConflict("penicillin", "Amoxicillin penicillin", false), (error: unknown) => error instanceof DomainError && error.code === "allergy_conflict");
    assertNoAllergyConflict("penicillin", "Amoxicillin penicillin", true);
  });

  it("blocks an expired batch and an insurance invoice without a policy", () => {
    assert.throws(() => assertBatchUsable(new Date("2020-01-01"), new Date("2026-09-25")), (error: unknown) => error instanceof DomainError);
    assert.throws(() => assertPayerReady("insurance", ""), (error: unknown) => error instanceof DomainError);
  });

  it("requires settlement, handover evidence, contrast safety, and CAPA evidence", () => {
    assert.throws(() => assertClaimSettlement("paid", 0), (error: unknown) => error instanceof DomainError);
    assert.throws(() => assertHandoverEvidence("closed", ""), (error: unknown) => error instanceof DomainError);
    assert.throws(() => assertContrastSafety(true, false), (error: unknown) => error instanceof DomainError);
    assert.throws(() => assertIncidentClose("closed", ""), (error: unknown) => error instanceof DomainError);
  });

  it("requires a reason before a signed note is amended", () => {
    assert.equal(requireAmendment("signed", "Corrected diagnosis"), "Corrected diagnosis");
    assert.throws(() => requireAmendment("draft", "typo"), (error: unknown) => error instanceof DomainError);
  });
});
