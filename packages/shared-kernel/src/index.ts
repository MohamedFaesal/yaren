export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export class ApplicationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApplicationError";
    this.status = status;
    this.code = code;
  }
}

export type DomainEvent = {
  name: string;
  aggregateId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

export interface DomainEventPublisher {
  publish(events: DomainEvent[]): Promise<void>;
}

export const noopPublisher: DomainEventPublisher = {
  async publish() {},
};

export abstract class AggregateRoot {
  readonly id: string;
  #events: DomainEvent[] = [];

  protected constructor(id: string) {
    this.id = id;
  }

  protected record(event: DomainEvent): void {
    this.#events.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.#events];
    this.#events = [];
    return events;
  }
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function assertNonEmpty(value: string, code: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new DomainError(code, message);
  }
  return trimmed;
}
