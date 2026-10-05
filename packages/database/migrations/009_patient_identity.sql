ALTER TABLE patients ADD COLUMN identity_number text;

CREATE UNIQUE INDEX patients_identity_active_unique
  ON patients (lower(identity_number))
  WHERE deleted_at IS NULL AND identity_number IS NOT NULL;

UPDATE patients p
SET identity_number = v.passport_number
FROM (
  SELECT DISTINCT ON (patient_id) patient_id, passport_number
  FROM patient_visits
  WHERE deleted_at IS NULL
  ORDER BY patient_id, created_at DESC
) v
WHERE p.id = v.patient_id
  AND p.deleted_at IS NULL
  AND p.identity_number IS NULL;
