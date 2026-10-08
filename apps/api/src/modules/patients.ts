import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { ApplicationError } from "@yaren/shared-kernel";
import { authenticate, parse } from "../http.js";
import {
  assertCan,
  assertPatientCan,
  assertVisitClinic,
  can,
  canList,
  loadAccess,
  patientViewWhere,
  visitViewWhere,
  type Access,
} from "../permissions.js";
import { changed, noteActivity } from "./activity.js";
import { nationalities } from "./nationalities.js";
import { fileUrl, removeUpload, saveVisitDocument } from "../uploads.js";

const genders = ["male", "female"] as const;
const visitStatuses = ["waiting_for_triage", "to_doctor"] as const;
const visitSorts = ["created_at", "updated_at"] as const;
const contactMethods = ["phone", "email", "whatsapp"] as const;
const relationships = ["spouse", "son", "daughter", "father", "mother", "cousin", "grandfather", "grandmother", "girlfriend", "boyfriend"] as const;
const visitDocumentTypes = [
  "patient_personal_information_form",
  "gdpr_form",
  "patient_satisfaction_form",
  "travel_voucher",
  "flight_ticket",
  "claim_form",
  "refusal_of_treatment_hospital_referral",
] as const;
const requiredVisitDocuments = ["patient_personal_information_form", "gdpr_form"] as const;

const patientSchema = z.object({
  name: z.string().trim().min(1),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a birth date"),
  nationality: z.enum(nationalities),
  gender: z.enum(genders),
  identity_number: z.string().trim().min(1),
  email: z.union([z.string().trim().email(), z.literal("")]).optional().transform((value) => (value ? value.toLowerCase() : null)),
  phone_number: z.string().trim().optional().transform((value) => (value ? value : null)),
  alternative_phone_number: z.string().trim().optional().transform((value) => (value ? value : null)),
  home_address: z.string().trim().optional().transform((value) => (value ? value : null)),
});

const visitBodySchema = z.object({
  preferred_contact_method: z.union([z.enum(contactMethods), z.literal("")]).optional().transform((value) => value || null),
  emergency_contact_name: z.string().trim().optional().transform((value) => (value ? value : null)),
  emergency_contact_phone: z.string().trim().optional().transform((value) => (value ? value : null)),
  emergency_contact_relationship: z.union([z.enum(relationships), z.literal("")]).optional().transform((value) => value || null),
  hotel_checkin_date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a check-in date"), z.literal("")]).optional().transform((value) => (value ? value : null)),
  hotel_checkout_date: z.string().trim().optional().transform((value) => (value ? value : null)),
  hotel_room_no: z.string().trim().min(1, "Enter the hotel room number"),
  clinic_id: z.string().uuid(),
}).superRefine((value, context) => {
  if (value.hotel_checkout_date && !/^\d{4}-\d{2}-\d{2}$/.test(value.hotel_checkout_date)) {
    context.addIssue({ code: "custom", message: "Choose a check-out date", path: ["hotel_checkout_date"] });
  }
  if (value.hotel_checkin_date && value.hotel_checkout_date && value.hotel_checkout_date < value.hotel_checkin_date) {
    context.addIssue({ code: "custom", message: "Check-out must be on or after check-in", path: ["hotel_checkout_date"] });
  }
});

const visitSchema = visitBodySchema.extend({
  passport_number: z.string().trim(),
});

const registerSchema = z.object({
  identity_number: z.string().trim().optional().transform((value) => (value ? value : null)),
  patient_id: z.string().uuid().optional(),
  patient: patientSchema.omit({ identity_number: true }).optional(),
  patient_contact: z.object({
    email: z.union([z.string().trim().email(), z.literal("")]).optional().transform((value) => (value ? value.toLowerCase() : null)),
    phone_number: z.string().trim().optional().transform((value) => (value ? value : null)),
  }).optional(),
  visit: visitSchema,
}).superRefine((value, context) => {
  if (!value.patient_id && !value.patient) {
    context.addIssue({ code: "custom", message: "Patient details are required for a new registration", path: ["patient"] });
  }
});

const patientColumns = `p.id, p.name, p.mrn, p.birthdate::text AS birthdate, p.nationality, p.gender,
  p.added_by, u.name AS added_by_name, p.identity_number, p.email, p.phone_number, p.alternative_phone_number, p.home_address,
  p.created_at, p.updated_at, p.deleted_at`;

const visitColumns = `v.id, v.patient_id, v.passport_number, v.preferred_contact_method,
  v.emergency_contact_name, v.emergency_contact_phone, v.emergency_contact_relationship,
  v.hotel_checkin_date::text AS hotel_checkin_date, v.hotel_checkout_date::text AS hotel_checkout_date,
  v.hotel_room_no, v.clinic_id, c.name AS clinic_name, h.name AS hotel_name,
  v.status, v.status_changed_at, v.assigned_doctor_id, d.name AS assigned_doctor_name,
  EXTRACT(YEAR FROM age((v.created_at AT TIME ZONE 'UTC')::date, p.birthdate))::int AS patient_age_at_visit,
  v.created_at, v.updated_at, v.deleted_at`;

