import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { ApiError, api, loadSession, saveSession, type Session } from "./api";
import { Mark } from "./brand";
import { Documents } from "./documents";
import { translate, useLanguage } from "./i18n";
import { AmbulanceScreen, ConsultationScreen, InvestigationScreen, LedgerScreen, ModuleSettings, PayrollScreen, PrescriptionScreen, TraceabilityScreen, Welcome, settingModules } from "./screens";
import { Field, Text } from "./ui";

type Boot = {
  actor: { id: string; role: string; hotelId: string | null };
  hotels: { id: string; name: string; city: string; phone: string | null; contract_notes: string | null }[];
  clinics: { id: string; hotel_id: string; name: string }[];
  centers: { id: string; name: string; code: string; city: string; phone: string | null; status: string; address_line: string | null }[];
  services: { id: string; code: string; name: string; category: string; unit_price: number }[];
  insurers: { id: string; name: string }[];
  medications: { id: string; code: string; name: string; strength: string; form: string; on_hand: number }[];
  settings: Record<string, string>;
  staff: { id: string; display_name: string; role: string; email: string; status: string; hotel_id: string | null; license_no: string | null; user_type?: string }[];
};

const primaryNav = [
  ["/", "Front desk"],
  ["/triage", "Triage"],
  ["/consult", "Doctor"],
  ["/pharmacy", "Pharmacy"],
  ["/inventory", "Inventory"],
  ["/claims", "Insurance"],
  ["/invoices", "Billing"],
  ["/operations", "Reports"],
  ["/hotels", "Hotel CRM"],
  ["/settings", "Settings"],
] as const;

const nav = [
  ["Front desk", ["/", "Desk", "/register", "Register", "/search", "Find patient", "/queue", "Queue", "/appointments", "Appointments"]],
  ["Clinical", ["/triage", "Triage", "/record", "Medical record", "/consult", "Consultation", "/prescription", "Prescription", "/investigations", "Investigations", "/report", "Report & clearance", "/progress", "Progress"]],
  ["Pharmacy", ["/pharmacy", "Dispensing", "/inventory", "Inventory", "/alerts", "Stock alerts"]],
  ["Revenue", ["/invoices", "Invoices", "/payments", "Payments", "/coverage", "Coverage", "/claims", "Claims"]],
  ["Transfers", ["/referrals", "Referrals", "/ambulance", "Ambulance", "/transfers", "Tracking"]],
  ["Hotels", ["/hotels", "Hotel 360", "/requests", "Room requests", "/partner", "Partner portal"]],
  ["Quality", ["/feedback", "Satisfaction", "/incidents", "Incidents", "/operations", "Operations", "/monthly", "Monthly report", "/finance", "Collections", "/management", "Management"]],
  ["Control", ["/users", "Users", "/roles", "Roles", "/audit", "Audit", "/settings", "Settings", "/master-data", "Master data", "/traceability", "Requirements", "/ledger", "Receivables", "/payroll", "Payroll", "/changes", "Change requests"]],
] as const;

export function App() {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(() => loadSession());
  if (location.pathname === "/welcome") return <Welcome />;
  if (!session) return <Login onSuccess={(next) => { saveSession(next); setSession(next); }} />;
  return <Shell session={session} onSignOut={() => { saveSession(null); setSession(null); }} />;
}

function Login({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const { t, toggle } = useLanguage();
  const [email, setEmail] = useState("admin@yaren.local");
  const [password, setPassword] = useState("ChangeMe!2026");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSuccess(await api<Session>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed");
      setBusy(false);
    }
  }
  return (
    <div className="gate">
      <section className="gate-story">
        <Mark light />
        <p className="gate-ar">يارن للرعاية الصحية · رعاية تتجاوز حدود الإقامة</p>
        <h1><Text value="Care beyond your stay" /></h1>
        <p className="gate-lead"><Text value="Staff entrance for the hotel clinics. One place for the guest, the visit, the medicine, and the claim." /></p>
        <ol className="gate-steps">
          <li><strong>1</strong><span><Text value="A guest asks for care" /></span></li>
          <li><strong>2</strong><span><Text value="The clinic sees the visit through" /></span></li>
          <li><strong>3</strong><span><Text value="The stay continues with a clear record" /></span></li>
        </ol>
        <NavLink to="/welcome"><Text value="About Yaren" /></NavLink>
      </section>
      <section className="gate-panel">
        <div className="gate-card">
          <div className="gate-card-top">
            <Mark />
            <button type="button" className="ghost" onClick={toggle}>{t.language}</button>
          </div>
          <div>
            <h2>{t.signIn}</h2>
            <p className="muted"><Text value="Use your staff account. Guests do not sign in here." /></p>
          </div>
          <form onSubmit={submit}>
            <label><Text value="Email" /><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <div className="field">
              <span className="field-head"><label htmlFor="staff-password"><Text value="Password" /></label><button type="button" className="text-button" onClick={() => setShowPassword((current) => !current)}><Text value={showPassword ? "Hide" : "Show"} /></button></span>
              <input id="staff-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            {error ? <p className="error" role="alert">{error}</p> : null}
            <button type="submit" disabled={busy}><Text value={busy ? "Signing in" : "Sign in"} /></button>
          </form>
        </div>
      </section>
    </div>
  );
}

