ALTER TABLE medication_routes DROP CONSTRAINT medication_routes_route_check;

UPDATE medication_routes AS assignment
SET route = 'IV Injection'
FROM medications
WHERE assignment.medication_id = medications.id
  AND assignment.route = 'IV Infusion / Drip'
  AND (medications.name, medications.strength, medications.dosage_form) IN (
    ('Famotidine (Antodine)', '20 mg/ 2 ml', 'Ampule'),
    ('Tiemonium methyl sulfate (Visceralgine)', '5 mg/ 2 ml', 'Ampule'),
    ('Ondansetron (Danset)', '8 mg/ 4 ml', 'Ampule'),
    ('Ondansetron (Danset)', '4 mg / 2 ml', 'Ampule'),
    ('Dexamethasone', '8 mg/ 2 ml', 'Ampule'),
    ('Orphenadrine Citrate (Norflex)', '60 mg/ 2ml', 'Ampule'),
    ('N-Acetylcysteine (Flumacil)', '300 mg/ 3 ml', 'Ampule'),
    ('Trimebutine Malate (Tritone)', '50 mg/ 5 ml', 'Ampule'),
    ('Aminophylline (Minophylline-N)', '', 'Ampule'),
    ('Furosemide (Lasix)', '20 mg/ 2 ml', 'Ampule'),
    ('Hydrocortisone', '100 mg', 'Vial'),
    ('Ceftazidime (Fortum)', '1 g', 'Vial'),
    ('Ceftriaxone', '1 g', 'Vial'),
    ('Ceftriaxone', '0.5 g', 'Vial'),
    ('Cefotaxime (Cefotax)', '1 g', 'Vial'),
    ('Cefotaxime (Cefotax)', '0.5 g', 'Vial'),
    ('Sulbactam/ Ampicillin (Unictam)', '1.5 g', 'Vial'),
    ('Sulbactam/ Ampicillin (Unictam)', '750 mg', 'Vial'),
    ('Sulbactam/ Ampicillin (Unictam)', '375 mg', 'Vial'),
    ('Atropine', '1 mg/ 1 ml', 'Ampule'),
    ('Sulbactam/ Cefoperazone (Trexotaz)', '1.5 g', 'Vial'),
    ('Cefoperazone (Cefobid)', '1 g', 'Vial'),
    ('Cefoperazone (Cefobid)', '0.5 g', 'Vial'),
    ('Tranexamic acid (Kapron)', '500 mg/ 5 ml', 'Ampule'),
    ('Meropenem (Meronem)', '1 g', 'Vial'),
    ('Imipenem/ Cilastatin Kabi (Tienam)', '500 mg/500 mg', 'Vial'),
    ('Vancomycin (Vancomix)', '500 mg', 'Vial'),
    ('Vancomycin (Vancomix)', '1 g', 'Vial'),
    ('Cefepime (Wincef)', '1 g', 'Vial'),
    ('Cefepime (Wincef)', '0.5 g', 'Vial'),
    ('Metoclopramide (Primperan)', '10 mg/ 2ml', 'Ampule'),
    ('Pantprazole (Zurcal)', '40 mg', 'Vial')
  );

UPDATE medications
SET route = 'IV Injection'
WHERE route = 'IV Infusion / Drip'
  AND (name, strength, dosage_form) IN (
    ('N-Acetylcysteine (Flumacil)', '300 mg/ 3 ml', 'Ampule'),
    ('Aminophylline (Minophylline-N)', '', 'Ampule'),
    ('Furosemide (Lasix)', '20 mg/ 2 ml', 'Ampule'),
    ('Tranexamic acid (Kapron)', '500 mg/ 5 ml', 'Ampule'),
    ('Meropenem (Meronem)', '1 g', 'Vial'),
    ('Imipenem/ Cilastatin Kabi (Tienam)', '500 mg/500 mg', 'Vial'),
    ('Vancomycin (Vancomix)', '500 mg', 'Vial'),
    ('Vancomycin (Vancomix)', '1 g', 'Vial'),
    ('Pantprazole (Zurcal)', '40 mg', 'Vial')
  );

INSERT INTO medication_routes (medication_id, route)
SELECT id, 'IV Injection'
FROM medications
WHERE deleted_at IS NULL
  AND name = 'Becozyme'
  AND strength = ''
  AND dosage_form = 'Ampule'
ON CONFLICT (medication_id, route) DO NOTHING;

ALTER TABLE medication_routes
  ADD CONSTRAINT medication_routes_route_check CHECK (route IN (
    'IV Infusion / Drip',
    'IV Injection',
    'IM injection',
    'Oral',
    'SC injection',
    'Inhalation / Nebulization',
    'Topical'
  ));
