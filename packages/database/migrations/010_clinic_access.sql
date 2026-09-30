CREATE TABLE IF NOT EXISTS identity.clinic_access (
  user_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  capabilities text[] NOT NULL,
  PRIMARY KEY (user_id, clinic_id)
);

INSERT INTO identity.clinic_access (user_id, clinic_id, capabilities)
SELECT u.id, c.id,
  CASE u.role
    WHEN 'physician' THEN ARRAY['clinical', 'transfers']
    WHEN 'nurse' THEN ARRAY['desk', 'clinical']
    WHEN 'receptionist' THEN ARRAY['desk', 'billing', 'insurance']
    WHEN 'pharmacist' THEN ARRAY['pharmacy']
    WHEN 'claims_officer' THEN ARRAY['billing', 'insurance']
    WHEN 'hotel_manager' THEN ARRAY['desk']
    ELSE ARRAY['desk', 'clinical', 'pharmacy', 'billing', 'insurance', 'transfers', 'quality', 'reports']
  END
FROM identity.users u
JOIN organization.clinics c ON u.hotel_id IS NULL OR c.hotel_id = u.hotel_id
WHERE u.role <> 'system_admin'
ON CONFLICT (user_id, clinic_id) DO NOTHING;
