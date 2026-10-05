CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mrn text NOT NULL,
  birthdate date NOT NULL,
  nationality text NOT NULL,
  gender text NOT NULL CHECK (gender IN ('male', 'female')),
  added_by uuid NOT NULL REFERENCES users (id),
  phone_number text,
  alternative_phone_number text,
  home_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX patients_mrn_unique ON patients (mrn);
CREATE INDEX patients_added_by_idx ON patients (added_by);
CREATE INDEX patients_name_idx ON patients (lower(name));

CREATE TABLE patient_mrn_years (
  year integer PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

CREATE TABLE patient_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients (id),
  passport_number text NOT NULL,
  preferred_contact_method text NOT NULL CHECK (preferred_contact_method IN ('phone', 'email', 'whatsapp')),
  emergency_contact_name text NOT NULL,
  emergency_contact_phone text NOT NULL,
  emergency_contact_relationship text NOT NULL CHECK (
    emergency_contact_relationship IN (
      'spouse', 'son', 'daughter', 'father', 'mother', 'cousin', 'grandfather', 'grandmother'
    )
  ),
  hotel_checkin_date date NOT NULL,
  hotel_checkout_date date,
  hotel_room_no text NOT NULL,
  clinic_id uuid NOT NULL REFERENCES clinics (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (hotel_checkout_date IS NULL OR hotel_checkout_date >= hotel_checkin_date)
);

CREATE INDEX patient_visits_patient_id_idx ON patient_visits (patient_id);
CREATE INDEX patient_visits_clinic_id_idx ON patient_visits (clinic_id);

INSERT INTO permissions (id, resource, action, ownership, clinic_scoped, description) VALUES
  ('patient.view.all', 'patient', 'view', 'all', true, 'See patients. Choose one clinic, several clinics, or every clinic when you assign this.'),
  ('patient.view.own', 'patient', 'view', 'own', true, 'See patients you added, and only inside the clinics you choose when you assign this.'),
  ('patient.create.all', 'patient', 'create', 'all', true, 'Add patients and their visits in the clinics you choose when you assign this.'),
  ('patient.update.all', 'patient', 'update', 'all', true, 'Change patients and visits in the clinics you choose when you assign this.'),
  ('patient.update.own', 'patient', 'update', 'own', true, 'Change patients you added, and only inside the clinics you choose when you assign this.'),
  ('patient.delete.all', 'patient', 'delete', 'all', true, 'Remove patients and visits in the clinics you choose when you assign this.'),
  ('patient.delete.own', 'patient', 'delete', 'own', true, 'Remove patients you added, and only inside the clinics you choose when you assign this.'),
  ('patient.manage.all', 'patient', 'manage', 'all', true, 'Manage patients: see, add, change, and remove them. Choose one clinic, several clinics, or every clinic when you assign this.');

INSERT INTO access_role_permissions (role_id, permission_id)
SELECT '11111111-1111-4111-8111-111111111111', id
FROM permissions
WHERE resource = 'patient' AND action = 'manage';
