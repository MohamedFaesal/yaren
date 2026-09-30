import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DomainError } from "@yaren/shared-kernel";
import { Patient } from "./patient.js";

const registeredAt = new Date("2026-09-25T08:00:00.000Z");

describe("Patient", () => {
  it("registers a patient and records a domain event", () => {
    const patient = Patient.register({
      id: "patient-1",
      medicalRecordNumber: "YRN-000001",
      givenName: "Nour",
      familyName: "Adel",
      dateOfBirth: "1994-03-12",
      sex: "female",
      phone: "01012345678",
      nationalId: null,
      registeredAt,
    });
    const events = patient.pullDomainEvents();
    assert.equal(patient.toSnapshot().phone, "01012345678");
    assert.equal(events[0]?.name, "patient_registry.patient_registered");
  });

  it("rejects a future date of birth", () => {
    assert.throws(
      () =>
        Patient.register({
          id: "patient-1",
          medicalRecordNumber: "YRN-000001",
          givenName: "Nour",
          familyName: "Adel",
          dateOfBirth: "2027-01-01",
          sex: "female",
          phone: "01012345678",
          nationalId: null,
          registeredAt,
        }),
      (error: unknown) => error instanceof DomainError && error.code === "date_of_birth_in_future",
    );
  });
});
