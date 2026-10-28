"use client";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { worldSeconds } from "../shared";
import { sweep, textTexture } from "./geometry";
import { Near } from "./Near";
import { RAIL, RAIL_GAUGE, ROADS, STATIONS, railAt, terrainHeight, trainState } from "./layout";
import { roadHeights } from "./Roads";

export const PLATFORM = { length: 150, width: 6, height: 1.1, offset: 3.6 };

/** Track centreline as 3D points (rail top = y + 0.35 over the sleepers). */
function trackPath() {
  return RAIL.pts.map(([x, z], i) => new THREE.Vector3(x, RAIL.heights[i], z));
}

/** Where a road crosses the railway (for level crossings). */
export const CROSSINGS = (() => {
  const out: { x: number; z: number; heading: number; s: number }[] = [];
  for (const r of ROADS) {
    if (r.kind === "runway" || r.kind === "taxiway") continue;
    const ys = roadHeights(r);
    for (let i = 1; i < r.points.length; i++) {
      const [ax, az] = r.points[i - 1], [bx, bz] = r.points[i];
      for (let j = 1; j < RAIL.pts.length; j += 1) {
        const [cx, cz] = RAIL.pts[j - 1], [dx, dz] = RAIL.pts[j];
        const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
        if (Math.abs(den) < 1e-9) continue;
        const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
        const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        // Only true at-grade crossings (road and track within ~1.5 m of each other).
        const railY = RAIL.heights[j];
        if (Math.abs(ys[i] - railY) > 1.5) continue;
        if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 30)) continue;
        out.push({ x, z, heading: Math.atan2(bx - ax, bz - az), s: RAIL.dist[j] });
      }
    }
  }
  return out;
})();

