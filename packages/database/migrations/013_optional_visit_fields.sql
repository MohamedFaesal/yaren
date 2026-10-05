ALTER TABLE patient_visits
  ALTER COLUMN emergency_contact_name DROP NOT NULL,
  ALTER COLUMN emergency_contact_phone DROP NOT NULL,
  ALTER COLUMN hotel_checkin_date DROP NOT NULL,
  ALTER COLUMN hotel_room_no DROP NOT NULL;

ALTER TABLE patient_visits
  DROP CONSTRAINT IF EXISTS patient_visits_emergency_contact_relationship_check;

ALTER TABLE patient_visits
  ADD CONSTRAINT patient_visits_emergency_contact_relationship_check
  CHECK (
    emergency_contact_relationship IS NULL
    OR emergency_contact_relationship IN (
      'spouse', 'son', 'daughter', 'father', 'mother', 'cousin',
      'grandfather', 'grandmother', 'girlfriend', 'boyfriend'
    )
  );

ALTER TABLE patient_visits DROP CONSTRAINT IF EXISTS patient_visits_check;
ALTER TABLE patient_visits DROP CONSTRAINT IF EXISTS patient_visits_hotel_checkout_date_check;
ALTER TABLE patient_visits DROP CONSTRAINT IF EXISTS patient_visits_checkout_after_checkin_check;

ALTER TABLE patient_visits
  ADD CONSTRAINT patient_visits_checkout_after_checkin_check
  CHECK (
    hotel_checkout_date IS NULL
    OR hotel_checkin_date IS NULL
    OR hotel_checkout_date >= hotel_checkin_date
  );
