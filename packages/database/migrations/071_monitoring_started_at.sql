ALTER TABLE patient_visits
  ADD COLUMN IF NOT EXISTS monitoring_started_at timestamptz;

UPDATE patient_visits AS v
SET monitoring_started_at = COALESCE(
  (
    SELECT MIN(o.recorded_at)
    FROM patient_visit_nurse_observations o
    WHERE o.visit_id = v.id
  ),
  v.status_changed_at,
  v.updated_at
)
WHERE v.monitoring_status IN ('in_progress', 'completed')
  AND v.monitoring_started_at IS NULL;
