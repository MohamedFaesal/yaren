CREATE TABLE patient_visit_monitoring_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES patient_visits (id) ON DELETE CASCADE,
  observation_id uuid REFERENCES patient_visit_nurse_observations (id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('stable', 'needs_review', 'deteriorating')),
  clinical_assessment text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX patient_visit_monitoring_assessments_visit_id_idx
  ON patient_visit_monitoring_assessments (visit_id, created_at DESC);
