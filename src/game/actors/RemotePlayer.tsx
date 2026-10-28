"use client";
import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { live } from "../shared";
import { textTexture } from "../world/geometry";
import { Avatar, type AnimId, type ModelId } from "./Avatar";
import { danfoSeat } from "./Traffic";
import { trainCarPose, trainSeat } from "./Train";

/** The partner's character: interpolated between 12 Hz network updates. */
export function RemotePlayer({ name }: { name: string }) {
  const group = useRef<THREE.Group>(null);
  const [anim, setAnim] = useState<AnimId>("idle");
  const [model, setModel] = useState<ModelId>("kofi");
  const [visible, setVisible] = useState(false);
  const tag = useMemo(() => textTexture(`${name} ♥`, { bg: "rgba(20,12,40,0.72)", w: 512, h: 96, font: "600 52px system-ui, sans-serif" }), [name]);

  useFrame((_, dt) => {
    const p = live.partner;
    const here = Boolean(p && Date.now() - p.seen < 6000);
    // In a car or the jet the vehicle shows them in their seat instead.
    const show = here && p!.target.mode !== "car" && p!.target.mode !== "passenger" && p!.target.mode !== "jet";
    if (show !== visible) setVisible(show);
    if (!p || !group.current) return;
    const t = p.target;
    if (t.model !== model) setModel(t.model as ModelId);
    if (t.mode === "bus" && t.vehicle?.startsWith("danfo:")) {
      const [, id, seat] = t.vehicle.split(":").map(Number);
      const s = danfoSeat(id, seat);
      if (s) {
        p.shown.copy(s.pos).y -= 0.5;
        group.current.rotation.y = s.heading;
      }
      if (anim !== "sit") setAnim("sit");
    } else if (t.mode === "train" && t.vehicle?.startsWith("train:")) {
      // Same timetable on both devices → compute their seat locally (no jitter).
      const [, car, seat] = t.vehicle.split(":").map(Number);
      p.shown.copy(trainSeat(car, seat)).y -= 0.55;
      group.current.rotation.y = trainCarPose(car).heading;
      if (anim !== "sit") setAnim("sit");
    } else {
      const target = new THREE.Vector3(t.x, t.y, t.z);
      if (p.shown.distanceTo(target) > 25) p.shown.copy(target);
      else p.shown.lerp(target, 1 - Math.exp(-dt * 10));
      let d = t.ry - group.current.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      group.current.rotation.y += d * Math.min(1, dt * 10);
      const romance = live.partnerRomance;
      if (romance && Date.now() < romance.until) {
        const ra = (["idle", "walk", "run", "wave", "clap", "sit"].includes(romance.anim) ? romance.anim : "idle") as AnimId;
        if (ra !== anim) setAnim(ra);
      } else {
        if (romance) live.partnerRomance = null;
        const a = (["idle", "walk", "run", "wave", "clap", "sit"].includes(t.anim) ? t.anim : "idle") as AnimId;
        if (a !== anim) setAnim(a);
      }
    }
    group.current.position.copy(p.shown);
  });

  return (
    <group ref={group} visible={visible}>
      <Suspense fallback={null}>
        <Avatar model={model} anim={anim} />
      </Suspense>
      <sprite position={[0, 2.15, 0]} scale={[0.75, 0.14, 1]}>
        <spriteMaterial map={tag} transparent depthTest={false} />
      </sprite>
    </group>
  );
}
