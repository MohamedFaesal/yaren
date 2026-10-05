import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type AccessRole, type Clinic, type Permission } from "../api";
import { permissionTitle } from "../access";
import { useToast } from "../toast";
import { Card, Field, Page, PlusIcon, field, messageOf, primary, secondary, useFieldErrors } from "./ui";

const resources = [
  { id: "user", label: "Users" },
  { id: "hotel", label: "Hotels" },
  { id: "clinic", label: "Clinics" },
  { id: "patient", label: "Patients" },
  { id: "visit", label: "Visits" },
  { id: "activity", label: "Activity" },
  { id: "role", label: "Roles" },
];

export function RoleFormPage({ token }: { token: string }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const fields = useFieldErrors();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [open, setOpen] = useState<string[]>(["user"]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<Permission[]>("/api/permissions", {}, token).then(setCatalog).catch((caught) => setError(messageOf(caught)));
    api<Clinic[]>("/api/clinics", {}, token).then(setClinics).catch((caught) => setError(messageOf(caught)));
    if (!id) return;
    api<AccessRole>(`/api/roles/${id}`, {}, token).then((role) => {
      setName(role.name);
      setDescription(role.description);
      setSelected(role.permission_ids);
    }).catch((caught) => setError(messageOf(caught)));
  }, [id, token]);

  function toggle(permission: Permission) {
    const manageId = `${permission.resource}.manage.all`;
    setSelected((current) => {
      if (permission.action === "manage") {
        if (current.includes(permission.id)) return current.filter((item) => item !== permission.id);
        return [...current.filter((item) => !item.startsWith(`${permission.resource}.`)), permission.id];
      }
      if (current.includes(manageId)) return current;
      return current.includes(permission.id) ? current.filter((item) => item !== permission.id) : [...current, permission.id];
    });
  }

  return (
    <Page
      title={id ? "Edit role" : "New role"}
      description="Pick the actions this role includes. Manage all already covers the separate actions in that area."
      crumbs={id
        ? [{ label: "Roles", to: "/roles" }, { label: name || "Role", to: `/roles/${id}` }, { label: "Edit" }]
        : [{ label: "Roles", to: "/roles" }, { label: "New role" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Card>
        <form
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (!fields.validateForm(event.currentTarget)) return;
            setPending(true);
            setError(null);
            try {
              const body = { name, description, permission_ids: selected };
              if (id) {
                await api(`/api/roles/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
                toast.success("Role updated", `${name} was saved.`);
                navigate(`/roles/${id}`);
              } else {
                const created = await api<{ id: string }>("/api/roles", { method: "POST", body: JSON.stringify(body) }, token);
                toast.success("Role created", `${name} was added.`);
                navigate(`/roles/${created.id}`);
              }
            } catch (caught) {
              const message = messageOf(caught);
              const mapped = fields.applyServerMessage(message);
              setError(Object.keys(mapped).length ? null : message);
              toast.error("Couldn't save role", message);
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" error={fields.errorOf("name")}>
              <input className={field} name="name" value={name} onChange={(event) => { setName(event.target.value); fields.clearField("name"); }} placeholder="Clinic lead" required />
            </Field>
            <Field label="Description" error={fields.errorOf("description")}>
              <input className={field} name="description" value={description} onChange={(event) => { setDescription(event.target.value); fields.clearField("description"); }} placeholder="What this role is for" />
            </Field>
          </div>
          <div className="mt-6 space-y-3">
            {resources.map((resource) => {
              const items = catalog.filter((item) => item.resource === resource.id);
              const manageOn = selected.includes(`${resource.id}.manage.all`);
              const chosen = items.filter((item) => selected.includes(item.id) || (manageOn && item.action !== "manage"));
              const expanded = open.includes(resource.id);
              return (
                <section key={resource.id} className="overflow-hidden rounded-xl border border-line-soft">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2"
                    onClick={() => setOpen((current) => current.includes(resource.id) ? current.filter((item) => item !== resource.id) : [...current, resource.id])}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-ink">{resource.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">{summary(chosen, manageOn, resource.id === "clinic" || resource.id === "patient" || resource.id === "visit")}</span>
                    </span>
                    <span className="text-sm text-muted">{expanded ? "Hide" : "Show"}</span>
                  </button>
                  {expanded ? <div className="border-t border-line-soft px-3 py-3">
                  {items.length === 0 ? <p className="text-sm text-muted">Loading permissions</p> : (
                    <div className="space-y-2">
                      {items.map((item) => {
                        const on = selected.includes(item.id);
                        const covered = manageOn && item.action !== "manage";
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={covered}
                            aria-pressed={on || covered}
                            onClick={() => toggle(item)}
                            className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left ${on || covered ? "border-panel-strong bg-panel" : "border-line-soft hover:border-line-strong"} ${covered ? "cursor-default" : ""}`}
                          >
                            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-xs ${on || covered ? "border-blue bg-blue text-white" : "border-line-strong bg-surface"}`}>{on || covered ? "✓" : ""}</span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-ink">{permissionTitle(item)}</span>
                              <span className="mt-0.5 block text-sm text-muted-strong">{item.description}</span>
                              {covered ? <span className="mt-1 block text-xs font-medium text-blue">Included in Manage all</span> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {resource.id === "clinic" || resource.id === "patient" || resource.id === "visit" ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted">Clinics</span>
                      {clinics.length === 0 ? <span className="text-sm text-muted">No clinics yet</span> : clinics.map((clinic) => (
                        <span key={clinic.id} className="rounded-full bg-surface-3 px-3 py-1 text-sm text-ink">{clinic.name}</span>
                      ))}
                    </div>
                  ) : null}
                  </div> : null}
                </section>
              );
            })}
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">{selected.length === 0 ? "Choose at least one permission" : `${selected.length} selected`}</p>
            <div className="flex gap-2">
              <Link className={secondary} to={id ? `/roles/${id}` : "/roles"}>{id ? "Cancel" : "Back"}</Link>
              <button className={primary} disabled={pending || selected.length === 0}>{pending ? "Saving" : id ? "Save role" : <><PlusIcon />Create role</>}</button>
            </div>
          </div>
        </form>
      </Card>
    </Page>
  );
}

function summary(chosen: { action: string; resource: string; ownership: string }[], manageOn: boolean, clinic: boolean) {
  const scope = clinic ? " · clinics chosen per person" : "";
  if (manageOn) return `Manage all${scope}`;
  if (chosen.length === 0) return `Nothing selected${scope}`;
  const names = chosen.slice(0, 2).map((item) => permissionTitle(item));
  const extra = chosen.length > 2 ? ` and ${chosen.length - 2} more` : "";
  return `${names.join(", ")}${extra}${scope}`;
}
