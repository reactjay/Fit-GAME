// Floor plan of the 3D home: walls, furniture spots, fixed seats and a walking grid.
// Metres; +x right, +z toward the front door. The house spans x −9…9, z −7…7.

export const WALL_H = 2.3;
export const WALL_T = 0.16;

export type Wall = { a: [number, number]; b: [number, number]; exterior?: boolean; normal?: [number, number] };
export type Room = { id: string; name: string; x0: number; x1: number; z0: number; z1: number; floor: "wood" | "tile" | "carpet" | "dark" };

export const ROOMS: Room[] = [
  { id: "living", name: "Living room", x0: -9, x1: 1, z0: -7, z1: 7, floor: "dark" },
  { id: "bedroom", name: "Bedroom", x0: 1, x1: 9, z0: -7, z1: -1.5, floor: "carpet" },
  { id: "kitchen", name: "Kitchen", x0: 1, x1: 9, z0: -1.5, z1: 3.5, floor: "tile" },
  { id: "bath", name: "Bathroom", x0: 1, x1: 9, z0: 3.5, z1: 7, floor: "tile" },
];

export const FRONT_DOOR = { x0: -6.6, x1: -5.2, z: 7 };

export const WALLS: Wall[] = [
  // exterior (normal points outward)
  { a: [-9, -7], b: [9, -7], exterior: true, normal: [0, -1] },
  { a: [9, -7], b: [9, 7], exterior: true, normal: [1, 0] },
  { a: [-9, -7], b: [-9, 7], exterior: true, normal: [-1, 0] },
  { a: [-9, 7], b: [FRONT_DOOR.x0, 7], exterior: true, normal: [0, 1] },
  { a: [FRONT_DOOR.x1, 7], b: [9, 7], exterior: true, normal: [0, 1] },
  // living | right wing, with doorways to the bedroom, kitchen (wide) and bathroom
  { a: [1, -7], b: [1, -4.6] },
  { a: [1, -3.3], b: [1, -0.6] },
  { a: [1, 2.4], b: [1, 4.4] },
  { a: [1, 5.7], b: [1, 7] },
  // bedroom | kitchen, kitchen | bathroom
  { a: [1, -1.5], b: [9, -1.5] },
  { a: [1, 3.5], b: [9, 3.5] },
];

/** A spot where a piece of furniture can go. ry: which way it faces (0 = toward +z). */
export type Slot = { x: number; z: number; ry: number; room: string; wall?: boolean };
export const SLOTS: Slot[] = [
  { x: -4.2, z: 0.6, ry: 0, room: "living" }, // 0 centre (rug)
  { x: -4.2, z: -2.6, ry: 0, room: "living" }, // 1 back (sofa)
  { x: -7.9, z: 0.6, ry: Math.PI / 2, room: "living" }, // 2 left wall
  { x: -0.4, z: 0.6, ry: -Math.PI / 2, room: "living" }, // 3 by the kitchen opening
  { x: -2.4, z: -6.2, ry: 0, room: "living" }, // 4 back wall
  { x: -8.0, z: 5.6, ry: Math.PI / 2, room: "living" }, // 5 front-left corner
  { x: -1.0, z: 5.9, ry: Math.PI, room: "living" }, // 6 front-right corner
  { x: -3.4, z: 4.6, ry: Math.PI, room: "living" }, // 7 front, facing the sofa
  { x: 5.6, z: -5.4, ry: 0, room: "bedroom" }, // 8 bed
  { x: 8.1, z: -3.4, ry: -Math.PI / 2, room: "bedroom" }, // 9 bedroom right wall
  { x: 2.2, z: -6.2, ry: 0, room: "bedroom" }, // 10 bedroom corner
  { x: 3.4, z: -2.3, ry: Math.PI, room: "bedroom" }, // 11 by the bedroom door
  { x: 2.0, z: 2.7, ry: Math.PI / 2, room: "kitchen" }, // 12 kitchen corner
  { x: 6.8, z: 5.6, ry: Math.PI, room: "bath" }, // 13 bathtub spot
  { x: -5.6, z: 10, ry: Math.PI, room: "yard" }, // 14 front yard
  { x: 3.5, z: 10, ry: Math.PI, room: "yard" }, // 15 front yard
];
/** What sits in a spot until you place something there. */
export const STARTER: Record<number, string> = { 0: "starter_table", 1: "starter_sofa", 8: "starter_bed" };

/** Fixed seats that are part of the house itself. */
export type Seat = { x: number; z: number; ry: number; label: string; group: string };
export const KITCHEN_ISLAND = { x: 5, z: 0.9, w: 2.4, d: 1.0 };
export const FIXED_SEATS: Seat[] = [
  { x: 4.4, z: 1.9, ry: Math.PI, label: "🍽️ Eat together", group: "island" },
  { x: 5.6, z: 1.9, ry: Math.PI, label: "🍽️ Eat together", group: "island" },
];