function Shell({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const { lang, t, toggle } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [find, setFind] = useState("");
  const routeGroup = groupFor(location.pathname);
  const [picked, setPicked] = useState<string | null>(null);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setPicked(null); }, [location.pathname]);
  useEffect(() => {
    api<Boot>("/api/yaren/bootstrap", {}, session.token).then(setBoot).catch((caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 401) {
        onSignOut();
        return;
      }
      setError(messageOf(caught));
    });
  }, [session.token]);
  if (!boot) return <main className="opening"><p>{error ?? "Opening Yaren One…"}</p></main>;
  const open = picked ?? routeGroup;
  return (
    <div className="shell">
      <aside>
        <Mark />
        <nav>
          {primaryNav.map(([path, label]) => <NavLink key={path} to={path} end={path === "/"}>{translate(lang, label)}</NavLink>)}
          {nav.map(([title, items]) => (
            <div key={title}>
              <button type="button" className="nav-group" aria-expanded={open === title} onClick={() => setPicked(open === title ? "" : title)}>
                <span>{translate(lang, title)}</span>
                <span aria-hidden="true">{open === title ? "–" : "+"}</span>
              </button>
              {open === title ? pairs(items).map(([path, label]) => <NavLink key={path} to={path} end={path === "/"}>{translate(lang, label)}</NavLink>) : null}
            </div>
          ))}
        </nav>
      </aside>
      <main>
        <header className="bar">
          <form className="bar-search" onSubmit={(event) => { event.preventDefault(); if (find.trim().length >= 2) navigate(`/search?q=${encodeURIComponent(find.trim())}`); }}>
            <input value={find} onChange={(event) => setFind(event.target.value)} placeholder={translate(lang, "Search patient, name, room, passport or phone")} />
          </form>
          <div>
            <span>{boot.hotels[0]?.name}</span>
            <strong>{session.user.displayName}</strong>
            <span>{session.user.role.replaceAll("_", " ")}</span>
            <button type="button" className="ghost" onClick={toggle}>{t.language}</button>
            <button type="button" className="ghost" onClick={onSignOut}>{translate(lang, "Sign out")}</button>
          </div>
        </header>
        <Routes>
          <Route path="/" element={<Desk token={session.token} currency={boot.settings.currency ?? "EGP"} boot={boot} />} />
          <Route path="/register" element={<Register boot={boot} token={session.token} />} />
          <Route path="/search" element={<Search token={session.token} />} />
          <Route path="/queue" element={<Queue token={session.token} />} />
          <Route path="/appointments" element={<Appointments token={session.token} />} />
          <Route path="/triage" element={<Triage token={session.token} />} />
          <Route path="/record" element={<Record token={session.token} />} />
          <Route path="/consult" element={<ConsultationScreen token={session.token} />} />
          <Route path="/prescription" element={<PrescriptionScreen token={session.token} medications={boot.medications} />} />
          <Route path="/investigations" element={<InvestigationScreen token={session.token} />} />
          <Route path="/report" element={<Report token={session.token} boot={boot} />} />
          <Route path="/progress" element={<Progress token={session.token} />} />
          <Route path="/pharmacy" element={<Pharmacy token={session.token} />} />
          <Route path="/inventory" element={<Inventory token={session.token} />} />
          <Route path="/alerts" element={<Alerts token={session.token} />} />
          <Route path="/invoices" element={<Invoices boot={boot} token={session.token} />} />
          <Route path="/payments" element={<Payments token={session.token} />} />
          <Route path="/coverage" element={<Coverage boot={boot} token={session.token} />} />
          <Route path="/claims" element={<Claims token={session.token} />} />
          <Route path="/referrals" element={<Referrals token={session.token} />} />
          <Route path="/ambulance" element={<Ambulance token={session.token} />} />
          <Route path="/transfers" element={<Transfers token={session.token} />} />
          <Route path="/hotels" element={<Hotels boot={boot} token={session.token} />} />
          <Route path="/requests" element={<Requests boot={boot} token={session.token} />} />
          <Route path="/partner" element={<Partner token={session.token} boot={boot} />} />
          <Route path="/feedback" element={<Feedback boot={boot} token={session.token} />} />
          <Route path="/incidents" element={<Incidents token={session.token} />} />
          <Route path="/operations" element={<Operations token={session.token} boot={boot} />} />
          <Route path="/monthly" element={<Monthly boot={boot} token={session.token} />} />
          <Route path="/finance" element={<Finance token={session.token} />} />
          <Route path="/management" element={<Management token={session.token} boot={boot} />} />
          <Route path="/users" element={<Users boot={boot} token={session.token} />} />
          <Route path="/roles" element={<Roles boot={boot} token={session.token} />} />
          <Route path="/audit" element={<Audit token={session.token} />} />
          <Route path="/settings" element={<Settings token={session.token} />} />
          <Route path="/master-data" element={<Master boot={boot} token={session.token} />} />
          <Route path="/traceability" element={<TraceabilityScreen token={session.token} />} />
          <Route path="/changes" element={<Changes token={session.token} />} />
          <Route path="/ledger" element={<LedgerScreen token={session.token} />} />
          <Route path="/payroll" element={<PayrollScreen token={session.token} staff={boot.staff} />} />
          <Route path="/encounter/:id" element={<Encounter token={session.token} />} />
          <Route path="/documents/:id" element={<Documents token={session.token} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Page({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  const { lang } = useLanguage();
  return <section className="concept"><header className="concept-title"><div><p className="kicker">{kicker}</p><h1>{translate(lang, title)}</h1></div></header><div className="stack">{children}</div></section>;
}

function Desk({ token, currency, boot }: { token: string; currency: string; boot: Boot }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<{ counts: Record<string, number>; queue: QueueRow[] } | null>(null);
  const [alerts, setAlerts] = useState<{ allergies: AlertPerson[]; emergencies: AlertPerson[]; unpaid: { invoice_no: string; outstanding: number; given_name: string; family_name: string }[]; vip: AlertPerson[]; overdue?: { request_no: string; guest_name: string; room_no: string; priority: string }[]; escalations?: { id: string; severity: string; description: string }[] } | null>(null);
  const [form, setForm] = useState({ fullName: "", nationality: "Egyptian", passportNo: "", phone: "", sex: "female", dateOfBirth: "", hotelId: boot.hotels[0]?.id ?? "", clinicId: boot.clinics[0]?.id ?? "", roomNo: "", visitType: "walk_in", insurerName: "", policyNumber: "", confirmDuplicate: false });
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const load = () => {
    api<{ counts: Record<string, number>; queue: QueueRow[] }>("/api/yaren/desk", {}, token).then(setData).catch(() => setData({ counts: {}, queue: [] }));
    api<NonNullable<typeof alerts>>("/api/yaren/alerts", {}, token).then(setAlerts).catch(() => undefined);
  };
  useEffect(() => { load(); }, [token]);
  const counts = data?.counts ?? {};
  const clinics = boot.clinics.filter((clinic) => clinic.hotel_id === form.hotelId);
  async function register(event: FormEvent) {
    event.preventDefault();
    const [givenName, ...rest] = form.fullName.trim().split(/\s+/);
    const familyName = rest.join(" ") || givenName;
    setNotice(null);
    try {
      const created = await api<{ id: string; encounter: { id: string } }>("/api/yaren/patients", { method: "POST", body: JSON.stringify({ ...form, givenName, familyName }) }, token);
      await api(`/api/yaren/patients/${created.id}/consent`, { method: "POST" }, token);
      navigate(`/documents/${created.encounter.id}`);
    } catch (caught) {
      const message = messageOf(caught);
      if (message.startsWith("Possible existing")) set({ confirmDuplicate: true });
      setNotice(message);
    }
  }
  return (
    <section className="concept">
      <header className="concept-title">
        <div><h1><Text value="Front desk" /> <span>الاستقبال</span></h1><p><Text value="Guests. Care. Wherever you stay." /></p></div>
      </header>
      <div className="fd-kpis">
        <Kpi label="Today's check-ins" value={counts.checkins ?? 0} />
        <Kpi label="Waiting" value={counts.waiting ?? 0} />
        <Kpi label="Room visits" value={counts.room_visits ?? 0} />
        <Kpi label="Insurance pending" value={counts.insurance_pending ?? 0} />
        <Kpi label="Open invoices" value={counts.open_invoices ?? 0} detail={`${counts.open_amount ?? 0} ${currency}`} />
      </div>
      <div className="fd-launch">
        <NavLink to="/register"><strong><Text value="New patient" /></strong><span>مريض جديد</span></NavLink>
        <form onSubmit={(event) => { event.preventDefault(); navigate(`/search?q=${encodeURIComponent(query)}`); }}>
          <strong><Text value="Existing patient search" /></strong>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
        </form>
      </div>
      <div className="fd-mid">
        <form className="panel" onSubmit={register}>
          <h2><Text value="Quick registration" /> <span>تسجيل سريع</span></h2>
          <div className="grid">
            <Field label="Full name" value={form.fullName} onChange={(fullName) => set({ fullName })} />
            <Field label="Nationality" value={form.nationality} onChange={(nationality) => set({ nationality })} />
            <Field label="Passport / ID" value={form.passportNo} onChange={(passportNo) => set({ passportNo })} />
            <Field label="Mobile" value={form.phone} onChange={(phone) => set({ phone })} />
            <Select label="Gender" value={form.sex} onChange={(sex) => set({ sex })} options={["female", "male", "other", "unknown"]} />
            <label><Text value="Date of birth" /><input type="date" required value={form.dateOfBirth} onChange={(event) => set({ dateOfBirth: event.target.value })} /></label>
            <label><Text value="Hotel" /><select value={form.hotelId} onChange={(event) => set({ hotelId: event.target.value })}>{boot.hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label>
            <label><Text value="Clinic" /><select value={form.clinicId} onChange={(event) => set({ clinicId: event.target.value })}>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select></label>
            <Field label="Room" value={form.roomNo} onChange={(roomNo) => set({ roomNo })} />
            <Select label="Visit" value={form.visitType} onChange={(visitType) => set({ visitType })} options={["walk_in", "room_visit", "emergency", "consultation", "follow_up"]} />
            <label><Text value="Insurer" /><select value={form.insurerName} onChange={(event) => set({ insurerName: event.target.value })}><option value=""><Text value="Uninsured" /></option>{boot.insurers.map((insurer) => <option key={insurer.id}>{insurer.name}</option>)}</select></label>
            <Field label="Policy number" value={form.policyNumber} onChange={(policyNumber) => set({ policyNumber })} />
          </div>
          {notice ? <p className="error">{notice}</p> : null}
          <div className="actions">
            <button type="button" className="ghost" onClick={() => set({ fullName: "", passportNo: "", phone: "", roomNo: "", policyNumber: "", confirmDuplicate: false })}><Text value="Clear" /></button>
            <button type="submit" className="gold"><Text value={form.confirmDuplicate ? "Create anyway" : "Register patient"} /></button>
          </div>
        </form>
        <div className="fd-side">
          <section className="panel">
            <h2><Text value="Reception actions" /></h2>
            <div className="fd-actions">
              <NavLink to="/coverage"><Text value="Verify coverage" /></NavLink>
              <NavLink to="/register"><Text value="Print consent" /></NavLink>
              <NavLink to="/requests"><Text value="Call nurse" /></NavLink>
              <NavLink to="/requests"><Text value="Request doctor to room" /></NavLink>
              <NavLink to="/invoices"><Text value="Open invoice" /></NavLink>
              <NavLink to="/triage"><Text value="Send to triage" /></NavLink>
            </div>
          </section>
          <section className="panel">
            <h2><Text value="Guest journey" /></h2>
            <div className="journey">{["Reception", "Triage", "Doctor", "Treatment", "Insurance / Payment", "Follow-up"].map((step) => <span key={step}><Text value={step} /></span>)}</div>
          </section>
        </div>
      </div>
      <section className="panel">
        <h2><Text value="Current queue" /> <span>قائمة الانتظار</span></h2>
        <QueueTable rows={(data?.queue ?? []).slice(0, 8)} onMove={async (id, status) => { await api(`/api/yaren/encounters/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }, token); load(); }} />
      </section>
      <div className="fd-lower">
        <section className="panel">
          <h2><Text value="Recent arrivals" /></h2>
          <ul className="plain">{(data?.queue ?? []).slice(0, 4).map((row) => <li key={row.id}><strong>{row.given_name} {row.family_name}</strong><span>{row.room_no} · {row.hotel_name}</span><span className={`pill ${row.status}`}>{row.status.replaceAll("_", " ")}</span></li>)}</ul>
        </section>
        <section className="panel">
          <h2><Text value="Alerts" /></h2>
          <div className="alerts">
            {alerts?.allergies.map((row) => <p className="danger" key={row.ticket_no}><Text value="Allergy" /> · {row.given_name} {row.family_name} · {row.allergies}</p>)}
            {alerts?.emergencies.map((row) => <p className="danger" key={`e-${row.ticket_no}`}><Text value="Emergency" /> · {row.given_name} {row.family_name}</p>)}
            {alerts?.unpaid.map((row) => <p className="warn" key={row.invoice_no}><Text value="Unpaid" /> · {row.given_name} {row.family_name} · {row.outstanding} {currency}</p>)}
            {alerts?.vip.map((row) => <p key={`v-${row.ticket_no}`}><Text value="VIP" /> · {row.given_name} {row.family_name}</p>)}
            {alerts?.overdue?.map((row) => <p className="warn" key={row.request_no}><Text value="Overdue" /> · {row.guest_name} · {row.room_no}</p>)}
            {alerts?.escalations?.map((row) => <p className="danger" key={row.id}><Text value="Escalation" /> · {row.description}</p>)}
            {alerts && alerts.allergies.length + alerts.emergencies.length + alerts.unpaid.length + alerts.vip.length + (alerts.overdue?.length ?? 0) + (alerts.escalations?.length ?? 0) === 0 ? <p><Text value="No alerts" /></p> : null}
          </div>
        </section>
      </div>
      <ModuleSettings token={token} title="Front desk" keys={["clinic_name", "legal_entity", "currency", "tagline"]} note="These names appear on the desk and on printed documents." />
    </section>
  );
}

function Register({ boot, token }: { boot: Boot; token: string }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ givenName: "", familyName: "", dateOfBirth: "", sex: "female", nationality: "Egyptian", phone: "", email: "", passportNo: "", homeAddress: "", hotelId: boot.hotels[0]?.id ?? "", clinicId: boot.clinics[0]?.id ?? "", roomNo: "", city: "", arrivalDate: "", departureDate: "", tourOperator: "", insurerName: "", policyNumber: "", allergies: "", chronicConditions: "", regularMedications: "", otherAlerts: "", vip: false, visitType: "walk_in", confirmDuplicate: false });
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step < 3) { setStep(step + 1); return; }
    setError(null);
    try {
      const created = await api<{ id: string; encounter: { id: string } }>("/api/yaren/patients", { method: "POST", body: JSON.stringify(form) }, token);
      await api(`/api/yaren/patients/${created.id}/consent`, { method: "POST" }, token);
      navigate(`/documents/${created.encounter.id}`);
    } catch (caught) {
      const message = messageOf(caught);
      if (message.startsWith("Possible existing")) set({ confirmDuplicate: true });
      setError(message);
    }
  }
  return (
    <Page kicker="SCR-FD-002" title={`Register a guest · step ${step} of 3`}>
      <ol className="steps">
        {(["Patient details", "Stay and cover", "Review"] as const).map((label, index) => <li key={label} className={step === index + 1 ? "on" : step > index + 1 ? "done" : ""}><Text value={label} /></li>)}
      </ol>
      <form className="panel" onSubmit={submit}>
        {step === 1 ? <div className="board">
          <div><h2><Text value="Personal information" /></h2><div className="grid">
            <Field label="First name" value={form.givenName} onChange={(givenName) => set({ givenName })} />
            <Field label="Last name" value={form.familyName} onChange={(familyName) => set({ familyName })} />
            <label><Text value="Date of birth" /><input type="date" required value={form.dateOfBirth} onChange={(event) => set({ dateOfBirth: event.target.value })} /></label>
            <Select label="Gender" value={form.sex} onChange={(sex) => set({ sex })} options={["female", "male", "other", "unknown"]} />
            <Field label="Nationality" value={form.nationality} onChange={(nationality) => set({ nationality })} />
            <Field label="Passport / ID" value={form.passportNo} onChange={(passportNo) => set({ passportNo })} />
            <Field label="Mobile" value={form.phone} onChange={(phone) => set({ phone })} />
            <Field label="Email" value={form.email} onChange={(email) => set({ email })} />
            <Field label="Home address" value={form.homeAddress} onChange={(homeAddress) => set({ homeAddress })} />
          </div></div>
          <div><h2><Text value="Stay information" /></h2><div className="grid">
            <label><Text value="Hotel" /><select value={form.hotelId} onChange={(event) => set({ hotelId: event.target.value })}>{boot.hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label>
            <label><Text value="Clinic" /><select value={form.clinicId} onChange={(event) => set({ clinicId: event.target.value })}>{boot.clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}</select></label>
            <Field label="Room" value={form.roomNo} onChange={(roomNo) => set({ roomNo })} />
            <Field label="City" value={form.city} onChange={(city) => set({ city })} />
            <label><Text value="Arrival" /><input type="date" value={form.arrivalDate} onChange={(event) => set({ arrivalDate: event.target.value })} /></label>
            <label><Text value="Departure" /><input type="date" value={form.departureDate} onChange={(event) => set({ departureDate: event.target.value })} /></label>
            <Field label="Tour operator" value={form.tourOperator} onChange={(tourOperator) => set({ tourOperator })} />
            <Select label="Visit" value={form.visitType} onChange={(visitType) => set({ visitType })} options={["walk_in", "room_visit", "emergency", "consultation", "follow_up"]} />
            <label><Text value="Insurer" /><select value={form.insurerName} onChange={(event) => set({ insurerName: event.target.value })}><option value=""><Text value="Uninsured" /></option>{boot.insurers.map((insurer) => <option key={insurer.id}>{insurer.name}</option>)}</select></label>
            <Field label="Policy number" value={form.policyNumber} onChange={(policyNumber) => set({ policyNumber })} />
          </div></div>
        </div> : null}
        {step === 2 ? <div className="grid">
          <h2><Text value="Medical alerts" /></h2>
          <Field label="Allergies" value={form.allergies} onChange={(allergies) => set({ allergies })} />
          <Field label="Chronic conditions" value={form.chronicConditions} onChange={(chronicConditions) => set({ chronicConditions })} />
          <Field label="Regular medications" value={form.regularMedications} onChange={(regularMedications) => set({ regularMedications })} />
          <label>VIP<input type="checkbox" checked={form.vip} onChange={(event) => set({ vip: event.target.checked })} /></label>
        </div> : null}
        {step === 3 ? <div>
          <p>{form.givenName} {form.familyName} · {form.nationality} · room {form.roomNo}</p>
          <p>Allergies: {form.allergies || "None recorded"} · Visit: {form.visitType.replaceAll("_", " ")}</p>
          <p><Text value="Saving also records treatment consent." /></p>
        </div> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="actions">
          {step > 1 ? <button type="button" className="ghost" onClick={() => setStep(step - 1)}><Text value="Back" /></button> : null}
          <button type="submit"><Text value={step < 3 ? "Next" : form.confirmDuplicate ? "Create anyway" : "Review and save"} /></button>
        </div>
      </form>
    </Page>
  );
}

function Search({ token }: { token: string }) {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function run(value: string) {
    try { setRows(await api(`/api/yaren/patients/search?q=${encodeURIComponent(value)}`, {}, token)); setError(null); }
    catch (caught) { setError(messageOf(caught)); }
  }
  useEffect(() => { if (q.trim().length >= 2) void run(q); }, [token]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(q);
  }
  return (
    <Page kicker="SCR-FD-003 · Name, room, passport or phone" title="Find an existing guest">
      <form className="panel" onSubmit={submit}><Field label="Search" value={q} onChange={setQ} /><button type="submit"><Text value="Search" /></button>{error ? <p className="error">{error}</p> : null}</form>
      <div className="table-scroll"><table><thead><tr><th><Text value="Record" /></th><th><Text value="Guest" /></th><th><Text value="Stay" /></th><th><Text value="Mobile" /></th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.medical_record_number}</td><td>{row.given_name} {row.family_name}</td><td>{row.hotel_name} · {row.room_no}</td><td>{row.phone}</td><td><StartVisit token={token} patientId={row.id} hotelId={row.hotel_id} roomNo={row.room_no} /></td></tr>)}</tbody></table></div>
    </Page>
  );
}

function StartVisit({ token, patientId, hotelId, roomNo }: { token: string; patientId: string; hotelId: string; roomNo: string }) {
  const navigate = useNavigate();
  return <button type="button" className="ghost" onClick={async () => {
    const encounter = await api<{ id: string }>("/api/yaren/encounters", { method: "POST", body: JSON.stringify({ patientId, hotelId, clinicId: hotelId === "22222222-2222-4222-8222-222222222222" ? "44444444-4444-4444-8444-444444444444" : "33333333-3333-4333-8333-333333333333", roomNo, visitType: "follow_up" }) }, token);
    navigate(`/encounter/${encounter.id}`);
  }}><Text value="New visit" /></button>;
}

function Queue({ token }: { token: string }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const load = () => api<QueueRow[]>("/api/yaren/queue", {}, token).then(setRows);
  useEffect(() => { void load(); }, [token]);
  return <Page kicker="SCR-FD-004" title="Today's visits"><QueueTable rows={rows} onMove={async (id, status) => { await api(`/api/yaren/encounters/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }, token); await load(); }} /></Page>;
}

function Appointments({ token }: { token: string }) {
  const [rows, setRows] = useState<{ id: string; scheduled_start: string; scheduled_end: string; duration_minutes: number; reason: string; status: string; cancellation_reason: string | null; given_name: string; family_name: string; clinician: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<typeof rows>("/api/yaren/appointments", {}, token).then(setRows).catch((caught: unknown) => setError(messageOf(caught))); }, [token]);
  return (
    <Page kicker="Front desk" title="Appointments">
      {error ? <p className="error">{error}</p> : null}
      <div className="kpis"><Kpi label="Appointments" value={rows.length} /></div>
      <div className="table-scroll"><table><thead><tr><th><Text value="Guest" /></th><th><Text value="Clinician" /></th><th><Text value="When" /></th><th><Text value="Duration" /></th><th><Text value="Reason" /></th><th><Text value="Status" /></th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={6} className="empty"><Text value="No appointments yet" /></td></tr> : rows.map((row) => <tr key={row.id}><td>{row.given_name} {row.family_name}</td><td>{row.clinician}</td><td>{new Date(row.scheduled_start).toLocaleString()} – {new Date(row.scheduled_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td><td>{row.duration_minutes}</td><td>{row.reason}</td><td><span className={`pill ${row.status}`}>{row.status.replaceAll("_", " ")}</span>{row.cancellation_reason ? ` · ${row.cancellation_reason}` : ""}</td></tr>)}</tbody></table></div>
    </Page>
  );
}

function Triage({ token }: { token: string }) {
  return <EncounterForm token={token} kicker="SCR-CLN-001 · Emergency, urgent, or non-urgent" title="Nursing triage" fields={["chiefComplaint", "temperature", "systolic", "diastolic", "pulse", "respiratoryRate", "spo2", "painScore", "notes", "category"]} submitLabel="Save triage and send to doctor" path="triage" payload={(form) => ({ ...numbers(form, ["temperature", "systolic", "diastolic", "pulse", "respiratoryRate", "spo2", "painScore"]), category: form.category || "non_urgent", sendToDoctor: true })} />;
}


function Report({ token, boot }: { token: string; boot: Boot }) {
  const [rows, setRows] = useState<{ id: string; channel: string; recipient: string; created_at: string; encounter_no: string; given_name: string; family_name: string }[]>([]);
  const [encounterId, setEncounterId] = useState("");
  const [channel, setChannel] = useState("patient");
  const [recipient, setRecipient] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const load = () => api<typeof rows>("/api/yaren/distributions", {}, token).then(setRows).catch(() => setRows([]));
  useEffect(() => { void load(); }, [token]);
  const share = (
    <>
      <form className="panel grid" onSubmit={async (event) => { event.preventDefault(); setShareError(null); try { const saved = await api<{ channel: string }>(`/api/yaren/encounters/${encounterId}/report/share`, { method: "POST", body: JSON.stringify({ channel, recipient }) }, token); setNotice(saved.channel); setRecipient(""); await load(); } catch (caught) { setShareError(messageOf(caught)); } }}>
        <Field label="Encounter ID" value={encounterId} onChange={setEncounterId} />
        <label><Text value="Channel" /><select value={channel} onChange={(event) => setChannel(event.target.value)}>{["patient", "hotel", "insurer", "hospital"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <Field label="Recipient" value={recipient} onChange={setRecipient} />
        <button type="submit"><Text value="Share report" /></button>
        {notice ? <p>{notice}</p> : null}
        {shareError ? <p className="error">{shareError}</p> : null}
      </form>
      <div className="table-scroll"><table><thead><tr><th><Text value="Visit" /></th><th><Text value="Guest" /></th><th><Text value="Channel" /></th><th><Text value="Recipient" /></th><th><Text value="When" /></th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={5} className="empty"><Text value="No shared reports" /></td></tr> : rows.map((row) => <tr key={row.id}><td>{row.encounter_no}</td><td>{row.given_name} {row.family_name}</td><td>{row.channel}</td><td>{row.recipient}</td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>
    </>
  );
  return <EncounterForm token={token} kicker="SCR-CLN-007 · Medical report and fit-to-travel" title={boot.settings.tagline ?? "Medical report"} fields={["summary", "findings", "treatment", "followUp", "certificateType", "fitDecision", "restrictions", "airline", "travelDate"]} submitLabel="Sign report" path="report" payload={(form) => ({ ...form, sign: true })} extra={share} />;
}

function Progress({ token }: { token: string }) {
  return <EncounterForm token={token} kicker="SCR-CLN-008" title="Progress note" fields={["note", "followUp", "followUpDue", "sign"]} submitLabel="Add note" path="notes" payload={(form) => ({ note: form.note, followUp: form.followUp, followUpDue: form.followUpDue, sign: form.sign === "yes" })} />;
}

function Record({ token }: { token: string }) {
  const [id, setId] = useState("");
  const [data, setData] = useState<{ patient: Record<string, string>; encounters: Record<string, string>[] } | null>(null);
  return (
    <Page kicker="SCR-CLN-002 · Longitudinal record" title="Patient medical record">
      <form className="panel grid" onSubmit={async (event) => { event.preventDefault(); setData(await api(`/api/yaren/patients/${id}`, {}, token)); }}>
        <Field label="Patient ID" value={id} onChange={setId} /><button type="submit"><Text value="Open record" /></button>
      </form>
      {data ? <div className="doc"><header><Mark /><div><strong>{data.patient.given_name} {data.patient.family_name}</strong><p>{data.patient.medical_record_number} · {data.patient.hotel_name} · Room {data.patient.room_no}</p><p>Allergies: {data.patient.allergies || "None recorded"}</p></div></header><table><thead><tr><th><Text value="Visit" /></th><th><Text value="Type" /></th><th><Text value="Status" /></th></tr></thead><tbody>{data.encounters.map((encounter) => <tr key={encounter.id}><td>{encounter.encounter_no}</td><td>{encounter.visit_type}</td><td><span className={`pill ${encounter.status}`}>{encounter.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div> : null}
    </Page>
  );
}

function Pharmacy({ token }: { token: string }) {
  const [rows, setRows] = useState<{ id: string; rx_no: string; given_name: string; family_name: string; allergies: string | null; status: string; indication: string | null; prescriber: string | null; instructions: string | null; follow_up: string | null; items: { medication_name: string; strength: string | null; dose: string; route: string; frequency: string; duration: string; quantity: number }[] }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [stock, setStock] = useState<{ batch_id: string; medication_id: string; quantity: number }[]>([]);
  const [q, setQ] = useState("");
  const load = (query = q) => Promise.all([api<typeof rows>(`/api/yaren/prescriptions?q=${encodeURIComponent(query)}`, {}, token), api<{ batch_id: string; medication_id: string; quantity: number }[]>("/api/yaren/inventory", {}, token)]).then(([rx, inventory]) => { setRows(rx); setStock(inventory); });
  const current = rows.find((row) => row.id === selected) ?? null;
  useEffect(() => { void load(""); }, [token]);
  return (
    <Page kicker="SCR-PHM-001 · SCR-PHM-002" title="Pharmacy dispensing">
      <form className="panel" onSubmit={(event) => { event.preventDefault(); void load(q); }}><Field label="Search" value={q} onChange={setQ} /><button type="submit"><Text value="Search" /></button></form>
      <div className="kpis"><Kpi label="Prescriptions" value={rows.length} /><Kpi label="Ready to dispense" value={rows.filter((row) => row.status === "signed").length} /></div>
      <table><thead><tr><th><Text value="Prescription" /></th><th><Text value="Guest" /></th><th><Text value="Allergies" /></th><th><Text value="Status" /></th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} onClick={() => setSelected(row.id)}><td>{row.rx_no}</td><td>{row.given_name} {row.family_name}</td><td>{row.allergies || "NKDA"}</td><td><span className={`pill ${row.status}`}>{row.status}</span></td><td>{row.status === "signed" ? <button type="button" className="ghost" onClick={async (event) => { event.stopPropagation();
        const batch = stock.find((item) => item.quantity > 0);
        if (!batch) return;
        await api(`/api/yaren/prescriptions/${row.id}/dispense`, { method: "POST", body: JSON.stringify({ lines: [{ medicationId: batch.medication_id, batchId: batch.batch_id, quantity: 1 }] }) }, token);
        await load();
      }}><Text value="Dispense 1" /></button> : row.status === "dispensed" ? <button type="button" className="ghost" onClick={async () => {
        const batch = stock[0];
        if (!batch) return;
        const reason = window.prompt("Reason for the stock return");
        if (!reason) return;
        await api(`/api/yaren/prescriptions/${row.id}/return`, { method: "POST", body: JSON.stringify({ batchId: batch.batch_id, medicationId: batch.medication_id, quantity: 1, reason }) }, token);
        await load();
      }}><Text value="Return 1" /></button> : null}</td></tr>)}</tbody></table>
      {current ? <><h2>{current.rx_no}</h2><p><Text value="Indication" /> {current.indication || "—"} · <Text value="Prescriber" /> {current.prescriber || "—"} · <Text value="Instructions" /> {current.instructions || "—"} · <Text value="Follow-up" /> {current.follow_up || "—"}</p><div className="table-scroll"><table><thead><tr><th><Text value="Medication" /></th><th><Text value="Strength" /></th><th><Text value="Dose" /></th><th><Text value="Route" /></th><th><Text value="Frequency" /></th><th><Text value="Duration" /></th><th><Text value="Quantity" /></th></tr></thead><tbody>{(current.items ?? []).length === 0 ? <tr><td colSpan={7} className="empty"><Text value="No medications yet" /></td></tr> : current.items.map((item) => <tr key={`${item.medication_name}-${item.dose}`}><td>{item.medication_name}</td><td>{item.strength || "—"}</td><td>{item.dose}</td><td>{item.route}</td><td>{item.frequency}</td><td>{item.duration}</td><td>{item.quantity}</td></tr>)}</tbody></table></div></> : null}
    </Page>
  );
}

function Inventory({ token }: { token: string }) {
  const [rows, setRows] = useState<Record<string, string | number>[]>([]);
  const [location, setLocation] = useState("");
  const [history, setHistory] = useState<{ created_at: string; direction: string; quantity: number; reason: string | null; lot: string | null }[]>([]);
  useEffect(() => { api<Record<string, string | number>[]>(`/api/yaren/inventory${location ? `?location=${encodeURIComponent(location)}` : ""}`, {}, token).then(setRows); }, [token, location]);
  const low = rows.filter((row) => Number(row.quantity) > 0 && Number(row.quantity) < 10).length;
  const expiring = rows.filter((row) => new Date(String(row.expiry_date)).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 90).length;
  return <Page kicker="SCR-INV-001" title="Inventory"><div className="kpis"><Kpi label="Batches" value={rows.length} /><Kpi label="Low stock" value={low} /><Kpi label="Expiring soon" value={expiring} /></div><label><Text value="Location" /><input value={location} placeholder="Main pharmacy" onChange={(event) => setLocation(event.target.value)} /></label><table><thead><tr><th><Text value="Item" /></th><th><Text value="Lot" /></th><th><Text value="Expiry" /></th><th><Text value="Qty" /></th><th><Text value="Location" /></th><th><Text value="Status" /></th><th></th></tr></thead><tbody>{rows.map((row) => { const tone = Number(row.quantity) <= 0 ? "out" : Number(row.quantity) < 10 ? "low" : new Date(String(row.expiry_date)).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 90 ? "expiring" : "ok"; const label = tone === "out" ? "Out of stock" : tone === "low" ? "Low stock" : tone === "expiring" ? "Expiring soon" : "In stock"; return <tr key={String(row.batch_id)}><td>{row.name} {row.strength}</td><td>{row.lot}</td><td>{String(row.expiry_date).slice(0, 10)}</td><td>{row.quantity}</td><td>{row.location}</td><td><span className={`pill ${tone}`}><Text value={label} /></span></td><td><button type="button" className="ghost" onClick={async () => setHistory(await api(`/api/yaren/medications/${row.id}/movements`, {}, token))}><Text value="History" /></button></td></tr>; })}</tbody></table>{history.length ? <table><thead><tr><th><Text value="When" /></th><th><Text value="Movement" /></th><th><Text value="Qty" /></th><th><Text value="Lot" /></th><th><Text value="Reason" /></th></tr></thead><tbody>{history.map((row, index) => <tr key={index}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.direction}</td><td>{row.quantity}</td><td>{row.lot}</td><td>{row.reason}</td></tr>)}</tbody></table> : null}</Page>;
}

function Alerts({ token }: { token: string }) {
  const [rows, setRows] = useState<Record<string, string | number>[]>([]);
  const [requests, setRequests] = useState<{ id: string; name: string; quantity: number; status: string; created_at: string }[]>([]);
  const load = () => Promise.all([
    api<Record<string, string | number>[]>("/api/yaren/stock-alerts", {}, token).then(setRows),
    api<typeof requests>("/api/yaren/replenishment", {}, token).then(setRequests).catch(() => setRequests([])),
  ]);
  useEffect(() => { void load(); }, [token]);
  return <Page kicker="SCR-INV-002" title="Stock and expiry alerts"><div className="kpis"><Kpi label="Alerts" value={rows.length} /><Kpi label="Replenishment" value={requests.length} /></div><div className="table-scroll"><table><thead><tr><th><Text value="Item" /></th><th><Text value="On hand" /></th><th><Text value="Reorder" /></th><th><Text value="Next expiry" /></th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id ?? row.name)}><td>{row.name}</td><td>{row.on_hand}</td><td>{row.reorder_level}</td><td>{row.next_expiry ? String(row.next_expiry).slice(0, 10) : "—"}</td><td><button type="button" className="ghost" onClick={async () => { await api(`/api/yaren/medications/${row.id}/replenish`, { method: "POST", body: JSON.stringify({ quantity: Math.max(1, Number(row.reorder_level) || 1) }) }, token); await load(); }}><Text value="Request replenishment" /></button></td></tr>)}</tbody></table></div><h2><Text value="Replenishment" /></h2><div className="table-scroll"><table><thead><tr><th><Text value="When" /></th><th><Text value="Item" /></th><th><Text value="Quantity" /></th><th><Text value="Status" /></th></tr></thead><tbody>{requests.length === 0 ? <tr><td colSpan={4} className="empty"><Text value="No replenishment requests yet" /></td></tr> : requests.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.name}</td><td>{row.quantity}</td><td><span className={`pill ${row.status}`}>{row.status}</span></td></tr>)}</tbody></table></div></Page>;
}

