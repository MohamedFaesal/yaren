import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DomainError } from "@yaren/shared-kernel";
import { Appointment } from "./appointment.js";

const scheduledAt = new Date("2026-09-25T08:00:00.000Z");

function schedule() {
  return Appointment.schedule({
    id: "appt-1",
    patientId: "patient-1",
    practitionerId: "user-1",
    centerId: "center-1",
    scheduledStart: new Date("2026-09-26T09:00:00.000Z"),
    durationMinutes: 30,
    reason: "Follow-up",
    scheduledAt,
  });
}

describe("Appointment", () => {
  it("schedules a visit and computes the end time", () => {
    const snapshot = schedule().toSnapshot();
    assert.equal(snapshot.status, "scheduled");
    assert.equal(snapshot.scheduledEnd.toISOString(), "2026-09-26T09:30:00.000Z");
  });

  it("follows the visit lifecycle", () => {
    const appointment = schedule();
    appointment.checkIn(scheduledAt);
    appointment.complete(scheduledAt);
    assert.equal(appointment.toSnapshot().status, "completed");
    assert.throws(
      () => appointment.cancel("patient request", scheduledAt),
      (error: unknown) => error instanceof DomainError && error.code === "invalid_status_transition",
    );
  });

  it("rejects a start time in the past", () => {
    assert.throws(
      () =>
        Appointment.schedule({
          id: "appt-1",
          patientId: "patient-1",
          practitionerId: "user-1",
          centerId: "center-1",
          scheduledStart: new Date("2026-09-24T09:00:00.000Z"),
          durationMinutes: 30,
          reason: "Follow-up",
          scheduledAt,
        }),
      (error: unknown) => error instanceof DomainError && error.code === "appointment_in_past",
    );
  });
});
