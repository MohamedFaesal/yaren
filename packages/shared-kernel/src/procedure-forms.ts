export type ProcedureFieldKind = "staff" | "select" | "text" | "textarea" | "number" | "associated-services";

export type ProcedureField = {
  id: string;
  label: string;
  kind: ProcedureFieldKind;
  required: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  /** This number is the procedure quantity, so the unit price is charged for each unit. */
  setsQuantity?: boolean;
  options?: readonly string[];
  /** Another staff field that must be a different person. */
  distinctFrom?: string;
  summary?: boolean;
  /** Show this field, and apply its required rule, only when an associated service matches. */
  whenAssociated?: ProcedureServiceMatch;
  /** This number is the quantity charged for each matching associated service. */
  setsAssociatedQuantity?: ProcedureServiceMatch;
};

export type ProcedureServiceMatch = {
  code?: string;
  name?: RegExp;
};

export type ProcedureFormSection = {
  id: string;
  title: string;
  fields: readonly ProcedureField[];
};

export type ProcedureFormDefinition = {
  id: string;
  quantity: "hidden" | "shown";
  allowDuplicate: boolean;
  selectionCard?: boolean;
  intro?: string;
  sections: readonly ProcedureFormSection[];
};

export type ProcedureStaffValue = { id: string; name: string };
export type ProcedureServiceValue = { service_id: string; name: string; code: string; price: number | null };
export type ProcedureServiceCharge = ProcedureServiceValue & { quantity: number };
export type ProcedureDetailValue = string | number | ProcedureStaffValue | ProcedureServiceValue[];
export type ProcedureDetails = Record<string, ProcedureDetailValue>;

const procedureDetails = {
  id: "procedure",
  title: "Procedure Details",
  fields: [
    { id: "performed_by", label: "Performed by", kind: "staff", required: true, summary: true },
    { id: "assistant", label: "Assistant", kind: "staff", required: false, distinctFrom: "performed_by" },
  ],
} as const satisfies ProcedureFormSection;

const associatedServices = {
  id: "associated",
  title: "Associated Services",
  fields: [
    { id: "associated_services", label: "Associated services", kind: "associated-services", required: false },
  ],
} as const satisfies ProcedureFormSection;

const clinicalNotes = [
  { id: "steps", label: "Steps", kind: "textarea", required: true, maxLength: 500 },
  { id: "findings", label: "Findings / Outcome", kind: "textarea", required: true, maxLength: 500 },
  { id: "complications", label: "Complications", kind: "textarea", required: false, maxLength: 500 },
  { id: "notes", label: "Note", kind: "textarea", required: false, maxLength: 500 },
] as const satisfies readonly ProcedureField[];

const catheterNotes = [
  { id: "steps", label: "Steps", kind: "textarea", required: true, maxLength: 500 },
  { id: "outcome", label: "Outcome", kind: "textarea", required: true, maxLength: 500 },
  { id: "complications", label: "Complications", kind: "textarea", required: false, maxLength: 500 },
  { id: "notes", label: "Note", kind: "textarea", required: false, maxLength: 500 },
] as const satisfies readonly ProcedureField[];

const frenchSizes = Array.from({ length: 28 }, (_, index) => String(index + 3));

const monitoringService = { code: "YRN-MP-006", name: /monitor/i } as const satisfies ProcedureServiceMatch;

