// Live state shared by the 3D house and the page around it (no three.js here, so the page stays light).
import type { AnimId } from "@/game/actors/Avatar";

export type SeatTarget = { key: string; x: number; z: number; ry: number };

export const home = {
  me: { x: -5.9, z: 8.4, ry: Math.PI, path: [] as [number, number][], sitTarget: null as null | SeatTarget, seat: null as string | null, emote: null as null | { anim: AnimId; until: number } },
  /** Partner's latest network pose (x, z) and smoothed shown position (sx, sz). */
  partner: null as null | { x: number; z: number; sx: number; sz: number; ry: number; anim: AnimId; model: string; seat: string | null; seen: number },
  hearts: 0, // performance.now()/1000 of the last heart burst
  tvOn: false,
};

/** Plays an animation on you and bursts hearts between you two. */
export function emoteMe(anim: AnimId, seconds = 4) {
  home.me.emote = { anim, until: performance.now() / 1000 + seconds };
  home.hearts = performance.now() / 1000;
}

/** Applies a pose from the partner's device. Returns true when they just arrived. */
export function partnerPose(p: { x: number; z: number; ry: number; anim: AnimId; model: string; seat: string | null }) {
  const cur = home.partner;
  const fresh = !cur || Date.now() - cur.seen > 4000;
  home.partner = { ...p, sx: fresh ? p.x : cur.sx, sz: fresh ? p.z : cur.sz, seen: Date.now() };
  return fresh;
}
export function partnerLeft(reset = false) {
  if (reset) home.partner = null;
  else if (home.partner) home.partner.seen = 0;
}
export function setTv(on: boolean) {
  home.tvOn = on;
}

/** Scene actions the HTML overlay can trigger (set by the scene once mounted). */
export const houseApi: { eat: () => void; walkToPartner: () => void } = { eat: () => {}, walkToPartner: () => {} };

/** Shop items that are real 3D furniture (the rest show as small decor on a side table). */
export const FURNITURE_IDS = new Set(["sofa_green", "rug_round", "piano", "tv", "bed_round", "bed_kingsize", "bed_vono", "couch_leather", "armchair", "bookshelf", "aquarium", "floor_lamp", "palm", "dining", "bathtub", "beanbag", "art"]);
