ALTER TABLE patient_visit_encounters
  ADD COLUMN medication_orders jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN procedure_orders jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN patient_advices jsonb NOT NULL DEFAULT '[]'::jsonb;
