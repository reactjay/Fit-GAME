"use client";
import dynamic from "next/dynamic";

// The 3D world is client-only (WebGL + physics) and loaded on demand.
const Game = dynamic(() => import("@/game/Game"), {
  ssr: false,
  loading: () => <div className="fixed inset-0 grid place-items-center bg-[#0d0a1c] text-sm text-white/60">Opening Port Amara…</div>,
});

export default function CityPage() {
  return <Game />;
}
