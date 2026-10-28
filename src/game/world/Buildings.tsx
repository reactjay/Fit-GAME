"use client";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useMemo } from "react";
import { textTexture } from "./geometry";
import { Near } from "./Near";
import * as THREE from "three";
import { worldUniforms } from "./Atmosphere";
import { BUILDINGS, ROOFTOP, roadClearance, terrainHeight, type BuildingStyle } from "./layout";

const STYLE_ID: Record<BuildingStyle, number> = { glass: 0, office: 1, residential: 2, house: 3, villa: 4, hotel: 5, mall: 6, terminal: 7, hangar: 8, warehouse: 9 };

/** Facade shader: window grids per building style, reflective glass by day, lit rooms at night. */
function makeFacadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = worldUniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute float aBase; attribute float aStyle; attribute float aSeed;
         varying vec3 vW; varying vec3 vWN; varying float vBase; varying float vStyle; varying float vSeed;`,
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
         vec4 wpos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
         vW = wpos.xyz;
         vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
         vBase = aBase; vStyle = aStyle; vSeed = aSeed;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uNight;
         varying vec3 vW; varying vec3 vWN; varying float vBase; varying float vStyle; varying float vSeed;
         float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         vec3 n = normalize(vWN);
         int st = int(vStyle + 0.5);
         if (n.y > 0.6) {
           // roofs: weathered concrete; villas/houses get terracotta
           vec3 roof = (st == 3 || st == 4) ? vec3(0.55, 0.27, 0.18) : vec3(0.48, 0.47, 0.45);
           diffuseColor.rgb = roof * (0.9 + 0.2 * h21(floor(vW.xz / 3.0)));
           roughnessFactor = 0.95;
         } else if (n.y > -0.5) {
           float u = abs(n.x) > 0.5 ? vW.z : vW.x;
           float v = vW.y - vBase;
           float floorH = 3.4, spacing = 3.0, winW = 1.8, winH = 0.62;
           if (st == 0 || st == 7) { floorH = 3.9; spacing = 1.6; winW = 1.52; winH = 0.86; }
           else if (st == 1) { floorH = 3.6; spacing = 3.0; winW = 2.4; winH = 0.6; }
           else if (st == 2 || st == 5) { floorH = 3.1; spacing = 3.6; winW = 1.6; winH = 0.58; }
           else if (st == 3) { floorH = 3.0; spacing = 4.2; winW = 1.3; winH = 0.5; }
           else if (st == 4) { floorH = 3.6; spacing = 5.0; winW = 3.4; winH = 0.68; }
           else if (st == 6) { floorH = 6.0; spacing = 8.0; winW = 7.6; winH = 0.8; }
           else if (st >= 8) { floorH = 100.0; spacing = 1.0; winW = 0.0; winH = 0.0; }
           float fu = fract(u / spacing + vSeed * 3.0);
           float fv = fract(v / floorH);
           float inWin = step(fu, winW / spacing) * step(0.18, fv) * step(fv, 0.18 + winH);
           if (st == 6 && v > 7.0) inWin = 0.0;               // malls: shopfronts only
           if (v < 0.6) inWin = 0.0;                            // plinth
           vec2 cell = vec2(floor(u / spacing + vSeed * 3.0), floor(v / floorH));
           if (st >= 8) {
             // corrugated cladding
             diffuseColor.rgb *= 0.85 + 0.15 * step(0.5, fract(u * 2.0));
             metalnessFactor = 0.35; roughnessFactor = 0.55;
           }
           if (inWin > 0.5) {
             vec3 glass = (st == 0) ? vec3(0.18, 0.28, 0.36) : vec3(0.12, 0.15, 0.18);
             glass *= 0.8 + 0.4 * h21(cell + vSeed);
             diffuseColor.rgb = glass;
             roughnessFactor = 0.06; metalnessFactor = 0.85;
             float lit = step(0.52, h21(cell * 1.7 + vSeed * 9.0));
             totalEmissiveRadiance += uNight * lit * vec3(1.0, 0.78, 0.48) * (0.9 + 0.8 * h21(cell + 3.1));
           } else if (st == 0) {
             // glass towers: thin aluminium mullions and spandrels
             diffuseColor.rgb = vec3(0.62, 0.65, 0.68); metalnessFactor = 0.7; roughnessFactor = 0.35;
           } else if ((st == 2 || st == 5) && fv < 0.12) {
             diffuseColor.rgb *= 0.7; // balcony slab shadow lines
           }
           // subtle grime toward the ground
           diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 6.0, v));
         }`,
      );
  };
  return m;
}

