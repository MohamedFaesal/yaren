CREATE TABLE medical_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX medical_services_name_active_idx
  ON medical_services (lower(name))
  WHERE deleted_at IS NULL;

CREATE TABLE clinic_service_prices (
  service_id uuid NOT NULL REFERENCES medical_services (id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES clinics (id),
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id),
  PRIMARY KEY (service_id, clinic_id)
);