export function registerPatients(app: FastifyInstance, pool: pg.Pool) {
  app.get("/api/nationalities", { preHandler: authenticate }, async () => nationalities);

  app.get("/api/patients/lookup", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    const canLookup = canList(access, "patient") || can(access, request.user.sub, { resource: "visit", action: "create" });
    if (!canLookup) throw new ApplicationError(403, "forbidden", "You cannot look up patients");
    const source = request.query as { q?: string; identity?: string };
    const q = (typeof source.q === "string" ? source.q : typeof source.identity === "string" ? source.identity : "").trim();
    if (q.length < 2) return { matches: [] };
    if (q.length > 200) throw new ApplicationError(422, "invalid_query", "Search is too long");
    return { matches: await searchPatientsForRegister(pool, access, request.user.sub, q) };
  });

  app.get("/api/patients/match", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    const canLookup = canList(access, "patient") || can(access, request.user.sub, { resource: "visit", action: "create" });
    if (!canLookup) throw new ApplicationError(403, "forbidden", "You cannot look up patients");
    const source = request.query as Record<string, unknown>;
    const text = (key: string) => (typeof source[key] === "string" ? source[key] : "");
    return {
      matches: await matchPatientsForRegister(pool, access, request.user.sub, {
        name: text("name"),
        gender: text("gender"),
        phone: text("phone"),
        nationality: text("nationality"),
        birthdate: text("birthdate"),
        passport: text("passport"),
      }),
    };
  });

  app.get("/api/visits", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    if (!canList(access, "visit")) throw new ApplicationError(403, "forbidden", "You cannot view visits");
    const query = readVisitListQuery(request.query);
    const scope = visitViewWhere(access, request.user.sub);
    const values: unknown[] = [...scope.params];
    const clauses = [`v.deleted_at IS NULL`, `p.deleted_at IS NULL`, scope.sql];
    if (query.clinicId) {
      values.push(query.clinicId);
      clauses.push(`v.clinic_id = $${values.length}`);
    }
    if (query.status) {
      values.push(query.status);
      clauses.push(`v.status = $${values.length}`);
    }
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      values.push(pattern, pattern, pattern, pattern, pattern, pattern);
      const start = values.length - 5;
      clauses.push(`(
        p.name ILIKE $${start} ESCAPE '\\'
        OR p.mrn ILIKE $${start + 1} ESCAPE '\\'
        OR v.passport_number ILIKE $${start + 2} ESCAPE '\\'
        OR c.name ILIKE $${start + 3} ESCAPE '\\'
        OR h.name ILIKE $${start + 4} ESCAPE '\\'
        OR v.hotel_room_no ILIKE $${start + 5} ESCAPE '\\'
      )`);
    }
    const where = `WHERE ${clauses.join(" AND ")}`;
    const from = `
      FROM patient_visits v
      JOIN clinics c ON c.id = v.clinic_id
      JOIN hotels h ON h.id = c.hotel_id
      JOIN patients p ON p.id = v.patient_id
      JOIN users u ON u.id = p.added_by
      LEFT JOIN users d ON d.id = v.assigned_doctor_id
      ${where}`;
    const counted = await pool.query<{ total: number }>(`SELECT count(*)::int AS total ${from}`, values);
    const total = counted.rows[0]?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, pages);
    const result = await pool.query(
      `SELECT ${visitColumns}, p.name AS patient_name, p.mrn AS patient_mrn, p.added_by AS patient_added_by
       ${from}
       ORDER BY v.${query.sort} ${query.dir}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.pageSize, (page - 1) * query.pageSize],
    );
    return { items: result.rows, total, page, page_size: query.pageSize };
  });

  app.post("/api/patients/register", { preHandler: authenticate }, async (request, reply) => {
    const body = parse(registerSchema, request.body);
    const identity = body.identity_number ?? (body.visit.passport_number.trim() || null);
    await assertClinicExists(pool, body.visit.clinic_id);
    const access = await loadAccess(pool, request.user);

    if (body.patient_id) {
      const patient = await findPatient(pool, body.patient_id);
      if (!patient) throw new ApplicationError(404, "not_found", "Patient was not found");
      await assertVisitClinic(access, request.user.sub, ["create"], body.visit.clinic_id, patient.added_by);
      if (body.patient_contact) {
        await pool.query(
          `UPDATE patients
           SET email = $2, phone_number = $3, updated_at = now()
           WHERE id = $1 AND deleted_at IS NULL`,
          [patient.id, body.patient_contact.email, body.patient_contact.phone_number],
        );
      }
      const { passport_number, ...visitBody } = body.visit;
      const visitId = await insertVisit(pool, patient.id, passport_number, visitBody, request.user.sub);
      const visit = await findVisit(pool, patient.id, visitId);
      const refreshed = await findPatient(pool, patient.id);
      const visits = canList(access, "visit") ? await listVisits(pool, patient.id, visitViewWhere(access, request.user.sub)) : [];
      return reply.status(201).send({ patient: { ...refreshed, visits }, visit });
    }

    await assertCan(pool, request, { resource: "patient", action: "create" });
    await assertVisitClinic(access, request.user.sub, ["create"], body.visit.clinic_id);
    if (!body.patient) throw new ApplicationError(422, "patient_required", "Patient details are required for a new registration");
    assertBirthdate(body.patient.birthdate);
    if (identity) {
      const existing = await findPatientByIdentity(pool, identity);
      if (existing) throw new ApplicationError(409, "identity_taken", "A patient with this passport or national ID already exists");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const mrn = await nextMrn(client);
      const created = await client.query(
        `INSERT INTO patients (name, mrn, birthdate, nationality, gender, added_by, identity_number, email, phone_number, alternative_phone_number, home_address)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          body.patient.name, mrn, body.patient.birthdate, body.patient.nationality, body.patient.gender, request.user.sub, identity,
          body.patient.email, body.patient.phone_number, body.patient.alternative_phone_number, body.patient.home_address,
        ],
      );
      const patientId = created.rows[0]?.id as string;
      const { passport_number, ...visitBody } = body.visit;
      const visitId = await insertVisit(client, patientId, passport_number, visitBody, request.user.sub);
      await client.query("COMMIT");
      const patient = await findPatient(pool, patientId);
      const visit = await findVisit(pool, patientId, visitId);
      const visits = canList(access, "visit") ? await listVisits(pool, patientId, visitViewWhere(access, request.user.sub)) : [];
      return reply.status(201).send({ patient: { ...patient, visits }, visit });
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUnique(error)) throw new ApplicationError(409, "identity_taken", "A patient with this passport or national ID already exists");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/patients", { preHandler: authenticate }, async (request) => {
    const access = await loadAccess(pool, request.user);
    if (!canList(access, "patient")) throw new ApplicationError(403, "forbidden", "You cannot view patients");
    const query = readPatientListQuery(request.query);
    const scope = patientViewWhere(access, request.user.sub);
    const values: unknown[] = [...scope.params];
    const clauses = [`p.deleted_at IS NULL`, scope.sql];
    if (query.clinicId) {
      values.push(query.clinicId);
      clauses.push(`EXISTS (
        SELECT 1 FROM patient_visits v
        WHERE v.patient_id = p.id AND v.deleted_at IS NULL AND v.clinic_id = $${values.length}
      )`);
    }
    if (query.gender) {
      values.push(query.gender);
      clauses.push(`p.gender = $${values.length}`);
    }
    if (query.nationality) {
      values.push(query.nationality);
      clauses.push(`p.nationality = $${values.length}`);
    }
    if (query.q) {
      const pattern = `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      values.push(pattern, pattern, pattern, pattern, pattern);
      const start = values.length - 4;
      clauses.push(`(
        p.name ILIKE $${start} ESCAPE '\\'
        OR p.mrn ILIKE $${start + 1} ESCAPE '\\'
        OR COALESCE(p.identity_number, '') ILIKE $${start + 2} ESCAPE '\\'
        OR COALESCE(p.email, '') ILIKE $${start + 3} ESCAPE '\\'
        OR COALESCE(p.phone_number, '') ILIKE $${start + 4} ESCAPE '\\'
      )`);
    }
    const where = `WHERE ${clauses.join(" AND ")}`;
    const from = `FROM patients p JOIN users u ON u.id = p.added_by ${where}`;
    const counted = await pool.query<{ total: number }>(`SELECT count(*)::int AS total ${from}`, values);
    const total = counted.rows[0]?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, pages);
    const result = await pool.query(
      `SELECT ${patientColumns},
              (
                SELECT count(*)::int FROM patient_visits v
                WHERE v.patient_id = p.id AND v.deleted_at IS NULL
              ) AS visit_count
       ${from}
       ORDER BY p.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.pageSize, (page - 1) * query.pageSize],
    );
    return { items: result.rows, total, page, page_size: query.pageSize };
  });

  app.get("/api/patients/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const patient = await findPatient(pool, id);
    if (!patient) throw new ApplicationError(404, "not_found", "Patient was not found");
    await assertPatientCan(pool, request, { action: "view", ownerId: patient.added_by, patientId: id });
    const access = await loadAccess(pool, request.user);
    const visits = canList(access, "visit") ? await listVisits(pool, id, visitViewWhere(access, request.user.sub)) : [];
    return { ...patient, visits };
  });

  app.post("/api/patients", { preHandler: authenticate }, async (request, reply) => {
    await assertCan(pool, request, { resource: "patient", action: "create" });
    const body = parse(patientSchema, request.body);
    assertBirthdate(body.birthdate);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const mrn = await nextMrn(client);
      const result = await client.query(
        `INSERT INTO patients (name, mrn, birthdate, nationality, gender, added_by, identity_number, email, phone_number, alternative_phone_number, home_address)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, name, mrn, birthdate::text AS birthdate, nationality, gender, added_by, identity_number, email, phone_number, alternative_phone_number, home_address, created_at, updated_at, deleted_at`,
        [body.name, mrn, body.birthdate, body.nationality, body.gender, request.user.sub, body.identity_number, body.email, body.phone_number, body.alternative_phone_number, body.home_address],
      );
      await client.query("COMMIT");
      const row = result.rows[0] as { added_by: string };
      return reply.status(201).send({ ...row, added_by_name: await actorName(pool, request.user.sub), visit_count: 0, visits: [] });
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUnique(error)) throw new ApplicationError(409, "identity_taken", "A patient with this passport or national ID already exists");
      throw error;
    } finally {
      client.release();
    }
  });

  app.patch("/api/patients/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const body = parse(patientSchema, request.body);
    assertBirthdate(body.birthdate);
    const current = await pool.query<{
      added_by: string;
      name: string;
      birthdate: string;
      nationality: string;
      gender: string;
      identity_number: string | null;
      email: string | null;
      phone_number: string | null;
      alternative_phone_number: string | null;
      home_address: string | null;
    }>(
      `SELECT added_by, name, birthdate::text AS birthdate, nationality, gender, identity_number, email, phone_number, alternative_phone_number, home_address
       FROM patients WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    const previous = current.rows[0];
    if (!previous) throw new ApplicationError(404, "not_found", "Patient was not found");
    await assertPatientCan(pool, request, { action: "update", ownerId: previous.added_by, patientId: id });
    try {
      const result = await pool.query(
        `UPDATE patients
         SET name = $2, birthdate = $3::date, nationality = $4, gender = $5, identity_number = $6,
             email = $7, phone_number = $8, alternative_phone_number = $9, home_address = $10, updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id, name, mrn, birthdate::text AS birthdate, nationality, gender, added_by, identity_number, email, phone_number, alternative_phone_number, home_address, created_at, updated_at, deleted_at`,
        [id, body.name, body.birthdate, body.nationality, body.gender, body.identity_number, body.email, body.phone_number, body.alternative_phone_number, body.home_address],
      );
      noteActivity(request, {
        changes: [
          changed("Name", previous.name, body.name),
          changed("Birth date", previous.birthdate, body.birthdate),
          changed("Nationality", previous.nationality, body.nationality),
          changed("Biological Gender", titleCase(previous.gender), titleCase(body.gender)),
          changed("Passport / National ID", previous.identity_number ?? "", body.identity_number),
          changed("Email", previous.email ?? "", body.email ?? ""),
          changed("Phone", previous.phone_number ?? "", body.phone_number ?? ""),
          changed("Alternative phone", previous.alternative_phone_number ?? "", body.alternative_phone_number ?? ""),
          changed("Home address", previous.home_address ?? "", body.home_address ?? ""),
        ].filter((item) => item !== null),
      });
      const row = result.rows[0] as { added_by: string };
      const access = await loadAccess(pool, request.user);
      const visits = canList(access, "visit") ? await listVisits(pool, id, visitViewWhere(access, request.user.sub)) : [];
      return { ...row, added_by_name: await actorName(pool, row.added_by), visits };
    } catch (error) {
      if (isUnique(error)) throw new ApplicationError(409, "identity_taken", "A patient with this passport or national ID already exists");
      throw error;
    }
  });

  app.delete("/api/patients/:id", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = await pool.query<{ added_by: string }>("SELECT added_by FROM patients WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (!current.rows[0]) throw new ApplicationError(404, "not_found", "Patient was not found");
    await assertPatientCan(pool, request, { action: "delete", ownerId: current.rows[0].added_by, patientId: id });
    const visits = await pool.query("SELECT id FROM patient_visits WHERE patient_id = $1 AND deleted_at IS NULL LIMIT 1", [id]);
    if ((visits.rowCount ?? 0) > 0) throw new ApplicationError(422, "patient_has_visits", "Remove every visit before deleting this patient");
    await pool.query("UPDATE patients SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
    return reply.status(204).send();
  });

  app.get("/api/patients/:id/visits", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const patient = await findPatient(pool, id);
    if (!patient) throw new ApplicationError(404, "not_found", "Patient was not found");
    const access = await loadAccess(pool, request.user);
    if (!canList(access, "visit")) throw new ApplicationError(403, "forbidden", "You cannot view visits");
    return listVisits(pool, id, visitViewWhere(access, request.user.sub));
  });

  app.get("/api/patients/:patientId/visits/:id", { preHandler: authenticate }, async (request) => {
    const { patientId, id } = request.params as { patientId: string; id: string };
    const visit = await findVisit(pool, patientId, id);
    if (!visit) throw new ApplicationError(404, "not_found", "Visit was not found");
    await assertCan(pool, request, {
      resource: "visit",
      action: "view",
      ownerId: visit.patient_added_by,
      clinicId: visit.clinic_id,
    });
    return visit;
  });

  app.post("/api/patients/:patientId/visits/:id/documents/:documentType", { preHandler: authenticate }, async (request) => {
    const { patientId, id, documentType } = request.params as { patientId: string; id: string; documentType: string };
    if (!visitDocumentTypes.includes(documentType as (typeof visitDocumentTypes)[number])) {
      throw new ApplicationError(422, "unknown_document_type", "Unknown document type");
    }
    const visit = await findVisit(pool, patientId, id);
    if (!visit) throw new ApplicationError(404, "not_found", "Visit was not found");
    const access = await loadAccess(pool, request.user);
    const canManage = can(access, request.user.sub, {
      resource: "visit",
      action: "update",
      ownerId: visit.patient_added_by,
      clinicId: visit.clinic_id,
    }) || can(access, request.user.sub, {
      resource: "visit",
      action: "create",
      clinicId: visit.clinic_id,
    });
    if (!canManage) throw new ApplicationError(403, "forbidden", "You do not have permission to do that");
    await assertVisitClinic(access, request.user.sub, ["create", "update"], visit.clinic_id, visit.patient_added_by);
    const file = await request.file();
    if (!file) throw new ApplicationError(422, "document_required", "Choose a file to upload");
    const previous = await pool.query<{ file_path: string }>(
      "SELECT file_path FROM patient_visit_documents WHERE visit_id = $1 AND document_type = $2",
      [id, documentType],
    );
    const saved = await saveVisitDocument(id, documentType, file, previous.rows[0]?.file_path);
    await pool.query(
      `INSERT INTO patient_visit_documents (visit_id, document_type, file_path, original_name, mime_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (visit_id, document_type) DO UPDATE
       SET file_path = EXCLUDED.file_path,
           original_name = EXCLUDED.original_name,
           mime_type = EXCLUDED.mime_type,
           updated_at = now()`,
      [id, documentType, saved.path, saved.originalName, saved.mimeType],
    );
    noteActivity(request, {
      summary: `Uploaded ${documentType.replaceAll("_", " ")} for a visit`,
      changes: [changed("Document", previous.rows[0] ? "Updated" : "Empty", saved.originalName)].filter((item) => item !== null),
    });
    return findVisit(pool, patientId, id);
  });

  app.delete("/api/patients/:patientId/visits/:id/documents/:documentType", { preHandler: authenticate }, async (request) => {
    const { patientId, id, documentType } = request.params as { patientId: string; id: string; documentType: string };
    if (!visitDocumentTypes.includes(documentType as (typeof visitDocumentTypes)[number])) {
      throw new ApplicationError(422, "unknown_document_type", "Unknown document type");
    }
    if (requiredVisitDocuments.includes(documentType as (typeof requiredVisitDocuments)[number])) {
      throw new ApplicationError(422, "document_required", "This document is required and cannot be removed");
    }
    const visit = await findVisit(pool, patientId, id);
    if (!visit) throw new ApplicationError(404, "not_found", "Visit was not found");
    await assertCan(pool, request, {
      resource: "visit",
      action: "update",
      ownerId: visit.patient_added_by,
      clinicId: visit.clinic_id,
    });
    const previous = await pool.query<{ file_path: string; original_name: string }>(
      "SELECT file_path, original_name FROM patient_visit_documents WHERE visit_id = $1 AND document_type = $2",
      [id, documentType],
    );
    if (!previous.rows[0]) throw new ApplicationError(404, "not_found", "Document was not found");
    await pool.query("DELETE FROM patient_visit_documents WHERE visit_id = $1 AND document_type = $2", [id, documentType]);
    await removeUpload(previous.rows[0].file_path);
    noteActivity(request, {
      summary: `Removed ${documentType.replaceAll("_", " ")} from a visit`,
      changes: [changed("Document", previous.rows[0].original_name, "Empty")].filter((item) => item !== null),
    });
    return findVisit(pool, patientId, id);
  });

  app.post("/api/patients/:id/visits", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const patient = await findPatient(pool, id);
    if (!patient) throw new ApplicationError(404, "not_found", "Patient was not found");
    const body = parse(visitSchema, request.body);
    await assertClinicExists(pool, body.clinic_id);
    const access = await loadAccess(pool, request.user);
    await assertVisitClinic(access, request.user.sub, ["create"], body.clinic_id, patient.added_by);
    const { passport_number, ...visitBody } = body;
    const createdId = await insertVisit(pool, id, passport_number, visitBody, request.user.sub);
    return reply.status(201).send(await findVisit(pool, id, createdId));
  });

  app.patch("/api/patients/:patientId/visits/:id", { preHandler: authenticate }, async (request) => {
    const { patientId, id } = request.params as { patientId: string; id: string };
    const body = parse(visitSchema, request.body);
    const previous = await findVisit(pool, patientId, id);
    if (!previous) throw new ApplicationError(404, "not_found", "Visit was not found");
    await assertClinicExists(pool, body.clinic_id);
    await assertCan(pool, request, {
      resource: "visit",
      action: "update",
      ownerId: previous.patient_added_by,
      clinicId: previous.clinic_id,
    });
    if (body.clinic_id !== previous.clinic_id) {
      await assertCan(pool, request, {
        resource: "visit",
        action: "update",
        ownerId: previous.patient_added_by,
        clinicId: body.clinic_id,
      });
    }
    await pool.query(
      `UPDATE patient_visits
       SET passport_number = $3, preferred_contact_method = $4, emergency_contact_name = $5, emergency_contact_phone = $6,
           emergency_contact_relationship = $7, hotel_checkin_date = $8::date, hotel_checkout_date = $9::date,
           hotel_room_no = $10, clinic_id = $11, updated_at = now()
       WHERE id = $1 AND patient_id = $2 AND deleted_at IS NULL`,
      [
        id, patientId, body.passport_number, body.preferred_contact_method, body.emergency_contact_name, body.emergency_contact_phone,
        body.emergency_contact_relationship, body.hotel_checkin_date, body.hotel_checkout_date, body.hotel_room_no, body.clinic_id,
      ],
    );
    const next = await findVisit(pool, patientId, id);
    if (!next) throw new ApplicationError(404, "not_found", "Visit was not found");
    noteActivity(request, {
      changes: [
        changed("Passport number", previous.passport_number, body.passport_number),
        changed("Preferred contact", previous.preferred_contact_method ? titleCase(previous.preferred_contact_method) : null, body.preferred_contact_method ? titleCase(body.preferred_contact_method) : null),
        changed("Emergency contact", previous.emergency_contact_name, body.emergency_contact_name),
        changed("Emergency phone", previous.emergency_contact_phone, body.emergency_contact_phone),
        changed("Emergency relationship", previous.emergency_contact_relationship ? titleCase(previous.emergency_contact_relationship) : null, body.emergency_contact_relationship ? titleCase(body.emergency_contact_relationship) : null),
        changed("Hotel check-in", previous.hotel_checkin_date, body.hotel_checkin_date),
        changed("Hotel check-out", previous.hotel_checkout_date, body.hotel_checkout_date),
        changed("Hotel room", previous.hotel_room_no, body.hotel_room_no),
        changed("Clinic", previous.clinic_name, next.clinic_name),
      ].filter((item) => item !== null),
    });
    return next;
  });

  app.delete("/api/patients/:patientId/visits/:id", { preHandler: authenticate }, async (request, reply) => {
    const { patientId, id } = request.params as { patientId: string; id: string };
    const visit = await findVisit(pool, patientId, id);
    if (!visit) throw new ApplicationError(404, "not_found", "Visit was not found");
    await assertCan(pool, request, {
      resource: "visit",
      action: "delete",
      ownerId: visit.patient_added_by,
      clinicId: visit.clinic_id,
    });
    await pool.query("UPDATE patient_visits SET deleted_at = now(), updated_at = now() WHERE id = $1 AND patient_id = $2 AND deleted_at IS NULL", [id, patientId]);
    return reply.status(204).send();
  });
}

type Db = Pick<pg.Pool, "query">;

async function findPatient(pool: Db, id: string) {
  const result = await pool.query(
    `SELECT ${patientColumns} FROM patients p JOIN users u ON u.id = p.added_by WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id],
  );
  return result.rows[0] as { id: string; added_by: string; name: string; identity_number: string | null } | undefined;
}

