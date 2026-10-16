ALTER TABLE patient_visit_triages
  ADD COLUMN blood_pressure text;

ALTER TABLE patient_visit_triages
  ADD CONSTRAINT patient_visit_triages_blood_pressure_check
  CHECK (
    blood_pressure IS NULL
    OR blood_pressure ~ '^\d{2,3}/\d{2,3}$'
  );
