import type { User } from "./api";

type ResourceName = "user" | "hotel" | "clinic" | "patient" | "visit" | "activity" | "role";
type ActionName = "view" | "create" | "update" | "delete";

export function canAct(actor: User, resource: ResourceName, action: ActionName, record?: { ownerId?: string | null; clinicId?: string | null }) {
  if (actor.type === "super-admin" || actor.access?.bypass) return true;
  const entry = actor.access?.[resource]?.[action];
  if (!entry || entry.level === "none") return false;
  if (action !== "create" && entry.level === "own" && record?.ownerId !== actor.id) return false;
  if ((resource === "clinic" || resource === "patient" || resource === "visit") && record?.clinicId && !entry.allClinics && !entry.clinicIds.includes(record.clinicId)) return false;
  return true;
}

const areas: Record<string, string> = { user: "users", hotel: "hotels", clinic: "clinics", patient: "patients", visit: "visits", activity: "activity", role: "roles" };

export function permissionTitle(permission: { resource: string; action: string; ownership: string }) {
  const area = areas[permission.resource] ?? permission.resource;
  if (permission.action === "manage") return `Manage all ${area}`;
  if (permission.action === "create") return `Create ${area}`;
  const verb = permission.action === "view" ? "View" : permission.action === "update" ? "Update" : "Delete";
  return permission.ownership === "own" ? `${verb} ${area} I created` : `${verb} all ${area}`;
}
