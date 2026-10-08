import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, type Patient, type PatientVisit, type User, type VisitCareStatus } from "../api";
import { canAct } from "../access";
import { NationalityLabel } from "../nationalities";
import { useToast } from "../toast";
import { EntityActivityPanel } from "./EntityActivityPanel";
import { AgeBadge, Card, ConfirmDialog, Detail, IconAction, Page, PlusIcon, SecretValue, Section, Summary, formatWhen, messageOf, primary, secondary } from "./ui";

export function PatientViewPage({ token, actor }: { token: string; actor: User }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [activityTotal, setActivityTotal] = useState<number | null>(null);
  const canWrite = canAct(actor, "patient", "update", { ownerId: patient?.added_by });
  const canDelete = canAct(actor, "patient", "delete", { ownerId: patient?.added_by });
  const canViewVisits = canAct(actor, "visit", "view");
  const canCreateVisit = canAct(actor, "visit", "create");
  const canViewActivity = canAct(actor, "activity", "view");
  const requested = params.get("tab");
  const tab =
    requested === "visits" && (canViewVisits || canCreateVisit) ? "visits"
      : requested === "activity" && canViewActivity ? "activity"
        : "details";

  useEffect(() => {
    api<Patient>(`/api/patients/${id}`, {}, token).then(setPatient).catch((caught) => setError(messageOf(caught)));
  }, [id, token]);

  const age = patient ? ageFromBirthdate(patient.birthdate) : null;

  return (
    <Page
      title={
        <span className="inline-flex items-center gap-2.5">
          <span>{patient?.name ?? "Patient"}</span>
          {age != null ? <AgeBadge age={age} /> : null}
        </span>
      }
      description={patient
        ? `${patient.mrn} · ${titleCase(patient.gender)} · ${patient.nationality}`
        : "Patient details"}
      crumbs={[{ label: "Patients", to: "/patients" }, { label: patient?.name ?? "Patient" }]}
      action={
        <>
          <Link className={secondary} to="/patients">Back to list</Link>
          {canWrite && tab === "details" ? <IconAction kind="edit" to={`/patients/${id}/edit`} /> : null}
          {canCreateVisit && tab === "visits" ? <Link to={`/patients/${id}/visits/new`} className={primary}><PlusIcon />Add visit</Link> : null}
          {canDelete ? <IconAction kind="delete" onClick={() => { setDeleteError(null); setConfirmOpen(true); }} /> : null}
        </>
      }
    >
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {patient ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card>
            <div className="mb-5 flex gap-2 border-b border-line-soft" role="tablist" aria-label="Patient sections">
              <TabButton selected={tab === "details"} onClick={() => setParams({}, { replace: true })}>Details</TabButton>
              {canViewVisits || canCreateVisit ? (
                <TabButton selected={tab === "visits"} onClick={() => setParams({ tab: "visits" }, { replace: true })}>
                  Visits
                  <span className={`rounded-full px-2 py-0.5 text-xs ${tab === "visits" ? "bg-panel text-blue" : "bg-surface-3 text-muted"}`}>{patient.visits?.length ?? 0}</span>
                </TabButton>
              ) : null}
              {canViewActivity ? (
                <TabButton selected={tab === "activity"} onClick={() => setParams({ tab: "activity" }, { replace: true })}>
                  Activity
                  {activityTotal != null ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${tab === "activity" ? "bg-panel text-blue" : "bg-surface-3 text-muted"}`}>{activityTotal}</span>
                  ) : null}
                </TabButton>
              ) : null}
            </div>
            {tab === "details" ? (
              <>
                <Section index="1" title="Personal information" />
                <Detail items={[
                  { label: "Name", value: patient.name },
                  { label: "MRN", value: patient.mrn },
                  { label: "Passport / National ID", value: patient.identity_number || "—" },
                  { label: "Birth date", value: formatDay(patient.birthdate) },
                  { label: "Age", value: age != null ? <AgeBadge age={age} /> : "—" },
                  { label: "Biological Gender", value: titleCase(patient.gender) },
                  { label: "Nationality", value: <NationalityLabel nationality={patient.nationality} /> },
                ]} />
                <div className="mt-6"><Section index="2" title="Contact" /></div>
                <Detail items={[
                  { label: "Email", value: patient.email || "—" },
                  { label: "Phone", value: <SecretValue value={patient.phone_number} mono /> },
                  { label: "Alternative phone", value: <SecretValue value={patient.alternative_phone_number} mono /> },
                  { label: "Home address", value: patient.home_address || "—" },
                  { label: "Added by", value: patient.added_by_name },
                  { label: "Created", value: formatWhen(patient.created_at) },
                  { label: "Updated", value: formatWhen(patient.updated_at) },
                ]} />
              </>
            ) : null}
            {tab === "visits" ? (
              <PatientVisitsPanel
                patientId={patient.id}
                visits={patient.visits ?? []}
                ownerId={patient.added_by}
                actor={actor}
                canCreate={canCreateVisit}
              />
            ) : null}
            {canViewActivity && id ? (
              <EntityActivityPanel
                token={token}
                entity="patient"
                entityId={id}
                active={tab === "activity"}
                onTotal={setActivityTotal}
              />
            ) : null}
          </Card>
          <Summary
            title={patient.name}
            lines={[
              patient.mrn,
              age != null ? <AgeBadge age={age} /> : "Age unknown",
              <NationalityLabel nationality={patient.nationality} />,
              `${patient.visits?.length ?? 0} visits`,
            ]}
          />
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${patient?.name ?? "this patient"}?`}
        body="This patient will be removed. A patient who still has visits cannot be deleted until those visits are removed."
        confirmLabel="Delete patient"
        pending={pending}
        error={deleteError}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setPending(true);
          setDeleteError(null);
          api(`/api/patients/${id}`, { method: "DELETE" }, token)
            .then(() => {
              toast.success("Patient deleted", `${patient?.name ?? "The patient"} was removed.`);
              navigate("/patients");
            })
            .catch((caught) => {
              const message = messageOf(caught);
              setDeleteError(message);
              toast.error("Couldn't delete patient", message);
            })
            .finally(() => setPending(false));
        }}
      />
    </Page>
  );
}

function PatientVisitsPanel({
  patientId,
  visits,
  ownerId,
  actor,
  canCreate,
}: {
  patientId: string;
  visits: PatientVisit[];
  ownerId: string;
  actor: User;
  canCreate: boolean;
}) {
  const sorted = [...visits].sort((a, b) => {
    const aCheckin = a.hotel_checkin_date ?? "";
    const bCheckin = b.hotel_checkin_date ?? "";
    if (aCheckin || bCheckin) {
      const byCheckin = bCheckin.localeCompare(aCheckin);
      if (byCheckin !== 0) return byCheckin;
    }
    return b.created_at.localeCompare(a.created_at);
  });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Section index="1" title="Stay history" />
          <p className="-mt-2 text-sm text-muted-strong">
            {sorted.length === 0
              ? "Hotel clinic stays for this patient."
              : `${sorted.length} visit${sorted.length === 1 ? "" : "s"} · newest first`}
          </p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface-2 px-5 py-10 text-center">
          <p className="text-sm font-semibold text-ink">No visits yet</p>
          <p className="mt-1 text-sm text-muted-strong">Register a hotel stay to start this patient’s care history.</p>
          {canCreate ? (
            <Link to={`/patients/${patientId}/visits/new`} className={`${primary} mt-4`}>
              <PlusIcon />Add visit
            </Link>
          ) : null}
        </div>
      ) : (
        <ol className="relative space-y-0">
          {sorted.map((visit, index) => {
            const status = visitStatus(visit);
            const canEdit = canAct(actor, "visit", "update", { ownerId, clinicId: visit.clinic_id });
            return (
              <li key={visit.id} className="relative flex gap-4 pb-5 last:pb-0">
                <div className="relative flex w-4 shrink-0 flex-col items-center">
                  <span className={`mt-3 z-[1] h-3 w-3 rounded-full ring-4 ring-white ${status.dot}`} />
                  {index < sorted.length - 1 ? <span className="absolute top-6 bottom-0 w-px bg-line" aria-hidden="true" /> : null}
                </div>
                <div className="group min-w-0 flex-1 rounded-2xl border border-line-soft bg-surface px-4 py-3.5 transition hover:border-panel-strong hover:bg-panel">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Link to={`/patients/${patientId}/visits/${visit.id}`} className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-semibold text-ink group-hover:text-blue">{visit.clinic_name}</p>
                        {visit.patient_age_at_visit != null ? <AgeBadge age={visit.patient_age_at_visit} /> : null}
                        <CareStatus status={visit.status} />
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${status.badge}`}>
                          {status.label}
                        </span>
                        {index === 0 ? (
                          <span className="rounded-md bg-line-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-strong">
                            Latest
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-strong">
                        {visit.hotel_name}
                        <span className="text-muted-soft">·</span>
                        {visit.hotel_room_no ? <SecretValue value={`Room ${visit.hotel_room_no}`} /> : "Room not set"}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <VisitMeta label="Age at visit" value={visit.patient_age_at_visit != null ? `${visit.patient_age_at_visit} years` : "—"} />
                        <VisitMeta label="Stay" value={<SecretValue value={formatStay(visit.hotel_checkin_date, visit.hotel_checkout_date)} />} />
                        <VisitMeta label="Passport / ID" value={<SecretValue value={visit.passport_number} mono />} />
                        <VisitMeta label="Contact" value={visit.preferred_contact_method ? titleCase(visit.preferred_contact_method) : "—"} />
                      </div>
                    </Link>
                    <div className="flex shrink-0 gap-2">
                      <IconAction kind="view" to={`/patients/${patientId}/visits/${visit.id}`} />
                      {canEdit ? <IconAction kind="edit" to={`/patients/${patientId}/visits/${visit.id}/edit`} /> : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

function VisitMeta({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className={`mt-0.5 text-sm font-semibold text-ink ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function CareStatus({ status }: { status?: VisitCareStatus }) {
  if (status === "to_doctor") {
    return <span className="inline-flex rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">To see the doctor</span>;
  }
  if (status === "waiting_for_triage") {
    return <span className="inline-flex rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">Waiting for triage</span>;
  }
  return null;
}

function visitStatus(visit: PatientVisit) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkin = visit.hotel_checkin_date ? parseDay(visit.hotel_checkin_date) : null;
  const checkout = visit.hotel_checkout_date ? parseDay(visit.hotel_checkout_date) : null;
  if (!checkin && !checkout) {
    return { label: "Recorded", badge: "bg-line-soft text-muted-strong", dot: "bg-muted-soft" };
  }
  if (checkin && checkin > today) {
    return { label: "Upcoming", badge: "bg-panel text-blue", dot: "bg-blue" };
  }
  if (checkout && checkout < today) {
    return { label: "Completed", badge: "bg-line-soft text-muted-strong", dot: "bg-muted-soft" };
  }
  return { label: "In stay", badge: "bg-success-soft text-success", dot: "bg-success" };
}

function parseDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatStay(checkin: string | null, checkout: string | null) {
  if (!checkin && !checkout) return "—";
  if (!checkin) return checkout ? `Until ${formatDay(checkout)}` : "—";
  const start = formatDay(checkin);
  if (!checkout) return `${start} · open`;
  return `${start} → ${formatDay(checkout)}`;
}

function formatDay(value: string) {
  const date = parseDay(value);
  if (!date) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ageFromBirthdate(value: string) {
  const birth = parseDay(value);
  if (!birth) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
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

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
