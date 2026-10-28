"use client";
import { useSyncExternalStore } from "react";

// Tiny external store for HUD state (updated a few times per second, not per frame).
export type Mode = "walk" | "car" | "passenger" | "train" | "jet" | "bus";
export type Quality = "low" | "medium" | "high";
export type Panel = null | "chat" | "map" | "emotes" | "settings" | "garage" | "character" | "places" | "note" | "music";

export type HudState = {
  loading: { done: boolean; progress: number; label: string };
  mode: Mode;
  location: string;
  speedKmh: number;
  gear: "D" | "R" | "N" | "P";
  altitude: number;
  throttle: number;
  prompt: string | null;
  toast: string | null;
  partnerHere: boolean;
  partnerDistance: number | null;
  partnerMode: Mode | null;
  clock: string;
  fps: number;
  panel: Panel;
  view: "third" | "first" | "action" | "drone";
  quality: Quality;
  character: string; // ModelId — string so we can add locals without circular imports
  markers: { id: string; x: number; z: number; by: string; label: string }[];
  trainInfo: string | null;
  /** null = live shared day/night cycle; otherwise a fixed hour (e.g. 18.4 for sunset). */
  hourOverride: number | null;
  soundOn: boolean;
  waypoint: null | { x: number; z: number; label: string };
  /** Name of the date spot you're both at, or null. */
  date: string | null;
  /** null = shared live weather; otherwise forced for this device. */
  weatherOverride: null | "clear" | "rain" | "harmattan";
  /** A love note you just walked up to (shown as a card). */
  foundNote: null | { id: string; body: string; place: string | null };
};

const isServer = typeof window === "undefined";
function guessQuality(): Quality {
  if (isServer) return "medium";
  try {
    const saved = localStorage.getItem("justus:quality");
    if (saved === "low" || saved === "medium" || saved === "high") return saved;
  } catch {}
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const touch = matchMedia("(pointer: coarse)").matches;
  if (touch || mem <= 3 || navigator.hardwareConcurrency <= 4) return "low";
  return mem >= 8 ? "high" : "medium";
}

let state: HudState = {
  loading: { done: false, progress: 0, label: "Preparing the city" },
  mode: "walk",
  location: "",
  speedKmh: 0,
  gear: "P",
  altitude: 0,
  throttle: 0,
  prompt: null,
  toast: null,
  partnerHere: false,
  partnerDistance: null,
  partnerMode: null,
  clock: "",
  fps: 0,
  panel: null,
  view: "third",
  quality: guessQuality(),
  character: "amara",
  markers: [],
  trainInfo: null,
  hourOverride: null,
  soundOn: true,
  waypoint: null,
  date: null,
  weatherOverride: null,
  foundNote: null,
};
const listeners = new Set<() => void>();

export const hud = {
  get: () => state,
  set(patch: Partial<HudState>) {
    let changed = false;
    for (const k in patch) if ((patch as Record<string, unknown>)[k] !== (state as Record<string, unknown>)[k]) changed = true;
    if (!changed) return;
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toastHud(text: string, ms = 2600) {
  hud.set({ toast: text });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hud.set({ toast: null }), ms);
}

export function useHud<T>(pick: (s: HudState) => T): T {
  return useSyncExternalStore(hud.subscribe, () => pick(state), () => pick(state));
}

export const QUALITY = {
  low: { dpr: 1, shadows: false, shadowSize: 0, treeShare: 0.45, vegDistance: 450, vegShadows: false, far: 1400, fog: [250, 1300], terrainSegments: 160, antialias: false },
  medium: { dpr: 1.25, shadows: true, shadowSize: 1024, treeShare: 0.8, vegDistance: 800, vegShadows: false, far: 2200, fog: [400, 2100], terrainSegments: 224, antialias: true },
  high: { dpr: 1.75, shadows: true, shadowSize: 2048, treeShare: 1, vegDistance: 1300, vegShadows: true, far: 3000, fog: [600, 2900], terrainSegments: 288, antialias: true },
} as const;
