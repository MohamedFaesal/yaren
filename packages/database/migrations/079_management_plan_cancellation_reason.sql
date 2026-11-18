ALTER TABLE patient_visit_encounters
  ADD COLUMN IF NOT EXISTS cancellation_reason text NOT NULL DEFAULT '';

ALTER TABLE patient_visit_management_plans
  ADD COLUMN IF NOT EXISTS cancellation_reason text NOT NULL DEFAULT '';
