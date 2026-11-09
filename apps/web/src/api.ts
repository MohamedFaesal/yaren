import type { ProcedureDetails } from "@yaren/shared-kernel";

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
  patient_nationality?: string;
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
  assigned_nurse_id?: string | null;
  assigned_nurse_name?: string | null;
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
  assigned_nurse_id?: string | null;
  assigned_nurse_name?: string | null;
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
  monitoring_status?: MonitoringStatus | null;
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
  provisional_diagnoses: EncounterDiagnosis[];
  provisional_diagnosis: string;
  case_priority: CasePriority | "";
  investigations: EncounterInvestigation[];
  management_plan: string;
  allergies: TriageAllergy[];
  medications: TriageMedication[];
  medication_orders: MedicationOrder[];
  procedure_orders: ProcedureOrder[];
  patient_advices: PatientAdvice[];
};

export type Icd11Code = { code: string; title: string };

export type CasePriority = "stable" | "urgent" | "emergency";

export type EncounterDiagnosis = {
  id: string;
  code: string;
  title: string;
  source: "icd11" | "free_text";
};

export function casePriorityLabel(priority?: CasePriority | "" | null) {
  if (priority === "stable") return "Stable";
  if (priority === "urgent") return "Urgent";
  if (priority === "emergency") return "Emergency";
  return "—";
}

export function casePriorityClass(priority?: CasePriority | "" | null) {
  if (priority === "emergency") return "border-danger bg-danger-soft text-danger";
  if (priority === "urgent") return "border-warning bg-warning-soft text-warning";
  if (priority === "stable") return "border-success bg-success-soft text-success";
  return "border-line bg-surface text-muted-strong";
}

export type InvestigationStatus = "ordered" | "collected" | "sent" | "result_uploaded" | "completed";
export type InvestigationPriority = "emergency" | "urgent" | "normal";

export type EncounterInvestigation = {
  id: string;
  service_id: string | null;
  name: string;
  code: string;
  unit: string;
  price: number | null;
  priority: InvestigationPriority;
  category?: string;
  status?: InvestigationStatus;
  requires_collection?: boolean;
  ordered_at?: string | null;
  ordered_by_name?: string | null;
  collected_at?: string | null;
  collected_by_name?: string | null;
  sent_at?: string | null;
  sent_by_name?: string | null;
  result_uploaded_at?: string | null;
  result_uploaded_by_name?: string | null;
  completed_at?: string | null;
  result_file_url?: string | null;
  result_original_name?: string | null;
};

export type VisitInvestigation = EncounterInvestigation & {
  visit_id?: string;
  patient_id?: string;
  clinic_id?: string;
  clinic_name?: string;
  hotel_name?: string;
  hotel_room_no?: string | null;
  visit_status?: VisitCareStatus;
  patient_name?: string;
  patient_mrn?: string;
  patient_gender?: string | null;
  patient_nationality?: string | null;
  patient_age_at_visit?: number | null;
};

export type SampleCollectionItem = {
  visit_id: string;
  patient_id: string;
  clinic_id: string;
  hotel_room_no: string | null;
  passport_number: string | null;
  status: VisitCareStatus;
  assigned_nurse_id: string | null;
  assigned_nurse_name: string | null;
  status_changed_at: string;
  clinic_name: string;
  hotel_name: string;
  patient_name: string;
  patient_mrn: string;
  patient_gender: string | null;
  patient_nationality: string | null;
  patient_age_at_visit: number | null;
  case_priority: CasePriority | null;
  highest_priority: InvestigationPriority;
  open_count: number;
  collectable_count: number;
  sendable_count: number;
  ordered_at: string | null;
};

export type InvestigationVisitOverallStatus = "sent" | "partially_completed" | "completed" | "other";

export type InvestigationVisitItem = {
  visit_id: string;
  patient_id: string;
  clinic_id: string;
  hotel_room_no: string | null;
  visit_status: VisitCareStatus;
  clinic_name: string;
  hotel_name: string;
  patient_name: string;
  patient_mrn: string;
  patient_gender: string | null;
  patient_nationality: string | null;
  patient_age_at_visit: number | null;
  case_priority: CasePriority | null;
  test_count: number;
  overall_status: InvestigationVisitOverallStatus;
  ordered_at: string | null;
};

export type InvestigationVisitSummary = {
  all: number;
  sent: number;
  partially_completed: number;
  completed: number;
};

