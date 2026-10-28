"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { dateMusic, sfx } from "@/lib/sound";
import { emote } from "../actors/Player";
import { live } from "../shared";
import { hud, toastHud } from "../store";
import { DATE_SPOTS, LIFT, ROOFTOP, terrainHeight, type DateSpot } from "./layout";
import { Near } from "./Near";

const NEAR = 12;
const SIT_OFFSET = 0.5;
/** 0..1 per spot: how lit-up the scene is (both there → 1). Read by the flames and lights. */
const glow: Record<string, number> = {};
const level = (id: string) => glow[id] ?? 0.2;

const seatWorld = (s: DateSpot, i: number) => new THREE.Vector3(s.x + s.seats[i][0], s.y, s.z + s.seats[i][1]);
const partnerHere = () => Boolean(live.partner && Date.now() - live.partner.seen < 6000);

/**
 * Romantic set-pieces around Lagos. Each one glows softly on its own, warms up when you
 * arrive, and fully lights up — with music — when you're both there.
 */
export function DateSpots({ partnerName }: { partnerName: string | null }) {
  const active = useRef<string | null>(null);
  const soloNotice = useRef<string | null>(null);
  const last = useRef(0);

  useEffect(() => {
    const ids: string[] = [];
    const add = (id: string, it: Parameters<typeof live.interactables.set>[1]) => {
      live.interactables.set(id, it);
      ids.push(id);
    };
    for (const s of DATE_SPOTS) {
      s.seats.forEach((seat, i) => {
        const pos = seatWorld(s, i);
        add(`date:${s.id}:seat${i}`, {
          pos: () => pos,
          radius: 2.2,
          label: () => {
            if (live.me.mode !== "walk") return null;
            if (emote.anim === "sit") return null;
            if (partnerHere() && live.partner!.shown.distanceTo(pos) < 0.6) return null;
            return partnerHere() && live.partner!.shown.distanceTo(pos) < NEAR ? "🪑 Sit together" : "🪑 Sit down";
          },
          act: () => {
            // The sit animation drops the hips ~0.5 m behind the feet, so stand that far in front of the seat.
            live.teleport = { x: pos.x + Math.sin(seat[2]) * SIT_OFFSET, y: s.y + 0.05, z: pos.z + Math.cos(seat[2]) * SIT_OFFSET, ry: seat[2] };
            emote.anim = "sit";
            emote.until = performance.now() / 1000 + 3600;
          },
        });
      });
      const centre = new THREE.Vector3(s.x, s.y, s.z);
      add(`date:${s.id}:invite`, {
        pos: () => centre,
        radius: NEAR,
        label: () => {
          if (!partnerName || live.me.mode !== "walk") return null;
          if (partnerHere() && live.partner!.shown.distanceTo(centre) < NEAR) return null;
          if (s.seats.some((_, i) => seatWorld(s, i).distanceTo(live.me.pos) < 2.2)) return null;
          return `💌 Invite ${partnerName} here`;
        },
        act: () => {
          live.pendingMarker = { x: s.x, z: s.z, label: `${s.emoji} ${s.name}` };
          sfx.sent();
          toastHud(`Invite sent — ${partnerName} can see it on the map 💌`);
        },
      });
    }
    if (LIFT && ROOFTOP) {
      const ground = new THREE.Vector3(LIFT.x, terrainHeight(LIFT.x, LIFT.z), LIFT.z);
      const roof = new THREE.Vector3(ROOFTOP.x, ROOFTOP.y, ROOFTOP.z + ROOFTOP.d / 2 - 3);
      add("lift:up", {
        pos: () => ground,
        radius: 2.5,
        label: () => (live.me.mode === "walk" ? "🛗 Lift to the Skyline Rooftop" : null),
        act: () => {
          live.teleport = { x: roof.x, y: roof.y + 0.1, z: roof.z - 1, ry: Math.PI };
          sfx.chime();
        },
      });
      add("lift:down", {
        pos: () => roof,
        radius: 2.5,
        label: () => (live.me.mode === "walk" ? "🛗 Lift down to the street" : null),
        act: () => {
          live.teleport = { x: ground.x, y: ground.y + 0.1, z: ground.z + 1.5, ry: 0 };
          sfx.chime();
        },
      });
    }
    return () => ids.forEach((id) => live.interactables.delete(id));
  }, [partnerName]);

  useEffect(
    () => () => {
      dateMusic.stop();
      hud.set({ date: null });
    },
    [],
  );

  useFrame((state, dt) => {
    const both = partnerHere();
    let together: DateSpot | null = null;
    let solo: DateSpot | null = null;
    for (const s of DATE_SPOTS) {
      const dMe = Math.hypot(live.me.pos.x - s.x, live.me.pos.z - s.z) + Math.abs(live.me.pos.y - s.y) * 0.5;
      const meNear = dMe < NEAR && live.me.mode === "walk";
      const pNear = both && Math.hypot(live.partner!.shown.x - s.x, live.partner!.shown.z - s.z) + Math.abs(live.partner!.shown.y - s.y) * 0.5 < NEAR;
      if (meNear && pNear) together = s;
      else if (meNear) solo = s;
      const target = meNear && pNear ? 1 : meNear || pNear ? 0.45 : 0.2;
      glow[s.id] = THREE.MathUtils.lerp(level(s.id), target, Math.min(1, dt * 1.5));
    }

    if (state.clock.elapsedTime - last.current < 0.25) return;
    last.current = state.clock.elapsedTime;
    const id = together?.id ?? null;
    if (id !== active.current) {
      active.current = id;
      if (together) {
        dateMusic.start(together.kind);
        sfx.romance();
        hud.set({ date: `${together.emoji} ${together.name}` });
        toastHud(`💞 Date night: ${together.name}`, 3500);
      } else {
        dateMusic.stop();
        hud.set({ date: null });
      }
    }
    const soloId = !together && solo ? solo.id : null;
    if (soloId && soloId !== soloNotice.current && partnerName) toastHud(`${solo!.emoji} Set for two — invite ${partnerName} 💌`, 3500);
    soloNotice.current = soloId;
  });

  return (
    <>
      {DATE_SPOTS.map((s) => (
        <Near key={s.id} distance={260} at={[s.x, s.y + 1, s.z]}>
          <group position={[s.x, s.y, s.z]}>
            {s.kind === "sunset" && <Picnic spot={s} />}
            {s.kind === "dinner" && <Dinner spot={s} />}
            {s.kind === "bonfire" && <Bonfire spot={s} />}
          </group>
        </Near>
      ))}
      {LIFT && <LiftDoor />}
    </>
  );
}

