import { AggregateRoot, DomainError, assertNonEmpty } from "@yaren/shared-kernel";

export const staffRoles = [
  "system_admin",
  "center_manager",
  "operations_manager",
  "physician",
  "nurse",
  "receptionist",
  "pharmacist",
  "claims_officer",
  "hotel_manager",
] as const;

export type StaffRole = (typeof staffRoles)[number];
export type UserStatus = "active" | "disabled";

const practitionerRoles: ReadonlySet<StaffRole> = new Set(["physician", "nurse"]);

export type UserSnapshot = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: StaffRole;
  centerId: string | null;
  status: UserStatus;
  createdAt: Date;
};

export type RegisterUserInput = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: StaffRole;
  centerId: string | null;
  createdAt: Date;
};

export class User extends AggregateRoot {
  private constructor(private readonly snapshot: UserSnapshot) {
    super(snapshot.id);
  }

  static register(input: RegisterUserInput): User {
    return new User({
      id: input.id,
      email: requireEmail(input.email),
      passwordHash: assertNonEmpty(input.passwordHash, "password_required", "Password is required"),
      displayName: requireDisplayName(input.displayName),
      role: input.role,
      centerId: input.centerId,
      status: "active",
      createdAt: input.createdAt,
    });
  }

  static reconstitute(snapshot: UserSnapshot): User {
    return new User(snapshot);
  }

  toSnapshot(): UserSnapshot {
    return { ...this.snapshot };
  }

  isActivePractitioner(): boolean {
    return this.snapshot.status === "active" && practitionerRoles.has(this.snapshot.role);
  }
}

function requireEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DomainError("email_invalid", "Email address is invalid");
  }
  return email;
}

function requireDisplayName(value: string): string {
  const name = assertNonEmpty(value, "display_name_required", "Display name is required");
  if (name.length < 2 || name.length > 80) {
    throw new DomainError("display_name_invalid", "Display name must be between 2 and 80 characters");
  }
  return name;
}
