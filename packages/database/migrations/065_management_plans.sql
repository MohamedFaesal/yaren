CREATE TABLE patient_visit_management_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES patient_visits (id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 2),
  medication_orders jsonb NOT NULL DEFAULT '[]'::jsonb,
  procedure_orders jsonb NOT NULL DEFAULT '[]'::jsonb,
  clinical_assessment text NOT NULL DEFAULT '',
  assessment_status text CHECK (assessment_status IS NULL OR assessment_status IN ('stable', 'needs_review', 'deteriorating')),
  observation_id uuid REFERENCES patient_visit_nurse_observations (id) ON DELETE SET NULL,
  created_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visit_id, position)
);

CREATE INDEX patient_visit_management_plans_visit_id_idx
  ON patient_visit_management_plans (visit_id, position);

ALTER TABLE patient_visit_monitoring_assessments
  ADD COLUMN plan_id uuid REFERENCES patient_visit_management_plans (id) ON DELETE SET NULL;
