import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { pool } from "@/lib/server/pg";

// Returns ICE servers for WebRTC. TURN credentials stay on the server and are only
// handed to signed-in members of a world. Supports Cloudflare Realtime TURN
// (short-lived credentials), Metered, or a static TURN server — see README.
const STUN: RTCIceServer = { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] };

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rowCount } = await pool().query("select 1 from public.world_members where user_id = $1", [user.id]);
  if (!rowCount) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const iceServers: RTCIceServer[] = [STUN];
  try {
    iceServers.push(...(await turnServers()));
  } catch {
    // Fall back to STUN only; most home Wi-Fi works, some mobile carriers need TURN.
  }
  return NextResponse.json({ iceServers }, { headers: { "Cache-Control": "private, no-store" } });
}

async function turnServers(): Promise<RTCIceServer[]> {
  const { CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN, METERED_DOMAIN, METERED_API_KEY, TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL } = process.env;

  if (CLOUDFLARE_TURN_KEY_ID && CLOUDFLARE_TURN_API_TOKEN) {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CLOUDFLARE_TURN_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 6 * 60 * 60 }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`cloudflare ${res.status}`);
    const body = (await res.json()) as { iceServers: RTCIceServer | RTCIceServer[] };
    return Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
  }

  if (METERED_DOMAIN && METERED_API_KEY) {
    const res = await fetch(`https://${METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${encodeURIComponent(METERED_API_KEY)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`metered ${res.status}`);
    return (await res.json()) as RTCIceServer[];
  }

  if (TURN_URLS && TURN_USERNAME && TURN_CREDENTIAL) {
    return [{ urls: TURN_URLS.split(",").map((u) => u.trim()), username: TURN_USERNAME, credential: TURN_CREDENTIAL }];
  }
  return [];
}
