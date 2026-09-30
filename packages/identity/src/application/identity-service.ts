import { ApplicationError, type Clock } from "@yaren/shared-kernel";
import { User, type StaffRole, type UserSnapshot } from "../domain/user.js";
import type { UserRepository } from "../domain/user-repository.js";
import type { PasswordHasher, TokenIssuer } from "./ports.js";

export type StaffView = {
  id: string;
  email: string;
  displayName: string;
  role: StaffRole;
  centerId: string | null;
  status: "active" | "disabled";
};

export type LoginResult = {
  token: string;
  user: StaffView;
};

export type RegisterStaffCommand = {
  id: string;
  email: string;
  password: string;
  displayName: string;
  role: StaffRole;
  centerId: string | null;
};

export class IdentityService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenIssuer,
    private readonly clock: Clock,
  ) {}

  async register(command: RegisterStaffCommand): Promise<StaffView> {
    const email = command.email.trim().toLowerCase();
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ApplicationError(409, "email_taken", "A staff member with this email already exists");
    }
    if (command.password.length < 8) {
      throw new ApplicationError(422, "password_too_short", "Password must be at least 8 characters");
    }
    const user = User.register({
      id: command.id,
      email,
      passwordHash: await this.passwords.hash(command.password),
      displayName: command.displayName,
      role: command.role,
      centerId: command.centerId,
      createdAt: this.clock.now(),
    });
    await this.users.save(user);
    return toView(user.toSnapshot());
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    const snapshot = user?.toSnapshot();
    const valid =
      snapshot?.status === "active" &&
      (await this.passwords.verify(password, snapshot.passwordHash));
    if (!user || !snapshot || !valid) {
      throw new ApplicationError(401, "invalid_credentials", "Email or password is incorrect");
    }
    const token = await this.tokens.issue({
      id: snapshot.id,
      role: snapshot.role,
      centerId: snapshot.centerId,
    });
    return { token, user: toView(snapshot) };
  }

  async listStaff(): Promise<StaffView[]> {
    const users = await this.users.list();
    return users.map((user) => toView(user.toSnapshot()));
  }

  async assertActivePractitioner(id: string): Promise<void> {
    const user = await this.users.findById(id);
    if (!user || !user.isActivePractitioner()) {
      throw new ApplicationError(
        409,
        "practitioner_unavailable",
        "Practitioner must be an active physician or nurse",
      );
    }
  }

  async count(): Promise<number> {
    return this.users.count();
  }
}

function toView(snapshot: UserSnapshot): StaffView {
  return {
    id: snapshot.id,
    email: snapshot.email,
    displayName: snapshot.displayName,
    role: snapshot.role,
    centerId: snapshot.centerId,
    status: snapshot.status,
  };
}
