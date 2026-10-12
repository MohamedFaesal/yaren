ALTER TABLE patient_visits DROP CONSTRAINT patient_visits_status_check;

ALTER TABLE patient_visits
  ADD CONSTRAINT patient_visits_status_check
  CHECK (status IN ('waiting_for_triage', 'to_doctor', 'seen'));

CREATE TABLE patient_visit_encounters (
  visit_id uuid PRIMARY KEY REFERENCES patient_visits (id) ON DELETE CASCADE,
  chief_complaint text,
  history_of_present_illness text,
  past_history text,
  temperature_c numeric(4, 1),
  pulse integer,
  respiratory_rate integer,
  blood_pressure text,
  spo2 integer,
  pain_score integer,
  vitals_recorded_at timestamptz,
  examination jsonb NOT NULL DEFAULT '{}'::jsonb,
  provisional_diagnosis text,
  investigations jsonb NOT NULL DEFAULT '[]'::jsonb,
  management_plan text,
  allergies jsonb NOT NULL DEFAULT '[]'::jsonb,
  medications jsonb NOT NULL DEFAULT '[]'::jsonb,
  finished_at timestamptz,
  finished_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE patient_visit_encounter_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES patient_visits (id) ON DELETE CASCADE,
  file_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX patient_visit_encounter_files_visit_id_idx
  ON patient_visit_encounter_files (visit_id, created_at DESC);
