ALTER TABLE patient_visit_nurse_observations
  ADD COLUMN IF NOT EXISTS doctor_noted_at timestamptz,
  ADD COLUMN IF NOT EXISTS nurse_viewed_at timestamptz;

-- Existing doctor notes are treated as already seen by nursing.
UPDATE patient_visit_nurse_observations
SET doctor_noted_at = COALESCE(updated_at, recorded_at, now()),
    nurse_viewed_at = COALESCE(nurse_viewed_at, updated_at, recorded_at, now())
WHERE (doctor_assessment IS NOT NULL OR btrim(clinical_assessment) <> '')
  AND doctor_noted_at IS NULL;
