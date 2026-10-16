ALTER TABLE medical_services
  DROP CONSTRAINT medical_services_type_check;

UPDATE medical_services
SET service_type = CASE
  WHEN code IN ('YAR-CONS-001', 'YAR-CONS-002', 'YAR-CONS-003', 'YAR-CONS-004', 'YAR-CONS-005', 'YAR-CONS-006')
    THEN 'Professional Services'
  WHEN code IN ('YAR-COORD-001', 'YAR-COORD-002', 'YAR-NURS-001', 'YAR-ADMIN-001')
    OR category = 'Administrative & Coordination'
    THEN 'Administrative & Coordination Services'
  WHEN category IN ('Laboratory', 'Imaging')
    THEN 'Investigations [Laboratory & Imaging] Services'
  WHEN name IN (
    'Incision & Drainage - Simple Abscess',
    'Incision & Drainage - Complicated Abscess',
    'Nail Removal',
    'Foreign Body Removal - Superficial I',
    'Foreign Body Removal - Superficial II',
    'Wound Suturing / Stitch',
    'Simple Laceration Repair',
    'Complex Laceration Repair',
    'Minor Surgical Procedure',
    'Foreign Body Eye Removal'
  ) THEN 'Surgical Procedures Services'
  WHEN category IN ('Nursing & Medication Administration', 'Procedures & Wound Care')
    THEN 'Medical Procedures Services'
  ELSE 'Others'
END
WHERE deleted_at IS NULL;

ALTER TABLE medical_services
  ADD CONSTRAINT medical_services_type_check
  CHECK (service_type IN (
    'Professional Services',
    'Administrative & Coordination Services',
    'Medical Procedures Services',
    'Surgical Procedures Services',
    'Investigations [Laboratory & Imaging] Services',
    'Others'
  ));

ALTER TABLE patient_visits
  ADD COLUMN professional_service_id uuid REFERENCES medical_services (id);