// ── shared bits ─────────────────────────────────────────────────────────

function useMats() {
  return useMemo(
    () => ({
      wood: new THREE.MeshStandardMaterial({ color: "#8a5a35", roughness: 0.85 }),
      darkWood: new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.9 }),
      white: new THREE.MeshStandardMaterial({ color: "#f6f1ea", roughness: 0.6 }),
      cloth: new THREE.MeshStandardMaterial({ color: "#fbf6ef", roughness: 0.95 }),
      rose: new THREE.MeshStandardMaterial({ color: "#c2184b", roughness: 0.6 }),
      leaf: new THREE.MeshStandardMaterial({ color: "#2f6b3a", roughness: 0.8 }),
      glass: new THREE.MeshStandardMaterial({ color: "#d9f0ff", roughness: 0.05, transparent: true, opacity: 0.35 }),
      bottle: new THREE.MeshStandardMaterial({ color: "#1d4d2b", roughness: 0.2 }),
      metal: new THREE.MeshStandardMaterial({ color: "#2a2a2e", roughness: 0.4, metalness: 0.7 }),
      stone: new THREE.MeshStandardMaterial({ color: "#7d7a74", roughness: 1 }),
      jollof: new THREE.MeshStandardMaterial({ color: "#d9541e", roughness: 0.9 }),
      plantain: new THREE.MeshStandardMaterial({ color: "#e8a531", roughness: 0.8 }),
    }),
    [],
  );
}

/** A warm emissive material whose brightness follows the spot's glow. */
function useGlowMat(spotId: string, color: string, base = 0.6, peak = 3) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, toneMapped: false }), [color, base]);
  useFrame(() => void (mat.emissiveIntensity = base + (peak - base) * level(spotId)));
  return mat;
}

