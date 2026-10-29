import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, fail, json, withUser } from "@/lib/server/http";
import { asUser } from "@/lib/server/pg";
import { ALLOWED, MAX_BYTES, deleteObjects, headObject, isMember, worldOfPath } from "@/lib/server/storage";

const schema = z.object({
  path: z.string().max(200),
  kind: z.enum(["image", "video", "voice"]),
  width: z.number().int().positive().max(20000).nullish(),
  height: z.number().int().positive().max(20000).nullish(),
  duration_ms: z.number().int().positive().max(60 * 60_000).nullish(),
});

/** Step 2: verify what actually landed in storage, then register it in `media`. Oversized or wrong-type files are deleted. */
export async function POST(req: NextRequest) {
  return withUser(req, async (user) => {
    const parsed = schema.safeParse(await body(req));
    if (!parsed.success) return fail("Invalid upload");
    const { path, kind, width, height, duration_ms } = parsed.data;
    const world = worldOfPath(path);
    if (!world || !(await isMember(user.id, world))) return fail("You don't have access to that.", 403);
    const head = await headObject(path);
    if (!head) return fail("The upload didn't arrive. Please retry.", 409);
    const typeOk =
      ALLOWED.has(head.type) &&
      (kind === "image"
        ? head.type.startsWith("image/")
        : kind === "video"
          ? head.type.startsWith("video/")
          : head.type.startsWith("audio/"));
    if (head.size > MAX_BYTES || head.size === 0 || !typeOk) {
      await deleteObjects([path]);
      return fail(head.size > MAX_BYTES ? "That file is over 50 MB." : "That file type isn't supported.");
    }
    await asUser(user.id, (c) =>
      c.query(
        `insert into public.media (world_id, uploader_id, path, kind, mime, size_bytes, width, height, duration_ms)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (path) do nothing`,
        [world, user.id, path, kind, head.type, head.size, width ?? null, height ?? null, duration_ms ?? null],
      ),
    );
    return json({ path });
  });
}
