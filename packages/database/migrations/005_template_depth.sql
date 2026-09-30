ALTER TABLE clinical.consultations ADD COLUMN IF NOT EXISTS exam_systems jsonb;
ALTER TABLE clinical.investigations ADD COLUMN IF NOT EXISTS safety jsonb;
ALTER TABLE clinical.investigations ADD COLUMN IF NOT EXISTS critical_value text;
ALTER TABLE billing.coverage ADD COLUMN IF NOT EXISTS verification_method text;
ALTER TABLE billing.coverage ADD COLUMN IF NOT EXISTS verification_reference text;

CREATE TABLE IF NOT EXISTS clinical.distributions (
  id uuid PRIMARY KEY,
  encounter_id uuid NOT NULL,
  channel text NOT NULL,
  recipient text NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO identity.settings (key, value) VALUES
  ('insurer_mode', 'ruleset'),
  ('insurer_adapter_url', ''),
  ('insurer_adapter_host', '')
ON CONFLICT (key) DO NOTHING;
