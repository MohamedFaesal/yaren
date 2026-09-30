import { randomUUID } from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { z } from "zod";
import { ApplicationError, DomainError, systemClock, type DomainEventPublisher } from "@yaren/shared-kernel";
import { IdentityService } from "@yaren/identity";
import { OrganizationService } from "@yaren/organization";
import { PatientRegistryService, sexes } from "@yaren/patient-registry";
import { SchedulingService } from "@yaren/scheduling";
import { createDatabase, migrate } from "@yaren/database";
import { readEnv } from "./env.js";
import { ScryptPasswordHasher } from "./infrastructure/scrypt-password-hasher.js";
import { DrizzleUserRepository } from "./infrastructure/drizzle-user-repository.js";
import { DrizzleMedicalCenterRepository } from "./infrastructure/drizzle-medical-center-repository.js";
import { DrizzlePatientRepository } from "./infrastructure/drizzle-patient-repository.js";
import { DrizzleAppointmentRepository } from "./infrastructure/drizzle-appointment-repository.js";
import { seedDevStaff } from "./composition/seed.js";
import { registerYarenOne } from "./yaren-one/routes.js";
import { verifyTotp } from "./yaren-one/totp.js";

const publisher: DomainEventPublisher = {
  async publish(events) {
    for (const event of events) {
      console.info(JSON.stringify({ domainEvent: event.name, aggregateId: event.aggregateId }));
    }
  },
};

export async function buildServer() {
  const env = readEnv();
  const { db, pool } = createDatabase(env.DATABASE_URL);
  await migrate(pool);

  const users = new DrizzleUserRepository(db);
  const centers = new DrizzleMedicalCenterRepository(db);
  const patients = new DrizzlePatientRepository(db);
  const appointments = new DrizzleAppointmentRepository(db);
  const passwords = new ScryptPasswordHasher();

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: env.JWT_SECRET });

  const identity = new IdentityService(users, passwords, {
    async issue(user) {
      return app.jwt.sign({ sub: user.id, role: user.role, centerId: user.centerId }, { expiresIn: "12h" });
    },
  }, systemClock);
  const organization = new OrganizationService(centers, systemClock, publisher);
  const registry = new PatientRegistryService(patients, systemClock, publisher);
  const scheduling = new SchedulingService(appointments, {
    assertPatientExists: (id) => registry.assertExists(id),
    assertCenterActive: (id) => organization.assertActive(id),
    assertPractitionerAvailable: (id) => identity.assertActivePractitioner(id),
  }, systemClock, publisher);

  await seedDevStaff(identity, env.SEED_ADMIN_PASSWORD);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      return reply.status(422).send({ error: error.code, message: error.message });
    }
    if (error instanceof ApplicationError) {
      return reply.status(error.status).send({ error: error.code, message: error.message });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "internal_error", message: "Unexpected server error" });
  });

  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "unauthorized", message: "Sign in is required" });
    }
  };

  app.get("/api/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok", service: "yaren-api" };
  });

  app.post("/api/auth/login", async (request) => {
    const body = parse(loginSchema, request.body);
    const result = await identity.login(body.email, body.password);
    const setting = await pool.query("SELECT value FROM identity.settings WHERE key = 'mfa_required'");
    if (setting.rows[0]?.value === "true") {
      const secret = await pool.query("SELECT mfa_secret FROM identity.users WHERE lower(email) = lower($1)", [body.email]);
      const enrolled = secret.rows[0]?.mfa_secret ? String(secret.rows[0].mfa_secret) : "";
      if (!enrolled) throw new ApplicationError(401, "mfa_enrollment_required", "Enroll an authenticator before signing in");
      if (!body.code || !verifyTotp(enrolled, body.code)) throw new ApplicationError(401, "mfa_required", "Enter the current authenticator code");
    }
    return result;
  });

  app.get("/api/dashboard", { preHandler: requireAuth }, async () => ({
    centers: await organization.count(),
    patients: await registry.count(),
    staff: await identity.count(),
    appointments: await scheduling.count(),
  }));

  app.get("/api/centers", { preHandler: requireAuth }, async () => organization.list());
  app.post("/api/centers", { preHandler: requireAuth }, async (request) => {
    const body = parse(centerSchema, request.body);
    return organization.register({ id: randomUUID(), ...body });
  });
  app.post("/api/centers/:id/suspend", { preHandler: requireAuth }, async (request) => {
    const { id } = parse(idSchema, request.params);
    return organization.suspend(id);
  });
  app.post("/api/centers/:id/activate", { preHandler: requireAuth }, async (request) => {
    const { id } = parse(idSchema, request.params);
    return organization.activate(id);
  });

  app.get("/api/staff", { preHandler: requireAuth }, async () => identity.listStaff());

  app.get("/api/patients", { preHandler: requireAuth }, async () => registry.list());
  app.get("/api/patients/:id", { preHandler: requireAuth }, async (request) => {
    const { id } = parse(idSchema, request.params);
    return registry.getById(id);
  });
  app.post("/api/patients", { preHandler: requireAuth }, async (request) => {
    const body = parse(patientSchema, request.body);
    return registry.register({ id: randomUUID(), ...body, nationalId: body.nationalId ?? null });
  });

  app.get("/api/appointments", { preHandler: requireAuth }, async () => scheduling.list());
  app.post("/api/appointments", { preHandler: requireAuth }, async (request) => {
    const body = parse(appointmentSchema, request.body);
    return scheduling.schedule({
      id: randomUUID(),
      ...body,
      scheduledStart: new Date(body.scheduledStart),
    });
  });
  app.post("/api/appointments/:id/check-in", { preHandler: requireAuth }, async (request) => {
    const { id } = parse(idSchema, request.params);
    return scheduling.checkIn(id);
  });
  app.post("/api/appointments/:id/complete", { preHandler: requireAuth }, async (request) => {
    const { id } = parse(idSchema, request.params);
    return scheduling.complete(id);
  });
  app.post("/api/appointments/:id/no-show", { preHandler: requireAuth }, async (request) => {
    const { id } = parse(idSchema, request.params);
    return scheduling.markNoShow(id);
  });
  app.post("/api/appointments/:id/cancel", { preHandler: requireAuth }, async (request) => {
    const { id } = parse(idSchema, request.params);
    const body = parse(cancelSchema, request.body);
    return scheduling.cancel(id, body.reason);
  });

  await registerYarenOne(app, pool, identity, requireAuth);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  return { app, env };
}

const loginSchema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
  code: z.string().optional(),
});

const idSchema = z.object({ id: z.uuid() });

const centerSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  addressLine: z.string().min(1),
  city: z.string().min(1),
  phone: z.string().min(8),
});

const patientSchema = z.object({
  givenName: z.string().min(1),
  familyName: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sex: z.enum(sexes),
  phone: z.string().min(8),
  nationalId: z.string().optional(),
});

const appointmentSchema = z.object({
  patientId: z.uuid(),
  practitionerId: z.uuid(),
  centerId: z.uuid(),
  scheduledStart: z.string().datetime(),
  durationMinutes: z.number().int().min(5).max(240),
  reason: z.string().min(1),
});

const cancelSchema = z.object({
  reason: z.string().min(1),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApplicationError(400, "invalid_request", result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}