async function findPatientByIdentity(pool: Db, identity: string) {
  const result = await pool.query(
    `SELECT ${patientColumns} FROM patients p JOIN users u ON u.id = p.added_by
     WHERE p.deleted_at IS NULL AND lower(p.identity_number) = lower($1)`,
    [identity.trim()],
  );
  return result.rows[0] as { id: string; added_by: string; name: string; identity_number: string | null } | undefined;
}

function visitCreatePatientWhere(access: Access, _actorId: string) {
  if (access.bypass) return { sql: "TRUE", params: [] as unknown[] };
  const grants = access.grants.filter((grant) => grant.resource === "visit" && grant.action === "create");
  if (grants.length === 0) return { sql: "FALSE", params: [] as unknown[] };
  if (grants.some((grant) => grant.allClinics)) return { sql: "TRUE", params: [] as unknown[] };
  const clinicIds = [...new Set(grants.flatMap((grant) => grant.clinicIds))];
  if (clinicIds.length === 0) return { sql: "FALSE", params: [] as unknown[] };
  return {
    sql: `(
      EXISTS (
        SELECT 1 FROM patient_visits v
        WHERE v.patient_id = p.id AND v.deleted_at IS NULL AND v.clinic_id = ANY($1::uuid[])
      )
      OR NOT EXISTS (
        SELECT 1 FROM patient_visits v
        WHERE v.patient_id = p.id AND v.deleted_at IS NULL
      )
    )`,
    params: [clinicIds] as unknown[],
  };
}