function Invoices({ token, boot }: { token: string; boot: Boot }) {
  const [encounterId, setEncounterId] = useState("");
  const [rows, setRows] = useState<Record<string, string | number>[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lines, setLines] = useState<{ id: string; description: string; quantity: number | string; unit_price: number; tax_percent: number | string; net: number }[]>([]);
  const service = boot.services[0];
  const load = () => api<Record<string, string | number>[]>("/api/yaren/invoices", {}, token).then(setRows);
  useEffect(() => { void load(); }, [token]);
  useEffect(() => {
    if (!selected) { setLines([]); return; }
    api<{ lines: typeof lines }>(`/api/yaren/invoices/${selected}`, {}, token).then((saved) => setLines(saved.lines ?? [])).catch(() => setLines([]));
  }, [selected, token]);
  return (
    <Page kicker="SCR-BIL-001 · YH-FIN-INV-01" title="Patient invoice">
      <form className="panel" onSubmit={async (event) => {
        event.preventDefault();
        const draft = await api<{ id: string }>(`/api/yaren/encounters/${encounterId}/invoice`, { method: "POST", body: JSON.stringify({ payerType: "self_pay", lines: [{ code: service?.code ?? "99213", description: service?.name ?? "Consultation", category: "service", quantity: 1, unitPrice: Number(service?.unit_price ?? 800), discountPercent: 0, taxPercent: Number(boot.settings.tax_percent ?? 14) }] }) }, token);
        await api(`/api/yaren/invoices/${draft.id}/issue`, { method: "POST" }, token);
        await load();
      }}>
        <Field label="Encounter ID" value={encounterId} onChange={setEncounterId} />
        <button type="submit"><Text value="Create and issue consultation invoice" /></button>
      </form>
      <table><thead><tr><th><Text value="Invoice" /></th><th><Text value="Guest" /></th><th><Text value="Payer" /></th><th><Text value="Amount" /></th><th><Text value="Cover" /></th><th><Text value="Paid" /></th><th><Text value="Outstanding" /></th><th><Text value="Status" /></th><th><Text value="Void reason" /></th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)} onClick={() => setSelected(String(row.id))}><td>{row.invoice_no}</td><td>{row.given_name} {row.family_name}</td><td>{String(row.payer_type || "—").replaceAll("_", " ")}</td><td>{row.currency} {row.patient_payable}</td><td>{row.insurance_cover}</td><td>{row.amount_paid}</td><td>{row.outstanding}</td><td><span className={`pill ${row.status}`}>{String(row.status)}</span></td><td>{row.void_reason || "—"}</td></tr>)}</tbody></table>
      {selected ? <><h2><Text value="Line items" /></h2><div className="table-scroll"><table><thead><tr><th><Text value="Description" /></th><th><Text value="Quantity" /></th><th><Text value="Unit price" /></th><th><Text value="Tax" /></th><th><Text value="Net" /></th></tr></thead><tbody>{lines.length === 0 ? <tr><td colSpan={5} className="empty"><Text value="No lines yet" /></td></tr> : lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{line.unit_price}</td><td>{line.tax_percent}</td><td>{line.net}</td></tr>)}</tbody></table></div></> : null}
      <ModuleSettings token={token} title="Billing" keys={["tax_percent", "tax_reg_no", "commercial_reg"]} note="Replace the placeholder tax and commercial numbers when you have the real registrations." />
    </Page>
  );
}

