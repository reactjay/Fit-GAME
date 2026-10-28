"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { textTexture } from "./geometry";
import { Near } from "./Near";
import { BILLBOARDS, BILLBOARD_TEXTS, BUS_STOPS, KIOSKS, POLES, ROAD_SIGNS, ROUTES, STALLS, routePoint, type Spot } from "./lagos";
import { WATER, districtAt, hash2, terrainHeight } from "./layout";
import { roadHeights } from "./roadHeights";

// Procedural Lagos street furniture, instanced so thousands of pieces stay cheap.

function colored(g: THREE.BufferGeometry, color: number) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute("uv");
  const c = new THREE.Color(color);
  const a = new Float32Array(ng.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i);
  ng.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return ng;
}
const merged = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
};

function instances(geo: THREE.BufferGeometry, spots: Spot[], opts: { colorOf?: (s: Spot) => number; yOffset?: number; castShadow?: boolean; tint?: boolean } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  spots.forEach((s, i) => {
    m.compose(new THREE.Vector3(s.x, terrainHeight(s.x, s.z) + (opts.yOffset ?? 0), s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry), new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
    if (opts.colorOf) mesh.setColorAt(i, c.setHex(opts.colorOf(s)));
  });
  mesh.count = spots.length;
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Split spots into ~500 m tiles so off-screen tiles are culled. */
function tiles(spots: Spot[]) {
  const map = new Map<string, Spot[]>();
  for (const s of spots) {
    const k = `${Math.floor(s.x / 500)},${Math.floor(s.z / 500)}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(s);
  }
  return [...map.values()];
}

const UMBRELLA = [0xc0392b, 0xf2b705, 0x1f7a4c, 0x2e86c1, 0xe67e22, 0x8e44ad, 0xffffff];

function stallGeometry() {
  return merged([
    colored(new THREE.BoxGeometry(1.8, 0.08, 1.1).translate(0, 0.85, 0), 0x8b5a2b), // table top
    ...[-0.8, 0.8].flatMap((x) => [-0.45, 0.45].map((z) => colored(new THREE.BoxGeometry(0.06, 0.85, 0.06).translate(x, 0.42, z), 0x5d3a1a))),
    // goods: tomatoes, peppers, fabric bolts, plantain
    colored(new THREE.BoxGeometry(0.5, 0.25, 0.4).translate(-0.5, 1.0, 0), 0xc0392b),
    colored(new THREE.BoxGeometry(0.45, 0.3, 0.45).translate(0.1, 1.04, 0.1), 0x8e44ad),
    colored(new THREE.SphereGeometry(0.16, 8, 6).translate(0.6, 1.0, -0.1), 0xf39c12),
    colored(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6).rotateZ(Math.PI / 2).translate(0.5, 0.95, 0.3), 0x27ae60),
    colored(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6).translate(0.95, 1.1, 0), 0x333333), // umbrella pole
  ]);
}
function umbrellaGeometry() {
  // Striped market umbrella: alternating white / colour panels.
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) {
    const g = new THREE.ConeGeometry(1.6, 0.55, 2, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4).translate(0.95, 2.3, 0);
    parts.push(colored(g, k % 2 ? 0xffffff : 0x9a9a9a)); // two-tone stripes after tint
  }
  return merged(parts);
}
function kioskGeometry() {
  return merged([
    colored(new THREE.BoxGeometry(2.2, 2.2, 1.8).translate(0, 1.1, 0), 0xffffff), // body (tinted)
    colored(new THREE.BoxGeometry(1.6, 0.9, 0.05).translate(0, 1.4, 0.92), 0x2a2a2a), // serving hatch
    colored(new THREE.BoxGeometry(2.6, 0.06, 2.3).translate(0, 2.35, 0.15).rotateX(-0.08), 0x9aa0a6), // zinc roof
  ]);
}
function shelterGeometry() {
  return merged([
    colored(new THREE.BoxGeometry(4.2, 0.08, 1.8).translate(0, 2.6, 0), 0x1f4e9a),
    ...[-1.9, 1.9].map((x) => colored(new THREE.BoxGeometry(0.1, 2.6, 0.1).translate(x, 1.3, -0.7), 0x9aa0a6)),
    colored(new THREE.BoxGeometry(3.6, 0.08, 0.5).translate(0, 0.5, -0.5), 0x9aa0a6),
    colored(new THREE.BoxGeometry(3.6, 0.5, 0.06).translate(0, 2.25, 0.9), 0xf2b705), // "BUS STOP" band
  ]);
}

/** Yellow-and-black painted kerb strip, the classic Lagos look (shader stripes along the road). */
function kerbMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute float along;\nvarying float vAlong;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvAlong = along;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vAlong;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = fract(vAlong / 1.6) < 0.5 ? vec3(0.95, 0.75, 0.05) : vec3(0.05);");
  };
  return m;
}

function kerbGeometry() {
  const pos: number[] = [], along: number[] = [], idx: number[] = [];
  const add = (r: (typeof ROUTES)[number], offset: number, width: number, height: number) => {
    const base = pos.length / 3;
    let acc = 0;
    r.pts.forEach(([x, z], i) => {
      const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(r.pts.length - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
      if (i) acc += Math.hypot(x - r.pts[i - 1][0], z - r.pts[i - 1][1]);
      const y = r.ys[i];
      const ix = x + nx * offset, iz = z + nz * offset, ox = x + nx * (offset + width), oz = z + nz * (offset + width);
      // inner-bottom, inner-top, outer-top
      pos.push(ix, y - 0.02, iz, ix, y + height, iz, ox, y + height, oz);
      along.push(acc, acc, acc);
      if (i) {
        const k = base + i * 3, p = k - 3;
        idx.push(p, k, p + 1, p + 1, k, k + 1, p + 1, k + 1, p + 2, p + 2, k + 1, k + 2);
      }
    });
  };
  for (const r of ROUTES) {
    if (r.road.kind === "street") continue;
    const half = r.road.width / 2;
    add(r, half, 0.25, 0.22);
    add(r, -half, -0.25, 0.22);
    if (r.road.kind === "highway") add(r, -0.5, 1.0, 0.3); // central median
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Open concrete drains along residential streets. */
function gutterGeometry() {
  const pos: number[] = [], idx: number[] = [];
  for (const r of ROUTES) {
    if (r.road.kind !== "street") continue;
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    const d = districtAt(mid[0], mid[1]).id;
    if (d !== "mainland" && d !== "adeyemi") continue;
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      r.pts.forEach(([x, z], i) => {
        const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(r.pts.length - 1, i + 1)];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nx = (-(b[1] - a[1]) / len) * side, nz = ((b[0] - a[0]) / len) * side;
        const o = r.road.width / 2 + 3.3;
        const y = r.ys[i] + 0.12;
        pos.push(x + nx * o, y, z + nz * o, x + nx * (o + 0.7), y, z + nz * (o + 0.7));
        if (i) {
          const k = base + i * 2;
          idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
        }
      });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wires() {
  const pts: number[] = [];
  for (const line of POLES) {
    for (let i = 1; i < line.pts.length; i++) {
      const a = line.pts[i - 1], b = line.pts[i];
      for (const off of [-0.5, 0, 0.5]) {
        const steps = 8;
        for (let k = 0; k < steps; k++) {
          const t0 = k / steps, t1 = (k + 1) / steps;
          const sag = (t: number) => -Math.sin(t * Math.PI) * 0.9;
          pts.push(a.x + (b.x - a.x) * t0 + off * 0.3, a.y + 8.6 + (b.y - a.y) * t0 + sag(t0), a.z + (b.z - a.z) * t0, a.x + (b.x - a.x) * t1 + off * 0.3, a.y + 8.6 + (b.y - a.y) * t1 + sag(t1), a.z + (b.z - a.z) * t1);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

export function Streetlife({ density }: { density: number }) {
  const built = useMemo(() => {
    const keep = (s: Spot) => hash2(s.x * 1.7, s.z * 2.3) < density;
    const stalls = STALLS.filter(keep);
    const stall = stallGeometry();
    const umbrella = umbrellaGeometry();
    const kiosk = kioskGeometry();
    const objs: THREE.Object3D[] = [];
    for (const t of tiles(stalls)) {
      objs.push(instances(stall, t, { castShadow: false }));
      objs.push(instances(umbrella, t.filter((s) => s.v > 0.3), { colorOf: (s) => UMBRELLA[Math.floor(s.v * 97) % UMBRELLA.length] }));
    }
    for (const t of tiles(KIOSKS)) objs.push(instances(kiosk, t, { colorOf: (s) => [0xf2c230, 0x1f7a4c, 0xc0392b, 0x2e86c1, 0xe8e2d0][Math.floor(s.v * 5)] }));
    for (const t of tiles(BUS_STOPS)) objs.push(instances(shelterGeometry(), t));
    // Electric poles with a crossarm and transformer here and there.
    const poleSpots: Spot[] = POLES.flatMap((l) => l.pts.map((p, i) => ({ x: p.x, z: p.z, ry: 0, v: i % 7 === 3 ? 1 : 0 })));
    const pole = merged([
      colored(new THREE.CylinderGeometry(0.1, 0.14, 9, 6).translate(0, 4.5, 0), 0x6d5a45),
      colored(new THREE.BoxGeometry(1.4, 0.1, 0.1).translate(0, 8.6, 0), 0x4a3b2d),
    ]);
    for (const t of tiles(poleSpots)) objs.push(instances(pole, t, { castShadow: false }));
    const transformerSpots = poleSpots.filter((s) => s.v === 1);
    objs.push(instances(merged([colored(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 10).translate(0.35, 7.4, 0), 0x7f8c8d)]), transformerSpots, { castShadow: false }));
    return { objs };
  }, [density]);

  const kerb = useMemo(() => ({ geo: kerbGeometry(), mat: kerbMaterial() }), []);
  const gutter = useMemo(() => gutterGeometry(), []);
  const wireGeo = useMemo(() => wires(), []);

  return (
    <group>
      {built.objs.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
      <mesh geometry={kerb.geo} material={kerb.mat} receiveShadow />
      <mesh geometry={gutter} receiveShadow>
        <meshStandardMaterial color={0x3b3a36} roughness={1} polygonOffset polygonOffsetFactor={-3} />
      </mesh>
      <lineSegments geometry={wireGeo}>
        <lineBasicMaterial color={0x111111} />
      </lineSegments>
      {BILLBOARDS.map((b, i) => (
        <Near key={i} distance={700} at={[b.x, 8, b.z]}>
          <Billboard spot={b} />
        </Near>
      ))}
      {ROAD_SIGNS.map((s, i) => (
        <RoadSign key={i} {...s} />
      ))}
      {density > 0.6 && BUS_STOPS.filter((_, i) => i % 3 === 0).map((b, i) => (
        <Near key={i} distance={250} at={[b.x, 2, b.z]}>
          <BusStopSign spot={b} />
        </Near>
      ))}
    </group>
  );
}

function Billboard({ spot }: { spot: Spot }) {
  const [title, sub, bg] = BILLBOARD_TEXTS[spot.v];
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 384;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 384);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 12; i++) ctx.fillRect(i * 90, 0, 40, 384);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 110px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, 512, 175);
    ctx.font = "600 56px system-ui, sans-serif";
    ctx.fillText(sub, 512, 280);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [title, sub, bg]);
  const y = Math.max(terrainHeight(spot.x, spot.z), WATER);
  return (
    <group position={[spot.x, y, spot.z]} rotation-y={spot.ry}>
      {[-3, 3].map((x) => (
        <mesh key={x} position={[x, 4, 0]}>
          <cylinderGeometry args={[0.18, 0.22, 8, 8]} />
          <meshStandardMaterial color={0x555b61} metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 9.5, 0]} castShadow>
        <boxGeometry args={[12, 4.5, 0.3]} />
        <meshStandardMaterial color={0x2a2a2a} />
      </mesh>
      {[0.16, -0.16].map((z, i) => (
        <mesh key={z} position={[0, 9.5, z]} rotation-y={i ? Math.PI : 0}>
          <planeGeometry args={[11.6, 4.2]} />
          <meshStandardMaterial map={tex} roughness={0.6} emissive={0xffffff} emissiveMap={tex} emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

/** Green overhead gantry sign spanning the expressway. */
function RoadSign({ route, at, text }: { route: string; at: number; text: string }) {
  const r = ROUTES.find((x) => x.road.name === route);
  const tex = useMemo(() => textTexture(text, { bg: "#0b6b3a", fg: "#ffffff", w: 1024, h: 140, font: "bold 64px system-ui, sans-serif" }), [text]);
  if (!r) return null;
  const p = routePoint(r, Math.min(at, r.length - 1), 0);
  const ys = roadHeights(r.road);
  const y = ys[Math.min(ys.length - 1, Math.floor((at / r.length) * ys.length))];
  const w = r.road.width + 2;
  return (
    <group position={[p.x, y, p.z]} rotation-y={p.heading}>
      {[-w / 2, w / 2].map((x) => (
        <mesh key={x} position={[x, 3.5, 0]}>
          <cylinderGeometry args={[0.15, 0.18, 7, 8]} />
          <meshStandardMaterial color={0x8a8f96} metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 7, 0]}>
        <boxGeometry args={[w, 0.25, 0.25]} />
        <meshStandardMaterial color={0x8a8f96} metalness={0.7} roughness={0.4} />
      </mesh>
      {[0, Math.PI].map((ry) => (
        <mesh key={ry} position={[0, 6.1, 0]} rotation-y={ry}>
          <planeGeometry args={[Math.min(w - 1, 14), 1.9]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function BusStopSign({ spot }: { spot: Spot }) {
  const tex = useMemo(() => textTexture("BUS STOP", { bg: "#f2b705", fg: "#111111", w: 512, h: 128, font: "900 72px system-ui, sans-serif" }), []);
  return (
    <group position={[spot.x, terrainHeight(spot.x, spot.z), spot.z]} rotation-y={spot.ry}>
      <mesh position={[2.6, 1.6, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 3.2, 6]} />
        <meshStandardMaterial color={0x777777} />
      </mesh>
      {[Math.PI / 2, -Math.PI / 2].map((ry) => (
        <mesh key={ry} position={[2.6, 3.1, 0]} rotation-y={ry}>
          <planeGeometry args={[1.4, 0.36]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
