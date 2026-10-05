import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, type AccessRole, type Clinic, type Permission, type User } from "../api";
import { canAct, permissionTitle } from "../access";
import { useToast } from "../toast";
import { EntityActivityPanel } from "./EntityActivityPanel";
import { ProfileAvatar } from "./ProfilePage";
import { Card, ConfirmDialog, Detail, IconAction, Page, RoleLabel, Section, Status, Summary, formatWhen, messageOf, secondary, typeLabel } from "./ui";

export function UserViewPage({ token, actor }: { token: string; actor: User }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [activityTotal, setActivityTotal] = useState<number | null>(null);
  const locked = user?.type === "super-admin";
  const canWrite = !locked && canAct(actor, "user", "update", { ownerId: user?.created_by });
  const canDelete = canAct(actor, "user", "delete", { ownerId: user?.created_by }) && user?.id !== actor.id && !locked;
  const canViewActivity = canAct(actor, "activity", "view");
  const requested = params.get("tab");
  const tab =
    requested === "permissions" ? "permissions"
      : requested === "activity" && canViewActivity ? "activity"
        : "details";

  useEffect(() => {
    api<User>(`/api/users/${id}`, {}, token).then(setUser).catch((caught) => setError(messageOf(caught)));
    api<Permission[]>("/api/permissions", {}, token).then(setCatalog).catch(() => undefined);
    api<AccessRole[]>("/api/roles", {}, token).then(setRoles).catch(() => undefined);
    api<Clinic[]>("/api/clinics", {}, token).then(setClinics).catch(() => undefined);
  }, [id, token]);

  return (
    <Page
      title={user?.name ?? "User"}
      description={user ? `${user.email} · ${typeLabel(user.type)}` : "Account details"}
      crumbs={[{ label: "Users", to: "/users" }, { label: user?.name ?? "User" }]}
      action={
        <>
          <Link className={secondary} to="/users">Back to list</Link>
          {canWrite ? <IconAction kind="edit" to={tab === "permissions" ? `/users/${id}/permissions/edit` : `/users/${id}/edit`} /> : null}
          {canDelete ? <IconAction kind="delete" onClick={() => { setDeleteError(null); setConfirmOpen(true); }} /> : null}
        </>
      }
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {user ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card>
            <div role="tablist" aria-label="User" className="-mx-5 -mt-5 mb-5 flex border-b border-line-soft px-3">
              <TabButton selected={tab === "details"} onClick={() => setParams({}, { replace: true })}>Details</TabButton>
              <TabButton selected={tab === "permissions"} onClick={() => setParams({ tab: "permissions" }, { replace: true })}>
                Permissions
                <span className={`rounded-full px-2 py-0.5 text-xs ${tab === "permissions" ? "bg-panel text-blue" : "bg-surface-3 text-muted"}`}>{(user.assignments?.length ?? 0) + (user.grants?.length ?? 0)}</span>
              </TabButton>
              {canViewActivity ? (
                <TabButton selected={tab === "activity"} onClick={() => setParams({ tab: "activity" }, { replace: true })}>
                  Activity
                  {activityTotal != null ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${tab === "activity" ? "bg-panel text-blue" : "bg-surface-3 text-muted"}`}>{activityTotal}</span>
                  ) : null}
                </TabButton>
              ) : null}
            </div>
            {tab === "details" ? (
              <div role="tabpanel">
                {locked ? <p className="mb-4 text-sm text-muted">A super admin is created manually and cannot be edited here.</p> : null}
                <Section index="1" title="Personal information" />
                <Detail items={[
                  { label: "Full name", value: user.name },
                  { label: "Email", value: user.email },
                  { label: "Phone", value: user.phone },
                  { label: "Status", value: <Status active={user.is_active} /> },
                ]} />
                <div className="mt-6"><Section index="2" title="Access" /></div>
                <Detail items={[
                  { label: "Type", value: typeLabel(user.type) },
                  { label: "Position", value: <RoleLabel role={user.role} /> },
                  { label: "Created", value: formatWhen(user.created_at) },
                  { label: "Updated", value: formatWhen(user.updated_at) },
                ]} />
              </div>
            ) : null}
            {tab === "permissions" ? (
              <div role="tabpanel">
                <Section index="1" title="Permission roles" />
                {(user.assignments ?? []).length === 0 ? <p className="text-sm text-muted">No permission role. This person can sign in and see only their own account.</p> : (
                  <ul className="space-y-2 text-sm">
                    {user.assignments?.map((assignment) => {
                      const role = roles.find((item) => item.id === assignment.role_id);
                      return (
                        <li key={assignment.role_id} className="rounded-xl bg-surface-2 px-3 py-2">
                          <p className="font-semibold">{assignment.role_name}</p>
                          {role?.description ? <p className="text-muted-strong">{role.description}</p> : null}
                          {role?.scopes_clinics ? <ClinicLine allClinics={assignment.all_clinics} clinicIds={assignment.clinic_ids} clinics={clinics} /> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-6"><Section index="2" title="Extra permissions" /></div>
                {(user.grants ?? []).length === 0 ? <p className="text-sm text-muted">No extra permissions.</p> : (
                  <ul className="space-y-2 text-sm text-muted-strong">
                    {user.grants?.map((grant) => {
                      const permission = catalog.find((item) => item.id === grant.permission_id);
                      return (
                        <li key={grant.permission_id} className="rounded-xl bg-surface-2 px-3 py-2">
                          <p className="font-semibold text-ink">{permission ? permissionTitle(permission) : grant.permission_id}</p>
                          {permission?.description ? <p>{permission.description}</p> : null}
                          {permission?.clinic_scoped ? <ClinicLine allClinics={grant.all_clinics} clinicIds={grant.clinic_ids} clinics={clinics} /> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
            {canViewActivity && id ? (
              <EntityActivityPanel
                token={token}
                entity="user"
                entityId={id}
                active={tab === "activity"}
                onTotal={setActivityTotal}
              />
            ) : null}
          </Card>
          <Summary
            title={user.name}
            lines={[
              <ProfileAvatar name={user.name} photoUrl={user.photo_url} size="md" />,
              user.email,
              user.phone,
              <RoleLabel role={user.role} />,
              user.is_active ? "Active" : "Inactive",
            ]}
          />
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${user?.name ?? "this user"}?`}
        body="This account will be removed from the directory. The change cannot be undone from the dashboard."
        confirmLabel="Delete user"
        pending={pending}
        error={deleteError}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setPending(true);
          setDeleteError(null);
          api(`/api/users/${id}`, { method: "DELETE" }, token)
            .then(() => {
              toast.success("User deleted", `${user?.name ?? "The account"} was removed from the directory.`);
              navigate("/users");
            })
            .catch((caught) => {
              const message = messageOf(caught);
              setDeleteError(message);
              toast.error("Couldn't delete user", message);
            })
            .finally(() => setPending(false));
        }}
      />
    </Page>
  );
}

function TabButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold ${selected ? "border-blue text-blue" : "border-transparent text-muted-strong"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ClinicLine({ allClinics, clinicIds, clinics }: { allClinics: boolean; clinicIds: string[]; clinics: Clinic[] }) {
  const names = allClinics ? clinics.map((clinic) => clinic.name) : clinicIds.map((id) => clinics.find((clinic) => clinic.id === id)?.name ?? "Clinic");
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {allClinics ? <span className="rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-blue">All clinics</span> : null}
      {names.map((name) => <span key={name} className="rounded-full bg-surface px-2.5 py-1 text-xs text-ink">{name}</span>)}
    </div>
  );
}
