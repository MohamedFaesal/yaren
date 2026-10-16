CREATE TABLE medication_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medications (id) ON DELETE CASCADE,
  route text NOT NULL,
  UNIQUE (medication_id, route),
  CHECK (route IN (
    'IV Infusion / Drip',
    'IM injection',
    'Oral',
    'SC injection',
    'Inhalation / Nebulization',
    'Topical'
  ))
);

CREATE TABLE medication_route_services (
  medication_route_id uuid NOT NULL REFERENCES medication_routes (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES medical_services (id),
  PRIMARY KEY (medication_route_id, service_id)
);

INSERT INTO medication_routes (medication_id, route)
SELECT id, route
FROM medications
WHERE deleted_at IS NULL
  AND route IN (
    'IV Infusion / Drip',
    'IM injection',
    'Oral',
    'SC injection',
    'Inhalation / Nebulization',
    'Topical'
  );
