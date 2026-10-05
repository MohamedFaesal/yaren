import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { api, type Session } from "../api";
import { label, useFieldErrors } from "./ui";

const rememberedEmailKey = "yaren.rememberedEmail";

export function LoginPage({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const navigate = useNavigate();
  const fields = useFieldErrors();
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(rememberedEmailKey) ?? "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return Boolean(localStorage.getItem(rememberedEmailKey));
    } catch {
      return false;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
      <aside className="relative hidden min-h-screen overflow-hidden lg:block">
        <img
          src="/login-hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07111c]/85 via-[#0b1c2e]/45 to-[#0b1c2e]/25" />
        <div className="relative flex h-full flex-col justify-between px-10 py-10 text-white xl:px-14">
          <div className="flex items-center gap-3">
            <img src="/yaren-logo.png" alt="Yaren Healthcare" className="h-11 w-auto rounded-lg bg-white px-2 py-1.5" />
            <div>
              <p className="text-sm font-bold tracking-[0.18em] text-white">YAREN</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">Healthcare</p>
            </div>
          </div>

          <div className="max-w-xl">
            <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
              Healthcare Where People Belong
            </h1>
            <p className="mt-4 max-w-md text-base text-white/85">
              Trusted medical care for hotels, resorts and tourism destinations.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
            <FeatureTile icon={<PeopleIcon />} label="Hotel & Resort Clinics" />
            <FeatureTile icon={<ShieldIcon />} label="High Quality Care" />
            <FeatureTile icon={<ClockIcon />} label="Fast & Efficient Service" />
            <FeatureTile icon={<PalmIcon />} label="International Guests" />
          </div>
        </div>
      </aside>

      <div className="relative flex min-h-screen flex-col bg-surface px-5 py-6 sm:px-8">
        <div className="mb-6 flex items-center justify-between lg:mb-0 lg:justify-end">
          <img src="/yaren-logo.png" alt="Yaren Healthcare" className="h-10 w-auto lg:hidden" />
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm font-medium text-muted-strong">
            <GlobeIcon />
            English
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-6">
          <form
            noValidate
            className="w-full max-w-[380px]"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!fields.validateForm(event.currentTarget)) return;
              setPending(true);
              setError(null);
              setInfo(null);
              try {
                const session = await api<Session>("/api/auth/login", {
                  method: "POST",
                  body: JSON.stringify({ email, password }),
                });
                try {
                  if (rememberMe) localStorage.setItem(rememberedEmailKey, email.trim());
                  else localStorage.removeItem(rememberedEmailKey);
                } catch {
                  // Ignore storage failures.
                }
                onSuccess(session);
                navigate("/");
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Sign in failed");
              } finally {
                setPending(false);
              }
            }}
          >
            <div className="mb-8 hidden text-center lg:block">
              <img src="/yaren-logo.png" alt="Yaren Healthcare" className="mx-auto h-14 w-auto" />
            </div>

            <div className="text-center">
              <h2 className="text-3xl font-bold text-ink">Welcome Back</h2>
              <p className="mt-2 text-sm text-muted">Sign in to your account to continue</p>
            </div>

            <div className="mt-8">
              <label className={label} htmlFor="login-email">Username or Email</label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted">
                  <UserIcon />
                </span>
                <input
                  id="login-email"
                  className={`w-full rounded-xl border bg-surface py-3 pl-11 pr-3 text-sm text-ink outline-none focus:border-blue disabled:bg-surface-3 ${fields.errorOf("email") ? "border-danger" : "border-line-strong"}`}
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    fields.clearField("email");
                  }}
                  placeholder="Username or Email"
                  required
                  autoComplete="username"
                  aria-invalid={Boolean(fields.errorOf("email")) || undefined}
                />
              </div>
              {fields.errorOf("email") ? <p className="mt-1 text-sm font-medium text-danger" role="alert">{fields.errorOf("email")}</p> : null}
            </div>

            <div className="mt-4">
              <label className={label} htmlFor="login-password">Password</label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted">
                  <LockIcon />
                </span>
                <input
                  id="login-password"
                  className={`w-full rounded-xl border bg-surface py-3 pl-11 pr-11 text-sm text-ink outline-none focus:border-blue disabled:bg-surface-3 ${fields.errorOf("password") ? "border-danger" : "border-line-strong"}`}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    fields.clearField("password");
                  }}
                  placeholder="Password"
                  required
                  autoComplete="current-password"
                  aria-invalid={Boolean(fields.errorOf("password")) || undefined}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-2 grid w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {fields.errorOf("password") ? <p className="mt-1 text-sm font-medium text-danger" role="alert">{fields.errorOf("password")}</p> : null}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-strong">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line-strong text-blue accent-[var(--blue)]"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                />
                Remember me
              </label>
              <button
                type="button"
                className="text-sm font-semibold text-blue hover:text-blue-strong"
                onClick={() => setInfo("Contact IT Support to reset your password.")}
              >
                Forgot password?
              </button>
            </div>

            {error ? <p className="mt-4 text-sm text-danger" role="alert">{error}</p> : null}
            {info ? <p className="mt-4 text-sm text-muted-strong" role="status">{info}</p> : null}

            <button
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue py-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-strong disabled:opacity-60"
              disabled={pending}
            >
              {pending ? "Signing in" : <>Sign In <ArrowIcon /></>}
            </button>
          </form>
        </div>

        <div className="mt-auto flex flex-col gap-3 border-t border-line-soft pt-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2">
            <HelpIcon />
            Need Help? Contact IT Support
          </p>
          <p className="inline-flex items-center gap-2">
            <LockIcon />
            Secure Access. All data is encrypted
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureTile({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex aspect-square flex-col items-center justify-center rounded-2xl bg-black/40 px-3 py-4 text-center backdrop-blur-md ring-1 ring-white/15">
      <div className="grid h-14 w-14 place-items-center text-white xl:h-16 xl:w-16">{icon}</div>
      <p className="mt-3 text-xs font-semibold leading-snug text-white xl:text-[13px]">{label}</p>
    </div>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5c1.8-3.2 4.2-4.8 7-4.8s5.2 1.6 7 4.8" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 4l16 16" strokeLinecap="round" />
      <path d="M9.5 9.6A3 3 0 0 0 14.4 14.5M7 7.4C4.8 8.8 3.2 11 2.5 12c0 0 3.5 6.5 9.5 6.5 1.7 0 3.2-.5 4.5-1.2M16.7 15.2C18.8 13.8 20.3 11.7 21.5 12c0 0-1.2-2.2-3.3-4" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12h12M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.8 2.5 13.2 0 16M12 4c-2.5 2.8-2.5 13.2 0 16" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M9.8 9.5a2.2 2.2 0 1 1 3.5 1.8c-.8.6-1.3 1-1.3 2.2" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" fill="currentColor" aria-hidden="true">
      <circle cx="15" cy="14" r="5" />
      <circle cx="33" cy="14" r="5" />
      <circle cx="24" cy="11" r="6" />
      <path d="M6 36c1.2-6 5.2-9.5 10.5-9.5S25.8 30 27 36H6Z" />
      <path d="M21 36c1.2-6 5.2-9.5 10.5-9.5S41.8 30 43 36H21Z" />
      <path d="M14.5 36c1.4-7.2 5.8-11 9.5-11s8.1 3.8 9.5 11H14.5Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" fill="currentColor" aria-hidden="true">
      <path d="M24 5 40 11.5v11.8c0 9.4-6.3 16.2-16 19.7-9.7-3.5-16-10.3-16-19.7V11.5L24 5Z" />
      <path d="M24 10v27.8c.4-.1.7-.3 1.1-.4 7-2.7 11.4-8 11.4-14.9V14.2L24 10Z" fill="rgba(255,255,255,0.22)" />
      <path d="M24 11v25" stroke="rgba(0,0,0,0.28)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="4" />
      <path d="M24 14v11l8 4.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="2.5" fill="currentColor" />
    </svg>
  );
}

function PalmIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" fill="currentColor" aria-hidden="true">
      <path d="M23 44V20h2v24h-2Z" />
      <path d="M24 20c-5-1.8-11.5-2.4-17-.5 5.5.2 10.5 2.8 14.2 6.8 1-2.4 2-4.5 2.8-6.3Z" />
      <path d="M24 20c5-1.8 11.5-2.4 17-.5-5.5.2-10.5 2.8-14.2 6.8-1-2.4-2-4.5-2.8-6.3Z" />
      <path d="M24 18c-3.2-5-6.4-9.8-4.8-14.5 3.5 3.8 4.4 8.8 4.8 13.2.4-4.4 1.3-9.4 4.8-13.2C30.4 8.2 27.2 13 24 18Z" />
      <path d="M22 44h4l1 2h-6l1-2Z" />
    </svg>
  );
}
