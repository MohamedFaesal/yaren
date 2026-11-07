ALTER TABLE patient_visit_encounters
  ADD COLUMN case_priority text
    CHECK (case_priority IS NULL OR case_priority IN ('stable', 'urgent', 'emergency'));
