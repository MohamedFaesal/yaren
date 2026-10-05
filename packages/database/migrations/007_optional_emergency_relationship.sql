ALTER TABLE patient_visits
  DROP CONSTRAINT IF EXISTS patient_visits_emergency_contact_relationship_check;

ALTER TABLE patient_visits
  ALTER COLUMN emergency_contact_relationship DROP NOT NULL;

ALTER TABLE patient_visits
  ADD CONSTRAINT patient_visits_emergency_contact_relationship_check
  CHECK (
    emergency_contact_relationship IS NULL
    OR emergency_contact_relationship IN (
      'spouse', 'son', 'daughter', 'father', 'mother', 'cousin', 'grandfather', 'grandmother'
    )
  );
