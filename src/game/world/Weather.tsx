"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { sfx } from "@/lib/sound";
import { live } from "../shared";
import { toastHud } from "../store";
import { weather } from "../weather";

const DROPS = 1400;
const BOX = 70; // metres of rain around the camera
const FALL = 22;
const wrap = (v: number, centre: number) => {
  const lo = centre - BOX / 2;
  return lo + ((((v - lo) % BOX) + BOX) % BOX);
};

/** Rain streaks around the camera, and a shared umbrella when you stand close in the rain. */
export function Weather({ partnerName }: { partnerName: string | null }) {
  return (
    <>
      <Rain />
      <Umbrella partnerName={partnerName} />
    </>
  );
}

function Rain() {
  const lines = useRef<THREE.LineSegments>(null);
  const { geometry, seeds } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DROPS * 6), 3));
    const s = Float32Array.from({ length: DROPS * 3 }, () => Math.random());
    return { geometry: g, seeds: s };
  }, []);
  const material = useMemo(() => new THREE.LineBasicMaterial({ color: 0xc8d6e6, transparent: true, opacity: 0, depthWrite: false }), []);
  useFrame(({ camera, clock }) => {
    const l = lines.current;
    if (!l) return;
    const r = weather.rain;
    l.visible = r > 0.02;
    if (!l.visible) return;
    (l.material as THREE.LineBasicMaterial).opacity = 0.55 * r;
    const pos = l.geometry.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    const c = camera.position;
    const n = Math.floor(DROPS * r);
    for (let i = 0; i < DROPS; i++) {
      if (i >= n) {
        pos.setXYZ(i * 2, 0, -999, 0);
        pos.setXYZ(i * 2 + 1, 0, -999, 0);
        continue;
      }
      // Drops sit on a world-fixed tiling, wrapped into the box around the camera (so rain doesn't slide as you move).
      const x = wrap(seeds[i * 3] * BOX, c.x), z = wrap(seeds[i * 3 + 1] * BOX, c.z);
      const y = c.y + 25 - ((seeds[i * 3 + 2] * 40 + t * FALL) % 40);
      pos.setXYZ(i * 2, x, y, z);
      pos.setXYZ(i * 2 + 1, x + 0.05, y - 0.7, z + 0.03);
    }
    pos.needsUpdate = true;
  });
  return <lineSegments ref={lines} geometry={geometry} material={material} frustumCulled={false} visible={false} />;
}

function Umbrella({ partnerName }: { partnerName: string | null }) {
  const g = useRef<THREE.Group>(null);
  const shared = useRef(false);
  const canopy = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e8789a", roughness: 0.6, side: THREE.DoubleSide }), []);
  const pole = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3a2a20" }), []);
  useFrame((_, dt) => {
    const u = g.current;
    if (!u) return;
    const p = live.partner;
    const here = p && Date.now() - p.seen < 6000 && p.target.mode === "walk";
    const close = here && live.me.mode === "walk" && live.me.pos.distanceTo(p!.shown) < 2.4;
    const on = Boolean(close && weather.rain > 0.3);
    if (on && !shared.current && partnerName) {
      toastHud(`☔ Sharing an umbrella with ${partnerName} 💞`);
      sfx.chime();
    }
    shared.current = on;
    const target = on ? 1 : 0;
    const s = THREE.MathUtils.lerp(u.scale.x, target, Math.min(1, dt * 6));
    u.scale.setScalar(s);
    u.visible = s > 0.02;
    if (!u.visible || !p) return;
    u.position.set((live.me.pos.x + p.shown.x) / 2, Math.max(live.me.pos.y, p.shown.y) + 2.15, (live.me.pos.z + p.shown.z) / 2);
  });
  return (
    <group ref={g} visible={false} scale={0}>
      <mesh material={canopy} position={[0, 0.15, 0]} castShadow>
        <coneGeometry args={[1.35, 0.45, 12, 1, true]} />
      </mesh>
      <mesh material={pole} position={[0, -0.75, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1.8, 6]} />
      </mesh>
    </group>
  );
}
