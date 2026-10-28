"use client";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { useMemo } from "react";
import * as THREE from "three";
import { textTexture } from "./geometry";
import { Near } from "./Near";
import { ROUTES, routePoint } from "./lagos";
import { AIRPORT_HEIGHT, CREEK, SITES, WATER, coastZ, hash2, terrainHeight } from "./layout";

// Stylised Lagos landmarks (procedural, recognisable silhouettes; not exact replicas).

function Sign({ text, position, rotationY = 0, width = 10, bg = "#0b6b3a", fg = "#ffffff" }: { text: string; position: [number, number, number]; rotationY?: number; width?: number; bg?: string; fg?: string }) {
  const tex = useMemo(() => textTexture(text, { bg, fg, w: 1024, h: 128, font: "bold 64px system-ui, sans-serif" }), [text, bg, fg]);
  return (
    <group position={position} rotation-y={rotationY}>
      {[0, Math.PI].map((r) => (
        <mesh key={r} rotation-y={r}>
          <planeGeometry args={[width, width / 8]} />
          <meshBasicMaterial map={tex} toneMapped={false} side={THREE.FrontSide} />
        </mesh>
      ))}
    </group>
  );
}

/** National Theatre, Iganmu — the "military cap". */
function NationalTheatre() {
  const { x, z } = SITES.nationalTheatre;
  const y = terrainHeight(x, z);
  const capProfile = useMemo(() => {
    const pts = [new THREE.Vector2(0, 22), new THREE.Vector2(20, 21), new THREE.Vector2(36, 17.5), new THREE.Vector2(50, 15.8), new THREE.Vector2(52, 15), new THREE.Vector2(44, 14.2), new THREE.Vector2(0, 14.2)];
    return new THREE.LatheGeometry(pts, 48);
  }, []);
  // 32 vertical fins around the drum, as one instanced mesh.
  const fins = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 14, 1.6), new THREE.MeshStandardMaterial({ color: 0xb9b2a2 }), 32);
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      m.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 42.5, 7, Math.sin(a) * 42.5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a), new THREE.Vector3(1, 1, 1)));
    }
    m.computeBoundingSphere();
    return m;
  }, []);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 7, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[40, 42, 14, 48]} />
        <meshStandardMaterial color={0xd8d2c4} roughness={0.8} />
      </mesh>
      <primitive object={fins} />
      <mesh geometry={capProfile} castShadow>
        <meshStandardMaterial color={0x9aa3ab} metalness={0.5} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 3, 41]}>
        <boxGeometry args={[16, 6, 2]} />
        <meshStandardMaterial color={0x1a242c} metalness={0.8} roughness={0.1} />
      </mesh>
      <Sign text="NATIONAL THEATRE" position={[0, 26, 0]} width={26} bg="#7a1f1f" />
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[7, 43]} position={[0, 7, 0]} />
      </RigidBody>
    </group>
  );
}

/** Tafawa Balewa Square: plaza, arches, horses, eagle column. */
function TafawaBalewaSquare() {
  const { x, z } = SITES.tbs;
  const y = terrainHeight(x, z);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.18, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[62, 40]} />
        <meshStandardMaterial color={0xcfc8b8} roughness={0.9} />
      </mesh>
      {Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <group key={i} position={[Math.cos(a) * 40, 0, Math.sin(a) * 40]} rotation-y={-a + Math.PI / 2}>
            {/* white arch */}
            {[-6, 6].map((dx) => (
              <mesh key={dx} position={[dx, 6, 0]} castShadow>
                <boxGeometry args={[2.2, 12, 2.2]} />
                <meshStandardMaterial color={0xf3f0e8} />
              </mesh>
            ))}
            <mesh position={[0, 12.5, 0]} castShadow>
              <boxGeometry args={[14.5, 2, 2.4]} />
              <meshStandardMaterial color={0xf3f0e8} />
            </mesh>
          </group>
        );
      })}
      {/* four horses on plinths */}
      {Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(a) * 18, 0, Math.sin(a) * 18]} rotation-y={-a}>
            <mesh position={[0, 1.2, 0]}>
              <boxGeometry args={[3, 2.4, 5]} />
              <meshStandardMaterial color={0xbab4a8} />
            </mesh>
            <group position={[0, 2.4, 0]}>
              <mesh position={[0, 1.8, 0]} castShadow>
                <boxGeometry args={[1.0, 1.1, 2.6]} />
                <meshStandardMaterial color={0x1d1d1f} metalness={0.4} roughness={0.5} />
              </mesh>
              <mesh position={[0, 2.7, 1.3]} rotation-x={-0.6} castShadow>
                <boxGeometry args={[0.5, 1.4, 0.6]} />
                <meshStandardMaterial color={0x1d1d1f} metalness={0.4} roughness={0.5} />
              </mesh>
              {[[-0.35, 0.9], [0.35, 0.9], [-0.35, -0.9], [0.35, -0.9]].map(([lx, lz], k) => (
                <mesh key={k} position={[lx, 0.62, lz]}>
                  <boxGeometry args={[0.2, 1.25, 0.2]} />
                  <meshStandardMaterial color={0x1d1d1f} />
                </mesh>
              ))}
            </group>
          </group>
        );
      })}
      {/* eagle column */}
      <mesh position={[0, 9, 0]} castShadow>
        <cylinderGeometry args={[0.9, 1.2, 18, 16]} />
        <meshStandardMaterial color={0xe8e2d0} />
      </mesh>
      <mesh position={[0, 18.8, 0]} scale={[3.2, 0.6, 1]}>
        <sphereGeometry args={[0.8, 12, 8]} />
        <meshStandardMaterial color={0xb8860b} metalness={0.8} roughness={0.3} />
      </mesh>
      <Sign text="TAFAWA BALEWA SQUARE" position={[0, 3, 58]} width={16} />
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[9, 1.3]} position={[0, 9, 0]} />
      </RigidBody>
    </group>
  );
}

