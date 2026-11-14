ALTER TABLE notification_reads DROP CONSTRAINT IF EXISTS notification_reads_kind_check;

ALTER TABLE notification_reads
  ADD CONSTRAINT notification_reads_kind_check
  CHECK (kind IN ('waiting_for_triage', 'to_doctor', 'nurse_record'));