async function searchPatientsForRegister(pool: pg.Pool, access: Access, actorId: string, q: string) {
  const scope = canList(access, "patient") ? patientViewWhere(access, actorId) : visitCreatePatientWhere(access, actorId);
  const values: unknown[] = [...scope.params];
  const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  values.push(pattern, pattern, pattern, pattern, pattern, pattern);
  const start = values.length - 5;
  values.push(q.toLowerCase());
  const exactSlot = values.length;
  const result = await pool.query(
    `SELECT ${patientColumns},
            EXTRACT(YEAR FROM age(current_date, p.birthdate))::int AS age,
            latest.passport_number AS last_passport,
            latest.preferred_contact_method AS last_preferred_contact_method,
            latest.emergency_contact_name AS last_emergency_contact_name,
            latest.emergency_contact_phone AS last_emergency_contact_phone,
            latest.emergency_contact_relationship AS last_emergency_contact_relationship
     FROM patients p
     JOIN users u ON u.id = p.added_by
     LEFT JOIN LATERAL (
       SELECT v.passport_number, v.preferred_contact_method, v.emergency_contact_name, v.emergency_contact_phone, v.emergency_contact_relationship
       FROM patient_visits v
       WHERE v.patient_id = p.id AND v.deleted_at IS NULL
       ORDER BY v.created_at DESC
       LIMIT 1
     ) latest ON TRUE
     WHERE p.deleted_at IS NULL
       AND ${scope.sql}
       AND (
         p.name ILIKE $${start} ESCAPE '\\'
         OR p.mrn ILIKE $${start + 1} ESCAPE '\\'
         OR COALESCE(p.identity_number, '') ILIKE $${start + 2} ESCAPE '\\'
         OR COALESCE(p.email, '') ILIKE $${start + 3} ESCAPE '\\'
         OR COALESCE(p.phone_number, '') ILIKE $${start + 4} ESCAPE '\\'
         OR COALESCE(latest.passport_number, '') ILIKE $${start + 5} ESCAPE '\\'
       )
     ORDER BY
       CASE
         WHEN lower(COALESCE(p.identity_number, '')) = $${exactSlot} THEN 0
         WHEN lower(COALESCE(latest.passport_number, '')) = $${exactSlot} THEN 1
         ELSE 2
       END,
       p.name ASC
     LIMIT 12`,
    values,
  );

  return result.rows.map((row) => {
    const {
      last_passport,
      last_preferred_contact_method,
      last_emergency_contact_name,
      last_emergency_contact_phone,
      last_emergency_contact_relationship,
      age,
      ...patient
    } = row as Record<string, unknown>;
    return {
      ...patient,
      age: typeof age === "number" ? age : null,
      last_passport: (last_passport as string | null) ?? (patient.identity_number as string | null) ?? null,
      last_visit: last_passport || last_preferred_contact_method || last_emergency_contact_name
        ? {
          passport_number: last_passport as string | null,
          preferred_contact_method: last_preferred_contact_method as string | null,
          emergency_contact_name: last_emergency_contact_name as string | null,
          emergency_contact_phone: last_emergency_contact_phone as string | null,
          emergency_contact_relationship: last_emergency_contact_relationship as string | null,
        }
        : null,
    };
  });
}

