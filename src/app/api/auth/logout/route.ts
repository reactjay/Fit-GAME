import type { NextRequest } from "next/server";
import { destroySession } from "@/lib/server/auth";
import { fail, json, sameOrigin } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail("Cross-site request blocked", 403);
  await destroySession();
  return json({ ok: true });
}
