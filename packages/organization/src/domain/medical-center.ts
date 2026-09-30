import { AggregateRoot, DomainError, assertNonEmpty, type DomainEvent } from "@yaren/shared-kernel";

export type CenterStatus = "active" | "suspended";

export type MedicalCenterSnapshot = {
  id: string;
  name: string;
  code: string;
  addressLine: string;
  city: string;
  phone: string;
  status: CenterStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type OpenCenterInput = {
  id: string;
  name: string;
  code: string;
  addressLine: string;
  city: string;
  phone: string;
  openedAt: Date;
};

const CODE_PATTERN = /^[A-Z0-9]{2,10}$/;

export class MedicalCenter extends AggregateRoot {
  private constructor(private snapshot: MedicalCenterSnapshot) {
    super(snapshot.id);
  }

  static open(input: OpenCenterInput): MedicalCenter {
    const center = new MedicalCenter({
      id: input.id,
      name: requireName(input.name),
      code: requireCode(input.code),
      addressLine: assertNonEmpty(input.addressLine, "address_required", "Address is required"),
      city: assertNonEmpty(input.city, "city_required", "City is required"),
      phone: requirePhone(input.phone),
      status: "active",
      createdAt: input.openedAt,
      updatedAt: input.openedAt,
    });
    center.record(event("organization.center_opened", center, input.openedAt));
    return center;
  }

  static reconstitute(snapshot: MedicalCenterSnapshot): MedicalCenter {
    return new MedicalCenter(snapshot);
  }

  toSnapshot(): MedicalCenterSnapshot {
    return { ...this.snapshot };
  }

  suspend(at: Date): void {
    this.transition("suspended", "center_already_suspended", "Center is already suspended", at);
    this.record(event("organization.center_suspended", this, at));
  }

  activate(at: Date): void {
    this.transition("active", "center_already_active", "Center is already active", at);
    this.record(event("organization.center_activated", this, at));
  }

  private transition(status: CenterStatus, code: string, message: string, at: Date): void {
    if (this.snapshot.status === status) {
      throw new DomainError(code, message);
    }
    this.snapshot = { ...this.snapshot, status, updatedAt: at };
  }
}

function requireName(value: string): string {
  const name = assertNonEmpty(value, "center_name_required", "Center name is required");
  if (name.length < 2 || name.length > 120) {
    throw new DomainError("center_name_invalid", "Center name must be between 2 and 120 characters");
  }
  return name;
}

function requireCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    throw new DomainError(
      "center_code_invalid",
      "Center code must be 2 to 10 letters or digits",
    );
  }
  return code;
}

function requirePhone(value: string): string {
  const phone = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+?[0-9]{8,15}$/.test(phone)) {
    throw new DomainError("phone_invalid", "Phone must contain 8 to 15 digits");
  }
  return phone;
}

function event(name: string, center: MedicalCenter, occurredAt: Date): DomainEvent {
  const snapshot = center.toSnapshot();
  return {
    name,
    aggregateId: snapshot.id,
    occurredAt,
    payload: { code: snapshot.code, status: snapshot.status },
  };
}
