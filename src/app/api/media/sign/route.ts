import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, fail, json, withUser } from "@/lib/server/http";
import { isMember, readUrls, worldOfPath } from "@/lib/server/storage";

const schema = z.object({ paths: z.array(z.string().max(200)).min(1).max(100) });

/** Short-lived read URLs, only for files in the caller's own world. */
export async function POST(req: NextRequest) {
  return withUser(req, async (user) => {
    const parsed = schema.safeParse(await body(req));
    if (!parsed.success) return fail("Invalid request");
    const allowed: string[] = [];
    const checked = new Map<string, boolean>();
    for (const p of parsed.data.paths) {
      const w = worldOfPath(p);
      if (!w) continue;
      if (!checked.has(w)) checked.set(w, await isMember(user.id, w));
      if (checked.get(w)) allowed.push(p);
    }
    const urls = await readUrls(allowed);
    return json({ urls: allowed.map((path, i) => ({ path, url: urls[i] })) });
  });
}
