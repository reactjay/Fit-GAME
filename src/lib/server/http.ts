import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, type SessionUser } from "./auth";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const fail = (message: string, status = 400) => json({ error: { message } }, status);

/** Blocks cross-site requests to state-changing endpoints (defence in depth on top of SameSite cookies). */
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function withUser(req: NextRequest, fn: (user: SessionUser) => Promise<Response>): Promise<Response> {
  if (req.method !== "GET" && !sameOrigin(req)) return fail("Cross-site request blocked", 403);
  const user = await getSessionUser();
  if (!user) return fail("Your session has ended. Please sign in again.", 401);
  return fn(user);
}

export async function body<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
