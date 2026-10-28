import "server-only";
import pg from "pg";

// Keep DATE columns as "YYYY-MM-DD" strings (the default turns them into local-midnight Dates).
pg.types.setTypeParser(1082, (v) => v);
// int8 (counts, identity ids) as numbers — values here are far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

const globalForPg = globalThis as unknown as { __justusPool?: pg.Pool };

export function pool() {
  if (!globalForPg.__justusPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForPg.__justusPool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX ?? 10),
      ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalForPg.__justusPool;
}

/**
 * Runs `fn` in a transaction as the restricted `authenticated` role with
 * auth.uid() = userId, so row-level security applies to every statement.
 */
export async function asUser<T>(userId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
