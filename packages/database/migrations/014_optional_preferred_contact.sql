ALTER TABLE patient_visits
  DROP CONSTRAINT IF EXISTS patient_visits_preferred_contact_method_check;

ALTER TABLE patient_visits
  ALTER COLUMN preferred_contact_method DROP NOT NULL;

ALTER TABLE patient_visits
  ADD CONSTRAINT patient_visits_preferred_contact_method_check
  CHECK (
    preferred_contact_method IS NULL
    OR preferred_contact_method = ANY (ARRAY['phone'::text, 'email'::text, 'whatsapp'::text])
  );
