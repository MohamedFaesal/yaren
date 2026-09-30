import { randomUUID } from "node:crypto";
import { ApplicationError } from "@yaren/shared-kernel";
import type { IdentityService, StaffRole } from "@yaren/identity";

const devStaff: { email: string; displayName: string; role: StaffRole }[] = [
  { email: "admin@yaren.local", displayName: "Yaren Administrator", role: "system_admin" },
  { email: "layla.hassan@yaren.local", displayName: "Dr. Layla Hassan", role: "physician" },
  { email: "omar.farid@yaren.local", displayName: "Omar Farid", role: "nurse" },
  { email: "noha.samir@yaren.local", displayName: "Noha Samir", role: "receptionist" },
  { email: "pharmacy@yaren.local", displayName: "Mariam Nabil", role: "pharmacist" },
  { email: "claims@yaren.local", displayName: "Karim Adel", role: "claims_officer" },
  { email: "ops@yaren.local", displayName: "Hana Mostafa", role: "operations_manager" },
  { email: "hotel@yaren.local", displayName: "Hotel Desk", role: "hotel_manager" },
];

export async function seedDevStaff(identity: IdentityService, password: string) {
  for (const member of devStaff) {
    try {
      await identity.register({
        id: randomUUID(),
        email: member.email,
        password,
        displayName: member.displayName,
        role: member.role,
        centerId: null,
      });
    } catch (error) {
      if (error instanceof ApplicationError && error.code === "email_taken") continue;
      throw error;
    }
  }
}
