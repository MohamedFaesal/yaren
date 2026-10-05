export type Theme = "light" | "dark";

const storageKey = "yaren.theme";

export function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function preferredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(stored: Theme | null = readStoredTheme()): Theme {
  return stored ?? preferredTheme();
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // Ignore private-mode storage failures; the session still switches.
  }
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(resolveTheme());
}
