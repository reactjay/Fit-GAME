// Completely drops all data and schemas, then re-runs all migrations from scratch.
// Usage: DATABASE_URL=... node scripts/wipe-db.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const dir = join(import.meta.dirname, "..", "db", "migrations");
const client = new pg.Client({
  connectionString: url,
  ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
try {
  console.log("⚠️  Wiping all data and schemas from database...");

  // Drop schemas with cascade to eliminate all tables, views, triggers, and data
  await client.query("drop schema if exists public cascade;");
  await client.query("create schema public;");
  await client.query("grant all on schema public to current_user;");
  await client.query("grant all on schema public to public;");
  await client.query("drop schema if exists auth cascade;");

  console.log("✅ Schemas cleared. Re-running migrations...");

  await client.query("create table public.schema_migrations (name text primary key, applied_at timestamptz not null default now())");

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
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

  await client.query(`
    do $$ begin
      if exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'revoke all on public.schema_migrations from authenticated, anon';
      end if;
    end $$;
  `);

  console.log("🎉 Database wiped and freshly initialized! Zero old data remains.");
} finally {
  await client.end();
}
