ALTER TABLE patient_visit_encounters
  ADD COLUMN provisional_diagnoses jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE patient_visit_encounters
SET provisional_diagnoses = jsonb_build_array(
  jsonb_build_object(
    'code', provisional_diagnosis_code,
    'title', COALESCE(NULLIF(btrim(provisional_diagnosis), ''), provisional_diagnosis_code)
  )
)
WHERE provisional_diagnosis_code IS NOT NULL
  AND provisional_diagnoses = '[]'::jsonb;