export type InvestigationPage = {
  items: InvestigationVisitItem[];
  total: number;
  page: number;
  page_size: number;
  summary: InvestigationVisitSummary;
};

export function investigationVisitStatusLabel(status?: InvestigationVisitOverallStatus | null) {
  if (status === "sent") return "Sent";
  if (status === "partially_completed") return "Partially Completed";
  if (status === "completed") return "Completed";
  return "In progress";
}

export function investigationVisitStatusClass(status?: InvestigationVisitOverallStatus | null) {
  if (status === "sent") return "bg-panel-strong text-blue-strong";
  if (status === "partially_completed") return "bg-warning-soft text-warning";
  if (status === "completed") return "bg-success-soft text-success";
  return "bg-surface-2 text-muted-strong";
}

export function investigationStatusLabel(status?: InvestigationStatus | null) {
  if (status === "ordered") return "Ordered";
  if (status === "collected") return "Collected";
  if (status === "sent") return "Sent";
  if (status === "result_uploaded") return "Result uploaded";
  if (status === "completed") return "Completed";
  return "—";
}

export function investigationStatusClass(status?: InvestigationStatus | null) {
  if (status === "ordered") return "bg-panel text-blue";
  if (status === "collected") return "bg-warning-soft text-warning";
  if (status === "sent") return "bg-panel-strong text-blue-strong";
  if (status === "result_uploaded") return "bg-success-soft text-success";
  if (status === "completed") return "bg-success-soft text-success";
  return "bg-surface-2 text-muted-strong";
}

export function investigationPriorityLabel(priority?: InvestigationPriority | null) {
  if (priority === "emergency") return "Emergency";
  if (priority === "urgent") return "Urgent";
  if (priority === "normal") return "Normal";
  return "—";
}

export function investigationPriorityClass(priority?: InvestigationPriority | null) {
  if (priority === "emergency") return "bg-danger-soft text-danger";
  if (priority === "urgent") return "bg-warning-soft text-warning";
  if (priority === "normal") return "bg-success-soft text-success";
  return "bg-surface-2 text-muted-strong";
}

export type NurseDashboardSummary = {
  waiting_for_triage: number;
  triage_in_progress: number;
  to_doctor: number;
  under_nursing_care: number;
  samples_to_collect: number;
};

export type NursingPlanStatus = "none" | "ordered" | "in_progress" | "completed";
export type MonitoringStatus = "none" | "in_progress" | "completed";

export type NursingCareItem = {
  visit_id: string;
  patient_id: string;
  clinic_id: string;
  hotel_room_no: string | null;
  status: VisitCareStatus;
  nursing_plan_status: NursingPlanStatus;
  monitoring_status: MonitoringStatus;
  status_changed_at: string | null;
  clinic_name: string;
  hotel_name: string;
  patient_name: string;
  patient_mrn: string;
  patient_gender: string | null;
  patient_nationality: string | null;
  patient_age_at_visit: number | null;
  order_time: string | null;
  plan_id: string | null;
  plan_position: number;
  triage_category: TriageCategory | null;
  medication_count: number;
  procedure_count: number;
};

export type MonitoringOrderedService = {
  id: string;
  name: string;
  code: string;
  kind: "procedure" | "associated" | "medication_monitoring";
  detail: string | null;
  quantity: number | null;
  unit: string | null;
};

export type MonitoringItem = {
  visit_id: string;
  patient_id: string;
  clinic_id: string;
  hotel_room_no: string | null;
  status: VisitCareStatus;
  monitoring_status: MonitoringStatus;
  nursing_plan_status: NursingPlanStatus;
  clinic_name: string;
  hotel_name: string;
  patient_name: string;
  patient_mrn: string;
  patient_gender: string | null;
  patient_nationality: string | null;
  patient_age_at_visit: number | null;
  case_priority: CasePriority | null;
  ordered_services: MonitoringOrderedService[];
  observations?: MonitoringObservation[];
};

export type MonitoringObservation = {
  id: string;
  temperature_c: number | null;
  pulse: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
  blood_pressure: string | null;
  notes: string;
  case_priority?: CasePriority | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  recorded_at: string | null;
  sent_to_doctor_at: string | null;
};

export function nursingPlanStatusLabel(status?: NursingPlanStatus | null) {
  if (status === "ordered") return "Ordered";
  if (status === "in_progress") return "In Progress";
  if (status === "completed") return "Completed";
  return "—";
}

