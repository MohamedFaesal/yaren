-- Oxygen session per hour uses the supply form. The EUR price is already 70.

UPDATE medical_services
SET procedure_form = 'oxygen-supply',
    updated_at = now()
WHERE deleted_at IS NULL
  AND code = 'YRN-MP-008';
