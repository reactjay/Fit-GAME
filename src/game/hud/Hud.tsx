"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSendBurst } from "@/components/ui/bursts";
import { toast } from "@/components/ui/toast";
import { BURSTS } from "@/content/gifts";
import { db } from "@/lib/db/client";
import { uploadMedia } from "@/lib/upload";
import { cn, errorMessage } from "@/lib/utils";
import { useWorld } from "@/lib/world-context";
import { emote } from "../actors/Player";
import { capture } from "../Game";
import { input, take } from "../input";
import { live } from "../shared";
import { QUALITY, hud, toastHud, useHud, type Panel } from "../store";
import { DATE_SPOTS, DISTRICTS, ISLAND, HILLS, LANDMARKS, LIFT, SITES, terrainHeight, WATER } from "../world/layout";
import { surfaceHeight } from "../world/roadHeights";
import { ChatPanel } from "./ChatPanel";
import { fireworks } from "../world/Fireworks";
import { hideNote, notes } from "../notes";
import { useStreak } from "@/lib/streak";
import { isSoundEnabled, setSoundEnabled, sfx } from "@/lib/sound";
import { parseMusicUrl } from "@/lib/music";
import { MAP_PX, mapImage, toMap } from "./mapImage";

const glass = "bg-[#0d0a1c]/75 text-white backdrop-blur-md border border-white/10";

// ── places (kept 100% intact: all dates, landmarks, airport) ──────────────
const landmark = (id: string) => LANDMARKS.find((l) => l.id === id)!;
export type Place = { id: string; label: string; emoji: string; x: number; z: number; y?: number; group: string };
export const PLACES: Place[] = [
  ...DATE_SPOTS.map((s) => ({ id: s.id, label: s.name, emoji: s.emoji, x: s.x, z: s.z - 4, y: s.y + 0.5, group: "Date spots" })),
  { id: "balogun",  label: "Balogun Market",           emoji: "🛍️", x: SITES.balogun.x,         z: SITES.balogun.z,         group: "Markets" },
  { id: "yaba",     label: "Yaba Tech Market",         emoji: "💻", x: SITES.yabaMarket.x,      z: SITES.yabaMarket.z,      group: "Markets" },
  { id: "theatre",  label: "National Theatre",         emoji: "🎭", x: SITES.nationalTheatre.x, z: SITES.nationalTheatre.z, group: "Landmarks" },
  { id: "tbs",      label: "Tafawa Balewa Square",     emoji: "🏟️", x: SITES.tbs.x,             z: SITES.tbs.z,             group: "Landmarks" },
  { id: "gateway",  label: "Gateway Arch",             emoji: "🌉", x: SITES.gateway.x,         z: SITES.gateway.z,         group: "Landmarks" },
  { id: "pier",     label: "Marina Jetty",             emoji: "⚓", x: landmark("pier").x,      z: landmark("pier").z,      group: "Hangouts" },
  { id: "lookout",  label: "Ikorodu Lookout",          emoji: "⛰️", x: landmark("lookout").x,   z: landmark("lookout").z,   group: "Hangouts" },
  ...(LIFT ? [{ id: "lift", label: "Skyline tower lift", emoji: "🛗", x: LIFT.x, z: LIFT.z + 2, group: "Hangouts" }] : []),
  { id: "airport",  label: "Murtala Muhammed Airport", emoji: "✈️", x: -1200,                  z: -700,                    group: "Transport" },
  { id: "car-park", label: "Car park (your Ferrari)",  emoji: "🏎️", x: 1160,                   z: 878,                     group: "Transport" },
];

