ALTER TABLE medical_services
  ADD COLUMN charge_once_per_plan boolean NOT NULL DEFAULT false;

UPDATE medical_services
SET charge_once_per_plan = true
WHERE deleted_at IS NULL
  AND code = 'YRN-MP-001';
