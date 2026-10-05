INSERT INTO permissions (id, resource, action, ownership, clinic_scoped, description) VALUES
  ('visit.view.all', 'visit', 'view', 'all', true, 'See visits. Choose one clinic, several clinics, or every clinic when you assign this.'),
  ('visit.view.own', 'visit', 'view', 'own', true, 'See visits for patients you added, and only inside the clinics you choose when you assign this.'),
  ('visit.create.all', 'visit', 'create', 'all', true, 'Add visits in the clinics you choose when you assign this.'),
  ('visit.update.all', 'visit', 'update', 'all', true, 'Change visits in the clinics you choose when you assign this.'),
  ('visit.update.own', 'visit', 'update', 'own', true, 'Change visits for patients you added, and only inside the clinics you choose when you assign this.'),
  ('visit.delete.all', 'visit', 'delete', 'all', true, 'Remove visits in the clinics you choose when you assign this.'),
  ('visit.delete.own', 'visit', 'delete', 'own', true, 'Remove visits for patients you added, and only inside the clinics you choose when you assign this.'),
  ('visit.manage.all', 'visit', 'manage', 'all', true, 'Manage visits: see, add, change, and remove them. Choose one clinic, several clinics, or every clinic when you assign this.');

UPDATE permissions SET description = CASE id
  WHEN 'patient.view.all' THEN 'See patients. Choose one clinic, several clinics, or every clinic when you assign this.'
  WHEN 'patient.view.own' THEN 'See patients you added, and only inside the clinics you choose when you assign this.'
  WHEN 'patient.create.all' THEN 'Add patients in the clinics you choose when you assign this.'
  WHEN 'patient.update.all' THEN 'Change patients in the clinics you choose when you assign this.'
  WHEN 'patient.update.own' THEN 'Change patients you added, and only inside the clinics you choose when you assign this.'
  WHEN 'patient.delete.all' THEN 'Remove patients in the clinics you choose when you assign this.'
  WHEN 'patient.delete.own' THEN 'Remove patients you added, and only inside the clinics you choose when you assign this.'
  WHEN 'patient.manage.all' THEN 'Manage patients: see, add, change, and remove them. Choose one clinic, several clinics, or every clinic when you assign this.'
  ELSE description
END
WHERE resource = 'patient';

INSERT INTO access_role_permissions (role_id, permission_id)
SELECT rp.role_id, replace(rp.permission_id, 'patient.', 'visit.')
FROM access_role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE p.resource = 'patient'
  AND NOT EXISTS (
    SELECT 1 FROM access_role_permissions existing
    WHERE existing.role_id = rp.role_id
      AND existing.permission_id = replace(rp.permission_id, 'patient.', 'visit.')
  );

INSERT INTO user_permission_grants (user_id, permission_id, all_clinics)
SELECT g.user_id, replace(g.permission_id, 'patient.', 'visit.'), g.all_clinics
FROM user_permission_grants g
JOIN permissions p ON p.id = g.permission_id
WHERE p.resource = 'patient'
  AND NOT EXISTS (
    SELECT 1 FROM user_permission_grants existing
    WHERE existing.user_id = g.user_id
      AND existing.permission_id = replace(g.permission_id, 'patient.', 'visit.')
  );

INSERT INTO user_permission_grant_clinics (grant_id, clinic_id)
SELECT visit_grant.id, clinic.clinic_id
FROM user_permission_grants patient_grant
JOIN permissions p ON p.id = patient_grant.permission_id AND p.resource = 'patient'
JOIN user_permission_grant_clinics clinic ON clinic.grant_id = patient_grant.id
JOIN user_permission_grants visit_grant
  ON visit_grant.user_id = patient_grant.user_id
 AND visit_grant.permission_id = replace(patient_grant.permission_id, 'patient.', 'visit.')
WHERE NOT EXISTS (
  SELECT 1 FROM user_permission_grant_clinics existing
  WHERE existing.grant_id = visit_grant.id
    AND existing.clinic_id = clinic.clinic_id
);
