import type { Patient } from "./patient.js";

export interface PatientRepository {
  save(patient: Patient): Promise<void>;
  findById(id: string): Promise<Patient | null>;
  list(): Promise<Patient[]>;
  count(): Promise<number>;
  nextMedicalRecordNumber(): Promise<string>;
}
