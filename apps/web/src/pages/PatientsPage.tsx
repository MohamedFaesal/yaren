import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, type PatientPageResult, type User } from "../api";
import { canAct } from "../access";
import { useActiveClinic } from "../ClinicWorkspace";
import { NationalityLabel, nationalityOption } from "../nationalities";
import { DataTable, Filters, IconAction, Page, PlusIcon, SearchSelect, field, label, messageOf, primary, secondary, th } from "./ui";

const pageSize = 20;

const genderOptions = [
  { value: "", label: "Any biological gender" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export function PatientsPage({ token, actor }: { token: string; actor: User }) {
  const navigate = useNavigate();
  const { clinicId } = useActiveClinic();
  const [result, setResult] = useState<PatientPageResult>({ items: [], total: 0, page: 1, page_size: pageSize });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState("");
  const [nationality, setNationality] = useState("");
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const canRegister = canAct(actor, "visit", "create");
  const pages = Math.max(1, Math.ceil(result.total / pageSize));
  const start = result.total === 0 ? 0 : (result.page - 1) * pageSize + 1;
  const end = Math.min(result.page * pageSize, result.total);
  const filtered = Boolean(search || gender || nationality || clinicId);

  useEffect(() => {
    api<string[]>("/api/nationalities", {}, token).then(setNationalities).catch(() => setNationalities([]));
  }, [token]);

  useEffect(() => {
    if (query === search) return;
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    setPage(1);
  }, [clinicId]);

  useEffect(() => {
    const id = ++requestId.current;
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set("q", search);
    if (gender) params.set("gender", gender);
    if (nationality) params.set("nationality", nationality);
    if (clinicId) params.set("clinic_id", clinicId);
    setLoading(true);
    setError(null);
    api<PatientPageResult>(`/api/patients?${params}`, {}, token)
      .then((data) => {
        if (id !== requestId.current) return;
        setResult(data);
        setPage(data.page);
      })
      .catch((caught) => {
        if (id === requestId.current) setError(messageOf(caught));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [token, page, search, gender, nationality, clinicId]);

  return (
    <Page
      title="Patients"
      description="People registered for care in Yaren clinics."
      crumbs={[{ label: "Directory" }, { label: "Patients" }]}
      action={canRegister ? <Link to="/patients/register" className={primary}><PlusIcon />Register</Link> : null}
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <Filters>
        <label className={label}>Search<input className={field} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, MRN, passport, email, or phone" /></label>
        <label className={label}>Biological Gender<SearchSelect value={gender} onChange={(value) => { setGender(value); setPage(1); }} options={genderOptions} placeholder="Any biological gender" /></label>
        <label className={label}>Nationality<SearchSelect value={nationality} onChange={(value) => { setNationality(value); setPage(1); }} options={[{ value: "", label: "Any nationality" }, ...nationalities.map(nationalityOption)]} placeholder="Any nationality" /></label>
      </Filters>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        {loading ? "Loading" : result.total === 0 ? "0 shown" : `Showing ${start}–${end} of ${result.total}`}
      </p>
      <DataTable>
        <thead className="bg-surface-2">
          <tr>
            <th className={th}>Name</th>
            <th className={th}>MRN</th>
            <th className={th}>Biological Gender</th>
            <th className={th}>Nationality</th>
            <th className={th}>Visits</th>
            <th className={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 ? (
            <tr><td className="px-4 py-8 text-muted" colSpan={6}>{filtered ? "No patients match these filters." : "No patients yet."}</td></tr>
          ) : result.items.map((row) => (
            <tr key={row.id} className="cursor-pointer border-t border-line-soft hover:bg-surface-2" onClick={() => navigate(`/patients/${row.id}`)}>
              <td className="px-4 py-3 font-semibold">{row.name}</td>
              <td className="px-4 py-3 font-mono text-sm">{row.mrn}</td>
              <td className="px-4 py-3">{titleCase(row.gender)}</td>
              <td className="px-4 py-3"><NationalityLabel nationality={row.nationality} /></td>
              <td className="px-4 py-3">{row.visit_count ?? 0}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                  <IconAction kind="view" to={`/patients/${row.id}`} />
                  {canAct(actor, "patient", "update", { ownerId: row.added_by }) ? <IconAction kind="edit" to={`/patients/${row.id}/edit`} /> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-strong">Page {result.total === 0 ? 0 : result.page} of {result.total === 0 ? 0 : pages}</p>
        <div className="flex gap-2">
          <button type="button" className={`${secondary} disabled:opacity-50`} disabled={loading || result.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
          <button type="button" className={`${secondary} disabled:opacity-50`} disabled={loading || result.page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      </div>
    </Page>
  );
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