async function matchPatientsForRegister(
  pool: pg.Pool,
  access: Access,
  actorId: string,
  input: { name: string; gender: string; phone: string; nationality: string; birthdate: string; passport: string },
) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const passport = input.passport.trim();
  const phoneDigits = input.phone.replace(/\D/g, "");
  const birthdate = /^\d{4}-\d{2}-\d{2}$/.test(input.birthdate) ? input.birthdate : null;
  const gender = input.gender === "male" || input.gender === "female" ? input.gender : "";
  const nationality = input.nationality.trim();
  const provided = [name.length >= 2, Boolean(birthdate), passport.length >= 2].filter(Boolean).length;
  if (provided < 2) return [];

  const scope = canList(access, "patient") ? patientViewWhere(access, actorId) : visitCreatePatientWhere(access, actorId);
  const values: unknown[] = [...scope.params, name, passport, phoneDigits, birthdate, gender, nationality];
  const base = scope.params.length;
  const nameSlot = base + 1;
  const passportSlot = base + 2;
  const phoneSlot = base + 3;
  const birthSlot = base + 4;
  const genderSlot = base + 5;
  const nationalitySlot = base + 6;
  const likeToken = (expr: string) => `replace(replace(replace(${expr}, '\\', '\\\\'), '%', '\\%'), '_', '\\_')`;
  const matchedName = `(
    length($${nameSlot}) >= 2 AND (
      EXISTS (
        SELECT 1
        FROM regexp_split_to_table(lower($${nameSlot}), '\\s+') AS entered(token)
        WHERE length(token) >= 3
          AND lower(p.name) LIKE '%' || ${likeToken("token")} || '%' ESCAPE '\\'
      )
      OR EXISTS (
        SELECT 1
        FROM regexp_split_to_table(lower(p.name), '\\s+') AS stored(token)
        WHERE length(token) >= 3
          AND lower($${nameSlot}) LIKE '%' || ${likeToken("token")} || '%' ESCAPE '\\'
      )
    )
  )`;
  const matchedBirthdate = `($${birthSlot}::date IS NOT NULL AND p.birthdate = $${birthSlot}::date)`;
  const matchedPassport = `(
    length($${passportSlot}) >= 2 AND (
      lower(COALESCE(p.identity_number, '')) = lower($${passportSlot})
      OR (
        length($${passportSlot}) >= 4
        AND length(COALESCE(p.identity_number, '')) >= 4
        AND (
          lower(p.identity_number) LIKE '%' || ${likeToken(`lower($${passportSlot})`)} || '%' ESCAPE '\\'
          OR lower($${passportSlot}) LIKE '%' || ${likeToken("lower(p.identity_number)")} || '%' ESCAPE '\\'
        )
      )
      OR EXISTS (
        SELECT 1 FROM patient_visits vp
        WHERE vp.patient_id = p.id AND vp.deleted_at IS NULL AND length(vp.passport_number) >= 2 AND (
          lower(vp.passport_number) = lower($${passportSlot})
          OR (
            length($${passportSlot}) >= 4
            AND length(vp.passport_number) >= 4
            AND (
              lower(vp.passport_number) LIKE '%' || ${likeToken(`lower($${passportSlot})`)} || '%' ESCAPE '\\'
              OR lower($${passportSlot}) LIKE '%' || ${likeToken("lower(vp.passport_number)")} || '%' ESCAPE '\\'
            )
          )
        )
      )
    )
  )`;
  const matchedPhone = `(
    length($${phoneSlot}) >= 6 AND (
      (
        length(regexp_replace(COALESCE(p.phone_number, ''), '\\D', '', 'g')) >= 6
        AND right(regexp_replace(COALESCE(p.phone_number, ''), '\\D', '', 'g'), 9) = right($${phoneSlot}, 9)
      ) OR (
        length(regexp_replace(COALESCE(p.alternative_phone_number, ''), '\\D', '', 'g')) >= 6
        AND right(regexp_replace(COALESCE(p.alternative_phone_number, ''), '\\D', '', 'g'), 9) = right($${phoneSlot}, 9)
      )
    )
  )`;
  const matchedProfile = `(
    ${matchedName} AND ${matchedBirthdate}
    AND $${genderSlot} <> '' AND $${nationalitySlot} <> ''
    AND p.gender = $${genderSlot} AND p.nationality = $${nationalitySlot}
  )`;
  const matchScore = `(
    (CASE WHEN ${matchedName} THEN 1 ELSE 0 END)
    + (CASE WHEN ${matchedBirthdate} THEN 1 ELSE 0 END)
    + (CASE WHEN ${matchedPassport} THEN 1 ELSE 0 END)
  )`;
  const result = await pool.query(
    `SELECT ${patientColumns},
            EXTRACT(YEAR FROM age(current_date, p.birthdate))::int AS age,
            (
              SELECT count(*)::int FROM patient_visits v
              WHERE v.patient_id = p.id AND v.deleted_at IS NULL
            ) AS visit_count,
            latest.passport_number AS last_passport,
            latest.preferred_contact_method AS last_preferred_contact_method,
            latest.emergency_contact_name AS last_emergency_contact_name,
            latest.emergency_contact_phone AS last_emergency_contact_phone,
            latest.emergency_contact_relationship AS last_emergency_contact_relationship,
            ${matchedPassport} AS matched_passport,
            ${matchedPhone} AS matched_phone,
            ${matchedName} AS matched_name,
            ${matchedBirthdate} AS matched_birthdate,
            ${matchedProfile} AS matched_profile
     FROM patients p
     JOIN users u ON u.id = p.added_by
     LEFT JOIN LATERAL (
       SELECT v.passport_number, v.preferred_contact_method, v.emergency_contact_name, v.emergency_contact_phone, v.emergency_contact_relationship
       FROM patient_visits v
       WHERE v.patient_id = p.id AND v.deleted_at IS NULL
       ORDER BY v.created_at DESC
       LIMIT 1
     ) latest ON TRUE
     WHERE p.deleted_at IS NULL
       AND ${scope.sql}
       AND ${matchScore} >= 2
     ORDER BY ${matchScore} DESC, ${matchedPassport} DESC, p.name ASC
     LIMIT 12`,
    values,
  );
  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    const reasons = [
      record.matched_name ? "Part of the name" : null,
      record.matched_birthdate ? "Same birth date" : null,
      record.matched_passport ? "Same passport / ID" : null,
      record.matched_profile ? "Same gender and nationality" : null,
      record.matched_phone ? "Same phone" : null,
    ].filter((item): item is string => Boolean(item));
    const lastPassport = (record.last_passport as string | null) ?? null;
    const preferred = (record.last_preferred_contact_method as string | null) ?? null;
    const emergencyName = (record.last_emergency_contact_name as string | null) ?? null;
    const emergencyPhone = (record.last_emergency_contact_phone as string | null) ?? null;
    const emergencyRelationship = (record.last_emergency_contact_relationship as string | null) ?? null;
    const age = typeof record.age === "number" ? record.age : Number(record.age);
    return {
      id: record.id,
      name: record.name,
      mrn: record.mrn,
      birthdate: record.birthdate,
      nationality: record.nationality,
      gender: record.gender,
      added_by: record.added_by,
      added_by_name: record.added_by_name,
      identity_number: record.identity_number,
      email: record.email,
      phone_number: record.phone_number,
      alternative_phone_number: record.alternative_phone_number,
      home_address: record.home_address,
      created_at: record.created_at,
      updated_at: record.updated_at,
      deleted_at: record.deleted_at,
      age: Number.isFinite(age) ? age : null,
      visit_count: typeof record.visit_count === "number" ? record.visit_count : Number(record.visit_count) || 0,
      reasons,
      last_passport: lastPassport ?? (record.identity_number as string | null) ?? null,
      last_visit: lastPassport || preferred || emergencyName
        ? {
          passport_number: lastPassport,
          preferred_contact_method: preferred,
          emergency_contact_name: emergencyName,
          emergency_contact_phone: emergencyPhone,
          emergency_contact_relationship: emergencyRelationship,
        }
        : null,
    };
  });
}

