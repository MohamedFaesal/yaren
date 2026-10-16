ALTER TABLE medical_services
  DROP CONSTRAINT IF EXISTS medical_services_subcategory_check;

ALTER TABLE medical_services
  DROP COLUMN IF EXISTS subcategory;
