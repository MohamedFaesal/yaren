import type { FastifyRequest } from "fastify";
import type pg from "pg";
import { ApplicationError } from "@yaren/shared-kernel";

export const resources = ["user", "hotel", "clinic", "patient", "visit", "activity", "role"] as const;
export const verbs = ["view", "create", "update", "delete"] as const;

export type ResourceName = (typeof resources)[number];
export type Verb = (typeof verbs)[number];
export type Ownership = "all" | "own";

export type Grant = {
  resource: ResourceName;
  action: Verb;
  ownership: Ownership;
  clinicScoped: boolean;
  allClinics: boolean;
  clinicIds: string[];
};

export type ActionGrant = { level: "all" | "own" | "none"; allClinics: boolean; clinicIds: string[] };
export type Access = {
  bypass: boolean;
  grants: Grant[];
  summary: Record<ResourceName, Record<Verb, ActionGrant>>;
};

type Check = {
  resource: ResourceName;
  action: Verb;
  ownerId?: string | null;
  clinicId?: string | null;
};

const emptyAction = (): ActionGrant => ({ level: "none", allClinics: false, clinicIds: [] });

export async function loadAccess(pool: pg.Pool, actor: { sub: string; type: string }): Promise<Access> {
  if (actor.type === "super-admin") return { bypass: true, grants: [], summary: fullSummary() };
  const result = await pool.query<{
    resource: ResourceName;
    action: string;
    ownership: Ownership;
    clinic_scoped: boolean;
    all_clinics: boolean;
    clinic_ids: string[] | null;
  }>(
    `SELECT p.resource, p.action, p.ownership, p.clinic_scoped, a.all_clinics,
            COALESCE(array_agg(c.clinic_id) FILTER (WHERE c.clinic_id IS NOT NULL), '{}') AS clinic_ids
     FROM user_access_roles a
     JOIN access_roles r ON r.id = a.role_id AND r.deleted_at IS NULL
     JOIN access_role_permissions rp ON rp.role_id = a.role_id
     JOIN permissions p ON p.id = rp.permission_id
     LEFT JOIN user_access_role_clinics c ON c.assignment_id = a.id
     WHERE a.user_id = $1
     GROUP BY p.resource, p.action, p.ownership, p.clinic_scoped, a.id, a.all_clinics
     UNION ALL
     SELECT p.resource, p.action, p.ownership, p.clinic_scoped, g.all_clinics,
            COALESCE(array_agg(c.clinic_id) FILTER (WHERE c.clinic_id IS NOT NULL), '{}')
     FROM user_permission_grants g
     JOIN permissions p ON p.id = g.permission_id
     LEFT JOIN user_permission_grant_clinics c ON c.grant_id = g.id
     WHERE g.user_id = $1
     GROUP BY p.resource, p.action, p.ownership, p.clinic_scoped, g.id, g.all_clinics`,
    [actor.sub],
  );
  const grants = result.rows.flatMap((row) => expandManage({
    resource: row.resource,
    action: row.action,
    ownership: row.ownership,
    clinicScoped: row.clinic_scoped,
    allClinics: row.all_clinics || !row.clinic_scoped,
    clinicIds: row.clinic_ids ?? [],
  }));
  return { bypass: false, grants, summary: summarize(grants) };
}

export function canList(access: Access, resource: ResourceName) {
  return access.bypass || access.summary[resource].view.level !== "none";
}

/** Clinics a user may pick when registering / creating a visit. */
export function visitClinicOptionsWhere(access: Access) {
  if (access.bypass) return { sql: "TRUE", params: [] as unknown[] };
  const create = access.summary.visit.create;
  if (create.level === "none") return null;
  if (create.allClinics) return { sql: "TRUE", params: [] as unknown[] };
  if (create.clinicIds.length === 0) return { sql: "FALSE", params: [] as unknown[] };
  return { sql: "c.id = ANY($1::uuid[])", params: [create.clinicIds] as unknown[] };
}

