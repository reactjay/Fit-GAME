import type { NextRequest } from "next/server";
import { z } from "zod";
import { createSession, hashPassword, verifyPassword } from "@/lib/server/auth";
import { body, fail, json, withUser } from "@/lib/server/http";
import { pool } from "@/lib/server/pg";

const schema = z.object({ current: z.string().max(200), next: z.string().min(8, "Use at least 8 characters.").max(200) });

export async function POST(req: NextRequest) {
  return withUser(req, async (user) => {
    const parsed = schema.safeParse(await body(req));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
    const { rows } = await pool().query("select password_hash from auth.users where id = $1", [user.id]);
    if (!(await verifyPassword(parsed.data.current, rows[0].password_hash))) return fail("Your current password isn't right.", 401);
    await pool().query("update auth.users set password_hash = $1 where id = $2", [await hashPassword(parsed.data.next), user.id]);
    // Sign out every other device, keep this one signed in with a fresh session.
    await pool().query("delete from auth.sessions where user_id = $1", [user.id]);
    await createSession(user.id, req.headers.get("user-agent"));
    return json({ ok: true });
  });
}