function Payments({ token }: { token: string }) {
  const [rows, setRows] = useState<Record<string, string | number>[]>([]);
  const [receipts, setReceipts] = useState<Record<string, string | number>[]>([]);
  const [refunds, setRefunds] = useState<{ id: string; amount: number; reason: string; created_at: string; invoice_no: string; display_name: string | null }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const load = () => {
    api<Record<string, string | number>[]>("/api/yaren/invoices", {}, token).then(setRows);
    api<Record<string, string | number>[]>("/api/yaren/payments", {}, token).then(setReceipts);
    api<typeof refunds>("/api/yaren/refunds", {}, token).then(setRefunds).catch(() => setRefunds([]));
  };
  useEffect(() => { void load(); }, [token]);
  return <Page kicker="SCR-BIL-002" title="Payment and settlement">{notice ? <p>{notice}</p> : null}<div className="table-scroll"><table><thead><tr><th><Text value="Invoice" /></th><th><Text value="Due" /></th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)}><td>{row.invoice_no}</td><td>{row.outstanding}</td><td className="actions">{Number(row.outstanding) > 0 ? <button type="button" className="ghost" onClick={async () => { await api(`/api/yaren/invoices/${row.id}/payments`, { method: "POST", body: JSON.stringify({ method: "cash", amount: Number(row.outstanding) }) }, token); await load(); }}><Text value="Collect balance" /></button> : null}{Number(row.amount_paid) > 0 ? <button type="button" className="ghost" onClick={async () => { const amount = Number(window.prompt("Refund amount") || 0); if (!amount) return; await api(`/api/yaren/invoices/${row.id}/refunds`, { method: "POST", body: JSON.stringify({ amount, reason: "Guest refund" }) }, token); await load(); }}><Text value="Refund" /></button> : null}{row.status !== "void" && Number(row.amount_paid) === 0 ? <button type="button" className="ghost" onClick={async () => { await api(`/api/yaren/invoices/${row.id}/void`, { method: "POST", body: JSON.stringify({ reason: "Issued in error" }) }, token); await load(); }}><Text value="Void" /></button> : null}</td></tr>)}</tbody></table></div><h2><Text value="Receipt" /></h2><div className="table-scroll"><table><thead><tr><th><Text value="Invoice" /></th><th><Text value="Reference" /></th><th><Text value="Payer" /></th><th><Text value="Amount" /></th><th><Text value="Method" /></th><th><Text value="Collected by" /></th><th><Text value="When" /></th><th></th></tr></thead><tbody>{receipts.map((row) => <tr key={String(row.id)}><td>{row.invoice_no}</td><td>{row.reference}</td><td>{row.payer}</td><td>{row.amount}</td><td>{row.method}</td><td>{row.cashier || "—"}</td><td>{row.paid_at ? new Date(String(row.paid_at)).toLocaleString() : "—"}</td><td><button type="button" className="ghost" onClick={async () => { const saved = await api<{ reference: string; payer: string; invoice_no: string; amount: number }>(`/api/yaren/payments/${row.id}/receipt`, {}, token); setNotice(`${saved.invoice_no} · ${saved.reference} · ${saved.payer} · ${saved.amount}`); }}><Text value="Receipt" /></button></td></tr>)}</tbody></table></div><h2><Text value="Refunds" /></h2><div className="table-scroll"><table><thead><tr><th><Text value="When" /></th><th><Text value="Invoice" /></th><th><Text value="Amount" /></th><th><Text value="Reason" /></th><th><Text value="User" /></th></tr></thead><tbody>{refunds.length === 0 ? <tr><td colSpan={5} className="empty"><Text value="No refunds yet" /></td></tr> : refunds.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.invoice_no}</td><td>{row.amount}</td><td>{row.reason}</td><td>{row.display_name || "—"}</td></tr>)}</tbody></table></div></Page>;
}

function Coverage({ token, boot }: { token: string; boot: Boot }) {
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [policyNumber, setPolicyNumber] = useState("");
  const [insurer, setInsurer] = useState(boot.insurers[0]?.name ?? "");
  const [rows, setRows] = useState<{ id: string; insurer: string; status: string; tpa: string | null; deductible: string | null; coinsurance: string | null; verification_method: string | null; verification_reference: string | null; verified_at: string | null; given_name: string; family_name: string; verified_by: string | null }[]>([]);
  const load = () => api<typeof rows>("/api/yaren/coverage", {}, token).then(setRows).catch(() => setRows([]));
  useEffect(() => { void load(); }, [token]);
  return <Page kicker="SCR-INS-002" title="Coverage verification"><div className="kpis"><Kpi label="Coverage checks" value={rows.length} /><Kpi label="Verified" value={rows.filter((row) => row.status === "verified").length} /></div><form className="panel grid" onSubmit={async (event) => { event.preventDefault(); const saved = await api<{ status: string; method: string; reference: string }>("/api/yaren/coverage/verify", { method: "POST", body: JSON.stringify({ patientId, encounterId: encounterId || undefined, insurer, policyNumber }) }, token); setMessage(`${saved.status} · ${saved.method} · ${saved.reference}`); await load(); }}><Field label="Patient ID" value={patientId} onChange={setPatientId} /><Field label="Encounter ID" value={encounterId} onChange={setEncounterId} /><label><Text value="Insurer" /><select value={insurer} onChange={(event) => setInsurer(event.target.value)}>{boot.insurers.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><Field label="Policy number" value={policyNumber} onChange={setPolicyNumber} /><button type="submit"><Text value="Verify coverage" /></button>{message ? <p>{message}</p> : null}</form><div className="table-scroll"><table><thead><tr><th><Text value="Guest" /></th><th><Text value="Insurer" /></th><th><Text value="TPA" /></th><th><Text value="Deductible" /></th><th><Text value="Coinsurance" /></th><th><Text value="Status" /></th><th><Text value="Method" /></th><th><Text value="Reference" /></th><th><Text value="Verified by" /></th><th><Text value="When" /></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.given_name} {row.family_name}</td><td>{row.insurer}</td><td>{row.tpa || "—"}</td><td>{row.deductible || "—"}</td><td>{row.coinsurance || "—"}</td><td><span className={`pill ${row.status}`}>{row.status.replaceAll("_", " ")}</span></td><td>{row.verification_method || "—"}</td><td>{row.verification_reference || "—"}</td><td>{row.verified_by || "—"}</td><td>{row.verified_at ? new Date(row.verified_at).toLocaleString() : "—"}</td></tr>)}</tbody></table></div><p className="muted"><Text value="Ruleset verification checks the policy against the active insurer list. A live adapter runs only after its approved address is saved in settings." /></p><ModuleSettings token={token} title="Insurance" keys={["insurer_mode", "insurer_adapter_url", "insurer_adapter_host", "insurer_api_notes", "insurer_client_id", "insurer_client_secret"]} note="Leave the adapter blank until the insurer gives you an address and credentials. Ruleset stays the working mode." /></Page>;
}

function Claims({ token }: { token: string }) {
  const [encounterId, setEncounterId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [rows, setRows] = useState<Record<string, string | number>[]>([]);
  const [ready, setReady] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pack, setPack] = useState<{ created_at: string; snapshot: { version?: string; channel?: string; submittedAt?: string; invoiceNo?: string; diagnosis?: string; icd10?: string } }[]>([]);
  const [events, setEvents] = useState<{ id: string; from_status: string | null; to_status: string; created_at: string; display_name: string | null }[]>([]);
  const [runs, setRuns] = useState<{ id: string; ready: boolean; ruleset: string; created_at: string; failed: string[]; overrideReason: string | null; display_name: string | null }[]>([]);
  const [revision, setRevision] = useState(0);
  const load = () => api<Record<string, string | number>[]>("/api/yaren/claims", {}, token).then((next) => { setRows(next); setRevision((value) => value + 1); });
  const current = rows.find((row) => String(row.id) === selected) ?? rows[0];
  const claimId = current ? String(current.id) : "";
  useEffect(() => { void load(); }, [token]);
  useEffect(() => {
    if (!claimId) { setPack([]); setEvents([]); setRuns([]); return; }
    api<{ versions: typeof pack }>(`/api/yaren/claims/${claimId}/submission`, {}, token).then((saved) => setPack(saved.versions ?? [])).catch(() => setPack([]));
    api<typeof events>(`/api/yaren/claims/${claimId}/events`, {}, token).then(setEvents).catch(() => setEvents([]));
    api<typeof runs>(`/api/yaren/claims/${claimId}/readiness-runs`, {}, token).then(setRuns).catch(() => setRuns([]));
  }, [token, claimId, revision]);
  return (
    <Page kicker="UI-06 · SCR-INS-001 to SCR-INS-005" title="Insurance claims">
      <div className="kpis">{["draft", "ready", "submitted", "approved", "paid"].map((status) => <Kpi key={status} label={status} value={rows.filter((row) => row.status === status).length} />)}</div>
      <form className="panel" onSubmit={async (event) => { event.preventDefault(); await api("/api/yaren/claims", { method: "POST", body: JSON.stringify({ encounterId, invoiceId, claimType: "outpatient" }) }, token); await load(); }}>
        <Field label="Encounter ID" value={encounterId} onChange={setEncounterId} />
        <Field label="Invoice ID" value={invoiceId} onChange={setInvoiceId} />
        <button type="submit"><Text value="Create claim" /></button>
      </form>
      {ready ? <p>{ready}</p> : null}
      <div className="board">
        <div className="table-scroll"><table><thead><tr><th><Text value="Claim" /></th><th><Text value="Guest" /></th><th><Text value="Claimed" /></th><th><Text value="Approved amount" /></th><th><Text value="Paid" /></th><th><Text value="Outstanding" /></th><th><Text value="Status" /></th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)} onClick={() => setSelected(String(row.id))}><td>{row.claim_no}</td><td>{row.given_name} {row.family_name}</td><td>{row.claimed}</td><td>{row.approved_amount}</td><td>{row.paid}</td><td>{row.outstanding}</td><td><span className={`pill ${row.status}`}>{row.status}</span></td></tr>)}</tbody></table></div>
        <aside className="panel">{current ? <><h2><Text value="Claim details" /></h2><p><strong>{current.claim_no}</strong> · {current.given_name} {current.family_name}</p><p><Text value="Claimed" /> {current.claimed}</p><p><Text value="Approved amount" /> {current.approved_amount}</p><p><Text value="Paid" /> {current.paid}</p><p><Text value="Outstanding" /> {current.outstanding}</p><p><span className={`pill ${current.status}`}>{current.status}</span></p><h2><Text value="Submission" /></h2><div className="table-scroll"><table><thead><tr><th><Text value="Version" /></th><th><Text value="Channel" /></th><th><Text value="Submitted" /></th><th><Text value="Invoice" /></th><th><Text value="Diagnosis" /></th><th><Text value="ICD-10" /></th></tr></thead><tbody>{pack.length === 0 ? <tr><td colSpan={6} className="empty"><Text value="No submission yet" /></td></tr> : pack.map((row) => <tr key={row.created_at}><td>{row.snapshot.version || "—"}</td><td>{row.snapshot.channel || "—"}</td><td>{row.snapshot.submittedAt ? new Date(row.snapshot.submittedAt).toLocaleString() : new Date(row.created_at).toLocaleString()}</td><td>{row.snapshot.invoiceNo || "—"}</td><td>{row.snapshot.diagnosis || "—"}</td><td>{row.snapshot.icd10 || "—"}</td></tr>)}</tbody></table></div><h2><Text value="Status history" /></h2><div className="table-scroll"><table><thead><tr><th><Text value="When" /></th><th><Text value="User" /></th><th><Text value="From status" /></th><th><Text value="To status" /></th></tr></thead><tbody>{events.length === 0 ? <tr><td colSpan={4} className="empty"><Text value="No status changes yet" /></td></tr> : events.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString()}</td><td>{event.display_name || "—"}</td><td>{event.from_status || "—"}</td><td>{event.to_status}</td></tr>)}</tbody></table></div><h2><Text value="Readiness record" /></h2><div className="table-scroll"><table><thead><tr><th><Text value="When" /></th><th><Text value="Ruleset" /></th><th><Text value="Result" /></th><th><Text value="Failed checks" /></th><th><Text value="Override reason" /></th><th><Text value="User" /></th></tr></thead><tbody>{runs.length === 0 ? <tr><td colSpan={6} className="empty"><Text value="No readiness record yet" /></td></tr> : runs.map((run) => <tr key={run.id}><td>{new Date(run.created_at).toLocaleString()}</td><td>{run.ruleset}</td><td><Text value={run.ready ? "Ready" : "Missing"} /></td><td>{run.failed.join(", ") || "—"}</td><td>{run.overrideReason || "—"}</td><td>{run.display_name || "—"}</td></tr>)}</tbody></table></div><div className="actions"><button type="button" className="ghost" onClick={async () => { const result = await api<{ ready: boolean; checks: { label: string; ok: boolean }[] }>(`/api/yaren/claims/${current.id}/readiness`, {}, token); setReady(result.checks.map((check) => `${check.ok ? "Ready" : "Missing"}: ${check.label}`).join(" · ")); }}><Text value="Readiness" /></button><button type="button" className="ghost" onClick={async () => { await api(`/api/yaren/claims/${current.id}/status`, { method: "POST", body: JSON.stringify({ status: "ready" }) }, token); await load(); }}><Text value="Mark ready" /></button><button type="button" className="ghost" onClick={async () => { const reason = window.prompt("Reason for the readiness override"); if (!reason) return; await api(`/api/yaren/claims/${current.id}/override`, { method: "POST", body: JSON.stringify({ reason }) }, token); await load(); }}><Text value="Override" /></button>{current.status === "ready" || current.status === "rejected" ? <button type="button" className="ghost" onClick={async () => { const saved = await api<{ submission: { version: string } | null }>(`/api/yaren/claims/${current.id}/status`, { method: "POST", body: JSON.stringify({ status: "submitted", channel: "portal" }) }, token); setReady(saved.submission ? `${saved.submission.version}` : null); await load(); }}><Text value="Submit claim" /></button> : null}<button type="button" className="ghost" onClick={async () => { const saved = await api<{ csv: string }>("/api/yaren/claims/export", {}, token); const blob = new Blob([saved.csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "claims.csv"; link.click(); URL.revokeObjectURL(url); }}><Text value="Export" /></button></div></> : <p className="muted"><Text value="No claims yet" /></p>}</aside>
      </div>
    </Page>
  );
}

