"use client";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { db } from "@/lib/db/client";
import { sfx } from "@/lib/sound";

export type Streak = { streak: number; today: boolean; awarded: number; points: number };

let pending: Promise<Streak | null> | null = null;
let last: Streak | null = null;

/** Checks in once per app session and returns your shared daily streak. */
export function useStreak(onPoints?: (points: number) => void) {
  const [s, setS] = useState<Streak | null>(last);
  useEffect(() => {
    pending ??= db()
      .rpc("check_in", {})
      .then(({ data, error }) => {
        if (error || !data) return null;
        const r = data as Streak;
        if (r.awarded > 0) {
          sfx.reward();
          toast(`🔥 ${r.streak}-day streak together! +✦${r.awarded}`, "gold");
        }
        return (last = r);
      });
    let alive = true;
    pending.then((r) => {
      if (!alive || !r) return;
      setS(r);
      onPoints?.(r.points);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return s;
}
