ALTER TABLE patient_visit_encounters
  ADD COLUMN provisional_diagnosis_code text;

ALTER TABLE patient_visit_encounters
  ADD CONSTRAINT patient_visit_encounters_diagnosis_code_check
  CHECK (
    provisional_diagnosis_code IS NULL
    OR provisional_diagnosis_code ~ '^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$'
  );
