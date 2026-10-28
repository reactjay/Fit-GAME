import { ROADS, WATER, terrainHeight, type Road } from "./layout";

// Road height profile: follows the terrain, but rises onto bridge decks where it
// crosses water, with gentle ramps (moving average) and never below the ground.
export function roadHeights(r: Road) {
  const raw = r.points.map(([x, z]) => {
    const t = terrainHeight(x, z);
    return t < WATER + 0.5 ? WATER + 9 : t;
  });
  const win = r.kind === "runway" || r.kind === "taxiway" ? 0 : 6;
  return raw.map((_, i) => {
    let s = 0, n = 0;
    for (let k = -win; k <= win; k++) {
      const j = Math.min(raw.length - 1, Math.max(0, i + k));
      s += raw[j];
      n++;
    }
    const [x, z] = r.points[i];
    return Math.max(s / n, terrainHeight(x, z)) + (r.kind === "highway" ? 0.14 : r.kind === "avenue" ? 0.12 : r.kind === "street" ? 0.1 : 0.08);
  });
}

type RoadSeg = { a: [number, number]; b: [number, number]; ya: number; yb: number; half: number };

const CELL = 80;
let spatialIndex: Map<string, RoadSeg[]> | null = null;

function getSpatialIndex() {
  if (spatialIndex) return spatialIndex;
  spatialIndex = new Map();
  for (const r of ROADS) {
    const ys = roadHeights(r);
    const extra = r.kind !== "highway" ? 3.5 : 1.0;
    const half = r.width / 2 + extra;
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i], b = r.points[i + 1];
      const ya = ys[i], yb = ys[i + 1];
      const seg: RoadSeg = { a, b, ya, yb, half };
      const minx = Math.floor((Math.min(a[0], b[0]) - half) / CELL);
      const maxx = Math.floor((Math.max(a[0], b[0]) + half) / CELL);
      const minz = Math.floor((Math.min(a[1], b[1]) - half) / CELL);
      const maxz = Math.floor((Math.max(a[1], b[1]) + half) / CELL);
      for (let cx = minx; cx <= maxx; cx++) {
        for (let cz = minz; cz <= maxz; cz++) {
          const k = `${cx},${cz}`;
          let list = spatialIndex.get(k);
          if (!list) spatialIndex.set(k, (list = []));
          list.push(seg);
        }
      }
    }
  }
  return spatialIndex;
}

/** Returns the road / bridge deck height at (x, z), or null if off-road. */
export function roadHeightAt(x: number, z: number): number | null {
  const index = getSpatialIndex();
  const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const segs = index.get(k);
  if (!segs || segs.length === 0) return null;
  let bestY: number | null = null;
  for (const s of segs) {
    const vx = s.b[0] - s.a[0], vz = s.b[1] - s.a[1];
    const lenSq = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * vx + (z - s.a[1]) * vz) / lenSq));
    const px = s.a[0] + vx * t, pz = s.a[1] + vz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist <= s.half) {
      const y = s.ya + (s.yb - s.ya) * t;
      if (bestY === null || y > bestY) bestY = y;
    }
  }
  return bestY;
}

/** Effective ground / road / bridge surface height at (x, z). */
export function surfaceHeight(x: number, z: number): number {
  const th = Math.max(terrainHeight(x, z), WATER);
  const rh = roadHeightAt(x, z);
  return rh !== null ? Math.max(rh, th) : th;
}