function Flame({ spotId, position, size = 1 }: { spotId: string; position: [number, number, number]; size?: number }) {
  const ref = useRef<THREE.Group>(null);
  const outer = useGlowMat(spotId, "#ff7a1a", 1, 4);
  const inner = useGlowMat(spotId, "#ffd36b", 1.5, 5);
  const seed = useMemo(() => Math.random() * 100, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * 9 + seed;
    const s = size * (0.45 + 0.55 * level(spotId)) * (1 + 0.12 * Math.sin(t) + 0.06 * Math.sin(t * 2.3));
    ref.current.scale.set(s, s * (1 + 0.15 * Math.sin(t * 1.7)), s);
  });
  return (
    <group ref={ref} position={position}>
      <mesh material={outer} position={[0, 0.06, 0]}>
        <coneGeometry args={[0.05, 0.16, 8]} />
      </mesh>
      <mesh material={inner} position={[0, 0.04, 0]}>
        <coneGeometry args={[0.028, 0.09, 8]} />
      </mesh>
    </group>
  );
}

function WarmLight({ spotId, position, power, distance, flicker = 0 }: { spotId: string; position: [number, number, number]; power: number; distance: number; flicker?: number }) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const f = 1 + flicker * (Math.sin(clock.elapsedTime * 11) * 0.5 + Math.sin(clock.elapsedTime * 7.3) * 0.5);
    ref.current.intensity = power * level(spotId) * f;
  });
  return <pointLight ref={ref} position={position} color="#ffb35c" distance={distance} decay={1.6} intensity={0} />;
}

function Chair({ position, ry, mat }: { position: [number, number, number]; ry: number; mat: THREE.Material }) {
  return (
    <group position={position} rotation-y={ry}>
      <mesh material={mat} position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.5, 0.05, 0.48]} />
      </mesh>
      <mesh material={mat} position={[0, 0.78, -0.23]} castShadow>
        <boxGeometry args={[0.5, 0.62, 0.04]} />
      </mesh>
      {[-0.21, 0.21].flatMap((x) =>
        [-0.2, 0.2].map((z) => (
          <mesh key={`${x}${z}`} material={mat} position={[x, 0.225, z]}>
            <cylinderGeometry args={[0.022, 0.022, 0.45, 6]} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Plate({ position, mats }: { position: [number, number, number]; mats: ReturnType<typeof useMats> }) {
  return (
    <group position={position}>
      <mesh material={mats.white}>
        <cylinderGeometry args={[0.13, 0.11, 0.02, 20]} />
      </mesh>
      <mesh material={mats.jollof} position={[-0.03, 0.025, 0]} scale={[1, 0.45, 1]}>
        <sphereGeometry args={[0.06, 10, 8]} />
      </mesh>
      <mesh material={mats.plantain} position={[0.06, 0.02, 0.03]} rotation-y={0.6} scale={[1, 0.5, 0.5]}>
        <sphereGeometry args={[0.035, 8, 6]} />
      </mesh>
    </group>
  );
}

function Wine({ position, mats }: { position: [number, number, number]; mats: ReturnType<typeof useMats> }) {
  return (
    <group position={position}>
      <mesh material={mats.bottle} position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.26, 10]} />
      </mesh>
      <mesh material={mats.bottle} position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.013, 0.03, 0.1, 8]} />
      </mesh>
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} material={mats.glass} position={[x, 0.07, 0.04]}>
          <cylinderGeometry args={[0.035, 0.012, 0.14, 10]} />
        </mesh>
      ))}
    </group>
  );
}

function Roses({ position, mats }: { position: [number, number, number]; mats: ReturnType<typeof useMats> }) {
  return (
    <group position={position}>
      <mesh material={mats.glass} position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.04, 0.035, 0.16, 10]} />
      </mesh>
      {[[0, 0.22, 0], [0.04, 0.2, 0.02], [-0.035, 0.19, -0.02]].map((p, i) => (
        <mesh key={i} material={mats.rose} position={p as [number, number, number]}>
          <sphereGeometry args={[0.032, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
}

/** Instanced petals / bulbs scattered at given points. */
function Scatter({ points, geometry, material }: { points: [number, number, number, number][]; geometry: THREE.BufferGeometry; material: THREE.Material }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, points.length);
    const q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    points.forEach(([x, y, z, r], i) => m.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, r, 0)), one)));
    m.computeBoundingSphere();
    return m;
  }, [points, geometry, material]);
  return <primitive object={mesh} />;
}

