ALTER TABLE users ADD COLUMN created_by uuid REFERENCES users (id);

CREATE TABLE permissions (
  id text PRIMARY KEY,
  resource text NOT NULL,
  action text NOT NULL,
  ownership text NOT NULL CHECK (ownership IN ('all', 'own')),
  clinic_scoped boolean NOT NULL
);

CREATE TABLE access_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX access_roles_name_active_unique ON access_roles (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE access_role_permissions (
  role_id uuid NOT NULL REFERENCES access_roles (id) ON DELETE CASCADE,
  permission_id text NOT NULL REFERENCES permissions (id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_access_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  role_id uuid NOT NULL REFERENCES access_roles (id),
  all_clinics boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, role_id)
);

CREATE TABLE user_access_role_clinics (
  assignment_id uuid NOT NULL REFERENCES user_access_roles (id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES clinics (id),
  PRIMARY KEY (assignment_id, clinic_id)
);

CREATE TABLE user_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  permission_id text NOT NULL REFERENCES permissions (id),
  all_clinics boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, permission_id)
);

CREATE TABLE user_permission_grant_clinics (
  grant_id uuid NOT NULL REFERENCES user_permission_grants (id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES clinics (id),
  PRIMARY KEY (grant_id, clinic_id)
);

INSERT INTO permissions (id, resource, action, ownership, clinic_scoped) VALUES
  ('user.view.all', 'user', 'view', 'all', false),
  ('user.view.own', 'user', 'view', 'own', false),
  ('user.create.all', 'user', 'create', 'all', false),
  ('user.update.all', 'user', 'update', 'all', false),
  ('user.update.own', 'user', 'update', 'own', false),
  ('user.delete.all', 'user', 'delete', 'all', false),
  ('user.delete.own', 'user', 'delete', 'own', false),
  ('hotel.view.all', 'hotel', 'view', 'all', false),
  ('hotel.view.own', 'hotel', 'view', 'own', false),
  ('hotel.create.all', 'hotel', 'create', 'all', false),
  ('hotel.update.all', 'hotel', 'update', 'all', false),
  ('hotel.update.own', 'hotel', 'update', 'own', false),
  ('hotel.delete.all', 'hotel', 'delete', 'all', false),
  ('hotel.delete.own', 'hotel', 'delete', 'own', false),
  ('clinic.view.all', 'clinic', 'view', 'all', true),
  ('clinic.view.own', 'clinic', 'view', 'own', true),
  ('clinic.create.all', 'clinic', 'create', 'all', true),
  ('clinic.update.all', 'clinic', 'update', 'all', true),
  ('clinic.update.own', 'clinic', 'update', 'own', true),
  ('clinic.delete.all', 'clinic', 'delete', 'all', true),
  ('clinic.delete.own', 'clinic', 'delete', 'own', true),
  ('activity.view.all', 'activity', 'view', 'all', false),
  ('role.view.all', 'role', 'view', 'all', false),
  ('role.create.all', 'role', 'create', 'all', false),
  ('role.update.all', 'role', 'update', 'all', false),
  ('role.delete.all', 'role', 'delete', 'all', false);

INSERT INTO access_roles (id, name, description) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Administrator', 'Every action, in every clinic. Matches the previous admin account.'),
  ('22222222-2222-4222-8222-222222222222', 'Staff', 'View users, hotels, and clinics. Matches the previous staff account.');

INSERT INTO access_role_permissions (role_id, permission_id)
SELECT '11111111-1111-4111-8111-111111111111', id FROM permissions;

INSERT INTO access_role_permissions (role_id, permission_id) VALUES
  ('22222222-2222-4222-8222-222222222222', 'user.view.all'),
  ('22222222-2222-4222-8222-222222222222', 'hotel.view.all'),
  ('22222222-2222-4222-8222-222222222222', 'clinic.view.all');

INSERT INTO user_access_roles (user_id, role_id, all_clinics)
SELECT id, '11111111-1111-4111-8111-111111111111', true
FROM users WHERE type = 'admin' AND deleted_at IS NULL;

INSERT INTO user_access_roles (user_id, role_id, all_clinics)
SELECT id, '22222222-2222-4222-8222-222222222222', true
FROM users WHERE type = 'staff' AND deleted_at IS NULL;
