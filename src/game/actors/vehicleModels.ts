import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VehicleKind } from "../world/lagos";

// Procedural Lagos road vehicles (stylised, not imported assets). Each is one
// merged geometry with vertex colours so a whole fleet is a single instanced draw.
// Front = +z, ground at y = 0.

type Part = { g: THREE.BufferGeometry; color: number };
function part(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, ry = 0, rz = 0): Part {
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return { g, color };
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const wheel = (r: number, w: number) => new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2);

function merge(parts: Part[]) {
  const geos = parts.map(({ g, color }) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(color);
    const arr = new Float32Array(ng.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = c.r;
      arr[i + 1] = c.g;
      arr[i + 2] = c.b;
    }
    ng.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    ng.deleteAttribute("uv");
    return ng;
  });
  const m = mergeGeometries(geos)!;
  m.computeVertexNormals();
  m.computeBoundingSphere();
  return m;
}

const BLACK = 0x111111, GLASS = 0x1a242c, TYRE = 0x161616, CHROME = 0xb8bcc2, WHITE = 0xffffff;

function wheels(xs: number, zs: number[], r: number, w = 0.25): Part[] {
  return zs.flatMap((z) => [-1, 1].map((s) => part(wheel(r, w), TYRE, s * xs, r, z)));
}

function danfo() {
  const Y = 0xf2b705; // danfo yellow
  return merge([
    part(box(1.9, 1.75, 4.2), Y, 0, 1.25, -0.2),
    part(box(1.9, 1.2, 0.7), Y, 0, 1.0, 2.15), // short bonnet
    part(box(1.92, 0.12, 4.9), BLACK, 0, 1.05, 0), // black stripe low
    part(box(1.92, 0.12, 4.9), BLACK, 0, 1.45, 0), // black stripe high
    part(box(1.94, 0.6, 3.2), GLASS, 0, 1.75, -0.4), // side windows
    part(box(1.7, 0.7, 0.1), GLASS, 0, 1.75, 1.93), // windscreen
    part(box(1.95, 0.25, 0.3), BLACK, 0, 0.55, 2.5), // bumper
    part(box(1.6, 0.08, 3.4), 0x4a4a4a, 0, 2.2, -0.3), // roof rack
    part(box(1.0, 0.35, 0.8), 0x7a4b2a, 0.2, 2.42, -1.0), // luggage on rack
    ...wheels(0.85, [1.45, -1.55], 0.36),
  ]);
}

function brt() {
  const B = 0x1f4e9a;
  return merge([
    part(box(2.5, 2.6, 11.5), B, 0, 1.75, 0),
    part(box(2.52, 0.35, 11.5), 0xc0392b, 0, 0.75, 0),
    part(box(2.54, 1.0, 10.6), GLASS, 0, 2.25, -0.2),
    part(box(2.3, 1.3, 0.1), GLASS, 0, 2.0, 5.76),
    part(box(2.0, 0.25, 0.1), 0xf2b705, 0, 2.85, 5.78), // destination board
    ...wheels(1.1, [3.9, -3.4], 0.5, 0.35),
  ]);
}

function sedan() {
  return merge([
    part(box(1.8, 0.7, 4.5), WHITE, 0, 0.75, 0), // body (tinted per instance)
    part(box(1.6, 0.55, 2.3), WHITE, 0, 1.35, -0.3),
    part(box(1.62, 0.42, 2.0), GLASS, 0, 1.38, -0.3),
    part(box(1.4, 0.4, 0.1), GLASS, 0, 1.35, 0.86),
    part(box(1.82, 0.18, 0.2), CHROME, 0, 0.5, 2.25),
    ...wheels(0.82, [1.4, -1.35], 0.33),
  ]);
}

function suv() {
  return merge([
    part(box(1.95, 0.95, 4.8), WHITE, 0, 0.95, 0),
    part(box(1.9, 0.75, 3.1), WHITE, 0, 1.8, -0.4),
    part(box(1.92, 0.55, 2.9), GLASS, 0, 1.85, -0.4),
    part(box(1.7, 0.55, 0.1), GLASS, 0, 1.8, 1.16),
    part(box(1.6, 0.06, 2.6), 0x333333, 0, 2.2, -0.4),
    part(box(1.97, 0.25, 0.25), BLACK, 0, 0.6, 2.4),
    ...wheels(0.9, [1.5, -1.5], 0.4, 0.3),
  ]);
}

function rider(top: number, helmet: number): Part[] {
  return [
    part(box(0.42, 0.55, 0.28), top, 0, 1.25, -0.1), // torso
    part(new THREE.SphereGeometry(0.15, 10, 8), helmet, 0, 1.68, -0.08),
    part(box(0.14, 0.5, 0.14), 0x1b1b1b, -0.14, 0.82, 0.12, 0, 0.3), // legs
    part(box(0.14, 0.5, 0.14), 0x1b1b1b, 0.14, 0.82, 0.12, 0, -0.3),
    part(box(0.1, 0.45, 0.1), top, -0.22, 1.25, 0.25, 0, 0.2), // arms
    part(box(0.1, 0.45, 0.1), top, 0.22, 1.25, 0.25, 0, -0.2),
  ];
}

function okada() {
  return merge([
    part(wheel(0.32, 0.1), TYRE, 0, 0.32, 0.65),
    part(wheel(0.32, 0.1), TYRE, 0, 0.32, -0.62),
    part(box(0.25, 0.35, 1.1), 0xb03a2e, 0, 0.65, 0),
    part(box(0.3, 0.12, 0.7), BLACK, 0, 0.88, -0.25),
    part(box(0.7, 0.05, 0.05), CHROME, 0, 1.15, 0.5),
    ...rider(0xe8a33d, 0x2e5e9e),
  ]);
}

function keke() {
  const Y = 0xf2c230, G = 0x1f7a4c;
  return merge([
    part(box(1.3, 0.75, 2.4), Y, 0, 0.85, -0.2),
    part(box(1.35, 0.15, 2.5), G, 0, 0.5, -0.2),
    part(box(1.35, 0.08, 2.5), BLACK, 0, 1.95, -0.25), // canopy
    ...[-0.6, 0.6].flatMap((x) => [part(box(0.05, 1.0, 0.05), BLACK, x, 1.45, 0.8), part(box(0.05, 1.0, 0.05), BLACK, x, 1.45, -1.3)]),
    part(box(1.0, 0.5, 0.06), GLASS, 0, 1.45, 0.9),
    part(wheel(0.25, 0.15), TYRE, 0, 0.25, 1.05),
    ...wheels(0.6, [-0.9], 0.27, 0.15),
  ]);
}

export function vehicleGeometry(kind: VehicleKind) {
  switch (kind) {
    case "danfo": return danfo();
    case "brt": return brt();
    case "car": return sedan();
    case "suv": return suv();
    case "okada": return okada();
    case "keke": return keke();
  }
}

/** Half-extents for traffic collision boxes. */
export const VEHICLE_HALF: Record<VehicleKind, [number, number, number]> = {
  danfo: [0.95, 1.1, 2.5], brt: [1.25, 1.5, 5.8], car: [0.9, 0.75, 2.25], suv: [1.0, 1.0, 2.4], okada: [0.35, 0.8, 0.9], keke: [0.7, 1.0, 1.3],
};
