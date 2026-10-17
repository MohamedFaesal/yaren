ALTER TABLE medications
  ADD COLUMN unit_price_egp numeric(12, 2),
  ADD COLUMN unit_price_eur numeric(12, 2);

ALTER TABLE medications
  ADD CONSTRAINT medications_unit_price_egp_check CHECK (unit_price_egp IS NULL OR unit_price_egp >= 0),
  ADD CONSTRAINT medications_unit_price_eur_check CHECK (unit_price_eur IS NULL OR unit_price_eur >= 0);

ALTER TABLE patient_visits
  ADD COLUMN currency text NOT NULL DEFAULT 'EGP';

ALTER TABLE patient_visits
  ADD CONSTRAINT patient_visits_currency_check CHECK (currency IN ('EGP', 'EUR'));

UPDATE medications AS medication
SET unit_price_egp = seed.unit_price_egp,
    unit_price_eur = seed.unit_price_eur
FROM (VALUES
  ('Piroxicam (Feldene)', '20 mg/ ml', 'Ampule', 15.00::numeric, 10.00::numeric),
  ('Famotidine (Antodine)', '20 mg/ 2 ml', 'Ampule', 13.00::numeric, 10.00::numeric),
  ('Spasmofen', '', 'Ampule', 13.00::numeric, 10.00::numeric),
  ('Tiemonium methyl sulfate (Visceralgine)', '5 mg/ 2 ml', 'Ampule', 18.00::numeric, 10.00::numeric),
  ('Ondansetron (Danset)', '8 mg/ 4 ml', 'Ampule', 4847.50::numeric, 10.00::numeric),
  ('Ondansetron (Danset)', '4 mg / 2 ml', 'Ampule', 27.50::numeric, 10.00::numeric),
  ('Diclofenac Sodium (Voltaren)', '75 mg/ 3 ml', 'Ampule', 17.00::numeric, 10.00::numeric),
  ('Dexamethasone', '8 mg/ 2 ml', 'Ampule', 13.00::numeric, 10.00::numeric),
  ('Orphenadrine Citrate (Norflex)', '60 mg/ 2ml', 'Ampule', 6.30::numeric, 10.00::numeric),
  ('N-Acetylcysteine (Flumacil)', '300 mg/ 3 ml', 'Ampule', 52.40::numeric, 10.00::numeric),
  ('α Chymotrypsin', '', 'Ampule', 21.60::numeric, 10.00::numeric),
  ('Trimebutine Malate (Tritone)', '50 mg/ 5 ml', 'Ampule', 12.00::numeric, 10.00::numeric),
  ('Aminophylline (Minophylline-N)', '', 'Ampule', 12.00::numeric, 10.00::numeric),
  ('Fleboton', '', 'Ampule', 17.00::numeric, 10.00::numeric),
  ('Meloxicam (Anticox II)', '15 mg/ 3 ml', 'Ampule', 13.00::numeric, 10.00::numeric),
  ('Becozyme', '', 'Ampule', 10.00::numeric, 10.00::numeric),
  ('Pheniramine Malate (Avil)', '45.5 mg/ 2ml', 'Ampule', 13.80::numeric, 10.00::numeric),
  ('Ketorolac Tromethamine (Ketolac)', '30 mg/ 2 ml', 'Ampule', 12.00::numeric, 10.00::numeric),
  ('Furosemide (Lasix)', '20 mg/ 2 ml', 'Ampule', 6.00::numeric, 10.00::numeric),
  ('Hydrocortisone', '100 mg', 'Vial', 26.00::numeric, 10.00::numeric),
  ('Ceftazidime (Fortum)', '1 g', 'Vial', 106.00::numeric, 15.00::numeric),
  ('Ceftriaxone', '1 g', 'Vial', 95.00::numeric, 15.00::numeric),
  ('Ceftriaxone', '0.5 g', 'Vial', 62.00::numeric, 15.00::numeric),
  ('Cefotaxime (Cefotax)', '1 g', 'Vial', 43.00::numeric, 15.00::numeric),
  ('Cefotaxime (Cefotax)', '0.5 g', 'Vial', 32.00::numeric, 15.00::numeric),
  ('Sulbactam/ Ampicillin (Unictam)', '1.5 g', 'Vial', 56.00::numeric, 15.00::numeric),
  ('Sulbactam/ Ampicillin (Unictam)', '750 mg', 'Vial', 39.00::numeric, 15.00::numeric),
  ('Sulbactam/ Ampicillin (Unictam)', '375 mg', 'Vial', 30.00::numeric, 15.00::numeric),
  ('Atropine', '1 mg/ 1 ml', 'Ampule', NULL::numeric, 10.00::numeric),
  ('Sulbactam/ Cefoperazone (Trexotaz)', '1.5 g', 'Vial', 91.00::numeric, 15.00::numeric),
  ('Cefoperazone (Cefobid)', '1 g', 'Vial', 104.00::numeric, 15.00::numeric),
  ('Cefoperazone (Cefobid)', '0.5 g', 'Vial', 60.00::numeric, 15.00::numeric),
  ('Tranexamic acid (Kapron)', '500 mg/ 5 ml', 'Ampule', 15.00::numeric, 10.00::numeric),
  ('Meropenem (Meronem)', '1 g', 'Vial', 553.00::numeric, 40.00::numeric),
  ('Imipenem/ Cilastatin Kabi (Tienam)', '500 mg/500 mg', 'Vial', 345.00::numeric, 30.00::numeric),
  ('Vancomycin (Vancomix)', '500 mg', 'Vial', 118.00::numeric, 15.00::numeric),
  ('Vancomycin (Vancomix)', '1 g', 'Vial', 95.00::numeric, 15.00::numeric),
  ('Piperacillin/ Tazobactam (Tazocin)', '4 g/ 0.5 g', 'Vial', 225.00::numeric, 25.00::numeric),
  ('Tigecycline (Tygacil)', '50 mg', 'Vial', 839.00::numeric, 45.00::numeric),
  ('Saline', '0.9%', 'Infusion Solution', 26.00::numeric, 10.00::numeric),
  ('Ringer', '', 'Infusion Solution', 26.00::numeric, 10.00::numeric),
  ('Glucose', '5%', 'Infusion Solution', 29.50::numeric, 10.00::numeric),
  ('Glucose', '25%', 'Infusion Solution', 48.00::numeric, 10.00::numeric),
  ('Dextrose', '5%', 'Infusion Solution', NULL::numeric, 10.00::numeric),
  ('Paracetamol', '1000 mg/ 100 ml', 'Infusion Solution', 46.00::numeric, 10.00::numeric),
  ('Metronidazole (Amrizole)', '500 mg/ 100 ml', 'Infusion Solution', 47.00::numeric, 10.00::numeric),
  ('Ciprofloxacin (Cipro)', '200 mg/ 100 ml', 'Infusion Solution', 30.50::numeric, 15.00::numeric),
  ('Levofloxacin (Tavanic)', '500 mg/ 100 ml', 'Infusion Solution', 305.00::numeric, 25.00::numeric),
  ('Moxifloxacin (Moxiflox)', '400 mg/250 ml', 'Infusion Solution', 171.00::numeric, 15.00::numeric),
  ('Cefepime (Wincef)', '1 g', 'Vial', 94.00::numeric, 15.00::numeric),
  ('Cefepime (Wincef)', '0.5 g', 'Vial', 63.00::numeric, 15.00::numeric),
  ('Ipratropium (Atrovent)', '500 mcg/ 2ml', 'Nebule', 286.00::numeric, 10.00::numeric),
  ('Budesonide (Pulmicort)', '0.5 mg/ml', 'Nebule', 752.00::numeric, 10.00::numeric),
  ('Ibratropium/ Salbutamol (Swabivent)', '500 mcg/ 2.5 mg', 'Nebule', 176.00::numeric, 10.00::numeric),
  ('Metoclopramide (Primperan)', '10 mg/ 2ml', 'Ampule', 60.00::numeric, 10.00::numeric),
  ('Pantprazole (Zurcal)', '40 mg', 'Vial', 84.00::numeric, 10.00::numeric),
  ('Enoxaparin (Clexan)', '40 mg', 'Prefilled Syringe', 311.00::numeric, 15.00::numeric),
  ('Enoxaparin (Clexan)', '80 mg', 'Prefilled Syringe', 417.00::numeric, 15.00::numeric),
  ('Enoxaparin (Clexan)', '60 mg', 'Prefilled Syringe', 367.00::numeric, 15.00::numeric),
  ('Fondaparinux (Arixtra)', '2.5 mg/ 0.5ml', 'Prefilled Syringe', 138.00::numeric, 15.00::numeric),
  ('Fondaparinux (Arixtra)', '7.5 mg/ 0.6 ml', 'Prefilled Syringe', 256.00::numeric, 15.00::numeric)
) AS seed(name, strength, dosage_form, unit_price_egp, unit_price_eur)
WHERE medication.deleted_at IS NULL
  AND medication.name = seed.name
  AND medication.strength = seed.strength
  AND medication.dosage_form = seed.dosage_form;
