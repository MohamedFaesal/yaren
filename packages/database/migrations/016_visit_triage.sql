ALTER TABLE patient_visits
  ADD COLUMN status text NOT NULL DEFAULT 'waiting_for_triage',
  ADD COLUMN status_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN assigned_doctor_id uuid REFERENCES users (id);

ALTER TABLE patient_visits
  ADD CONSTRAINT patient_visits_status_check
  CHECK (status IN ('waiting_for_triage', 'to_doctor'));

UPDATE patient_visits
SET status = 'waiting_for_triage',
    status_changed_at = created_at
WHERE deleted_at IS NULL OR deleted_at IS NOT NULL;

CREATE INDEX patient_visits_clinic_status_idx
  ON patient_visits (clinic_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE patient_visit_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES patient_visits (id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES users (id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX patient_visit_status_history_visit_id_idx
  ON patient_visit_status_history (visit_id, created_at DESC);

INSERT INTO patient_visit_status_history (visit_id, from_status, to_status, changed_by, created_at)
SELECT id, NULL, 'waiting_for_triage', NULL, created_at
FROM patient_visits;

CREATE TABLE patient_visit_triages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL UNIQUE REFERENCES patient_visits (id) ON DELETE CASCADE,
  chief_complaint text,
  temperature_c numeric(4, 1),
  pulse integer,
  respiratory_rate integer,
  spo2 integer,
  allergies jsonb NOT NULL DEFAULT '[]'::jsonb,
  medications jsonb NOT NULL DEFAULT '[]'::jsonb,
  relevant_history text[] NOT NULL DEFAULT '{}',
  relevant_history_other text,
  initial_assessment text,
  triage_category text
    CHECK (triage_category IS NULL OR triage_category IN ('emergency', 'urgent', 'normal')),
  assigned_doctor_id uuid REFERENCES users (id),
  started_by uuid REFERENCES users (id),
  started_at timestamptz,
  completed_by uuid REFERENCES users (id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX patient_visit_triages_visit_id_idx ON patient_visit_triages (visit_id);
