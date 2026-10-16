ALTER TABLE patient_visits DROP CONSTRAINT patient_visits_status_check;

ALTER TABLE patient_visits
  ADD CONSTRAINT patient_visits_status_check
  CHECK (status IN (
    'waiting_for_triage',
    'to_doctor',
    'seen',
    'waiting_for_investigation',
    'diagnosed',
    'pending_payment'
  ));
