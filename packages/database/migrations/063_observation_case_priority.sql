ALTER TABLE patient_visit_nurse_observations
  ADD COLUMN case_priority text
    CHECK (case_priority IS NULL OR case_priority IN ('stable', 'urgent', 'emergency'));
