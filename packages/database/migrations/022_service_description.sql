ALTER TABLE medical_services
  ADD COLUMN description text;

ALTER TABLE medical_services
  ADD CONSTRAINT medical_services_description_length_check
  CHECK (description IS NULL OR length(description) <= 500);
