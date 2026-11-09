ALTER TABLE patient_visit_encounters
  ADD COLUMN nursing_status text NOT NULL DEFAULT 'none'
  CHECK (nursing_status IN ('none', 'ordered', 'in_progress', 'completed'));

UPDATE patient_visit_encounters e
SET nursing_status = v.nursing_plan_status
FROM patient_visits v
WHERE v.id = e.visit_id
  AND v.nursing_plan_status IN ('ordered', 'in_progress', 'completed');

ALTER TABLE patient_visit_management_plans
  ADD COLUMN status text NOT NULL DEFAULT 'ordered'
  CHECK (status IN ('ordered', 'in_progress', 'completed'));

UPDATE patient_visit_management_plans p
SET status = v.nursing_plan_status
FROM patient_visits v
WHERE v.id = p.visit_id
  AND v.nursing_plan_status IN ('ordered', 'in_progress', 'completed');
