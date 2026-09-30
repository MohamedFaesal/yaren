import { ApplicationError, type Clock, type DomainEventPublisher } from "@yaren/shared-kernel";
import {
  Appointment,
  type AppointmentSnapshot,
  type AppointmentStatus,
} from "../domain/appointment.js";
import type { AppointmentRepository } from "../domain/appointment-repository.js";

export interface SchedulingDependencies {
  assertPatientExists(patientId: string): Promise<void>;
  assertCenterActive(centerId: string): Promise<void>;
  assertPractitionerAvailable(practitionerId: string): Promise<void>;
}

export type AppointmentView = {
  id: string;
  patientId: string;
  practitionerId: string;
  centerId: string;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes: number;
  reason: string;
  status: AppointmentStatus;
  cancellationReason: string | null;
};

export type ScheduleAppointmentCommand = {
  id: string;
  patientId: string;
  practitionerId: string;
  centerId: string;
  scheduledStart: Date;
  durationMinutes: number;
  reason: string;
};

export class SchedulingService {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly dependencies: SchedulingDependencies,
    private readonly clock: Clock,
    private readonly publisher: DomainEventPublisher,
  ) {}

  async schedule(command: ScheduleAppointmentCommand): Promise<AppointmentView> {
    await this.dependencies.assertPatientExists(command.patientId);
    await this.dependencies.assertCenterActive(command.centerId);
    await this.dependencies.assertPractitionerAvailable(command.practitionerId);

    const draft = Appointment.schedule({ ...command, scheduledAt: this.clock.now() });
    const snapshot = draft.toSnapshot();
    const overlap = await this.appointments.hasPractitionerOverlap(command.practitionerId, {
      start: snapshot.scheduledStart,
      end: snapshot.scheduledEnd,
    });
    if (overlap) {
      throw new ApplicationError(
        409,
        "practitioner_overlap",
        "Practitioner already has an appointment in that time range",
      );
    }
    await this.appointments.save(draft);
    await this.publisher.publish(draft.pullDomainEvents());
    return toView(snapshot);
  }

  async list(): Promise<AppointmentView[]> {
    const appointments = await this.appointments.list();
    return appointments.map((appointment) => toView(appointment.toSnapshot()));
  }

  async checkIn(id: string): Promise<AppointmentView> {
    return this.change(id, (appointment) => appointment.checkIn(this.clock.now()));
  }

  async complete(id: string): Promise<AppointmentView> {
    return this.change(id, (appointment) => appointment.complete(this.clock.now()));
  }

  async markNoShow(id: string): Promise<AppointmentView> {
    return this.change(id, (appointment) => appointment.markNoShow(this.clock.now()));
  }

  async cancel(id: string, reason: string): Promise<AppointmentView> {
    return this.change(id, (appointment) => appointment.cancel(reason, this.clock.now()));
  }

  async count(): Promise<number> {
    return this.appointments.count();
  }

  private async change(id: string, apply: (appointment: Appointment) => void): Promise<AppointmentView> {
    const appointment = await this.appointments.findById(id);
    if (!appointment) {
      throw new ApplicationError(404, "appointment_not_found", "Appointment was not found");
    }
    apply(appointment);
    await this.appointments.save(appointment);
    await this.publisher.publish(appointment.pullDomainEvents());
    return toView(appointment.toSnapshot());
  }
}

function toView(snapshot: AppointmentSnapshot): AppointmentView {
  return {
    id: snapshot.id,
    patientId: snapshot.patientId,
    practitionerId: snapshot.practitionerId,
    centerId: snapshot.centerId,
    scheduledStart: snapshot.scheduledStart.toISOString(),
    scheduledEnd: snapshot.scheduledEnd.toISOString(),
    durationMinutes: snapshot.durationMinutes,
    reason: snapshot.reason,
    status: snapshot.status,
    cancellationReason: snapshot.cancellationReason,
  };
}
