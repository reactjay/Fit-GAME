"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { live } from "../shared";
import { toastHud } from "../store";
import { hands } from "./Player";

const HEART_COUNT = 18;
const SPAWN_RADIUS = 0.6;
const RISE_SPEED = 0.5;
const LIFE = 3.0; // seconds

type Particle = { x: number; y: number; z: number; age: number; maxAge: number; dx: number; dz: number };

/** Floating heart sprites that appear between the two players when they're within 6 m. */
export function RomanceAura() {
  const meshRef = useRef<THREE.Points>(null);

  const { geometry, particles } = useMemo(() => {
    const pts = Array.from({ length: HEART_COUNT }, (): Particle => ({
      x: 0, y: -999, z: 0, age: Math.random() * LIFE, maxAge: LIFE * (0.8 + Math.random() * 0.4),
      dx: (Math.random() - 0.5) * 0.2, dz: (Math.random() - 0.5) * 0.2,
    }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(HEART_COUNT * 3), 3));
    geo.setAttribute("opacity", new THREE.BufferAttribute(new Float32Array(HEART_COUNT), 1));
    return { geometry: geo, particles: pts };
  }, []);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: new THREE.Color("#e8789a"),
        size: 0.28,
        transparent: true,
        opacity: 1,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const p = live.partner;
    const active = p && Date.now() - p.seen < 6000 && live.me.pos.distanceTo(p.shown) < 6;
    const mid = active
      ? new THREE.Vector3().addVectors(live.me.pos, p!.shown).multiplyScalar(0.5)
      : new THREE.Vector3(0, -999, 0);

    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const opa = geometry.attributes.opacity as THREE.BufferAttribute;

    for (let i = 0; i < HEART_COUNT; i++) {
      const pt = particles[i];
      pt.age += dt;
      if (pt.age > pt.maxAge) {
        // Re-spawn around midpoint
        pt.age = 0;
        pt.maxAge = LIFE * (0.8 + Math.random() * 0.4);
        pt.x = mid.x + (Math.random() - 0.5) * SPAWN_RADIUS * 2;
        pt.y = mid.y + 0.2 + Math.random() * 0.4;
        pt.z = mid.z + (Math.random() - 0.5) * SPAWN_RADIUS * 2;
        pt.dx = (Math.random() - 0.5) * 0.15;
        pt.dz = (Math.random() - 0.5) * 0.15;
      }
      if (active) {
        pt.y += RISE_SPEED * dt;
        pt.x += pt.dx * dt;
        pt.z += pt.dz * dt;
      } else {
        pt.x = 0; pt.y = -999; pt.z = 0;
      }
      const t = pt.age / pt.maxAge;
      // Bell-curve opacity: 0 → 1 → 0
      const o = active ? Math.sin(t * Math.PI) : 0;
      pos.setXYZ(i, pt.x, pt.y, pt.z);
      opa.setX(i, o);
    }
    pos.needsUpdate = true;
    opa.needsUpdate = true;
    // Drive opacity via material (averaged) — individual per-vertex opacity needs a custom shader,
    // so we pulse the whole material with the average.
    const avg = particles.reduce((s, pt) => s + Math.sin((pt.age / pt.maxAge) * Math.PI), 0) / HEART_COUNT;
    material.opacity = active ? Math.max(0.1, avg * 0.9) : 0;
  });

  return <points ref={meshRef} geometry={geometry} material={material} />;
}

/** A soft glowing link between your hands while you walk side by side. */
export function HandLink({ partnerName }: { partnerName: string | null }) {
  const ref = useRef<THREE.Mesh>(null);
  const was = useRef(false);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const p = live.partner;
    const here = p && Date.now() - p.seen < 3000 && p.target.mode === "walk" && live.me.mode === "walk";
    const d = here ? live.me.pos.distanceTo(p!.shown) : Infinity;
    const moving = live.me.anim === "walk" || live.me.anim === "run" || p?.target.anim === "walk" || p?.target.anim === "run";
    const on = d > 0.4 && d < 1.25 && moving;
    m.visible = on;
    if (on !== was.current) {
      if (on && partnerName && !hands.toasted) {
        hands.toasted = true;
        toastHud(`🤝 Walking hand in hand with ${partnerName}`);
      }
      was.current = on;
    }
    if (!on) return;
    // Meet at hand height, a little in from each shoulder.
    a.copy(live.me.pos).lerp(p!.shown, 0.28).setY(live.me.pos.y + 0.92);
    b.copy(p!.shown).lerp(live.me.pos, 0.28).setY(p!.shown.y + 0.92);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.set(1, a.distanceTo(b), 1);
    m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  });
  return (
    <mesh ref={ref} visible={false}>
      <cylinderGeometry args={[0.025, 0.025, 1, 6]} />
      <meshBasicMaterial color="#ff9fbe" transparent opacity={0.85} toneMapped={false} />
    </mesh>
  );
}
const UP = new THREE.Vector3(0, 1, 0);
