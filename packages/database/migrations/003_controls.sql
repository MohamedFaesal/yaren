ALTER TABLE patient_registry.patients ADD COLUMN IF NOT EXISTS vip boolean NOT NULL DEFAULT false;
ALTER TABLE patient_registry.patients ADD COLUMN IF NOT EXISTS consent_recorded_at timestamptz;

CREATE TABLE IF NOT EXISTS clinical.amendments (
  id uuid PRIMARY KEY,
  encounter_id uuid NOT NULL,
  target text NOT NULL,
  reason text NOT NULL,
  previous jsonb NOT NULL,
  author_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pharmacy.movements (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL,
  medication_id uuid NOT NULL,
  quantity integer NOT NULL,
  direction text NOT NULL,
  reason text,
  dispense_id uuid,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.refunds (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES billing.invoices(id),
  amount numeric(12,2) NOT NULL,
  reason text NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE billing.invoices ADD COLUMN IF NOT EXISTS void_reason text;

CREATE TABLE IF NOT EXISTS identity.permissions (
  role text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  allowed boolean NOT NULL,
  PRIMARY KEY (role, resource, action)
);

INSERT INTO identity.permissions (role, resource, action, allowed) VALUES
  ('receptionist', 'clinical_note', 'view', false),
  ('hotel_manager', 'clinical_note', 'view', false),
  ('physician', 'clinical_note', 'view', true),
  ('nurse', 'clinical_note', 'view', true),
  ('pharmacist', 'clinical_note', 'view', false),
  ('claims_officer', 'clinical_note', 'view', true),
  ('system_admin', 'invoice', 'void', true),
  ('center_manager', 'invoice', 'void', true),
  ('receptionist', 'invoice', 'void', false),
  ('system_admin', 'master_data', 'edit', true),
  ('center_manager', 'master_data', 'edit', true)
ON CONFLICT (role, resource, action) DO NOTHING;
