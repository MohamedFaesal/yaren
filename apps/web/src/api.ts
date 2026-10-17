export type UserType = "super-admin" | "admin" | "staff";
export type Role = "Doctor" | "Nurse" | "Receptionist" | "Accountant" | "CEO" | "CTO";

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: UserType;
  role: Role;
  is_active: boolean;
  photo_url?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  access?: Access;
  assignments?: UserAssignment[];
  grants?: UserGrant[];
  clinics?: { all: boolean; items: { id: string; name: string }[] };
};

export type ActionGrant = { level: "all" | "own" | "none"; allClinics: boolean; clinicIds: string[] };
export type ResourceGrants = Record<"view" | "create" | "update" | "delete", ActionGrant>;
export type Access = { bypass: boolean } & Record<"user" | "hotel" | "clinic" | "patient" | "visit" | "triage" | "activity" | "role", ResourceGrants>;

export type Permission = { id: string; resource: string; action: string; ownership: string; clinic_scoped: boolean; description: string };
export type AccessRole = {
  id: string;
  name: string;
  description: string;
  permission_ids: string[];
  assigned_count: number;
  scopes_clinics: boolean;
  created_at: string;
  updated_at: string;
};
export type UserAssignment = { id?: string; role_id: string; role_name?: string; all_clinics: boolean; clinic_ids: string[] };
export type UserGrant = { id?: string; permission_id: string; all_clinics: boolean; clinic_ids: string[] };

export type Location = { city: string; area: string; lat: number; lng: number };

export type TourismArea = { name: string; lat: number; lng: number };
export type TourismCity = { name: string; lat: number; lng: number; areas: TourismArea[] };

