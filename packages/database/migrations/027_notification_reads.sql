CREATE TABLE notification_reads (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  visit_id uuid NOT NULL REFERENCES patient_visits (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('waiting_for_triage', 'to_doctor')),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, visit_id, kind)
);
