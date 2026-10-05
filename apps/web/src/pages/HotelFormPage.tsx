import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type Hotel, type TourismCity, type User } from "../api";
import { canAct } from "../access";
import { useToast } from "../toast";
import { MapPicker } from "./MapPicker";
import { Card, Field, Page, PlusIcon, SearchSelect, Section, Summary, field, messageOf, primary, secondary, useFieldErrors } from "./ui";

const egypt = { lat: 26.8, lng: 30.8 };

export function HotelFormPage({ token, actor }: { token: string; actor: User }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const fields = useFieldErrors();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [cities, setCities] = useState<TourismCity[]>([]);
  const [addedBy, setAddedBy] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const canWrite = id ? canAct(actor, "hotel", "update", { ownerId }) : canAct(actor, "hotel", "create");
  const selectedCity = cities.find((item) => item.name === city);
  const selectedArea = selectedCity?.areas.find((item) => item.name === area);
  const center = selectedArea ?? selectedCity ?? egypt;

  useEffect(() => {
    api<TourismCity[]>("/api/tourism/cities", {}, token).then(setCities).catch((caught) => setError(messageOf(caught)));
  }, [token]);

  useEffect(() => {
    if (!id) return;
    api<Hotel>(`/api/hotels/${id}`, {}, token).then((hotel) => {
      setName(hotel.name);
      setCity(hotel.location.city);
      setArea(hotel.location.area);
      setLat(hotel.location.lat);
      setLng(hotel.location.lng);
      setAddedBy(hotel.added_by_name);
      setOwnerId(hotel.added_by);
    }).catch((caught) => setError(messageOf(caught)));
  }, [id, token]);

  function chooseCity(nextCity: string) {
    setCity(nextCity);
    setArea("");
    const next = cities.find((item) => item.name === nextCity);
    if (next) {
      setLat(next.lat);
      setLng(next.lng);
    } else {
      setLat(null);
      setLng(null);
    }
  }

  function chooseArea(nextArea: string) {
    setArea(nextArea);
    const next = selectedCity?.areas.find((item) => item.name === nextArea);
    if (next) {
      setLat(next.lat);
      setLng(next.lng);
    }
  }

  return (
    <Page
      title={id ? "Edit hotel" : "New hotel"}
      description={id ? "Update the hotel name and place it on the map." : "Choose a tourism city, then place the hotel on the map."}
      crumbs={id
        ? [{ label: "Hotels", to: "/hotels" }, { label: name || "Hotel", to: `/hotels/${id}` }, { label: "Edit" }]
        : [{ label: "Hotels", to: "/hotels" }, { label: "New hotel" }]}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <form
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              if (!canWrite) return;
              const valid = fields.validateForm(event.currentTarget);
              const extras: Record<string, string> = {};
              if (!city) extras.city = "This field is required.";
              if (!area) extras.area = "This field is required.";
              if (lat == null || lng == null) extras.map = "Place the hotel on the map.";
              if (Object.keys(extras).length) fields.setErrors((current) => ({ ...current, ...extras }));
              if (!valid || Object.keys(extras).length) return;
              setError(null);
              setPending(true);
              const location = { city, area, lat, lng };
              try {
                if (id) {
                  await api(`/api/hotels/${id}`, { method: "PATCH", body: JSON.stringify({ name, location }) }, token);
                  toast.success("Hotel updated", `${name} was saved.`);
                  navigate(`/hotels/${id}`);
                } else {
                  const created = await api<{ id: string }>("/api/hotels", { method: "POST", body: JSON.stringify({ name, location }) }, token);
                  toast.success("Hotel created", `${name} was added to the network.`);
                  navigate(`/hotels/${created.id}`);
                }
              } catch (caught) {
                const message = messageOf(caught);
                const mapped = fields.applyServerMessage(message);
                setError(Object.keys(mapped).length ? null : message);
                toast.error("Couldn't save hotel", message);
              } finally {
                setPending(false);
              }
            }}
          >
            <Section index="1" title="Hotel information" />
            <Field label="Name" error={fields.errorOf("name")}>
              <input className={field} name="name" value={name} onChange={(event) => { setName(event.target.value); fields.clearField("name"); }} placeholder="Serenity Resort" required disabled={!canWrite} />
            </Field>
            <div className="mt-6"><Section index="2" title="Location" /></div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="City" error={fields.errorOf("city")}>
                <SearchSelect
                  name="city"
                  value={city}
                  onChange={(value) => { chooseCity(value); fields.clearField("city"); fields.clearField("area"); }}
                  options={cities.map((item) => ({ value: item.name, label: item.name }))}
                  placeholder="Search for a tourism city"
                  disabled={!canWrite}
                  required
                />
              </Field>
              <Field label="Area" error={fields.errorOf("area")}>
                <SearchSelect
                  name="area"
                  value={area}
                  onChange={(value) => { chooseArea(value); fields.clearField("area"); }}
                  options={(selectedCity?.areas ?? []).map((item) => ({ value: item.name, label: item.name }))}
                  placeholder={city ? "Search for an area" : "Choose a city first"}
                  disabled={!canWrite || !city}
                  required
                />
              </Field>
            </div>
            <div className="mt-4">
              <p className="block text-[13px] font-medium text-muted-strong">Map pin</p>
              <div className={`mt-1 ${fields.errorOf("map") ? "rounded-xl ring-2 ring-danger" : ""}`}>
                <MapPicker
                  lat={lat}
                  lng={lng}
                  center={center}
                  disabled={!canWrite}
                  onChange={(point) => {
                    setLat(point.lat);
                    setLng(point.lng);
                    fields.clearField("map");
                  }}
                />
              </div>
              {fields.errorOf("map") ? <p className="mt-1 text-sm font-medium text-danger" role="alert">{fields.errorOf("map")}</p> : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Link className={secondary} to={id ? `/hotels/${id}` : "/hotels"}>{id ? "Cancel" : "Back"}</Link>
              <button className={primary} disabled={!canWrite || pending}>{pending ? "Saving" : id ? "Save hotel" : <><PlusIcon />Create hotel</>}</button>
            </div>
          </form>
        </Card>
        <Summary
          title={name || "New hotel"}
          lines={[
            city && area ? `${city}, ${area}` : "Location not set",
            lat != null && lng != null ? `Pin ${lat.toFixed(5)}, ${lng.toFixed(5)}` : "No map pin yet",
            addedBy || "You will be recorded as the person who added it",
          ]}
        />
      </div>
    </Page>
  );
}
