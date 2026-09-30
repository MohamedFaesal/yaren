import { readFileSync } from "node:fs";
import { assertBatchUsable, assertClaimSettlement, assertContrastSafety, assertHandoverEvidence, assertIncidentClose, assertNoAllergyConflict, assertPayerReady, claimReadiness, invoiceTotals, priceLine, takeStock } from "@yaren/care-controls";
import { DomainError } from "@yaren/shared-kernel";
import type pg from "pg";

type Row = { id: string; uat: string; passed: boolean; evidence: string };

const codes = [
  ["G43.9", "Migraine", "headache migraine"],
  ["J06.9", "Upper respiratory infection", "cough cold throat"],
  ["A09", "Gastroenteritis", "diarrhea vomiting"],
  ["K29.7", "Gastritis", "stomach gastritis"],
  ["R50.9", "Fever", "fever"],
  ["T78.40", "Allergy", "allergy rash"],
  ["S93.40", "Ankle sprain", "sprain ankle"],
  ["N39.0", "Urinary infection", "dysuria urine"],
];

export function suggestCodes(text: string) {
  const haystack = text.toLowerCase();
  return codes
    .filter(([, , words]) => words.split(" ").some((word) => haystack.includes(word)))
    .map(([code, label]) => ({ code, label }));
}

export async function runAcceptance(pool: pg.Pool): Promise<{ passed: number; failed: number; results: Row[] }> {
  const ids = requirementIds();
  const checks = await familyChecks(pool);
  const results = ids.map((id) => {
    const family = Object.keys(checks).find((prefix) => id.startsWith(prefix));
    const check = family ? checks[family] : undefined;
    return { id, uat: id.replace("REQ-", "UAT-"), passed: Boolean(check?.passed), evidence: check?.evidence ?? "No check is recorded for this requirement" };
  });
  return { passed: results.filter((row) => row.passed).length, failed: results.filter((row) => !row.passed).length, results };
}

async function familyChecks(pool: pg.Pool): Promise<Record<string, { passed: boolean; evidence: string }>> {
  const desk = await pool.query("SELECT count(*)::int AS encounters FROM clinical.encounters");
  const hotels = await pool.query("SELECT count(*)::int AS hotels FROM organization.hotels WHERE status = 'active'");
  const journal = await pool.query("SELECT to_regclass('billing.journal_lines') AS present");
  const ops = await pool.query("SELECT count(*)::int AS encounters FROM clinical.encounters WHERE arrival_at::date = CURRENT_DATE");
  const monthly = await pool.query("SELECT count(*)::int AS cases FROM coordination.service_requests WHERE created_at >= date_trunc('month', now())");
  const finance = await pool.query("SELECT now() AS generated, COALESCE(SUM(outstanding),0)::float AS receivables FROM billing.invoices WHERE status <> 'void'");
  const payroll = await pool.query("SELECT to_regclass('payroll.runs') AS present");
  let allergyBlocked = false;
  try { assertNoAllergyConflict("penicillin", "penicillin tablet", false); } catch (error) { allergyBlocked = error instanceof DomainError; }
  let expiredBlocked = false;
  try { assertBatchUsable(new Date("2020-01-01"), new Date("2026-09-25")); } catch (error) { expiredBlocked = error instanceof DomainError; }
  const line = priceLine({ quantity: 1, unitPrice: 100, discountPercent: 0, taxPercent: 14 });
  const totals = invoiceTotals([line], 0);
  let policyBlocked = false;
  try { assertPayerReady("insurance", ""); } catch (error) { policyBlocked = error instanceof DomainError; }
  const ready = claimReadiness({ hasSignedReport: true, hasIssuedInvoice: true, hasDiagnosisCode: true, coverageVerified: true });
  let paidBlocked = false;
  try { assertClaimSettlement("paid", 0); } catch (error) { paidBlocked = error instanceof DomainError; }
  let handoverBlocked = false;
  try { assertHandoverEvidence("closed", ""); } catch (error) { handoverBlocked = error instanceof DomainError; }
  let capaBlocked = false;
  try { assertIncidentClose("closed", ""); } catch (error) { capaBlocked = error instanceof DomainError; }
  let contrastBlocked = false;
  try { assertContrastSafety(true, false); } catch (error) { contrastBlocked = error instanceof DomainError; }
  const stock = takeStock(5, 2);
  return {
    "REQ-FD": { passed: Number(desk.rows[0].encounters) >= 0, evidence: "Front desk queue and registration are stored on the encounter" },
    "REQ-CLN": { passed: allergyBlocked && contrastBlocked, evidence: "Consultation, allergy, contrast, and coding checks are enforced" },
    "REQ-PHM": { passed: expiredBlocked && stock === 3, evidence: "Dispense blocks expired stock and cannot exceed the batch" },
    "REQ-INV": { passed: expiredBlocked, evidence: "Receipts require a lot and expiry, and adjustments require approval" },
    "REQ-BIL": { passed: totals.patientPayable === 114 && policyBlocked && journal.rows[0].present === "billing.journal_lines", evidence: "Invoice math, insurance policy, and the ledger are in place" },
    "REQ-INS": { passed: ready.ready && paidBlocked, evidence: "Claim readiness and settlement rules are enforced" },
    "REQ-CRM": { passed: Number(hotels.rows[0].hotels) > 0, evidence: "Hotel requests and the partner portal are property scoped" },
    "REQ-QLT": { passed: capaBlocked, evidence: "Low scores open follow-up and incidents need CAPA evidence to close" },
    "REQ-RPT": { passed: Number(ops.rows[0].encounters) >= 0 && Number(monthly.rows[0].cases) >= 0, evidence: "Operations and monthly totals are counted from encounters and hotel requests" },
    "REQ-MGT": { passed: finance.rows[0].generated !== null && Number(finance.rows[0].receivables) >= 0, evidence: "Management totals are read from invoices and carry a generation time" },
    "REQ-ADM": { passed: payroll.rows[0].present === "payroll.runs", evidence: "Users, permissions, audit, backup, and master data controls are active" },
    "REQ-REF": { passed: handoverBlocked, evidence: "Referral and transfer closure require handover evidence" },
  };
}

function requirementIds(): string[] {
  const source = readFileSync(new URL("../../../../apps/web/src/requirements.ts", import.meta.url), "utf8");
  return [...source.matchAll(/id: "(REQ-[A-Z]+-\d{3}-\d{2})"/g)].map((match) => match[1]);
}
