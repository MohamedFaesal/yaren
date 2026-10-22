ALTER TABLE medications
  ADD COLUMN is_diluent boolean NOT NULL DEFAULT false;

UPDATE medications
SET is_diluent = true
WHERE deleted_at IS NULL
  AND lower(name) IN ('saline', 'ringer', 'glucose', 'dextrose');

INSERT INTO medication_route_services (medication_route_id, service_id)
SELECT mr.id, s.id
FROM medication_routes mr
JOIN medical_services s ON s.deleted_at IS NULL AND s.code = 'YRN-MP-006'
WHERE mr.route = 'IV Infusion / Drip'
ON CONFLICT DO NOTHING;
