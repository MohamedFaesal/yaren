import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

// pg 8 treats sslmode=require as verify-full. Managed Postgres certificates are
// often signed by a private CA, which then fails with SELF_SIGNED_CERT_IN_CHAIN.
// Keep TLS, and skip CA verification unless a root certificate was provided.
function connectionStringForPg(connectionString: string): string {
  const queryIndex = connectionString.indexOf("?");
  if (queryIndex === -1) return connectionString;
  const params = new URLSearchParams(connectionString.slice(queryIndex + 1));
  const mode = params.get("sslmode");
  const managedMode = mode === "require" || mode === "prefer" || mode === "verify-ca";
  if (!managedMode || params.has("sslrootcert")) return connectionString;
  params.set("sslmode", "no-verify");
  return `${connectionString.slice(0, queryIndex)}?${params.toString()}`;
}

export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({ connectionString: connectionStringForPg(connectionString) });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Database = ReturnType<typeof createDatabase>["db"];
