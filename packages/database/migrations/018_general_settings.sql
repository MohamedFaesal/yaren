CREATE TABLE app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  triage_wait_minutes integer NOT NULL DEFAULT 20 CHECK (triage_wait_minutes BETWEEN 1 AND 720),
  doctor_wait_minutes integer NOT NULL DEFAULT 20 CHECK (doctor_wait_minutes BETWEEN 1 AND 720),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id)
);

INSERT INTO app_settings (id) VALUES (true);