export type Hotel = {
  id: string;
  name: string;
  location: Location;
  added_by: string;
  added_by_name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Clinic = {
  id: string;
  name: string;
  hotel_id: string;
  hotel_name: string;
  city: string;
  area: string;
  lat: number;
  lng: number;
  added_by: string;
  added_by_name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Patient = {
  id: string;
  name: string;
  mrn: string;
  birthdate: string;
  nationality: string;
  gender: "male" | "female";
  added_by: string;
  added_by_name: string;
  identity_number: string | null;
  email: string | null;
  phone_number: string | null;
  alternative_phone_number: string | null;
  home_address: string | null;
  visit_count?: number;
  visits?: PatientVisit[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PatientMatch = Patient & {
  age: number | null;
  visit_count: number;
  reasons: string[];
  last_passport: string | null;
  last_visit: {
    passport_number: string | null;
    preferred_contact_method: "phone" | "email" | "whatsapp" | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_relationship: PatientVisit["emergency_contact_relationship"];
  } | null;
};

export type VisitDocument = {
  id: string;
  document_type: string;
  original_name: string;
  mime_type: string;
  file_url: string | null;
  created_at: string;
  updated_at: string;
};

export type PatientVisit = {
  id: string;
  patient_id: string;
  passport_number: string;
  preferred_contact_method: "phone" | "email" | "whatsapp" | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: "spouse" | "son" | "daughter" | "father" | "mother" | "cousin" | "grandfather" | "grandmother" | "girlfriend" | "boyfriend" | null;
  hotel_checkin_date: string | null;
  hotel_checkout_date: string | null;
  hotel_room_no: string | null;
  visit_type?: VisitType;
  currency?: "EGP" | "EUR";
  professional_service_id?: string | null;
  professional_service_name?: string | null;
  professional_service_code?: string | null;
  clinic_id: string;
  clinic_name: string;
  hotel_name: string;
  status?: VisitCareStatus;
  status_changed_at?: string;
  assigned_doctor_id?: string | null;
  assigned_doctor_name?: string | null;
  patient_age_at_visit?: number | null;
  patient_added_by?: string;
  patient_name?: string;
  patient_mrn?: string;
  documents?: VisitDocument[];
  status_history?: VisitStatusEvent[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type VisitCareStatus = "waiting_for_triage" | "to_doctor" | "seen" | "waiting_for_investigation" | "diagnosed" | "pending_payment";

export function visitStatusLabel(status?: VisitCareStatus) {
  if (status === "waiting_for_triage") return "Waiting for triage";
  if (status === "to_doctor") return "To see the doctor";
  if (status === "seen") return "Seen by the doctor";
  if (status === "waiting_for_investigation") return "Waiting for investigation";
  if (status === "diagnosed") return "Diagnosed";
  if (status === "pending_payment") return "Pending payment";
  return "—";
}
export type VisitType = "new" | "follow-up";

export function visitTypeLabel(value: VisitType | null | undefined) {
  if (value === "follow-up") return "Follow-up";
  if (value === "new") return "New";
  return "—";
}

export type VisitStatusEvent = {
  from_status: string | null;
  to_status: string;
  changed_by_name: string | null;
  created_at: string;
};

export type TriageCategory = "emergency" | "urgent" | "normal";

export type TriageAllergy = { name: string; reaction?: string };
export type TriageMedication = { name: string };

export type VisitTriage = {
  id: string;
  visit_id: string;
  chief_complaint: string | null;
  temperature_c: number | string | null;
  pulse: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
  blood_pressure: string | null;
  allergies: TriageAllergy[];
  medications: TriageMedication[];
  relevant_history: string[];
  relevant_history_items?: TriageMedication[];
  relevant_history_other: string | null;
  initial_assessment: string | null;
  triage_category: TriageCategory | null;
  assigned_doctor_id: string | null;
  assigned_doctor_name?: string | null;
  started_by: string | null;
  started_by_name?: string | null;
  started_at: string | null;
  completed_by: string | null;
  completed_by_name?: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VisitStatusHistory = {
  id: string;
  visit_id: string;
  from_status: VisitCareStatus | null;
  to_status: VisitCareStatus;
  changed_by: string | null;
  changed_by_name?: string | null;
  note: string | null;
  created_at: string;
};

export type TriageQueueItem = {
  id: string;
  patient_id: string;
  status: VisitCareStatus;
  status_changed_at: string;
  assigned_doctor_id: string | null;
  assigned_doctor_name: string | null;
  hotel_room_no: string | null;
  clinic_id: string;
  clinic_name: string;
  hotel_name: string;
  patient_name: string;
  patient_mrn: string;
  patient_added_by: string;
  visit_type?: VisitType;
  triage_id: string | null;
  triage_category: TriageCategory | null;
  triage_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DoctorCase = {
  id: string;
  patient_id: string;
  status: VisitCareStatus;
  status_changed_at: string;
  assigned_doctor_id: string | null;
  assigned_doctor_name: string | null;
  hotel_room_no: string | null;
  clinic_id: string;
  clinic_name: string;
  hotel_name: string;
  patient_name: string;
  patient_mrn: string;
  visit_type?: VisitType;
  currency?: "EGP" | "EUR";
  triage_category: TriageCategory | null;
  chief_complaint: string | null;
  triage_completed_at: string | null;
};

export type EncounterSystem = "general" | "heent" | "respiratory" | "cardiovascular" | "abdomen" | "cns" | "musculoskeletal" | "skin" | "other";

export type ClinicalEncounter = {
  chief_complaint: string;
  history_of_present_illness: string;
  past_history: string;
  medication_allergy_history: string;
  temperature_c: number | null;
  pulse: number | null;
  respiratory_rate: number | null;
  blood_pressure: string;
  spo2: number | null;
  pain_score: number | null;
  vitals_recorded_at: string | null;
  examination: {
    general_appearance: string;
    consciousness: string;
    nutrition: string;
    hydration: string;
    findings: string;
    notes: Partial<Record<EncounterSystem, string>>;
  };
  provisional_diagnoses: { code: string; title: string }[];
  provisional_diagnosis: string;
  investigations: EncounterInvestigation[];
  management_plan: string;
  allergies: TriageAllergy[];
  medications: TriageMedication[];
  medication_orders: MedicationOrder[];
  procedure_orders: ProcedureOrder[];
  patient_advices: PatientAdvice[];
};

export type Icd10Code = { code: string; title: string };

export type EncounterInvestigation = {
  id: string;
  service_id: string | null;
  name: string;
  code: string;
  unit: string;
  price: number | null;
  priority: "emergency" | "urgent" | "normal";
};

export type CatalogMedication = {
  id: string;
  name: string;
  strength: string;
  dosage_form: string;
  route: string;
  unit_price_egp: number | null;
  unit_price_eur: number | null;
  routes?: {
    route: string;
    services: { id: string; name: string; code: string; unit: string; price: number | null }[];
  }[];
};

export type MedicationOrder = {
  id: string;
  medication_id: string | null;
  route: string;
  medication: string;
  strength: string;
  dosage_form: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
};

export type ProcedureOrder = {
  id: string;
  procedure_id: string | null;
  name: string;
  code: string;
  unit: string;
  price: number | null;
  notes: string;
  linked_medication_order_id?: string | null;
};

export type PatientAdvice = {
  id: string;
  text: string;
};

export type EncounterFile = {
  id: string;
  original_name: string;
  mime_type: string;
  file_url: string | null;
  created_at: string;
};

export type EncounterRecord = {
  visit: DoctorCaseDetail;
  encounter: ClinicalEncounter;
  files: EncounterFile[];
  saved: boolean;
  finished: boolean;
};

export type DoctorCaseDetail = DoctorCase & {
  patient_gender: "male" | "female" | null;
  patient_nationality: string | null;
  patient_age_at_visit: number | null;
  temperature_c: number | string | null;
  pulse: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
  blood_pressure: string | null;
  allergies: TriageAllergy[];
  medications: TriageMedication[];
  relevant_history: string[];
  relevant_history_items?: TriageMedication[];
  relevant_history_other: string | null;
  initial_assessment: string | null;
  completed_by_name: string | null;
};

export type ClinicWaitSetting = {
  clinic_id: string;
  triage_wait_minutes: number;
  doctor_wait_minutes: number;
};

export type MedicalService = {
  id: string;
  name: string;
  description: string | null;
  service_type: string;
  category: string;
  unit: string;
  code: string;
  shared_price: number;
  clinic_price: number | null;
  price: number;
};

export function formatPrice(value: number) {
  return value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type GeneralSettings = {
  triage_wait_minutes: number;
  doctor_wait_minutes: number;
  clinics: ClinicWaitSetting[];
};

export function waitMinutes(settings: GeneralSettings, clinicId: string, kind: "triage" | "doctor") {
  const clinic = settings.clinics.find((item) => item.clinic_id === clinicId);
  if (kind === "triage") return clinic?.triage_wait_minutes ?? settings.triage_wait_minutes;
  return clinic?.doctor_wait_minutes ?? settings.doctor_wait_minutes;
}

export type DoctorCaseSummary = {
  waiting: number;
  today: number;
  to_see_now: number;
  emergency: number;
  urgent: number;
  normal: number;
  diagnosed: number;
  waiting_for_investigation: number;
  average_wait_minutes: number;
};

export type DoctorCasePage = {
  items: DoctorCase[];
  total: number;
  page: number;
  page_size: number;
  summary?: DoctorCaseSummary;
};

export type TriageQueueResult = {
  items: TriageQueueItem[];
  total: number;
  page: number;
  page_size: number;
  summary: { waiting_for_triage: number; waiting_for_investigation: number; to_doctor: number };
};

export type TriageDetail = {
  visit: TriageQueueItem & {
    patient_gender?: string;
    patient_birthdate?: string;
    patient_nationality?: string;
    patient_age_at_visit?: number | null;
  };
  triage: VisitTriage | null;
  history: VisitStatusHistory[];
};

export type DashboardStats = {
  users: {
    total: number;
    active: number;
    inactive: number;
    by_type: { key: string; count: number }[];
    by_role: { key: string; count: number }[];
  };
  hotels: { total: number; with_clinics: number; by_city: { city: string; count: number }[] };
  clinics: { total: number; by_city: { city: string; count: number }[] };
  recent: { kind: "user" | "hotel" | "clinic"; id: string; name: string; created_at: string }[];
};

export type ActivityLog = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  summary: string;
  changes: { attribute: string; from: string; to: string }[] | null;
  method: string;
  path: string;
  status_code: number;
  created_at: string;
};

export type ActivityPageResult = {
  items: ActivityLog[];
  total: number;
  page: number;
  page_size: number;
};

export type PatientPageResult = {
  items: Patient[];
  total: number;
  page: number;
  page_size: number;
};

export type VisitPageResult = {
  items: PatientVisit[];
  total: number;
  page: number;
  page_size: number;
};

export type AppNotification = {
  visit_id: string;
  patient_id: string;
  kind: "waiting_for_triage" | "to_doctor";
  title: string;
  body: string;
  clinic_name: string;
  created_at: string;
  read: boolean;
  href: string;
};

export type NotificationList = {
  items: AppNotification[];
  unread: number;
  filters: AppNotification["kind"][];
};

export type Session = { token: string; user: User };

const storageKey = "yaren.session";

export function loadSession(): Session | null {
  const raw = localStorage.getItem(storageKey) ?? sessionStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    // Migrate older tab-only sessions into shared storage.
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, raw);
    sessionStorage.removeItem(storageKey);
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null) {
  sessionStorage.removeItem(storageKey);
  if (!session) localStorage.removeItem(storageKey);
  else localStorage.setItem(storageKey, JSON.stringify(session));
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Request failed");
  return body as T;
}
