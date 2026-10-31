ALTER TABLE patient_visits
  ADD COLUMN assigned_nurse_id uuid REFERENCES users (id);

CREATE INDEX patient_visits_assigned_nurse_id_idx
  ON patient_visits (assigned_nurse_id)
  WHERE deleted_at IS NULL AND assigned_nurse_id IS NOT NULL;
