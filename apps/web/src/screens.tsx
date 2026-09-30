import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api } from "./api";
import { Mark } from "./brand";
import { requirements, type Requirement } from "./requirements";
import { useLanguage } from "./i18n";
import { Field, Text } from "./ui";

type Medication = { id: string; name: string; strength: string };
type Line = { medicationId: string; dose: string; route: string; frequency: string; duration: string; quantity: string };

const labTests = ["CBC / Hematology", "CRP / ESR", "Glucose", "Renal profile", "Liver profile", "Urinalysis", "Stool analysis", "Cardiac markers", "Coagulation"];
const imagingTests = ["X-Ray", "Ultrasound", "CT", "MRI", "ECG", "Doppler"];
const safetyFlags = ["Allergy risk", "Anticoagulant", "Renal impairment", "Diabetes", "Isolation", "Fall risk"];

export function PrescriptionScreen({ token, medications }: { token: string; medications: Medication[] }) {
  const blank = (): Line => ({ medicationId: medications[0]?.id ?? "", dose: "1 tab", route: "PO", frequency: "TID", duration: "5 days", quantity: "" });
  const [encounterId, setEncounterId] = useState("");
  const [indication, setIndication] = useState("");
  const [instructions, setInstructions] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [lines, setLines] = useState<Line[]>([blank(), blank(), blank(), blank(), blank(), blank()]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  function update(index: number, patch: Partial<Line>) {
    setLines(lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const items = lines.filter((line) => Number(line.quantity) > 0).map((line) => {
      const chosen = medications.find((item) => item.id === line.medicationId);
      return { medicationId: line.medicationId, medicationName: chosen?.name ?? "Medication", strength: chosen?.strength, dose: line.dose, route: line.route, frequency: line.frequency, duration: line.duration, quantity: Number(line.quantity), acknowledgeAllergy: acknowledge };
    });
    try {
      const created = await api<{ rxNo: string }>(`/api/yaren/encounters/${encounterId}/prescriptions`, { method: "POST", body: JSON.stringify({ indication, instructions, followUp, items }) }, token);
      setMessage(created.rxNo);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not sign the prescription"); }
  }
  return (
    <section className="concept">
      <div className="top"><div><p className="muted">SCR-CLN-005 · YH-CLN-RX-001</p><h1><Text value="Prescription" /></h1></div></div>
      <form className="panel" onSubmit={submit}>
        <div className="grid">
          <Field label="Encounter ID" value={encounterId} onChange={setEncounterId} />
          <Field label="Clinical indication" value={indication} onChange={setIndication} />
          <Field label="Special instructions" value={instructions} onChange={setInstructions} />
          <Field label="Follow-up" value={followUp} onChange={setFollowUp} />
        </div>
        <table className="med-grid">
          <thead><tr><th>#</th><th><Text value="Medication" /></th><th><Text value="Dose" /></th><th><Text value="Route" /></th><th><Text value="Frequency" /></th><th><Text value="Duration" /></th><th><Text value="Quantity" /></th></tr></thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>{index + 1}</td>
                <td><select value={line.medicationId} onChange={(event) => update(index, { medicationId: event.target.value })}>{medications.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.strength}</option>)}</select></td>
                <td><input value={line.dose} onChange={(event) => update(index, { dose: event.target.value })} /></td>
                <td><input value={line.route} onChange={(event) => update(index, { route: event.target.value })} /></td>
                <td><input value={line.frequency} onChange={(event) => update(index, { frequency: event.target.value })} /></td>
                <td><input value={line.duration} onChange={(event) => update(index, { duration: event.target.value })} /></td>
                <td><input value={line.quantity} onChange={(event) => update(index, { quantity: event.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="check"><input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} /> <Text value="Acknowledge a documented allergy conflict" /></label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit"><Text value="Sign prescription" /></button>
        {message ? <p><Text value="Prescription" /> {message}</p> : null}
      </form>
    </section>
  );
}

export function ConsultationScreen({ token }: { token: string }) {
  const [encounterId, setEncounterId] = useState("");
  const [form, setForm] = useState({ chiefComplaint: "", hpi: "", pastHistory: "", allergies: "", diagnosis: "", icd10: "", secondaryDiagnoses: "", plan: "" });
  const [exam, setExam] = useState({ general: "", orientation: "", chest: "", cardiac: "", abdomen: "", other: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const saved = await api<{ status: string }>(`/api/yaren/encounters/${encounterId}/consultation`, { method: "POST", body: JSON.stringify({ ...form, examSystems: exam }) }, token);
      setMessage(saved.status);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the consultation"); }
  }
  return (
    <section className="concept">
      <div className="top"><div><p className="muted">SCR-CLN-003 · SCR-CLN-004 · OPE-08 examination</p><h1><Text value="Consultation and diagnosis" /></h1></div></div>
      <form className="panel" onSubmit={submit}>
        <Field label="Encounter ID" value={encounterId} onChange={setEncounterId} />
        <h2><Text value="Clinical documentation" /></h2>
        <div className="grid">
          <Field label="Complaint" value={form.chiefComplaint} onChange={(chiefComplaint) => set({ chiefComplaint })} />
          <Field label="History of present illness" value={form.hpi} onChange={(hpi) => set({ hpi })} />
          <Field label="Past history" value={form.pastHistory} onChange={(pastHistory) => set({ pastHistory })} />
          <Field label="Allergies" value={form.allergies} onChange={(allergies) => set({ allergies })} />
        </div>
        <h2><Text value="Diagnosis and plan" /></h2>
        <div className="grid">
          <Field label="Diagnosis" value={form.diagnosis} onChange={(diagnosis) => set({ diagnosis })} />
          <Field label="ICD-10" value={form.icd10} onChange={(icd10) => set({ icd10 })} />
          <Field label="Secondary diagnoses" value={form.secondaryDiagnoses} onChange={(secondaryDiagnoses) => set({ secondaryDiagnoses })} />
          <Field label="Plan" value={form.plan} onChange={(plan) => set({ plan })} />
        </div>
        <h2><Text value="Physical examination" /></h2>
        <div className="grid">
          <Field label="General examination" value={exam.general} onChange={(general) => setExam({ ...exam, general })} />
          <Field label="Orientation" value={exam.orientation} onChange={(orientation) => setExam({ ...exam, orientation })} />
          <Field label="Chest examination" value={exam.chest} onChange={(chest) => setExam({ ...exam, chest })} />
          <Field label="Cardiac examination" value={exam.cardiac} onChange={(cardiac) => setExam({ ...exam, cardiac })} />
          <Field label="Abdominal examination" value={exam.abdomen} onChange={(abdomen) => setExam({ ...exam, abdomen })} />
          <Field label="Other examination" value={exam.other} onChange={(other) => setExam({ ...exam, other })} />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button type="button" className="ghost" onClick={async () => {
          const found = await api<{ suggestions: { code: string; label: string }[] }>("/api/yaren/coding/suggest", { method: "POST", body: JSON.stringify({ text: `${form.chiefComplaint} ${form.diagnosis}` }) }, token);
          if (found.suggestions[0]) set({ icd10: found.suggestions[0].code, diagnosis: form.diagnosis || found.suggestions[0].label });
          setMessage(found.suggestions.map((item) => `${item.code} ${item.label}`).join(" · ") || "No code matched. The physician still chooses the diagnosis.");
        }}><Text value="Suggest a code" /></button>
        <button type="submit"><Text value="Save consultation" /></button>
        {message ? <p>{message}</p> : null}
      </form>
    </section>
  );
}

export function InvestigationScreen({ token }: { token: string }) {
  const [encounterId, setEncounterId] = useState("");
  const [indication, setIndication] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [icd10, setIcd10] = useState("");
  const [priority, setPriority] = useState("routine");
  const [selected, setSelected] = useState<string[]>([]);
  const [site, setSite] = useState("");
  const [laterality, setLaterality] = useState("N/A");
  const [contrast, setContrast] = useState(false);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [safety, setSafety] = useState({ specimen: "Blood", fasting: "N/A", pregnancy: "N/A", contrastAllergy: "No", renalRisk: "", instructions: "", medications: "" });
  const [flags, setFlags] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<{ id: string; request_no: string; priority: string; status: string; tests: string[]; result_text: string | null; critical: boolean; critical_value: string | null; receiving_lab: string | null; received_at: string | null; given_name: string; family_name: string }[]>([]);
  const [resultFor, setResultFor] = useState("");
  const [resultText, setResultText] = useState("");
  const [criticalResult, setCriticalResult] = useState(false);
  const [criticalValue, setCriticalValue] = useState("");
  const [receivingLab, setReceivingLab] = useState("");
  const load = () => api<typeof rows>("/api/yaren/investigations", {}, token).then(setRows).catch(() => setRows([]));
  useEffect(() => { void load(); }, [token]);
  function toggle(list: string[], value: string, setList: (next: string[]) => void) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const saved = await api<{ requestNo: string }>(`/api/yaren/encounters/${encounterId}/investigations`, {
        method: "POST",
        body: JSON.stringify({ priority, tests: selected, indication, diagnosis, icd10, anatomicalSite: site, laterality, contrast, safetyAcknowledged, safety: { ...safety, flags } }),
      }, token);
      setMessage(saved.requestNo);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not request the investigation"); }
  }
  return (
    <section className="concept">
      <div className="top"><div><p className="muted">SCR-CLN-006 · YH-CLN-FRM-09</p><h1><Text value="Laboratory and imaging request" /></h1></div></div>
      <form className="panel" onSubmit={submit}>
        <div className="grid">
          <Field label="Encounter ID" value={encounterId} onChange={setEncounterId} />
          <Field label="Clinical indication" value={indication} onChange={setIndication} />
          <Field label="Working diagnosis" value={diagnosis} onChange={setDiagnosis} />
          <Field label="ICD-10" value={icd10} onChange={setIcd10} />
          <label><Text value="Priority" /><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="stat">STAT</option></select></label>
          <Field label="Anatomical site" value={site} onChange={setSite} />
        </div>
        <h2><Text value="Laboratory" /></h2>
        <div className="checks">{labTests.map((test) => <label key={test} className="check"><input type="checkbox" checked={selected.includes(test)} onChange={() => toggle(selected, test, setSelected)} />{test}</label>)}</div>
        <h2><Text value="Imaging" /></h2>
        <div className="checks">{imagingTests.map((test) => <label key={test} className="check"><input type="checkbox" checked={selected.includes(test)} onChange={() => toggle(selected, test, setSelected)} />{test}</label>)}</div>
        <div className="grid">
          <label><Text value="Laterality" /><select value={laterality} onChange={(event) => setLaterality(event.target.value)}><option>N/A</option><option>Right</option><option>Left</option><option>Bilateral</option></select></label>
          <Field label="Specimen" value={safety.specimen} onChange={(specimen) => setSafety({ ...safety, specimen })} />
          <Field label="Fasting" value={safety.fasting} onChange={(fasting) => setSafety({ ...safety, fasting })} />
          <Field label="Pregnancy" value={safety.pregnancy} onChange={(pregnancy) => setSafety({ ...safety, pregnancy })} />
          <Field label="Contrast allergy" value={safety.contrastAllergy} onChange={(contrastAllergy) => setSafety({ ...safety, contrastAllergy })} />
          <Field label="Renal risk" value={safety.renalRisk} onChange={(renalRisk) => setSafety({ ...safety, renalRisk })} />
          <Field label="Relevant medications" value={safety.medications} onChange={(medications) => setSafety({ ...safety, medications })} />
          <Field label="Special instructions" value={safety.instructions} onChange={(instructions) => setSafety({ ...safety, instructions })} />
        </div>
        <div className="checks">{safetyFlags.map((flag) => <label key={flag} className="check"><input type="checkbox" checked={flags.includes(flag)} onChange={() => toggle(flags, flag, setFlags)} />{flag}</label>)}</div>
        <label className="check"><input type="checkbox" checked={contrast} onChange={(event) => setContrast(event.target.checked)} /> <Text value="Contrast" /></label>
        <label className="check"><input type="checkbox" checked={safetyAcknowledged} onChange={(event) => setSafetyAcknowledged(event.target.checked)} /> <Text value="Safety screening completed" /></label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit"><Text value="Request investigations" /></button>
        {message ? <p>{message}</p> : null}
      </form>
      <div className="table-scroll"><table><thead><tr><th><Text value="Request" /></th><th><Text value="Guest" /></th><th><Text value="Tests" /></th><th><Text value="Priority" /></th><th><Text value="Status" /></th><th><Text value="Result" /></th><th><Text value="Critical value" /></th><th><Text value="Receiving lab" /></th><th><Text value="Received" /></th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={9} className="empty"><Text value="No investigations yet" /></td></tr> : rows.map((row) => <tr key={row.id} onClick={() => setResultFor(row.id)}><td>{row.request_no}</td><td>{row.given_name} {row.family_name}</td><td>{(row.tests ?? []).join(", ")}</td><td>{row.priority}</td><td><span className={`pill ${row.status}`}>{row.status}</span></td><td>{row.result_text || "—"}{row.critical ? " · " : ""}{row.critical ? <Text value="Critical" /> : null}</td><td>{row.critical_value || "—"}</td><td>{row.receiving_lab || "—"}</td><td>{row.received_at ? new Date(row.received_at).toLocaleString() : "—"}</td></tr>)}</tbody></table></div>
      <form className="panel grid" onSubmit={async (event) => { event.preventDefault(); setError(null); try { await api(`/api/yaren/investigations/${resultFor}/result`, { method: "POST", body: JSON.stringify({ resultText, critical: criticalResult, criticalValue, receivingLab }) }, token); setResultText(""); setCriticalValue(""); setReceivingLab(""); setCriticalResult(false); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not file the result"); } }}>
        <label><Text value="Request" /><select value={resultFor} onChange={(event) => setResultFor(event.target.value)}><option value="">—</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.request_no}</option>)}</select></label>
        <Field label="Result" value={resultText} onChange={setResultText} />
        <Field label="Critical value" value={criticalValue} onChange={setCriticalValue} />
        <Field label="Receiving lab" value={receivingLab} onChange={setReceivingLab} />
        <label className="check"><input type="checkbox" checked={criticalResult} onChange={(event) => setCriticalResult(event.target.checked)} /> <Text value="Critical" /></label>
        <button type="submit"><Text value="File result" /></button>
      </form>
    </section>
  );
}

export const settingModules: { title: string; keys: string[]; note: string }[] = [
  { title: "Front desk", keys: ["clinic_name", "legal_entity", "currency", "tagline"], note: "These names appear on the desk and on printed documents." },
  { title: "Clinical", keys: [], note: "Coding stays a word list. The physician chooses the code. There is no clinical credential to enter." },
  { title: "Pharmacy", keys: [], note: "Stock thresholds stay on each medicine. There is no supplier credential to enter." },
  { title: "Billing", keys: ["tax_percent", "tax_reg_no", "commercial_reg"], note: "Replace the placeholder tax and commercial numbers when you have the real registrations." },
  { title: "Insurance", keys: ["insurer_mode", "insurer_adapter_url", "insurer_adapter_host", "insurer_api_notes", "insurer_client_id", "insurer_client_secret"], note: "Leave the adapter blank until the insurer gives you an address and credentials. Ruleset stays the working mode." },
  { title: "Transfers", keys: [], note: "Transfer destinations are entered on each handover. There is no ambulance credential to enter." },
  { title: "Hotels", keys: [], note: "Hotel names and cities are edited on master data." },
  { title: "Quality", keys: ["survey_template", "low_nps_threshold"], note: "The survey template and the low-score threshold are edited here." },
  { title: "Payroll", keys: ["payroll_rules"], note: "Write the pay rules here. A draft run does not apply this text by itself." },
  { title: "Acceptance", keys: ["uat_signed_by", "uat_signed_on", "uat_note"], note: "A name saved here records who reviewed the scripts. It does not mark them passed." },
  { title: "Control", keys: ["mfa_required", "rpo_hours", "rto_hours"], note: "Multi-factor sign-in stays off until you set it to true and approve the change." },
];

const settingLabels: Record<string, string> = {
  clinic_name: "Clinic name",
  legal_entity: "Legal entity",
  currency: "Currency",
  tagline: "Tagline",
  tax_percent: "Tax percent",
  tax_reg_no: "Tax registration",
  commercial_reg: "Commercial registration",
  insurer_mode: "Insurer mode",
  insurer_adapter_url: "Insurer address",
  insurer_adapter_host: "Approved host",
  insurer_api_notes: "Insurer API notes",
  insurer_client_id: "Insurer client id",
  insurer_client_secret: "Insurer client secret",
  survey_template: "Survey template",
  low_nps_threshold: "Low score threshold",
  payroll_rules: "Payroll rules",
  uat_signed_by: "Signed by",
  uat_signed_on: "Signed on",
  uat_note: "Sign-off note",
  mfa_required: "Multi-factor sign-in",
  rpo_hours: "Recovery point hours",
  rto_hours: "Recovery time hours",
};

export function ModuleSettings({ token, title, keys, note }: { token: string; title: string; keys: string[]; note: string }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [effective, setEffective] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keyList = keys.join("|");
  useEffect(() => {
    if (keys.length === 0) return;
    api<Record<string, string>>("/api/yaren/settings", {}, token).then((all) => {
      const next: Record<string, string> = {};
      for (const key of keys) next[key] = all[key] ?? "";
      setValues(next);
    }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not open settings"));
  }, [token, keyList]);
  if (keys.length === 0) {
    return <section className="panel"><h2><Text value={title} /></h2><p className="muted"><Text value={note} /></p></section>;
  }
  return (
    <form className="panel grid" onSubmit={async (event) => {
      event.preventDefault();
      setError(null);
      setNotice(null);
      const payload = effective ? { ...values, _effective: effective } : values;
      const save = (extra: Record<string, string> = {}) => api<{ scheduled?: string; effective?: string }>("/api/yaren/settings", { method: "PUT", body: JSON.stringify({ ...payload, ...extra }) }, token);
      try {
        const saved = await save();
        setNotice(saved.scheduled === "yes" ? `Scheduled ${saved.effective}` : "Saved");
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Could not save settings";
        if (!message.includes("needs approval")) { setError(message); return; }
        if (!window.confirm("Approve this change to tax, sign-in, insurer, payroll, or acceptance settings?")) return;
        try {
          const saved = await save({ _approved: "yes" });
          setNotice(saved.scheduled === "yes" ? `Scheduled ${saved.effective}` : "Saved");
        } catch (again) {
          setError(again instanceof Error ? again.message : "Could not save settings");
        }
      }
    }}>
      <h2><Text value={title} /></h2>
      <p className="muted"><Text value={note} /></p>
      {keys.map((key) => <Field key={key} secret={/secret|password/i.test(key)} label={settingLabels[key] ?? key.replaceAll("_", " ")} value={values[key] ?? ""} onChange={(next) => setValues({ ...values, [key]: next })} />)}
      <label><Text value="Effective date" /><input type="date" value={effective} onChange={(event) => setEffective(event.target.value)} /></label>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p>{notice}</p> : null}
      <button type="submit"><Text value="Save settings" /></button>
    </form>
  );
}

export function TraceabilityScreen({ token }: { token: string }) {
  const [query, setQuery] = useState("");
  const [run, setRun] = useState<{ passed: number; failed: number; results: { id: string; passed: boolean; evidence: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<NonNullable<typeof run>>("/api/yaren/acceptance/latest", {}, token).then(setRun).catch(() => undefined);
  useEffect(() => { void load(); }, [token]);
  const results = new Map((run?.results ?? []).map((row) => [row.id, row]));
  const rows = requirements.filter((row) => `${row.id} ${row.statement}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="concept">
      <div className="top"><div><p className="muted">{run ? `${run.passed} passed · ${run.failed} failed` : "Acceptance has not been run"}</p><h1><Text value="Requirement register" /></h1></div><button type="button" className="primary" onClick={async () => { setError(null); try { await api("/api/yaren/acceptance/run", { method: "POST" }, token); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "The acceptance run failed"); } }}><Text value="Run acceptance" /></button></div>
      <ModuleSettings token={token} title="Acceptance" keys={["uat_signed_by", "uat_signed_on", "uat_note"]} note="A name saved here records who reviewed the scripts. It does not mark them passed." />
      {error ? <p className="error">{error}</p> : null}
      <Field label="Search" value={query} onChange={setQuery} />
      <table>
        <thead><tr><th>ID</th><th><Text value="Requirement" /></th><th><Text value="Acceptance" /></th><th><Text value="Status" /></th></tr></thead>
        <tbody>{rows.map((row) => { const result = results.get(row.id); return <tr key={row.id}><td>{row.id}</td><td>{row.statement}</td><td>{row.uat}</td><td><span className={`pill ${result?.passed ? "verified" : "rejected"}`}>{result ? (result.passed ? "passed" : "failed") : row.status}</span></td></tr>; })}</tbody>
      </table>
    </section>
  );
}

export function PayrollScreen({ token, staff }: { token: string; staff: { id: string; display_name: string }[] }) {
  const [period, setPeriod] = useState("2026-09");
  const [gross, setGross] = useState("8000");
  const [deduction, setDeduction] = useState("0");
  const [userId, setUserId] = useState(staff[0]?.id ?? "");
  const [rows, setRows] = useState<{ id: string; period: string; status: string; net: number; lines: { name: string; gross: number; deduction: number; net: number }[] }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<typeof rows>("/api/yaren/payroll/runs", {}, token).then(setRows).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not open payroll"));
  useEffect(() => { void load(); }, [token]);
  return (
    <section className="concept">
      <div className="top"><div><p className="muted">Draft pay run</p><h1><Text value="Payroll" /></h1></div></div>
      <ModuleSettings token={token} title="Payroll" keys={["payroll_rules"]} note="Write the pay rules here. A draft run does not apply this text by itself." />
      <form className="panel grid" onSubmit={async (event) => { event.preventDefault(); await api("/api/yaren/payroll/runs", { method: "POST", body: JSON.stringify({ period, lines: [{ userId, gross: Number(gross), deduction: Number(deduction) }] }) }, token); await load(); }}>
        <Field label="Period" value={period} onChange={setPeriod} />
        <label><Text value="Staff" /><select value={userId} onChange={(event) => setUserId(event.target.value)}>{staff.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label>
        <Field label="Gross" value={gross} onChange={setGross} />
        <Field label="Deduction" value={deduction} onChange={setDeduction} />
        {error ? <p className="error">{error}</p> : null}
        <button type="submit"><Text value="Save pay run" /></button>
      </form>
      <div className="table-scroll"><table><thead><tr><th><Text value="Period" /></th><th><Text value="Staff" /></th><th><Text value="Gross" /></th><th><Text value="Deduction" /></th><th><Text value="Net" /></th><th><Text value="Status" /></th></tr></thead><tbody>{rows.flatMap((row) => (row.lines.length ? row.lines : [{ name: "—", gross: 0, deduction: 0, net: row.net }]).map((line, index) => <tr key={`${row.id}-${index}`}><td>{index === 0 ? row.period : ""}</td><td>{line.name}</td><td>{line.gross}</td><td>{line.deduction}</td><td>{line.net}</td><td>{index === 0 ? <span className={`pill ${row.status}`}>{row.status}</span> : null}</td></tr>))}</tbody></table></div>
    </section>
  );
}

export function LedgerScreen({ token }: { token: string }) {
  const [data, setData] = useState<{ generatedAt: string; receivables: { invoice_no: string; amount: number; status: string }[]; cash: { invoice_no: string; amount: number; method: string }[]; journal?: { account: string; debit: number; credit: number }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<NonNullable<typeof data>>("/api/yaren/ledger", {}, token).then(setData).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not open the ledger")); }, [token]);
  return (
    <section className="concept">
      <div className="top"><div><p className="muted">Receivables journal assembled from issued invoices and payments</p><h1><Text value="Receivables" /></h1></div></div>
      {error ? <p className="error">{error}</p> : null}
      {data ? <p className="muted"><Text value="Prepared" /> {new Date(data.generatedAt).toLocaleString()}</p> : null}
      <h2><Text value="Accounts receivable" /></h2>
      <div className="table-scroll"><table><thead><tr><th><Text value="Invoice" /></th><th><Text value="Status" /></th><th><Text value="Amount" /></th></tr></thead><tbody>{data?.receivables.map((row) => <tr key={row.invoice_no}><td>{row.invoice_no}</td><td><span className={`pill ${row.status}`}>{row.status}</span></td><td>{row.amount}</td></tr>)}</tbody></table></div>
      <h2><Text value="Cash received" /></h2>
      <div className="table-scroll"><table><thead><tr><th><Text value="Invoice" /></th><th><Text value="Method" /></th><th><Text value="Amount" /></th></tr></thead><tbody>{data?.cash.map((row, index) => <tr key={`${row.invoice_no}-${index}`}><td>{row.invoice_no}</td><td>{row.method}</td><td>{row.amount}</td></tr>)}</tbody></table></div>
      <h2><Text value="Journal" /></h2>
      <div className="table-scroll"><table><thead><tr><th><Text value="Account" /></th><th><Text value="Debit" /></th><th><Text value="Credit" /></th></tr></thead><tbody>{(data?.journal ?? []).map((row) => <tr key={row.account}><td>{row.account.replaceAll("_", " ")}</td><td>{row.debit}</td><td>{row.credit}</td></tr>)}</tbody></table></div>
    </section>
  );
}

const accompanyingDocuments = ["Referral letter", "Medical report", "Medication list", "Lab results", "Imaging", "Insurance approval", "Invoice", "ID copy", "Patient belongings", "Medical devices"];

type CareRow = { time: string; item: string; dose: string; response: string; by: string };
type WatchRow = { time: string; event: string; temp: string; bp: string; pulse: string; spo2: string; notes: string };

export function AmbulanceScreen({ token }: { token: string }) {
  const [form, setForm] = useState({ encounterId: "", destination: "", reason: "", snapshot: "", gcs: "", receivingDepartment: "", receivingClinician: "", referringClinician: "", ambulanceCrew: "", oxygen: "", monitor: "", isolation: "", closureNotes: "" });
  const [treatment, setTreatment] = useState<CareRow[]>([{ time: "", item: "", dose: "", response: "", by: "" }, { time: "", item: "", dose: "", response: "", by: "" }, { time: "", item: "", dose: "", response: "", by: "" }]);
  const [observations, setObservations] = useState<WatchRow[]>([{ time: "", event: "", temp: "", bp: "", pulse: "", spo2: "", notes: "" }, { time: "", event: "", temp: "", bp: "", pulse: "", spo2: "", notes: "" }, { time: "", event: "", temp: "", bp: "", pulse: "", spo2: "", notes: "" }]);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await api<{ transferNo: string }>("/api/yaren/transfers", { method: "POST", body: JSON.stringify({
        encounterId: form.encounterId,
        destination: form.destination,
        reason: form.reason,
        snapshot: form.snapshot,
        priority: "emergency",
        handover: {
          gcs: form.gcs,
          receivingDepartment: form.receivingDepartment,
          receivingClinician: form.receivingClinician,
          referringClinician: form.referringClinician,
          ambulanceCrew: form.ambulanceCrew,
          oxygen: form.oxygen,
          monitor: form.monitor,
          isolation: form.isolation,
          closureNotes: form.closureNotes,
          checklist,
          treatment: treatment.filter((row) => row.item),
          observations: observations.filter((row) => row.event || row.notes),
        },
      }) }, token);
      setMessage(created.transferNo);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not request the ambulance"); }
  }
  return (
    <section className="concept">
      <div className="top"><div><p className="muted">SCR-REF-002 · YH-OPS-TRF-007</p><h1><Text value="Ambulance handover" /></h1></div></div>
      <form className="panel" onSubmit={submit}>
        <div className="grid">
          <Field label="Encounter ID" value={form.encounterId} onChange={(encounterId) => set({ encounterId })} />
          <Field label="Destination" value={form.destination} onChange={(destination) => set({ destination })} />
          <Field label="Reason" value={form.reason} onChange={(reason) => set({ reason })} />
          <Field label="Clinical snapshot" value={form.snapshot} onChange={(snapshot) => set({ snapshot })} />
          <Field label="GCS" value={form.gcs} onChange={(gcs) => set({ gcs })} />
          <Field label="Receiving department" value={form.receivingDepartment} onChange={(receivingDepartment) => set({ receivingDepartment })} />
          <Field label="Referring clinician" value={form.referringClinician} onChange={(referringClinician) => set({ referringClinician })} />
          <Field label="Ambulance crew" value={form.ambulanceCrew} onChange={(ambulanceCrew) => set({ ambulanceCrew })} />
          <Field label="Receiving clinician" value={form.receivingClinician} onChange={(receivingClinician) => set({ receivingClinician })} />
          <Field label="Oxygen" value={form.oxygen} onChange={(oxygen) => set({ oxygen })} />
          <Field label="Cardiac monitor" value={form.monitor} onChange={(monitor) => set({ monitor })} />
          <Field label="Isolation" value={form.isolation} onChange={(isolation) => set({ isolation })} />
          <Field label="Closure notes" value={form.closureNotes} onChange={(closureNotes) => set({ closureNotes })} />
        </div>
        <h2><Text value="Treatment before transfer" /></h2>
        <table className="med-grid"><thead><tr><th><Text value="Time" /></th><th><Text value="Item" /></th><th><Text value="Dose" /></th><th><Text value="Response" /></th><th><Text value="By" /></th></tr></thead><tbody>{treatment.map((row, index) => <tr key={index}>{(["time", "item", "dose", "response", "by"] as const).map((key) => <td key={key}><input value={row[key]} onChange={(event) => setTreatment(treatment.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: event.target.value } : item))} /></td>)}</tr>)}</tbody></table>
        <h2><Text value="In-transit observations" /></h2>
        <table className="med-grid"><thead><tr><th><Text value="Time" /></th><th><Text value="Event" /></th><th><Text value="Temp" /></th><th><Text value="BP" /></th><th><Text value="Pulse" /></th><th><Text value="SpO2" /></th><th><Text value="Notes" /></th></tr></thead><tbody>{observations.map((row, index) => <tr key={index}>{(["time", "event", "temp", "bp", "pulse", "spo2", "notes"] as const).map((key) => <td key={key}><input value={row[key]} onChange={(event) => setObservations(observations.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: event.target.value } : item))} /></td>)}</tr>)}</tbody></table>
        <h2><Text value="Documents accompanying the patient" /></h2>
        <div className="checks">{accompanyingDocuments.map((label) => <label className="check" key={label}><input type="checkbox" checked={Boolean(checklist[label])} onChange={(event) => setChecklist({ ...checklist, [label]: event.target.checked })} /> <Text value={label} /></label>)}</div>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit"><Text value="Request ambulance" /></button>
        {message ? <p>{message}</p> : null}
      </form>
    </section>
  );
}

export function Welcome() {
  const { t, toggle } = useLanguage();
  return (
    <main className="welcome">
      <header className="welcome-bar">
        <Mark />
        <button type="button" className="ghost" onClick={toggle}>{t.language}</button>
      </header>
      <p className="arabic">يارن للرعاية الصحية · رعاية تتجاوز حدود الإقامة</p>
      <h1><Text value="Care beyond your stay" /></h1>
      <p className="welcome-lead"><Text value="Hotel clinics for guests who need a doctor, a nurse, a prescription, or a transfer during their stay." /></p>
      <div className="welcome-points">
        <article><strong><Text value="Doctor at the clinic" /></strong><Text value="A visit starts at reception and stays with one record." /></article>
        <article><strong><Text value="Nurse to the room" /></strong><Text value="The hotel asks. The clinic answers, without opening the medical notes to the property." /></article>
        <article><strong><Text value="Medicine and transfer" /></strong><Text value="A prescription, a claim, or an ambulance leaves with the same guest." /></article>
      </div>
      <Link className="gate-cta" to="/"><Text value="Staff sign in" /></Link>
    </main>
  );
}

export type { Requirement };
