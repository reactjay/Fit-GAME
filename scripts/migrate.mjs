// Applies db/migrations/*.sql in order, once each. Safe to run on every deploy.
// Usage: DATABASE_URL=... node scripts/migrate.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import nextEnv from "@next/env";

// Loads .env, .env.local, etc. the same way Next.js does.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const dir = join(import.meta.dirname, "..", "db", "migrations");
const client = new pg.Client({ connectionString: url, ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined });
await client.connect();
try {
  await client.query("create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  await client.query("revoke all on public.schema_migrations from authenticated, anon");
  const done = new Set((await client.query("select name from public.schema_migrations")).rows.map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    process.stdout.write(`applying ${file}… `);
    await client.query("begin");
    try {
      await client.query(readFileSync(join(dir, file), "utf8"));
      await client.query("insert into public.schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log("done");
    } catch (e) {
      await client.query("rollback");
      console.log("FAILED");
      throw e;
    }
  }
  console.log("database is up to date");
} finally {
  await client.end();
}
