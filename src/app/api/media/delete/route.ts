import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, fail, json, withUser } from "@/lib/server/http";
import { asUser } from "@/lib/server/pg";
import { deleteObjects } from "@/lib/server/storage";

const schema = z.object({ paths: z.array(z.string().max(200)).min(1).max(20) });

/** Deletes files the caller uploaded (RLS on `media` only lets uploaders delete). */
export async function POST(req: NextRequest) {
  return withUser(req, async (user) => {
    const parsed = schema.safeParse(await body(req));
    if (!parsed.success) return fail("Invalid request");
    const { rows } = await asUser(user.id, (c) => c.query("delete from public.media where path = any($1) returning path", [parsed.data.paths]));
    await deleteObjects(rows.map((r) => r.path as string));
    return json({ deleted: rows.length });
  });
}
