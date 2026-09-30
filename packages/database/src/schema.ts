import { date, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

const identity = pgSchema("identity");
const organization = pgSchema("organization");
const patientRegistry = pgSchema("patient_registry");
const scheduling = pgSchema("scheduling");

export const users = identity.table("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  centerId: uuid("center_id"),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const medicalCenters = organization.table("medical_centers", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  phone: text("phone").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const patients = patientRegistry.table("patients", {
  id: uuid("id").primaryKey(),
  medicalRecordNumber: text("medical_record_number").notNull().unique(),
  givenName: text("given_name").notNull(),
  familyName: text("family_name").notNull(),
  dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
  sex: text("sex").notNull(),
  phone: text("phone").notNull(),
  nationalId: text("national_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const appointments = scheduling.table("appointments", {
  id: uuid("id").primaryKey(),
  patientId: uuid("patient_id").notNull(),
  practitionerId: uuid("practitioner_id").notNull(),
  centerId: uuid("center_id").notNull(),
  scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
  scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull(),
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
