export { Appointment, appointmentStatuses } from "./domain/appointment.js";
export type { AppointmentSnapshot, AppointmentStatus } from "./domain/appointment.js";
export type { AppointmentRepository, TimeRange } from "./domain/appointment-repository.js";
export { SchedulingService } from "./application/scheduling-service.js";
export type {
  AppointmentView,
  ScheduleAppointmentCommand,
  SchedulingDependencies,
} from "./application/scheduling-service.js";