export function nursingPlanStatusClass(status?: NursingPlanStatus | null) {
  if (status === "ordered") return "bg-warning-soft text-warning";
  if (status === "in_progress") return "bg-panel text-blue";
  if (status === "completed") return "bg-success-soft text-success";
  return "bg-surface-2 text-muted-strong";
}

export function monitoringStatusLabel(status?: MonitoringStatus | null) {
  if (status === "in_progress") return "In Progress";
  if (status === "completed") return "Completed";
  return "—";
}

export function monitoringStatusClass(status?: MonitoringStatus | null) {
  if (status === "in_progress") return "bg-panel text-blue";
  if (status === "completed") return "bg-success-soft text-success";
  return "bg-surface-2 text-muted-strong";
}

export type CatalogMedication = {
  id: string;
  name: string;
  strength: string;
  dosage_form: string;
  route: string;
  unit_price_egp: number | null;
  unit_price_eur: number | null;
  is_diluent: boolean;
  routes?: {
    route: string;
    services: { id: string; name: string; code: string; unit: string; price: number | null; unit_price_egp?: number | null; unit_price_eur?: number | null; charge_once_per_plan?: boolean }[];
  }[];
  used_count?: number;
};

export type MedicationOrder = {
  id: string;
  medication_id: string | null;
  route: string;
  medication: string;
  strength: string;
  dosage_form: string;
  dose: string;
  dose_value: number | null;
  dose_unit: "" | "mg" | "g" | "mcg" | "mL" | "Ampule" | "Vial" | "Nebule" | "Syringe";
  frequency: string;
  duration: string;
  duration_value: number | null;
  duration_unit: "" | "minutes" | "hours" | "days";
  flow_rate: string;
  flow_rate_value: number | null;
  flow_rate_unit: "" | "mL/hr" | "drops/min" | "mL/min" | "mg/hr" | "mcg/min";
  diluent_medication_id: string | null;
  diluent_volume_value: number | null;
  infusion_duration_value: number | null;
  infusion_input: "rate" | "duration";
  monitoring_duration_value: number | null;
  monitoring_duration_unit: "" | "minutes" | "hours";
  instructions: string;
};

export type ProcedureOrder = {
  id: string;
  procedure_id: string | null;
  name: string;
  code: string;
  unit: string;
  price: number | null;
  quantity: number;
  notes: string;
  linked_medication_order_id?: string | null;
  billing_scope?: "order" | "plan";
  details?: ProcedureDetails;
};

export type PatientAdvice = {
  id: string;
  text: string;
};

export type ManagementPlanRecord = {
  id: string | null;
  position: number;
  status: NursingPlanStatus;
  medication_orders: MedicationOrder[];
  procedure_orders: ProcedureOrder[];
  patient_advices: PatientAdvice[];
  management_plan: string;
  clinical_assessment: string;
  assessment_status: "stable" | "needs_review" | "deteriorating" | null;
  created_at: string | null;
};

export type NursingPlanDetail = {
  visit: {
    id: string;
    patient_id: string;
    patient_name: string;
    patient_mrn: string;
    patient_gender: string | null;
    patient_nationality: string | null;
    patient_age_at_visit: number | null;
    hotel_room_no: string | null;
    hotel_name: string;
    clinic_id: string;
    clinic_name: string;
    visit_type: VisitType;
    nursing_plan_status: NursingPlanStatus;
    monitoring_status: MonitoringStatus;
    case_priority: CasePriority | null;
  };
  plan: {
    provisional_diagnoses: EncounterDiagnosis[];
    medication_orders: MedicationOrder[];
    procedure_orders: ProcedureOrder[];
    patient_advices: PatientAdvice[];
    management_plan: string;
    finished_at: string | null;
  };
  plans: ManagementPlanRecord[];
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
  unit_price_egp: number | null;
  unit_price_eur: number | null;
  charge_once_per_plan: boolean;
  procedure_form: string | null;
  used_count?: number;
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

export type DoctorMonitoringRecord = MonitoringObservation & {
  visit_id: string;
  patient_id: string;
  patient_name: string;
  patient_mrn: string;
  hotel_room_no: string | null;
  hotel_name?: string | null;
  monitoring_status: MonitoringStatus;
  visit_status: VisitCareStatus;
};

export type DoctorCasePage = {
  items: DoctorCase[];
  total: number;
  page: number;
  page_size: number;
  summary?: DoctorCaseSummary;
  monitoring?: DoctorMonitoringRecord[];
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
