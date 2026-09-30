ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'staff';

UPDATE identity.users SET user_type = 'super_admin' WHERE role = 'system_admin';
UPDATE identity.users SET user_type = 'admin' WHERE role IN ('center_manager', 'operations_manager');

ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE identity.users ADD CONSTRAINT users_user_type_check CHECK (user_type IN ('super_admin', 'admin', 'staff'));
