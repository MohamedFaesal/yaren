ALTER TABLE clinical.investigations ADD COLUMN IF NOT EXISTS contrast boolean NOT NULL DEFAULT false;
ALTER TABLE clinical.investigations ADD COLUMN IF NOT EXISTS safety_acknowledged boolean NOT NULL DEFAULT false;
ALTER TABLE clinical.investigations ADD COLUMN IF NOT EXISTS result_text text;
ALTER TABLE clinical.investigations ADD COLUMN IF NOT EXISTS critical boolean NOT NULL DEFAULT false;

ALTER TABLE clinical.progress_notes ADD COLUMN IF NOT EXISTS follow_up_due date;
ALTER TABLE clinical.progress_notes ADD COLUMN IF NOT EXISTS signed boolean NOT NULL DEFAULT false;

ALTER TABLE clinical.prescription_items ADD COLUMN IF NOT EXISTS allergy_ack boolean NOT NULL DEFAULT false;

ALTER TABLE billing.claims ADD COLUMN IF NOT EXISTS settlement_amount numeric(12,2);

CREATE TABLE IF NOT EXISTS billing.claim_events (
  id uuid PRIMARY KEY,
  claim_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.coverage_events (
  id uuid PRIMARY KEY,
  coverage_id uuid NOT NULL,
  status text NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.readiness_runs (
  id uuid PRIMARY KEY,
  claim_id uuid NOT NULL,
  ready boolean NOT NULL,
  checks jsonb NOT NULL,
  ruleset text NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization.master_versions (
  id uuid PRIMARY KEY,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pharmacy.replenishment_requests (
  id uuid PRIMARY KEY,
  medication_id uuid NOT NULL,
  quantity integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.backups (
  id uuid PRIMARY KEY,
  created_by uuid,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.change_requests (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  scope text NOT NULL,
  status text NOT NULL,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pharmacy.medications ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS mfa_secret text;

ALTER TABLE quality.feedback ADD COLUMN IF NOT EXISTS anonymous boolean NOT NULL DEFAULT false;
ALTER TABLE quality.feedback ADD COLUMN IF NOT EXISTS template_version text NOT NULL DEFAULT 'MED-04-v1';
ALTER TABLE quality.feedback ADD COLUMN IF NOT EXISTS heard_from text;
ALTER TABLE quality.feedback ADD COLUMN IF NOT EXISTS improve text;

ALTER TABLE quality.incidents ADD COLUMN IF NOT EXISTS evidence text;

INSERT INTO identity.settings (key, value) VALUES
  ('tax_reg_no', '000-000-000'),
  ('commercial_reg', '00000'),
  ('mfa_required', 'false'),
  ('rpo_hours', '24'),
  ('rto_hours', '8'),
  ('survey_template', 'MED-04-v1'),
  ('low_nps_threshold', '6')
ON CONFLICT (key) DO NOTHING;
