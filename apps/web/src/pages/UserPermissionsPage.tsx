import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type User, type UserAssignment, type UserGrant } from "../api";
import { canAct } from "../access";
import { useToast } from "../toast";
import { AccessFields } from "./AccessFields";
import { Card, Page, RoleLabel, Section, Summary, messageOf, primary, secondary } from "./ui";

export function UserPermissionsPage({ token, actor }: { token: string; actor: User }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [grants, setGrants] = useState<UserGrant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = user?.type === "super-admin";
  const canWrite = !locked && canAct(actor, "user", "update", { ownerId: user?.created_by });

  useEffect(() => {
    api<User>(`/api/users/${id}`, {}, token).then((loaded) => {
      setUser(loaded);
      setAssignments(loaded.assignments ?? []);
      setGrants(loaded.grants ?? []);
    }).catch((caught) => setError(messageOf(caught)));
  }, [id, token]);

  return (
    <Page
      title="Edit permissions"
      description={user ? `Permission roles and extra permissions for ${user.name}.` : "Permission roles and extra permissions."}
      crumbs={[{ label: "Users", to: "/users" }, { label: user?.name ?? "User", to: `/users/${id}?tab=permissions` }, { label: "Permissions" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <form onSubmit={async (event) => {
            event.preventDefault();
            if (!user || !canWrite) return;
            setPending(true);
            setError(null);
            try {
              await api(`/api/users/${id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  name: user.name,
                  email: user.email,
                  phone: user.phone,
                  type: user.type,
                  role: user.role,
                  is_active: user.is_active,
                  assignments: assignments.filter((item) => item.role_id),
                  grants: grants.filter((item) => item.permission_id),
                }),
              }, token);
              toast.success("Permissions updated", `${user.name}'s access was saved.`);
              navigate(`/users/${id}?tab=permissions`);
            } catch (caught) {
              const message = messageOf(caught);
              setError(message);
              toast.error("Couldn't save permissions", message);
            } finally {
              setPending(false);
            }
          }}>
            <Section index="1" title="Permissions" />
            {locked ? <p className="mb-4 text-sm text-muted">A super admin is created manually and cannot be edited here.</p> : null}
            <AccessFields token={token} assignments={assignments} grants={grants} onAssignments={setAssignments} onGrants={setGrants} disabled={!canWrite} />
            <div className="mt-6 flex justify-end gap-2">
              <Link className={secondary} to={`/users/${id}?tab=permissions`}>Cancel</Link>
              <button className={primary} disabled={pending || !user || !canWrite}>{pending ? "Saving" : "Save permissions"}</button>
            </div>
          </form>
        </Card>
        <Summary title={user?.name ?? "User"} lines={[user?.email ?? "Loading", user ? <RoleLabel role={user.role} /> : "Position", user?.is_active === false ? "Inactive" : "Active"]} />
      </div>
    </Page>
  );
}