export function Hud({ meName, partnerName }: { meName: string; partnerName: string | null }) {
  const loading = useHud((s) => s.loading);
  const panel = useHud((s) => s.panel);
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(matchMedia("(pointer: coarse)").matches), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input,textarea")) return;
      if (e.key.toLowerCase() === "m") hud.set({ panel: hud.get().panel === "map" ? null : "map" });
      if (e.key === "Escape") hud.set({ panel: null });
      if (e.key.toLowerCase() === "t" && !hud.get().panel) {
        e.preventDefault();
        hud.set({ panel: "chat" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  void meName;

  if (!loading.done) return <LoadingScreen progress={loading.progress} label={loading.label} />;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 font-sans text-white select-none" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <TopLeft partnerName={partnerName} />
      <TopRight />
      <StreetSign />
      <DateBanner />
      <Prompt touch={touch} />
      <BottomLeft />
      <BottomCenter />
      <Dashboard />
      <Toast />
      <FoundNote partnerName={partnerName} />
      <Flash />
      {touch && <TouchControls />}
      {panel && (
        <PanelShell panel={panel}>
          {panel === "chat" && <ChatPanel />}
          {panel === "map" && <WorldMap />}
          {panel === "emotes" && <Emotes />}
          {panel === "settings" && <Settings />}
          {panel === "character" && <CharacterEditor />}
          {panel === "places" && <Places />}
          {panel === "note" && <NotePanel />}
          {panel === "music" && <MusicPanel />}
        </PanelShell>
      )}
    </div>
  );
}

function LoadingScreen({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-end bg-[radial-gradient(ellipse_at_bottom,#3a1f4f,#0d0a1c_70%)] pb-[18vh] text-white">
      <div className="mb-2 font-display text-3xl tracking-wide">Lagos</div>
      <div className="mb-6 text-sm text-white/60">{label}…</div>
      <div className="h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-[#e2bd78] to-[#e8789a] transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-2 text-xs tabular-nums text-white/50">{progress}%</div>
    </div>
  );
}

function TopLeft({ partnerName }: { partnerName: string | null }) {
  const fps = useFps();
  const here = useHud((s) => s.partnerHere);
  const dist = useHud((s) => s.partnerDistance);
  const pmode = useHud((s) => s.partnerMode);
  const { connection } = useWorld();
  const verb = pmode === "car" ? "driving" : pmode === "jet" ? "flying" : pmode === "train" ? "on train" : pmode === "bus" ? "in danfo" : pmode === "passenger" ? "riding" : "on foot";

  return (
    <div className="pointer-events-auto absolute left-2.5 sm:left-3 top-2.5 sm:top-3 flex items-center gap-2" style={{ marginTop: "env(safe-area-inset-top)" }}>
      <div className="flex items-center gap-2 sm:gap-2.5 rounded-2xl border border-white/10 bg-black/75 px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-2xl backdrop-blur-md">
        <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-[#f59e0b] font-display text-xs font-black text-black shadow">
          LU
        </div>
        <div className="hidden sm:flex flex-col leading-tight">
          <div className="flex items-center gap-1.5 font-display text-xs font-bold text-white">
            <span>JustUs Lagos</span>
          </div>
          <div className="text-[10px] text-white/50">
            three.js · WebGL · <span className="font-mono text-emerald-400 font-semibold">{fps || 60} fps</span>
          </div>
        </div>
      </div>

      {partnerName && (
        <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] backdrop-blur-md">
          <span className={cn("h-2 w-2 rounded-full", connection !== "connected" ? "bg-amber-400" : here ? "bg-emerald-400 animate-pulse" : "bg-white/30")} />
          <span className="text-white/80">
            {connection !== "connected" ? "Reconnecting…" : here ? `${partnerName} · ${dist !== null && dist < 15 ? "right here" : `${dist}m`} · ${verb}` : `${partnerName} away`}
          </span>
        </div>
      )}
    </div>
  );
}

function TopRight() {
  const panel = useHud((s) => s.panel);
  const hour = useHud((s) => s.hourOverride);
  const { world, me } = useWorld();
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  const toggle = (p: Panel) => hud.set({ panel: panel === p ? null : p });

  const cycleTime = () => {
    const hours = [null, 6.6, 13, 18.1, 22]; // Live, Sunrise, Noon, Golden Hour, Night
    const idx = hours.indexOf(hour);
    const next = hours[(idx + 1) % hours.length];
    hud.set({ hourOverride: next });
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
  };

  const cycleCamera = () => {
    const views: ("third" | "action" | "first" | "drone")[] = ["third", "action", "first", "drone"];
    const cur = hud.get().view;
    const next = views[(views.indexOf(cur) + 1) % views.length];
    hud.set({ view: next });
  };

  const hourLabel =
    hour === 18.1 ? "Golden Hour" : hour === 13 ? "Noon Sun" : hour === 6.6 ? "Sunrise" : hour === 22 ? "Night Stars" : "Live Sky";

  return (
    <div className="pointer-events-auto absolute right-2.5 sm:right-3 top-2.5 sm:top-3 flex items-center gap-1 sm:gap-1.5" style={{ marginTop: "env(safe-area-inset-top)" }}>
      <div className="flex items-center gap-1 sm:gap-1.5 rounded-full border border-white/10 bg-black/75 p-1 sm:px-2.5 sm:py-1.5 shadow-2xl backdrop-blur-md text-xs">
        {/* Time of Day */}
        <button
          onClick={cycleTime}
          className="flex items-center gap-1 rounded-full bg-white/10 px-2 sm:px-2.5 py-1 text-xs font-medium text-white hover:bg-white/20 active:scale-95 transition"
          title="Change time of day (Golden Hour, Noon, Sunset, Night)"
        >
          <span>{hour === 22 ? "🌙" : hour === 18.1 ? "🌅" : hour === 13 ? "☀️" : "🌤️"}</span>
          <span className="hidden sm:inline font-semibold">{hourLabel}</span>
        </button>

        {/* Teleport / Places Dropdown */}
        <button
          onClick={() => toggle("places")}
          className={cn("flex items-center gap-1 rounded-full px-2 sm:px-2.5 py-1 text-xs font-semibold transition active:scale-95", panel === "places" ? "bg-[#f59e0b] text-black" : "text-white/90 hover:bg-white/10")}
          title="Teleport to dating spots, landmarks, airport"
        >
          <span>📍</span>
          <span className="hidden md:inline">Teleport</span>
          <span className="hidden md:inline text-[10px] opacity-60">⌵</span>
        </button>

        {/* Full World Map Toggle */}
        <button
          onClick={() => toggle("map")}
          className={cn("flex items-center gap-1 rounded-full px-2 sm:px-2.5 py-1 text-xs font-semibold transition active:scale-95", panel === "map" ? "bg-[#f59e0b] text-black" : "text-white/90 hover:bg-white/10")}
          title="Open World Map (M)"
        >
          <span>🗺️</span>
          <span className="hidden md:inline">Map</span>
          <kbd className="hidden sm:inline rounded bg-white/15 px-1 py-0.2 text-[9px] font-mono">M</kbd>
        </button>

        {/* Sound Toggle (desktop) */}
        <button
          onClick={toggleSound}
          className="hidden sm:grid h-7 w-7 place-items-center rounded-full text-sm text-white/80 hover:bg-white/10 active:scale-95 transition"
          title={soundOn ? "Mute sound" : "Unmute sound"}
        >
          {soundOn ? "🔊" : "🔇"}
        </button>

        {/* Camera angle toggle */}
        <button
          onClick={cycleCamera}
          className="grid h-7 w-7 place-items-center rounded-full text-sm text-white/80 hover:bg-white/10 active:scale-95 transition"
          title="Cycle camera angle (V)"
        >
          📹
        </button>

        {/* Chat Panel */}
        <button
          onClick={() => toggle("chat")}
          className={cn("grid h-7 w-7 place-items-center rounded-full text-sm transition active:scale-95", panel === "chat" ? "bg-[#e8789a] text-white" : "text-white/80 hover:bg-white/10")}
          title="Chat with partner (T)"
        >
          💬
        </button>

        {/* Music / Audiomack Panel */}
        <button
          onClick={() => toggle("music")}
          className={cn("grid h-7 w-7 place-items-center rounded-full text-sm transition active:scale-95", panel === "music" ? "bg-[#f59e0b] text-black" : "text-white/80 hover:bg-white/10")}
          title="Audiomack & Music Player"
        >
          🎵
        </button>

        {/* Photo Capture (desktop) */}
        <button
          onClick={() => takePhoto(world.id, me.id)}
          className="hidden sm:grid h-7 w-7 place-items-center rounded-full text-sm text-white/80 hover:bg-white/10 active:scale-95 transition"
          title="Take couple photo"
        >
          📸
        </button>

        {/* Emotes & Fireworks */}
        <button
          onClick={() => toggle("emotes")}
          className={cn("grid h-7 w-7 place-items-center rounded-full text-sm transition active:scale-95", panel === "emotes" ? "bg-[#e8789a] text-white" : "text-white/80 hover:bg-white/10")}
          title="Emotes & fireworks"
        >
          💞
        </button>

        {/* Settings (desktop) */}
        <button
          onClick={() => toggle("settings")}
          className={cn("hidden sm:grid h-7 w-7 place-items-center rounded-full text-sm transition active:scale-95", panel === "settings" ? "bg-[#f59e0b] text-black" : "text-white/80 hover:bg-white/10")}
          title="Settings"
        >
          ⚙️
        </button>

        {/* Return home */}
        <Link
          href="/home"
          aria-label="Return home to apartment"
          title="Return home to apartment"
          className="grid h-7 w-7 place-items-center rounded-full text-sm text-rose hover:bg-rose/20 active:scale-95 transition"
        >
          ⏏
        </Link>
      </div>
    </div>
  );
}


function StreetSign() {
  const location = useHud((s) => s.location);
  return (
    <div className="pointer-events-none absolute left-2.5 sm:left-4 top-13 sm:top-auto sm:bottom-52 z-20 flex items-center gap-1.5" style={{ marginTop: "env(safe-area-inset-top)" }}>
      <div className="rounded-md border border-white/80 bg-[#0d5c3a] px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-white shadow-md uppercase tracking-wider">
        {location || "Victoria Island"}
      </div>
      <div className="hidden sm:block rounded-md border border-white/80 bg-[#0d5c3a] px-2.5 py-0.5 text-[11px] font-bold text-white shadow-md uppercase tracking-wider">
        Lekki–Epe Expy
      </div>
    </div>
  );
}

function BottomLeft() {
  const ref = useRef<HTMLCanvasElement>(null);
  const waypointLabel = useHud((s) => s.waypoint?.label ?? null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 120) return;
      last = t;
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext("2d")!;
      const W = c.width;
      const [px, py] = toMap(live.me.pos.x, live.me.pos.z);
      ctx.drawImage(mapImage(), px - W / 2, py - W / 2, W, W, 0, 0, W, W);

      // Player dot
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(W / 2, W / 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Heading arrow
      const heading = -live.cameraYaw + Math.PI;
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(W / 2, W / 2);
      ctx.lineTo(W / 2 + Math.sin(heading) * 12, W / 2 + Math.cos(heading) * 12);
      ctx.stroke();

      // Partner dot
      if (live.partner && Date.now() - live.partner.seen < 6000) {
        const [kpx, kpy] = toMap(live.partner.shown.x, live.partner.shown.z);
        const relX = kpx - (px - W / 2);
        const relY = kpy - (py - W / 2);
        if (relX >= 0 && relX <= W && relY >= 0 && relY <= W) {
          ctx.fillStyle = "#e8789a";
          ctx.beginPath();
          ctx.arc(relX, relY, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="hidden sm:block pointer-events-auto absolute bottom-4 left-4 z-20" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      {/* Minimap card */}
      <button
        onClick={() => hud.set({ panel: "map" })}
        aria-label="Toggle full map (M)"
        className="relative h-44 w-44 overflow-hidden rounded-2xl border border-white/15 bg-black/75 shadow-2xl backdrop-blur-md transition hover:border-white/30 active:scale-95"
      >
        <canvas ref={ref} width={300} height={300} className="h-full w-full" />
        <div className="absolute left-2 top-2 font-mono text-[10px] font-bold text-white/60">
          N
        </div>
        <div className="absolute right-2 top-2 rounded bg-black/60 px-1 py-0.5 font-mono text-[9px] text-white/50">
          M
        </div>
        {waypointLabel && (
          <div className="absolute inset-x-1 bottom-1 truncate rounded bg-black/80 px-1.5 py-0.5 text-center text-[9px] font-medium text-[#e2bd78]">
            📍 {waypointLabel}
          </div>
        )}
      </button>
    </div>
  );
}

function BottomCenter() {
  const mode = useHud((s) => s.mode);

  const switchMode = (target: "walk" | "drive" | "danfo" | "fly") => {
    if (target === "walk") {
      if (live.me.vehicle) {
        live.send({ type: "seat", vehicle: live.me.vehicle, seat: "driver", action: "release" });
      }
      live.me.mode = "walk";
      hud.set({ mode: "walk" });
      toastHud("🚶 On foot together");
    } else if (target === "drive") {
      const spot = PLACES.find((p) => p.id === "car-park") ?? { x: 1160, z: 878, y: 3 };
      const y = spot.y ?? (surfaceHeight(spot.x, spot.z) + 1.2);
      live.teleport = { x: spot.x, y, z: spot.z };
      toastHud("🚕 Near your Ferrari — press E or Tap to drive!");
    } else if (target === "danfo") {
      const spot = PLACES.find((p) => p.id === "theatre") ?? { x: SITES.nationalTheatre.x, z: SITES.nationalTheatre.z, y: 3 };
      const y = spot.y ?? (surfaceHeight(spot.x, spot.z) + 1.2);
      live.teleport = { x: spot.x, y, z: spot.z };
      toastHud("🚌 Danfo & Rail Station — hop on!");
    } else if (target === "fly") {
      const spot = PLACES.find((p) => p.id === "airport") ?? { x: -1200, z: -700, y: 12 };
      live.teleport = { x: spot.x, y: spot.y ?? 12, z: spot.z };
      toastHud("✈️ Murtala Muhammed Airport — Jet ready!");
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (take("mode:walk")) switchMode("walk");
      if (take("mode:drive")) switchMode("drive");
      if (take("mode:danfo")) switchMode("danfo");
      if (take("mode:fly")) switchMode("fly");
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const hint =
    mode === "jet"
      ? "W S Throttle · ↑ ↓ Pitch · A D Rudder · Space Brakes · V Cockpit · E Leave"
      : mode === "car"
        ? "W S Drive / Reverse · A D Steer · B Horn · Drag Orbit"
        : mode === "train" || mode === "bus" || mode === "passenger"
          ? "Drag to Look · V View · E Get Off"
          : "W A S D Move · Shift Sprint · Space Jump · Drag Orbit";

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-2 sm:bottom-4 z-20 flex flex-col items-center gap-1.5" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      {/* Hint pill */}
      <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-1 text-[11px] text-white/70 shadow-lg backdrop-blur-md">
        {hint}
      </div>

      {/* Mode Switcher pill matching Slop New York */}
      <div className="flex items-center gap-1 rounded-full border border-white/15 bg-black/85 p-1 shadow-2xl backdrop-blur-md">
        <button
          onClick={() => switchMode("walk")}
          className={cn(
            "flex items-center gap-1 sm:gap-1.5 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs transition active:scale-95",
            mode === "walk" ? "bg-[#f59e0b] font-extrabold text-black shadow-md" : "font-semibold text-white/70 hover:bg-white/10 hover:text-white"
          )}
          title="Walk on foot [1]"
        >
          <span>🚶</span>
          <span>Walk</span>
          <span className={cn("hidden sm:inline text-[10px]", mode === "walk" ? "text-black/60" : "text-white/40")}>1</span>
        </button>

        <button
          onClick={() => switchMode("drive")}
          className={cn(
            "flex items-center gap-1 sm:gap-1.5 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs transition active:scale-95",
            mode === "car" ? "bg-[#f59e0b] font-extrabold text-black shadow-md" : "font-semibold text-white/70 hover:bg-white/10 hover:text-white"
          )}
          title="Drive car [2]"
        >
          <span>🚕</span>
          <span>Drive</span>
          <span className={cn("hidden sm:inline text-[10px]", mode === "car" ? "text-black/60" : "text-white/40")}>2</span>
        </button>

        <button
          onClick={() => switchMode("danfo")}
          className={cn(
            "flex items-center gap-1 sm:gap-1.5 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs transition active:scale-95",
            mode === "bus" || mode === "train" ? "bg-[#f59e0b] font-extrabold text-black shadow-md" : "font-semibold text-white/70 hover:bg-white/10 hover:text-white"
          )}
          title="Danfo & Rail [3]"
        >
          <span>🚌</span>
          <span className="hidden xs:inline">Danfo</span>
          <span className={cn("hidden sm:inline text-[10px]", mode === "bus" || mode === "train" ? "text-black/60" : "text-white/40")}>3</span>
        </button>

        <button
          onClick={() => switchMode("fly")}
          className={cn(
            "flex items-center gap-1 sm:gap-1.5 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs transition active:scale-95",
            mode === "jet" ? "bg-[#f59e0b] font-extrabold text-black shadow-md" : "font-semibold text-white/70 hover:bg-white/10 hover:text-white"
          )}
          title="Fly airliner jet [4]"
        >
          <span>✈️</span>
          <span>Fly</span>
          <span className={cn("hidden sm:inline text-[10px]", mode === "jet" ? "text-black/60" : "text-white/40")}>4</span>
        </button>
      </div>
    </div>
  );
}

function Prompt({ touch }: { touch: boolean }) {
  const prompt = useHud((s) => s.prompt);
  const trainInfo = useHud((s) => s.trainInfo);
  return (
    <div className="absolute inset-x-0 bottom-28 flex flex-col items-center gap-2 sm:bottom-20 z-20">
      {trainInfo && <div className={cn(glass, "rounded-full px-3 py-1 text-xs")}>🚆 {trainInfo}</div>}
      {prompt && (
        <button className={cn(glass, "pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-semibold active:scale-95 shadow-xl")} onClick={() => input.pressed.add("interact")}>
          <span className="grid h-7 min-w-7 place-items-center rounded-full bg-[#f59e0b] px-1.5 text-xs font-bold text-black">{touch ? "Tap" : "E"}</span>
          {prompt}
        </button>
      )}
    </div>
  );
}

function DateBanner() {
  const date = useHud((s) => s.date);
  if (!date) return null;
  return (
    <div className="absolute inset-x-0 bottom-44 flex justify-center sm:bottom-28 z-20">
      <div className="animate-pulse rounded-full border border-[#e8789a]/40 bg-gradient-to-r from-[#e8789a]/80 to-[#9b5de5]/80 px-4 py-1.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(232,120,154,0.5)] backdrop-blur-md">
        💞 Date night · {date}
      </div>
    </div>
  );
}

function Dashboard() {
  const speed = useHud((s) => s.speedKmh);
  const gear = useHud((s) => s.gear);
  const mode = useHud((s) => s.mode);
  const alt = useHud((s) => s.altitude);
  const view = useHud((s) => s.view);
  const maxSpeed = mode === "jet" ? 400 : 220;
  const speedPercent = Math.min(100, Math.round((speed / maxSpeed) * 100));

  const viewLabels: Record<string, string> = {
    third: "3rd-Person Chase",
    action: "Low-Angle Action",
    first: "Cockpit View",
    drone: "Drone Vantage",
  };

  const cycleCamera = (dir: 1 | -1 = 1) => {
    const views: ("third" | "action" | "first" | "drone")[] = ["third", "action", "first", "drone"];
    const cur = hud.get().view;
    const idx = views.indexOf(cur);
    const next = views[(idx + dir + views.length) % views.length];
    hud.set({ view: next });
  };

  const title =
    mode === "car"
      ? "LAGOS FERRARI 458"
      : mode === "bus"
        ? "LAGOS DANFO BUS"
        : mode === "train"
          ? "LAGOS BLUE RAIL"
          : mode === "jet"
            ? "LAGOS AIRLINER"
            : "COUPLE ON FOOT";

  return (
    <>
      {/* Mobile compact speed badge when in vehicle */}
      {mode !== "walk" && (
        <div className="sm:hidden pointer-events-none absolute bottom-24 right-5 z-20 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/85 px-3 py-1 shadow-xl backdrop-blur-md" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
          <span className="font-display text-base font-black tabular-nums text-white">{speed}</span>
          <span className="text-[9px] font-bold text-white/60 uppercase">KM/H</span>
          {mode === "car" && <span className="rounded bg-gold/20 px-1 py-0.2 text-[9px] text-gold font-bold">{gear}</span>}
          {mode === "jet" && <span className="text-[9px] tabular-nums text-white/50">{alt}m</span>}
        </div>
      )}

      {/* Desktop telemetry cluster */}
      <div className="hidden sm:flex pointer-events-auto absolute bottom-4 right-4 z-20 flex-col items-end gap-2" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex w-56 sm:w-60 flex-col gap-2 rounded-2xl border border-white/10 bg-black/80 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/50">
            <span>{title}</span>
            {mode === "car" && <span className="rounded bg-gold/20 px-1.5 py-0.2 text-gold font-bold">{gear}</span>}
            {mode === "jet" && <span className="tabular-nums">Alt {alt}m</span>}
          </div>

          {/* Big Speed Display */}
          <div className="flex items-baseline gap-1.5 font-display text-4xl font-extrabold tabular-nums tracking-tight text-white">
            <span>{speed}</span>
            <span className="text-xs font-sans font-semibold text-white/50 uppercase">KM/H</span>
          </div>

          {/* Horizontal Speed Line */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-[#f59e0b] to-rose transition-all duration-150"
              style={{ width: `${speedPercent}%` }}
            />
          </div>

          {/* Bottom Camera Angle Cycle */}
          <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-2 text-xs">
            <button
              onClick={() => cycleCamera(-1)}
              className="px-1.5 text-white/40 hover:text-white transition active:scale-95"
              title="Previous camera view"
            >
              ‹
            </button>
            <button
              onClick={() => cycleCamera(1)}
              className="flex items-center gap-1.5 font-medium text-white/80 hover:text-white transition active:scale-95"
              title="Cycle camera angle (V)"
            >
              <span>📹</span>
              <span className="truncate max-w-[110px]">{viewLabels[view] ?? "Camera"}</span>
              <kbd className="rounded bg-white/15 px-1 py-0.2 font-mono text-[9px] text-white/50">V</kbd>
            </button>
            <button
              onClick={() => cycleCamera(1)}
              className="px-1.5 text-white/40 hover:text-white transition active:scale-95"
              title="Next camera view"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Toast() {
  const t = useHud((s) => s.toast);
  if (!t) return null;
  return <div className={cn(glass, "absolute left-1/2 top-16 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm z-30")}>{t}</div>;
}

function TouchControls() {
  const mode = useHud((s) => s.mode);
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stickId = useRef<number | null>(null);
  const R = 44;

  const move = (e: React.PointerEvent) => {
    if (stickId.current !== e.pointerId || !base.current) return;
    const r = base.current.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob({ x: dx, y: dy });
    input.stick.x = dx / R;
    input.stick.y = dy / R;
  };

  const end = (e: React.PointerEvent) => {
    if (stickId.current !== e.pointerId) return;
    stickId.current = null;
    setKnob({ x: 0, y: 0 });
    input.stick.x = input.stick.y = 0;
  };

  const hold = (k: keyof typeof input.held) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      input.held[k] = true;
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      input.held[k] = false;
    },
    onPointerLeave: () => (input.held[k] = false),
    onPointerCancel: () => (input.held[k] = false),
  });

  return (
    <>
      {/* Joystick on bottom-left */}
      <div
        ref={base}
        className="pointer-events-auto absolute bottom-6 left-5 h-26 w-26 touch-none rounded-full border border-white/25 bg-black/45 shadow-2xl backdrop-blur-md z-20"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        onPointerDown={(e) => {
          e.stopPropagation();
          stickId.current = e.pointerId;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Move joystick"
      >
        <div
          className="absolute left-1/2 top-1/2 h-11 w-11 rounded-full bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>

      {/* Action buttons on bottom-right */}
      <div
        className="pointer-events-auto absolute bottom-6 right-5 flex items-end gap-2.5 z-20"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {mode === "walk" && (
          <>
            <button
              {...hold("sprint")}
              className={cn(glass, "h-12 w-12 rounded-full text-[10px] font-bold active:scale-95 shadow-xl")}
            >
              RUN
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                input.pressed.add("jump");
              }}
              className={cn(glass, "h-14 w-14 rounded-full text-[11px] font-bold active:scale-95 shadow-xl bg-white/20")}
            >
              JUMP
            </button>
          </>
        )}
        {mode === "car" && (
          <>
            <button
              {...hold("brake")}
              className={cn(glass, "h-12 w-12 rounded-full text-[10px] font-bold bg-rose/80 text-white active:scale-95 shadow-xl")}
            >
              REV
            </button>
            <button
              {...hold("throttleUp")}
              className={cn(glass, "h-14 w-14 rounded-full text-[11px] font-bold bg-emerald-600/90 text-white active:scale-95 shadow-xl")}
            >
              GAS
            </button>
          </>
        )}
        {mode === "jet" && (
          <>
            <button
              {...hold("throttleDown")}
              className={cn(glass, "h-12 w-12 rounded-full text-base font-bold active:scale-95 shadow-xl")}
            >
              −
            </button>
            <button
              {...hold("throttleUp")}
              className={cn(glass, "h-14 w-14 rounded-full text-base font-bold active:scale-95 shadow-xl bg-emerald-600/90 text-white")}
            >
              +
            </button>
          </>
        )}
      </div>
    </>
  );
}

function PanelShell({ panel, children }: { panel: Exclude<Panel, null>; children: React.ReactNode }) {
  const titles: Record<Exclude<Panel, null>, string> = { chat: "Chat", map: "Lagos", emotes: "Emotes & gifts", settings: "Settings", garage: "Vehicles", character: "Your character", places: "Go to…", note: "Leave a love note", music: "Audiomack & Music" };
  return (
    <div className={cn(glass, "pointer-events-auto absolute bottom-3 left-3 right-3 top-auto max-h-[62dvh] overflow-hidden rounded-2xl sm:bottom-auto sm:left-auto sm:right-[200px] sm:top-3 sm:w-[360px]", panel === "map" && "sm:w-[560px]", panel === "music" && "sm:w-[420px]")}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="text-sm font-semibold">{titles[panel]}</div>
        <button onClick={() => hud.set({ panel: null })} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10">
          ✕
        </button>
      </div>
      <div className="max-h-[calc(62dvh-44px)] overflow-y-auto">{children}</div>
    </div>
  );
}

function WorldMap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { broadcast, partner } = useWorld();
  const markers = useHud((s) => s.markers);
  const waypoint = useHud((s) => s.waypoint);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const S = MAP_PX / 4000;

    ctx.drawImage(mapImage(), 0, 0);

    // District label overlays
    const districts: [string, number, number][] = [
      ...DISTRICTS.filter((d) => d.rect).map((d) => [d.name.split(",")[0], (d.rect!.x0 + d.rect!.x1) / 2, (d.rect!.z0 + d.rect!.z1) / 2] as [string, number, number]),
      ["Tarkwa Bay", ISLAND.x, ISLAND.z + ISLAND.r * 0.6],
      ["Ikorodu", HILLS.x, HILLS.z],
    ];
    ctx.font = "bold 13px system-ui";
    ctx.textAlign = "center";
    for (const [name, wx, wz] of districts) {
      const x = (wx + 2000) * S, y = (wz + 2000) * S;
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillText(name.toUpperCase(), x, y);
    }

    // Date spots: a heart for each
    ctx.font = "16px system-ui";
    for (const d of DATE_SPOTS) {
      const [x, y] = toMap(d.x, d.z);
      ctx.fillText("💗", x + 14, y + 6);
    }

    // Landmark dots with labels
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    for (const l of LANDMARKS) {
      const [x, y] = toMap(l.x, l.z);
      const color = l.kind === "romance" ? "#e8789a" : l.kind === "transport" ? "#7ad4e8" : "#9b7de8";
      // Glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Label shadow + text
      ctx.fillStyle = "rgba(0,0,0,.7)";
      ctx.fillText(l.name, x + 1, y - 9);
      ctx.fillStyle = "#fff";
      ctx.fillText(l.name, x, y - 10);
    }

    // Dropped pins
    for (const m of markers) {
      const [x, y] = toMap(m.x, m.z);
      ctx.fillStyle = "#e2bd78";
      ctx.beginPath();
      ctx.arc(x, y - 11, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y - 8);
      ctx.lineTo(x + 4, y - 8);
      ctx.closePath();
      ctx.fill();
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillText(m.label, x + 1, y - 21);
      ctx.fillStyle = "#e2bd78";
      ctx.fillText(m.label, x, y - 22);
    }

    // Waypoint destination (gold star pin)
    if (waypoint) {
      const [wx, wy] = toMap(waypoint.x, waypoint.z);
      ctx.fillStyle = "#e2bd78";
      ctx.shadowColor = "#e2bd78";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(wx, wy - 12, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#1a1030";
      ctx.font = "bold 10px system-ui";
      ctx.fillText("★", wx, wy - 9);
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx - 5, wy - 7);
      ctx.lineTo(wx + 5, wy - 7);
      ctx.closePath();
      ctx.fillStyle = "#e2bd78";
      ctx.fill();
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,.7)";
      ctx.fillText(waypoint.label, wx + 1, wy - 25);
      ctx.fillStyle = "#e2bd78";
      ctx.fillText(waypoint.label, wx, wy - 26);
    }

    // Partner dot with name
    if (live.partner && Date.now() - live.partner.seen < 6000) {
      const [qx, qy] = toMap(live.partner.shown.x, live.partner.shown.z);
      ctx.shadowColor = "#e8789a";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#e8789a";
      ctx.beginPath();
      ctx.arc(qx, qy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(qx, qy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (partner?.display_name) {
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(0,0,0,.65)";
        ctx.fillText(partner.display_name, qx + 1, qy - 13);
        ctx.fillStyle = "#e8789a";
        ctx.fillText(partner.display_name, qx, qy - 14);
      }
    }

    // My dot
    const [px, py] = toMap(live.me.pos.x, live.me.pos.z);
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#1a1030";
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [markers, waypoint, partner?.display_name]);

  const drop = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 4000 - 2000;
    const z = ((e.clientY - r.top) / r.height) * 4000 - 2000;
    const near = LANDMARKS.find((l) => Math.hypot(l.x - x, l.z - z) < 120);
    const label = near ? near.name : "Meet me here";
    broadcast("game:marker", { x: Math.round(x), z: Math.round(z), label });
    hud.set({ markers: [...hud.get().markers.filter((m) => m.by !== live.me.id), { id: live.me.id, x, z, by: live.me.id, label }] });
    toastHud(`📌 Pin shared: ${label}`);
  };

  return (
    <div className="space-y-2 p-2">
      <canvas ref={ref} width={MAP_PX} height={MAP_PX} onClick={drop} className="w-full cursor-crosshair rounded-xl" />
      <div className="flex flex-wrap gap-2 px-1 text-[11px] text-white/50">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#e8789a]" /> Romantic spots</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#9b7de8]" /> Landmarks</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#7ad4e8]" /> Transport</span>
        <span className="ml-auto">Tap to drop a shared pin</span>
      </div>
    </div>
  );
}

function Emotes() {
  const sendBurst = useSendBurst();
  const { broadcast } = useWorld();
  const play = (a: "wave" | "clap" | "sit") => {
    if (live.me.mode !== "walk") return toastHud("Emotes work on foot");
    emote.anim = a;
    emote.until = performance.now() / 1000 + (a === "sit" ? 3600 : 5);
    hud.set({ panel: null });
  };
  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-3 gap-2">
        {([["wave", "👋", "Wave"], ["clap", "👏", "Clap"], ["sit", "🪑", "Sit down"]] as const).map(([id, e, l]) => (
          <button key={id} onClick={() => play(id)} className="rounded-xl bg-white/10 py-3 text-sm hover:bg-white/20">
            <div className="text-2xl">{e}</div>
            {l}
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          fireworks.until = performance.now() + 30_000;
          broadcast("game:fireworks", {});
          hud.set({ panel: null });
          toastHud("🎆 Fireworks for you two!");
        }}
        className="w-full rounded-xl bg-gradient-to-r from-[#e8789a] to-[#9b5de5] py-3 text-sm font-semibold hover:brightness-110"
      >
        🎆 Set off fireworks over Lagos
      </button>
      <div className="text-[11px] text-white/60">Send a burst to their screen</div>
      <div className="flex flex-wrap gap-2">
        {BURSTS.map((b) => (
          <button key={b} onClick={() => sendBurst(b)} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-xl hover:scale-110">
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── character data ──────────────────────────────────────────────────
const CHARACTER_DEFS = [
  { id: "amara",  label: "Amara",  role: "Business woman",   emoji: "👩🏾‍💼", gender: "f" },
  { id: "kofi",   label: "Kofi",   role: "Smart casual",     emoji: "👨🏾‍💼", gender: "m" },
  { id: "emeka",  label: "Emeka",  role: "Hoodie guy",       emoji: "🧑🏿‍🦱", gender: "m" },
  { id: "musa",   label: "Musa",   role: "Construction worker", emoji: "👷🏿", gender: "m" },
  { id: "tunde",  label: "Tunde",  role: "Leather jacket",   emoji: "🧥", gender: "m" },
  { id: "chidi",  label: "Chidi",  role: "Footballer",       emoji: "⚽", gender: "m" },
  { id: "ngozi",  label: "Ngozi",  role: "Nurse",            emoji: "👩🏿‍⚕️", gender: "f" },
  { id: "bisi",   label: "Bisi",   role: "Black dress",      emoji: "👗", gender: "f" },
] as const;
type CharacterId = (typeof CHARACTER_DEFS)[number]["id"];

function CharacterEditor() {
  const current = useHud((s) => s.character) as CharacterId;
  const set = (id: CharacterId) => {
    try { localStorage.setItem("justus:character", id); } catch {}
    hud.set({ character: id });
    hud.set({ panel: null });
  };
  return (
    <div className="p-3">
      <p className="mb-3 text-[11px] text-white/50">Pick who you want to be in Lagos. Your partner sees your choice in real time.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CHARACTER_DEFS.map((c) => (
          <button
            key={c.id}
            onClick={() => set(c.id)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition active:scale-95",
              current === c.id
                ? "border-[#e8789a] bg-[#e8789a]/20 text-white"
                : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
            )}
          >
            <span className="text-3xl">{c.emoji}</span>
            <span className="text-sm font-semibold">{c.label}</span>
            <span className="text-[10px] text-white/50">{c.role}</span>
            {current === c.id && <span className="text-[10px] font-bold text-[#e8789a]">✓ You</span>}
          </button>
        ))}
      </div>
    </div>
  );
}



function Places() {
  const groups = ["Date spots", "Markets", "Landmarks", "Hangouts", "Transport"];
  const go = (p: Place) => {
    const { x, z, label } = p;
    const y = p.y ?? (surfaceHeight(x, z) + 1.2);
    live.teleport = { x, y, z, ry: 0 };
    live.waypoint = { x, z, label };
    hud.set({ panel: null, waypoint: { x, z, label } });
    toastHud(`📍 Going to ${label}…`);
  };
  return (
    <div className="space-y-4 p-3">
      {groups.map((g) => {
        const spots = PLACES.filter((p) => p.group === g);
        return (
          <div key={g}>
            <div className="mb-1.5 text-[11px] uppercase tracking-wider text-white/40">{g}</div>
            <div className="space-y-1">
              {spots.map((s) => (
                <button
                  key={s.id}
                  onClick={() => go(s)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-left transition hover:bg-white/10 active:scale-95"
                >
                  <span className="text-xl">{s.emoji}</span>
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="ml-auto text-[11px] text-white/30">→</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const flash = { at: 0 };
/** A camera-flash blink when you take a photo. */
function Flash() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let last = 0;
    const t = setInterval(() => {
      if (flash.at !== last) {
        last = flash.at;
        setOn(true);
        setTimeout(() => setOn(false), 180);
      }
    }, 50);
    return () => clearInterval(t);
  }, []);
  return <div className={cn("pointer-events-none absolute inset-0 bg-white transition-opacity duration-200", on ? "opacity-80" : "opacity-0")} />;
}

function NotePanel() {
  const { world, me, partner } = useWorld();
  const location = useHud((s) => s.location);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = notes.list.filter((n) => n.author_id === me.id);
  const save = async () => {
    if (!body.trim() || busy) return;
    if (live.me.mode !== "walk") return toastHud("Get out and stand where you want to hide it");
    setBusy(true);
    try {
      await hideNote(world.id, me.id, body, location || "Lagos");
      sfx.sent();
      toastHud(`💌 Hidden at ${location || "this spot"} — ${partner?.display_name ?? "your partner"} will find it when they walk here`, 4500);
      hud.set({ panel: null });
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 p-3">
      <p className="text-[12px] text-white/60">Write something sweet. It stays hidden right here{location ? ` at ${location}` : ""} until {partner?.display_name ?? "your partner"} walks up to it.</p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 280))}
        rows={4}
        placeholder="I still think about our first date every time I pass here…"
        className="w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-white/30 focus:border-[#e8789a] focus:outline-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] tabular-nums text-white/40">{body.length}/280</span>
        <button disabled={!body.trim() || busy} onClick={save} className="rounded-full bg-gradient-to-r from-[#e8789a] to-[#9b5de5] px-4 py-2 text-sm font-semibold disabled:opacity-40">
          💌 Hide it here
        </button>
      </div>
      {mine.length > 0 && (
        <div className="border-t border-white/10 pt-2 text-[11px] text-white/50">
          {mine.length} {mine.length === 1 ? "note is" : "notes are"} still waiting to be found{mine[0].place ? ` (e.g. at ${mine[0].place})` : ""}.
        </div>
      )}
    </div>
  );
}

function FoundNote({ partnerName }: { partnerName: string | null }) {
  const note = useHud((s) => s.foundNote);
  const { world, me } = useWorld();
  const [saved, setSaved] = useState(false);
  if (!note) return null;
  const close = () => {
    setSaved(false);
    hud.set({ foundNote: null });
  };
  const keep = async () => {
    const { error } = await db().from("memories").insert({ world_id: world.id, author_id: me.id, kind: "letter", title: `💌 A note found at ${note.place ?? "a secret spot"}`.slice(0, 120), body: note.body });
    if (error) return toast(errorMessage(error), "error");
    setSaved(true);
    sfx.reward();
  };
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm animate-[pop_.35s_ease-out] rounded-3xl bg-gradient-to-b from-[#fff4f7] to-[#ffe3ec] p-6 text-center text-[#3a1530] shadow-2xl">
        <div className="text-5xl">💌</div>
        <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-[#c2476e]">A love note from {partnerName ?? "your partner"}</div>
        {note.place && <div className="text-[11px] text-[#3a1530]/50">found at {note.place}</div>}
        <p className="mt-4 whitespace-pre-wrap font-display text-lg leading-snug">{note.body}</p>
        <div className="mt-6 flex gap-2">
          <button onClick={keep} disabled={saved} className="flex-1 rounded-full bg-[#c2476e] py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {saved ? "Kept in our vault ✓" : "Keep in our vault"}
          </button>
          <button onClick={close} className="rounded-full bg-black/5 px-5 py-2.5 text-sm font-semibold">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Settings() {
  const quality = useHud((s) => s.quality);
  const character = useHud((s) => s.character) as CharacterId;
  const hour = useHud((s) => s.hourOverride);
  const view = useHud((s) => s.view);
  const weather = useHud((s) => s.weatherOverride);
  const fps = useFps();
  const opt = (active: boolean) => cn("rounded-lg px-3 py-1.5 text-xs font-semibold", active ? "bg-white text-[#1a1030]" : "bg-white/10");
  const charDef = CHARACTER_DEFS.find((c) => c.id === character) ?? CHARACTER_DEFS[0];
  return (
    <div className="space-y-4 p-3 text-sm">
      <Row label="Character">
        <button
          className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
          onClick={() => hud.set({ panel: "character" })}
        >
          <span>{charDef.emoji}</span> {charDef.label} <span className="text-white/50">↗</span>
        </button>
      </Row>
      <Row label="Graphics">
        {(Object.keys(QUALITY) as (keyof typeof QUALITY)[]).map((q) => (
          <button key={q} className={opt(quality === q)} onClick={() => {
            try { localStorage.setItem("justus:quality", q); } catch {}
            hud.set({ quality: q });
          }}>
            {q[0].toUpperCase() + q.slice(1)}
          </button>
        ))}
      </Row>
      <Row label="Time of day">
        {([[null, "Live"], [6.6, "Sunrise"], [13, "Noon"], [18.1, "Sunset"], [22, "Night"]] as const).map(([h, l]) => (
          <button key={l} className={opt(hour === h)} onClick={() => hud.set({ hourOverride: h })}>
            {l}
          </button>
        ))}
      </Row>
      <Row label="Weather">
        {([[null, "Live"], ["clear", "☀️ Clear"], ["rain", "🌧️ Rain"], ["harmattan", "🌫️ Harmattan"]] as const).map(([w, l]) => (
          <button key={l} className={opt(weather === w)} onClick={() => hud.set({ weatherOverride: w })}>
            {l}
          </button>
        ))}
      </Row>
      <Row label="Camera">
        {(["third", "first"] as const).map((v) => (
          <button key={v} className={opt(view === v)} onClick={() => hud.set({ view: v })}>
            {v === "third" ? "Third person" : "First person"}
          </button>
        ))}
      </Row>
      <p className="text-[11px] text-white/50">
        {fps} fps · “Live” time and weather are shared, so you both see the same sky. Characters: Microsoft Rocketbox (MIT). Car: Ferrari 458 by vicent091036 (CC-BY 4.0). Textures & sky: Poly Haven (CC0).
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function useFps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0, raf = 0, start = performance.now();
    const tick = (t: number) => {
      frames++;
      if (t - start > 1000) {
        setFps(Math.round((frames * 1000) / (t - start)));
        frames = 0;
        start = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

/** Captures the current view and sends it to the shared chat as a photo memory. */
async function takePhoto(worldId: string, userId: string) {
  if (!capture.photo) return;
  const blob = await capture.photo();
  if (!blob) return toast("Couldn't capture the view.", "error");
  try {
    flash.at = performance.now();
    hud.set({ toast: "📸 Saving to your memory vault…" });
    sfx.pop();
    const place = hud.get().location || "Lagos";
    const { path } = await uploadMedia({ worldId, userId, blob, kind: "image" });
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await db().from("memories").insert({ world_id: worldId, author_id: userId, kind: "photo", title: `📍 ${place}`.slice(0, 120), body: "A moment together in Lagos 💞", media_path: path, occurred_on: today });
    if (error) throw error;
    toastHud(`📸 Saved to your memory vault · ${place}`);
  } catch (e) {
    toast(errorMessage(e), "error");
  }
}

function MusicPanel() {
  const [url, setUrl] = useState("https://audiomack.com/asake/song/active");
  const [inputVal, setInputVal] = useState("");
  const info = parseMusicUrl(url);

  const presets = [
    { title: "Asake - Active", url: "https://audiomack.com/asake/song/active", artist: "Asake ft. Travis Scott" },
    { title: "Burna Boy - City Boys", url: "https://audiomack.com/burnaboy/song/city-boys", artist: "Burna Boy" },
    { title: "Rema - Calm Down", url: "https://audiomack.com/rema/song/calm-down", artist: "Rema" },
    { title: "Davido - Unavailable", url: "https://audiomack.com/davido/song/unavailable", artist: "Davido ft. Musa Keys" },
    { title: "Ayra Starr - Rush", url: "https://audiomack.com/ayrastarr/song/rush", artist: "Ayra Starr" },
    { title: "Wizkid - Essence", url: "https://audiomack.com/wizkid/song/essence", artist: "Wizkid ft. Tems" },
  ];

  const handleCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    const parsed = parseMusicUrl(inputVal.trim());
    if (!parsed) {
      toastHud("Paste a valid Audiomack, Spotify, or YouTube link");
      return;
    }
    setUrl(inputVal.trim());
    setInputVal("");
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      {/* Current player */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
        {info?.embed ? (
          <iframe
            src={info.embed}
            title="Music Player"
            height={info.height || 252}
            className="w-full border-0"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          />
        ) : (
          <div className="p-4 text-center text-white/60">
            <p>Paste an Audiomack song or album link below</p>
          </div>
        )}
      </div>

      {/* Custom song link input */}
      <form onSubmit={handleCustom} className="flex gap-1.5">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Paste Audiomack or Spotify song URL…"
          className="flex-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder-white/40 focus:border-[#f59e0b] focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-[#f59e0b] px-3 py-1.5 font-bold text-black active:scale-95 transition"
        >
          Play
        </button>
      </form>

      {/* Trending Afrobeats Presets */}
      <div>
        <div className="mb-1.5 font-bold uppercase tracking-wider text-white/50 text-[10px]">Trending Hits</div>
        <div className="grid grid-cols-2 gap-1.5">
          {presets.map((p) => (
            <button
              key={p.title}
              onClick={() => setUrl(p.url)}
              className={cn(
                "flex flex-col items-start rounded-lg border p-2 text-left transition active:scale-95",
                url === p.url ? "border-[#f59e0b] bg-[#f59e0b]/15 text-white" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
              )}
            >
              <span className="font-semibold truncate w-full">{p.title}</span>
              <span className="text-[10px] text-white/50 truncate w-full">{p.artist}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
