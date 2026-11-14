ALTER TABLE patient_visits
  ADD COLUMN IF NOT EXISTS monitoring_completed_at timestamptz;

UPDATE patient_visits AS v
SET monitoring_completed_at = COALESCE(
  (
    SELECT MAX(o.updated_at)
    FROM patient_visit_nurse_observations o
    WHERE o.visit_id = v.id
  ),
  v.updated_at
)
WHERE v.monitoring_status = 'completed'
  AND v.monitoring_completed_at IS NULL;
