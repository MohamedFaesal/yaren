import type pg from "pg";
import { hashPassword } from "../password.js";

/** Fixed ids so restarts stay idempotent. */
const doctorRoleId = "33333333-3333-4333-8333-333333333333";
const nurseRoleId = "44444444-4444-4444-8444-444444444444";
const hotelHurghadaId = "a1111111-1111-4111-8111-111111111101";
const hotelSharmId = "a1111111-1111-4111-8111-111111111102";
const clinicMamshaId = "b1111111-1111-4111-8111-111111111101";
const clinicGounaId = "b1111111-1111-4111-8111-111111111102";
const clinicNaamaId = "b1111111-1111-4111-8111-111111111103";
const doctorSaraId = "c1111111-1111-4111-8111-111111111101";
const doctorOmarId = "c1111111-1111-4111-8111-111111111102";
const doctorNourId = "c1111111-1111-4111-8111-111111111103";
const doctorKarimId = "c1111111-1111-4111-8111-111111111104";
const doctorMayaId = "c1111111-1111-4111-8111-111111111105";
const nurseLaylaId = "d1111111-1111-4111-8111-111111111101";
const nurseHassanId = "d1111111-1111-4111-8111-111111111102";
const nurseMonaId = "d1111111-1111-4111-8111-111111111103";
const nurseYoussefId = "d1111111-1111-4111-8111-111111111104";
const nurseRaniaId = "d1111111-1111-4111-8111-111111111105";

const dummyPassword = "ChangeMe!2026";

const doctorPermissions = [
  "clinic.view.all",
  "patient.view.all",
  "visit.view.all",
  "triage.view.all",
] as const;

const nursePermissions = [
  "clinic.view.all",
  "patient.manage.all",
  "visit.manage.all",
  "triage.manage.all",
] as const;

/**
 * Dev fixtures: hotels, clinics, Doctor/Nurse access roles, and sample users.
 * Safe to run on every boot — skips rows that already exist.
 */
