ALTER TABLE patient_visits
  ADD COLUMN visit_type text NOT NULL DEFAULT 'new';

ALTER TABLE patient_visits
  ADD CONSTRAINT patient_visits_visit_type_check
  CHECK (visit_type IN ('new', 'follow-up'));
