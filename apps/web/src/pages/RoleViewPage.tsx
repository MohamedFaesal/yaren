import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, type AccessRole, type Permission, type User } from "../api";
import { canAct, permissionTitle } from "../access";
import { useToast } from "../toast";
import { EntityActivityPanel } from "./EntityActivityPanel";
import { Card, ConfirmDialog, Detail, IconAction, Page, Section, messageOf, secondary } from "./ui";

export function RoleViewPage({ token, actor }: { token: string; actor: User }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [role, setRole] = useState<AccessRole | null>(null);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [activityTotal, setActivityTotal] = useState<number | null>(null);
  const canViewActivity = canAct(actor, "activity", "view");
  const tab = params.get("tab") === "activity" && canViewActivity ? "activity" : "details";

  useEffect(() => {
    api<AccessRole>(`/api/roles/${id}`, {}, token).then(setRole).catch((caught) => setError(messageOf(caught)));
    api<Permission[]>("/api/permissions", {}, token).then(setCatalog).catch(() => undefined);
  }, [id, token]);

  const catalogById = new Map(catalog.map((item) => [item.id, item]));

  return (
    <Page
      title={role?.name ?? "Role"}
      description={role?.description || "Permission bundle"}
      crumbs={[{ label: "Roles", to: "/roles" }, { label: role?.name ?? "Role" }]}
      action={
        <>
          <Link className={secondary} to="/roles">Back to list</Link>
          {canAct(actor, "role", "update") && tab === "details" ? <IconAction kind="edit" to={`/roles/${id}/edit`} /> : null}
          {canAct(actor, "role", "delete") ? <IconAction kind="delete" onClick={() => { setDeleteError(null); setConfirmOpen(true); }} /> : null}
        </>
      }
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {role ? (
        <Card>
          {canViewActivity ? (
            <div className="mb-5 flex gap-2 border-b border-line-soft" role="tablist" aria-label="Role sections">
              <TabButton selected={tab === "details"} onClick={() => setParams({}, { replace: true })}>Details</TabButton>
              <TabButton selected={tab === "activity"} onClick={() => setParams({ tab: "activity" }, { replace: true })}>
                Activity
                {activityTotal != null ? (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${tab === "activity" ? "bg-panel text-blue" : "bg-surface-3 text-muted"}`}>{activityTotal}</span>
                ) : null}
              </TabButton>
            </div>
          ) : null}
          {tab === "details" ? (
            <>
              <Section index="1" title="Included actions" />
              <Detail items={[
                { label: "People", value: String(role.assigned_count) },
                { label: "Clinics", value: role.scopes_clinics ? "Chosen on each person" : "Same for every clinic" },
              ]} />
              <div className="mt-5 space-y-4">
                {["user", "hotel", "clinic", "patient", "visit", "activity", "role"].map((resource) => {
                  const items = role.permission_ids.map((permissionId) => catalogById.get(permissionId)).filter((item) => item?.resource === resource);
                  if (items.length === 0) return null;
                  const manage = items.find((item) => item?.action === "manage");
                  const shown = manage ? [manage] : items;
                  const title = resource === "user" ? "Users" : resource === "hotel" ? "Hotels" : resource === "clinic" ? "Clinics" : resource === "patient" ? "Patients" : resource === "visit" ? "Visits" : resource === "activity" ? "Activity" : "Roles";
                  return (
                    <div key={resource}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
                      <ul className="mt-2 space-y-2">
                        {shown.map((permission) => permission ? (
                          <li key={permission.id} className="rounded-xl bg-surface-2 px-3 py-2">
                            <p className="text-sm font-semibold text-ink">{permissionTitle(permission)}</p>
                            <p className="text-sm text-muted-strong">{permission.description}</p>
                          </li>
                        ) : null)}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
          {canViewActivity && id ? (
            <EntityActivityPanel
              token={token}
              entity="role"
              entityId={id}
              active={tab === "activity"}
              onTotal={setActivityTotal}
            />
          ) : null}
        </Card>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${role?.name ?? "this role"}?`}
        body="People who still have this role must be updated first."
        confirmLabel="Delete role"
        pending={pending}
        error={deleteError}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setPending(true);
          api(`/api/roles/${id}`, { method: "DELETE" }, token)
            .then(() => {
              toast.success("Role deleted", `${role?.name ?? "The role"} was removed.`);
              navigate("/roles");
            })
            .catch((caught) => {
              const message = messageOf(caught);
              setDeleteError(message);
              toast.error("Couldn't delete role", message);
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
      onClick={onClick}
      className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${selected ? "border-blue text-blue" : "border-transparent text-muted-strong"}`}
    >
      {children}
    </button>
  );
}
