-- Surgical procedure prices and the surgical procedure form.
-- Sheet codes are not used: those numbers already belong to other services.

UPDATE medical_services
SET position = position + 6
WHERE deleted_at IS NULL
  AND position >= 90;

UPDATE medical_services
SET price = CASE code
      WHEN 'YRN-INT-002' THEN 40.00
      WHEN 'YRN-INT-003' THEN 20.00
      WHEN 'YRN-INT-004' THEN 150.00
      WHEN 'YRN-INT-005' THEN 250.00
      WHEN 'YRN-INT-006' THEN 180.00
      WHEN 'YRN-INT-007' THEN 185.00
      WHEN 'YRN-INT-008' THEN 235.00
      WHEN 'YRN-INT-009' THEN 145.00
      WHEN 'YRN-INT-010' THEN 150.00
      WHEN 'YRN-INT-011' THEN 110.00
      WHEN 'YRN-INT-012' THEN 210.00
      ELSE price
    END,
    unit_price_eur = CASE code
      WHEN 'YRN-INT-002' THEN 40.00
      WHEN 'YRN-INT-003' THEN 20.00
      WHEN 'YRN-INT-004' THEN 150.00
      WHEN 'YRN-INT-005' THEN 250.00
      WHEN 'YRN-INT-006' THEN 180.00
      WHEN 'YRN-INT-007' THEN 185.00
      WHEN 'YRN-INT-008' THEN 235.00
      WHEN 'YRN-INT-009' THEN 145.00
      WHEN 'YRN-INT-010' THEN 150.00
      WHEN 'YRN-INT-011' THEN 110.00
      WHEN 'YRN-INT-012' THEN 210.00
      ELSE unit_price_eur
    END,
    procedure_form = 'surgical-procedure',
    updated_at = now()
WHERE deleted_at IS NULL
  AND code IN (
    'YRN-INT-002',
    'YRN-INT-003',
    'YRN-INT-004',
    'YRN-INT-005',
    'YRN-INT-006',
    'YRN-INT-007',
    'YRN-INT-008',
    'YRN-INT-009',
    'YRN-INT-010',
    'YRN-INT-011',
    'YRN-INT-012'
  );

INSERT INTO medical_services (service_type, category, name, unit, code, position, price, unit_price_eur, procedure_form)
VALUES
  ('Procedures & Interventions Services', 'Interventions', 'Wound Care - Small', 'Per procedure', 'YRN-INT-064', 90, 70.00, 70.00, 'surgical-procedure'),
  ('Procedures & Interventions Services', 'Interventions', 'Wound Care - Medium', 'Per procedure', 'YRN-INT-065', 91, 140.00, 140.00, 'surgical-procedure'),
  ('Procedures & Interventions Services', 'Interventions', 'Wound Care - Large', 'Per procedure', 'YRN-INT-066', 92, 200.00, 200.00, 'surgical-procedure'),
  ('Procedures & Interventions Services', 'Interventions', 'Wound Dressing - Small', 'Per procedure', 'YRN-INT-067', 93, 50.00, 50.00, 'surgical-procedure'),
  ('Procedures & Interventions Services', 'Interventions', 'Wound Dressing - Medium', 'Per procedure', 'YRN-INT-068', 94, 70.00, 70.00, 'surgical-procedure'),
  ('Procedures & Interventions Services', 'Interventions', 'Wound Dressing - Large', 'Per procedure', 'YRN-INT-069', 95, 100.00, 100.00, 'surgical-procedure');