// ── walking grid + A* ────────────────────────────────────────────────
export const GRID = { x0: -10, z0: -8, x1: 14, z1: 12.5, cell: 0.25 };
const NX = Math.round((GRID.x1 - GRID.x0) / GRID.cell);
const NZ = Math.round((GRID.z1 - GRID.z0) / GRID.cell);

export type Blocker = { x: number; z: number; hw: number; hd: number; ry: number };

/** Builds the blocked-cell map from walls, fixed fittings and placed furniture footprints. */
export function buildGrid(blockers: Blocker[]) {
  const blocked = new Uint8Array(NX * NZ);
  const pad = 0.28;
  for (let iz = 0; iz < NZ; iz++)
    for (let ix = 0; ix < NX; ix++) {
      const x = GRID.x0 + (ix + 0.5) * GRID.cell, z = GRID.z0 + (iz + 0.5) * GRID.cell;
      let b = Math.hypot(x - 2, z - 2) > 15.5; // the edge of the lawn
      for (const w of WALLS) {
        if (b) break;
        const [ax, az] = w.a, [bx, bz] = w.b;
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < WALL_T / 2 + pad) b = true;
      }
      for (const o of blockers) {
        if (b) break;
        const c = Math.cos(-o.ry), s = Math.sin(-o.ry);
        const lx = (x - o.x) * c - (z - o.z) * s, lz = (x - o.x) * s + (z - o.z) * c;
        if (Math.abs(lx) < o.hw + pad * 0.6 && Math.abs(lz) < o.hd + pad * 0.6) b = true;
      }
      blocked[iz * NX + ix] = b ? 1 : 0;
    }
  return blocked;
}

const cellOf = (x: number, z: number) => [Math.floor((x - GRID.x0) / GRID.cell), Math.floor((z - GRID.z0) / GRID.cell)] as const;
const centre = (ix: number, iz: number) => [GRID.x0 + (ix + 0.5) * GRID.cell, GRID.z0 + (iz + 0.5) * GRID.cell] as [number, number];

function nearestFree(blocked: Uint8Array, ix: number, iz: number) {
  for (let r = 0; r < 12; r++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const x = ix + dx, z = iz + dz;
        if (x >= 0 && z >= 0 && x < NX && z < NZ && !blocked[z * NX + x]) return [x, z] as const;
      }
  return null;
}

/** Shortest walkable path (8-way A*), simplified to its corners. Returns world points, or null. */
export function findPath(blocked: Uint8Array, from: [number, number], to: [number, number]): [number, number][] | null {
  const s0 = cellOf(...from), g0 = cellOf(...to);
  const s = nearestFree(blocked, Math.max(0, Math.min(NX - 1, s0[0])), Math.max(0, Math.min(NZ - 1, s0[1])));
  const g = nearestFree(blocked, Math.max(0, Math.min(NX - 1, g0[0])), Math.max(0, Math.min(NZ - 1, g0[1])));
  if (!s || !g) return null;
  const start = s[1] * NX + s[0], goal = g[1] * NX + g[0];
  const gScore = new Float32Array(NX * NZ).fill(Infinity);
  const came = new Int32Array(NX * NZ).fill(-1);
  const heap: [number, number][] = [];
  const push = (f: number, n: number) => {
    heap.push([f, n]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const h = (n: number) => Math.hypot((n % NX) - g[0], Math.floor(n / NX) - g[1]);
  gScore[start] = 0;
  push(h(start), start);
  while (heap.length) {
    const [, n] = pop();
    if (n === goal) break;
    const nx = n % NX, nz = Math.floor(n / NX);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = nx + dx, z = nz + dz;
        if (x < 0 || z < 0 || x >= NX || z >= NZ) continue;
        const m = z * NX + x;
        if (blocked[m] || (dx && dz && (blocked[nz * NX + x] || blocked[z * NX + nx]))) continue;
        const ng = gScore[n] + (dx && dz ? Math.SQRT2 : 1);
        if (ng < gScore[m]) {
          gScore[m] = ng;
          came[m] = n;
          push(ng + h(m), m);
        }
      }
  }
  if (start !== goal && came[goal] < 0) return null;
  const cells: number[] = [];
  for (let n = goal; n !== -1; n = n === start ? -1 : came[n]) cells.push(n);
  cells.reverse();
  // Keep only the points where we need to turn (line of sight on the grid).
  const pts = cells.map((n) => centre(n % NX, Math.floor(n / NX)));
  const out: [number, number][] = [pts[0]];
  let anchor = 0;
  for (let i = 2; i < pts.length; i++) if (!clear(blocked, pts[anchor], pts[i])) out.push(pts[(anchor = i - 1)]);
  const goalFree = g0[0] >= 0 && g0[1] >= 0 && g0[0] < NX && g0[1] < NZ && !blocked[g0[1] * NX + g0[0]];
  out.push(goalFree ? to : pts[pts.length - 1]);
  return out;
}

function clear(blocked: Uint8Array, a: [number, number], b: [number, number]) {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (GRID.cell * 0.5));
  for (let i = 1; i < steps; i++) {
    const [ix, iz] = cellOf(a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps);
    if (blocked[iz * NX + ix]) return false;
  }
  return true;
}
