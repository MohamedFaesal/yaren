-- Eye and orthopedic procedure prices, plus the first reusable procedure form.

ALTER TABLE medical_services
  ADD COLUMN procedure_form text;

UPDATE medical_services
SET position = position + 19
WHERE deleted_at IS NULL
  AND position >= 70;

UPDATE medical_services
SET price = CASE code
      WHEN 'YRN-INT-034' THEN 250.00
      WHEN 'YRN-INT-036' THEN 250.00
      WHEN 'YRN-INT-039' THEN 50.00
      WHEN 'YRN-INT-040' THEN 250.00
      WHEN 'YRN-INT-042' THEN 350.00
      ELSE price
    END,
    unit_price_eur = CASE code
      WHEN 'YRN-INT-034' THEN 250.00
      WHEN 'YRN-INT-036' THEN 250.00
      WHEN 'YRN-INT-039' THEN 50.00
      WHEN 'YRN-INT-040' THEN 250.00
      WHEN 'YRN-INT-042' THEN 350.00
      ELSE unit_price_eur
    END,
    procedure_form = 'clinical-intervention',
    updated_at = now()
WHERE deleted_at IS NULL
  AND code IN ('YRN-INT-034', 'YRN-INT-036', 'YRN-INT-039', 'YRN-INT-040', 'YRN-INT-042', 'YRN-INT-043');

INSERT INTO medical_services (service_type, category, name, unit, code, position, price, unit_price_eur, procedure_form)
VALUES
  ('Procedures & Interventions Services', 'Interventions', 'Above Elbow Slab', 'Per procedure', 'YRN-INT-044', 70, 150.00, 150.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Above Elbow Cast', 'Per procedure', 'YRN-INT-045', 71, 200.00, 200.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Above Knee Slab', 'Per procedure', 'YRN-INT-046', 72, 250.00, 250.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Above Knee Cast', 'Per procedure', 'YRN-INT-047', 73, 300.00, 300.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Below Elbow Slab', 'Per procedure', 'YRN-INT-048', 74, 150.00, 150.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Below Elbow Cast', 'Per procedure', 'YRN-INT-049', 75, 250.00, 250.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Below Knee Slab', 'Per procedure', 'YRN-INT-050', 76, 200.00, 200.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Below Knee Cast', 'Per procedure', 'YRN-INT-051', 77, 300.00, 300.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Crepe Bandage application', 'Per procedure', 'YRN-INT-052', 78, 50.00, 50.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Dynamic Plaster application', 'Per procedure', 'YRN-INT-053', 79, 80.00, 80.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Elbow Dislocation Reduction', 'Per procedure', 'YRN-INT-054', 80, 300.00, 300.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Finger/Toe Dislocation', 'Per procedure', 'YRN-INT-055', 81, 250.00, 250.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Closed Fracture Reduction', 'Per procedure', 'YRN-INT-056', 82, 350.00, 350.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Intrarticular Knee Injection', 'Per procedure', 'YRN-INT-057', 83, 250.00, 250.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Intrarticular Shoulder Injection', 'Per procedure', 'YRN-INT-058', 84, 250.00, 250.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Shoulder Dislocation Reduction', 'Per procedure', 'YRN-INT-059', 85, 300.00, 300.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Skin Traction (taping) Kinesio', 'Per procedure', 'YRN-INT-060', 86, 150.00, 150.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'Trigger Point Injection', 'Per procedure', 'YRN-INT-061', 87, 150.00, 150.00, 'clinical-intervention'),
  ('Procedures & Interventions Services', 'Interventions', 'U-Shaped Slab', 'Per procedure', 'YRN-INT-062', 88, 200.00, 200.00, 'clinical-intervention');
