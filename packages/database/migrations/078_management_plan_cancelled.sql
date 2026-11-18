ALTER TABLE patient_visit_encounters
  DROP CONSTRAINT IF EXISTS patient_visit_encounters_nursing_status_check;

ALTER TABLE patient_visit_encounters
  ADD CONSTRAINT patient_visit_encounters_nursing_status_check
    CHECK (nursing_status IN ('none', 'ordered', 'in_progress', 'completed', 'cancelled'));

ALTER TABLE patient_visit_management_plans
  DROP CONSTRAINT IF EXISTS patient_visit_management_plans_status_check;

ALTER TABLE patient_visit_management_plans
  ADD CONSTRAINT patient_visit_management_plans_status_check
    CHECK (status IN ('ordered', 'in_progress', 'completed', 'cancelled'));
