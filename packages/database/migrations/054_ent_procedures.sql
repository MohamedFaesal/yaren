-- Ear, nose, and throat procedures use their own form. Existing prices already match the sheet.

UPDATE medical_services
SET position = position + 1
WHERE deleted_at IS NULL
  AND position >= 89;

UPDATE medical_services
SET procedure_form = 'ent-procedure',
    updated_at = now()
WHERE deleted_at IS NULL
  AND code IN (
    'YRN-INT-013',
    'YRN-INT-014',
    'YRN-INT-016',
    'YRN-INT-017',
    'YRN-INT-018',
    'YRN-INT-019',
    'YRN-INT-020',
    'YRN-INT-022',
    'YRN-INT-023'
  );

INSERT INTO medical_services (service_type, category, name, unit, code, position, price, unit_price_eur, procedure_form)
VALUES (
  'Procedures & Interventions Services',
  'Interventions',
  'Myringotomy under Local Anesthesia',
  'Per procedure',
  'YRN-INT-063',
  89,
  645.00,
  645.00,
  'ent-procedure'
);