/** "Welcome to Lagos" gateway arch over the Third Mainland Bridge approach. */
function GatewayArch() {
  const { x, z } = SITES.gateway;
  const y = terrainHeight(x, z);
  const tex = useMemo(() => textTexture("WELCOME TO LAGOS  •  EKO O NI BAJE", { bg: "#0b6b3a", fg: "#f2c230", w: 2048, h: 160, font: "900 100px system-ui, sans-serif" }), []);
  return (
    <group position={[x, y, z]}>
      {[-14, 14].map((dx) => (
        <mesh key={dx} position={[dx, 6, 0]} castShadow>
          <boxGeometry args={[2.4, 12, 2.4]} />
          <meshStandardMaterial color={0xf3f0e8} />
        </mesh>
      ))}
      <mesh position={[0, 12.2, 0]} castShadow>
        <boxGeometry args={[31, 2.6, 1.6]} />
        <meshStandardMaterial color={0x0b6b3a} />
      </mesh>
      {[0.82, -0.82].map((dz, i) => (
        <mesh key={dz} position={[0, 12.2, dz]} rotation-y={i ? Math.PI : 0}>
          <planeGeometry args={[30, 2.3]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      ))}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[1.2, 6, 1.2]} position={[-14, 6, 0]} />
        <CuboidCollider args={[1.2, 6, 1.2]} position={[14, 6, 0]} />
      </RigidBody>
    </group>
  );
}

