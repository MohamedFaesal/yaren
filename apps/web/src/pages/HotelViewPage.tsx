import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, type Hotel, type User } from "../api";
import { canAct } from "../access";
import { useToast } from "../toast";
import { EntityActivityPanel } from "./EntityActivityPanel";
import { StaticMap } from "./MapPicker";
import { Card, ConfirmDialog, Detail, IconAction, Page, Section, Summary, formatWhen, messageOf, secondary } from "./ui";

export function HotelViewPage({ token, actor }: { token: string; actor: User }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [activityTotal, setActivityTotal] = useState<number | null>(null);
  const canWrite = canAct(actor, "hotel", "update", { ownerId: hotel?.added_by });
  const canDelete = canAct(actor, "hotel", "delete", { ownerId: hotel?.added_by });
  const canViewActivity = canAct(actor, "activity", "view");
  const tab = params.get("tab") === "activity" && canViewActivity ? "activity" : "details";

  useEffect(() => {
    api<Hotel>(`/api/hotels/${id}`, {}, token).then(setHotel).catch((caught) => setError(messageOf(caught)));
  }, [id, token]);

  return (
    <Page
      title={hotel?.name ?? "Hotel"}
      description={hotel ? `${hotel.location.city}, ${hotel.location.area}` : "Hotel details"}
      crumbs={[{ label: "Hotels", to: "/hotels" }, { label: hotel?.name ?? "Hotel" }]}
      action={
        <>
          <Link className={secondary} to="/hotels">Back to list</Link>
          {canWrite && tab === "details" ? <IconAction kind="edit" to={`/hotels/${id}/edit`} /> : null}
          {canDelete ? <IconAction kind="delete" onClick={() => { setDeleteError(null); setConfirmOpen(true); }} /> : null}
        </>
      }
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {hotel ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card>
            {canViewActivity ? (
              <div className="mb-5 flex gap-2 border-b border-line-soft" role="tablist" aria-label="Hotel sections">
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
                <Section index="1" title="Hotel information" />
                <Detail items={[
                  { label: "Name", value: hotel.name },
                  { label: "Added by", value: hotel.added_by_name },
                  { label: "Created", value: formatWhen(hotel.created_at) },
                  { label: "Updated", value: formatWhen(hotel.updated_at) },
                ]} />
                <div className="mt-6"><Section index="2" title="Location" /></div>
                <Detail items={[
                  { label: "City", value: hotel.location.city },
                  { label: "Area", value: hotel.location.area },
                ]} />
                <div className="mt-4">
                  <StaticMap lat={hotel.location.lat} lng={hotel.location.lng} />
                </div>
              </>
            ) : null}
            {canViewActivity && id ? (
              <EntityActivityPanel
                token={token}
                entity="hotel"
                entityId={id}
                active={tab === "activity"}
                onTotal={setActivityTotal}
              />
            ) : null}
          </Card>
          <Summary title={hotel.name} lines={[`${hotel.location.city}, ${hotel.location.area}`, `Added by ${hotel.added_by_name}`]} />
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${hotel?.name ?? "this hotel"}?`}
        body="This hotel will be removed from the directory. A hotel that still has clinics cannot be deleted until those clinics are removed."
        confirmLabel="Delete hotel"
        pending={pending}
        error={deleteError}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setPending(true);
          setDeleteError(null);
          api(`/api/hotels/${id}`, { method: "DELETE" }, token)
            .then(() => {
              toast.success("Hotel deleted", `${hotel?.name ?? "The hotel"} was removed.`);
              navigate("/hotels");
            })
            .catch((caught) => {
              const message = messageOf(caught);
              setDeleteError(message);
              toast.error("Couldn't delete hotel", message);
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
