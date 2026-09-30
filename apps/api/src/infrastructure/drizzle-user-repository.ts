import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "@yaren/database";
import { schema } from "@yaren/database";
import { User, type UserRepository, type UserSnapshot, type StaffRole, type UserStatus } from "@yaren/identity";

const table = schema.users;

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async save(user: User): Promise<void> {
    const snapshot = user.toSnapshot();
    await this.db
      .insert(table)
      .values(toRow(snapshot))
      .onConflictDoUpdate({ target: table.id, set: toRow(snapshot) });
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db.select().from(table).where(eq(table.email, email)).limit(1);
    return row ? User.reconstitute(toSnapshot(row)) : null;
  }

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(table).where(eq(table.id, id)).limit(1);
    return row ? User.reconstitute(toSnapshot(row)) : null;
  }

  async list(): Promise<User[]> {
    const rows = await this.db.select().from(table).orderBy(desc(table.createdAt));
    return rows.map((row) => User.reconstitute(toSnapshot(row)));
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ value: sql<number>`count(*)::int` }).from(table);
    return row?.value ?? 0;
  }
}

function toRow(snapshot: UserSnapshot) {
  return {
    id: snapshot.id,
    email: snapshot.email,
    passwordHash: snapshot.passwordHash,
    displayName: snapshot.displayName,
    role: snapshot.role,
    centerId: snapshot.centerId,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
  };
}

function toSnapshot(row: typeof table.$inferSelect): UserSnapshot {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    role: row.role as StaffRole,
    centerId: row.centerId,
    status: row.status as UserStatus,
    createdAt: row.createdAt,
  };
}