async function insertVisit(
  db: Db,
  patientId: string,
  passportNumber: string,
  visit: z.infer<typeof visitBodySchema>,
  actorId: string,
) {
  const result = await db.query(
    `INSERT INTO patient_visits (
       patient_id, passport_number, preferred_contact_method, emergency_contact_name, emergency_contact_phone,
       emergency_contact_relationship, hotel_checkin_date, hotel_checkout_date, hotel_room_no, clinic_id,
       status, status_changed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, 'waiting_for_triage', now())
     RETURNING id`,
    [
      patientId, passportNumber, visit.preferred_contact_method, visit.emergency_contact_name, visit.emergency_contact_phone,
      visit.emergency_contact_relationship, visit.hotel_checkin_date, visit.hotel_checkout_date, visit.hotel_room_no, visit.clinic_id,
    ],
  );
  const visitId = result.rows[0]?.id as string;
  await db.query(
    `INSERT INTO patient_visit_status_history (visit_id, from_status, to_status, changed_by)
     VALUES ($1, NULL, 'waiting_for_triage', $2)`,
    [visitId, actorId],
  );
  return visitId;
}

function isUnique(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

async function listVisits(pool: Db, patientId: string, where?: { sql: string; params: unknown[] }) {
  const filter = where ?? { sql: "TRUE", params: [] as unknown[] };
  const shifted = filter.sql.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + 1}`);
  const result = await pool.query(
    `SELECT ${visitColumns}
     FROM patient_visits v
     JOIN clinics c ON c.id = v.clinic_id
     JOIN hotels h ON h.id = c.hotel_id
     JOIN patients p ON p.id = v.patient_id
     LEFT JOIN users d ON d.id = v.assigned_doctor_id
     WHERE v.patient_id = $1 AND v.deleted_at IS NULL AND ${shifted}
     ORDER BY v.hotel_checkin_date DESC, v.created_at DESC`,
    [patientId, ...filter.params],
  );
  return result.rows;
}

async function findVisit(pool: pg.Pool, patientId: string, id: string) {
  const result = await pool.query(
    `SELECT ${visitColumns}, p.added_by AS patient_added_by, p.name AS patient_name, p.mrn AS patient_mrn
     FROM patient_visits v
     JOIN clinics c ON c.id = v.clinic_id
     JOIN hotels h ON h.id = c.hotel_id
     JOIN patients p ON p.id = v.patient_id
     LEFT JOIN users d ON d.id = v.assigned_doctor_id
     WHERE v.id = $1 AND v.patient_id = $2 AND v.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [id, patientId],
  );
  const visit = result.rows[0] as {
    id: string;
    clinic_id: string;
    clinic_name: string;
    passport_number: string;
    preferred_contact_method: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_relationship: string | null;
    hotel_checkin_date: string | null;
    hotel_checkout_date: string | null;
    hotel_room_no: string | null;
    patient_added_by: string;
  } | undefined;
  if (!visit) return undefined;
  const history = await pool.query<{
    from_status: string | null;
    to_status: string;
    changed_by_name: string | null;
    created_at: string;
  }>(
    `SELECT h.from_status, h.to_status, h.created_at, u.name AS changed_by_name
     FROM patient_visit_status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.visit_id = $1
     ORDER BY h.created_at ASC`,
    [id],
  );
  return { ...visit, documents: await listVisitDocuments(pool, id), status_history: history.rows };
}

