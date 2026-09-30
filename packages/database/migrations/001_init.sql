CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS organization;
CREATE SCHEMA IF NOT EXISTS patient_registry;
CREATE SCHEMA IF NOT EXISTS scheduling;

CREATE TABLE identity.users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL,
  center_id uuid,
  status text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE organization.medical_centers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  address_line text NOT NULL,
  city text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE SEQUENCE patient_registry.mrn_seq;

CREATE TABLE patient_registry.patients (
  id uuid PRIMARY KEY,
  medical_record_number text NOT NULL UNIQUE,
  given_name text NOT NULL,
  family_name text NOT NULL,
  date_of_birth date NOT NULL,
  sex text NOT NULL,
  phone text NOT NULL,
  national_id text,
  created_at timestamptz NOT NULL
);

CREATE TABLE scheduling.appointments (
  id uuid PRIMARY KEY,
  patient_id uuid NOT NULL,
  practitioner_id uuid NOT NULL,
  center_id uuid NOT NULL,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  reason text NOT NULL,
  status text NOT NULL,
  cancellation_reason text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX appointments_practitioner_window_idx
  ON scheduling.appointments (practitioner_id, scheduled_start, scheduled_end);
