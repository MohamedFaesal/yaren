import { translate, useLanguage } from "./i18n";

export function Field({ label, value, onChange, secret = false }: { label: string; value: string; onChange: (value: string) => void; secret?: boolean }) {
  const { lang } = useLanguage();
  return <label>{translate(lang, label)}<input type={secret ? "password" : "text"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" /></label>;
}

export function Text({ value }: { value: string }) {
  const { lang } = useLanguage();
  return <>{translate(lang, value)}</>;
}
