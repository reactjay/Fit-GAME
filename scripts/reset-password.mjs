// Sets a new password for an account (JustUs sends no emails, so this replaces "forgot password").
// Usage:  npm run reset-password -- someone@example.com
//   On Railway: open the app service → "…" → Shell (or `railway run npm run reset-password -- email`).
// You'll be asked for the new password; it is never shown or logged. All of that user's sessions are signed out.
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import pg from "pg";
import nextEnv from "@next/env";

// Loads .env, .env.local, etc. the same way Next.js does.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const scrypt = promisify(scryptCb);
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !process.env.DATABASE_URL) {
  console.error("Usage: DATABASE_URL=... npm run reset-password -- someone@example.com");
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = (await rl.question("New password (min 8 characters): ")).trim();
rl.close();
if (password.length < 8) {
  console.error("Too short.");
  process.exit(1);
}
const salt = randomBytes(16);
const key = await scrypt(password.normalize("NFKC"), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const hash = `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;

const url = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined });
await client.connect();
const { rows } = await client.query("update auth.users set password_hash = $1 where lower(email) = $2 returning id", [hash, email]);
if (!rows[0]) console.error("No account with that email.");
else {
  await client.query("delete from auth.sessions where user_id = $1", [rows[0].id]);
  console.log("Password updated. That account has been signed out everywhere.");
}
await client.end();
