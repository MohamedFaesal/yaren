import type { MedicalCenter } from "./medical-center.js";

export interface MedicalCenterRepository {
  save(center: MedicalCenter): Promise<void>;
  findById(id: string): Promise<MedicalCenter | null>;
  findByCode(code: string): Promise<MedicalCenter | null>;
  list(): Promise<MedicalCenter[]>;
  count(): Promise<number>;
}