export const procedureForms: readonly ProcedureFormDefinition[] = [
  {
    id: "clinical-intervention",
    quantity: "hidden",
    allowDuplicate: true,
    sections: [
      procedureDetails,
      {
        id: "clinical",
        title: "Clinical Details",
        fields: [
          { id: "anatomical_site", label: "Anatomical site", kind: "text", required: true, summary: true, maxLength: 200 },
          ...clinicalNotes,
        ],
      },
      associatedServices,
    ],
  },
  {
    id: "ent-procedure",
    quantity: "hidden",
    allowDuplicate: true,
    sections: [
      procedureDetails,
      {
        id: "clinical",
        title: "Clinical Details",
        fields: [
          ...clinicalNotes,
        ],
      },
      associatedServices,
    ],
  },
  {
    id: "oxygen-supply",
    quantity: "hidden",
    allowDuplicate: true,
    selectionCard: true,
    intro: "Choose the procedure, add relevant parameters and associated services. It will be added to the encounter and can be added to the invoice later.",
    sections: [
      {
        id: "procedure",
        title: "Procedure Details",
        fields: [],
      },
      {
        id: "parameters",
        title: "Procedure Parameters",
        fields: [
          { id: "delivery_method", label: "Delivery method", kind: "select", required: true, summary: true, options: ["Nasal cannula", "Face mask", "Non-rebreather mask", "Venturi mask"] },
          { id: "flow_rate", label: "Flow rate (L/min)", kind: "number", required: true, summary: true, min: 1, max: 60, step: 1 },
          { id: "oxygen_hours", label: "Duration of oxygen supply (hours)", kind: "number", required: true, summary: true, min: 0.5, max: 24, step: 0.5 },
          { id: "monitoring_hours", label: "Duration of monitoring (hours)", kind: "number", required: true, summary: true, min: 0.5, max: 24, step: 0.5, whenAssociated: monitoringService, setsAssociatedQuantity: monitoringService },
        ],
      },
      associatedServices,
    ],
  },
  {
    id: "urinary-catheter",
    quantity: "hidden",
    allowDuplicate: true,
    sections: [
      procedureDetails,
      {
        id: "clinical",
        title: "Clinical Details",
        fields: [
          { id: "catheter_type", label: "Catheter type", kind: "select", required: true, summary: true, options: ["Foley catheter", "Nelaton catheter", "Coude catheter"] },
          { id: "catheter_material", label: "Catheter material", kind: "select", required: true, options: ["Latex", "Silicone", "Coated catheter"] },
          { id: "route", label: "Route", kind: "select", required: true, summary: true, options: ["Urethral", "Suprapubic"] },
          { id: "size_fr", label: "Size (Fr)", kind: "select", required: true, summary: true, options: frenchSizes },
          { id: "sample_collection", label: "Sample collection", kind: "select", required: false, options: ["Routine urine analysis", "Urine culture"] },
          ...catheterNotes,
        ],
      },
      associatedServices,
    ],
  },
  {
    id: "surgical-procedure",
    quantity: "hidden",
    allowDuplicate: true,
    sections: [
      {
        id: "procedure",
        title: "Procedure Details",
        fields: [
          { id: "quantity", label: "Quantity", kind: "number", required: true, summary: true, min: 1, max: 999, step: 1, setsQuantity: true },
          { id: "performed_by", label: "Performed by", kind: "staff", required: true, summary: true },
          { id: "assistant", label: "Assistant", kind: "staff", required: false, distinctFrom: "performed_by" },
        ],
      },
      {
        id: "clinical",
        title: "Clinical Details",
        fields: [
          { id: "anatomical_site", label: "Anatomical site", kind: "text", required: true, summary: true, maxLength: 200 },
          ...clinicalNotes,
        ],
      },
      associatedServices,
    ],
  },
];

export function procedureFormById(id: string | null | undefined) {
  if (!id) return null;
  return procedureForms.find((form) => form.id === id) ?? null;
}

export function quantityForProcedureForm(form: ProcedureFormDefinition, details: ProcedureDetails | Record<string, unknown>, fallback: number) {
  const source = procedureFields(form).find((field) => field.setsQuantity);
  const value = source ? details[source.id] : undefined;
  if (typeof value === "number" && value > 0) return value;
  return form.quantity === "hidden" ? 1 : fallback;
}

export function procedureFields(form: ProcedureFormDefinition) {
  return form.sections.flatMap((section) => section.fields);
}

export function readText(details: ProcedureDetails | Record<string, unknown>, id: string) {
  const value = details[id];
  return typeof value === "string" ? value : "";
}

export function readStaff(details: ProcedureDetails | Record<string, unknown>, id: string): ProcedureStaffValue | null {
  const value = details[id];
  if (!value || typeof value !== "object" || Array.isArray(value) || !("id" in value) || typeof value.id !== "string" || !value.id) return null;
  const name = "name" in value && typeof value.name === "string" ? value.name : "";
  return { id: value.id, name };
}

export function readServices(details: ProcedureDetails | Record<string, unknown>, id: string): ProcedureServiceValue[] {
  const value = details[id];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const service = readService(item);
    return service ? [service] : [];
  });
}

export function procedureFieldActive(field: ProcedureField, raw: unknown) {
  if (!field.whenAssociated) return true;
  return listedServices(raw).some((service) => serviceMatches(service, field.whenAssociated!));
}

/** Hours entered for a matching service, or 1 when this service is charged once. */
export function quantityForAssociatedService(raw: unknown, service: { code: string; name: string }) {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  for (const form of procedureForms) {
    for (const field of procedureFields(form)) {
      if (!field.setsAssociatedQuantity || !serviceMatches(service, field.setsAssociatedQuantity)) continue;
      if (!procedureFieldActive(field, source)) continue;
      const amount = source[field.id];
      if (typeof amount === "number" && amount > 0) return amount;
    }
  }
  return 1;
}

