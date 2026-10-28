"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { live, worldSeconds } from "../shared";
import { worldUniforms } from "../world/Atmosphere";
import { buildCrowd, pedestrianPose, type Pedestrian } from "../world/lagos";

// Lagos crowds: lightweight instanced people (stylised, procedural). Limbs swing
// in the vertex shader, so hundreds of walkers cost almost nothing on the CPU.
// Parts: 0 torso/top, 1 skin (head, hands), 2 left leg, 3 right leg, 4 left arm,
// 5 right arm, 6 head-tie / cap, 7 skirt / wrapper.

function tag(g: THREE.BufferGeometry, part: number) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute("uv");
  ng.setAttribute("part", new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count).fill(part), 1));
  return ng;
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

function personGeometry(woman: boolean) {
  const parts = [
    tag(at(new THREE.BoxGeometry(woman ? 0.36 : 0.42, 0.58, 0.22), 0, 1.2, 0), 0),
    tag(at(new THREE.SphereGeometry(0.11, 10, 8).scale(1, 1.18, 1.05), 0, 1.64, 0), 1),
    tag(at(new THREE.CylinderGeometry(0.05, 0.055, 0.09, 6), 0, 1.5, 0), 1),
    tag(at(new THREE.BoxGeometry(0.14, 0.88, 0.16), -0.095, 0.44, 0), 2),
    tag(at(new THREE.BoxGeometry(0.14, 0.88, 0.16), 0.095, 0.44, 0), 3),
    tag(at(new THREE.BoxGeometry(0.1, 0.62, 0.11), -(woman ? 0.24 : 0.27), 1.16, 0), 4),
    tag(at(new THREE.BoxGeometry(0.1, 0.62, 0.11), woman ? 0.24 : 0.27, 1.16, 0), 5),
  ];
  if (woman) {
    parts.push(tag(at(new THREE.CylinderGeometry(0.2, 0.28, 0.8, 10, 1, true), 0, 0.52, 0), 7)); // wrapper skirt
    parts.push(tag(at(new THREE.IcosahedronGeometry(0.17, 1).scale(1.35, 0.75, 1.1), 0, 1.79, -0.02), 6)); // gele
  } else {
    parts.push(tag(at(new THREE.CylinderGeometry(0.115, 0.12, 0.1, 10), 0, 1.78, 0), 6)); // fila cap
  }
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

function crowdMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         attribute float part;
         attribute vec3 aSkin; attribute vec3 aTop; attribute vec3 aBottom; attribute vec3 aWrap;
         attribute float aPhase; attribute float aWalk;
         varying vec3 vPartColor;
         vec3 rotX(vec3 p, float a, float pivotY) { p.y -= pivotY; float c = cos(a), s = sin(a); p = vec3(p.x, c*p.y - s*p.z, s*p.y + c*p.z); p.y += pivotY; return p; }`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float cyc = sin(uTime * 6.5 + aPhase) * aWalk;
         float idle = sin(uTime * 1.3 + aPhase) * (1.0 - aWalk);
         if (part > 1.5 && part < 2.5) transformed = rotX(transformed, cyc * 0.55, 0.9);
         if (part > 2.5 && part < 3.5) transformed = rotX(transformed, -cyc * 0.55, 0.9);
         if (part > 3.5 && part < 4.5) transformed = rotX(transformed, -cyc * 0.45 + idle * 0.08, 1.45);
         if (part > 4.5 && part < 5.5) transformed = rotX(transformed, cyc * 0.45 - idle * 0.08, 1.45);
         transformed.y += abs(cyc) * 0.035;
         transformed.x += idle * 0.012 * transformed.y;
         // No head-tie/cap for this person: collapse those vertices.
         if (part > 5.5 && part < 6.5 && aWrap.r < 0.0) transformed = vec3(0.0, 1.6, 0.0);
         vPartColor = part < 0.5 ? aTop : part < 1.5 ? aSkin : part < 3.5 ? aBottom : part < 5.5 ? aTop : part < 6.5 ? aWrap : aBottom;
         if (part > 3.5 && part < 5.5 && aPhase > 3.0) vPartColor = aSkin; // short sleeves`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPartColor;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = vPartColor;");
  };
  return m;
}

/** Shared with Locals: who is in the crowd, and which of them are drawn as full avatars. */
export const crowdShared = { people: [] as Pedestrian[], hidden: new Set<number>() };

export function Crowd({ scale, viewDistance }: { scale: number; viewDistance: number }) {
  const people = useMemo(() => buildCrowd(scale), [scale]);
  useEffect(() => {
    crowdShared.people = people;
  }, [people]);
  const groups = useMemo(() => {
    const mat = crowdMaterial();
    return ([false, true] as const).map((woman) => {
      const list = people.filter((p) => p.woman === woman);
      const geo = personGeometry(woman);
      const n = Math.max(1, list.length);
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      const col = (hex: number, arr: Float32Array, i: number) => {
        const c = new THREE.Color(hex);
        arr.set([c.r, c.g, c.b], i * 3);
      };
      const skin = new Float32Array(n * 3), top = new Float32Array(n * 3), bottom = new Float32Array(n * 3), wrap = new Float32Array(n * 3);
      const phase = new Float32Array(n), walk = new Float32Array(n);
      list.forEach((p, i) => {
        col(p.skin, skin, i);
        col(p.top, top, i);
        col(p.bottom, bottom, i);
        if (p.wrap) col(p.wrap, wrap, i);
        else wrap.set([-1, -1, -1], i * 3);
        if (!woman && (p.id % 3 !== 0)) wrap.set([-1, -1, -1], i * 3); // only some men wear a fila
        if (!woman && p.id % 3 === 0) col([0x6c3483, 0x1b1b1b, 0xa04000, 0x1f4e9a][p.id % 4], wrap, i);
        phase[i] = (p.id * 2.39) % 6.28;
        walk[i] = p.walking ? 1 : 0;
      });
      geo.setAttribute("aSkin", new THREE.InstancedBufferAttribute(skin, 3));
      geo.setAttribute("aTop", new THREE.InstancedBufferAttribute(top, 3));
      geo.setAttribute("aBottom", new THREE.InstancedBufferAttribute(bottom, 3));
      geo.setAttribute("aWrap", new THREE.InstancedBufferAttribute(wrap, 3));
      geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
      geo.setAttribute("aWalk", new THREE.InstancedBufferAttribute(walk, 1));
      mesh.count = list.length;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      return { mesh, list };
    });
  }, [people]);

  useFrame(() => {
    const t = worldSeconds();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const zero = new THREE.Vector3(0, 0, 0);
    const me = live.me.pos;
    for (const { mesh, list } of groups) {
      list.forEach((p: Pedestrian, i) => {
        const s = pedestrianPose(p, t);
        const far = Math.hypot(s.x - me.x, s.z - me.z) > viewDistance || crowdShared.hidden.has(p.id);
        pos.set(s.x, s.y, s.z);
        q.setFromAxisAngle(up, s.heading);
        mesh.setMatrixAt(i, m.compose(pos, q, far ? zero : one));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {groups.map(({ mesh }, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  );
}
