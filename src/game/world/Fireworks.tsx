"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { sfx } from "@/lib/sound";
import { live } from "../shared";

/** Fireworks run while performance.now() < until (ms). */
export const fireworks = { until: 0 };

const BURSTS = 6, SPARKS = 140, LIFE = 2.4, GRAVITY = 7;
const PALETTE = ["#ff4d6d", "#ffd23f", "#e8789a", "#7ad4e8", "#9b7de8", "#ffffff", "#5ef08a", "#ff9a3c"];

let sparkTex: THREE.Texture | null = null;
/** Soft round glow so sparks aren't drawn as squares. */
function spark() {
  if (sparkTex) return sparkTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.35, "rgba(255,255,255,0.7)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return (sparkTex = new THREE.CanvasTexture(c));
}

type Burst = { t: number; origin: THREE.Vector3; vel: Float32Array; points: THREE.Points };

export function Fireworks() {
  const next = useRef(0);
  const bursts = useMemo<Burst[]>(
    () =>
      Array.from({ length: BURSTS }, () => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
        const m = new THREE.PointsMaterial({ map: spark(), size: 3.4, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: "#fff", fog: false });
        const points = new THREE.Points(g, m);
        points.frustumCulled = false;
        points.visible = false;
        return { t: -99, origin: new THREE.Vector3(), vel: new Float32Array(SPARKS * 3), points };
      }),
    [],
  );
  const fwd = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    const now = performance.now();
    const t = now / 1000;
    // Launch a new burst every ~0.8 s, out in front of the camera.
    if (now < fireworks.until && t > next.current) {
      next.current = t + 0.5 + Math.random() * 0.7;
      const b = bursts.reduce((o, x) => (x.t < o.t ? x : o));
      camera.getWorldDirection(fwd).setY(0).normalize();
      const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
      b.origin.copy(live.me.pos).addScaledVector(fwd, 140 + Math.random() * 90).addScaledVector(side, (Math.random() - 0.5) * 220);
      b.origin.y = live.me.pos.y + 80 + Math.random() * 70;
      b.t = t;
      const speed = 16 + Math.random() * 10;
      for (let i = 0; i < SPARKS; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        const k = speed * (0.85 + Math.random() * 0.15);
        b.vel.set([Math.cos(a) * r * k, u * k, Math.sin(a) * r * k], i * 3);
      }
      const mat = b.points.material as THREE.PointsMaterial;
      mat.color.set(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
      const dist = b.origin.distanceTo(live.me.pos);
      setTimeout(() => sfx.firework(Math.max(0.25, 1 - dist / 400)), Math.min(900, (dist / 343) * 1000));
    }
    for (const b of bursts) {
      const age = t - b.t;
      b.points.visible = age >= 0 && age < LIFE;
      if (!b.points.visible) continue;
      const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < SPARKS; i++) {
        const drag = (1 - Math.exp(-age * 1.6)) / 1.6;
        pos.setXYZ(i, b.origin.x + b.vel[i * 3] * drag, b.origin.y + b.vel[i * 3 + 1] * drag - 0.5 * GRAVITY * age * age, b.origin.z + b.vel[i * 3 + 2] * drag);
      }
      pos.needsUpdate = true;
      const mat = b.points.material as THREE.PointsMaterial;
      mat.opacity = Math.max(0, 1 - age / LIFE) * (0.85 + 0.15 * Math.sin(age * 40));
    }
  });

  return (
    <group>
      {bursts.map((b, i) => (
        <primitive key={i} object={b.points} />
      ))}
    </group>
  );
}
