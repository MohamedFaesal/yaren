import { AggregateRoot, DomainError, assertNonEmpty, type DomainEvent } from "@yaren/shared-kernel";

export const sexes = ["female", "male", "other", "unknown"] as const;
export type Sex = (typeof sexes)[number];

export type PatientSnapshot = {
  id: string;
  medicalRecordNumber: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  sex: Sex;
  phone: string;
  nationalId: string | null;
  createdAt: Date;
};

export type RegisterPatientInput = {
  id: string;
  medicalRecordNumber: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  sex: Sex;
  phone: string;
  nationalId: string | null;
  registeredAt: Date;
};

export class Patient extends AggregateRoot {
  private constructor(private readonly snapshot: PatientSnapshot) {
    super(snapshot.id);
  }

  static register(input: RegisterPatientInput): Patient {
    const dateOfBirth = requireDateOfBirth(input.dateOfBirth, input.registeredAt);
    const patient = new Patient({
      id: input.id,
      medicalRecordNumber: requireMrn(input.medicalRecordNumber),
      givenName: requireName(input.givenName, "given_name"),
      familyName: requireName(input.familyName, "family_name"),
      dateOfBirth,
      sex: input.sex,
      phone: requirePhone(input.phone),
      nationalId: optionalNationalId(input.nationalId),
      createdAt: input.registeredAt,
    });
    patient.record({
      name: "patient_registry.patient_registered",
      aggregateId: patient.id,
      occurredAt: input.registeredAt,
      payload: { medicalRecordNumber: patient.toSnapshot().medicalRecordNumber },
    } satisfies DomainEvent);
    return patient;
  }

  static reconstitute(snapshot: PatientSnapshot): Patient {
    return new Patient(snapshot);
  }

  toSnapshot(): PatientSnapshot {
    return { ...this.snapshot };
  }
}

function requireName(value: string, field: string): string {
  const name = assertNonEmpty(value, `${field}_required`, "Patient name is required");
  if (name.length > 80) {
    throw new DomainError(`${field}_invalid`, "Patient name is too long");
  }
  return name;
}

function requireMrn(value: string): string {
  const mrn = value.trim().toUpperCase();
  if (!/^YRN-\d{6,}$/.test(mrn)) {
    throw new DomainError("mrn_invalid", "Medical record number is invalid");
  }
  return mrn;
}

function requireDateOfBirth(value: string, registeredAt: Date): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DomainError("date_of_birth_invalid", "Date of birth must be YYYY-MM-DD");
  }
  const dob = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime())) {
    throw new DomainError("date_of_birth_invalid", "Date of birth is not a real date");
  }
  const today = registeredAt.toISOString().slice(0, 10);
  if (value > today) {
    throw new DomainError("date_of_birth_in_future", "Date of birth cannot be in the future");
  }
  if (value < "1900-01-01") {
    throw new DomainError("date_of_birth_invalid", "Date of birth is too far in the past");
  }
  return value;
}

function requirePhone(value: string): string {
  const phone = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+?[0-9]{8,15}$/.test(phone)) {
    throw new DomainError("phone_invalid", "Phone must contain 8 to 15 digits");
  }
  return phone;
}

function optionalNationalId(value: string | null): string | null {
  if (!value || !value.trim()) return null;
  const nationalId = value.trim();
  if (nationalId.length < 4 || nationalId.length > 32) {
    throw new DomainError("national_id_invalid", "National ID length is invalid");
  }
  return nationalId;
}
