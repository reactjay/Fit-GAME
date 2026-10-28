"use client";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { live, worldSeconds } from "../shared";
import { pedestrianPose, type Pedestrian } from "../world/lagos";
import { Avatar, LOCAL_MEN, LOCAL_WOMEN, preloadAvatar, type LocalId } from "./Avatar";
import { crowdShared } from "./Crowd";

// The people closest to you are swapped from instanced stand-ins to full
// skinned Rocketbox avatars. A small fixed pool of slots (some men, some women)
// is re-assigned to the nearest pedestrians a few times a second.

const RADIUS = 38;
type Slot = { model: LocalId; woman: boolean; ped: Pedestrian | null };

export function Locals({ men, women, shadows }: { men: number; women: number; shadows: boolean }) {
  const [slots, setSlots] = useState<Slot[]>(() => [
    ...Array.from({ length: men }, (_, i) => ({ model: LOCAL_MEN[i % LOCAL_MEN.length], woman: false, ped: null })),
    ...Array.from({ length: women }, (_, i) => ({ model: LOCAL_WOMEN[i % LOCAL_WOMEN.length], woman: true, ped: null })),
  ]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const lastPick = useRef(-1);

  useEffect(() => {
    for (const m of [...LOCAL_MEN, ...LOCAL_WOMEN]) preloadAvatar(m);
    const hidden = crowdShared.hidden;
    return () => hidden.clear();
  }, []);

  useFrame((state) => {
    const t = worldSeconds();
    const me = live.me.pos;
    // Re-pick the nearest pedestrians ~4×/s; keep existing assignments that are still close.
    if (state.clock.elapsedTime - lastPick.current > 0.25) {
      lastPick.current = state.clock.elapsedTime;
      const near: { p: Pedestrian; d: number }[] = [];
      for (const p of crowdShared.people) {
        const s = pedestrianPose(p, t);
        const d = Math.hypot(s.x - me.x, s.z - me.z);
        if (d < RADIUS) near.push({ p, d });
      }
      near.sort((a, b) => a.d - b.d);
      const wanted = new Set<number>();
      for (const woman of [false, true]) {
        const n = slots.filter((s) => s.woman === woman).length;
        near.filter((x) => x.p.woman === woman).slice(0, n).forEach((x) => wanted.add(x.p.id));
      }
      let changed = false;
      const next = slots.map((s) => {
        if (s.ped && !wanted.has(s.ped.id)) {
          changed = true;
          return { ...s, ped: null };
        }
        return s;
      });
      const taken = new Set(next.flatMap((s) => (s.ped ? [s.ped.id] : [])));
      for (const { p } of near) {
        if (!wanted.has(p.id) || taken.has(p.id)) continue;
        const i = next.findIndex((s) => !s.ped && s.woman === p.woman);
        if (i < 0) continue;
        next[i] = { ...next[i], ped: p };
        taken.add(p.id);
        changed = true;
      }
      if (changed) setSlots(next);
    }
    // Hide only the stand-ins whose avatar is actually showing this frame.
    crowdShared.hidden.clear();
    slots.forEach((s, i) => {
      const g = groups.current[i];
      if (!g) return;
      g.visible = !!s.ped && g.children.length > 0;
      if (!s.ped || !g.visible) return;
      const pose = pedestrianPose(s.ped, t);
      g.position.set(pose.x, pose.y, pose.z);
      g.rotation.y = pose.heading;
      crowdShared.hidden.add(s.ped.id);
    });
  });

  return (
    <group>
      {slots.map((s, i) => (
        <group key={i} ref={(g) => void (groups.current[i] = g)} visible={false}>
          {s.ped && (
            <Suspense fallback={null}>
              <Avatar model={s.model} anim={s.ped.walking ? "walk" : "idle"} speed={s.ped.speed / 1.35} phase={(s.ped.id * 0.618) % 1} castShadow={shadows} />
            </Suspense>
          )}
        </group>
      ))}
    </group>
  );
}
