import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import { changed, noteActivity } from "./activity.js";

const minutes = z.number().int().min(1).max(720);
const settingsSchema = z.object({
  clinic_id: z.union([z.string().uuid(), z.null()]).optional(),
  triage_wait_minutes: minutes,
  doctor_wait_minutes: minutes,
});

const defaults = { triage_wait_minutes: 20, doctor_wait_minutes: 20 };

export function registerSettings(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/settings", { preHandler: authenticate }, async () => {
    return readSettings(pool);
  });

  app.patch("/api/settings", { preHandler: authenticate }, async (request) => {
    assertManager(request.user.type);
    const body = parse(settingsSchema, request.body);
    const clinicId = body.clinic_id ?? null;
    if (clinicId) {
      const clinic = await clinicName(pool, clinicId);
      const previous = await clinicOverride(pool, clinicId);
      await pool.query(
        `INSERT INTO clinic_wait_settings (clinic_id, triage_wait_minutes, doctor_wait_minutes, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (clinic_id) DO UPDATE
         SET triage_wait_minutes = EXCLUDED.triage_wait_minutes,
             doctor_wait_minutes = EXCLUDED.doctor_wait_minutes,
             updated_at = now(),
             updated_by = EXCLUDED.updated_by`,
        [clinicId, body.triage_wait_minutes, body.doctor_wait_minutes, request.user.sub],
      );
      noteActivity(request, {
        summary: `Updated waiting times for ${clinic.name}`,
        changes: [
          changed("Average waiting time to triage", previous ? `${previous.triage_wait_minutes} min` : "All clinics", `${body.triage_wait_minutes} min`),
          changed("Average waiting time to see a doctor", previous ? `${previous.doctor_wait_minutes} min` : "All clinics", `${body.doctor_wait_minutes} min`),
        ].filter((item) => item !== null),
      });
    } else {
      const previous = await readAll(pool);
      await pool.query(
        `UPDATE app_settings
         SET triage_wait_minutes = $1,
             doctor_wait_minutes = $2,
             updated_at = now(),
             updated_by = $3
         WHERE id = true`,
        [body.triage_wait_minutes, body.doctor_wait_minutes, request.user.sub],
      );
      noteActivity(request, {
        summary: "Updated waiting times for all clinics",
        changes: [
          changed("Average waiting time to triage", `${previous.triage_wait_minutes} min`, `${body.triage_wait_minutes} min`),
          changed("Average waiting time to see a doctor", `${previous.doctor_wait_minutes} min`, `${body.doctor_wait_minutes} min`),
        ].filter((item) => item !== null),
      });
    }
    return readSettings(pool);
  });

  app.delete("/api/settings/clinics/:clinicId", { preHandler: authenticate }, async (request, reply) => {
    assertManager(request.user.type);
    const { clinicId } = request.params as { clinicId: string };
    if (!z.string().uuid().safeParse(clinicId).success) throw new ApplicationError(404, "not_found", "Clinic was not found");
    const clinic = await clinicName(pool, clinicId);
    const removed = await pool.query("DELETE FROM clinic_wait_settings WHERE clinic_id = $1", [clinicId]);
    if ((removed.rowCount ?? 0) > 0) {
      noteActivity(request, { summary: `${clinic.name} now uses the waiting times for all clinics` });
    }
    return reply.status(204).send();
  });
}

function assertManager(type: string) {
  if (type !== "super-admin" && type !== "admin") {
    throw new ApplicationError(403, "forbidden", "You do not have permission to do that");
  }
}

async function clinicName(pool: pg.Pool, clinicId: string) {
  const result = await pool.query<{ name: string }>(
    "SELECT name FROM clinics WHERE id = $1 AND deleted_at IS NULL",
    [clinicId],
  );
  const clinic = result.rows[0];
  if (!clinic) throw new ApplicationError(404, "not_found", "Clinic was not found");
  return clinic;
}

async function clinicOverride(pool: pg.Pool, clinicId: string) {
  const result = await pool.query<{ triage_wait_minutes: number; doctor_wait_minutes: number }>(
    "SELECT triage_wait_minutes, doctor_wait_minutes FROM clinic_wait_settings WHERE clinic_id = $1",
    [clinicId],
  );
  return result.rows[0] ?? null;
}

async function readAll(pool: pg.Pool) {
  const result = await pool.query<{ triage_wait_minutes: number; doctor_wait_minutes: number }>(
    "SELECT triage_wait_minutes, doctor_wait_minutes FROM app_settings WHERE id = true",
  );
  return result.rows[0] ?? defaults;
}

async function readSettings(pool: pg.Pool) {
  const all = await readAll(pool);
  const clinics = await pool.query<{ clinic_id: string; triage_wait_minutes: number; doctor_wait_minutes: number }>(
    `SELECT clinic_id, triage_wait_minutes, doctor_wait_minutes
     FROM clinic_wait_settings
     ORDER BY clinic_id`,
  );
  return { ...all, clinics: clinics.rows };
}
