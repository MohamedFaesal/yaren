import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createDatabase, migrate } from "@yaren/database";
import { ScryptPasswordHasher } from "./infrastructure/scrypt-password-hasher.js";

const staffJobs = ["physician", "nurse", "receptionist", "pharmacist", "claims_officer", "hotel_manager"] as const;

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  userType: z.enum(["super_admin", "admin", "staff"]),
  role: z.string().optional(),
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../seed/users.json");
const users = z.array(userSchema).parse(JSON.parse(await readFile(file, "utf8")));
const { pool } = createDatabase(databaseUrl);
const hasher = new ScryptPasswordHasher();

function roleFor(user: z.infer<typeof userSchema>) {
  if (user.userType === "super_admin") return "system_admin";
  if (user.userType === "admin") return user.role === "operations_manager" ? "operations_manager" : "center_manager";
  if (!user.role || !staffJobs.includes(user.role as (typeof staffJobs)[number])) {
    throw new Error(`${user.email} needs a staff role`);
  }
  return user.role;
}

try {
  await migrate(pool);
  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    const existing = await pool.query("SELECT id FROM identity.users WHERE email = $1", [email]);
    if ((existing.rowCount ?? 0) > 0) {
      console.info(`Skipped ${email}; already present`);
      continue;
    }
    await pool.query(
      `INSERT INTO identity.users (id, email, password_hash, display_name, role, center_id, status, created_at, user_type)
       VALUES ($1, $2, $3, $4, $5, NULL, 'active', now(), $6)`,
      [randomUUID(), email, await hasher.hash(user.password), user.displayName, roleFor(user), user.userType],
    );
    console.info(`Created ${email}`);
  }
} finally {
  await pool.end();
}