function Referrals({ token }: { token: string }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const load = () => api<Record<string, string>[]>("/api/yaren/referrals", {}, token).then(setRows).catch(() => setRows([]));
  useEffect(() => { void load(); }, [token]);
  return <EncounterForm token={token} kicker="SCR-REF-001 · YH-CLN-FRM-006" title="Referral letter" fields={["reason", "facility", "department", "referralType", "transport"]} submitLabel="Create referral" path="../referrals" absolute="/api/yaren/referrals" onSaved={() => void load()} payload={(form) => ({ encounterId: form.encounterId, reason: form.reason, facility: form.facility, department: form.department, referralType: form.referralType || "hospital", transport: form.transport, priority: "urgent" })} extra={<><div className="kpis"><Kpi label="Referrals" value={rows.length} /></div><div className="table-scroll"><table><thead><tr><th><Text value="Referral" /></th><th><Text value="Guest" /></th><th><Text value="Facility" /></th><th><Text value="Department" /></th><th><Text value="Type" /></th><th><Text value="Transport" /></th><th><Text value="Reason" /></th><th><Text value="Priority" /></th><th><Text value="Status" /></th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={9} className="empty"><Text value="No referrals yet" /></td></tr> : rows.map((row) => <tr key={row.id}><td>{row.referral_no}</td><td>{row.given_name} {row.family_name}</td><td>{row.facility}</td><td>{row.department || "—"}</td><td>{row.referral_type || "—"}</td><td>{row.transport || "—"}</td><td>{row.reason || "—"}</td><td>{row.priority}</td><td><span className={`pill ${row.status}`}>{row.status}</span></td></tr>)}</tbody></table></div></>} />;
}

function Ambulance({ token }: { token: string }) {
  return <AmbulanceScreen token={token} />;
}

type TransferHandover = {
  gcs?: string;
  oxygen?: string;
  monitor?: string;
  isolation?: string;
  closureNotes?: string;
  ambulanceCrew?: string;
  receivingClinician?: string;
  referringClinician?: string;
  receivingDepartment?: string;
  checklist?: Record<string, boolean>;
  treatment?: { time?: string; item?: string; dose?: string; by?: string; response?: string }[];
  observations?: { time?: string; event?: string; temp?: string; bp?: string; pulse?: string; spo2?: string; notes?: string }[];
};

function Transfers({ token }: { token: string }) {
  const [rows, setRows] = useState<{ id: string; transfer_no: string; given_name: string; family_name: string; room_no: string | null; destination: string; priority: string; status: string; reason: string | null; snapshot: string | null; destination_arrival_at: string | null; handover: TransferHandover | null }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const load = () => api<typeof rows>("/api/yaren/transfers", {}, token).then(setRows);
  useEffect(() => { void load(); }, [token]);
  const current = rows.find((row) => row.id === selected) ?? null;
  const handover = current?.handover;
  const checklist = Object.entries(handover?.checklist ?? {});
  return (
    <Page kicker="SCR-REF-003 · Requested to closed handover" title="Transfer tracking">
      <div className="table-scroll"><table><thead><tr><th><Text value="Transfer" /></th><th><Text value="Guest" /></th><th><Text value="Room" /></th><th><Text value="Destination" /></th><th><Text value="Priority" /></th><th><Text value="Reason" /></th><th><Text value="Arrived" /></th><th><Text value="Status" /></th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} onClick={() => setSelected(row.id)}><td>{row.transfer_no}</td><td>{row.given_name} {row.family_name}</td><td>{row.room_no || "—"}</td><td>{row.destination}</td><td>{row.priority}</td><td>{row.reason || "—"}</td><td>{row.destination_arrival_at ? new Date(row.destination_arrival_at).toLocaleString() : "—"}</td><td><span className={`pill ${row.status}`}>{row.status.replaceAll("_", " ")}</span></td><td><button type="button" className="ghost" onClick={async (event) => { event.stopPropagation(); await api(`/api/yaren/transfers/${row.id}/advance`, { method: "POST" }, token); await load(); }}><Text value="Advance" /></button></td></tr>)}</tbody></table></div>
      {current ? <div className="panel">
        <h2>{current.transfer_no}</h2>
        <p>{current.snapshot || "—"}</p>
        {handover ? <>
          <p><Text value="Referring clinician" /> {handover.referringClinician || "—"} · <Text value="Receiving department" /> {handover.receivingDepartment || "—"} · <Text value="Receiving clinician" /> {handover.receivingClinician || "—"}</p>
          <p><Text value="Ambulance crew" /> {handover.ambulanceCrew || "—"} · <Text value="Oxygen" /> {handover.oxygen || "—"} · <Text value="Monitor" /> {handover.monitor || "—"} · GCS {handover.gcs || "—"} · <Text value="Isolation" /> {handover.isolation || "—"}</p>
          {handover.closureNotes ? <p><Text value="Closure notes" /> {handover.closureNotes}</p> : null}
          {checklist.length ? <div className="table-scroll"><table><thead><tr><th><Text value="Checklist" /></th><th><Text value="Status" /></th></tr></thead><tbody>{checklist.map(([label, done]) => <tr key={label}><td><Text value={label} /></td><td>{done ? "Yes" : "No"}</td></tr>)}</tbody></table></div> : null}
          {(handover.treatment ?? []).length ? <div className="table-scroll"><table><thead><tr><th><Text value="Treatment" /></th><th><Text value="When" /></th><th><Text value="Dose" /></th><th><Text value="By" /></th><th><Text value="Response" /></th></tr></thead><tbody>{handover.treatment?.map((line) => <tr key={`${line.item}-${line.time}`}><td>{line.item}</td><td>{line.time}</td><td>{line.dose}</td><td>{line.by}</td><td>{line.response}</td></tr>)}</tbody></table></div> : null}
          {(handover.observations ?? []).length ? <div className="table-scroll"><table><thead><tr><th><Text value="Observations" /></th><th><Text value="When" /></th><th><Text value="Temp" /></th><th>BP</th><th><Text value="Pulse" /></th><th>SpO₂</th><th><Text value="Notes" /></th></tr></thead><tbody>{handover.observations?.map((line) => <tr key={`${line.event}-${line.time}`}><td>{line.event}</td><td>{line.time}</td><td>{line.temp}</td><td>{line.bp}</td><td>{line.pulse}</td><td>{line.spo2}</td><td>{line.notes}</td></tr>)}</tbody></table></div> : null}
        </> : <p className="muted"><Text value="Nothing recorded yet" /></p>}
      </div> : null}
    </Page>
  );
}

function Hotels({ boot, token }: { boot: Boot; token: string }) {
  const [requests, setRequests] = useState<Record<string, string>[]>([]);
  useEffect(() => { api<Record<string, string>[]>("/api/yaren/requests", {}, token).then(setRequests).catch(() => setRequests([])); }, [token]);
  return <Page kicker="UI-15 · SCR-CRM-001" title="Hotel partner 360"><CityMap hotels={boot.hotels} /><div className="hotel-grid">{boot.hotels.map((hotel) => {
    const mine = requests.filter((row) => row.hotel_id === hotel.id);
    const open = mine.filter((row) => row.status !== "completed").length;
    return <article className="card" key={hotel.id}><span>{hotel.city}</span><strong style={{ fontSize: 22 }}>{hotel.name}</strong><p>{hotel.phone || "—"}</p><p>{boot.clinics.filter((clinic) => clinic.hotel_id === hotel.id).map((clinic) => clinic.name).join(", ") || "—"}</p><p>{hotel.contract_notes || "—"}</p>    <p><Text value="Open requests" /> {open} · <Text value="Completed" /> {mine.length - open}</p></article>;
  })}</div></Page>;
}

function Requests({ token, boot }: { token: string; boot: Boot }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [guestName, setGuestName] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [patientId, setPatientId] = useState("");
  const [history, setHistory] = useState<{ requestNo: string; events: { action: string; created_at: string; detail: unknown }[] } | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const nurse = boot.staff.find((user) => user.role === "nurse");
  const load = () => api<Record<string, string>[]>("/api/yaren/requests", {}, token).then(setRows);
  useEffect(() => { void load(); }, [token]);
  return (
    <Page kicker="SCR-CRM-002 · SCR-CRM-003" title="Hotel and room requests">
      <form className="panel grid" onSubmit={async (event) => { event.preventDefault(); await api("/api/yaren/requests", { method: "POST", body: JSON.stringify({ hotelId: boot.hotels[0]?.id, guestName, roomNo, requestType: "doctor_to_room", priority: "urgent", patientId: patientId || undefined }) }, token); await load(); }}>
        <Field label="Guest" value={guestName} onChange={setGuestName} /><Field label="Room" value={roomNo} onChange={setRoomNo} /><Field label="Patient ID" value={patientId} onChange={setPatientId} /><button type="submit"><Text value="Request doctor to room" /></button>
      </form>
      {visitId ? <p><Link to={`/encounter/${visitId}`}><Text value="Start visit" /></Link></p> : null}
      {history ? <><h2>{history.requestNo}</h2><div className="table-scroll"><table><thead><tr><th><Text value="When" /></th><th><Text value="Action" /></th><th><Text value="Detail" /></th></tr></thead><tbody>{history.events.length === 0 ? <tr><td colSpan={3} className="empty"><Text value="No history yet" /></td></tr> : history.events.map((event) => <tr key={`${event.action}-${event.created_at}`}><td>{new Date(event.created_at).toLocaleString()}</td><td>{event.action}</td><td>{detailText(event.detail)}</td></tr>)}</tbody></table></div></> : null}
      <div className="table-scroll"><table><thead><tr><th><Text value="Request" /></th><th><Text value="Hotel" /></th><th><Text value="Guest" /></th><th><Text value="Assigned" /></th><th><Text value="Status" /></th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.request_no}</td><td>{row.hotel_name}</td><td>{row.guest_name} · {row.room_no}</td><td>{row.assigned_name || "—"}</td><td><span className={`pill ${row.status}`}>{row.status.replaceAll("_", " ")}</span></td><td className="actions">{nurse ? <button type="button" className="ghost" onClick={async () => { await api(`/api/yaren/requests/${row.id}/status`, { method: "POST", body: JSON.stringify({ status: "assigned", assignedTo: nurse.id }) }, token); await load(); }}><Text value="Assign" /></button> : null}<button type="button" className="ghost" onClick={async () => { const linked = await api<{ encounterId: string }>(`/api/yaren/requests/${row.id}/visit`, { method: "POST", body: JSON.stringify({ patientId: patientId || undefined }) }, token); setVisitId(linked.encounterId); await load(); }}><Text value="Start visit" /></button><button type="button" className="ghost" onClick={async () => { const events = await api<{ action: string; created_at: string; detail: unknown }[]>(`/api/yaren/requests/${row.id}/history`, {}, token); setHistory({ requestNo: row.request_no, events }); }}><Text value="History" /></button><button type="button" className="ghost" onClick={async () => { await api(`/api/yaren/requests/${row.id}/status`, { method: "POST", body: JSON.stringify({ status: "completed" }) }, token); await load(); }}><Text value="Complete" /></button></td></tr>)}</tbody></table></div>
    </Page>
  );
}

function Partner({ token, boot }: { token: string; boot: Boot }) {
  const [hotelId, setHotelId] = useState(boot.hotels[0]?.id ?? "");
  const [data, setData] = useState<{ hotel: { name: string }; summary: { cases: number; completed: number; avg_seconds: number }; note: string; requests: Record<string, string>[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!hotelId) return;
    setError(null);
    api<NonNullable<typeof data>>(`/api/yaren/partner?hotelId=${hotelId}`, {}, token).then(setData).catch((caught: unknown) => setError(messageOf(caught)));
  }, [token, hotelId]);
  const minutes = Math.round((data?.summary.avg_seconds ?? 0) / 60);
  return (
    <Page kicker="SCR-CRM-004 · Property-scoped, no clinical record" title="Hotel partner portal">
      <label><Text value="Hotel" /><select value={hotelId} onChange={(event) => setHotelId(event.target.value)}>{boot.hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label>
      {error ? <p className="error">{error}</p> : null}
      {data ? <>
        <div className="kpis"><Kpi label={data.hotel?.name ?? "Hotel"} value={data.summary?.cases ?? 0} /><Kpi label="Completed" value={data.summary?.completed ?? 0} /><Kpi label="Average minutes" value={minutes} /></div>
        <p>{data.note}</p>
        <div className="table-scroll"><table><thead><tr><th><Text value="Request" /></th><th><Text value="Guest" /></th><th><Text value="Room" /></th><th><Text value="Request type" /></th><th><Text value="Priority" /></th><th><Text value="Status" /></th><th><Text value="When" /></th></tr></thead><tbody>{data.requests.length === 0 ? <tr><td colSpan={7} className="empty"><Text value="No requests yet" /></td></tr> : data.requests.map((row) => <tr key={row.request_no}><td>{row.request_no}</td><td>{row.guest_name}</td><td>{row.room_no}</td><td>{row.request_type.replaceAll("_", " ")}</td><td>{row.priority}</td><td><span className={`pill ${row.status}`}>{row.status.replaceAll("_", " ")}</span></td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>
      </> : null}
    </Page>
  );
}

function Feedback({ token, boot }: { token: string; boot: Boot }) {
  const [nps, setNps] = useState(9);
  const [comment, setComment] = useState("");
  const [rows, setRows] = useState<Record<string, string | number>[]>([]);
  const load = () => api<Record<string, string | number>[]>("/api/yaren/feedback", {}, token).then(setRows);
  useEffect(() => { void load(); }, [token]);
  const [heardFrom, setHeardFrom] = useState("hotel desk");
  const [improve, setImprove] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [publish, setPublish] = useState(false);
  const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + Number(row.nps), 0) / rows.length) : 0;
  return <Page kicker="SCR-QLT-001 · MED-04" title="Patient satisfaction"><div className="kpis"><Kpi label="Responses" value={rows.length} /><Kpi label="Average score" value={average} /></div><form className="panel grid" onSubmit={async (event) => { event.preventDefault(); await api("/api/yaren/feedback", { method: "POST", body: JSON.stringify({ nps, comment, improve, heardFrom, anonymous, hotelId: boot.hotels[0]?.id, source: "reception", publishConsent: publish }) }, token); await load(); }}><label><Text value="Recommend score 1–10" /><input type="number" min={1} max={10} value={nps} onChange={(event) => setNps(Number(event.target.value))} /></label><Field label="How can we improve?" value={improve} onChange={setImprove} /><Field label="How did you hear about us?" value={heardFrom} onChange={setHeardFrom} /><Field label="Comment" value={comment} onChange={setComment} /><label><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /> <Text value="Anonymous" /></label><label><input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} /> <Text value="Consent to publish" /></label><button type="submit"><Text value="Save feedback" /></button></form><div className="table-scroll"><table><thead><tr><th><Text value="Score" /></th><th><Text value="How can we improve?" /></th><th><Text value="How did you hear about us?" /></th><th><Text value="Comment" /></th><th><Text value="Consent to publish" /></th><th><Text value="Hotel" /></th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)}><td>{row.nps}</td><td>{row.improve || "—"}</td><td>{row.heard_from || "—"}</td><td>{row.anonymous ? "—" : row.comment}</td><td>{row.publish_consent ? "Yes" : "No"}</td><td>{row.hotel_name}</td></tr>)}</tbody></table></div><ModuleSettings token={token} title="Quality" keys={["survey_template", "low_nps_threshold"]} note="The survey template and the low-score threshold are edited here." /></Page>;
}

