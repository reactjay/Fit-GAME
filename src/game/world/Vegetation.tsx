"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { worldUniforms } from "./Atmosphere";
import { PROPS, hash2, type Prop } from "./layout";

/** Adds a gentle height-weighted wind sway to an instanced material. */
function withWind(m: THREE.Material, strength: number) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float sway = max(transformed.y, 0.0) * ${strength.toFixed(3)};
       float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
       transformed.x += sin(uTime * 1.3 + ph) * sway;
       transformed.z += cos(uTime * 1.1 + ph * 1.3) * sway * 0.6;`,
    );
  };
  return m;
}

function palmGeometries() {
  // Gently curved, ringed trunk.
  const trunk = new THREE.CylinderGeometry(0.17, 0.27, 9, 8, 18, false).translate(0, 4.5, 0);
  const p = trunk.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const ring = 1 + 0.06 * Math.sin(y * 9);
    p.setX(i, p.getX(i) * ring + Math.pow(y / 9, 2) * 0.9);
    p.setZ(i, p.getZ(i) * ring);
  }
  trunk.computeVertexNormals();
  // Fronds: long tapered blades drooping out from the crown.
  const blades: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 11; k++) {
    const g = new THREE.PlaneGeometry(1.2, 4.6, 1, 8).translate(0, 2.3, 0);
    const bp = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) {
      const t = bp.getY(i) / 4.6;
      bp.setX(i, bp.getX(i) * (1 - t * 0.85) * (0.6 + 0.4 * Math.sin(t * Math.PI)));
      bp.setZ(i, -Math.pow(t, 1.8) * 2.2); // droop
    }
    g.rotateX(-Math.PI / 2 + 0.55 + (k % 3) * 0.12);
    g.rotateY((k / 11) * Math.PI * 2);
    g.translate(0.9, 9, 0);
    blades.push(g);
  }
  const fronds = mergeGeometries(blades)!;
  fronds.computeVertexNormals();
  return { trunk, fronds };
}

function treeGeometries() {
  const trunk = new THREE.CylinderGeometry(0.18, 0.32, 5, 7).translate(0, 2.5, 0);
  const blobs: THREE.BufferGeometry[] = [];
  const offsets = [[0, 6.2, 0, 2.6], [1.4, 5.4, 0.6, 2.0], [-1.2, 5.6, -0.5, 2.1], [0.2, 7.4, -0.4, 1.8], [-0.4, 5.2, 1.4, 1.7]];
  offsets.forEach(([x, y, z, r], k) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const gp = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < gp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(gp, i);
      const n = 0.82 + 0.3 * hash2(Math.round(v.x * 7 + k * 31), Math.round(v.y * 7 + v.z * 5));
      v.multiplyScalar(n);
      gp.setXYZ(i, v.x, v.y, v.z);
    }
    g.translate(x, y, z);
    blobs.push(g);
  });
  const canopy = mergeGeometries(blobs)!;
  canopy.computeVertexNormals();
  return { trunk, canopy };
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, props: Prop[], colorFn?: (p: Prop, c: THREE.Color) => void, shadow = true) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, props.length));
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  props.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, p.y - 0.2, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.r), new THREE.Vector3(p.s, p.s, p.s));
    mesh.setMatrixAt(i, m);
    if (colorFn) {
      colorFn(p, c);
      mesh.setColorAt(i, c);
    }
  });
  mesh.count = props.length;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Splits instances into ~600 m tiles so off-screen tiles are frustum-culled. */
function tiles(props: Prop[]) {
  const map = new Map<string, Prop[]>();
  for (const p of props) {
    const k = `${Math.floor(p.x / 600)},${Math.floor(p.z / 600)}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }
  return [...map.values()];
}

export function Vegetation({ share, viewDistance, shadows }: { share: number; viewDistance: number; shadows: boolean }) {
  const meshes = useMemo(() => {
    const keep = (p: Prop) => hash2(p.x * 3, p.z * 7) < share;
    const palms = PROPS.palms.filter(keep);
    const trees = PROPS.trees.filter(keep);
    const pg = palmGeometries();
    const tg = treeGeometries();
    const bark = new THREE.MeshStandardMaterial({ color: 0x7a6650, roughness: 1 });
    const frond = withWind(new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.8, side: THREE.DoubleSide }), 0.025);
    const leaf = withWind(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), 0.012);
    const out: THREE.Object3D[] = [];
    for (const t of tiles(palms)) {
      out.push(instanced(pg.trunk, bark, t, undefined, shadows));
      out.push(instanced(pg.fronds, frond, t, undefined, shadows));
    }
    for (const t of tiles(trees)) {
      out.push(instanced(tg.trunk, bark, t, undefined, false));
      out.push(instanced(tg.canopy, leaf, t, (p, c) => c.setHSL(0.24 + hash2(p.x, p.z) * 0.08, 0.45, 0.2 + hash2(p.z, p.x) * 0.1), shadows));
    }
    return out;
  }, [share, shadows]);
  // Distance culling per tile (fog hides what's beyond anyway).
  useFrame(({ camera }) => {
    for (const m of meshes) {
      const mesh = m as THREE.InstancedMesh;
      const sphere = mesh.boundingSphere;
      if (sphere) mesh.visible = camera.position.distanceTo(sphere.center) - sphere.radius < viewDistance;
    }
  });
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

export function StreetLights() {
  const { poles, lamps, pools, lampMat, poolMat } = useMemo(() => {
    const pole = mergeGeometries([
      new THREE.CylinderGeometry(0.08, 0.12, 8, 6).translate(0, 4, 0),
      new THREE.BoxGeometry(0.1, 0.1, 2.2).translate(0, 7.9, 1.05),
    ])!;
    const head = new THREE.BoxGeometry(0.35, 0.14, 0.7).translate(0, 7.8, 2.1);
    const pool = new THREE.CircleGeometry(5, 20).rotateX(-Math.PI / 2).translate(0, 0.25, 2.6);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd9a0, emissiveIntensity: 0 });
    const poolMat = new THREE.MeshBasicMaterial({ color: 0xffc77a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const steel = new THREE.MeshStandardMaterial({ color: 0x5b6066, metalness: 0.6, roughness: 0.5 });
    return {
      poles: tiles(PROPS.lights).map((t) => instanced(pole, steel, t, undefined, false)),
      lamps: tiles(PROPS.lights).map((t) => instanced(head, lampMat, t, undefined, false)),
      pools: tiles(PROPS.lights).map((t) => instanced(pool, poolMat, t, undefined, false)),
      lampMat,
      poolMat,
    };
  }, []);
  useFrame(() => {
    const n = worldUniforms.uNight.value;
    lampMat.emissiveIntensity = n * 3;
    poolMat.opacity = n * 0.22;
  });
  return (
    <group>
      {[...poles, ...lamps, ...pools].map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}
