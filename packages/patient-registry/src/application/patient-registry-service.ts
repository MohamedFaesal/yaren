import { ApplicationError, type Clock, type DomainEventPublisher } from "@yaren/shared-kernel";
import { Patient, type PatientSnapshot, type Sex } from "../domain/patient.js";
import type { PatientRepository } from "../domain/patient-repository.js";

export type PatientView = {
  id: string;
  medicalRecordNumber: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  sex: Sex;
  phone: string;
  nationalId: string | null;
};

export type RegisterPatientCommand = {
  id: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  sex: Sex;
  phone: string;
  nationalId: string | null;
};

export class PatientRegistryService {
  constructor(
    private readonly patients: PatientRepository,
    private readonly clock: Clock,
    private readonly publisher: DomainEventPublisher,
  ) {}

  async register(command: RegisterPatientCommand): Promise<PatientView> {
    const patient = Patient.register({
      ...command,
      medicalRecordNumber: await this.patients.nextMedicalRecordNumber(),
      registeredAt: this.clock.now(),
    });
    await this.patients.save(patient);
    await this.publisher.publish(patient.pullDomainEvents());
    return toView(patient.toSnapshot());
  }

  async list(): Promise<PatientView[]> {
    const patients = await this.patients.list();
    return patients.map((patient) => toView(patient.toSnapshot()));
  }

  async getById(id: string): Promise<PatientView> {
    const patient = await this.patients.findById(id);
    if (!patient) {
      throw new ApplicationError(404, "patient_not_found", "Patient was not found");
    }
    return toView(patient.toSnapshot());
  }

  async assertExists(id: string): Promise<void> {
    await this.getById(id);
  }

  async count(): Promise<number> {
    return this.patients.count();
  }
}

function toView(snapshot: PatientSnapshot): PatientView {
  return {
    id: snapshot.id,
    medicalRecordNumber: snapshot.medicalRecordNumber,
    givenName: snapshot.givenName,
    familyName: snapshot.familyName,
    dateOfBirth: snapshot.dateOfBirth,
    sex: snapshot.sex,
    phone: snapshot.phone,
    nationalId: snapshot.nationalId,
  };
}
