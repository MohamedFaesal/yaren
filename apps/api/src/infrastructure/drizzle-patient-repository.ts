import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "@yaren/database";
import { schema } from "@yaren/database";
import { Patient, type PatientRepository, type PatientSnapshot, type Sex } from "@yaren/patient-registry";

const table = schema.patients;

export class DrizzlePatientRepository implements PatientRepository {
  constructor(private readonly db: Database) {}

  async save(patient: Patient): Promise<void> {
    const snapshot = patient.toSnapshot();
    await this.db
      .insert(table)
      .values(toRow(snapshot))
      .onConflictDoUpdate({ target: table.id, set: toRow(snapshot) });
  }

  async findById(id: string): Promise<Patient | null> {
    const [row] = await this.db.select().from(table).where(eq(table.id, id)).limit(1);
    return row ? Patient.reconstitute(toSnapshot(row)) : null;
  }

  async list(): Promise<Patient[]> {
    const rows = await this.db.select().from(table).orderBy(desc(table.createdAt));
    return rows.map((row) => Patient.reconstitute(toSnapshot(row)));
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ value: sql<number>`count(*)::int` }).from(table);
    return row?.value ?? 0;
  }

  async nextMedicalRecordNumber(): Promise<string> {
    const result = await this.db.execute<{ nextval: string }>(sql`SELECT nextval('patient_registry.mrn_seq')::text AS nextval`);
    const next = result.rows[0]?.nextval ?? "1";
    return `YRN-${next.padStart(6, "0")}`;
  }
}

function toRow(snapshot: PatientSnapshot) {
  return snapshot;
}

function toSnapshot(row: typeof table.$inferSelect): PatientSnapshot {
  return {
    id: row.id,
    medicalRecordNumber: row.medicalRecordNumber,
    givenName: row.givenName,
    familyName: row.familyName,
    dateOfBirth: row.dateOfBirth,
    sex: row.sex as Sex,
    phone: row.phone,
    nationalId: row.nationalId,
    createdAt: row.createdAt,
  };
}
