import { AggregateRoot, DomainError, assertNonEmpty } from "@yaren/shared-kernel";

export const appointmentStatuses = [
  "scheduled",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type AppointmentStatus = (typeof appointmentStatuses)[number];

export type AppointmentSnapshot = {
  id: string;
  patientId: string;
  practitionerId: string;
  centerId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  durationMinutes: number;
  reason: string;
  status: AppointmentStatus;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ScheduleAppointmentInput = {
  id: string;
  patientId: string;
  practitionerId: string;
  centerId: string;
  scheduledStart: Date;
  durationMinutes: number;
  reason: string;
  scheduledAt: Date;
};

export class Appointment extends AggregateRoot {
  private constructor(private snapshot: AppointmentSnapshot) {
    super(snapshot.id);
  }

  static schedule(input: ScheduleAppointmentInput): Appointment {
    if (input.scheduledStart.getTime() <= input.scheduledAt.getTime()) {
      throw new DomainError("appointment_in_past", "Appointment must start in the future");
    }
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 240) {
      throw new DomainError("duration_invalid", "Duration must be between 5 and 240 minutes");
    }
    const scheduledEnd = new Date(input.scheduledStart.getTime() + input.durationMinutes * 60_000);
    const appointment = new Appointment({
      id: input.id,
      patientId: assertNonEmpty(input.patientId, "patient_required", "Patient is required"),
      practitionerId: assertNonEmpty(input.practitionerId, "practitioner_required", "Practitioner is required"),
      centerId: assertNonEmpty(input.centerId, "center_required", "Center is required"),
      scheduledStart: input.scheduledStart,
      scheduledEnd,
      durationMinutes: input.durationMinutes,
      reason: requireReason(input.reason),
      status: "scheduled",
      cancellationReason: null,
      createdAt: input.scheduledAt,
      updatedAt: input.scheduledAt,
    });
    appointment.record({
      name: "scheduling.appointment_scheduled",
      aggregateId: appointment.id,
      occurredAt: input.scheduledAt,
      payload: { patientId: input.patientId, centerId: input.centerId },
    });
    return appointment;
  }

  static reconstitute(snapshot: AppointmentSnapshot): Appointment {
    return new Appointment(snapshot);
  }

  toSnapshot(): AppointmentSnapshot {
    return { ...this.snapshot };
  }

  checkIn(at: Date): void {
    this.moveTo("checked_in", ["scheduled"], at);
  }

  complete(at: Date): void {
    this.moveTo("completed", ["checked_in"], at);
  }

  markNoShow(at: Date): void {
    this.moveTo("no_show", ["scheduled"], at);
  }

  cancel(reason: string, at: Date): void {
    const cancellationReason = assertNonEmpty(reason, "cancellation_reason_required", "Cancellation reason is required");
    this.moveTo("cancelled", ["scheduled", "checked_in"], at);
    this.snapshot = { ...this.snapshot, cancellationReason };
  }

  private moveTo(status: AppointmentStatus, allowed: AppointmentStatus[], at: Date): void {
    if (!allowed.includes(this.snapshot.status)) {
      throw new DomainError(
        "invalid_status_transition",
        `Cannot move an appointment from ${this.snapshot.status} to ${status}`,
      );
    }
    this.snapshot = { ...this.snapshot, status, updatedAt: at };
    this.record({
      name: `scheduling.appointment_${status}`,
      aggregateId: this.id,
      occurredAt: at,
      payload: { status },
    });
  }
}

function requireReason(value: string): string {
  const reason = assertNonEmpty(value, "reason_required", "Visit reason is required");
  if (reason.length > 240) {
    throw new DomainError("reason_invalid", "Visit reason is too long");
  }
  return reason;
}
