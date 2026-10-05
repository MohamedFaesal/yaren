import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type AccessRole, type User } from "../api";
import { canAct } from "../access";
import { useToast } from "../toast";
import { ConfirmDialog, DataTable, IconAction, Page, PlusIcon, messageOf, primary, th } from "./ui";

export function RolesPage({ token, actor }: { token: string; actor: User }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<AccessRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AccessRole | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const canCreate = canAct(actor, "role", "create");

  function load() {
    api<AccessRole[]>("/api/roles", {}, token).then(setRows).catch((caught) => setError(messageOf(caught)));
  }

  useEffect(() => {
    load();
  }, [token]);

  return (
    <Page
      title="Roles"
      description="A role is a set of actions you can give to a person, then limit to one clinic, several clinics, or every clinic."
      crumbs={[{ label: "System" }, { label: "Roles" }]}
      action={canCreate ? <Link to="/roles/new" className={primary}><PlusIcon />Create role</Link> : null}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <DataTable>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>Role</th>
            <th className={th}>Actions</th>
            <th className={th}>People</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="px-4 py-8 text-muted" colSpan={4}>No roles yet.</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id} className="cursor-pointer border-t border-line-soft hover:bg-surface-2" onClick={() => navigate(`/roles/${row.id}`)}>
              <td className="px-4 py-3">
                <p className="font-semibold">{row.name}</p>
                <p className="text-muted">{row.description}</p>
              </td>
              <td className="px-4 py-3">{row.permission_ids.length}</td>
              <td className="px-4 py-3">{row.assigned_count}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                  <IconAction kind="view" to={`/roles/${row.id}`} />
                  {canAct(actor, "role", "update") ? <IconAction kind="edit" to={`/roles/${row.id}/edit`} /> : null}
                  {canAct(actor, "role", "delete") ? <IconAction kind="delete" onClick={() => { setDeleteError(null); setPending(row); }} /> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <ConfirmDialog
        open={Boolean(pending)}
        title={`Delete ${pending?.name ?? "this role"}?`}
        body="People who still have this role must be updated first."
        confirmLabel="Delete role"
        pending={deleting}
        error={deleteError}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          setDeleting(true);
          api(`/api/roles/${pending.id}`, { method: "DELETE" }, token)
            .then(() => {
              toast.success("Role deleted", `${pending.name} was removed.`);
              setPending(null);
              load();
            })
            .catch((caught) => {
              const message = messageOf(caught);
              setDeleteError(message);
              toast.error("Couldn't delete role", message);
            })
            .finally(() => setDeleting(false));
        }}
      />
    </Page>
  );
}
