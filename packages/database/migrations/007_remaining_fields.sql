ALTER TABLE clinical.reports ADD COLUMN IF NOT EXISTS airline text;
ALTER TABLE clinical.reports ADD COLUMN IF NOT EXISTS travel_date date;
ALTER TABLE clinical.investigations ADD COLUMN IF NOT EXISTS receiving_lab text;
ALTER TABLE clinical.investigations ADD COLUMN IF NOT EXISTS received_at timestamptz;
