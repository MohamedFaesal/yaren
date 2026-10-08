INSERT INTO permissions (id, resource, action, ownership, clinic_scoped, description) VALUES
  ('triage.view.all', 'triage', 'view', 'all', true, 'See the triage queue and assessments. Choose one clinic, several clinics, or every clinic when you assign this.'),
  ('triage.view.own', 'triage', 'view', 'own', true, 'See triage for patients you added, and only inside the clinics you choose when you assign this.'),
  ('triage.update.all', 'triage', 'update', 'all', true, 'Record triage and send patients to a doctor in the clinics you choose when you assign this.'),
  ('triage.update.own', 'triage', 'update', 'own', true, 'Record triage for patients you added and send them to a doctor, and only inside the clinics you choose when you assign this.'),
  ('triage.manage.all', 'triage', 'manage', 'all', true, 'Manage triage: see the queue, record assessments, and send patients to a doctor. Choose one clinic, several clinics, or every clinic when you assign this.');

INSERT INTO access_role_permissions (role_id, permission_id)
SELECT rp.role_id, replace(rp.permission_id, 'visit.', 'triage.')
FROM access_role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE p.resource = 'visit'
  AND p.action IN ('view', 'update', 'manage')
  AND NOT EXISTS (
    SELECT 1 FROM access_role_permissions existing
    WHERE existing.role_id = rp.role_id
      AND existing.permission_id = replace(rp.permission_id, 'visit.', 'triage.')
  );

INSERT INTO user_permission_grants (user_id, permission_id, all_clinics)
SELECT g.user_id, replace(g.permission_id, 'visit.', 'triage.'), g.all_clinics
FROM user_permission_grants g
JOIN permissions p ON p.id = g.permission_id
WHERE p.resource = 'visit'
  AND p.action IN ('view', 'update', 'manage')
  AND NOT EXISTS (
    SELECT 1 FROM user_permission_grants existing
    WHERE existing.user_id = g.user_id
      AND existing.permission_id = replace(g.permission_id, 'visit.', 'triage.')
  );

INSERT INTO user_permission_grant_clinics (grant_id, clinic_id)
SELECT triage_grant.id, clinic.clinic_id
FROM user_permission_grants visit_grant
JOIN permissions p ON p.id = visit_grant.permission_id AND p.resource = 'visit' AND p.action IN ('view', 'update', 'manage')
JOIN user_permission_grant_clinics clinic ON clinic.grant_id = visit_grant.id
JOIN user_permission_grants triage_grant
  ON triage_grant.user_id = visit_grant.user_id
 AND triage_grant.permission_id = replace(visit_grant.permission_id, 'visit.', 'triage.')
WHERE NOT EXISTS (
  SELECT 1 FROM user_permission_grant_clinics existing
  WHERE existing.grant_id = triage_grant.id
    AND existing.clinic_id = clinic.clinic_id
);
