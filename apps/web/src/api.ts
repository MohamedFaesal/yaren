export type Staff = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  centerId: string | null;
  status: string;
};

export type Center = {
  id: string;
  name: string;
  code: string;
  addressLine: string;
  city: string;
  phone: string;
  status: "active" | "suspended";
};

export type Patient = {
  id: string;
  medicalRecordNumber: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  sex: string;
  phone: string;
  nationalId: string | null;
};

export type Appointment = {
  id: string;
  patientId: string;
  practitionerId: string;
  centerId: string;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes: number;
  reason: string;
  status: string;
  cancellationReason: string | null;
};

export type Session = {
  token: string;
  user: Staff;
};

const SESSION_KEY = "yaren.session";

export function loadSession(): Session | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Session;
}

export function saveSession(session: Session | null) {
  if (!session) sessionStorage.removeItem(SESSION_KEY);
  else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new ApiError(payload.message ?? "Request failed", response.status);
  return payload as T;
}