/** Clinics available in the header workspace switcher for care work. */
export function workspaceClinicOptionsWhere(access: Access) {
  if (access.bypass) return { sql: "TRUE" as const, params: [] as unknown[], allClinics: true };
  const actions = [
    access.summary.visit.create,
    access.summary.visit.view,
    access.summary.visit.update,
    access.summary.patient.create,
    access.summary.patient.view,
  ].filter((entry) => entry.level !== "none");
  if (actions.length === 0) return null;
  if (actions.some((entry) => entry.allClinics)) {
    return { sql: "TRUE" as const, params: [] as unknown[], allClinics: true };
  }
  const clinicIds = [...new Set(actions.flatMap((entry) => entry.clinicIds))];
  if (clinicIds.length === 0) return { sql: "FALSE" as const, params: [] as unknown[], allClinics: false };
  return { sql: "c.id = ANY($1::uuid[])", params: [clinicIds] as unknown[], allClinics: false };
}

export function can(access: Access, actorId: string, check: Check) {
  if (access.bypass) return true;
  return access.grants.some((grant) => grantMatches(grant, actorId, check));
}

export async function assertCan(pool: pg.Pool, request: FastifyRequest, check: Check) {
  const access = await loadAccess(pool, request.user);
  if (!can(access, request.user.sub, check)) {
    throw new ApplicationError(403, "forbidden", "You do not have permission to do that");
  }
  return access;
}

export function viewWhere(access: Access, actorId: string, resource: ResourceName, columns: { owner: string; clinic?: string }) {
  if (access.bypass) return { sql: "TRUE", params: [] as unknown[] };
  const grants = access.grants.filter((grant) => grant.resource === resource && grant.action === "view");
  if (grants.length === 0) return { sql: "FALSE", params: [] as unknown[] };
  const params: unknown[] = [];
  const parts: string[] = [];
  for (const grant of grants) {
    const bits: string[] = [];
    if (grant.ownership === "own") {
      params.push(actorId);
      bits.push(`${columns.owner} = $${params.length}`);
    }
    if (grant.clinicScoped && columns.clinic && !grant.allClinics) {
      params.push(grant.clinicIds);
      bits.push(`${columns.clinic} = ANY($${params.length}::uuid[])`);
    }
    parts.push(bits.length === 0 ? "TRUE" : `(${bits.join(" AND ")})`);
  }
  if (parts.includes("TRUE")) return { sql: "TRUE", params: [] as unknown[] };
  return { sql: `(${parts.join(" OR ")})`, params };
}

export function patientViewWhere(access: Access, actorId: string) {
  if (access.bypass) return { sql: "TRUE", params: [] as unknown[] };
  const grants = access.grants.filter((grant) => grant.resource === "patient" && grant.action === "view");
  if (grants.length === 0) return { sql: "FALSE", params: [] as unknown[] };
  const params: unknown[] = [];
  const parts: string[] = [];
  for (const grant of grants) {
    const bits: string[] = [];
    if (grant.ownership === "own") {
      params.push(actorId);
      bits.push(`p.added_by = $${params.length}`);
    }
    if (!grant.allClinics) {
      params.push(grant.clinicIds);
      const clinicSlot = params.length;
      if (grant.ownership === "own") {
        bits.push(`(
          EXISTS (
            SELECT 1 FROM patient_visits v
            WHERE v.patient_id = p.id AND v.deleted_at IS NULL AND v.clinic_id = ANY($${clinicSlot}::uuid[])
          )
          OR NOT EXISTS (
            SELECT 1 FROM patient_visits v
            WHERE v.patient_id = p.id AND v.deleted_at IS NULL
          )
        )`);
      } else {
        bits.push(`EXISTS (
          SELECT 1 FROM patient_visits v
          WHERE v.patient_id = p.id AND v.deleted_at IS NULL AND v.clinic_id = ANY($${clinicSlot}::uuid[])
        )`);
      }
    }
    parts.push(bits.length === 0 ? "TRUE" : `(${bits.join(" AND ")})`);
  }
  if (parts.includes("TRUE")) return { sql: "TRUE", params: [] as unknown[] };
  return { sql: `(${parts.join(" OR ")})`, params };
}

