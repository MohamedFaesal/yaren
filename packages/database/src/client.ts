import pg from "pg";

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
  return { pool };
}
