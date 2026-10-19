INSERT INTO medication_route_services (medication_route_id, service_id)
SELECT mr.id, s.id
FROM medication_routes mr
JOIN medical_services s ON s.deleted_at IS NULL AND s.code = 'YRN-MP-010'
WHERE mr.route = 'Inhalation / Nebulization'
ON CONFLICT DO NOTHING;
