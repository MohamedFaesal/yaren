import { useState } from "react";
import { resolveTheme, setTheme, type Theme } from "./theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());
  const next: Theme = theme === "light" ? "dark" : "light";
  const label = next === "dark" ? "Switch to dark theme" : "Switch to light theme";

  return (
    <button
      type="button"
      className={`inline-grid h-10 w-10 place-items-center rounded-xl border border-panel-strong bg-panel text-blue shadow-sm transition-colors hover:bg-panel-strong hover:text-blue-strong ${className}`}
      aria-label={label}
      title={label}
      onClick={() => {
        setTheme(next);
        setThemeState(next);
      }}
    >
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z" />
    </svg>
  );
}