async function listVisitDocuments(pool: Db, visitId: string) {
  const result = await pool.query<{
    id: string;
    document_type: string;
    file_path: string;
    original_name: string;
    mime_type: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, document_type, file_path, original_name, mime_type, created_at, updated_at
     FROM patient_visit_documents
     WHERE visit_id = $1
     ORDER BY document_type ASC`,
    [visitId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    document_type: row.document_type,
    original_name: row.original_name,
    mime_type: row.mime_type,
    file_url: fileUrl(row.file_path),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

async function nextMrn(client: pg.PoolClient) {
  const year = new Date().getUTCFullYear();
  const result = await client.query<{ last_number: number }>(
    `INSERT INTO patient_mrn_years (year, last_number) VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET last_number = patient_mrn_years.last_number + 1
     RETURNING last_number`,
    [year],
  );
  const number = result.rows[0]?.last_number;
  if (!number) throw new ApplicationError(500, "mrn_failed", "The medical record number could not be created");
  return `YR-${year}-${String(number).padStart(6, "0")}`;
}

function assertBirthdate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApplicationError(422, "invalid_birthdate", "Choose a valid birth date");
  }
  if (date > new Date()) throw new ApplicationError(422, "invalid_birthdate", "Birth date cannot be in the future");
}

function readPatientListQuery(query: unknown) {
  const source = query !== null && typeof query === "object" ? query as Record<string, unknown> : {};
  const text = (key: string) => (typeof source[key] === "string" ? source[key].trim() : "");
  const page = Number(text("page") || "1");
  const pageSize = Number(text("page_size") || "20");
  const q = text("q");
  const gender = text("gender");
  const nationality = text("nationality");
  const clinicId = text("clinic_id");
  if (!Number.isInteger(page) || page < 1) throw new ApplicationError(422, "invalid_query", "Page must be 1 or greater");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new ApplicationError(422, "invalid_query", "Page size must be between 1 and 100");
  if (q.length > 200) throw new ApplicationError(422, "invalid_query", "Search is too long");
  if (gender && !genders.includes(gender as (typeof genders)[number])) throw new ApplicationError(422, "invalid_query", "Unknown gender");
  if (nationality && !nationalities.includes(nationality as (typeof nationalities)[number])) {
    throw new ApplicationError(422, "invalid_query", "Unknown nationality");
  }
  if (clinicId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clinicId)) {
    throw new ApplicationError(422, "invalid_query", "Unknown clinic");
  }
  return { page, pageSize, q, gender, nationality, clinicId: clinicId || null };
}

function readVisitListQuery(query: unknown) {
  const source = query !== null && typeof query === "object" ? query as Record<string, unknown> : {};
  const text = (key: string) => (typeof source[key] === "string" ? source[key].trim() : "");
  const page = Number(text("page") || "1");
  const pageSize = Number(text("page_size") || "20");
  const q = text("q");
  const clinicId = text("clinic_id");
  const status = text("status");
  const sort = text("sort") || "updated_at";
  const dir = (text("dir") || "desc").toLowerCase();
  if (!Number.isInteger(page) || page < 1) throw new ApplicationError(422, "invalid_query", "Page must be 1 or greater");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new ApplicationError(422, "invalid_query", "Page size must be between 1 and 100");
  if (q.length > 200) throw new ApplicationError(422, "invalid_query", "Search is too long");
  if (clinicId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clinicId)) {
    throw new ApplicationError(422, "invalid_query", "Unknown clinic");
  }
  if (status && !visitStatuses.includes(status as (typeof visitStatuses)[number])) {
    throw new ApplicationError(422, "invalid_query", "Unknown status");
  }
  if (!visitSorts.includes(sort as (typeof visitSorts)[number])) {
    throw new ApplicationError(422, "invalid_query", "Unknown sort");
  }
  if (dir !== "asc" && dir !== "desc") throw new ApplicationError(422, "invalid_query", "Unknown sort direction");
  return {
    page,
    pageSize,
    q,
    clinicId: clinicId || null,
    status: (status || null) as (typeof visitStatuses)[number] | null,
    sort: sort as (typeof visitSorts)[number],
    dir: dir === "asc" ? "ASC" : "DESC",
  };
}

async function assertClinicExists(pool: pg.Pool, id: string) {
  const result = await pool.query("SELECT id FROM clinics WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!result.rows[0]) throw new ApplicationError(422, "unknown_clinic", "Choose a clinic that exists");
}

async function actorName(pool: pg.Pool, id: string) {
  const result = await pool.query("SELECT name FROM users WHERE id = $1", [id]);
  return result.rows[0]?.name ?? "";
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