export async function seedDummyOrg(pool: pg.Pool) {
  const admin = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE type = 'super-admin' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
  );
  const addedBy = admin.rows[0]?.id;
  if (!addedBy) return;

  await pool.query(
    `INSERT INTO access_roles (id, name, description)
     VALUES ($1, 'Doctor Role', 'See patients, visits, and triage in assigned clinics. Pair with the Doctor job position.')
     ON CONFLICT (id) DO NOTHING`,
    [doctorRoleId],
  );
  await pool.query(
    `INSERT INTO access_roles (id, name, description)
     VALUES ($1, 'Nurse Role', 'Register patients, manage visits, and run triage in assigned clinics. Pair with the Nurse job position.')
     ON CONFLICT (id) DO NOTHING`,
    [nurseRoleId],
  );

  for (const permissionId of doctorPermissions) {
    await pool.query(
      `INSERT INTO access_role_permissions (role_id, permission_id)
       SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM permissions WHERE id = $2)
       ON CONFLICT DO NOTHING`,
      [doctorRoleId, permissionId],
    );
  }
  for (const permissionId of nursePermissions) {
    await pool.query(
      `INSERT INTO access_role_permissions (role_id, permission_id)
       SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM permissions WHERE id = $2)
       ON CONFLICT DO NOTHING`,
      [nurseRoleId, permissionId],
    );
  }

  await pool.query(
    `INSERT INTO hotels (id, name, location, added_by)
     VALUES
       ($1, 'Yaren Demo Hotel Hurghada', $2::jsonb, $5),
       ($3, 'Yaren Demo Resort Sharm', $4::jsonb, $5)
     ON CONFLICT (id) DO NOTHING`,
    [
      hotelHurghadaId,
      JSON.stringify({ city: "Hurghada", area: "El Mamsha", lat: 27.2374, lng: 33.8448 }),
      hotelSharmId,
      JSON.stringify({ city: "Sharm El Sheikh", area: "Naama Bay", lat: 27.9134, lng: 34.3278 }),
      addedBy,
    ],
  );

  await pool.query(
    `INSERT INTO clinics (id, name, hotel_id, added_by)
     VALUES
       ($1, 'Mamsha Clinic', $4, $6),
       ($2, 'El Gouna Clinic', $4, $6),
       ($3, 'Naama Bay Clinic', $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [clinicMamshaId, clinicGounaId, clinicNaamaId, hotelHurghadaId, hotelSharmId, addedBy],
  );

  await pool.query(
    `INSERT INTO clinic_wait_settings (clinic_id, triage_wait_minutes, doctor_wait_minutes, updated_by)
     SELECT id, 15, 30, $1 FROM clinics
     WHERE id = ANY($2::uuid[])
       AND NOT EXISTS (SELECT 1 FROM clinic_wait_settings s WHERE s.clinic_id = clinics.id)`,
    [addedBy, [clinicMamshaId, clinicGounaId, clinicNaamaId]],
  );

  const passwordHash = await hashPassword(dummyPassword);
  const users = [
    { id: doctorSaraId, name: "Dr. Sara Hassan", email: "doctor.sara@yaren.health", phone: "01000000011", role: "Doctor", accessRole: doctorRoleId },
    { id: doctorOmarId, name: "Dr. Omar Farid", email: "doctor.omar@yaren.health", phone: "01000000012", role: "Doctor", accessRole: doctorRoleId },
    { id: doctorNourId, name: "Dr. Nour El Din", email: "doctor.nour@yaren.health", phone: "01000000013", role: "Doctor", accessRole: doctorRoleId },
    { id: doctorKarimId, name: "Dr. Karim Saleh", email: "doctor.karim@yaren.health", phone: "01000000014", role: "Doctor", accessRole: doctorRoleId },
    { id: doctorMayaId, name: "Dr. Maya Ibrahim", email: "doctor.maya@yaren.health", phone: "01000000015", role: "Doctor", accessRole: doctorRoleId },
    { id: nurseLaylaId, name: "Nurse Layla Nabil", email: "nurse.layla@yaren.health", phone: "01000000021", role: "Nurse", accessRole: nurseRoleId },
    { id: nurseHassanId, name: "Nurse Hassan Ali", email: "nurse.hassan@yaren.health", phone: "01000000022", role: "Nurse", accessRole: nurseRoleId },
    { id: nurseMonaId, name: "Nurse Mona Adel", email: "nurse.mona@yaren.health", phone: "01000000023", role: "Nurse", accessRole: nurseRoleId },
    { id: nurseYoussefId, name: "Nurse Youssef Kamal", email: "nurse.youssef@yaren.health", phone: "01000000024", role: "Nurse", accessRole: nurseRoleId },
    { id: nurseRaniaId, name: "Nurse Rania Mostafa", email: "nurse.rania@yaren.health", phone: "01000000025", role: "Nurse", accessRole: nurseRoleId },
  ] as const;

  for (const user of users) {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
      [user.email],
    );
    let userId = existing.rows[0]?.id;
    if (!userId) {
      await pool.query(
        `INSERT INTO users (id, name, email, phone, type, role, password_hash, is_active, created_by)
         VALUES ($1, $2, $3, $4, 'staff', $5, $6, true, $7)
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.name, user.email, user.phone, user.role, passwordHash, addedBy],
      );
      userId = user.id;
    }

    await pool.query(
      `INSERT INTO user_access_roles (user_id, role_id, all_clinics)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, user.accessRole],
    );
  }

  await seedDummyVisits(pool, addedBy);

  console.log("Dummy org ready: 2 hotels, 3 clinics, Doctor Role, Nurse Role, 5 doctors, 5 nurses, sample patients/visits (password ChangeMe!2026)");
}

async function seedDummyVisits(pool: pg.Pool, addedBy: string) {
  const service = await pool.query<{ id: string }>(
    `SELECT id FROM medical_services
     WHERE deleted_at IS NULL AND code = 'YAR-CONS-001'
     LIMIT 1`,
  );
  const professionalServiceId = service.rows[0]?.id;
  if (!professionalServiceId) return;

  const nurse = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [nurseLaylaId],
  );
  const doctor = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [doctorSaraId],
  );
  const createdBy = nurse.rows[0]?.id ?? addedBy;
  const doctorId = doctor.rows[0]?.id ?? null;

  const today = new Date();
  const iso = (daysFromToday: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + daysFromToday);
    return date.toISOString().slice(0, 10);
  };

  const patients = [
    { id: "e1111111-1111-4111-8111-111111111101", name: "Jack Nicklson", mrn: "YRN-DEMO-0001", birthdate: "1988-04-12", nationality: "Argentine", gender: "male", passport: "AR998877", phone: "01011110001" },
    { id: "e1111111-1111-4111-8111-111111111102", name: "Anna Mueller", mrn: "YRN-DEMO-0002", birthdate: "1992-09-03", nationality: "German", gender: "female", passport: "DE445566", phone: "01011110002" },
    { id: "e1111111-1111-4111-8111-111111111103", name: "Ahmed Mansour", mrn: "YRN-DEMO-0003", birthdate: "1985-01-22", nationality: "Egyptian", gender: "male", passport: "EG112233", phone: "01011110003" },
    { id: "e1111111-1111-4111-8111-111111111104", name: "Sophie Martin", mrn: "YRN-DEMO-0004", birthdate: "1995-07-18", nationality: "French", gender: "female", passport: "FR778899", phone: "01011110004" },
    { id: "e1111111-1111-4111-8111-111111111105", name: "Luca Rossi", mrn: "YRN-DEMO-0005", birthdate: "1979-11-30", nationality: "Italian", gender: "male", passport: "IT334455", phone: "01011110005" },
    { id: "e1111111-1111-4111-8111-111111111106", name: "Emily Carter", mrn: "YRN-DEMO-0006", birthdate: "1990-02-14", nationality: "British", gender: "female", passport: "GB556677", phone: "01011110006" },
  ] as const;

  for (const patient of patients) {
    await pool.query(
      `INSERT INTO patients (id, name, mrn, birthdate, nationality, gender, added_by, identity_number, phone_number, email)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        patient.id,
        patient.name,
        patient.mrn,
        patient.birthdate,
        patient.nationality,
        patient.gender,
        createdBy,
        patient.passport,
        patient.phone,
        `${patient.mrn.toLowerCase()}@demo.yaren.health`,
      ],
    );
  }

  const visits = [
    { id: "f1111111-1111-4111-8111-111111111101", patientId: patients[0].id, passport: patients[0].passport, clinicId: clinicMamshaId, room: "412", status: "waiting_for_triage", visitType: "new", currency: "EUR", assignDoctor: false },
    { id: "f1111111-1111-4111-8111-111111111102", patientId: patients[1].id, passport: patients[1].passport, clinicId: clinicMamshaId, room: "208", status: "waiting_for_triage", visitType: "new", currency: "EUR", assignDoctor: false },
    { id: "f1111111-1111-4111-8111-111111111103", patientId: patients[2].id, passport: patients[2].passport, clinicId: clinicGounaId, room: "105", status: "waiting_for_triage", visitType: "new", currency: "EGP", assignDoctor: false },
    { id: "f1111111-1111-4111-8111-111111111104", patientId: patients[3].id, passport: patients[3].passport, clinicId: clinicNaamaId, room: "720", status: "to_doctor", visitType: "new", currency: "EUR", assignDoctor: true },
    { id: "f1111111-1111-4111-8111-111111111105", patientId: patients[4].id, passport: patients[4].passport, clinicId: clinicMamshaId, room: "311", status: "to_doctor", visitType: "follow-up", currency: "EUR", assignDoctor: true },
    { id: "f1111111-1111-4111-8111-111111111106", patientId: patients[5].id, passport: patients[5].passport, clinicId: clinicNaamaId, room: "515", status: "waiting_for_triage", visitType: "new", currency: "EUR", assignDoctor: false },
    { id: "f1111111-1111-4111-8111-111111111107", patientId: patients[0].id, passport: patients[0].passport, clinicId: clinicGounaId, room: "118", status: "waiting_for_triage", visitType: "follow-up", currency: "EUR", assignDoctor: false },
    { id: "f1111111-1111-4111-8111-111111111108", patientId: patients[1].id, passport: patients[1].passport, clinicId: clinicNaamaId, room: "902", status: "waiting_for_triage", visitType: "new", currency: "EUR", assignDoctor: false },
  ] as const;

  for (const visit of visits) {
    const assignedDoctorId = visit.assignDoctor ? doctorId : null;
    await pool.query(
      `INSERT INTO patient_visits (
         id, patient_id, passport_number, preferred_contact_method, emergency_contact_name, emergency_contact_phone,
         emergency_contact_relationship, hotel_checkin_date, hotel_checkout_date, hotel_room_no, clinic_id,
         visit_type, currency, professional_service_id, status, status_changed_at, assigned_doctor_id
       ) VALUES (
         $1, $2, $3, 'phone', 'Hotel Front Desk', '01000000999', 'cousin',
         $4::date, $5::date, $6, $7, $8, $9, $10, $11, now(), $12
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        visit.id,
        visit.patientId,
        visit.passport,
        iso(-1),
        iso(5),
        visit.room,
        visit.clinicId,
        visit.visitType,
        visit.currency,
        professionalServiceId,
        visit.status,
        assignedDoctorId,
      ],
    );

    await pool.query(
      `INSERT INTO patient_visit_status_history (visit_id, from_status, to_status, changed_by)
       SELECT $1, NULL, 'waiting_for_triage', $2
       WHERE EXISTS (SELECT 1 FROM patient_visits WHERE id = $1)
         AND NOT EXISTS (SELECT 1 FROM patient_visit_status_history WHERE visit_id = $1)`,
      [visit.id, createdBy],
    );

    if (visit.status === "to_doctor" && assignedDoctorId) {
      await pool.query(
        `INSERT INTO patient_visit_status_history (visit_id, from_status, to_status, changed_by)
         SELECT $1, 'waiting_for_triage', 'to_doctor', $2
         WHERE EXISTS (SELECT 1 FROM patient_visits WHERE id = $1)
           AND NOT EXISTS (
             SELECT 1 FROM patient_visit_status_history
             WHERE visit_id = $1 AND to_status = 'to_doctor'
           )`,
        [visit.id, createdBy],
      );

      await pool.query(
        `INSERT INTO patient_visit_triages (
           visit_id, chief_complaint, temperature_c, pulse, respiratory_rate, spo2, blood_pressure,
           initial_assessment, triage_category, assigned_doctor_id, started_by, started_at, completed_by, completed_at
         ) VALUES (
           $1, 'Fever and sore throat', 38.2, 88, 18, 97, '120/80',
           'Stable, needs doctor review', 'urgent', $2, $3, now() - interval '40 minutes', $3, now() - interval '10 minutes'
         )
         ON CONFLICT (visit_id) DO NOTHING`,
        [visit.id, assignedDoctorId, createdBy],
      );
    }
  }
}
