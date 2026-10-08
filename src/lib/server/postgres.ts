import pg from "pg";

// Online (Vercel + Supabase) the server stores live in Postgres; locally, with
// no DATABASE_URL, every store keeps using today's SQLite/.local files.
// Read at call time so one process never mixes backends by import order.
export const postgresConfigured = () => !!process.env.DATABASE_URL?.trim();

export type PostgresQueryable = Pick<pg.Pool, "query">;
export type PostgresClient = Pick<pg.PoolClient, "query" | "release">;
export type PostgresPool = PostgresQueryable & { connect(): Promise<PostgresClient> };

type PostgresGlobal = typeof globalThis & { diamondPostgresPool?: PostgresPool };
const owner = globalThis as PostgresGlobal;

// TLS is always on. The connection string's own sslmode is removed because
// pg would let it override this config; DATABASE_CA_CERT (PEM, "\n" escapes
// allowed) turns on full certificate verification against Supabase's CA.
function sslConfig(): pg.PoolConfig["ssl"] {
  const ca = process.env.DATABASE_CA_CERT?.trim().replace(/\\n/g, "\n");
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

function connectionString(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error("postgres_not_configured");
  const url = new URL(raw);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) url.searchParams.delete(key);
  return url.toString();
}

/** One small shared pool per server instance (serverless: keep it tiny). */
export function postgresPool(): PostgresPool {
  if (owner.diamondPostgresPool) return owner.diamondPostgresPool;
  const pool = new pg.Pool({
    connectionString: connectionString(),
    ssl: sslConfig(),
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  // An idle client dropped by the pooler must not crash the process.
  pool.on("error", () => {});
  owner.diamondPostgresPool = pool;
  return pool;
}

/** Runs `work` inside BEGIN/COMMIT on one client; rolls back on any error. */
export async function withPostgresTransaction<T>(work: (client: PostgresClient) => Promise<T>): Promise<T> {
  const client = await postgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
