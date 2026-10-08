import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { ApplicationError } from "@yaren/shared-kernel";
import { createDatabase, migrate } from "@yaren/database";
import { readEnv, type Env } from "./env.js";
import { registerAuth, seedSuperAdmin } from "./modules/auth.js";
import { registerUsers } from "./modules/users.js";
import { registerHotels } from "./modules/hotels.js";
import { registerClinics } from "./modules/clinics.js";
import { registerPatients } from "./modules/patients.js";
import { registerTriage } from "./modules/triage.js";
import { registerTourism } from "./modules/tourism.js";
import { registerDashboard } from "./modules/dashboard.js";
import { registerRoles } from "./modules/roles.js";
import { startActivityLog } from "./modules/activity.js";
import { ensureUploadDirs, maxVisitDocumentBytes, uploadsRoot } from "./uploads.js";

export async function buildServer() {
  const env = readEnv();
  const { pool } = createDatabase(env.DATABASE_URL);
  await migrate(pool);
  await seedSuperAdmin(pool, env);
  await ensureUploadDirs();

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(multipart, { limits: { fileSize: maxVisitDocumentBytes, files: 1 } });
  await app.register(fastifyStatic, { root: uploadsRoot(), prefix: "/uploads/", decorateReply: false });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApplicationError) {
      return reply.status(error.status).send({ error: error.code, message: error.message });
    }
    const uploadError = error as { code?: string; statusCode?: number };
    if (uploadError.code === "FST_REQ_FILE_TOO_LARGE" || uploadError.statusCode === 413) {
      return reply.status(413).send({ error: "document_too_large", message: "File must be 10 MB or smaller" });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "internal_error", message: "Unexpected server error" });
  });

  app.get("/api/health", async () => ({ ok: true }));
  registerAuth(app, pool);
  registerUsers(app, pool);
  registerHotels(app, pool);
  registerClinics(app, pool);
  registerPatients(app, pool);
  registerTriage(app, pool);
  registerTourism(app);
  registerDashboard(app, pool);
  registerRoles(app, pool);
  startActivityLog(app, pool);

  return { app, env, pool };
}

export type ServerEnv = Env;
