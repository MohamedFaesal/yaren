ALTER TABLE permissions ADD COLUMN description text NOT NULL DEFAULT '';

UPDATE permissions SET description = CASE id
  WHEN 'user.view.all' THEN 'See every user account.'
  WHEN 'user.view.own' THEN 'See only the user accounts you created.'
  WHEN 'user.create.all' THEN 'Add user accounts.'
  WHEN 'user.update.all' THEN 'Change any user account.'
  WHEN 'user.update.own' THEN 'Change only the user accounts you created.'
  WHEN 'user.delete.all' THEN 'Remove any user account.'
  WHEN 'user.delete.own' THEN 'Remove only the user accounts you created.'
  WHEN 'hotel.view.all' THEN 'See every hotel.'
  WHEN 'hotel.view.own' THEN 'See only the hotels you added.'
  WHEN 'hotel.create.all' THEN 'Add hotels.'
  WHEN 'hotel.update.all' THEN 'Change any hotel.'
  WHEN 'hotel.update.own' THEN 'Change only the hotels you added.'
  WHEN 'hotel.delete.all' THEN 'Remove any hotel that has no clinic.'
  WHEN 'hotel.delete.own' THEN 'Remove only the hotels you added, when they have no clinic.'
  WHEN 'clinic.view.all' THEN 'See clinics. Choose one clinic, several clinics, or every clinic when you assign this.'
  WHEN 'clinic.view.own' THEN 'See clinics you added, and only inside the clinics you choose when you assign this.'
  WHEN 'clinic.create.all' THEN 'Add a clinic in a hotel that already has one of your clinics. With every clinic, you can add the first clinic at any hotel.'
  WHEN 'clinic.update.all' THEN 'Change the clinics you choose when you assign this.'
  WHEN 'clinic.update.own' THEN 'Change clinics you added, and only inside the clinics you choose when you assign this.'
  WHEN 'clinic.delete.all' THEN 'Remove the clinics you choose when you assign this.'
  WHEN 'clinic.delete.own' THEN 'Remove clinics you added, and only inside the clinics you choose when you assign this.'
  WHEN 'activity.view.all' THEN 'Open the activity log. This follows the person, not a clinic.'
  WHEN 'role.view.all' THEN 'See permission roles.'
  WHEN 'role.create.all' THEN 'Add permission roles.'
  WHEN 'role.update.all' THEN 'Change permission roles.'
  WHEN 'role.delete.all' THEN 'Remove a permission role after it is taken off every person.'
  ELSE description
END;

INSERT INTO permissions (id, resource, action, ownership, clinic_scoped, description) VALUES
  ('user.manage.all', 'user', 'manage', 'all', false, 'Manage all users: see, add, change, and remove every user account.'),
  ('hotel.manage.all', 'hotel', 'manage', 'all', false, 'Manage all hotels: see, add, change, and remove every hotel.'),
  ('clinic.manage.all', 'clinic', 'manage', 'all', true, 'Manage clinics: see, add, change, and remove them. Choose one clinic, several clinics, or every clinic when you assign this.'),
  ('role.manage.all', 'role', 'manage', 'all', false, 'Manage all roles: see, add, change, and remove every permission role.');

INSERT INTO access_role_permissions (role_id, permission_id)
SELECT '11111111-1111-4111-8111-111111111111', id
FROM permissions
WHERE action = 'manage';
