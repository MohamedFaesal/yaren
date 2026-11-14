ALTER TABLE patient_visit_nurse_observations
  ADD COLUMN IF NOT EXISTS doctor_assessment text,
  ADD COLUMN IF NOT EXISTS clinical_assessment text NOT NULL DEFAULT '';

ALTER TABLE patient_visit_nurse_observations
  DROP CONSTRAINT IF EXISTS patient_visit_nurse_observations_doctor_assessment_check;

ALTER TABLE patient_visit_nurse_observations
  ADD CONSTRAINT patient_visit_nurse_observations_doctor_assessment_check
  CHECK (doctor_assessment IS NULL OR doctor_assessment IN ('stable', 'needs_review', 'deteriorating'));
