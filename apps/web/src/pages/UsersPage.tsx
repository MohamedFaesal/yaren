import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type Clinic, type User } from "../api";
import { canAct } from "../access";
import { DataTable, Filters, IconAction, Page, PlusIcon, RoleLabel, SearchSelect, Status, field, label, messageOf, primary, roleOption, th, typeLabel } from "./ui";

const typeOptions = [
  { value: "", label: "All types" },
  { value: "super-admin", label: "Super admin" },
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
];
const roleOptions = [
  { value: "", label: "All roles" },
  roleOption("Doctor"),
  roleOption("Nurse"),
  roleOption("Receptionist"),
  roleOption("Accountant"),
  roleOption("CEO"),
  roleOption("CTO"),
];
const statusOptions = [
  { value: "", label: "Any status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export function UsersPage({ token, actor }: { token: string; actor: User }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [clinic, setClinic] = useState("");
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canCreate = canAct(actor, "user", "create");
  const clinicChoices = [
    { value: "", label: "Any clinic" },
    { value: "all", label: "All clinics" },
    ...clinics.map((item) => ({ value: item.id, label: item.name })),
  ];
  const filtered = rows.filter((row) => {
    const names = row.clinics?.all ? "all clinics" : (row.clinics?.items.map((item) => item.name).join(" ") ?? "");
    const haystack = `${row.name} ${row.email} ${row.phone} ${names}`.toLowerCase();
    const matchesQuery = haystack.includes(query.trim().toLowerCase());
    const matchesType = !type || row.type === type;
    const matchesRole = !role || row.role === role;
    const matchesStatus = !status || (status === "active" ? row.is_active : !row.is_active);
    const matchesClinic = !clinic || (clinic === "all" ? Boolean(row.clinics?.all) : Boolean(row.clinics?.all || row.clinics?.items.some((item) => item.id === clinic)));
    return matchesQuery && matchesType && matchesRole && matchesStatus && matchesClinic;
  });

  useEffect(() => {
    api<User[]>("/api/users", {}, token).then(setRows).catch((caught) => setError(messageOf(caught)));
    api<Clinic[]>("/api/clinics", {}, token).then(setClinics).catch(() => setClinics([]));
  }, [token]);

  return (
    <Page
      title="Users"
      description="Staff and administrator accounts for Yaren clinics."
      crumbs={[{ label: "Directory" }, { label: "Users" }]}
      action={canCreate ? <Link to="/users/new" className={primary}><PlusIcon />Create user</Link> : null}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Filters>
        <label className={label}>Search<input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email, or phone" /></label>
        <label className={label}>Type<SearchSelect value={type} onChange={setType} options={typeOptions} placeholder="All types" /></label>
        <label className={label}>Role<SearchSelect value={role} onChange={setRole} options={roleOptions} placeholder="All roles" /></label>
        <label className={label}>Status<SearchSelect value={status} onChange={setStatus} options={statusOptions} placeholder="Any status" /></label>
        <label className={label}>Clinic<SearchSelect value={clinic} onChange={setClinic} options={clinicChoices} placeholder="Any clinic" /></label>
      </Filters>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{filtered.length} shown</p>
      <DataTable>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>Name</th>
            <th className={th}>Email</th>
            <th className={th}>Phone</th>
            <th className={th}>Type</th>
            <th className={th}>Role</th>
            <th className={th}>Clinics</th>
            <th className={th}>Status</th>
            <th className={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td className="px-4 py-8 text-muted" colSpan={8}>{rows.length === 0 ? "No users yet." : "No users match these filters."}</td></tr>
          ) : filtered.map((row) => (
            <tr key={row.id} className="cursor-pointer border-t border-line-soft hover:bg-surface-2" onClick={() => navigate(`/users/${row.id}`)}>
              <td className="px-4 py-3 font-semibold">{row.name}</td>
              <td className="px-4 py-3">{row.email}</td>
              <td className="px-4 py-3">{row.phone}</td>
              <td className="px-4 py-3">{typeLabel(row.type)}</td>
              <td className="px-4 py-3"><RoleLabel role={row.role} /></td>
              <td className="px-4 py-3"><ClinicAccess clinics={row.clinics} /></td>
              <td className="px-4 py-3"><Status active={row.is_active} /></td>
              <td className="px-4 py-3">
                <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                  <IconAction kind="view" to={`/users/${row.id}`} />
                  {canAct(actor, "user", "update", { ownerId: row.created_by }) && row.type !== "super-admin" ? <IconAction kind="edit" to={`/users/${row.id}/edit`} /> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Page>
  );
}

function ClinicAccess({ clinics }: { clinics: User["clinics"] }) {
  if (clinics?.all) return <span className="rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-blue">All clinics</span>;
  if (!clinics || clinics.items.length === 0) return <span className="text-sm text-muted">None</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {clinics.items.map((item) => <span key={item.id} className="rounded-full bg-surface-3 px-2.5 py-1 text-xs text-ink">{item.name}</span>)}
    </div>
  );
}
