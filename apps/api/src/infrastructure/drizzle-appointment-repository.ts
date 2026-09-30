import { and, asc, eq, gt, lt, ne, notInArray, sql } from "drizzle-orm";
import type { Database } from "@yaren/database";
import { schema } from "@yaren/database";
import {
  Appointment,
  type AppointmentRepository,
  type AppointmentSnapshot,
  type AppointmentStatus,
  type TimeRange,
} from "@yaren/scheduling";

const table = schema.appointments;
const blocking = ["cancelled", "no_show"] as const;

export class DrizzleAppointmentRepository implements AppointmentRepository {
  constructor(private readonly db: Database) {}

  async save(appointment: Appointment): Promise<void> {
    const snapshot = appointment.toSnapshot();
    await this.db
      .insert(table)
      .values(toRow(snapshot))
      .onConflictDoUpdate({ target: table.id, set: toRow(snapshot) });
  }

  async findById(id: string): Promise<Appointment | null> {
    const [row] = await this.db.select().from(table).where(eq(table.id, id)).limit(1);
    return row ? Appointment.reconstitute(toSnapshot(row)) : null;
  }

  async list(): Promise<Appointment[]> {
    const rows = await this.db.select().from(table).orderBy(asc(table.scheduledStart));
    return rows.map((row) => Appointment.reconstitute(toSnapshot(row)));
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ value: sql<number>`count(*)::int` }).from(table);
    return row?.value ?? 0;
  }

  async hasPractitionerOverlap(practitionerId: string, range: TimeRange, ignoreId?: string): Promise<boolean> {
    const filters = [
      eq(table.practitionerId, practitionerId),
      notInArray(table.status, [...blocking]),
      lt(table.scheduledStart, range.end),
      gt(table.scheduledEnd, range.start),
    ];
    if (ignoreId) filters.push(ne(table.id, ignoreId));
    const [row] = await this.db.select({ id: table.id }).from(table).where(and(...filters)).limit(1);
    return Boolean(row);
  }
}

function toRow(snapshot: AppointmentSnapshot) {
  return snapshot;
}

function toSnapshot(row: typeof table.$inferSelect): AppointmentSnapshot {
  return {
    id: row.id,
    patientId: row.patientId,
    practitionerId: row.practitionerId,
    centerId: row.centerId,
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    durationMinutes: row.durationMinutes,
    reason: row.reason,
    status: row.status as AppointmentStatus,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
