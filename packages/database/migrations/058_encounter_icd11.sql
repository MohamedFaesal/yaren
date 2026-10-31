ALTER TABLE patient_visit_encounters
  DROP CONSTRAINT IF EXISTS patient_visit_encounters_diagnosis_code_check;

ALTER TABLE patient_visit_encounters
  ADD CONSTRAINT patient_visit_encounters_diagnosis_code_check
  CHECK (
    provisional_diagnosis_code IS NULL
    OR provisional_diagnosis_code ~ '^[A-Z0-9][A-Z0-9]{2,6}(\.[A-Z0-9]{1,4})?$'
  );