function petals(n: number, r: number, seed: number): [number, number, number, number][] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => {
    const a = rnd() * Math.PI * 2, d = 0.6 + rnd() * r;
    return [Math.cos(a) * d, 0.012, Math.sin(a) * d, rnd() * 6];
  });
}

function checkTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? "#f4ece2" : "#c8324f";
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// ── the scenes ──────────────────────────────────────────────────────────

function Picnic({ spot }: { spot: DateSpot }) {
  const mats = useMats();
  const blanket = useMemo(() => new THREE.MeshStandardMaterial({ map: checkTexture(), roughness: 1 }), []);
  const chair = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2e86c1", roughness: 0.7 }), []);
  const bulb = useGlowMat(spot.id, "#ffcf7a", 0.4, 3.5);
  const lanterns: [number, number][] = [[-1.7, -0.6], [1.7, -0.6], [-1.7, 2.3], [1.7, 2.3]];
  return (
    <group>
      <mesh material={blanket} rotation-x={-Math.PI / 2} position={[0, 0.02, 1.15]} receiveShadow>
        <planeGeometry args={[2.8, 2.0]} />
      </mesh>
      {spot.seats.map((s, i) => (
        <Chair key={i} position={[s[0], 0, s[1]]} ry={s[2]} mat={chair} />
      ))}
      {/* basket */}
      <group position={[0, 0, 1.0]}>
        <mesh material={mats.wood} position={[0, 0.14, 0]} castShadow>
          <boxGeometry args={[0.46, 0.26, 0.3]} />
        </mesh>
        <mesh material={mats.darkWood} position={[0, 0.3, 0]} rotation-y={Math.PI / 2}>
          <torusGeometry args={[0.14, 0.012, 6, 16, Math.PI]} />
        </mesh>
      </group>
      <Plate position={[-0.55, 0.035, 1.35]} mats={mats} />
      <Plate position={[0.55, 0.035, 1.35]} mats={mats} />
      <Wine position={[0, 0.02, 1.55]} mats={mats} />
      <Roses position={[0.95, 0.02, 1.7]} mats={mats} />
      {lanterns.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh material={mats.darkWood} position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.03, 0.04, 1.4, 6]} />
          </mesh>
          <mesh material={bulb} position={[0, 1.48, 0]}>
            <sphereGeometry args={[0.09, 12, 10]} />
          </mesh>
        </group>
      ))}
      <WarmLight spotId={spot.id} position={[0, 1.5, 0.9]} power={6} distance={9} />
    </group>
  );
}

const DINNER_POSTS: [number, number][] = [[-3.2, -3.2], [3.2, -3.2], [3.2, 3.2], [-3.2, 3.2]];
const DINNER_BULBS: [number, number, number, number][] = DINNER_POSTS.flatMap(([ax, az], e) => {
  const [bx, bz] = DINNER_POSTS[(e + 1) % 4];
  return Array.from({ length: 9 }, (_, i) => {
    const t = (i + 1) / 10;
    return [ax + (bx - ax) * t, 2.55 - 0.4 * Math.sin(Math.PI * t), az + (bz - az) * t, 0] as [number, number, number, number];
  });
});