export function visitViewWhere(access: Access, actorId: string) {
  if (access.bypass) return { sql: "TRUE", params: [] as unknown[] };
  const grants = access.grants.filter((grant) => grant.resource === "visit" && grant.action === "view");
  if (grants.length === 0) return { sql: "FALSE", params: [] as unknown[] };
  const params: unknown[] = [];
  const parts: string[] = [];
  for (const grant of grants) {
    const bits: string[] = [];
    if (grant.ownership === "own") {
      params.push(actorId);
      bits.push(`p.added_by = $${params.length}`);
    }
    if (!grant.allClinics) {
      params.push(grant.clinicIds);
      bits.push(`v.clinic_id = ANY($${params.length}::uuid[])`);
    }
    parts.push(bits.length === 0 ? "TRUE" : `(${bits.join(" AND ")})`);
  }
  if (parts.includes("TRUE")) return { sql: "TRUE", params: [] as unknown[] };
  return { sql: `(${parts.join(" OR ")})`, params };
}

export async function assertClinicScoped(
  access: Access,
  actorId: string,
  resource: ResourceName,
  actions: Verb[],
  clinicId: string,
  ownerId?: string | null,
) {
  if (access.bypass) return;
  const allowed = access.grants.some((grant) => {
    if (grant.resource !== resource || !actions.includes(grant.action)) return false;
    if (grant.action !== "create" && grant.ownership === "own" && ownerId !== actorId) return false;
    return grant.allClinics || grant.clinicIds.includes(clinicId);
  });
  if (!allowed) throw new ApplicationError(403, "forbidden", "You do not have permission to do that");
}

export async function assertPatientClinic(
  access: Access,
  actorId: string,
  actions: Verb[],
  clinicId: string,
  ownerId?: string | null,
) {
  return assertClinicScoped(access, actorId, "patient", actions, clinicId, ownerId);
}

export async function assertVisitClinic(
  access: Access,
  actorId: string,
  actions: Verb[],
  clinicId: string,
  ownerId?: string | null,
) {
  return assertClinicScoped(access, actorId, "visit", actions, clinicId, ownerId);
}

export async function assertPatientCan(
  pool: pg.Pool,
  request: FastifyRequest,
  check: { action: Verb; ownerId: string | null; patientId: string; clinicId?: string | null },
) {
  const access = await loadAccess(pool, request.user);
  if (access.bypass) return access;
  if (check.clinicId) {
    if (can(access, request.user.sub, { resource: "patient", action: check.action, ownerId: check.ownerId, clinicId: check.clinicId })) return access;
    throw new ApplicationError(403, "forbidden", "You do not have permission to do that");
  }
  const visits = await pool.query<{ clinic_id: string }>(
    "SELECT DISTINCT clinic_id FROM patient_visits WHERE patient_id = $1 AND deleted_at IS NULL",
    [check.patientId],
  );
  if (visits.rows.length === 0) {
    const grants = access.grants.filter((grant) => grant.resource === "patient" && grant.action === check.action);
    const allowed = grants.some((grant) => {
      if (check.action !== "create" && grant.ownership === "own" && check.ownerId !== request.user.sub) return false;
      return grant.allClinics || grant.ownership === "own";
    });
    if (!allowed) throw new ApplicationError(403, "forbidden", "You do not have permission to do that");
    return access;
  }
  const allowed = visits.rows.some((row) => can(access, request.user.sub, {
    resource: "patient",
    action: check.action,
    ownerId: check.ownerId,
    clinicId: row.clinic_id,
  }));
  if (!allowed) throw new ApplicationError(403, "forbidden", "You do not have permission to do that");
  return access;
}

