"use client";
import { useEffect, useState } from "react";
import { sfx } from "@/lib/sound";
import { useWorld } from "@/lib/world-context";
import { hashString } from "@/lib/utils";

type Burst = { id: number; emoji: string; x: number; delay: number };
let seq = 0;

/** Floating emoji bursts. Sent with sendBurst(); the partner sees them wherever they are in the app. */
export function BurstLayer() {
  const { onBroadcast } = useWorld();
  const [bursts, setBursts] = useState<Burst[]>([]);

  useEffect(() => {
    const spawn = (emoji: string) => {
      const batch = Array.from({ length: 10 }, (_, i) => {
        const id = ++seq;
        return { id, emoji, x: 8 + (hashString(`${id}-${i}`) % 84), delay: i * 0.08 };
      });
      setBursts((b) => [...b.slice(-30), ...batch]);
      setTimeout(() => setBursts((b) => b.filter((x) => !batch.includes(x))), 3200);
    };
    const onLocal = (e: Event) => spawn((e as CustomEvent<string>).detail);
    window.addEventListener("justus:burst", onLocal);
    const off = onBroadcast("burst", (p) => {
      spawn(String(p.emoji ?? "💖").slice(0, 8));
      sfx.chime();
    });
    return () => {
      off();
      window.removeEventListener("justus:burst", onLocal);
    };
  }, [onBroadcast]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {bursts.map((b) => (
        <span key={b.id} className="absolute bottom-0 text-3xl" style={{ left: `${b.x}%`, animation: `rise 2.8s ease-out ${b.delay}s both` }}>
          {b.emoji}
        </span>
      ))}
    </div>
  );
}

export function useSendBurst() {
  const { broadcast } = useWorld();
  return (emoji: string) => {
    window.dispatchEvent(new CustomEvent("justus:burst", { detail: emoji }));
    broadcast("burst", { emoji });
  };
}
