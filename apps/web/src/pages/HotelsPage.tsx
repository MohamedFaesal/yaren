import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type Hotel, type TourismCity, type User } from "../api";
import { canAct } from "../access";
import { DataTable, Filters, IconAction, Page, PlusIcon, SearchSelect, field, label, messageOf, primary, th } from "./ui";

export function HotelsPage({ token, actor }: { token: string; actor: User }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Hotel[]>([]);
  const [directory, setDirectory] = useState<TourismCity[]>([]);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canCreate = canAct(actor, "hotel", "create");
  const cityOptions = directory.length > 0
    ? directory.map((item) => ({ value: item.name, label: item.name }))
    : [...new Set(rows.map((row) => row.location.city))].sort().map((item) => ({ value: item, label: item }));
  const filtered = rows.filter((row) => {
    const haystack = `${row.name} ${row.location.city} ${row.location.area}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase()) && (!city || row.location.city === city);
  });

  useEffect(() => {
    Promise.all([
      api<Hotel[]>("/api/hotels", {}, token).then(setRows),
      api<TourismCity[]>("/api/tourism/cities", {}, token).then(setDirectory),
    ]).catch((caught) => setError(messageOf(caught)));
  }, [token]);

  return (
    <Page title="Hotels" description="Hotels that host a Yaren clinic." crumbs={[{ label: "Directory" }, { label: "Hotels" }]} action={canCreate ? <Link to="/hotels/new" className={primary}><PlusIcon />Create hotel</Link> : null}>
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Filters>
        <label className={label}>Search<input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by hotel, city, or area" /></label>
        <label className={label}>City<SearchSelect value={city} onChange={setCity} options={[{ value: "", label: "All cities" }, ...cityOptions]} placeholder="All cities" /></label>
      </Filters>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{filtered.length} shown</p>
      <DataTable>
        <thead className="bg-surface-2"><tr><th className={th}>Name</th><th className={th}>City</th><th className={th}>Area</th><th className={th}>Added by</th><th className={th}>Actions</th></tr></thead>
        <tbody>
          {filtered.length === 0 ? <tr><td className="px-4 py-8 text-muted" colSpan={5}>{rows.length === 0 ? "No hotels yet." : "No hotels match these filters."}</td></tr> : filtered.map((row) => (
            <tr key={row.id} className="cursor-pointer border-t border-line-soft hover:bg-surface-2" onClick={() => navigate(`/hotels/${row.id}`)}>
              <td className="px-4 py-3 font-semibold">{row.name}</td>
              <td className="px-4 py-3">{row.location.city}</td>
              <td className="px-4 py-3">{row.location.area}</td>
              <td className="px-4 py-3">{row.added_by_name}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                  <IconAction kind="view" to={`/hotels/${row.id}`} />
                  {canAct(actor, "hotel", "update", { ownerId: row.added_by }) ? <IconAction kind="edit" to={`/hotels/${row.id}/edit`} /> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Page>
  );
}
