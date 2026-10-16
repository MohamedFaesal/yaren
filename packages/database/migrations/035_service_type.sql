ALTER TABLE medical_services
  ADD COLUMN service_type text NOT NULL DEFAULT 'Medical service';

UPDATE medical_services
SET service_type = 'Investigation service'
WHERE deleted_at IS NULL
  AND category IN ('Laboratory', 'Imaging', 'Diagnostic Services');

UPDATE medical_services
SET service_type = 'Procedure service'
WHERE deleted_at IS NULL
  AND category = 'Procedures & Wound Care';

ALTER TABLE medical_services
  ADD CONSTRAINT medical_services_type_check
  CHECK (service_type IN ('Medical service', 'Investigation service', 'Procedure service'));

ALTER TABLE medical_services
  ALTER COLUMN service_type DROP DEFAULT;
