INSERT INTO medications (name, strength, dosage_form, route)
SELECT seed.name, seed.strength, seed.dosage_form, seed.route
FROM (
  VALUES
    ('Paracetamol', '500 mg', 'Tablet', 'Oral'),
    ('Paracetamol', '1 g', 'Tablet', 'Oral'),
    ('Paracetamol', '120 mg/5 ml', 'Syrup', 'Oral'),
    ('Ibuprofen', '400 mg', 'Tablet', 'Oral'),
    ('Ibuprofen', '200 mg', 'Tablet', 'Oral'),
    ('Ibuprofen', '100 mg/5 ml', 'Syrup', 'Oral'),
    ('Diclofenac', '50 mg', 'Tablet', 'Oral'),
    ('Diclofenac', '75 mg/3 ml', 'Injection (ampoule)', 'IM injection'),
    ('Aspirin', '75 mg', 'Tablet', 'Oral'),
    ('Aspirin', '300 mg', 'Tablet', 'Oral'),
    ('Tramadol', '50 mg', 'Capsule', 'Oral'),
    ('Amoxicillin', '500 mg', 'Capsule', 'Oral'),
    ('Amoxicillin', '250 mg/5 ml', 'Syrup', 'Oral'),
    ('Amoxicillin / Clavulanate', '875/125 mg', 'Tablet', 'Oral'),
    ('Azithromycin', '500 mg', 'Tablet', 'Oral'),
    ('Ciprofloxacin', '500 mg', 'Tablet', 'Oral'),
    ('Metronidazole', '500 mg', 'Tablet', 'Oral'),
    ('Ceftriaxone', '1 g', 'Powder for injection', 'IM injection'),
    ('Omeprazole', '20 mg', 'Capsule', 'Oral'),
    ('Pantoprazole', '40 mg', 'Tablet', 'Oral'),
    ('Ondansetron', '4 mg', 'Tablet', 'Oral'),
    ('Ondansetron', '4 mg/2 ml', 'Injection (ampoule)', 'IV Infusion / Drip'),
    ('Metoclopramide', '10 mg/2 ml', 'Injection (ampoule)', 'IM injection'),
    ('Domperidone', '10 mg', 'Tablet', 'Oral'),
    ('Hyoscine butylbromide', '10 mg', 'Tablet', 'Oral'),
    ('Cetirizine', '10 mg', 'Tablet', 'Oral'),
    ('Loratadine', '10 mg', 'Tablet', 'Oral'),
    ('Prednisolone', '5 mg', 'Tablet', 'Oral'),
    ('Prednisolone', '20 mg', 'Tablet', 'Oral'),
    ('Dexamethasone', '8 mg/2 ml', 'Injection (ampoule)', 'IM injection'),
    ('Hydrocortisone', '100 mg', 'Powder for injection', 'IV Infusion / Drip'),
    ('Hydrocortisone', '1%', 'Ointment', 'Topical'),
    ('Salbutamol', '2.5 mg/2.5 ml', 'Nebule', 'Inhalation / Nebulization'),
    ('Budesonide', '0.5 mg/2 ml', 'Nebule', 'Inhalation / Nebulization'),
    ('Ipratropium', '250 mcg/ml', 'Nebule', 'Inhalation / Nebulization'),
    ('Amlodipine', '5 mg', 'Tablet', 'Oral'),
    ('Amlodipine', '10 mg', 'Tablet', 'Oral'),
    ('Bisoprolol', '5 mg', 'Tablet', 'Oral'),
    ('Atorvastatin', '20 mg', 'Tablet', 'Oral'),
    ('Metformin', '500 mg', 'Tablet', 'Oral'),
    ('Metformin', '850 mg', 'Tablet', 'Oral'),
    ('Gliclazide', '80 mg', 'Tablet', 'Oral'),
    ('Insulin glargine', '100 units/ml', 'Injection (prefilled syringe)', 'SC injection'),
    ('Enoxaparin', '40 mg', 'Injection (prefilled syringe)', 'SC injection'),
    ('Adrenaline', '1 mg/ml', 'Injection (ampoule)', 'IM injection'),
    ('Fusidic acid', '2%', 'Ointment', 'Topical'),
    ('Mupirocin', '2%', 'Ointment', 'Topical'),
    ('Clotrimazole', '1%', 'Ointment', 'Topical')
) AS seed(name, strength, dosage_form, route)
WHERE NOT EXISTS (
  SELECT 1
  FROM medications existing
  WHERE existing.deleted_at IS NULL
    AND lower(existing.name) = lower(seed.name)
    AND lower(existing.strength) = lower(seed.strength)
    AND existing.dosage_form = seed.dosage_form
);
