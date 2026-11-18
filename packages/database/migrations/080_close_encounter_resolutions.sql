ALTER TABLE patient_visit_investigations
  DROP CONSTRAINT IF EXISTS patient_visit_investigations_status_check;

ALTER TABLE patient_visit_investigations
  ADD CONSTRAINT patient_visit_investigations_status_check
    CHECK (status IN ('ordered', 'collected', 'sent', 'result_uploaded', 'completed', 'cancelled'));

ALTER TABLE patient_visit_investigations
  ADD COLUMN IF NOT EXISTS cancellation_reason text NOT NULL DEFAULT '';

ALTER TABLE patient_visits
  DROP CONSTRAINT IF EXISTS patient_visits_monitoring_status_check;

ALTER TABLE patient_visits
  ADD CONSTRAINT patient_visits_monitoring_status_check
    CHECK (monitoring_status IN ('none', 'in_progress', 'completed', 'cancelled'));

ALTER TABLE patient_visits
  ADD COLUMN IF NOT EXISTS monitoring_cancellation_reason text NOT NULL DEFAULT '';

ALTER TABLE patient_visits
  ADD COLUMN IF NOT EXISTS referral_note text NOT NULL DEFAULT '';
