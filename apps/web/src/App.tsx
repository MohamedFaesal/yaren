import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router";
import { api, loadSession, saveSession, type DoctorCasePage, type Session, type TriageQueueResult, type User } from "./api";
import { canAct, canSeeDoctorCases } from "./access";
import { RoleIcon } from "./pages/ui";
import { ClinicFormPage } from "./pages/ClinicFormPage";
import { ClinicsPage } from "./pages/ClinicsPage";
import { ClinicViewPage } from "./pages/ClinicViewPage";
import { HotelFormPage } from "./pages/HotelFormPage";
import { HotelsPage } from "./pages/HotelsPage";
import { HotelViewPage } from "./pages/HotelViewPage";
import { ActivityPage } from "./pages/ActivityPage";
import { RolesPage } from "./pages/RolesPage";
import { RoleFormPage } from "./pages/RoleFormPage";
import { RoleViewPage } from "./pages/RoleViewPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PatientsPage } from "./pages/PatientsPage";
import { PatientFormPage } from "./pages/PatientFormPage";
import { PatientViewPage } from "./pages/PatientViewPage";
import { RegisterPage } from "./pages/RegisterPage";
import { VisitsPage } from "./pages/VisitsPage";
import { TriagePage } from "./pages/TriagePage";
import { DoctorCasesPage } from "./pages/DoctorCasesPage";
import { VisitFormPage } from "./pages/VisitFormPage";
import { VisitViewPage } from "./pages/VisitViewPage";
import { ProfileAvatar, ProfilePage } from "./pages/ProfilePage";
import { UserFormPage } from "./pages/UserFormPage";
import { UserPermissionsPage } from "./pages/UserPermissionsPage";
import { UsersPage } from "./pages/UsersPage";
import { UserViewPage } from "./pages/UserViewPage";
import { ActiveClinicProvider, ClinicSwitcher, useActiveClinic } from "./ClinicWorkspace";
export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(() => loadSession());

  useEffect(() => {
    if (session) saveSession(session);
  }, []);

  useEffect(() => {
    if (!session) return;
    api<User>("/api/auth/me", {}, session.token).then((user) => {
      const next = { ...session, user };
      saveSession(next);
      setSession(next);
    }).catch(() => {
      saveSession(null);
      setSession(null);
    });
  }, [session?.token]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== "yaren.session") return;
      setSession(loadSession());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function signIn(next: Session) {
    saveSession(next);
    setSession(next);
  }

  async function signOut() {
    if (session) await api("/api/auth/logout", { method: "POST" }, session.token).catch(() => undefined);
    saveSession(null);
    setSession(null);
    navigate("/");
  }

  if (!session) return <LoginPage onSuccess={signIn} />;

  return (
    <ActiveClinicProvider token={session.token}>
      <AppShell
        token={session.token}
        user={session.user}
        pathname={location.pathname}
        onSignOut={() => void signOut()}
      >
        <Routes>
          <Route path="/" element={<DashboardPage token={session.token} actor={session.user} />} />
          <Route
            path="/profile"
            element={(
              <ProfilePage
                token={session.token}
                user={session.user}
                onUser={(user) => {
                  const next = { ...session, user: { ...session.user, ...user } };
                  saveSession(next);
                  setSession(next);
                }}
              />
            )}
          />
          <Route path="/users" element={<UsersPage token={session.token} actor={session.user} />} />
          <Route path="/users/new" element={<UserFormPage token={session.token} actor={session.user} />} />
          <Route path="/users/:id/edit" element={<UserFormPage token={session.token} actor={session.user} />} />
          <Route path="/users/:id/permissions/edit" element={<UserPermissionsPage token={session.token} actor={session.user} />} />
          <Route path="/users/:id" element={<UserViewPage token={session.token} actor={session.user} />} />
          <Route path="/hotels" element={<HotelsPage token={session.token} actor={session.user} />} />
          <Route path="/hotels/new" element={<HotelFormPage token={session.token} actor={session.user} />} />
          <Route path="/hotels/:id/edit" element={<HotelFormPage token={session.token} actor={session.user} />} />
          <Route path="/hotels/:id" element={<HotelViewPage token={session.token} actor={session.user} />} />
          <Route path="/clinics" element={<ClinicsPage token={session.token} actor={session.user} />} />
          <Route path="/clinics/new" element={<ClinicFormPage token={session.token} actor={session.user} />} />
          <Route path="/clinics/:id/edit" element={<ClinicFormPage token={session.token} actor={session.user} />} />
          <Route path="/clinics/:id" element={<ClinicViewPage token={session.token} actor={session.user} />} />
          <Route path="/patients" element={<PatientsPage token={session.token} actor={session.user} />} />
          <Route path="/patients/triage" element={<TriagePage token={session.token} actor={session.user} />} />
          <Route path="/patients/to-doctor" element={<DoctorCasesPage token={session.token} actor={session.user} />} />
          <Route path="/patients/visits" element={<VisitsPage token={session.token} actor={session.user} />} />
          <Route path="/patients/register" element={<RegisterPage token={session.token} actor={session.user} />} />
          <Route path="/patients/new" element={<PatientFormPage token={session.token} actor={session.user} />} />
          <Route path="/patients/:id/edit" element={<PatientFormPage token={session.token} actor={session.user} />} />
          <Route path="/patients/:patientId/visits/new" element={<VisitFormPage token={session.token} actor={session.user} />} />
          <Route path="/patients/:patientId/visits/:id/edit" element={<VisitFormPage token={session.token} actor={session.user} />} />
          <Route path="/patients/:patientId/visits/:id" element={<VisitViewPage token={session.token} actor={session.user} />} />
          <Route path="/patients/:id" element={<PatientViewPage token={session.token} actor={session.user} />} />
          <Route path="/activity" element={<ActivityPage token={session.token} />} />
          <Route path="/roles" element={<RolesPage token={session.token} actor={session.user} />} />
          <Route path="/roles/new" element={<RoleFormPage token={session.token} />} />
          <Route path="/roles/:id/edit" element={<RoleFormPage token={session.token} />} />
          <Route path="/roles/:id" element={<RoleViewPage token={session.token} actor={session.user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </ActiveClinicProvider>
  );
}

function AppShell({
  token,
  user,
  pathname,
  onSignOut,
  children,
}: {
  token: string;
  user: User;
  pathname: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [navOpen]);

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[248px_1fr]">
      {navOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px] lg:hidden"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col bg-shell px-3 py-5 text-white transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-auto lg:translate-x-0 ${
          navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"
        }`}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between gap-3 px-2 pb-6">
          <img src="/yaren-logo.png" alt="Yaren Healthcare" className="h-12 w-auto max-w-full rounded-lg bg-surface px-2 py-1.5" />
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <NavSection title="Overview">
            <NavLink to="/" end className={navClass}><DashboardIcon />Dashboard</NavLink>
          </NavSection>
          <NavSection
            title="Care"
            show={canAct(user, "visit", "create") || canAct(user, "visit", "view") || canAct(user, "triage", "view") || canSeeDoctorCases(user) || canAct(user, "patient", "view")}
          >
            {canAct(user, "visit", "create") ? <NavLink to="/patients/register" className={navClass}><RegisterIcon />Register</NavLink> : null}
            {canAct(user, "triage", "view") ? <TriageNavLink token={token} pathname={pathname} /> : null}
            {canSeeDoctorCases(user) ? <DoctorCasesNavLink token={token} pathname={pathname} /> : null}
            {canAct(user, "visit", "view") ? <NavLink to="/patients/visits" className={navClass}><VisitsIcon />Visits</NavLink> : null}
            {canAct(user, "patient", "view") ? <NavLink to="/patients" end className={navClass}><PatientsIcon />Patients</NavLink> : null}
          </NavSection>
          <NavSection
            title="Network"
            show={canAct(user, "hotel", "view") || canAct(user, "clinic", "view")}
          >
            {canAct(user, "hotel", "view") ? <NavLink to="/hotels" className={navClass}><HotelIcon />Hotels</NavLink> : null}
            {canAct(user, "clinic", "view") ? <NavLink to="/clinics" className={navClass}><ClinicIcon />Clinics</NavLink> : null}
          </NavSection>
          <NavSection
            title="People & access"
            show={canAct(user, "user", "view") || canAct(user, "role", "view")}
          >
            {canAct(user, "user", "view") ? <NavLink to="/users" className={navClass}><UsersIcon />Users</NavLink> : null}
            {canAct(user, "role", "view") ? <NavLink to="/roles" className={navClass}><RolesIcon />Roles</NavLink> : null}
          </NavSection>
          <NavSection title="System" show={canAct(user, "activity", "view")}>
            {canAct(user, "activity", "view") ? <NavLink to="/activity" className={navClass}><ActivityIcon />Activity</NavLink> : null}
          </NavSection>
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-header px-4 py-3 backdrop-blur sm:px-5 lg:gap-4 lg:px-7 lg:py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-ink hover:bg-surface-2 lg:hidden"
              aria-label="Open menu"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
            >
              <MenuIcon />
            </button>
            <div className="min-w-0">
              <HeaderGreeting />
              <p className="truncate text-base font-semibold text-ink sm:text-lg">{heading(pathname)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-4">
            <HeaderClock />
            <div className="flex items-center gap-1.5 border-l border-line pl-2 sm:pl-3 lg:pl-4">
              <ClinicSwitcher />
              <AccountMenu user={user} onSignOut={onSignOut} />
            </div>
          </div>
        </header>
        <main className="px-4 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-6">{children}</main>
      </div>
    </div>
  );
}

function HeaderGreeting() {
  const [label, setLabel] = useState(() => greeting(new Date()));
  const [flash, setFlash] = useState(false);
  const previous = useRef(label);

  useEffect(() => {
    const tick = () => {
      const next = greeting(new Date());
      if (next !== previous.current) {
        previous.current = next;
        setFlash(true);
        setLabel(next);
        window.setTimeout(() => setFlash(false), 420);
      }
    };
    const timer = window.setInterval(tick, 15000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p key={label} className={`text-[11px] font-semibold uppercase tracking-[0.16em] text-blue ${flash ? "greeting-swap" : ""}`}>
      {label}
    </p>
  );
}

function AccountMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-1.5 hover:bg-surface-2 sm:gap-3 sm:pr-2.5"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ProfileAvatar name={user.name} photoUrl={user.photo_url} />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[8rem] truncate text-sm font-semibold leading-tight lg:max-w-[12rem]">{user.name}</span>
          <span className="flex items-center gap-1 text-[11px] text-muted"><RoleIcon role={user.role} boxed={false} />{user.role}</span>
        </span>
        <svg viewBox="0 0 20 20" className={`hidden h-4 w-4 shrink-0 text-muted transition-transform sm:block ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[var(--menu-shadow)]"
        >
          <NavLink
            role="menuitem"
            to="/profile"
            className="block px-3.5 py-2.5 text-sm font-semibold text-ink hover:bg-surface-2"
            onClick={() => setOpen(false)}
          >
            Profile
          </NavLink>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3.5 py-2.5 text-left text-sm font-semibold text-danger hover:bg-danger-soft"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  const [flip, setFlip] = useState(false);
  const minuteKey = useRef(`${now.getHours()}:${now.getMinutes()}`);

  useEffect(() => {
    const tick = () => {
      const next = new Date();
      const key = `${next.getHours()}:${next.getMinutes()}`;
      if (key !== minuteKey.current) {
        minuteKey.current = key;
        setFlip(true);
        window.setTimeout(() => setFlip(false), 380);
      }
      setNow(next);
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clockDate = now.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const clockTime = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const progress = ((now.getSeconds() * 1000) + now.getMilliseconds()) / 60000;

  return (
    <time
      dateTime={now.toISOString()}
      className="header-clock hidden text-right leading-tight md:block"
      title={now.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", hour12: true })}
    >
      <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{clockDate}</span>
      <span className={`mt-0.5 block overflow-hidden text-sm font-semibold tabular-nums text-ink ${flip ? "clock-flip" : ""}`}>
        {clockTime}
      </span>
      <span className="mt-1.5 ml-auto block h-[2px] w-14 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <span
          className="block h-full w-full origin-left rounded-full bg-blue transition-transform duration-1000 ease-linear"
          style={{ transform: `scaleX(${Math.max(0.02, progress)})` }}
        />
      </span>
    </time>
  );
}

function TriageNavLink({ token, pathname }: { token: string; pathname: string }) {
  const { clinicId } = useActiveClinic();
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function load() {
      const params = new URLSearchParams({ page: "1", page_size: "1" });
      if (clinicId) params.set("clinic_id", clinicId);
      api<TriageQueueResult>(`/api/triage/queue?${params}`, {}, token)
        .then((data) => {
          if (!cancelled) setWaiting(data.summary.waiting_for_triage);
        })
        .catch(() => {
          if (!cancelled) setWaiting(0);
        });
    }
    load();
    const timer = window.setInterval(load, 30000);
    function onFocus() {
      load();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [token, clinicId, pathname]);

  return (
    <NavLink
      to="/patients/triage"
      className={({ isActive }) => `${navClass({ isActive })} justify-between gap-2`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <TriageIcon />
        <span className="leading-snug">Patient Queue & Triage</span>
      </span>
      {waiting > 0 ? (
        <span
          className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold tabular-nums text-white"
          aria-label={`${waiting} waiting for triage`}
        >
          {waiting > 99 ? "99+" : waiting}
        </span>
      ) : null}
    </NavLink>
  );
}

function DoctorCasesNavLink({ token, pathname }: { token: string; pathname: string }) {
  const { clinicId } = useActiveClinic();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function load() {
      const params = new URLSearchParams({ page: "1", page_size: "1" });
      if (clinicId) params.set("clinic_id", clinicId);
      api<DoctorCasePage>(`/api/doctor-cases?${params}`, {}, token)
        .then((data) => {
          if (!cancelled) setCount(data.total);
        })
        .catch(() => {
          if (!cancelled) setCount(0);
        });
    }
    load();
    const timer = window.setInterval(load, 30000);
    function onFocus() {
      load();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [token, clinicId, pathname]);

  return (
    <NavLink
      to="/patients/to-doctor"
      className={({ isActive }) => `${navClass({ isActive })} justify-between gap-2`}
    >
      {({ isActive }) => (
        <>
          <span className="flex min-w-0 items-center gap-3">
            <ToDoctorIcon />
            <span className="leading-snug">To doctor</span>
          </span>
          {count > 0 ? (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${isActive ? "bg-white text-blue" : "bg-blue text-white"}`}
              aria-label={`${count} sent to a doctor`}
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

function NavSection({ title, show = true, children }: { title: string; show?: boolean; children: ReactNode }) {
  if (!show) return null;
  return (
    <div className="first:mt-0 mt-5">
      <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? "bg-blue text-white" : "text-slate-300 hover:bg-white/5"}`;
}

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function heading(pathname: string) {
  const [section, id, action] = pathname.split("/").filter(Boolean);
  if (!section) return "Dashboard";
  if (section === "profile") return "My profile";
  if (section === "activity") return "Activity";
  if (section === "roles") {
    if (!id) return "Roles";
    if (id === "new") return "New role";
    if (action === "edit") return "Edit role";
    return "Role";
  }
  if (section === "users" && action === "permissions") return "Edit permissions";
  if (section === "patients") {
    if (!id) return "Patients";
    if (id === "visits") return "Visits";
    if (id === "triage") return "Triage";
    if (id === "to-doctor") return "To doctor";
    if (id === "register") return "Register";
    if (id === "new") return "New patient";
    if (action === "edit") return "Edit patient";
    if (action === "visits") {
      const visitAction = pathname.split("/").filter(Boolean)[4];
      if (!visitAction) return "Visit";
      if (visitAction === "new") return "New visit";
      if (pathname.endsWith("/edit")) return "Edit visit";
      return "Visit";
    }
    return "Patient";
  }
  const name = section === "users" ? "Users" : section === "hotels" ? "Hotels" : section === "clinics" ? "Clinics" : section;
  if (!id) return name;
  if (id === "new") return `New ${name.slice(0, -1).toLowerCase()}`;
  if (action === "edit") return `Edit ${name.slice(0, -1).toLowerCase()}`;
  return name.slice(0, -1);
}

function MenuIcon() {
  return <Icon><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></Icon>;
}

function CloseIcon() {
  return <Icon><path d="M6 6l12 12" /><path d="M18 6l-12 12" /></Icon>;
}

function RolesIcon() {
  return <Icon><path d="M8 11V8a4 4 0 0 1 8 0v3" /><rect x="6" y="11" width="12" height="9" rx="2" /></Icon>;
}

function ActivityIcon() {
  return <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></Icon>;
}

function DashboardIcon() {
  return <Icon><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Icon>;
}

function UsersIcon() {
  return <Icon><path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" /><circle cx="10" cy="8" r="3" /><path d="M20 19v-1a3.5 3.5 0 0 0-2.5-3.3" /><path d="M16 5.1a3 3 0 0 1 0 5.8" /></Icon>;
}

function HotelIcon() {
  return <Icon><path d="M4 20V8l8-4 8 4v12" /><path d="M9 20v-6h6v6" /><path d="M4 12h16" /></Icon>;
}

function ClinicIcon() {
  return <Icon><path d="M12 6v12" /><path d="M6 12h12" /><rect x="4" y="4" width="16" height="16" rx="3" /></Icon>;
}

function PatientsIcon() {
  return <Icon><path d="M8 19v-1a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v1" /><circle cx="12" cy="8" r="3" /><path d="M4 19v-1a3 3 0 0 1 2-2.8" /><path d="M20 19v-1a3 3 0 0 0-2-2.8" /><path d="M6.5 8.5a2.5 2.5 0 1 1 0-0.01" /><path d="M17.5 8.5a2.5 2.5 0 1 1 0-0.01" /></Icon>;
}

function VisitsIcon() {
  return <Icon><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M4 10h16" /><path d="M9 14h6" /></Icon>;
}

function ToDoctorIcon() {
  return <Icon><path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" /><circle cx="10" cy="8" r="3" /><path d="M18 7v6" /><path d="M15 10h6" /></Icon>;
}

function TriageIcon() {
  return <Icon><path d="M12 4v16" /><path d="M4 12h16" /><circle cx="12" cy="12" r="8" /></Icon>;
}

function RegisterIcon() {
  return <Icon><path d="M8 4h8a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z" /><path d="M9 10h6" /><path d="M9 14h4" /></Icon>;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
