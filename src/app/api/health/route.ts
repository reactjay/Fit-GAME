import { NextResponse } from "next/server";
import { pool } from "@/lib/server/pg";

// Used by Railway's health check: the app is up and can reach the database.
export async function GET() {
  try {
    await pool().query("select 1");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