function Dinner({ spot }: { spot: DateSpot }) {
  const mats = useMats();
  const chair = useMemo(() => new THREE.MeshStandardMaterial({ color: "#efe4d2", roughness: 0.6 }), []);
  const bulb = useGlowMat(spot.id, "#ffd894", 0.6, 4);
  const petalGeo = useMemo(() => new THREE.CircleGeometry(0.035, 6).rotateX(-Math.PI / 2), []);
  const bulbGeo = useMemo(() => new THREE.SphereGeometry(0.045, 8, 6), []);
  const petalPts = useMemo(() => petals(60, 2.2, 7), []);
  const corners = DINNER_POSTS;
  const bulbs = DINNER_BULBS;
  return (
    <group>
      {/* table with cloth */}
      <mesh material={mats.cloth} position={[0, 0.38, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.66, 0.76, 24]} />
      </mesh>
      {spot.seats.map((s, i) => (
        <Chair key={i} position={[s[0], 0, s[1]]} ry={s[2]} mat={chair} />
      ))}
      <Plate position={[0, 0.77, -0.32]} mats={mats} />
      <Plate position={[0, 0.77, 0.32]} mats={mats} />
      <Wine position={[0.3, 0.76, 0]} mats={mats} />
      <Roses position={[-0.28, 0.76, 0.05]} mats={mats} />
      {[-0.08, 0.1].map((x, i) => (
        <group key={x} position={[x, 0.76, i ? 0.06 : -0.06]}>
          <mesh material={mats.cloth} position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.18, 8]} />
          </mesh>
          <Flame spotId={spot.id} position={[0, 0.18, 0]} size={0.6} />
        </group>
      ))}
      {/* string lights */}
      {corners.map(([x, z]) => (
        <mesh key={`${x}${z}`} material={mats.metal} position={[x, 1.3, z]}>
          <cylinderGeometry args={[0.03, 0.03, 2.6, 6]} />
        </mesh>
      ))}
      <Scatter points={bulbs} geometry={bulbGeo} material={bulb} />
      <Scatter points={petalPts} geometry={petalGeo} material={mats.rose} />
      <WarmLight spotId={spot.id} position={[0, 1.6, 0]} power={5} distance={10} flicker={0.04} />
    </group>
  );
}

function Bonfire({ spot }: { spot: DateSpot }) {
  const mats = useMats();
  const stones = useMemo(() => Array.from({ length: 9 }, (_, i) => (i / 9) * Math.PI * 2), []);
  const blanket = useMemo(() => new THREE.MeshStandardMaterial({ color: "#7b2d5b", roughness: 1 }), []);
  const torches: [number, number][] = [[-3.2, 1.6], [3.2, 1.6], [0, -3.6]];
  return (
    <group>
      {stones.map((a) => (
        <mesh key={a} material={mats.stone} position={[Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62]} rotation={[a, a * 2, 0]} castShadow>
          <dodecahedronGeometry args={[0.15, 0]} />
        </mesh>
      ))}
      {[0, 1.1, 2.2].map((r) => (
        <mesh key={r} material={mats.darkWood} position={[0, 0.12, 0]} rotation={[0.25, r, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.07, 0.9, 7]} />
        </mesh>
      ))}
      <Flame spotId={spot.id} position={[0, 0.15, 0]} size={4.2} />
      <Flame spotId={spot.id} position={[0.15, 0.15, 0.1]} size={2.8} />
      <Flame spotId={spot.id} position={[-0.14, 0.15, -0.08]} size={3.1} />
      {spot.seats.map((s, i) => (
        <group key={i} position={[s[0], 0, s[1]]} rotation-y={s[2]}>
          <mesh material={mats.wood} position={[0, 0.24, 0]} rotation-z={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.24, 0.26, 1.5, 10]} />
          </mesh>
        </group>
      ))}
      <mesh material={blanket} rotation-x={-Math.PI / 2} position={[0, 0.02, -1.9]}>
        <planeGeometry args={[2.2, 1.1]} />
      </mesh>
      {torches.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh material={mats.darkWood} position={[0, 0.8, 0]}>
            <cylinderGeometry args={[0.035, 0.05, 1.6, 6]} />
          </mesh>
          <Flame spotId={spot.id} position={[0, 1.62, 0]} size={1.6} />
        </group>
      ))}
      <WarmLight spotId={spot.id} position={[0, 1.1, 0]} power={9} distance={14} flicker={0.18} />
    </group>
  );
}

/** A glowing lift door at the base of the rooftop tower. */
function LiftDoor() {
  const sign = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e2bd78", emissive: "#e2bd78", emissiveIntensity: 1.4, toneMapped: false }), []);
  const door = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b8c2cc", metalness: 0.8, roughness: 0.25 }), []);
  if (!LIFT) return null;
  const y = terrainHeight(LIFT.x, LIFT.z);
  return (
    <Near distance={200} at={[LIFT.x, y + 1, LIFT.z]}>
      <group position={[LIFT.x, y, LIFT.z - 1.45]}>
        <mesh material={door} position={[0, 1.15, 0]}>
          <boxGeometry args={[1.8, 2.3, 0.12]} />
        </mesh>
        <mesh material={sign} position={[0, 2.55, 0.02]}>
          <boxGeometry args={[1.2, 0.22, 0.1]} />
        </mesh>
      </group>
    </Near>
  );
}
