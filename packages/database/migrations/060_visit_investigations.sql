CREATE TABLE patient_visit_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES patient_visits (id) ON DELETE CASCADE,
  service_id uuid REFERENCES medical_services (id),
  name text NOT NULL,
  code text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  price numeric(12, 2),
  category text NOT NULL DEFAULT 'Laboratory',
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('emergency', 'urgent', 'normal')),
  status text NOT NULL DEFAULT 'ordered'
    CHECK (status IN ('ordered', 'collected', 'sent', 'result_uploaded', 'completed')),
  requires_collection boolean NOT NULL DEFAULT true,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  ordered_by uuid REFERENCES users (id),
  collected_at timestamptz,
  collected_by uuid REFERENCES users (id),
  sent_at timestamptz,
  sent_by uuid REFERENCES users (id),
  result_uploaded_at timestamptz,
  result_uploaded_by uuid REFERENCES users (id),
  completed_at timestamptz,
  result_file_path text,
  result_original_name text,
  result_mime_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX patient_visit_investigations_visit_id_idx
  ON patient_visit_investigations (visit_id);

CREATE INDEX patient_visit_investigations_status_idx
  ON patient_visit_investigations (status);

CREATE INDEX patient_visit_investigations_visit_status_idx
  ON patient_visit_investigations (visit_id, status);
