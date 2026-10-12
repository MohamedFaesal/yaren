CREATE TABLE clinic_wait_settings (
  clinic_id uuid PRIMARY KEY REFERENCES clinics (id),
  triage_wait_minutes integer NOT NULL CHECK (triage_wait_minutes BETWEEN 1 AND 720),
  doctor_wait_minutes integer NOT NULL CHECK (doctor_wait_minutes BETWEEN 1 AND 720),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id)
);
