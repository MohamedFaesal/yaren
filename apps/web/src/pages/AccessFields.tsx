import { api, type AccessRole, type Clinic, type Permission, type UserAssignment, type UserGrant } from "../api";
import { permissionTitle } from "../access";
import { messageOf, secondary, SearchSelect } from "./ui";
import { useEffect, useState } from "react";

const groups = [
  { id: "user", label: "Users" },
  { id: "hotel", label: "Hotels" },
  { id: "clinic", label: "Clinics" },
  { id: "patient", label: "Patients" },
  { id: "visit", label: "Visits" },
  { id: "activity", label: "Activity" },
  { id: "role", label: "Roles" },
];

export function AccessFields({
  token,
  assignments,
  grants,
  onAssignments,
  onGrants,
  disabled,
}: {
  token: string;
  assignments: UserAssignment[];
  grants: UserGrant[];
  onAssignments: (value: UserAssignment[]) => void;
  onGrants: (value: UserGrant[]) => void;
  disabled?: boolean;
}) {
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [clinicNote, setClinicNote] = useState<string | null>(null);

  useEffect(() => {
    api<AccessRole[]>("/api/roles", {}, token).then(setRoles).catch(() => undefined);
    api<Permission[]>("/api/permissions", {}, token).then(setPermissions).catch(() => undefined);
    api<Clinic[]>("/api/clinics", {}, token).then(setClinics).catch((caught) => setClinicNote(messageOf(caught)));
  }, [token]);

  const permissionOptions = groups.flatMap((group) => permissions.filter((item) => item.resource === group.id).map((item) => ({
    value: item.id,
    label: permissionTitle(item),
    hint: item.description,
    group: group.label,
  })));

  return (
    <div className="mt-6 space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Permission roles</p>
          <button type="button" className={secondary} disabled={disabled} onClick={() => onAssignments([...assignments, { role_id: "", all_clinics: true, clinic_ids: [] }])}>Add role</button>
        </div>
        {assignments.length === 0 ? <p className="text-sm text-muted">No permission role yet. This person can sign in and see only their own account.</p> : null}
        <div className="space-y-3">
          {assignments.map((assignment, index) => {
            const role = roles.find((item) => item.id === assignment.role_id);
            return (
              <ChoiceCard
                key={`${assignment.role_id}-${index}`}
                label="Role"
                value={assignment.role_id}
                placeholder="Search for a role"
                options={roles.map((item) => ({ value: item.id, label: item.name, hint: item.description }))}
                detail={role?.description}
                disabled={disabled}
                onValue={(role_id) => update(assignments, index, { ...assignment, role_id }, onAssignments)}
                onRemove={() => onAssignments(assignments.filter((_, item) => item !== index))}
                clinics={role?.scopes_clinics ? clinics : null}
                clinicNote={clinicNote}
                allClinics={assignment.all_clinics}
                clinicIds={assignment.clinic_ids}
                onScope={(all_clinics, clinic_ids) => update(assignments, index, { ...assignment, all_clinics, clinic_ids }, onAssignments)}
              />
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Extra permissions</p>
          <button type="button" className={secondary} disabled={disabled} onClick={() => onGrants([...grants, { permission_id: "", all_clinics: true, clinic_ids: [] }])}>Add permission</button>
        </div>
        <p className="mb-3 text-sm text-muted">These add to the roles. They never remove an action a role already allows.</p>
        {grants.length === 0 ? <p className="text-sm text-muted">No extra permissions.</p> : null}
        <div className="space-y-3">
          {grants.map((grant, index) => {
            const permission = permissions.find((item) => item.id === grant.permission_id);
            return (
              <ChoiceCard
                key={`${grant.permission_id}-${index}`}
                label="Permission"
                value={grant.permission_id}
                placeholder="Search for a permission"
                options={permissionOptions}
                detail={permission?.description}
                disabled={disabled}
                onValue={(permission_id) => update(grants, index, { ...grant, permission_id }, onGrants)}
                onRemove={() => onGrants(grants.filter((_, item) => item !== index))}
                clinics={permission?.clinic_scoped ? clinics : null}
                clinicNote={clinicNote}
                allClinics={grant.all_clinics}
                clinicIds={grant.clinic_ids}
                onScope={(all_clinics, clinic_ids) => update(grants, index, { ...grant, all_clinics, clinic_ids }, onGrants)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({
  label,
  value,
  placeholder,
  options,
  detail,
  disabled,
  onValue,
  onRemove,
  clinics,
  clinicNote,
  allClinics,
  clinicIds,
  onScope,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string; hint?: string; group?: string }[];
  detail?: string;
  disabled?: boolean;
  onValue: (value: string) => void;
  onRemove: () => void;
  clinics: Clinic[] | null;
  clinicNote: string | null;
  allClinics: boolean;
  clinicIds: string[];
  onScope: (allClinics: boolean, clinicIds: string[]) => void;
}) {
  function toggleClinic(clinicId: string) {
    const ids = (clinics ?? []).map((clinic) => clinic.id);
    if (allClinics) {
      onScope(false, ids.filter((id) => id !== clinicId));
      return;
    }
    const next = clinicIds.includes(clinicId) ? clinicIds.filter((id) => id !== clinicId) : [...clinicIds, clinicId];
    if (ids.length > 0 && next.length >= ids.length) {
      onScope(true, []);
      return;
    }
    onScope(false, next);
  }

  return (
    <div className="rounded-xl border border-line-soft p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-strong">{label}</p>
          <SearchSelect value={value} onChange={onValue} options={options} placeholder={placeholder} disabled={disabled} required />
        </div>
        <button type="button" className={`${secondary} mt-6`} disabled={disabled} onClick={onRemove}>Remove</button>
      </div>
      {detail ? <p className="mt-2 text-sm text-muted-strong">{detail}</p> : null}
      {clinics ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Clinics</p>
          {clinicNote ? <p className="mt-1 text-sm text-danger">{clinicNote}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={disabled} onClick={() => onScope(true, [])} className={pill(allClinics)}>All clinics</button>
            {clinics.length === 0 ? <span className="self-center text-sm text-muted">No clinics yet</span> : clinics.map((clinic) => (
              <button key={clinic.id} type="button" disabled={disabled} onClick={() => toggleClinic(clinic.id)} className={pill(allClinics || clinicIds.includes(clinic.id))}>{clinic.name}</button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function pill(on: boolean) {
  return `rounded-full border px-3 py-1.5 text-sm ${on ? "border-blue bg-panel font-semibold text-blue" : "border-line-strong bg-surface text-muted-strong"} disabled:opacity-60`;
}

function update<T>(items: T[], index: number, next: T, apply: (value: T[]) => void) {
  apply(items.map((item, itemIndex) => itemIndex === index ? next : item));
}
