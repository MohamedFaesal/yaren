ALTER TABLE patient_visit_triages
  ADD COLUMN relevant_history_items jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE patient_visit_triages
SET relevant_history_items = jsonb_build_array(jsonb_build_object('name', btrim(relevant_history_other)))
WHERE relevant_history_other IS NOT NULL
  AND btrim(relevant_history_other) <> '';

UPDATE patient_visit_triages
SET relevant_history = array_remove(relevant_history, 'other'),
    relevant_history_other = NULL
WHERE 'other' = ANY (relevant_history)
   OR relevant_history_other IS NOT NULL;
