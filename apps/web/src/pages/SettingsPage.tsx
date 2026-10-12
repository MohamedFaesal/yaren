import { useEffect, useState, type FormEvent } from "react";
import { api, type Clinic, type GeneralSettings } from "../api";
import { useToast } from "../toast";
import { Card, Field, Page, SearchSelect, field, messageOf, primary, secondary, useFieldErrors } from "./ui";

const emptySettings: GeneralSettings = { triage_wait_minutes: 20, doctor_wait_minutes: 20, clinics: [] };

export function SettingsPage({ token }: { token: string }) {
  const toast = useToast();
  const fields = useFieldErrors();
  const [settings, setSettings] = useState<GeneralSettings>(emptySettings);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [scope, setScope] = useState("");
  const [triageWait, setTriageWait] = useState("20");
  const [doctorWait, setDoctorWait] = useState("20");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  const override = settings.clinics.find((item) => item.clinic_id === scope) ?? null;
  const clinic = clinics.find((item) => item.id === scope) ?? null;

  useEffect(() => {
    Promise.all([
      api<GeneralSettings>("/api/settings", {}, token),
      api<Clinic[]>("/api/clinics", {}, token),
    ])
      .then(([nextSettings, nextClinics]) => {
        setSettings(nextSettings);
        setClinics(nextClinics.filter((item) => !item.deleted_at));
        applyScope("", nextSettings);
        setReady(true);
      })
      .catch((caught) => setError(messageOf(caught)));
  }, [token]);

  function applyScope(nextScope: string, source = settings) {
    const row = source.clinics.find((item) => item.clinic_id === nextScope);
    setScope(nextScope);
    setTriageWait(String(row?.triage_wait_minutes ?? source.triage_wait_minutes));
    setDoctorWait(String(row?.doctor_wait_minutes ?? source.doctor_wait_minutes));
    fields.clearAll();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const triage = Number(triageWait);
    const doctor = Number(doctorWait);
    const nextErrors: Record<string, string> = {};
    if (!Number.isInteger(triage) || triage < 1 || triage > 720) nextErrors.triage_wait_minutes = "Enter 1 to 720 minutes";
    if (!Number.isInteger(doctor) || doctor < 1 || doctor > 720) nextErrors.doctor_wait_minutes = "Enter 1 to 720 minutes";
    if (Object.keys(nextErrors).length > 0) {
      fields.setErrors(nextErrors);
      return;
    }
    fields.clearAll();
    setPending(true);
    setError(null);
    try {
      const saved = await api<GeneralSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          clinic_id: scope || null,
          triage_wait_minutes: triage,
          doctor_wait_minutes: doctor,
        }),
      }, token);
      setSettings(saved);
      applyScope(scope, saved);
      toast.success("Settings saved", scope ? `Waiting times for ${clinic?.name ?? "this clinic"} were updated.` : "Waiting times for all clinics were updated.");
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setPending(false);
    }
  }

  async function useAllClinics() {
    if (!scope) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/settings/clinics/${scope}`, { method: "DELETE" }, token);
      const saved = await api<GeneralSettings>("/api/settings", {}, token);
      setSettings(saved);
      applyScope(scope, saved);
      toast.success("Using all clinics", `${clinic?.name ?? "This clinic"} now uses the shared waiting times.`);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Page
      title="General settings"
      description="Times that mark a wait as longer than expected. A clinic can keep its own times."
      crumbs={[{ label: "System" }, { label: "General settings" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <form onSubmit={(event) => void onSubmit(event)} className="max-w-xl">
        <Card>
          <Field label="Applies to">
            <SearchSelect
              value={scope}
              onChange={(value) => applyScope(value)}
              disabled={!ready || pending}
              placeholder="All clinics"
              options={[
                { value: "", label: "All clinics" },
                ...clinics.map((item) => ({ value: item.id, label: item.name, hint: item.hotel_name })),
              ]}
            />
          </Field>
          <p className="mt-3 text-sm text-muted-strong">
            {scope
              ? override
                ? `${clinic?.name ?? "This clinic"} uses its own times.`
                : `${clinic?.name ?? "This clinic"} uses the times for all clinics until you save.`
              : "These times are used by every clinic that does not have its own."}
          </p>
          <div className="mt-4 space-y-4">
            <Field label="Average waiting time to triage" hint="Minutes from registration until triage." error={fields.errorOf("triage_wait_minutes")}>
              <input
                className={field}
                type="number"
                min={1}
                max={720}
                value={triageWait}
                disabled={!ready || pending}
                onChange={(event) => { setTriageWait(event.target.value); fields.clearField("triage_wait_minutes"); }}
              />
            </Field>
            <Field label="Average waiting time to see a doctor" hint="Minutes from triage until the patient sees the doctor." error={fields.errorOf("doctor_wait_minutes")}>
              <input
                className={field}
                type="number"
                min={1}
                max={720}
                value={doctorWait}
                disabled={!ready || pending}
                onChange={(event) => { setDoctorWait(event.target.value); fields.clearField("doctor_wait_minutes"); }}
              />
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="submit" className={primary} disabled={!ready || pending}>{pending ? "Saving" : "Save settings"}</button>
            {override ? (
              <button type="button" className={secondary} disabled={pending} onClick={() => void useAllClinics()}>Use all clinics</button>
            ) : null}
          </div>
        </Card>
      </form>
    </Page>
  );
}