export function Railway({ sleeperStep }: { sleeperStep: number }) {
  const built = useMemo(() => {
    const path = trackPath();
    const g = RAIL_GAUGE / 2;
    const railProfile = (side: number): [number, number][] => [
      [side * g - 0.04, 0.2], [side * g - 0.04, 0.34], [side * g - 0.02, 0.36], [side * g + 0.02, 0.36], [side * g + 0.04, 0.34], [side * g + 0.04, 0.2],
    ];
    const rails = [sweep(path, railProfile(-1), { closed: true }), sweep(path, railProfile(1), { closed: true })];
    const ballast = sweep(path, [[-2.4, -0.3], [-1.6, 0.1], [1.6, 0.1], [2.4, -0.3]], { closed: true, uvScale: 2 });

    // Embankments (fill down to the ground) vs bridges (piers) vs tunnels.
    const piers: THREE.Matrix4[] = [];
    const tunnelRuns: THREE.Vector3[][] = [];
    let run: THREE.Vector3[] | null = null;
    path.forEach((p, i) => {
      const ground = terrainHeight(p.x, p.z);
      const gap = p.y - ground;
      if (gap > 3.5 && i % 4 === 0) {
        const next = path[(i + 1) % path.length];
        const ang = Math.atan2(next.x - p.x, next.z - p.z);
        piers.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, (p.y + ground) / 2 - 0.4, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(3.2, p.y - ground, 1.6)));
      }
      if (ground - p.y > 5) {
        run ??= [];
        run.push(p);
      } else if (run) {
        if (run.length > 3) tunnelRuns.push(run);
        run = null;
      }
    });
    if (run && (run as THREE.Vector3[]).length > 3) tunnelRuns.push(run);
    const tunnelProfile: [number, number][] = [];
    for (let k = 0; k <= 16; k++) {
      const a = Math.PI - (k / 16) * Math.PI;
      tunnelProfile.push([Math.cos(a) * 4.6, Math.sin(a) * 5.4 - 0.3]);
    }
    const tunnels = tunnelRuns.map((r) => sweep(r, tunnelProfile, { uvScale: 3 }));
    const portals = tunnelRuns.flatMap((r) => [r[0], r[r.length - 1]]).map((p, i) => ({ p, i }));
    // Steel side girders only where the track is on a bridge.
    const deckPts = path.map((p) => (p.y - terrainHeight(p.x, p.z) > 3.5 ? p : null));
    const deckRuns: THREE.Vector3[][] = [];
    let cur: THREE.Vector3[] = [];
    deckPts.forEach((p) => {
      if (p) cur.push(p);
      else if (cur.length) {
        if (cur.length > 2) deckRuns.push(cur);
        cur = [];
      }
    });
    if (cur.length > 2) deckRuns.push(cur);
    const girderGeo = deckRuns.flatMap((r) => [sweep(r, [[-2.6, -0.9], [-2.6, 1.2], [-2.4, 1.2], [-2.4, -0.9]]), sweep(r, [[2.4, -0.9], [2.4, 1.2], [2.6, 1.2], [2.6, -0.9]]), sweep(r, [[-2.6, -0.9], [2.6, -0.9], [2.6, -0.4], [-2.6, -0.4]])]);

    // Sleepers, tiled for culling.
    const sleepers = new Map<string, THREE.Matrix4[]>();
    for (let s = 0; s < RAIL.length; s += sleeperStep) {
      const a = railAt(s);
      const k = `${Math.floor(a.x / 600)},${Math.floor(a.z / 600)}`;
      if (!sleepers.has(k)) sleepers.set(k, []);
      sleepers.get(k)!.push(new THREE.Matrix4().compose(new THREE.Vector3(a.x, a.y + 0.14, a.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a.heading), new THREE.Vector3(2.6, 0.14, 0.26)));
    }
    return { rails, ballast, piers, tunnels, portals, girderGeo, sleepers: [...sleepers.values()] };
  }, [sleeperStep]);

  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x8a8d91, metalness: 0.9, roughness: 0.35 }), []);
  const concrete = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xa7a39a, roughness: 0.9 }), []);
  const sleeperMeshes = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6d6a64, roughness: 0.95 });
    return built.sleepers.map((list) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mx, i) => m.setMatrixAt(i, mx));
      m.receiveShadow = true;
      m.computeBoundingSphere();
      return m;
    });
  }, [built.sleepers]);
  const piers = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), concrete, Math.max(1, built.piers.length));
    built.piers.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.count = built.piers.length;
    m.castShadow = true;
    m.computeBoundingSphere();
    return m;
  }, [built.piers, concrete]);

  return (
    <group>
      <mesh geometry={built.ballast} receiveShadow>
        <meshStandardMaterial color={0x7c776e} roughness={1} />
      </mesh>
      {built.rails.map((g, i) => (
        <mesh key={i} geometry={g} material={steel} />
      ))}
      {sleeperMeshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <primitive object={piers} />
      {built.girderGeo.map((g, i) => (
        <mesh key={i} geometry={g} material={concrete} castShadow />
      ))}
      {built.tunnels.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color={0x5e5a55} roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {built.portals.map(({ p }, i) => (
        <mesh key={i} position={[p.x, p.y + 2.5, p.z]}>
          <torusGeometry args={[5.2, 0.8, 8, 20, Math.PI]} />
          <meshStandardMaterial color={0x8c877e} roughness={0.9} />
        </mesh>
      ))}
      {STATIONS.map((s) => {
        const a = railAt(s.s);
        return (
          <Near key={s.id} distance={900} at={[a.x, a.y, a.z]}>
            <Station s={s.s} name={s.name} />
          </Near>
        );
      })}
      {CROSSINGS.map((c, i) => (
        <Near key={i} distance={350} at={[c.x, 2, c.z]}>
          <LevelCrossing {...c} />
        </Near>
      ))}
    </group>
  );
}

/** Platform alongside the track at arc length s (right-hand side), with canopy, sign and ramps. */
export function platformFrame(s: number) {
  const a = railAt(s);
  const right = new THREE.Vector3(Math.cos(a.heading), 0, -Math.sin(a.heading)); // perpendicular to heading
  const center = new THREE.Vector3(a.x, a.y, a.z).addScaledVector(right, PLATFORM.offset);
  return { center, heading: a.heading, right, topY: a.y + PLATFORM.height };
}

function Station({ s, name }: { s: number; name: string }) {
  const f = useMemo(() => platformFrame(s), [s]);
  const sign = useMemo(() => textTexture(name), [name]);
  const rot = new THREE.Euler(0, f.heading, 0);
  const ground = terrainHeight(f.center.x, f.center.z);
  const depth = Math.max(1.2, f.topY - ground + 1);
  const L = PLATFORM.length, W = PLATFORM.width;
  const rampLen = 14;
  const rampDrop = Math.max(0, f.topY - (terrainHeight(f.center.x + Math.sin(f.heading) * (L / 2 + rampLen), f.center.z + Math.cos(f.heading) * (L / 2 + rampLen)) + 0.1));
  const rampAngle = Math.atan2(rampDrop, rampLen);
  return (
    <group position={[f.center.x, 0, f.center.z]} rotation={rot}>
      {/* platform block */}
      <mesh position={[0, f.topY - depth / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[W, depth, L]} />
        <meshStandardMaterial color={0xbab4a8} roughness={0.9} />
      </mesh>
      <mesh position={[-W / 2 + 0.35, f.topY + 0.01, 0]}>
        <boxGeometry args={[0.5, 0.02, L]} />
        <meshStandardMaterial color={0xf2c230} />
      </mesh>
      {/* canopy */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[W / 2 - 1, f.topY + 2, -L / 2 + 15 + i * 15]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 4, 8]} />
          <meshStandardMaterial color={0x2c3e50} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0.4, f.topY + 4.1, 0]} castShadow>
        <boxGeometry args={[W + 1.6, 0.25, L * 0.85]} />
        <meshStandardMaterial color={0x0b5e3b} roughness={0.6} />
      </mesh>
      {[-30, 30].map((z) => (
        <mesh key={z} position={[1.2, f.topY + 3.2, z]} rotation-y={-Math.PI / 2}>
          <planeGeometry args={[6.4, 1]} />
          <meshBasicMaterial map={sign} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
      {/* benches */}
      {[-45, -15, 15, 45].map((z) => (
        <mesh key={z} position={[W / 2 - 1.2, f.topY + 0.45, z]}>
          <boxGeometry args={[0.6, 0.12, 2.6]} />
          <meshStandardMaterial color={0x7a4b2a} roughness={0.8} />
        </mesh>
      ))}
      {/* ramp down at the far end */}
      {rampDrop > 0.2 && (
        <mesh position={[0, f.topY - rampDrop / 2, L / 2 + rampLen / 2]} rotation-x={rampAngle}>
          <boxGeometry args={[W - 1, 0.3, Math.hypot(rampLen, rampDrop)]} />
          <meshStandardMaterial color={0xbab4a8} roughness={0.9} />
        </mesh>
      )}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[W / 2, depth / 2, L / 2]} position={[0, f.topY - depth / 2, 0]} />
        {rampDrop > 0.2 && <CuboidCollider args={[(W - 1) / 2, 0.15, Math.hypot(rampLen, rampDrop) / 2]} position={[0, f.topY - rampDrop / 2, L / 2 + rampLen / 2]} rotation={[rampAngle, 0, 0]} />}
      </RigidBody>
    </group>
  );
}

function LevelCrossing({ x, z, heading, s }: { x: number; z: number; heading: number; s: number }) {
  const arms = useRef<THREE.Group[]>([]);
  const lights = useRef<THREE.MeshStandardMaterial>(null);
  const y = terrainHeight(x, z);
  useFrame(() => {
    const st = trainState(worldSeconds());
    let d = Math.abs(st.s - s);
    d = Math.min(d, RAIL.length - d);
    const closed = d < 260 && st.speed > 0.5 ? 1 : d < 60 ? 1 : 0;
    for (const a of arms.current) if (a) a.rotation.z = THREE.MathUtils.lerp(a.rotation.z, closed ? 0 : Math.PI / 2.2, 0.05);
    if (lights.current) lights.current.emissiveIntensity = closed ? (Math.floor(performance.now() / 500) % 2) * 4 : 0;
  });
  return (
    <group position={[x, y, z]} rotation-y={heading}>
      {[-1, 1].map((side, i) => (
        <group key={side} position={[side * 8, 0, side * 6]}>
          <mesh position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.1, 0.12, 2.8, 8]} />
            <meshStandardMaterial color={0xeeeeee} />
          </mesh>
          <mesh position={[0, 2.5, 0.15]}>
            <sphereGeometry args={[0.16, 10, 10]} />
            <meshStandardMaterial ref={i === 0 ? lights : undefined} color={0x550000} emissive={0xff2a2a} emissiveIntensity={0} />
          </mesh>
          <group position={[0, 1.1, 0]} ref={(g) => void (g && (arms.current[i] = g))} rotation-z={Math.PI / 2.2}>
            <mesh position={[-side * 3.5, 0, 0]}>
              <boxGeometry args={[7, 0.12, 0.12]} />
              <meshStandardMaterial color={0xd72638} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