function Incidents({ token }: { token: string }) {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("moderate");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<{ id: string; severity: string; category: string; description: string; root_cause: string | null; action: string | null; evidence: string | null; status: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rootCause, setRootCause] = useState("");
  const [action, setAction] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = () => api<typeof rows>("/api/yaren/incidents", {}, token).then(setRows);
  useEffect(() => { void load(); }, [token]);
  const current = rows.find((row) => row.id === selected) ?? null;
  async function move(status: "investigating" | "closed" | "open") {
    if (!current) return;
    setError(null);
    try {
      await api(`/api/yaren/incidents/${current.id}/status`, { method: "POST", body: JSON.stringify({ status, rootCause: rootCause || undefined, action: action || undefined, evidence: evidence || undefined }) }, token);
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    }
  }
  return (
    <Page kicker="SCR-QLT-002" title="Incidents and complaints">
      <div className="kpis">
        <Kpi label="Open" value={rows.filter((row) => row.status === "open").length} />
        <Kpi label="Investigating" value={rows.filter((row) => row.status === "investigating").length} />
        <Kpi label="Closed" value={rows.filter((row) => row.status === "closed").length} />
      </div>
      <form className="panel grid" onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await api("/api/yaren/incidents", { method: "POST", body: JSON.stringify({ severity, category, description }) }, token);
          setDescription("");
          setCategory("");
          await load();
        } catch (caught) {
          setError(messageOf(caught));
        }
      }}>
        <label><Text value="Severity" /><select value={severity} onChange={(event) => setSeverity(event.target.value)}>{["low", "moderate", "high", "critical"].map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
        <Field label="Category" value={category} onChange={setCategory} />
        <Field label="What happened" value={description} onChange={setDescription} />
        <button type="submit"><Text value="Open incident" /></button>
        {error && !current ? <p className="error">{error}</p> : null}
      </form>
      <div className="board">
        <div className="table-scroll">
          <table>
            <thead><tr><th><Text value="Severity" /></th><th><Text value="Category" /></th><th><Text value="What happened" /></th><th><Text value="Status" /></th></tr></thead>
            <tbody>{rows.length === 0 ? <tr><td colSpan={4} className="empty"><Text value="No incidents yet" /></td></tr> : rows.map((row) => <tr key={row.id} onClick={() => { setSelected(row.id); setRootCause(row.root_cause ?? ""); setAction(row.action ?? ""); setEvidence(row.evidence ?? ""); setError(null); }}><td>{row.severity}</td><td>{row.category}</td><td>{row.description}</td><td><span className={`pill ${row.status}`}>{row.status}</span></td></tr>)}</tbody>
          </table>
        </div>
        <aside className="panel">
          {current ? <>
            <h2><Text value="Follow-up" /></h2>
            <p><span className={`pill ${current.status}`}>{current.status}</span> · {current.severity} · {current.category}</p>
            <p>{current.description}</p>
            <Field label="Root cause" value={rootCause} onChange={setRootCause} />
            <Field label="Action taken" value={action} onChange={setAction} />
            <Field label="CAPA evidence" value={evidence} onChange={setEvidence} />
            {error ? <p className="error">{error}</p> : null}
            <div className="actions">
              {current.status === "open" ? <button type="button" className="ghost" onClick={() => void move("investigating")}><Text value="Investigate" /></button> : null}
              {current.status !== "closed" ? <button type="button" className="ghost" onClick={() => void move("closed")}><Text value="Close" /></button> : <button type="button" className="ghost" onClick={() => void move("open")}><Text value="Reopen" /></button>}
            </div>
          </> : <p className="muted"><Text value="Select an incident" /></p>}
        </aside>
      </div>
    </Page>
  );
}

function Operations({ token, boot }: { token: string; boot: Boot }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [hotelId, setHotelId] = useState("");
  const [data, setData] = useState<{ volume: { encounters: number; room_visits: number; closed: number }; referrals: { referrals: number }; days?: { day: string; encounters: number }[] } | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [transfers, setTransfers] = useState<Record<string, string>[]>([]);
  const filter = `from=${from}&to=${to}${hotelId ? `&hotelId=${hotelId}` : ""}`;
  useEffect(() => {
    api<NonNullable<typeof data>>(`/api/yaren/reports/operations?${filter}`, {}, token).then(setData);
    api<QueueRow[]>("/api/yaren/queue", {}, token).then(setQueue);
    api<Record<string, string>[]>("/api/yaren/transfers", {}, token).then(setTransfers);
  }, [token, filter]);
  const openTransfers = transfers.filter((row) => row.status !== "closed").length;
  return (
    <Page kicker="UI-11 · SCR-RPT-001" title="Operations">
      <div className="grid"><label><Text value="From" /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label><Text value="To" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label><Text value="Hotel" /><select value={hotelId} onChange={(event) => setHotelId(event.target.value)}><option value=""><Text value="All hotels" /></option>{boot.hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label><button type="button" className="ghost" onClick={async () => { const saved = await api<{ csv: string }>(`/api/yaren/reports/operations/export?${filter}`, {}, token); const blob = new Blob([saved.csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "operations.csv"; link.click(); URL.revokeObjectURL(url); }}><Text value="Export" /></button></div>
      <div className="kpis"><Kpi label="Encounters today" value={data?.volume.encounters ?? 0} /><Kpi label="Active cases" value={queue.length} /><Kpi label="Room visits" value={data?.volume.room_visits ?? 0} /><Kpi label="Closed" value={data?.volume.closed ?? 0} /><Kpi label="Open transfers" value={openTransfers} /></div>
      <h2><Text value="Visits by day" /></h2>
      <DayBars days={data?.days ?? []} />
      <h2><Text value="Guest journey" /></h2>
      <div className="journey">{["Reception", "Triage", "Doctor", "Treatment", "Insurance / Payment", "Follow-up"].map((step) => <span key={step}><Text value={step} /></span>)}</div>
      <h2><Text value="Current queue" /></h2>
      <QueueTable rows={queue.slice(0, 8)} />
      <h2><Text value="Referrals and transport" /></h2>
      <p><Text value="Referrals" /> {data?.referrals.referrals ?? 0} · <Text value="Open transfers" /> {openTransfers}</p>
    </Page>
  );
}

function Monthly({ token, boot }: { token: string; boot: Boot }) {
  const [hotelId, setHotelId] = useState(boot.hotels[0]?.id ?? "");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<{ hotel: string; month: string; cases: number; completed: number; rooms: number; published: { cases: number; completed: number; rooms: number; hotel: string; month: string } | null } | null>(null);
  const load = () => api<NonNullable<typeof data>>(`/api/yaren/reports/monthly?hotelId=${hotelId}&month=${month}`, {}, token).then(setData);
  useEffect(() => { void load(); }, [token, hotelId, month]);
  const printed = data?.published;
  return (
    <Page kicker="SCR-RPT-002" title="Monthly clinic report">
      <div className="grid no-print"><label><Text value="Hotel" /><select value={hotelId} onChange={(event) => setHotelId(event.target.value)}>{boot.hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}</select></label><label><Text value="Month" /><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label></div>
      <div className="kpis"><Kpi label="Cases" value={data?.cases ?? 0} /><Kpi label="Completed" value={data?.completed ?? 0} /><Kpi label="Rooms" value={data?.rooms ?? 0} /></div>
      <button type="button" className="primary no-print" onClick={async () => { await api("/api/yaren/reports/monthly/publish", { method: "POST", body: JSON.stringify({ hotelId, month }) }, token); await load(); }}><Text value="Publish report" /></button>
      {printed ? <article className="doc"><h2>{printed.hotel}</h2><p>{printed.month}</p><p><Text value="Cases" /> {printed.cases} · <Text value="Completed" /> {printed.completed} · <Text value="Rooms" /> {printed.rooms}</p></article> : <p className="muted"><Text value="Not published" /></p>}
      <button type="button" className="ghost no-print" onClick={() => window.print()}><Text value="Print report" /></button>
    </Page>
  );
}

function Finance({ token }: { token: string }) {
  const [data, setData] = useState<(Record<string, number> & { currency?: string; invoices?: { label: string; value: number }[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<NonNullable<typeof data>>("/api/yaren/reports/finance", {}, token).then(setData).catch((caught: unknown) => setError(messageOf(caught))); }, [token]);
  return <Page kicker="SCR-RPT-003" title="Collections">{error ? <p className="error">{error}</p> : <><p className="muted"><Text value="Currency" /> {data?.currency ?? "EGP"}</p><div className="kpis"><Kpi label="Revenue" value={data?.revenue ?? 0} /><Kpi label="Collected" value={data?.collected ?? 0} /><Kpi label="Receivables" value={data?.receivables ?? 0} /><Kpi label="Open invoices" value={data?.open_invoices ?? 0} /></div><h2><Text value="Invoices" /></h2><div className="board"><Mix rows={data?.invoices ?? []} /><Donut rows={data?.invoices ?? []} /></div></>}</Page>;
}

function Management({ token, boot }: { token: string; boot: Boot }) {
  const [data, setData] = useState<{ generatedAt?: string; ops: { encounters: number }; finance: { collected: number; receivables: number }; claims: { pending: number }; satisfaction: { nps: number }; encounterMix?: { label: string; value: number }[]; claimMix?: { label: string; value: number }[]; hotels?: { label: string; value: number }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<NonNullable<typeof data>>("/api/yaren/reports/management", {}, token).then(setData).catch((caught: unknown) => setError(messageOf(caught))); }, [token]);
  return (
    <Page kicker="UI-12 · SCR-MGT-001" title="Management">
      {data?.generatedAt ? <p className="muted"><Text value="Prepared" /> {new Date(data.generatedAt).toLocaleString()}</p> : null}
      {error ? <p className="error">{error}</p> : <div className="kpis"><Kpi label="Active hotels" value={boot.hotels.length} /><Kpi label="Active clinics" value={boot.clinics.length} /><Kpi label="Encounters" value={data?.ops.encounters ?? 0} /><Kpi label="Collected" value={data?.finance.collected ?? 0} /><Kpi label="Receivables" value={data?.finance.receivables ?? 0} /><Kpi label="Claims pending" value={data?.claims.pending ?? 0} /><Kpi label="NPS" value={data?.satisfaction.nps ?? 0} /></div>}
      <div className="board">
        <div><h2><Text value="Visits this month" /></h2><Mix rows={data?.encounterMix ?? []} /></div>
        <Donut rows={data?.encounterMix ?? []} />
      </div>
      <div className="board">
        <div><h2><Text value="Claims" /></h2><Mix rows={data?.claimMix ?? []} /></div>
        <Donut rows={data?.claimMix ?? []} />
      </div>
      <h2><Text value="Open requests by hotel" /></h2>
      <Mix rows={data?.hotels ?? []} />
      <h2><Text value="Hotels" /></h2>
      <div className="kpis">{boot.hotels.map((hotel) => <article className="card" key={hotel.id}><span>{hotel.city}</span><strong style={{ fontSize: 22 }}>{hotel.name}</strong><p>{boot.clinics.filter((clinic) => clinic.hotel_id === hotel.id).length} <Text value="Clinics" /></p></article>)}</div>
    </Page>
  );
}

function Users({ token, boot }: { token: string; boot: Boot }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [userType, setUserType] = useState("staff");
  const [role, setRole] = useState("receptionist");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState(boot.staff);
  const [grants, setGrants] = useState<{ user_id: string; clinic_id: string; capabilities: string[] }[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { api<{ grants: typeof grants }>("/api/yaren/clinic-access", {}, token).then((saved) => setGrants(saved.grants)).catch(() => setGrants([])); }, [token]);
  const hotelName = (hotelId: string | null) => boot.hotels.find((hotel) => hotel.id === hotelId)?.name || "—";
  const typeLabel = (value: string | undefined) => value === "super_admin" ? "Super admin" : value === "admin" ? "Admin" : "Staff";
  const jobs = ["physician", "nurse", "receptionist", "pharmacist", "claims_officer", "hotel_manager"];
  const capabilities = ["desk", "clinical", "pharmacy", "billing", "insurance", "transfers", "quality", "reports"];
  const capabilityLabel: Record<string, string> = { desk: "Front desk", clinical: "Clinical", pharmacy: "Pharmacy", billing: "Billing", insurance: "Insurance", transfers: "Transfers", quality: "Quality", reports: "Reports" };
  const chosen = staff.find((user) => user.id === selectedUser) ?? null;
  function hasCapability(clinicId: string, capability: string) {
    return grants.some((grant) => grant.user_id === selectedUser && grant.clinic_id === clinicId && grant.capabilities.includes(capability));
  }
  function toggleCapability(clinicId: string, capability: string) {
    setGrants((current) => {
      const existing = current.find((grant) => grant.user_id === selectedUser && grant.clinic_id === clinicId);
      if (!existing) return [...current, { user_id: selectedUser ?? "", clinic_id: clinicId, capabilities: [capability] }];
      const next = existing.capabilities.includes(capability) ? existing.capabilities.filter((item) => item !== capability) : [...existing.capabilities, capability];
      return current.map((grant) => grant === existing ? { ...grant, capabilities: next } : grant);
    });
  }
  return (
    <Page kicker="SCR-ADM-001" title="Users">
      <div className="kpis"><Kpi label="Super admin" value={staff.filter((user) => user.user_type === "super_admin").length} /><Kpi label="Admin" value={staff.filter((user) => user.user_type === "admin").length} /><Kpi label="Staff" value={staff.filter((user) => (user.user_type ?? "staff") === "staff").length} /></div>
      <form className="panel grid" onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          const created = await api<{ id: string }>("/api/yaren/users", { method: "POST", body: JSON.stringify({ email, displayName, password: "ChangeMe!2026", userType, role }) }, token);
          setStaff((current) => [...current, { id: created.id, email, display_name: displayName, role: userType === "super_admin" ? "system_admin" : userType === "admin" ? "center_manager" : role, status: "active", hotel_id: null, license_no: null, user_type: userType }]);
          setMessage("User created");
        } catch (caught) { setError(messageOf(caught)); }
      }}>
        <Field label="Name" value={displayName} onChange={setDisplayName} />
        <Field label="Email" value={email} onChange={setEmail} />
        <label><Text value="User type" /><select value={userType} onChange={(event) => setUserType(event.target.value)}><option value="staff">Staff</option><option value="admin">Admin</option><option value="super_admin">Super admin</option></select></label>
        {userType === "staff" ? <label><Text value="Role" /><select value={role} onChange={(event) => setRole(event.target.value)}>{jobs.map((job) => <option key={job} value={job}>{job.replaceAll("_", " ")}</option>)}</select></label> : null}
        <button type="submit"><Text value="Create user" /></button>
        {message ? <p>{message}</p> : null}
      </form>
      {error ? <p className="error">{error}</p> : null}
      <p className="muted"><Text value="Super admin can open every module. Admin can manage staff accounts. Staff use their job role." /></p>
      {boot.actor.role === "system_admin" && chosen ? <form className="panel" onSubmit={async (event) => { event.preventDefault(); setError(null); try { await Promise.all(boot.clinics.map((clinic) => api("/api/yaren/clinic-access", { method: "PUT", body: JSON.stringify({ userId: chosen.id, clinicId: clinic.id, capabilities: capabilities.filter((capability) => hasCapability(clinic.id, capability)) }) }, token))); setNotice("Saved"); } catch (caught) { setError(messageOf(caught)); } }}>
        <h2><Text value="Branch access" /> · {chosen.display_name}</h2>
        {chosen.user_type === "super_admin" ? <p className="muted"><Text value="A super admin keeps access to every clinic." /></p> : boot.clinics.map((clinic) => <div key={clinic.id}><strong>{clinic.name}</strong><div className="checks">{capabilities.map((capability) => <label className="check" key={capability}><input type="checkbox" checked={hasCapability(clinic.id, capability)} onChange={() => toggleCapability(clinic.id, capability)} /><Text value={capabilityLabel[capability] ?? capability} /></label>)}</div></div>)}
        {chosen.user_type === "super_admin" ? null : <button type="submit"><Text value="Save branch access" /></button>}
        {notice ? <p>{notice}</p> : null}
      </form> : null}
      <div className="table-scroll"><table><thead><tr><th><Text value="Name" /></th><th><Text value="Email" /></th><th><Text value="User type" /></th><th><Text value="Role" /></th><th><Text value="License" /></th><th><Text value="Hotel" /></th><th><Text value="Status" /></th><th></th></tr></thead><tbody>{staff.map((user) => <tr key={user.id} onClick={() => setSelectedUser(user.id)}><td>{user.display_name}</td><td>{user.email}</td><td><Text value={typeLabel(user.user_type)} /></td><td>{user.role.replaceAll("_", " ")}</td><td>{user.license_no || "—"}</td><td>{hotelName(user.hotel_id)}</td><td><span className={`pill ${user.status}`}>{user.status}</span></td><td>{user.id === boot.actor.id ? null : <button type="button" className="ghost" onClick={async (event) => { event.stopPropagation(); const status = user.status === "active" ? "disabled" : "active"; setError(null); try { await api(`/api/yaren/users/${user.id}/status`, { method: "POST", body: JSON.stringify({ status }) }, token); setStaff((current) => current.map((row) => row.id === user.id ? { ...row, status } : row)); } catch (caught) { setError(messageOf(caught)); } }}>{user.status === "active" ? <Text value="Disable" /> : <Text value="Enable" />}</button>}</td></tr>)}</tbody></table></div>
    </Page>
  );
}

