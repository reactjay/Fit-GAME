import type { NextRequest } from "next/server";
import { z } from "zod";
import { createSession, throttle, verifyPassword } from "@/lib/server/auth";
import { body, fail, json, sameOrigin } from "@/lib/server/http";
import { pool } from "@/lib/server/pg";

const schema = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(200) });
// Compared against when the email doesn't exist, so timing doesn't reveal accounts.
const DUMMY = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("Cross-site request blocked", 403);
  const parsed = schema.safeParse(await body(req));
  if (!parsed.success) return fail("Enter your email and password.");
  const { email, password } = parsed.data;
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!throttle(`login:${ip}:${email}`)) return fail("Too many attempts. Wait 15 minutes and try again.", 429);
  const { rows } = await pool().query("select id, password_hash from auth.users where lower(email) = $1", [email]);
  const ok = await verifyPassword(password, rows[0]?.password_hash ?? DUMMY);
  if (!rows[0] || !ok) return fail("That email and password don't match.", 401);
  await createSession(rows[0].id, req.headers.get("user-agent"));
  return json({ ok: true });
}
