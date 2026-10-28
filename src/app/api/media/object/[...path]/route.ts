import { NextResponse, type NextRequest } from "next/server";
import { fail, withUser } from "@/lib/server/http";
import { ALLOWED, MAX_BYTES, isMember, readLocal, storageDriver, worldOfPath, writeLocal } from "@/lib/server/storage";

// Local-disk storage for development (production uses Cloudflare R2 signed URLs).
type Ctx = { params: Promise<{ path: string[] }> };

async function authorize(req: NextRequest, ctx: Ctx, fn: (path: string) => Promise<Response>) {
  if (storageDriver !== "local") return fail("Not found", 404);
  const path = (await ctx.params).path.join("/");
  return withUser(req, async (user) => {
    const world = worldOfPath(path);
    if (!world || !(await isMember(user.id, world))) return fail("Not found", 404);
    return fn(path);
  });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return authorize(req, ctx, async (path) => {
    const file = await readLocal(path);
    if (!file) return fail("Not found", 404);
    return new NextResponse(new Uint8Array(file.body), {
      headers: { "Content-Type": file.type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return authorize(req, ctx, async (path) => {
    const type = (req.headers.get("content-type") ?? "").split(";")[0];
    if (!ALLOWED.has(type)) return fail("That file type isn't supported.");
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length > MAX_BYTES) return fail("That file is over 10 MB.", 413);
    await writeLocal(path, buf, type);
    return new NextResponse(null, { status: 200 });
  });
}