function Roles({ boot, token }: { boot: Boot; token: string }) {
  const [matrix, setMatrix] = useState<{ builtIn: { role: string; access: string }[]; overrides: { role: string; resource: string; action: string; allowed: boolean }[] }>({ builtIn: [], overrides: [] });
  const load = () => api<typeof matrix>("/api/yaren/permissions", {}, token).then(setMatrix);
  useEffect(() => { void load(); }, [token]);
  return (
    <Page kicker="SCR-ADM-002 · Configurable permission matrix" title="Roles and permissions">
      <div className="kpis">{matrix.builtIn.map((row) => <Kpi key={row.role} label={row.role.replaceAll("_", " ")} value={boot.staff.filter((user) => user.role === row.role).length} />)}</div>
      <div className="table-scroll"><table><thead><tr><th><Text value="Role" /></th><th><Text value="Access" /></th></tr></thead><tbody>{matrix.builtIn.map((row) => <tr key={row.role}><td>{row.role.replaceAll("_", " ")}</td><td>{row.access}</td></tr>)}</tbody></table></div>
      <h2><Text value="Extra permissions" /></h2>
      <div className="table-scroll"><table><thead><tr><th><Text value="Role" /></th><th><Text value="Resource" /></th><th><Text value="Action" /></th><th></th></tr></thead><tbody>{matrix.overrides.map((row) => <tr key={`${row.role}-${row.resource}-${row.action}`}><td>{row.role.replaceAll("_", " ")}</td><td>{row.resource.replaceAll("_", " ")}</td><td>{row.action}</td><td><button type="button" className="ghost" onClick={async () => { await api("/api/yaren/permissions", { method: "PUT", body: JSON.stringify({ ...row, allowed: !row.allowed }) }, token); await load(); }}>{row.allowed ? "Allowed" : "Blocked"}</button></td></tr>)}{matrix.overrides.length === 0 ? <tr><td colSpan={4} className="empty"><Text value="No extra permissions" /></td></tr> : null}</tbody></table></div>
    </Page>
  );
}

