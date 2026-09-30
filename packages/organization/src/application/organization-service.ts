import { ApplicationError, type Clock, type DomainEventPublisher } from "@yaren/shared-kernel";
import { MedicalCenter, type CenterStatus, type MedicalCenterSnapshot } from "../domain/medical-center.js";
import type { MedicalCenterRepository } from "../domain/medical-center-repository.js";

export type CenterView = {
  id: string;
  name: string;
  code: string;
  addressLine: string;
  city: string;
  phone: string;
  status: CenterStatus;
};

export type RegisterCenterCommand = {
  id: string;
  name: string;
  code: string;
  addressLine: string;
  city: string;
  phone: string;
};

export class OrganizationService {
  constructor(
    private readonly centers: MedicalCenterRepository,
    private readonly clock: Clock,
    private readonly publisher: DomainEventPublisher,
  ) {}

  async register(command: RegisterCenterCommand): Promise<CenterView> {
    const code = command.code.trim().toUpperCase();
    const existing = await this.centers.findByCode(code);
    if (existing) {
      throw new ApplicationError(409, "center_code_taken", "A center with this code already exists");
    }
    const center = MedicalCenter.open({ ...command, code, openedAt: this.clock.now() });
    await this.centers.save(center);
    await this.publisher.publish(center.pullDomainEvents());
    return toView(center.toSnapshot());
  }

  async list(): Promise<CenterView[]> {
    const centers = await this.centers.list();
    return centers.map((center) => toView(center.toSnapshot()));
  }

  async suspend(id: string): Promise<CenterView> {
    return this.change(id, (center) => center.suspend(this.clock.now()));
  }

  async activate(id: string): Promise<CenterView> {
    return this.change(id, (center) => center.activate(this.clock.now()));
  }

  async assertActive(id: string): Promise<void> {
    const center = await this.centers.findById(id);
    if (!center) {
      throw new ApplicationError(404, "center_not_found", "Medical center was not found");
    }
    if (center.toSnapshot().status !== "active") {
      throw new ApplicationError(409, "center_not_active", "Medical center is not accepting appointments");
    }
  }

  async count(): Promise<number> {
    return this.centers.count();
  }

  private async change(id: string, apply: (center: MedicalCenter) => void): Promise<CenterView> {
    const center = await this.centers.findById(id);
    if (!center) {
      throw new ApplicationError(404, "center_not_found", "Medical center was not found");
    }
    apply(center);
    await this.centers.save(center);
    await this.publisher.publish(center.pullDomainEvents());
    return toView(center.toSnapshot());
  }
}

function toView(snapshot: MedicalCenterSnapshot): CenterView {
  return {
    id: snapshot.id,
    name: snapshot.name,
    code: snapshot.code,
    addressLine: snapshot.addressLine,
    city: snapshot.city,
    phone: snapshot.phone,
    status: snapshot.status,
  };
}