export async function assertCreateClinic(pool: pg.Pool, access: Access, hotelId: string) {
  if (access.bypass) return;
  const grants = access.grants.filter((grant) => grant.resource === "clinic" && grant.action === "create");
  if (grants.length === 0) throw new ApplicationError(403, "forbidden", "You do not have permission to do that");
  if (grants.some((grant) => grant.allClinics)) return;
  const clinicIds = [...new Set(grants.flatMap((grant) => grant.clinicIds))];
  const result = await pool.query(
    "SELECT id FROM clinics WHERE hotel_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[]) LIMIT 1",
    [hotelId, clinicIds],
  );
  if (!result.rows[0]) {
    throw new ApplicationError(403, "forbidden", "You can add a clinic only in a hotel that already has one of your clinics");
  }
}

type AssignmentInput = { role_id: string; all_clinics: boolean; clinic_ids: string[] };
type GrantInput = { permission_id: string; all_clinics: boolean; clinic_ids: string[] };

export async function validateUserAccess(pool: pg.Pool, actor: { sub: string; type: string }, assignments: AssignmentInput[], grants: GrantInput[]) {
  const access = await loadAccess(pool, actor);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertWithinCeiling(client, access, assignments, grants);
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveUserAccess(pool: pg.Pool, actor: { sub: string; type: string }, userId: string, assignments: AssignmentInput[], grants: GrantInput[]) {
  const access = await loadAccess(pool, actor);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertWithinCeiling(client, access, assignments, grants);
    await client.query("DELETE FROM user_access_roles WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM user_permission_grants WHERE user_id = $1", [userId]);
    for (const assignment of assignments) {
      const inserted = await client.query<{ id: string }>(
        "INSERT INTO user_access_roles (user_id, role_id, all_clinics) VALUES ($1, $2, $3) RETURNING id",
        [userId, assignment.role_id, assignment.all_clinics],
      );
      const assignmentId = inserted.rows[0]?.id;
      if (!assignmentId) throw new ApplicationError(500, "insert_failed", "The role assignment could not be saved");
      for (const clinicId of assignment.clinic_ids) {
        await client.query("INSERT INTO user_access_role_clinics (assignment_id, clinic_id) VALUES ($1, $2)", [assignmentId, clinicId]);
      }
    }
    for (const grant of grants) {
      const inserted = await client.query<{ id: string }>(
        "INSERT INTO user_permission_grants (user_id, permission_id, all_clinics) VALUES ($1, $2, $3) RETURNING id",
        [userId, grant.permission_id, grant.all_clinics],
      );
      const grantId = inserted.rows[0]?.id;
      if (!grantId) throw new ApplicationError(500, "insert_failed", "The extra permission could not be saved");
      for (const clinicId of grant.clinic_ids) {
        await client.query("INSERT INTO user_permission_grant_clinics (grant_id, clinic_id) VALUES ($1, $2)", [grantId, clinicId]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function readUserAccess(pool: pg.Pool, userId: string) {
  const assignments = await pool.query<{ id: string; role_id: string; role_name: string; all_clinics: boolean; clinic_ids: string[] }>(
    `SELECT a.id, a.role_id, r.name AS role_name, a.all_clinics,
            COALESCE(array_agg(c.clinic_id) FILTER (WHERE c.clinic_id IS NOT NULL), '{}') AS clinic_ids
     FROM user_access_roles a
     JOIN access_roles r ON r.id = a.role_id
     LEFT JOIN user_access_role_clinics c ON c.assignment_id = a.id
     WHERE a.user_id = $1
     GROUP BY a.id, r.name
     ORDER BY r.name`,
    [userId],
  );
  const grants = await pool.query<{ id: string; permission_id: string; all_clinics: boolean; clinic_ids: string[] }>(
    `SELECT g.id, g.permission_id, g.all_clinics,
            COALESCE(array_agg(c.clinic_id) FILTER (WHERE c.clinic_id IS NOT NULL), '{}') AS clinic_ids
     FROM user_permission_grants g
     LEFT JOIN user_permission_grant_clinics c ON c.grant_id = g.id
     WHERE g.user_id = $1
     GROUP BY g.id
     ORDER BY g.permission_id`,
    [userId],
  );
  return { assignments: assignments.rows, grants: grants.rows };
}

async function assertWithinCeiling(client: pg.PoolClient, access: Access, assignments: AssignmentInput[], grants: GrantInput[]) {
  if (access.bypass) {
    await assertChoicesExist(client, assignments, grants);
    return;
  }
  const needed: Grant[] = [];
  for (const assignment of assignments) {
    const role = await client.query<{ id: string; clinic_scoped: boolean; resource: ResourceName; action: string; ownership: Ownership }>(
      `SELECT r.id, p.clinic_scoped, p.resource, p.action, p.ownership
       FROM access_roles r
       JOIN access_role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE r.id = $1 AND r.deleted_at IS NULL`,
      [assignment.role_id],
    );
    if (role.rows.length === 0) throw new ApplicationError(422, "unknown_role", "Choose a role that exists");
    const scopesClinic = role.rows.some((row) => row.clinic_scoped);
    assertClinicChoice(scopesClinic, assignment.all_clinics, assignment.clinic_ids);
    for (const row of role.rows) {
      needed.push(...asGrants(row, assignment.all_clinics, assignment.clinic_ids));
    }
  }
  for (const grant of grants) {
    const permission = await client.query<{ clinic_scoped: boolean; resource: ResourceName; action: string; ownership: Ownership }>(
      "SELECT clinic_scoped, resource, action, ownership FROM permissions WHERE id = $1",
      [grant.permission_id],
    );
    const row = permission.rows[0];
    if (!row) throw new ApplicationError(422, "unknown_permission", "Choose a permission that exists");
    assertClinicChoice(row.clinic_scoped, grant.all_clinics, grant.clinic_ids);
    needed.push(...asGrants(row, grant.all_clinics, grant.clinic_ids));
  }
  await assertClinicsExist(client, [...assignments.flatMap((item) => item.clinic_ids), ...grants.flatMap((item) => item.clinic_ids)]);
  for (const grant of needed) {
    const covered = access.grants.some((held) => heldCovers(held, grant));
    if (!covered) throw new ApplicationError(403, "forbidden", "You cannot assign a permission you do not have");
  }
}

async function assertChoicesExist(client: pg.PoolClient, assignments: AssignmentInput[], grants: GrantInput[]) {
  for (const assignment of assignments) {
    const role = await client.query<{ clinic_scoped: boolean }>(
      `SELECT p.clinic_scoped
       FROM access_roles r
       JOIN access_role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE r.id = $1 AND r.deleted_at IS NULL`,
      [assignment.role_id],
    );
    if (role.rows.length === 0) throw new ApplicationError(422, "unknown_role", "Choose a role that exists");
    assertClinicChoice(role.rows.some((row) => row.clinic_scoped), assignment.all_clinics, assignment.clinic_ids);
  }
  for (const grant of grants) {
    const permission = await client.query<{ clinic_scoped: boolean }>("SELECT clinic_scoped FROM permissions WHERE id = $1", [grant.permission_id]);
    if (!permission.rows[0]) throw new ApplicationError(422, "unknown_permission", "Choose a permission that exists");
    assertClinicChoice(permission.rows[0].clinic_scoped, grant.all_clinics, grant.clinic_ids);
  }
  await assertClinicsExist(client, [...assignments.flatMap((item) => item.clinic_ids), ...grants.flatMap((item) => item.clinic_ids)]);
}

function assertClinicChoice(scoped: boolean, allClinics: boolean, clinicIds: string[]) {
  if (!scoped) return;
  if (!allClinics && clinicIds.length === 0) throw new ApplicationError(422, "clinics_required", "Choose all clinics, or at least one clinic");
}

async function assertClinicsExist(client: pg.PoolClient, clinicIds: string[]) {
  const unique = [...new Set(clinicIds)];
  if (unique.length === 0) return;
  const result = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM clinics WHERE deleted_at IS NULL AND id = ANY($1::uuid[])", [unique]);
  if (result.rows[0]?.count !== unique.length) throw new ApplicationError(422, "unknown_clinic", "Choose a clinic that exists");
}

function asGrants(row: { resource: ResourceName; action: string; ownership: Ownership; clinic_scoped: boolean }, allClinics: boolean, clinicIds: string[]): Grant[] {
  return expandManage({
    resource: row.resource,
    action: row.action,
    ownership: row.ownership,
    clinicScoped: row.clinic_scoped,
    allClinics: row.clinic_scoped ? allClinics : true,
    clinicIds: row.clinic_scoped && !allClinics ? clinicIds : [],
  });
}

function expandManage(grant: Omit<Grant, "action"> & { action: string }): Grant[] {
  if (grant.action !== "manage") return [{ ...grant, action: grant.action as Verb }];
  return verbs.map((action) => ({ ...grant, action, ownership: "all" }));
}

function heldCovers(held: Grant, needed: Grant) {
  if (held.resource !== needed.resource || held.action !== needed.action) return false;
  if (needed.ownership === "all" && held.ownership !== "all") return false;
  if (!needed.clinicScoped) return true;
  if (held.allClinics) return true;
  if (needed.allClinics) return false;
  return needed.clinicIds.every((id) => held.clinicIds.includes(id));
}

function grantMatches(grant: Grant, actorId: string, check: Check) {
  if (grant.resource !== check.resource || grant.action !== check.action) return false;
  if (check.action !== "create" && grant.ownership === "own" && check.ownerId !== actorId) return false;
  if (!grant.clinicScoped || check.action === "create") return true;
  if (!check.clinicId) return false;
  return grant.allClinics || grant.clinicIds.includes(check.clinicId);
}

function summarize(grants: Grant[]): Access["summary"] {
  const summary = emptySummary();
  for (const resource of resources) {
    for (const action of verbs) {
      const matched = grants.filter((grant) => grant.resource === resource && grant.action === action);
      const wide = matched.filter((grant) => grant.ownership === "all" || action === "create");
      const level = action === "create" ? (matched.length ? "all" : "none") : wide.length ? "all" : matched.length ? "own" : "none";
      const used = level === "own" ? matched : wide;
      summary[resource][action] = {
        level,
        allClinics: used.some((grant) => grant.allClinics || !grant.clinicScoped),
        clinicIds: [...new Set(used.flatMap((grant) => grant.clinicIds))],
      };
    }
  }
  return summary;
}

function emptySummary(): Access["summary"] {
  return {
    user: { view: emptyAction(), create: emptyAction(), update: emptyAction(), delete: emptyAction() },
    hotel: { view: emptyAction(), create: emptyAction(), update: emptyAction(), delete: emptyAction() },
    clinic: { view: emptyAction(), create: emptyAction(), update: emptyAction(), delete: emptyAction() },
    patient: { view: emptyAction(), create: emptyAction(), update: emptyAction(), delete: emptyAction() },
    visit: { view: emptyAction(), create: emptyAction(), update: emptyAction(), delete: emptyAction() },
    activity: { view: emptyAction(), create: emptyAction(), update: emptyAction(), delete: emptyAction() },
    role: { view: emptyAction(), create: emptyAction(), update: emptyAction(), delete: emptyAction() },
  };
}

function fullSummary(): Access["summary"] {
  const summary = emptySummary();
  const open = (): ActionGrant => ({ level: "all", allClinics: true, clinicIds: [] });
  for (const resource of resources) {
    for (const action of verbs) summary[resource][action] = open();
  }
  return summary;
}
