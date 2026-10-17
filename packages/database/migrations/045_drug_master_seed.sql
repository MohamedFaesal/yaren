-- Replace the medication catalog with the Yaren drug master list.
-- Sheet dosage forms and routes are mapped onto the catalog values.
-- Blank spreadsheet rows are skipped. Price and stock stay off this catalog.
DELETE FROM medications;

WITH seed(name, strength, dosage_form, route, routes) AS (
  VALUES
    ('Piroxicam (Feldene)', '20 mg/ ml', 'Ampule', 'IM injection', ARRAY['IM injection']::text[]),
    ('Famotidine (Antodine)', '20 mg/ 2 ml', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Spasmofen', '', 'Ampule', 'IM injection', ARRAY['IM injection']::text[]),
    ('Tiemonium methyl sulfate (Visceralgine)', '5 mg/ 2 ml', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Ondansetron (Danset)', '8 mg/ 4 ml', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Ondansetron (Danset)', '4 mg / 2 ml', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Diclofenac Sodium (Voltaren)', '75 mg/ 3 ml', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Dexamethasone', '8 mg/ 2 ml', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Orphenadrine Citrate (Norflex)', '60 mg/ 2ml', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('N-Acetylcysteine (Flumacil)', '300 mg/ 3 ml', 'Ampule', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip', 'Inhalation / Nebulization']::text[]),
    ('α Chymotrypsin', '', 'Ampule', 'IM injection', ARRAY['IM injection']::text[]),
    ('Trimebutine Malate (Tritone)', '50 mg/ 5 ml', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Aminophylline (Minophylline-N)', '', 'Ampule', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Fleboton', '', 'Ampule', 'IM injection', ARRAY['IM injection']::text[]),
    ('Meloxicam (Anticox II)', '15 mg/ 3 ml', 'Ampule', 'IM injection', ARRAY['IM injection']::text[]),
    ('Becozyme', '', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Pheniramine Malate (Avil)', '45.5 mg/ 2ml', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Ketorolac Tromethamine (Ketolac)', '30 mg/ 2 ml', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Furosemide (Lasix)', '20 mg/ 2 ml', 'Ampule', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip', 'IM injection']::text[]),
    ('Hydrocortisone', '100 mg', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Ceftazidime (Fortum)', '1 g', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Ceftriaxone', '1 g', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Ceftriaxone', '0.5 g', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Cefotaxime (Cefotax)', '1 g', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Cefotaxime (Cefotax)', '0.5 g', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Sulbactam/ Ampicillin (Unictam)', '1.5 g', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Sulbactam/ Ampicillin (Unictam)', '750 mg', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Sulbactam/ Ampicillin (Unictam)', '375 mg', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Atropine', '1 mg/ 1 ml', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip', 'SC injection']::text[]),
    ('Sulbactam/ Cefoperazone (Trexotaz)', '1.5 g', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Cefoperazone (Cefobid)', '1 g', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Cefoperazone (Cefobid)', '0.5 g', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Tranexamic acid (Kapron)', '500 mg/ 5 ml', 'Ampule', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Meropenem (Meronem)', '1 g', 'Vial', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Imipenem/ Cilastatin Kabi (Tienam)', '500 mg/500 mg', 'Vial', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Vancomycin (Vancomix)', '500 mg', 'Vial', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip', 'Oral']::text[]),
    ('Vancomycin (Vancomix)', '1 g', 'Vial', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Piperacillin/ Tazobactam (Tazocin)', '4 g/ 0.5 g', 'Vial', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Tigecycline (Tygacil)', '50 mg', 'Vial', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Saline', '0.9%', 'Infusion Solution', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Ringer', '', 'Infusion Solution', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Glucose', '5%', 'Infusion Solution', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Glucose', '25%', 'Infusion Solution', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Dextrose', '5%', 'Infusion Solution', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Paracetamol', '1000 mg/ 100 ml', 'Infusion Solution', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Metronidazole (Amrizole)', '500 mg/ 100 ml', 'Infusion Solution', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Ciprofloxacin (Cipro)', '200 mg/ 100 ml', 'Infusion Solution', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Levofloxacin (Tavanic)', '500 mg/ 100 ml', 'Infusion Solution', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Moxifloxacin (Moxiflox)', '400 mg/250 ml', 'Infusion Solution', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Cefepime (Wincef)', '1 g', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Cefepime (Wincef)', '0.5 g', 'Vial', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Ipratropium (Atrovent)', '500 mcg/ 2ml', 'Nebule', 'Inhalation / Nebulization', ARRAY['Inhalation / Nebulization']::text[]),
    ('Budesonide (Pulmicort)', '0.5 mg/ml', 'Nebule', 'Inhalation / Nebulization', ARRAY['Inhalation / Nebulization']::text[]),
    ('Ibratropium/ Salbutamol (Swabivent)', '500 mcg/ 2.5 mg', 'Nebule', 'Inhalation / Nebulization', ARRAY['Inhalation / Nebulization']::text[]),
    ('Metoclopramide (Primperan)', '10 mg/ 2ml', 'Ampule', 'IM injection', ARRAY['IM injection', 'IV Infusion / Drip']::text[]),
    ('Pantprazole (Zurcal)', '40 mg', 'Vial', 'IV Infusion / Drip', ARRAY['IV Infusion / Drip']::text[]),
    ('Enoxaparin (Clexan)', '40 mg', 'Prefilled Syringe', 'SC injection', ARRAY['SC injection']::text[]),
    ('Enoxaparin (Clexan)', '80 mg', 'Prefilled Syringe', 'SC injection', ARRAY['SC injection']::text[]),
    ('Enoxaparin (Clexan)', '60 mg', 'Prefilled Syringe', 'SC injection', ARRAY['SC injection']::text[]),
    ('Fondaparinux (Arixtra)', '2.5 mg/ 0.5ml', 'Prefilled Syringe', 'SC injection', ARRAY['SC injection']::text[]),
    ('Fondaparinux (Arixtra)', '7.5 mg/ 0.6 ml', 'Prefilled Syringe', 'SC injection', ARRAY['SC injection']::text[])
),
inserted AS (
  INSERT INTO medications (name, strength, dosage_form, route)
  SELECT name, strength, dosage_form, route FROM seed
  RETURNING id, name, strength, dosage_form
)
INSERT INTO medication_routes (medication_id, route)
SELECT inserted.id, route.route
FROM inserted
JOIN seed
  ON seed.name = inserted.name
 AND seed.strength = inserted.strength
 AND seed.dosage_form = inserted.dosage_form
CROSS JOIN LATERAL unnest(seed.routes) AS route(route);