/** Lekki–Ikoyi Link Bridge: a single tall pylon with fanned stay cables over the creek. */
function LinkBridge() {
  const route = ROUTES.find((r) => r.road.name === "Admiralty Way");
  const built = useMemo(() => {
    if (!route) return null;
    // Find where the road crosses the creek centre.
    let best = 0, bd = Infinity;
    for (let d = 0; d < Math.min(route.length, 400); d += 2) {
      const p = routePoint(route, d, 0);
      const dd = Math.abs(p.x - CREEK.x);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    const c = routePoint(route, best, 0);
    const top = c.y + 52;
    const cable: number[] = [];
    for (let k = -8; k <= 8; k++) {
      if (k === 0) continue;
      const p = routePoint(route, Math.max(0, Math.min(route.length - 1, best + k * 9)), 0);
      for (const side of [-1, 1]) {
        const ox = Math.cos(c.heading) * side * 6, oz = -Math.sin(c.heading) * side * 6;
        cable.push(c.x + ox * 0.15, top - Math.abs(k) * 1.2, c.z + oz * 0.15, p.x + ox, p.y + 0.6, p.z + oz);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(cable, 3));
    return { c, top, cables: g };
  }, [route]);
  if (!built) return null;
  const { c, top, cables } = built;
  return (
    <group>
      <mesh position={[c.x, (c.y + top) / 2, c.z]} rotation-y={c.heading} castShadow>
        <boxGeometry args={[1.6, top - c.y + 2, 2.2]} />
        <meshStandardMaterial color={0xe8e4dc} roughness={0.6} />
      </mesh>
      <lineSegments geometry={cables}>
        <lineBasicMaterial color={0xdedede} />
      </lineSegments>
      <Sign text="LEKKI–IKOYI LINK BRIDGE" position={[c.x, top + 3, c.z]} rotationY={c.heading + Math.PI / 2} width={14} bg="#1f4e9a" />
    </group>
  );
}

/** Lekki Toll Gate across Ahmadu Bello Way. */
function TollGate() {
  const route = ROUTES.find((r) => r.road.name === "Ahmadu Bello Way");
  if (!route) return null;
  let d = 0;
  for (let s = 0; s < route.length; s += 10) if (routePoint(route, s, 0).x > 1450) {
    d = s;
    break;
  }
  const p = routePoint(route, d, 0);
  const w = route.road.width + 8;
  return (
    <group position={[p.x, p.y, p.z]} rotation-y={p.heading}>
      {Array.from({ length: 5 }, (_, i) => (
        <group key={i} position={[-w / 2 + (i * w) / 4, 0, 0]}>
          <mesh position={[0, 3.2, 0]}>
            <cylinderGeometry args={[0.25, 0.3, 6.4, 10]} />
            <meshStandardMaterial color={0xc8ccd2} metalness={0.6} roughness={0.4} />
          </mesh>
          {i > 0 && i < 4 && (
            <mesh position={[1.6, 1.3, 0]}>
              <boxGeometry args={[1.4, 2.6, 2.4]} />
              <meshStandardMaterial color={0xf3f0e8} />
            </mesh>
          )}
        </group>
      ))}
      {/* wave-shaped canopy */}
      <mesh position={[0, 7, 0]} rotation-z={0.04}>
        <boxGeometry args={[w + 4, 0.5, 14]} />
        <meshStandardMaterial color={0x1f4e9a} metalness={0.3} roughness={0.4} />
      </mesh>
      <Sign text="LEKKI TOLL GATE" position={[0, 8.2, 7.1]} width={14} bg="#1f4e9a" />
      <RigidBody type="fixed" colliders={false}>
        {[0, 4].map((i) => (
          <CuboidCollider key={i} args={[0.3, 3.2, 0.3]} position={[-w / 2 + (i * w) / 4, 3.2, 0]} />
        ))}
      </RigidBody>
    </group>
  );
}

/** Beach umbrellas, loungers and the Bar Beach sign. */
function BarBeach() {
  const mesh = useMemo(() => {
    const spots: THREE.Matrix4[] = [];
    for (let x = -600; x <= 1800; x += 9) {
      if (hash2(x, 77) > 0.45) continue;
      const z = coastZ(x) - 40 - hash2(x, 78) * 60;
      const y = terrainHeight(x, z);
      if (y < WATER + 0.2) continue;
      spots.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
    }
    const parts = [new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6).translate(0, 1.2, 0), new THREE.ConeGeometry(1.5, 0.6, 10, 1, true).translate(0, 2.4, 0)];
    const colors = [0xc0392b, 0xf2b705, 0x2e86c1, 0x1f7a4c, 0xffffff];
    const geos = parts.map((g, i) => {
      const ng = g.toNonIndexed();
      const c = new THREE.Color(i === 0 ? 0x666666 : 0xffffff);
      const a = new Float32Array(ng.attributes.position.count * 3);
      for (let k = 0; k < a.length; k += 3) a.set([c.r, c.g, c.b], k);
      ng.setAttribute("color", new THREE.BufferAttribute(a, 3));
      ng.deleteAttribute("uv");
      return ng;
    });
    const merged = new THREE.BufferGeometry();
    const pos = new Float32Array([...geos[0].attributes.position.array, ...geos[1].attributes.position.array]);
    const col = new Float32Array([...geos[0].attributes.color.array, ...geos[1].attributes.color.array]);
    merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    merged.setAttribute("color", new THREE.BufferAttribute(col, 3));
    merged.computeVertexNormals();
    const m = new THREE.InstancedMesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 }), spots.length);
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      m.setMatrixAt(i, s);
      m.setColorAt(i, c.setHex(colors[i % colors.length]));
    });
    m.castShadow = true;
    m.computeBoundingSphere();
    return m;
  }, []);
  return (
    <group>
      <primitive object={mesh} />
      <Sign text="BAR BEACH" position={[300, terrainHeight(300, coastZ(300) - 120) + 4, coastZ(300) - 120]} width={8} bg="#c0392b" />
    </group>
  );
}

export function Landmarks() {
  return (
    <group>
      <NationalTheatre />
      <Near distance={800} at={[SITES.tbs.x, 5, SITES.tbs.z]}>
        <TafawaBalewaSquare />
      </Near>
      <GatewayArch />
      <LinkBridge />
      <Near distance={700} at={[1500, 5, coastZ(1500) - 165]}>
        <TollGate />
      </Near>
      <BarBeach />
      <Sign text="MURTALA MUHAMMED INTERNATIONAL AIRPORT" position={[-1200, AIRPORT_HEIGHT + 24, -639]} width={60} bg="#0b6b3a" />
      <Sign text="THIRD MAINLAND BRIDGE" position={[-450, 16, 120]} rotationY={Math.PI / 2} width={14} />
    </group>
  );
}
