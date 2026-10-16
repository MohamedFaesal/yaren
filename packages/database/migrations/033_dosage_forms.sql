UPDATE medications SET dosage_form = 'Ampule', updated_at = now()
WHERE deleted_at IS NULL AND dosage_form = 'Injection (ampoule)';

UPDATE medications SET dosage_form = 'Prefilled Syringe', updated_at = now()
WHERE deleted_at IS NULL AND dosage_form = 'Injection (prefilled syringe)';

UPDATE medications SET dosage_form = 'Vial', updated_at = now()
WHERE deleted_at IS NULL AND dosage_form = 'Powder for injection';

UPDATE medications SET dosage_form = 'Inhaler', updated_at = now()
WHERE deleted_at IS NULL AND dosage_form = 'Nebule';
