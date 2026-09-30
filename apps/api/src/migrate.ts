import { createDatabase, migrate } from "@yaren/database";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const { pool } = createDatabase(databaseUrl);
try {
  await migrate(pool);
  console.info("Migrations applied");
} finally {
  await pool.end();
}
