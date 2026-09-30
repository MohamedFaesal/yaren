import type { Appointment } from "./appointment.js";

export type TimeRange = {
  start: Date;
  end: Date;
};

export interface AppointmentRepository {
  save(appointment: Appointment): Promise<void>;
  findById(id: string): Promise<Appointment | null>;
  list(): Promise<Appointment[]>;
  count(): Promise<number>;
  hasPractitionerOverlap(practitionerId: string, range: TimeRange, ignoreId?: string): Promise<boolean>;
}
