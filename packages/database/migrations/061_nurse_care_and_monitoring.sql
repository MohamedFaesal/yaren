ALTER TABLE patient_visits
  ADD COLUMN nursing_plan_status text NOT NULL DEFAULT 'none'
    CHECK (nursing_plan_status IN ('none', 'ordered', 'in_progress', 'completed')),
  ADD COLUMN monitoring_status text NOT NULL DEFAULT 'none'
    CHECK (monitoring_status IN ('none', 'in_progress', 'completed'));

CREATE TABLE patient_visit_nurse_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES patient_visits (id) ON DELETE CASCADE,
  temperature_c numeric(4, 1),
  pulse integer,
  respiratory_rate integer,
  spo2 integer,
  blood_pressure text,
  notes text NOT NULL DEFAULT '',
  recorded_by uuid REFERENCES users (id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  sent_to_doctor_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX patient_visit_nurse_observations_visit_id_idx
  ON patient_visit_nurse_observations (visit_id, recorded_at DESC);

CREATE INDEX patient_visits_nursing_plan_status_idx
  ON patient_visits (nursing_plan_status)
  WHERE deleted_at IS NULL AND nursing_plan_status <> 'none';

CREATE INDEX patient_visits_monitoring_status_idx
  ON patient_visits (monitoring_status)
  WHERE deleted_at IS NULL AND monitoring_status <> 'none';
