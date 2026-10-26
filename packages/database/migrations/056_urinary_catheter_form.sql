-- Urinary catheter prices and the catheter procedure form.

UPDATE medical_services
SET price = CASE code
      WHEN 'YRN-INT-024' THEN 120.00
      WHEN 'YRN-INT-025' THEN 60.00
      WHEN 'YRN-INT-026' THEN 50.00
      ELSE price
    END,
    unit_price_eur = CASE code
      WHEN 'YRN-INT-024' THEN 120.00
      WHEN 'YRN-INT-025' THEN 60.00
      WHEN 'YRN-INT-026' THEN 50.00
      ELSE unit_price_eur
    END,
    procedure_form = 'urinary-catheter',
    updated_at = now()
WHERE deleted_at IS NULL
  AND code IN ('YRN-INT-024', 'YRN-INT-025', 'YRN-INT-026');
