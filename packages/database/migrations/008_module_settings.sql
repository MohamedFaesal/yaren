INSERT INTO identity.settings (key, value) VALUES
  ('insurer_api_notes', ''),
  ('insurer_client_id', ''),
  ('insurer_client_secret', ''),
  ('payroll_rules', ''),
  ('uat_signed_by', ''),
  ('uat_signed_on', ''),
  ('uat_note', '')
ON CONFLICT (key) DO NOTHING;
