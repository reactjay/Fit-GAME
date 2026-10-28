import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, fail, json, withUser } from "@/lib/server/http";
import { ALLOWED, MAX_BYTES, isMember, uploadTarget } from "@/lib/server/storage";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/aac": "aac",
};
const schema = z.object({ worldId: z.string().uuid(), mime: z.string().max(60), size: z.number().int().positive() });

/** Step 1 of an upload: check membership/type/size, hand back a short-lived place to PUT the file. */
export async function POST(req: NextRequest) {
  return withUser(req, async (user) => {
    const parsed = schema.safeParse(await body(req));
    if (!parsed.success) return fail("Invalid upload");
    const { worldId, mime, size } = parsed.data;
    if (!ALLOWED.has(mime)) return fail("That file type isn't supported.");
    if (size > MAX_BYTES) return fail("That file is over 10 MB. Try a smaller one.");
    if (!(await isMember(user.id, worldId))) return fail("You don't have access to that.", 403);
    const path = `${worldId}/${crypto.randomUUID()}.${EXT[mime]}`;
    return json({ path, ...(await uploadTarget(path, mime)) });
  });
}
