"use client";
import { useTexture } from "@react-three/drei";
import { MeshCollider, RigidBody } from "@react-three/rapier";
import { useMemo } from "react";
import * as THREE from "three";
import { ROADS, WATER, terrainHeight } from "./layout";
import { roadHeights } from "./roadHeights";

export { roadHeights };

type Strip = { pos: number[]; uv: number[]; idx: number[] };
const newStrip = (): Strip => ({ pos: [], uv: [], idx: [] });

function pushRibbon(s: Strip, pts: [number, number][], ys: number[], halfL: number, halfR: number, lift = 0, uvScale = 8) {
  const base = s.pos.length / 3;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    const [x, z] = pts[i];
    const y = ys[i] + lift;
    const lx = x + nx * halfL, lz = z + nz * halfL, rx = x - nx * halfR, rz = z - nz * halfR;
    s.pos.push(lx, y, lz, rx, y, rz);
    s.uv.push(lx / uvScale, lz / uvScale, rx / uvScale, rz / uvScale); // world-space UVs: overlaps look identical
    if (i > 0) {
      const k = base + i * 2;
      s.idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
}

function toGeometry(s: Strip) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(s.uv, 2));
  g.setIndex(s.idx);
  g.computeVertexNormals();
  return g;
}

export function Roads() {
  const [asphalt, asphaltN, paving, pavingN] = useTexture([
    "/assets/textures/asphalt_02_diff.jpg",
    "/assets/textures/asphalt_02_nor.jpg",
    "/assets/textures/brick_pavement_02_diff.jpg",
    "/assets/textures/brick_pavement_02_nor.jpg",
  ]);
  useMemo(() => {
    for (const t of [asphalt, asphaltN, paving, pavingN]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
    }
    asphalt.colorSpace = paving.colorSpace = THREE.SRGBColorSpace;
  }, [asphalt, asphaltN, paving, pavingN]);

  const built = useMemo(() => {
    const road = newStrip();
    const runway = newStrip();
    const walk = newStrip();
    const marks = newStrip();
    const yellow = newStrip();
    const piers: THREE.Matrix4[] = [];
    const rails: THREE.Matrix4[] = [];
    for (const r of ROADS) {
      const ys = roadHeights(r);
      const half = r.width / 2;
      if (r.kind === "runway" || r.kind === "taxiway") {
        pushRibbon(runway, r.points, ys, half, half, 0, 6);
        // Runway centreline dashes and edge lines.
        for (let i = 0; i < r.points.length - 1; i += 2) pushRibbon(r.kind === "runway" ? marks : yellow, r.points.slice(i, i + 2), ys.slice(i, i + 2), 0.45, 0.45, 0.03, 1);
        if (r.kind === "runway") {
          pushRibbon(marks, r.points, ys, half - 1, -(half - 1.8), 0.03, 1);
          pushRibbon(marks, r.points, ys, -(half - 1.8), half - 1, 0.03, 1);
        }
        continue;
      }
      pushRibbon(road, r.points, ys, half, half);
      // Sidewalks (raised, paved) on city roads; curb faces under their edges.
      if (r.kind !== "highway") {
        pushRibbon(walk, r.points, ys, half + 3.2, -half, 0.16, 3);
        pushRibbon(walk, r.points, ys, -half, half + 3.2, 0.16, 3);
      }
      // Lane markings: dashed white centre line; solid yellow edges on highways.
      for (let i = 0; i < r.points.length - 1; i++) {
        if (i % 2 === 0) pushRibbon(r.kind === "highway" ? yellow : marks, r.points.slice(i, i + 2).map(([x, z], k, arr) => (k === 1 ? [lerp2(arr[0][0], x, 0.55), lerp2(arr[0][1], z, 0.55)] : [x, z])) as [number, number][], ys.slice(i, i + 2), 0.12, 0.12, 0.02, 1);
      }
      if (r.kind === "highway") {
        pushRibbon(marks, r.points, ys, half - 0.6, -(half - 0.75), 0.02, 1);
        pushRibbon(marks, r.points, ys, -(half - 0.75), half - 0.6, 0.02, 1);
      }
      // Bridges: piers into the water and concrete parapets along the deck.
      for (let i = 0; i < r.points.length; i++) {
        const [x, z] = r.points[i];
        const ground = terrainHeight(x, z);
        const gap = ys[i] - Math.max(ground, WATER - 3);
        if (gap > 2.5) {
          const a = r.points[Math.max(0, i - 1)], b = r.points[Math.min(r.points.length - 1, i + 1)];
          const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
          if (i % 2 === 0) piers.push(new THREE.Matrix4().compose(new THREE.Vector3(x, (ys[i] + ground) / 2 - 0.6, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(r.width * 0.8, ys[i] - ground, 2.2)));
          for (const side of [-1, 1]) {
            const nx = Math.cos(ang) * side * (half + 0.3), nz = -Math.sin(ang) * side * (half + 0.3);
            rails.push(new THREE.Matrix4().compose(new THREE.Vector3(x + nx, ys[i] + 0.55, z + nz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(0.35, 1.1, 26)));
          }
        }
      }
    }
    return {
      road: toGeometry(road),
      runway: toGeometry(runway),
      walk: toGeometry(walk),
      marks: toGeometry(marks),
      yellow: toGeometry(yellow),
      piers,
      rails,
      // One collider surface for everything drivable (roads + runway + sidewalks).
      collider: mergeForCollider([road, runway, walk]),
    };
  }, []);

  return (
    <group>
      <mesh geometry={built.road} receiveShadow>
        <meshStandardMaterial map={asphalt} normalMap={asphaltN} roughness={0.92} color={0xb8b8b8} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh geometry={built.runway} receiveShadow>
        <meshStandardMaterial map={asphalt} normalMap={asphaltN} roughness={0.85} color={0x8f8f8f} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh geometry={built.walk} receiveShadow>
        <meshStandardMaterial map={paving} normalMap={pavingN} roughness={0.9} color={0xd8cfc4} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh geometry={built.marks}>
        <meshStandardMaterial color={0xf2f2ee} roughness={0.7} polygonOffset polygonOffsetFactor={-4} />
      </mesh>
      <mesh geometry={built.yellow}>
        <meshStandardMaterial color={0xf2c230} roughness={0.7} polygonOffset polygonOffsetFactor={-4} />
      </mesh>
      <Instanced matrices={built.piers} color={0xb9b4aa} />
      <Instanced matrices={built.rails} color={0xd6d2c8} />
      <RigidBody type="fixed" colliders={false} userData={{ kind: "road" }}>
        <MeshCollider type="trimesh">
          <mesh geometry={built.collider} visible={false} />
        </MeshCollider>
      </RigidBody>
    </group>
  );
}

const lerp2 = (a: number, b: number, t: number) => a + (b - a) * t;

function mergeForCollider(strips: Strip[]) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const s of strips) {
    const base = pos.length / 3;
    pos.push(...s.pos);
    for (const i of s.idx) idx.push(i + base);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export function Instanced({ matrices, color, geometry, castShadow }: { matrices: THREE.Matrix4[]; color: number; geometry?: THREE.BufferGeometry; castShadow?: boolean }) {
  const mesh = useMemo(() => {
    const g = geometry ?? new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }), Math.max(1, matrices.length));
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat));
    m.count = matrices.length;
    m.castShadow = Boolean(castShadow);
    m.receiveShadow = true;
    m.computeBoundingSphere();
    return m;
  }, [matrices, color, geometry, castShadow]);
  return <primitive object={mesh} />;
}
