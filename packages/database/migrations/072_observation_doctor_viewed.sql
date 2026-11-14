ALTER TABLE patient_visit_nurse_observations
  ADD COLUMN IF NOT EXISTS doctor_viewed_at timestamptz;
