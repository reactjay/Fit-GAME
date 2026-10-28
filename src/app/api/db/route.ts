import type { NextRequest } from "next/server";
import { dbRequest, runDb } from "@/lib/server/db-api";
import { body, fail, json, withUser } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  return withUser(req, async (user) => {
    const parsed = dbRequest.safeParse(await body(req));
    if (!parsed.success) return fail("Invalid request");
    return json(await runDb(user.id, parsed.data));
  });
}
