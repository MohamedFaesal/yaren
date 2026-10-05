import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type Role, type User, type UserType } from "../api";
import { canAct } from "../access";
import { useToast } from "../toast";
import { Card, Field, Page, PlusIcon, RoleLabel, SearchSelect, Section, Summary, field, messageOf, primary, roleOption, secondary, useFieldErrors } from "./ui";

const typeOptions = [
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
];
const roleOptions = ["Doctor", "Nurse", "Receptionist", "Accountant", "CEO", "CTO"].map((role) => roleOption(role));

export function UserFormPage({ token, actor }: { token: string; actor: User }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const fields = useFieldErrors();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [type, setType] = useState<Exclude<UserType, "super-admin">>("staff");
  const [role, setRole] = useState<Role>("Receptionist");
  const [isActive, setIsActive] = useState(true);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const canWrite = !locked && (id ? canAct(actor, "user", "update", { ownerId }) : canAct(actor, "user", "create"));

  useEffect(() => {
    if (!id) return;
    api<User>(`/api/users/${id}`, {}, token).then((user) => {
      setName(user.name);
      setEmail(user.email);
      setPhone(user.phone);
      setRole(user.role);
      setIsActive(user.is_active);
      setOwnerId(user.created_by);
      setLocked(user.type === "super-admin");
      if (user.type !== "super-admin") setType(user.type);
    }).catch((caught) => setError(messageOf(caught)));
  }, [id, token]);

  return (
    <Page
      title={id ? "Edit user" : "New user"}
      description={id ? "Update this account. Leave the password blank to keep the current one." : "Add an administrator or a staff member. Super admins are created manually."}
      crumbs={id
        ? [{ label: "Users", to: "/users" }, { label: name || "User", to: `/users/${id}` }, { label: "Edit" }]
        : [{ label: "Users", to: "/users" }, { label: "New user" }]}
      >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <form
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              if (!canWrite) return;
              if (!fields.validateForm(event.currentTarget)) return;
              setPending(true);
              setError(null);
              try {
                const body = { name, email, phone, type, role, is_active: isActive, ...(password ? { password } : {}) };
                if (id) {
                  await api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
                  toast.success("User updated", `${name} was saved.`);
                  navigate(`/users/${id}`);
                } else {
                  const created = await api<{ id: string }>("/api/users", { method: "POST", body: JSON.stringify({ ...body, password }) }, token);
                  toast.success("User created", `${name} was added to the directory.`);
                  navigate(`/users/${created.id}`);
                }
              } catch (caught) {
                const message = messageOf(caught);
                const mapped = fields.applyServerMessage(message);
                setError(Object.keys(mapped).length ? null : message);
                toast.error("Couldn't save user", message);
              } finally {
                setPending(false);
              }
            }}
          >
            <Section index="1" title="Personal information" />
            {locked ? <p className="mb-4 text-sm text-muted">A super admin is created manually and cannot be edited here.</p> : null}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name" error={fields.errorOf("name")}>
                <input className={field} name="name" value={name} onChange={(event) => { setName(event.target.value); fields.clearField("name"); }} placeholder="Ahmed Shams" required disabled={!canWrite} />
              </Field>
              <Field label="Email" error={fields.errorOf("email")}>
                <input className={field} name="email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); fields.clearField("email"); }} placeholder="ahmed.shams@yaren.health" required disabled={!canWrite} />
              </Field>
              <Field label="Phone" error={fields.errorOf("phone")}>
                <input className={field} name="phone" value={phone} onChange={(event) => { setPhone(event.target.value); fields.clearField("phone"); }} placeholder="01012345678" required disabled={!canWrite} />
              </Field>
              <Field label="Password" error={fields.errorOf("password")}>
                <input
                  className={field}
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); fields.clearField("password"); }}
                  placeholder={id ? "Leave blank to keep the current password" : "At least 8 characters"}
                  required={!id}
                  minLength={id ? undefined : 8}
                  disabled={!canWrite}
                />
              </Field>
            </div>
            <div className="mt-6"><Section index="2" title="Access" /></div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Type" error={fields.errorOf("type")}>
                <SearchSelect
                  name="type"
                  value={type}
                  onChange={(value) => { setType(value as typeof type); fields.clearField("type"); }}
                  options={typeOptions}
                  placeholder="Search for a type"
                  disabled={!canWrite}
                  required
                />
              </Field>
              <Field label="Position" error={fields.errorOf("role")}>
                <SearchSelect
                  name="role"
                  value={role}
                  onChange={(value) => { setRole(value as Role); fields.clearField("role"); }}
                  options={roleOptions}
                  placeholder="Search for a position"
                  disabled={!canWrite}
                  required
                />
              </Field>
              <div className="md:col-span-2">
                <p className="block text-[13px] font-medium text-muted-strong">Status</p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  disabled={!canWrite}
                  onClick={() => setIsActive((current) => !current)}
                  className="mt-1 inline-flex items-center gap-3 rounded-xl border border-line-soft px-3 py-2.5 text-left disabled:opacity-60"
                >
                  <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${isActive ? "bg-success" : "bg-line-strong"}`}>
                    <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow transition-transform ${isActive ? "translate-x-5" : "translate-x-0.5"}`} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{isActive ? "Active" : "Inactive"}</span>
                    <span className="block text-xs text-muted-strong">{isActive ? "This person can sign in" : "This person cannot sign in"}</span>
                  </span>
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Link className={secondary} to={id ? `/users/${id}` : "/users"}>{id ? "Cancel" : "Back"}</Link>
              <button className={primary} disabled={pending || !canWrite}>{pending ? "Saving" : id ? "Save user" : <><PlusIcon />Create user</>}</button>
            </div>
          </form>
        </Card>
        <Summary
          title={name || "New user"}
          lines={[email || "Email not set", phone || "Phone not set", <RoleLabel role={role} />, isActive ? "Active" : "Inactive"]}
        />
      </div>
    </Page>
  );
}
