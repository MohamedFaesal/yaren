import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "@yaren/database";
import { schema } from "@yaren/database";
import {
  MedicalCenter,
  type CenterStatus,
  type MedicalCenterRepository,
  type MedicalCenterSnapshot,
} from "@yaren/organization";

const table = schema.medicalCenters;

export class DrizzleMedicalCenterRepository implements MedicalCenterRepository {
  constructor(private readonly db: Database) {}

  async save(center: MedicalCenter): Promise<void> {
    const snapshot = center.toSnapshot();
    await this.db
      .insert(table)
      .values(toRow(snapshot))
      .onConflictDoUpdate({ target: table.id, set: toRow(snapshot) });
  }

  async findById(id: string): Promise<MedicalCenter | null> {
    const [row] = await this.db.select().from(table).where(eq(table.id, id)).limit(1);
    return row ? MedicalCenter.reconstitute(toSnapshot(row)) : null;
  }

  async findByCode(code: string): Promise<MedicalCenter | null> {
    const [row] = await this.db.select().from(table).where(eq(table.code, code)).limit(1);
    return row ? MedicalCenter.reconstitute(toSnapshot(row)) : null;
  }

  async list(): Promise<MedicalCenter[]> {
    const rows = await this.db.select().from(table).orderBy(asc(table.name));
    return rows.map((row) => MedicalCenter.reconstitute(toSnapshot(row)));
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ value: sql<number>`count(*)::int` }).from(table);
    return row?.value ?? 0;
  }
}

function toRow(snapshot: MedicalCenterSnapshot) {
  return snapshot;
}

function toSnapshot(row: typeof table.$inferSelect): MedicalCenterSnapshot {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    addressLine: row.addressLine,
    city: row.city,
    phone: row.phone,
    status: row.status as CenterStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
