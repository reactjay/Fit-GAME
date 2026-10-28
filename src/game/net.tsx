"use client";
import { useEffect } from "react";
import * as THREE from "three";
import { useWorld } from "@/lib/world-context";
import { emote, exitBeside } from "./actors/Player";
import { isMine, live, type RemoteState } from "./shared";
import type { AnimId } from "./actors/Avatar";
import { sfx } from "@/lib/sound";
import { fireworks } from "./world/Fireworks";
import { hud, toastHud, type Mode } from "./store";

const SEND_HZ = 12;

/**
 * Two-player networking over the world's private WebSocket:
 *  - "game:p" broadcasts carry each player's pose/animation (12 Hz, interpolated on the other side)
 *  - seats and vehicle poses are authoritative on the server (no double drivers)
 *  - a "sync" request fetches the server clock, seats and parked vehicle poses
 */
export function GameNet() {
  const { me, partner, onServer, sendServer, onBroadcast, broadcast, onResync } = useWorld();

  useEffect(() => {
    live.me.id = me.id;
    live.partnerId = partner?.id ?? null;
    live.send = (msg) => sendServer(msg);
  }, [me.id, partner?.id, sendServer]);

  useEffect(() => {
    const sync = () => sendServer({ type: "sync" });
    const offs = [
      onServer("ready", (m) => {
        live.clockOffset = Number(m.now) - Date.now();
        live.me.conn = String(m.conn ?? "");
        live.seats = (m.seats as typeof live.seats) ?? {};
        for (const [id, p] of Object.entries((m.poses as Record<string, number[]>) ?? {})) live.poses.set(id, { p, t: Date.now() });
        applySeats();
      }),
      onServer("seats", (m) => {
        live.seats = (m.seats as typeof live.seats) ?? {};
        applySeats();
      }),
      onServer("seat-denied", () => toastHud("That seat is taken")),
      onServer("pose", (m) => live.poses.set(String(m.vehicle), { p: m.p as number[], t: Date.now() })),
      onBroadcast("game:p", (p) => {
        // Ignore our own account on another device; only the partner is drawn as the partner.
        if (p.from === live.me.id || (live.partnerId && p.from !== live.partnerId)) return;
        const s: RemoteState = {
          x: Number(p.x), y: Number(p.y), z: Number(p.z), ry: Number(p.ry) || 0,
          anim: String(p.anim ?? "idle"), mode: (p.mode as Mode) ?? "walk", vehicle: (p.veh as string) ?? null,
          model: String(p.model ?? "kofi"), t: Date.now(),
        };
        if (![s.x, s.y, s.z].every(Number.isFinite)) return;
        live.partnerModel = s.model;
        if (!live.partner || Date.now() - live.partner.seen > 6000) {
          if (live.partner && hud.get().partnerHere === false) toastHud(`${partner?.display_name ?? "Your partner"} joined you in Lagos 💞`);
          live.partner = { target: s, shown: new THREE.Vector3(s.x, s.y, s.z), ry: s.ry, seen: Date.now() };
        } else {
          live.partner.target = s;
          live.partner.seen = Date.now();
        }
      }),
      onBroadcast("game:leave", () => {
        if (live.partner) live.partner.seen = 0;
      }),
      onBroadcast("game:fireworks", (p) => {
        if (p.from === live.me.id) return;
        fireworks.until = performance.now() + 30_000;
        toastHud(`🎆 ${partner?.display_name ?? "Your partner"} set off fireworks for you!`, 4000);
      }),
      onBroadcast("game:romance", (p) => {
        if (p.from !== live.partnerId) return;
        live.partnerRomance = { action: String(p.action), anim: String(p.anim), until: Date.now() + 5000 };
        emote.anim = String(p.anim) as AnimId;
        emote.until = performance.now() / 1000 + 4;
        sfx.romance();
        toastHud(`${partner?.display_name ?? "💞"} · ${String(p.action)}`);
      }),
      onBroadcast("game:marker", (p) => {
        const markers = hud.get().markers.filter((x) => x.by !== p.from);
        if (p.x !== null && Number.isFinite(Number(p.x))) markers.push({ id: String(p.from), x: Number(p.x), z: Number(p.z), by: String(p.from), label: String(p.label ?? "Meet me here") });
        hud.set({ markers });
        toastHud(`${partner?.display_name ?? "Your partner"} dropped a pin: ${p.label ?? "Meet me here"}`);
      }),
      onResync(sync),
    ];
    sync();

    // Send our state at a fixed rate.
    const timer = setInterval(() => {
      const m = live.me;
      broadcast("game:p", {
        x: +m.pos.x.toFixed(2), y: +m.pos.y.toFixed(2), z: +m.pos.z.toFixed(2), ry: +m.ry.toFixed(3),
        anim: m.anim, mode: m.mode, veh: m.vehicle, model: m.model,
      });
      if (live.pendingRomance) {
        broadcast("game:romance", live.pendingRomance);
        live.pendingRomance = null;
      }
      if (live.pendingMarker) {
        const pm = live.pendingMarker;
        live.pendingMarker = null;
        broadcast("game:marker", { x: Math.round(pm.x), z: Math.round(pm.z), label: pm.label });
        hud.set({ markers: [...hud.get().markers.filter((x) => x.by !== m.id), { id: m.id, x: pm.x, z: pm.z, by: m.id, label: pm.label }] });
      }
      // Partner status for the HUD.
      const pt = live.partner;
      const here = Boolean(pt && Date.now() - pt.seen < 6000);
      const wasHere = hud.get().partnerHere;
      if (wasHere && !here) toastHud(`${partner?.display_name ?? "Your partner"} disconnected`);
      hud.set({ partnerHere: here, partnerDistance: here && pt ? Math.round(pt.shown.distanceTo(m.pos)) : null, partnerMode: here && pt ? pt.target.mode : null });
    }, 1000 / SEND_HZ);

    return () => {
      offs.forEach((o) => o());
      clearInterval(timer);
      broadcast("game:leave", {});
    };
  }, [onServer, sendServer, onBroadcast, broadcast, onResync, partner?.display_name]);

  return null;
}

/** Moves the local player into/out of vehicles to match the server's seat table. */
function applySeats() {
  const myId = live.me.id;
  let found: { id: string; seat: "driver" | "passenger" } | null = null;
  void myId;
  for (const [id, s] of Object.entries(live.seats)) {
    if (isMine(s.driver)) found = { id, seat: "driver" };
    else if (isMine(s.passenger)) found = { id, seat: "passenger" };
  }
  const inVehicle = live.me.mode === "car" || live.me.mode === "passenger" || live.me.mode === "jet";
  if (found) {
    const mode: Mode = found.seat === "passenger" ? "passenger" : found.id.startsWith("jet") ? "jet" : "car";
    if (live.me.mode !== mode || live.me.vehicle !== found.id) {
      live.me.mode = mode;
      live.me.vehicle = found.id;
      live.me.anim = "sit";
      const v = live.vehicles.get(found.id);
      if (v) live.cameraYaw = v.heading + Math.PI;
      hud.set({ mode, prompt: null });
    }
  } else if (inVehicle && live.me.vehicle) {
    const v = live.vehicles.get(live.me.vehicle);
    const wasPassenger = live.me.mode === "passenger";
    if (v) exitBeside(v.pos, v.quat, wasPassenger ? -1 : 1);
    live.me.mode = "walk";
    live.me.vehicle = null;
    hud.set({ mode: "walk", speedKmh: 0 });
  }
}
