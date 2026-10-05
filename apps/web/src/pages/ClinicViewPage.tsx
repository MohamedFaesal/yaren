import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, type Clinic, type User } from "../api";
import { canAct } from "../access";
import { useToast } from "../toast";
import { EntityActivityPanel } from "./EntityActivityPanel";
import { StaticMap } from "./MapPicker";
import { Card, ConfirmDialog, Detail, IconAction, Page, Section, Summary, formatWhen, messageOf, secondary } from "./ui";

export function ClinicViewPage({ token, actor }: { token: string; actor: User }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [activityTotal, setActivityTotal] = useState<number | null>(null);
  const canWrite = canAct(actor, "clinic", "update", { ownerId: clinic?.added_by, clinicId: clinic?.id });
  const canDelete = canAct(actor, "clinic", "delete", { ownerId: clinic?.added_by, clinicId: clinic?.id });
  const canViewActivity = canAct(actor, "activity", "view");
  const tab = params.get("tab") === "activity" && canViewActivity ? "activity" : "details";

  useEffect(() => {
    api<Clinic>(`/api/clinics/${id}`, {}, token).then(setClinic).catch((caught) => setError(messageOf(caught)));
  }, [id, token]);

  return (
    <Page
      title={clinic?.name ?? "Clinic"}
      description={clinic ? `${clinic.hotel_name} · ${clinic.city}, ${clinic.area}` : "Clinic details"}
      crumbs={[{ label: "Clinics", to: "/clinics" }, { label: clinic?.name ?? "Clinic" }]}
      action={
        <>
          <Link className={secondary} to="/clinics">Back to list</Link>
          {canWrite && tab === "details" ? <IconAction kind="edit" to={`/clinics/${id}/edit`} /> : null}
          {canDelete ? <IconAction kind="delete" onClick={() => { setDeleteError(null); setConfirmOpen(true); }} /> : null}
        </>
      }
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {clinic ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card>
            {canViewActivity ? (
              <div className="mb-5 flex gap-2 border-b border-line-soft" role="tablist" aria-label="Clinic sections">
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
                <Section index="1" title="Clinic information" />
                <Detail items={[
                  { label: "Name", value: clinic.name },
                  { label: "Hotel", value: <Link className="text-blue" to={`/hotels/${clinic.hotel_id}`}>{clinic.hotel_name}</Link> },
                  { label: "Added by", value: clinic.added_by_name },
                  { label: "Created", value: formatWhen(clinic.created_at) },
                  { label: "Updated", value: formatWhen(clinic.updated_at) },
                ]} />
                <div className="mt-6"><Section index="2" title="Location" /></div>
                <Detail items={[
                  { label: "City", value: clinic.city },
                  { label: "Area", value: clinic.area },
                ]} />
                <div className="mt-4">
                  <StaticMap lat={clinic.lat} lng={clinic.lng} />
                </div>
              </>
            ) : null}
            {canViewActivity && id ? (
              <EntityActivityPanel
                token={token}
                entity="clinic"
                entityId={id}
                active={tab === "activity"}
                onTotal={setActivityTotal}
              />
            ) : null}
          </Card>
          <Summary title={clinic.name} lines={[clinic.hotel_name, `${clinic.city}, ${clinic.area}`, `Added by ${clinic.added_by_name}`]} />
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${clinic?.name ?? "this clinic"}?`}
        body="This clinic will be removed from the hotel. The change cannot be undone from the dashboard."
        confirmLabel="Delete clinic"
        pending={pending}
        error={deleteError}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setPending(true);
          setDeleteError(null);
          api(`/api/clinics/${id}`, { method: "DELETE" }, token)
            .then(() => {
              toast.success("Clinic deleted", `${clinic?.name ?? "The clinic"} was removed.`);
              navigate("/clinics");
            })
            .catch((caught) => {
              const message = messageOf(caught);
              setDeleteError(message);
              toast.error("Couldn't delete clinic", message);
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