export function procedureServiceCharges(details: ProcedureDetails | null | undefined): ProcedureServiceCharge[] {
  return listedServices(details).map((service) => ({
    ...service,
    quantity: quantityForAssociatedService(details, service),
  }));
}

function readService(item: unknown): ProcedureServiceValue | null {
  if (!item || typeof item !== "object" || !("service_id" in item) || typeof item.service_id !== "string" || !item.service_id) return null;
  const name = "name" in item && typeof item.name === "string" ? item.name : "";
  const code = "code" in item && typeof item.code === "string" ? item.code : "";
  const price = "price" in item && (item.price === null || typeof item.price === "number") ? item.price : null;
  return { service_id: item.service_id, name, code, price };
}

function listedServices(raw: unknown): ProcedureServiceValue[] {
  if (!raw || typeof raw !== "object") return [];
  const services: ProcedureServiceValue[] = [];
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const service = readService(item);
      if (service) services.push(service);
    }
  }
  return services;
}

function serviceMatches(service: { code: string; name: string }, match: ProcedureServiceMatch) {
  return Boolean((match.code && service.code === match.code) || (match.name && match.name.test(service.name)));
}

/** Keep only the answers this form defines, and report the first problem on each field. */
export function procedureDetailErrors(form: ProcedureFormDefinition, raw: unknown): { errors: Record<string, string>; details: ProcedureDetails } {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const details: ProcedureDetails = {};
  const errors: Record<string, string> = {};
  const fields = procedureFields(form);

  for (const field of fields) {
    if (!procedureFieldActive(field, source)) continue;
    const value = source[field.id];
    if (field.kind === "staff") {
      const id = value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : "";
      const name = value && typeof value === "object" && "name" in value && typeof value.name === "string" ? value.name : "";
      if (!id) {
        if (field.required) errors[field.id] = `Choose ${field.label.toLowerCase()}.`;
      } else {
        details[field.id] = { id, name };
      }
    } else if (field.kind === "select") {
      const text = typeof value === "string" ? value.trim() : "";
      if (!text) {
        if (field.required) errors[field.id] = `Choose ${field.label.toLowerCase()}.`;
      } else if (field.options && !field.options.includes(text)) {
        errors[field.id] = `Choose ${field.label.toLowerCase()}.`;
      } else {
        details[field.id] = text;
      }
    } else if (field.kind === "number") {
      const amount = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
      if (!Number.isFinite(amount)) {
        if (field.required) errors[field.id] = `Enter ${field.label.toLowerCase()}.`;
      } else if (field.min != null && field.max != null && (amount < field.min || amount > field.max)) {
        errors[field.id] = `${field.label} must be between ${field.min} and ${field.max}.`;
      } else if (field.step != null && Math.abs(amount / field.step - Math.round(amount / field.step)) > 1e-6) {
        errors[field.id] = Number.isInteger(field.step)
          ? `${field.label} must be a whole number.`
          : `${field.label} must use steps of ${field.step}.`;
      } else {
        details[field.id] = Math.round(amount * 100) / 100;
      }
    } else if (field.kind === "text" || field.kind === "textarea") {
      const text = typeof value === "string" ? value.trim() : "";
      if (field.maxLength && text.length > field.maxLength) {
        errors[field.id] = `${field.label} must be ${field.maxLength} characters or fewer.`;
      } else if (!text && field.required) {
        errors[field.id] = `Enter ${field.label.toLowerCase()}.`;
      } else if (text) {
        details[field.id] = text;
      }
    } else {
      const items = Array.isArray(value) ? value : [];
      const services: ProcedureServiceValue[] = [];
      const seen = new Set<string>();
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const serviceId = "service_id" in item && typeof item.service_id === "string" ? item.service_id : "";
        if (!serviceId || seen.has(serviceId)) continue;
        seen.add(serviceId);
        const name = "name" in item && typeof item.name === "string" ? item.name : "";
        const code = "code" in item && typeof item.code === "string" ? item.code : "";
        const price = "price" in item && (item.price === null || typeof item.price === "number") ? item.price : null;
        services.push({ service_id: serviceId, name, code, price });
        if (services.length >= 12) break;
      }
      if (field.required && services.length === 0) errors[field.id] = `Add ${field.label.toLowerCase()}.`;
      if (services.length > 0) details[field.id] = services;
    }
  }

  for (const field of fields) {
    if (!field.distinctFrom || errors[field.id]) continue;
    const left = readStaff(details, field.id);
    const right = readStaff(details, field.distinctFrom);
    if (left && right && left.id === right.id) {
      const other = fields.find((item) => item.id === field.distinctFrom);
      errors[field.id] = `${field.label} cannot be the same person as ${other?.label ?? "the other field"}.`;
    }
  }

  return { errors, details };
}
