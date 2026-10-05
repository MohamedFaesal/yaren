CREATE TABLE patient_visit_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES patient_visits (id) ON DELETE CASCADE,
  document_type text NOT NULL
    CHECK (document_type = ANY (ARRAY[
      'patient_personal_information_form'::text,
      'gdpr_form'::text,
      'patient_satisfaction_form'::text,
      'travel_voucher'::text,
      'flight_ticket'::text,
      'claim_form'::text,
      'refusal_of_treatment_hospital_referral'::text
    ])),
  file_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visit_id, document_type)
);

CREATE INDEX patient_visit_documents_visit_id_idx ON patient_visit_documents (visit_id);