function detailText(detail: unknown): string {
  if (detail == null || detail === "") return "—";
  if (typeof detail !== "object") return String(detail);
  if (Array.isArray(detail)) return detail.map(detailText).filter((part) => part !== "—").join(", ") || "—";
  const parts = Object.entries(detail as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key.replaceAll("_", " ")} ${detailText(value)}`);
  return parts.join(" · ") || "—";
}

function Audit({ token }: { token: string }) {
  const [rows, setRows] = useState<{ id: string; created_at: string; display_name: string | null; action: string; entity: string; detail: unknown }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<typeof rows>("/api/yaren/audit", {}, token).then(setRows).catch((caught: unknown) => setError(messageOf(caught))); }, [token]);
  const withDetail = rows.filter((row) => detailText(row.detail) !== "—").length;
  return (
    <Page kicker="SCR-ADM-003" title="Audit trail">
      {error ? <p className="error">{error}</p> : <>
        <div className="kpis"><Kpi label="Events" value={rows.length} /><Kpi label="With detail" value={withDetail} /></div>
        <div className="table-scroll"><table><thead><tr><th><Text value="When" /></th><th><Text value="User" /></th><th><Text value="Action" /></th><th><Text value="Module" /></th><th><Text value="Detail" /></th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={5} className="empty"><Text value="No events yet" /></td></tr> : rows.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.display_name || "—"}</td><td>{row.action}</td><td>{row.entity}</td><td>{detailText(row.detail)}</td></tr>)}</tbody></table></div>
      </>}
    </Page>
  );
}

function Changes({ token }: { token: string }) {
  const [data, setData] = useState<{ available: string[]; requests: { id: string; title: string; scope: string; status: string; created_at: string; display_name: string | null }[] }>({ available: [], requests: [] });
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = () => api<typeof data>("/api/yaren/change-requests", {}, token).then(setData).catch((caught: unknown) => setError(messageOf(caught)));
  useEffect(() => { void load(); }, [token]);
  return (
    <Page kicker="Phase 2 stays out until a request is approved" title="Change requests">
      <div className="kpis">{data.available.map((item) => <article className="card" key={item}><span><Text value="Deferred" /></span><strong style={{ fontSize: 18 }}><Text value={item} /></strong></article>)}</div>
      <form className="panel grid" onSubmit={async (event) => { event.preventDefault(); setError(null); try { await api("/api/yaren/change-requests", { method: "POST", body: JSON.stringify({ title, scope }) }, token); setTitle(""); setScope(""); await load(); } catch (caught) { setError(messageOf(caught)); } }}>
        <Field label="Title" value={title} onChange={setTitle} />
        <Field label="Scope" value={scope} onChange={setScope} />
        <button type="submit"><Text value="File request" /></button>
        {error ? <p className="error">{error}</p> : null}
      </form>
      <div className="table-scroll"><table><thead><tr><th><Text value="Title" /></th><th><Text value="Scope" /></th><th><Text value="Status" /></th><th><Text value="Requested" /></th><th><Text value="When" /></th></tr></thead><tbody>{data.requests.length === 0 ? <tr><td colSpan={5} className="empty"><Text value="Nothing requested yet" /></td></tr> : data.requests.map((row) => <tr key={row.id}><td>{row.title}</td><td>{row.scope}</td><td><span className={`pill ${row.status}`}>{row.status}</span></td><td>{row.display_name || "—"}</td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>
    </Page>
  );
}

function Settings({ token }: { token: string }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [backups, setBackups] = useState<{ id: string; created_at: string; display_name: string | null }[]>([]);
  const loadBackups = () => api<typeof backups>("/api/yaren/backups", {}, token).then(setBackups).catch(() => setBackups([]));
  useEffect(() => { api<Record<string, string>>("/api/yaren/settings", {}, token).then(setSettings); void loadBackups(); }, [token]);
  const [backup, setBackup] = useState<string | null>(null);
  const known = new Set(settingModules.flatMap((module) => module.keys));
  const extra = Object.keys(settings).filter((key) => !known.has(key));
  return <Page kicker="SCR-ADM-004" title="System settings">{settingModules.map((module) => <ModuleSettings key={module.title} token={token} title={module.title} keys={[...module.keys]} note={module.note} />)}{extra.length ? <ModuleSettings token={token} title="Other" keys={extra} note="Settings that are not tied to one module." /> : null}<button type="button" className="primary" onClick={async () => { const saved = await api<{ id: string }>("/api/yaren/admin/backup", { method: "POST" }, token); setBackup(saved.id); await loadBackups(); }}><Text value="Take backup" /></button>{backup ? <p>Backup {backup} stored. Restore it from the API with confirmation RESTORE.</p> : null}<h2><Text value="Backups" /></h2><div className="table-scroll"><table><thead><tr><th><Text value="When" /></th><th><Text value="User" /></th><th><Text value="Reference" /></th></tr></thead><tbody>{backups.length === 0 ? <tr><td colSpan={3} className="empty"><Text value="No backups yet" /></td></tr> : backups.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.display_name || "—"}</td><td>{row.id}</td></tr>)}</tbody></table></div><p className="muted">Recovery point {settings.rpo_hours ?? "24"} hours · Recovery time {settings.rto_hours ?? "8"} hours. Multi-factor sign-in is {settings.mfa_required === "true" ? "required" : "available from each user account"}.</p></Page>;
}

function Master({ token, boot }: { token: string; boot: Boot }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  return (
    <Page kicker="SCR-ADM-005" title="Master data">
      <div className="kpis"><Kpi label="Medical centers" value={boot.centers.length} /><Kpi label="Hotels" value={boot.hotels.length} /><Kpi label="Clinics" value={boot.clinics.length} /><Kpi label="Services" value={boot.services.length} /><Kpi label="Insurers" value={boot.insurers.length} /><Kpi label="Medicines" value={boot.medications.length} /></div>
      <h2><Text value="Medical centers" /></h2>
      <div className="table-scroll"><table><thead><tr><th><Text value="Code" /></th><th><Text value="Name" /></th><th><Text value="City" /></th><th><Text value="Phone" /></th><th><Text value="Address on file" /></th><th><Text value="Status" /></th></tr></thead><tbody>{boot.centers.length === 0 ? <tr><td colSpan={6} className="empty"><Text value="No medical centers yet" /></td></tr> : boot.centers.map((center) => <tr key={center.id}><td>{center.code}</td><td>{center.name}</td><td>{center.city}</td><td>{center.phone || "—"}</td><td>{center.address_line || "—"}</td><td><span className={`pill ${center.status}`}>{center.status}</span></td></tr>)}</tbody></table></div>
      <p className="muted"><Text value="The address is the line on file, not a street map." /></p>
      <form className="panel grid" onSubmit={async (event) => { event.preventDefault(); await api("/api/yaren/master/hotels", { method: "POST", body: JSON.stringify({ name, city }) }, token); }}><Field label="Hotel" value={name} onChange={setName} /><Field label="City" value={city} onChange={setCity} /><button type="submit"><Text value="Add hotel" /></button></form>
      <h2><Text value="Services" /></h2>
      <div className="table-scroll"><table><thead><tr><th><Text value="Code" /></th><th><Text value="Name" /></th><th><Text value="Category" /></th><th><Text value="Price" /></th></tr></thead><tbody>{boot.services.map((service) => <tr key={service.id}><td>{service.code}</td><td>{service.name}</td><td>{service.category}</td><td>{service.unit_price}</td></tr>)}</tbody></table></div>
      <h2><Text value="Insurers" /></h2>
      <div className="table-scroll"><table><thead><tr><th><Text value="Name" /></th></tr></thead><tbody>{boot.insurers.map((insurer) => <tr key={insurer.id}><td>{insurer.name}</td></tr>)}</tbody></table></div>
      <h2><Text value="Medicines" /></h2>
      <div className="table-scroll"><table><thead><tr><th><Text value="Code" /></th><th><Text value="Name" /></th><th><Text value="Strength" /></th><th><Text value="Form" /></th><th><Text value="On hand" /></th></tr></thead><tbody>{boot.medications.map((item) => <tr key={item.id}><td>{item.code}</td><td>{item.name}</td><td>{item.strength}</td><td>{item.form}</td><td>{item.on_hand}</td></tr>)}</tbody></table></div>
    </Page>
  );
}

function Encounter({ token }: { token: string }) {
  const { id = "" } = useParams();
  const [data, setData] = useState<{ encounter: Record<string, string>; triage: Record<string, string | number | null> | null; consultation: (Record<string, string | null> & { exam_systems?: Record<string, string> | null }) | null; prescriptions: { rx_no: string; indication: string | null; instructions: string | null; follow_up: string | null }[]; investigations: { request_no: string; status: string; tests: string[] | null; result_text: string | null; critical_value: string | null; receiving_lab: string | null }[]; report: Record<string, string | null> | null; notes: { note: string; created_at: string; follow_up: string | null; follow_up_due: string | null }[]; invoices: { invoice_no: string; status: string; outstanding: number }[] } | null>(null);
  const [amendments, setAmendments] = useState<{ id: string; target: string; reason: string; created_at: string; display_name: string | null; previous: { diagnosis?: string | null; icd10?: string | null } | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<NonNullable<typeof data>>(`/api/yaren/encounters/${id}`, {}, token).then(setData).catch((caught: unknown) => setError(messageOf(caught)));
    api<typeof amendments>(`/api/yaren/encounters/${id}/amendments`, {}, token).then(setAmendments).catch(() => setAmendments([]));
  }, [id, token]);
  if (error) return <Page kicker="Encounter" title="Visit"><p className="error">{error}</p></Page>;
  if (!data) return <Page kicker="Encounter" title="Opening visit…">{null}</Page>;
  const encounter = data.encounter;
  const triage = data.triage;
  return (
    <Page kicker={`${encounter.ticket_no} · ${encounter.encounter_no}`} title={`${encounter.given_name} ${encounter.family_name}`}>
      <p className="muted">{encounter.hotel_name} · Room {encounter.room_no || "—"} · {encounter.visit_type.replaceAll("_", " ")}</p>
      <div className="kpis"><Kpi label="Prescriptions" value={data.prescriptions.length} /><Kpi label="Investigations" value={data.investigations.length} /><Kpi label="Invoices" value={data.invoices.length} /><Kpi label="Amendments" value={amendments.length} /></div>
      <div className="board">
        <div className="panel">
          <h2><Text value="Clinical documentation" /></h2>
          <p><span className={`pill ${encounter.status}`}>{encounter.status.replaceAll("_", " ")}</span></p>
          <p><Text value="Allergies" />: {encounter.allergies || "—"}</p>
          {triage ? <p><Text value="Complaint" /> {triage.chief_complaint || "—"} · <Text value="Category" /> {String(triage.category || "—").replaceAll("_", " ")}{triage.pain_score != null && triage.pain_score !== "" ? <> · <Text value="Pain score" /> {triage.pain_score}</> : null}<br />Temp {triage.temperature ?? "—"} · BP {triage.systolic ?? "—"}/{triage.diastolic ?? "—"} · Pulse {triage.pulse ?? "—"} · <Text value="Respiratory rate" /> {triage.respiratory_rate ?? "—"} · SpO₂ {triage.spo2 ?? "—"}</p> : <p className="muted"><Text value="No triage yet" /></p>}
          {triage?.notes ? <p><Text value="Triage notes" /> {triage.notes}</p> : null}
          {data.consultation ? <p><Text value="Diagnosis" /> {data.consultation.diagnosis || "—"} · {data.consultation.icd10 || "—"}</p> : null}
          {data.consultation?.secondary_diagnoses ? <p><Text value="Secondary diagnosis" /> {data.consultation.secondary_diagnoses}</p> : null}
          {data.consultation?.hpi ? <p><Text value="History of present illness" /> {data.consultation.hpi}</p> : null}
          {data.consultation?.past_history ? <p><Text value="Past history" /> {data.consultation.past_history}</p> : null}
          {data.consultation?.examination ? <p><Text value="Examination" /> {data.consultation.examination}</p> : null}
          {data.consultation?.exam_systems ? <p><Text value="Exam systems" /> {Object.entries(data.consultation.exam_systems).filter(([, value]) => value).map(([label, value]) => `${label} ${value}`).join(" · ") || "—"}</p> : null}
          {data.consultation?.plan ? <p><Text value="Plan" /> {data.consultation.plan}</p> : null}
          {data.report?.summary ? <p><Text value="Summary" /> {data.report.summary}</p> : null}
          {data.report?.fit_decision ? <p><Text value="Fit to travel" /> {data.report.fit_decision}</p> : null}
          {data.report?.airline || data.report?.travel_date ? <p><Text value="Airline" /> {data.report.airline || "—"} · <Text value="Travel date" /> {data.report.travel_date ? String(data.report.travel_date).slice(0, 10) : "—"}</p> : null}
        </div>
        <aside className="panel">
          <h2><Text value="Billing" /></h2>
          {data.invoices.length === 0 ? <p className="muted"><Text value="No invoice on this visit" /></p> : data.invoices.map((invoice) => <p key={invoice.invoice_no}>{invoice.invoice_no} · <span className={`pill ${invoice.status}`}>{invoice.status}</span> · {invoice.outstanding}</p>)}
          <Link className="primary" to={`/documents/${encounter.id}`}><Text value="Documents" /></Link>
        </aside>
      </div>
      <h2><Text value="Amendments" /></h2>
      <div className="table-scroll"><table><thead><tr><th><Text value="When" /></th><th><Text value="User" /></th><th><Text value="Target" /></th><th><Text value="Reason" /></th><th><Text value="Previous diagnosis" /></th></tr></thead><tbody>{amendments.length === 0 ? <tr><td colSpan={5} className="empty"><Text value="No amendments yet" /></td></tr> : amendments.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.display_name || "—"}</td><td>{row.target}</td><td>{row.reason}</td><td>{row.previous?.diagnosis || "—"}{row.previous?.icd10 ? ` · ${row.previous.icd10}` : ""}</td></tr>)}</tbody></table></div>
      <h2><Text value="Progress" /></h2>
      <div className="table-scroll"><table><thead><tr><th><Text value="When" /></th><th><Text value="Note" /></th><th><Text value="Follow-up" /></th><th><Text value="Due" /></th></tr></thead><tbody>{data.notes.length === 0 ? <tr><td colSpan={4} className="empty"><Text value="No progress notes yet" /></td></tr> : data.notes.map((note) => <tr key={note.created_at}><td>{new Date(note.created_at).toLocaleString()}</td><td>{note.note}</td><td>{note.follow_up || "—"}</td><td>{note.follow_up_due ? String(note.follow_up_due).slice(0, 10) : "—"}</td></tr>)}</tbody></table></div>
      <h2><Text value="Prescription" /></h2>
      <div className="table-scroll"><table><thead><tr><th><Text value="Prescription" /></th><th><Text value="Indication" /></th><th><Text value="Instructions" /></th><th><Text value="Follow-up" /></th></tr></thead><tbody>{data.prescriptions.length === 0 ? <tr><td colSpan={4} className="empty"><Text value="No medications yet" /></td></tr> : data.prescriptions.map((row) => <tr key={row.rx_no}><td>{row.rx_no}</td><td>{row.indication || "—"}</td><td>{row.instructions || "—"}</td><td>{row.follow_up || "—"}</td></tr>)}</tbody></table></div>
      <h2><Text value="Investigations" /></h2>
      <div className="table-scroll"><table><thead><tr><th><Text value="Request" /></th><th><Text value="Tests" /></th><th><Text value="Status" /></th><th><Text value="Result" /></th><th><Text value="Critical value" /></th><th><Text value="Receiving lab" /></th></tr></thead><tbody>{data.investigations.length === 0 ? <tr><td colSpan={6} className="empty"><Text value="No investigations yet" /></td></tr> : data.investigations.map((row) => <tr key={row.request_no}><td>{row.request_no}</td><td>{(row.tests ?? []).join(", ") || "—"}</td><td>{row.status}</td><td>{row.result_text || "—"}</td><td>{row.critical_value || "—"}</td><td>{row.receiving_lab || "—"}</td></tr>)}</tbody></table></div>
    </Page>
  );
}

function EncounterForm({ token, kicker, title, fields, submitLabel, path, payload, absolute, extra, onSaved }: { token: string; kicker: string; title: string; fields: string[]; submitLabel: string; path: string; payload?: (form: Record<string, string>) => unknown; absolute?: string; extra?: ReactNode; onSaved?: () => void }) {
  const [encounterId, setEncounterId] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Page kicker={kicker} title={title}>
      <form className="panel" onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          const body = payload ? payload({ ...form, encounterId }) : { ...form, encounterId };
          const url = absolute ?? `/api/yaren/encounters/${encounterId}/${path}`;
          const saved = await api<Record<string, string>>(url, { method: "POST", body: JSON.stringify(absolute ? body : strip(body as Record<string, string>, ["encounterId"])) }, token);
          setMessage(saved.rxNo || saved.requestNo || saved.referralNo || saved.transferNo || saved.status || "Saved");
          onSaved?.();
        } catch (caught) { setError(messageOf(caught)); }
      }}>
        <div className="grid">
          <Field label="Encounter ID" value={encounterId} onChange={setEncounterId} />
          {fields.map((field) => <Field key={field} label={labelOf(field)} value={form[field] ?? ""} onChange={(value) => setForm({ ...form, [field]: value })} />)}
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit"><Text value={submitLabel} /></button>
        {message ? <p>{message}</p> : null}
      </form>
      {extra}
    </Page>
  );
}

function QueueTable({ rows, onMove }: { rows: QueueRow[]; onMove?: (id: string, status: string) => Promise<void> }) {
  const navigate = useNavigate();
  return <div className="table-scroll"><table><thead><tr><th><Text value="Ticket" /></th><th><Text value="Guest" /></th><th><Text value="Hotel" /></th><th><Text value="Room" /></th><th><Text value="Visit" /></th><th><Text value="Arrived" /></th><th><Text value="Assigned" /></th><th><Text value="Status" /></th><th></th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={9} className="empty"><Text value="No one is waiting" /></td></tr> : rows.map((row) => <tr key={row.id}><td>{row.ticket_no}</td><td><strong>{row.given_name} {row.family_name}</strong></td><td>{row.hotel_name}</td><td>{row.room_no}</td><td>{row.visit_type.replaceAll("_", " ")}</td><td>{row.arrival_at ? new Date(row.arrival_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</td><td>{row.assigned_name || "—"}</td><td><span className={`pill ${row.status}`}>{row.status.replaceAll("_", " ")}</span></td><td className="actions"><button type="button" className="ghost" onClick={() => navigate(`/encounter/${row.id}`)}><Text value="Open" /></button><button type="button" className="ghost" onClick={() => navigate(`/documents/${row.id}`)}><Text value="Documents" /></button>{onMove && row.status === "waiting" ? <button type="button" className="ghost" onClick={() => onMove(row.id, "in_triage")}><Text value="To triage" /></button> : null}</td></tr>)}</tbody></table></div>;
}

const cityCenters: Record<string, { x: number; y: number }> = { cairo: { x: 168, y: 86 }, hurghada: { x: 246, y: 176 } };
function CityMap({ hotels }: { hotels: { id: string; name: string; city: string }[] }) {
  const seen = new Map<string, number>();
  const placed = hotels.flatMap((hotel) => {
    const key = Object.keys(cityCenters).find((name) => hotel.city.toLowerCase().includes(name));
    if (!key) return [];
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return [{ ...hotel, x: cityCenters[key].x + count * 12, y: cityCenters[key].y }];
  });
  return <div className="city-map"><svg viewBox="0 0 320 360" role="img"><path d="M148 24 L214 36 L258 92 L274 150 L246 214 L198 292 L154 338 L118 292 L86 214 L64 140 L86 72 Z" /><path d="M214 150 L286 168 L274 196 L214 178 Z" />{placed.map((pin) => <g key={pin.id}><circle cx={pin.x} cy={pin.y} r="6" /><text x={pin.x + 10} y={pin.y + 4}>{pin.city}</text></g>)}</svg><p className="muted"><Text value="Pins mark the city on file, not a street address." /></p></div>;
}
function Kpi({ label, value, detail }: { label: string; value: number; detail?: string }) { return <article className="card"><span><Text value={label} /></span><strong>{value}</strong>{detail ? <p>{detail}</p> : null}</article>; }
function DayBars({ days }: { days: { day: string; encounters: number }[] }) {
  return <Mix rows={days.map((day) => ({ label: day.day.slice(5), value: day.encounters }))} empty="No visits in this range" />;
}
function Mix({ rows, empty = "Nothing recorded yet" }: { rows: { label: string; value: number }[]; empty?: string }) {
  if (rows.length === 0) return <p className="muted"><Text value={empty} /></p>;
  const peak = Math.max(...rows.map((row) => row.value), 1);
  return <div className="bars">{rows.map((row) => <article key={row.label}><span className="bar" style={{ height: `${row.value === 0 ? 4 : Math.max(8, Math.round((row.value / peak) * 96))}px` }} /><strong>{row.value}</strong><small><Text value={row.label.replaceAll("_", " ")} /></small></article>)}</div>;
}
const donutColors = ["#0d7377", "#0b3142", "#c9973f", "#0c6b58", "#8d3428", "#5d6b73"];
function Donut({ rows }: { rows: { label: string; value: number }[] }) {
  const shown = rows.filter((row) => row.value > 0);
  const total = shown.reduce((sum, row) => sum + row.value, 0);
  if (total === 0) return <p className="muted"><Text value="Nothing recorded yet" /></p>;
  let cursor = 0;
  const stops = shown.map((row, index) => {
    const start = cursor;
    cursor += (row.value / total) * 360;
    return `${donutColors[index % donutColors.length]} ${start}deg ${cursor}deg`;
  }).join(", ");
  return <div className="donut"><div className="ring" style={{ background: `conic-gradient(${stops})` }}><strong>{total}</strong></div><ul>{shown.map((row, index) => <li key={row.label}><i style={{ background: donutColors[index % donutColors.length] }} /><Text value={row.label.replaceAll("_", " ")} /> {row.value}</li>)}</ul></div>;
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  const { lang } = useLanguage();
  return <label>{translate(lang, label)}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{translate(lang, option.replaceAll("_", " "))}</option>)}</select></label>;
}
function pairs(items: readonly string[]) { const rows: [string, string][] = []; for (let i = 0; i < items.length; i += 2) rows.push([items[i], items[i + 1]]); return rows; }
function groupFor(pathname: string) {
  if (pathname.startsWith("/encounter") || pathname.startsWith("/documents")) return "Clinical";
  for (const [title, items] of nav) {
    if (pairs(items).some(([path]) => path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`))) return title;
  }
  return "Front desk";
}
function messageOf(caught: unknown) { return caught instanceof Error ? caught.message : "Request failed"; }
function labelOf(field: string) { return field.replaceAll(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`); }
function numbers(form: Record<string, string>, keys: string[]) { const copy: Record<string, string | number> = { ...form }; for (const key of keys) if (copy[key] !== undefined && copy[key] !== "") copy[key] = Number(copy[key]); return copy; }
function strip(body: Record<string, string>, keys: string[]) { const copy = { ...body }; for (const key of keys) delete copy[key]; return copy; }

type QueueRow = { id: string; ticket_no: string; given_name: string; family_name: string; hotel_name: string; room_no: string; visit_type: string; status: string; arrival_at?: string; assigned_name?: string | null };
type AlertPerson = { ticket_no: string; given_name: string; family_name: string; allergies?: string };
