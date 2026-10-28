import type { NextRequest } from "next/server";
import { z } from "zod";
import { createSession, hashPassword, throttle } from "@/lib/server/auth";
import { body, fail, json, sameOrigin } from "@/lib/server/http";
import { pool } from "@/lib/server/pg";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
  display_name: z.string().trim().min(1).max(40),
});

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("Cross-site request blocked", 403);
  if (!throttle(`signup:${req.headers.get("x-forwarded-for") ?? "local"}`, 10, 60 * 60_000)) return fail("Too many attempts. Try again later.", 429);
  const parsed = schema.safeParse(await body(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const { email, password, display_name } = parsed.data;
  try {
    const { rows } = await pool().query("insert into auth.users (email, password_hash, raw_user_meta_data) values ($1, $2, $3) returning id", [
      email,
      await hashPassword(password),
      { display_name },
    ]);
    await createSession(rows[0].id, req.headers.get("user-agent"));
    return json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return fail("An account with that email already exists. Try signing in.", 409);
    throw e;
  }
}