export function Buildings() {
  const chunks = useMemo(() => {
    const groups = new Map<string, typeof BUILDINGS>();
    for (const b of BUILDINGS) {
      const k = `${Math.floor(b.x / 500)},${Math.floor(b.z / 500)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(b);
    }
    const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const material = makeFacadeMaterial();
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    return [...groups.values()].map((list) => {
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      const base = new Float32Array(list.length), style = new Float32Array(list.length), seed = new Float32Array(list.length);
      list.forEach((b, i) => {
        // Sink 2 m below the lowest corner so sloped ground never shows a gap.
        m.compose(new THREE.Vector3(b.x, b.y - 2, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h + 2, b.d));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.setHex(b.color));
        base[i] = b.y;
        style[i] = STYLE_ID[b.style];
        seed[i] = (Math.sin(b.x * 12.9898 + b.z * 78.233) * 43758.5453) % 1;
      });
      mesh.geometry = geometry.clone();
      mesh.geometry.setAttribute("aBase", new THREE.InstancedBufferAttribute(base, 1));
      mesh.geometry.setAttribute("aStyle", new THREE.InstancedBufferAttribute(style, 1));
      mesh.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      return mesh;
    });
  }, []);

  const pools = useMemo(() => BUILDINGS.filter((b) => b.style === "villa"), []);

  return (
    <group>
      {chunks.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
      {/* Villa pools */}
      {pools.map((b, i) => (
        <mesh key={i} position={[b.x, b.y + 0.12, b.z + b.d / 2 + 6]} receiveShadow>
          <boxGeometry args={[b.w * 0.6, 0.25, 6]} />
          <meshStandardMaterial color={0x2fb4c8} roughness={0.05} metalness={0.2} />
        </mesh>
      ))}
      <RigidBody type="fixed" colliders={false} userData={{ kind: "building" }}>
        {BUILDINGS.map((b, i) => (
          <CuboidCollider key={i} args={[b.w / 2, (b.h + 2) / 2, b.d / 2]} position={[b.x, b.y - 2 + (b.h + 2) / 2, b.z]} />
        ))}
      </RigidBody>
      {ROOFTOP && (
        <Near distance={350} at={[ROOFTOP.x, ROOFTOP.y, ROOFTOP.z]}>
          <RooftopRestaurant x={ROOFTOP.x} y={ROOFTOP.y} z={ROOFTOP.z} />
        </Near>
      )}
      <NigerianHomes />
    </group>
  );
}

/** Dining terrace with string lights on top of the tallest tower. */
function RooftopRestaurant({ x, y, z }: { x: number; y: number; z: number }) {
  const tables = [-12, -4, 4, 12].flatMap((tx) => [-10, 0, 10].map((tz) => [tx, tz] as const));
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[40, 0.2, 36]} />
        <meshStandardMaterial color={0x6b4a33} roughness={0.7} />
      </mesh>
      {[[-20, 0, 0.1, 36], [20, 0, 0.1, 36], [0, -18, 40, 0.1], [0, 18, 40, 0.1]].map(([px, pz, w, d], i) => (
        <mesh key={i} position={[px, 0.75, pz]}>
          <boxGeometry args={[w + 0.05, 1.3, d + 0.05]} />
          <meshPhysicalMaterial color={0xbfe3ff} transmission={0.85} roughness={0.05} thickness={0.1} transparent opacity={0.4} />
        </mesh>
      ))}
      {tables.map(([tx, tz], i) => (
        <group key={i} position={[tx, 0, tz]}>
          <mesh position={[0, 0.75, 0]} castShadow>
            <cylinderGeometry args={[0.7, 0.7, 0.05, 20]} />
            <meshStandardMaterial color={0xf3efe6} />
          </mesh>
          <mesh position={[0, 0.38, 0]}>
            <cylinderGeometry args={[0.06, 0.12, 0.75, 8]} />
            <meshStandardMaterial color={0x222222} metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.86, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color={0xffd27a} emissive={0xffb347} emissiveIntensity={2} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 40 }, (_, i) => (
        <mesh key={i} position={[-19 + (i % 20) * 2, 3.2 - Math.sin(((i % 20) / 19) * Math.PI) * 0.6, i < 20 ? -8 : 8]}>
          <sphereGeometry args={[0.09, 6, 6]} />
          <meshBasicMaterial color={0xffe2a0} />
        </mesh>
      ))}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[20, 0.1, 18]} position={[0, 0.1, 0]} />
        <CuboidCollider args={[0.1, 1, 18]} position={[-20, 1, 0]} />
        <CuboidCollider args={[0.1, 1, 18]} position={[20, 1, 0]} />
        <CuboidCollider args={[20, 1, 0.1]} position={[0, 1, -18]} />
        <CuboidCollider args={[20, 1, 0.1]} position={[0, 1, 18]} />
      </RigidBody>
    </group>
  );
}

// ── Nigerian residential details ──────────────────────────────────────
const ROOF_COLORS = [0x8a3b24, 0xa33a2a, 0x2e5e9e, 0x2f6b4f, 0xa9adb3, 0x6d4c41];

/** Corrugated roofing sheets: ridges across the slope. */
function roofMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.35 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vRW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvRW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRW;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= 0.82 + 0.18 * smoothstep(0.3, 0.7, abs(fract((vRW.x + vRW.z) * 3.0) - 0.5) * 2.0);");
  };
  return m;
}

/** Gable roof: a prism from y=0 (eaves) to y=1 (ridge along local x). */
function prismGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0, 1);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2); // ridge runs along x
  return g;
}

function NigerianHomes() {
  const built = useMemo(() => {
    const homes = BUILDINGS.filter((b) => b.style === "house" || b.style === "residential" || b.style === "villa");
    const roofed = BUILDINGS.filter((b) => b.style === "house" || b.style === "villa" || (b.style === "residential" && hashOf(b) > 0.5));
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const q = new THREE.Quaternion();
    const roofs = new THREE.InstancedMesh(prismGeometry(), roofMaterial(), roofed.length);
    roofed.forEach((b, i) => {
      const along = b.w >= b.d;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), along ? 0 : Math.PI / 2);
      const span = along ? b.d : b.w, len = along ? b.w : b.d;
      roofs.setMatrixAt(i, m.compose(new THREE.Vector3(b.x, b.y + b.h, b.z), q, new THREE.Vector3(len + 1.2, Math.min(3.2, span * 0.28), span + 1.2)));
      roofs.setColorAt(i, c.setHex(ROOF_COLORS[Math.floor(hashOf(b) * ROOF_COLORS.length)]));
    });
    roofs.castShadow = roofs.receiveShadow = true;
    roofs.computeBoundingSphere();

    // Plastic water tanks (black or blue) on many roofs.
    const tanked = BUILDINGS.filter((b) => b.style !== "glass" && b.style !== "terminal" && b.style !== "hangar" && hashOf(b) > 0.25);
    const tanks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.75, 0.8, 1.6, 14).translate(0, 0.8, 0), new THREE.MeshStandardMaterial({ roughness: 0.5 }), tanked.length);
    tanked.forEach((b, i) => {
      const flat = !(b.style === "house" || b.style === "villa" || (b.style === "residential" && hashOf(b) > 0.5));
      const y = b.y + b.h + (flat ? 0 : Math.min(3.2, Math.min(b.w, b.d) * 0.28) * 0.4);
      tanks.setMatrixAt(i, m.compose(new THREE.Vector3(b.x + b.w * 0.25, y, b.z - b.d * 0.2), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
      tanks.setColorAt(i, c.setHex(hashOf(b) > 0.6 ? 0x1f4e9a : 0x151515));
    });
    tanks.computeBoundingSphere();

    // Compound walls with a gate on the front (+z) side.
    const walls: THREE.Matrix4[] = [];
    const gates: THREE.Matrix4[] = [];
    const colliders: { pos: [number, number, number]; half: [number, number, number] }[] = [];
    for (const b of homes.filter((h) => h.style !== "residential" || hashOf(h) > 0.4)) {
      const W = b.w + 7, D = b.d + 7, H = 2.3;
      const segs: [number, number, number, number][] = [
        [b.x, b.z - D / 2, W, 0.25], // back
        [b.x - W / 2, b.z, 0.25, D], // left
        [b.x + W / 2, b.z, 0.25, D], // right
        [b.x - W / 4 - 1.5, b.z + D / 2, W / 2 - 3, 0.25], // front-left
        [b.x + W / 4 + 1.5, b.z + D / 2, W / 2 - 3, 0.25], // front-right
      ];
      for (const [x, z, w, d] of segs) {
        // Never build a wall onto the sidewalk or road.
        const ends: [number, number][] = [[x - w / 2, z - d / 2], [x + w / 2, z + d / 2], [x, z]];
        if (ends.some(([ex, ez]) => roadClearance(ex, ez) < 3.6)) continue;
        const y = terrainHeight(x, z);
        walls.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + H / 2 - 0.2, z), new THREE.Quaternion(), new THREE.Vector3(w, H, d)));
        colliders.push({ pos: [x, y + H / 2 - 0.2, z], half: [w / 2, H / 2, d / 2] });
      }
      const gy = terrainHeight(b.x, b.z + D / 2);
      gates.push(new THREE.Matrix4().compose(new THREE.Vector3(b.x, gy + 1.1, b.z + D / 2), new THREE.Quaternion(), new THREE.Vector3(6, 2.2, 0.12)));
    }
    const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xe6d9c2, roughness: 0.95 }), walls.length);
    walls.forEach((w, i) => wallMesh.setMatrixAt(i, w));
    wallMesh.receiveShadow = wallMesh.castShadow = true;
    wallMesh.computeBoundingSphere();
    const gateMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x1f2a33, metalness: 0.6, roughness: 0.4 }), gates.length);
    gates.forEach((g, i) => gateMesh.setMatrixAt(i, g));
    gateMesh.computeBoundingSphere();
    // A few walls carry the famous Lagos warning.
    const notForSale = homes.filter((h) => hashOf(h) < 0.12).slice(0, 30);
    return { roofs, tanks, wallMesh, gateMesh, colliders, notForSale };
  }, []);
  const sign = useMemo(() => textTexture("THIS HOUSE IS NOT FOR SALE", { bg: "rgba(0,0,0,0)", fg: "#b03a2e", w: 1024, h: 120, font: "900 70px system-ui, sans-serif" }), []);
  return (
    <group>
      <primitive object={built.roofs} />
      <primitive object={built.tanks} />
      <primitive object={built.wallMesh} />
      <primitive object={built.gateMesh} />
      {built.notForSale.map((b, i) => {
        const z = b.z - (b.d + 7) / 2 - 0.14;
        return (
          <mesh key={i} position={[b.x, terrainHeight(b.x, z) + 1.3, z]} rotation-y={Math.PI}>
            <planeGeometry args={[Math.min(b.w + 5, 9), 1]} />
            <meshBasicMaterial map={sign} transparent />
          </mesh>
        );
      })}
      <RigidBody type="fixed" colliders={false} userData={{ kind: "building" }}>
        {built.colliders.map((c, i) => (
          <CuboidCollider key={i} args={c.half} position={c.pos} />
        ))}
      </RigidBody>
    </group>
  );
}

function hashOf(b: { x: number; z: number }) {
  return Math.abs(Math.sin(b.x * 12.9898 + b.z * 78.233) * 43758.5453) % 1;
}
