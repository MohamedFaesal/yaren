CREATE SCHEMA IF NOT EXISTS clinical;
CREATE SCHEMA IF NOT EXISTS pharmacy;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS coordination;
CREATE SCHEMA IF NOT EXISTS quality;

ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS hotel_id uuid;
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS license_no text;

CREATE TABLE IF NOT EXISTS identity.audit_events (
  id uuid PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO identity.settings (key, value) VALUES
  ('clinic_name', 'Yaren Healthcare'),
  ('legal_entity', 'Yaren Healthcare'),
  ('currency', 'EGP'),
  ('tax_percent', '14'),
  ('tagline', 'Care Beyond Your Stay')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS organization.hotels (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'active',
  contract_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization.clinics (
  id uuid PRIMARY KEY,
  hotel_id uuid REFERENCES organization.hotels(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS organization.services (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS organization.insurers (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pharmacy.medications (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  strength text NOT NULL,
  form text NOT NULL,
  reorder_level integer NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS pharmacy.batches (
  id uuid PRIMARY KEY,
  medication_id uuid NOT NULL REFERENCES pharmacy.medications(id),
  lot text NOT NULL,
  expiry_date date NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 0),
  location text NOT NULL DEFAULT 'Main pharmacy'
);

ALTER TABLE patient_registry.patients
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS home_address text,
  ADD COLUMN IF NOT EXISTS passport_no text,
  ADD COLUMN IF NOT EXISTS hotel_id uuid,
  ADD COLUMN IF NOT EXISTS room_no text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS arrival_date date,
  ADD COLUMN IF NOT EXISTS departure_date date,
  ADD COLUMN IF NOT EXISTS tour_operator text,
  ADD COLUMN IF NOT EXISTS insurer_name text,
  ADD COLUMN IF NOT EXISTS policy_number text,
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS chronic_conditions text,
  ADD COLUMN IF NOT EXISTS regular_medications text,
  ADD COLUMN IF NOT EXISTS other_alerts text;

CREATE SEQUENCE IF NOT EXISTS clinical.ticket_seq;
CREATE SEQUENCE IF NOT EXISTS clinical.encounter_seq;
CREATE SEQUENCE IF NOT EXISTS clinical.rx_seq;
CREATE SEQUENCE IF NOT EXISTS clinical.investigation_seq;
CREATE SEQUENCE IF NOT EXISTS billing.invoice_seq;
CREATE SEQUENCE IF NOT EXISTS billing.claim_seq;
CREATE SEQUENCE IF NOT EXISTS coordination.referral_seq;
CREATE SEQUENCE IF NOT EXISTS coordination.transfer_seq;
CREATE SEQUENCE IF NOT EXISTS coordination.request_seq;

CREATE TABLE IF NOT EXISTS clinical.encounters (
  id uuid PRIMARY KEY,
  ticket_no text NOT NULL UNIQUE,
  encounter_no text NOT NULL UNIQUE,
  patient_id uuid NOT NULL,
  hotel_id uuid,
  clinic_id uuid,
  room_no text,
  visit_type text NOT NULL,
  status text NOT NULL,
  assigned_to uuid,
  arrival_at timestamptz NOT NULL,
  created_by uuid,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS clinical.triage (
  encounter_id uuid PRIMARY KEY REFERENCES clinical.encounters(id),
  temperature numeric(4,1),
  systolic integer,
  diastolic integer,
  pulse integer,
  respiratory_rate integer,
  spo2 integer,
  pain_score integer,
  chief_complaint text,
  notes text,
  category text,
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinical.consultations (
  encounter_id uuid PRIMARY KEY REFERENCES clinical.encounters(id),
  chief_complaint text,
  hpi text,
  past_history text,
  allergies text,
  examination text,
  diagnosis text,
  icd10 text,
  secondary_diagnoses text,
  plan text,
  status text NOT NULL DEFAULT 'draft',
  physician_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);

CREATE TABLE IF NOT EXISTS clinical.prescriptions (
  id uuid PRIMARY KEY,
  rx_no text NOT NULL UNIQUE,
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  prescriber_id uuid,
  indication text,
  instructions text,
  follow_up text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinical.prescription_items (
  id uuid PRIMARY KEY,
  prescription_id uuid NOT NULL REFERENCES clinical.prescriptions(id),
  medication_id uuid,
  medication_name text NOT NULL,
  strength text,
  dose text NOT NULL,
  route text NOT NULL,
  frequency text NOT NULL,
  duration text NOT NULL,
  quantity integer NOT NULL
);

CREATE TABLE IF NOT EXISTS clinical.investigations (
  id uuid PRIMARY KEY,
  request_no text NOT NULL UNIQUE,
  encounter_id uuid NOT NULL,
  priority text NOT NULL,
  tests jsonb NOT NULL,
  indication text,
  diagnosis text,
  icd10 text,
  anatomical_site text,
  status text NOT NULL DEFAULT 'requested',
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinical.reports (
  encounter_id uuid PRIMARY KEY REFERENCES clinical.encounters(id),
  summary text,
  findings text,
  treatment text,
  follow_up text,
  certificate_type text,
  fit_decision text,
  restrictions text,
  status text NOT NULL DEFAULT 'draft',
  signed_by uuid,
  signed_at timestamptz
);

CREATE TABLE IF NOT EXISTS clinical.progress_notes (
  id uuid PRIMARY KEY,
  encounter_id uuid NOT NULL,
  note text NOT NULL,
  follow_up text,
  author_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pharmacy.dispenses (
  id uuid PRIMARY KEY,
  prescription_id uuid NOT NULL UNIQUE,
  encounter_id uuid NOT NULL,
  pharmacist_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pharmacy.dispense_lines (
  id uuid PRIMARY KEY,
  dispense_id uuid NOT NULL REFERENCES pharmacy.dispenses(id),
  batch_id uuid NOT NULL,
  medication_id uuid NOT NULL,
  quantity integer NOT NULL
);

CREATE TABLE IF NOT EXISTS billing.coverage (
  id uuid PRIMARY KEY,
  patient_id uuid NOT NULL,
  encounter_id uuid,
  insurer text NOT NULL,
  policy_number text,
  tpa text,
  status text NOT NULL,
  deductible text,
  coinsurance text,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.invoices (
  id uuid PRIMARY KEY,
  invoice_no text NOT NULL UNIQUE,
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  status text NOT NULL,
  currency text NOT NULL,
  subtotal numeric(12,2) NOT NULL,
  discount numeric(12,2) NOT NULL,
  tax numeric(12,2) NOT NULL,
  insurance_cover numeric(12,2) NOT NULL,
  patient_payable numeric(12,2) NOT NULL,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  outstanding numeric(12,2) NOT NULL,
  payer_type text NOT NULL,
  notes text,
  created_by uuid,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.invoice_lines (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES billing.invoices(id),
  code text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  quantity numeric(12,2) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  discount_percent numeric(6,2) NOT NULL,
  tax_percent numeric(6,2) NOT NULL,
  gross numeric(12,2) NOT NULL,
  discount numeric(12,2) NOT NULL,
  tax numeric(12,2) NOT NULL,
  net numeric(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS billing.payments (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES billing.invoices(id),
  method text NOT NULL,
  amount numeric(12,2) NOT NULL,
  reference text,
  collected_by uuid,
  paid_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.claims (
  id uuid PRIMARY KEY,
  claim_no text NOT NULL UNIQUE,
  encounter_id uuid NOT NULL,
  invoice_id uuid,
  patient_id uuid NOT NULL,
  status text NOT NULL,
  claim_type text NOT NULL,
  insurer_reference text,
  authorization_ref text,
  amount numeric(12,2),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coordination.referrals (
  id uuid PRIMARY KEY,
  referral_no text NOT NULL UNIQUE,
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  reason text NOT NULL,
  facility text NOT NULL,
  department text,
  priority text NOT NULL,
  referral_type text NOT NULL,
  transport text,
  status text NOT NULL,
  physician_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coordination.transfers (
  id uuid PRIMARY KEY,
  transfer_no text NOT NULL UNIQUE,
  referral_id uuid,
  encounter_id uuid NOT NULL,
  destination text NOT NULL,
  priority text NOT NULL,
  status text NOT NULL,
  reason text,
  snapshot text,
  dispatch_at timestamptz,
  arrival_at timestamptz,
  departure_at timestamptz,
  destination_arrival_at timestamptz,
  handover_at timestamptz,
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coordination.service_requests (
  id uuid PRIMARY KEY,
  request_no text NOT NULL UNIQUE,
  hotel_id uuid NOT NULL,
  patient_id uuid,
  encounter_id uuid,
  guest_name text NOT NULL,
  room_no text,
  request_type text NOT NULL,
  priority text NOT NULL,
  status text NOT NULL,
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quality.feedback (
  id uuid PRIMARY KEY,
  patient_name text,
  hotel_id uuid,
  room_no text,
  phone text,
  email text,
  nps integer NOT NULL,
  comment text,
  source text,
  publish_consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quality.incidents (
  id uuid PRIMARY KEY,
  severity text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  root_cause text,
  action text,
  status text NOT NULL,
  reported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO organization.hotels (id, name, city, phone) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Yaren Marina Resort', 'Hurghada', '+20 65 000 1000'),
  ('22222222-2222-4222-8222-222222222222', 'Yaren Nile House', 'Cairo', '+20 2 000 2000')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization.clinics (id, hotel_id, name) VALUES
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Marina Hotel Clinic'),
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'Nile House Clinic')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization.services (id, code, name, category, unit_price) VALUES
  ('55555555-5555-4555-8555-555555555555', '99213', 'Medical consultation', 'service', 800),
  ('55555555-5555-4555-8555-555555555556', '99281', 'Emergency assessment', 'service', 1500),
  ('55555555-5555-4555-8555-555555555557', 'ROOM', 'Doctor to room', 'service', 1200)
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization.insurers (id, name) VALUES
  ('66666666-6666-4666-8666-666666666666', 'Nile Assist'),
  ('66666666-6666-4666-8666-666666666667', 'Red Sea TPA')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pharmacy.medications (id, code, name, strength, form, reorder_level) VALUES
  ('77777777-7777-4777-8777-777777777777', 'PARA-500', 'Paracetamol', '500 mg', 'tablet', 20),
  ('77777777-7777-4777-8777-777777777778', 'ORS-1', 'Oral rehydration salts', 'sachet', 'sachet', 15),
  ('77777777-7777-4777-8777-777777777779', 'CET-10', 'Cetirizine', '10 mg', 'tablet', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO pharmacy.batches (id, medication_id, lot, expiry_date, quantity) VALUES
  ('88888888-8888-4888-8888-888888888881', '77777777-7777-4777-8777-777777777777', 'LOT-P-24', '2027-06-30', 200),
  ('88888888-8888-4888-8888-888888888882', '77777777-7777-4777-8777-777777777778', 'LOT-O-24', '2027-01-31', 80),
  ('88888888-8888-4888-8888-888888888883', '77777777-7777-4777-8777-777777777779', 'LOT-C-24', '2026-12-31', 40)
ON CONFLICT (id) DO NOTHING;
