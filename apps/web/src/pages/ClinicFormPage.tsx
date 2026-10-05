import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type Clinic, type Hotel, type User } from "../api";
import { canAct } from "../access";
import { useToast } from "../toast";
import { Card, Field, Page, PlusIcon, SearchSelect, Section, Summary, field, messageOf, primary, secondary, useFieldErrors } from "./ui";

export function ClinicFormPage({ token, actor }: { token: string; actor: User }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const fields = useFieldErrors();
  const [name, setName] = useState("");
  const [hotelId, setHotelId] = useState("");
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [addedBy, setAddedBy] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const canWrite = id ? canAct(actor, "clinic", "update", { ownerId, clinicId: id }) : canAct(actor, "clinic", "create");

  useEffect(() => {
    api<Hotel[]>("/api/hotels", {}, token).then(setHotels).catch((caught) => setError(messageOf(caught)));
    if (!id) return;
    api<Clinic>(`/api/clinics/${id}`, {}, token).then((clinic) => {
      setName(clinic.name);
      setHotelId(clinic.hotel_id);
      setAddedBy(clinic.added_by_name);
      setOwnerId(clinic.added_by);
    }).catch((caught) => setError(messageOf(caught)));
  }, [id, token]);

  const hotelName = hotels.find((hotel) => hotel.id === hotelId)?.name ?? "Hotel not chosen";

  return (
    <Page
      title={id ? "Edit clinic" : "New clinic"}
      description={id ? "Update the clinic name or the hotel it belongs to." : "Add a clinic inside one of the hotels."}
      crumbs={id
        ? [{ label: "Clinics", to: "/clinics" }, { label: name || "Clinic", to: `/clinics/${id}` }, { label: "Edit" }]
        : [{ label: "Clinics", to: "/clinics" }, { label: "New clinic" }]}
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
              setError(null);
              setPending(true);
              try {
                const body = { name, hotel_id: hotelId };
                if (id) {
                  await api(`/api/clinics/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
                  toast.success("Clinic updated", `${name} was saved.`);
                  navigate(`/clinics/${id}`);
                } else {
                  const created = await api<{ id: string }>("/api/clinics", { method: "POST", body: JSON.stringify(body) }, token);
                  toast.success("Clinic created", `${name} was added to the network.`);
                  navigate(`/clinics/${created.id}`);
                }
              } catch (caught) {
                const message = messageOf(caught);
                const mapped = fields.applyServerMessage(message);
                setError(Object.keys(mapped).length ? null : message);
                toast.error("Couldn't save clinic", message);
              } finally {
                setPending(false);
              }
            }}
          >
            <Section index="1" title="Clinic information" />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name" error={fields.errorOf("name")}>
                <input className={field} name="name" value={name} onChange={(event) => { setName(event.target.value); fields.clearField("name"); }} placeholder="Serenity Resort Clinic" required disabled={!canWrite} />
              </Field>
              <Field label="Hotel" error={fields.errorOf("hotel_id")}>
                <SearchSelect
                  name="hotel_id"
                  value={hotelId}
                  onChange={(value) => { setHotelId(value); fields.clearField("hotel_id"); }}
                  options={hotels.map((hotel) => ({ value: hotel.id, label: hotel.name }))}
                  placeholder="Search for a hotel"
                  disabled={!canWrite}
                  required
                />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Link className={secondary} to={id ? `/clinics/${id}` : "/clinics"}>{id ? "Cancel" : "Back"}</Link>
              <button className={primary} disabled={!canWrite || pending}>{pending ? "Saving" : id ? "Save clinic" : <><PlusIcon />Create clinic</>}</button>
            </div>
          </form>
        </Card>
        <Summary title={name || "New clinic"} lines={[hotelName, addedBy || "You will be recorded as the person who added it"]} />
      </div>
    </Page>
  );
}
