import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { pool } from "./pg";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
export const SESSION_COOKIE = "ju_session";
const SESSION_DAYS = 30;
const N = 16384, r = 8, p = 1;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, n, rr, pp, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(rr),
    p: Number(pp),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string, userAgent: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await pool().query("insert into auth.sessions (token_hash, user_id, expires_at, user_agent) values ($1, $2, $3, $4)", [
    sha256(token),
    userId,
    expires,
    userAgent?.slice(0, 200) ?? null,
  ]);
  await pool().query("update auth.users set last_sign_in_at = now() where id = $1", [userId]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await pool().query("delete from auth.sessions where token_hash = $1", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

export type SessionUser = { id: string; email: string };

/** Validates the session cookie against the database. Sessions slide: used ones are extended. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userForToken(token);
}

export async function userForToken(token: string): Promise<SessionUser | null> {
  const { rows } = await pool().query(
    `update auth.sessions s set last_seen_at = now(),
            expires_at = case when s.expires_at < now() + interval '15 days' then now() + interval '${SESSION_DAYS} days' else s.expires_at end
       from auth.users u
      where s.token_hash = $1 and s.user_id = u.id and s.expires_at > now()
      returning u.id, u.email`,
    [sha256(token)],
  );
  return rows[0] ?? null;
}

// Simple in-memory throttle for sign-in attempts (the app runs as a single instance).
const attempts = new Map<string, { n: number; until: number }>();
export function throttle(key: string, max = 8, windowMs = 15 * 60_000) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) {
    attempts.set(key, { n: 1, until: now + windowMs });
    return true;
  }
  a.n++;
  return a.n <= max;
}
