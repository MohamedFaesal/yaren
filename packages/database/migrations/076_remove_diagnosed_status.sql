INSERT INTO patient_visit_status_history (visit_id, from_status, to_status, changed_by, note)
SELECT v.id, 'diagnosed', 'encounter_complete', v.assigned_doctor_id, 'Diagnosed status retired'
FROM patient_visits v
WHERE v.status = 'diagnosed';

UPDATE patient_visits
SET status = 'encounter_complete',
    status_changed_at = now(),
    updated_at = now()
WHERE status = 'diagnosed';

ALTER TABLE patient_visits DROP CONSTRAINT IF EXISTS patient_visits_status_check;

ALTER TABLE patient_visits
  ADD CONSTRAINT patient_visits_status_check
  CHECK (status IN (
    'waiting_for_triage',
    'to_doctor',
    'consultation_in_progress',
    'seen',
    'waiting_for_investigation',
    'under_nursing_care',
    'encounter_complete',
    'referred',
    'pending_payment',
    'patient_left'
  ));
