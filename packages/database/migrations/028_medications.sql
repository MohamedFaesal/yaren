CREATE TABLE medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  strength text NOT NULL CHECK (length(btrim(strength)) > 0),
  dosage_form text NOT NULL CHECK (length(btrim(dosage_form)) > 0),
  route text NOT NULL CHECK (length(btrim(route)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX medications_identity_active_idx
  ON medications (lower(name), lower(strength), dosage_form)
  WHERE deleted_at IS NULL;
