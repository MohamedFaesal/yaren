import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type Clinic, type Hotel, type User } from "../api";
import { canAct } from "../access";
import { DataTable, Filters, IconAction, Page, PlusIcon, SearchSelect, field, label, messageOf, primary, th } from "./ui";

export function ClinicsPage({ token, actor }: { token: string; actor: User }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Clinic[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [query, setQuery] = useState("");
  const [hotelId, setHotelId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canCreate = canAct(actor, "clinic", "create");
  const filtered = rows.filter((row) => {
    const haystack = `${row.name} ${row.hotel_name}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase()) && (!hotelId || row.hotel_id === hotelId);
  });

  useEffect(() => {
    api<Clinic[]>("/api/clinics", {}, token).then(setRows).catch((caught) => setError(messageOf(caught)));
    api<Hotel[]>("/api/hotels", {}, token).then(setHotels).catch(() => setHotels([]));
  }, [token]);

  return (
    <Page title="Clinics" description="Clinics operating inside Yaren hotels." crumbs={[{ label: "Directory" }, { label: "Clinics" }]} action={canCreate ? <Link to="/clinics/new" className={primary}><PlusIcon />Create clinic</Link> : null}>
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Filters>
        <label className={label}>Search<input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by clinic or hotel" /></label>
        <label className={label}>Hotel<SearchSelect value={hotelId} onChange={setHotelId} options={[{ value: "", label: "All hotels" }, ...hotels.map((hotel) => ({ value: hotel.id, label: hotel.name }))]} placeholder="All hotels" /></label>
      </Filters>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{filtered.length} shown</p>
      <DataTable>
        <thead className="bg-surface-2"><tr><th className={th}>Name</th><th className={th}>Hotel</th><th className={th}>Added by</th><th className={th}>Actions</th></tr></thead>
        <tbody>
          {filtered.length === 0 ? <tr><td className="px-4 py-8 text-muted" colSpan={4}>{rows.length === 0 ? "No clinics yet." : "No clinics match these filters."}</td></tr> : filtered.map((row) => (
            <tr key={row.id} className="cursor-pointer border-t border-line-soft hover:bg-surface-2" onClick={() => navigate(`/clinics/${row.id}`)}>
              <td className="px-4 py-3 font-semibold">{row.name}</td>
              <td className="px-4 py-3">{row.hotel_name}</td>
              <td className="px-4 py-3">{row.added_by_name}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                  <IconAction kind="view" to={`/clinics/${row.id}`} />
                  {canAct(actor, "clinic", "update", { ownerId: row.added_by, clinicId: row.id }) ? <IconAction kind="edit" to={`/clinics/${row.id}/edit`} /> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Page>
  );
}
