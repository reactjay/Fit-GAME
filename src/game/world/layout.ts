// The world plan: a compressed, game-scale Lagos (real place names, simplified
// city. Pure data + maths (no three.js) so it can be unit-tested and shared by the
// renderer, physics, minimap and AI. Units are metres; +x is east, +z is south
// (the Atlantic is to the south), y is up. The playable area is 4 km × 4 km.

export const HALF = 2000;
export const WATER = 0;

// ── small maths helpers ──────────────────────────────────────────────
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export function hash2(x: number, y: number) {
  let h = Math.imul(Math.floor(x) | 0, 374761393) ^ Math.imul(Math.floor(y) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x: number, y: number) {
  return vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;
}

// ── coastline, lagoon, island ────────────────────────────────────────
export const coastZ = (x: number) => 1380 + 80 * Math.sin(x / 380) + 35 * Math.sin(x / 140 + 1.3);
export const lagoonZ = (x: number) => 255 + 45 * Math.sin(x / 520 + 0.4);
export const LAGOON_HALF = 85;
/** Five Cowries-style creek between Victoria Island and Lekki (crossed by the Lekki–Ikoyi Link Bridge). */
export const CREEK = { x: 1025, z0: 300, z1: 1260, half: 26 };
export const ISLAND = { x: -650, z: 1830, r: 190 };

export type Rect = { x0: number; x1: number; z0: number; z1: number };
export const inRect = (r: Rect, x: number, z: number, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
const rectDist = (r: Rect, x: number, z: number) => {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
};

export const AIRPORT: Rect = { x0: -1880, x1: -640, z0: -980, z1: -600 };
export const AIRPORT_HEIGHT = 4;
export const RUNWAY = { x0: -1800, x1: -720, z: -820, width: 46 };
export const TAXIWAY = { x0: -1700, x1: -820, z: -740, width: 22 };
export const HILLS = { x: 1350, z: -1250, r: 820, height: 120 };

/** Terrain height (before roads/rails are laid on top). */
export function terrainHeight(x: number, z: number): number {
  let h = 2.2 + 1.4 * (fbm(x / 260, z / 260) - 0.5) * 2;
  // Ridge Hills in the north-east, plus gentler rises in the far north-west.
  const dh = Math.hypot(x - HILLS.x, z - HILLS.z) / HILLS.r;
  h += HILLS.height * Math.pow(1 - smooth(0, 1, dh), 1.6) * (0.65 + 0.7 * fbm(x / 300 + 7, z / 300));
  h += 28 * (1 - smooth(0, 1, Math.hypot(x + 1500, z + 1700) / 650)) * fbm(x / 200, z / 200 + 3);
  // Airport is graded flat.
  h = lerp(AIRPORT_HEIGHT, h, smooth(0, 90, rectDist(AIRPORT, x, z)));
  // Creek between Victoria Island and Lekki.
  if (z > CREEK.z0 - 40 && z < CREEK.z1 + 40) {
    const dc = Math.abs(x - CREEK.x);
    const along = smooth(CREEK.z0 - 40, CREEK.z0, z) * (1 - smooth(CREEK.z1, CREEK.z1 + 40, z));
    h = lerp(h, lerp(-3.5, h, smooth(CREEK.half - 6, CREEK.half + 22, dc)), along);
  }
  // Lagoon channel.
  const dl = Math.abs(z - lagoonZ(x));
  h = lerp(-4.5, h, smooth(LAGOON_HALF - 20, LAGOON_HALF + 30, dl));
  // Beach and sea floor.
  const c = coastZ(x);
  if (z > c - 160) {
    const t = smooth(c - 160, c, z);
    h = lerp(h, 0.6, t);
    if (z > c) h = 0.6 - (z - c) * 0.045;
  }
  // Sunset Island rises from the sea.
  const di = Math.hypot(x - ISLAND.x, z - ISLAND.z);
  if (di < ISLAND.r + 120) h = Math.max(h, lerp(3.2 + 2 * fbm(x / 60, z / 60), -3, smooth(ISLAND.r - 60, ISLAND.r + 110, di)));
  return h;
}

/** Grid the rendered ground (and its physics heightfield) is built on; set by <Terrain>. */
export const groundGrid = { segments: 224 };
/**
 * Height of the ground as actually drawn: the terrain mesh is a grid of flat triangles, so
 * on curved ground it differs from terrainHeight() by up to ~1 m. Things that must sit on the
 * visible surface (vehicles) use this. Same triangle split as three's PlaneGeometry and Rapier.
 */
export function groundHeight(x: number, z: number) {
  const n = groundGrid.segments, cell = (HALF * 2) / n;
  const fx = (x + HALF) / cell, fz = (z + HALF) / cell;
  const ix = clamp(Math.floor(fx), 0, n - 1), iz = clamp(Math.floor(fz), 0, n - 1);
  const u = fx - ix, v = fz - iz;
  const X = (i: number) => -HALF + i * cell, Z = X;
  const hb = terrainHeight(X(ix), Z(iz + 1)), hd = terrainHeight(X(ix + 1), Z(iz));
  if (u + v < 1) {
    const ha = terrainHeight(X(ix), Z(iz));
    return ha + (hd - ha) * u + (hb - ha) * v;
  }
  const hc = terrainHeight(X(ix + 1), Z(iz + 1));
  return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
}

export const isWater =(x: number, z: number) => terrainHeight(x, z) < WATER - 0.2;

/** Ground type for shading and surfaces. */
export function groundType(x: number, z: number): "sand" | "grass" | "paved" | "rock" {
  const c = coastZ(x);
  if (z > c - 130) return "sand";
  if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.r + 30) return Math.hypot(x - ISLAND.x, z - ISLAND.z) > ISLAND.r - 50 ? "sand" : "grass";
  if (Math.abs(z - lagoonZ(x)) < LAGOON_HALF + 25) return "sand";
  if (inRect(AIRPORT, x, z)) return "paved";
  return terrainHeight(x, z) > 70 ? "rock" : "grass";
}

// ── districts (for HUD location + building styles) ───────────────────
export type DistrictId = "central" | "victoria" | "adeyemi" | "mainland" | "estate" | "waterfront" | "beach" | "airport" | "hills" | "island" | "lagoon" | "outskirts";
export const DISTRICTS: { id: DistrictId; name: string; rect?: Rect }[] = [
  { id: "airport", name: "Murtala Muhammed Int'l Airport, Ikeja", rect: AIRPORT },
  { id: "waterfront", name: "Eko Atlantic Waterfront", rect: { x0: -450, x1: 450, z0: 1150, z1: 1330 } },
  { id: "central", name: "Marina & Broad Street, Lagos Island", rect: { x0: -300, x1: 450, z0: 420, z1: 1150 } },
  { id: "victoria", name: "Victoria Island", rect: { x0: 450, x1: 1000, z0: 420, z1: 1300 } },
  { id: "adeyemi", name: "Isale Eko, Lagos Island", rect: { x0: -1050, x1: -300, z0: 420, z1: 1300 } },
  { id: "estate", name: "Lekki Phase 1", rect: { x0: 1050, x1: 1750, z0: 780, z1: 1250 } },
  { id: "mainland", name: "Yaba & Ebute Metta", rect: { x0: -1300, x1: 700, z0: -560, z1: 160 } },
  { id: "hills", name: "Ikorodu" },
  { id: "island", name: "Tarkwa Bay" },
  { id: "beach", name: "Bar Beach" },
  { id: "lagoon", name: "Lagos Lagoon" },
  { id: "outskirts", name: "Lagos" },
];

export function districtAt(x: number, z: number): { id: DistrictId; name: string } {
  if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.r + 60) return DISTRICTS.find((d) => d.id === "island")!;
  if (z > coastZ(x) - 140) return DISTRICTS.find((d) => d.id === "beach")!;
  if (Math.abs(z - lagoonZ(x)) < LAGOON_HALF) return DISTRICTS.find((d) => d.id === "lagoon")!;
  for (const d of DISTRICTS) if (d.rect && inRect(d.rect, x, z)) return d;
  if (Math.hypot(x - HILLS.x, z - HILLS.z) < HILLS.r) return DISTRICTS.find((d) => d.id === "hills")!;
  return DISTRICTS.find((d) => d.id === "outskirts")!;
}

// ── roads ─────────────────────────────────────────────────────────────
export type Road = { id: string; name: string; points: [number, number][]; width: number; kind: "highway" | "avenue" | "street" | "runway" | "taxiway" };

function line(id: string, name: string, a: [number, number], b: [number, number], width: number, kind: Road["kind"], step = 25): Road {
  const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  return { id, name, width, kind, points: Array.from({ length: n + 1 }, (_, i) => [lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)] as [number, number]) };
}
function curve(id: string, name: string, ctrl: [number, number][], width: number, kind: Road["kind"], step = 20): Road {
  // Centripetal-ish Catmull-Rom through the control points.
  const pts: [number, number][] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(ctrl[ctrl.length - 1]);
  return { id, name, points: pts, width, kind };
}

// City grids: avenues (north–south) and streets (east–west).
export const GRIDS = [
  { id: "city", x0: -1050, x1: 1000, z0: 450, z1: 1200, step: 150, district: "city" as const },
  { id: "mainland", x0: -1250, x1: 650, z0: -500, z1: 100, step: 200, district: "mainland" as const },
];

function buildRoads(): Road[] {
  const roads: Road[] = [];
  for (const g of GRIDS) {
    for (let x = g.x0; x <= g.x1 + 1; x += g.step) {
      const z1 = g.id === "city" ? Math.min(g.z1, coastZ(x) - 175) : g.z1;
      roads.push(line(`${g.id}-av-${x}`, x % 600 === 0 ? ["Broad Street", "Awolowo Road", "Adeola Odeku Street", "Ozumba Mbadiwe Avenue"][Math.abs(x / 600) % 4] : "City Street", [x, g.z0], [x, z1], x % 600 === 0 ? 16 : 11, x % 600 === 0 ? "avenue" : "street"));
    }
    for (let z = g.z0; z <= g.z1 + 1; z += g.step) roads.push(line(`${g.id}-st-${z}`, "City Street", [g.x0, z], [g.x1, z], 11, "street"));
  }
  // Coastal Highway runs the length of the shore.
  const coast: [number, number][] = [];
  for (let x = -1950; x <= 1950; x += 40) coast.push([x, coastZ(x) - 165]);
  roads.push({ id: "coastal", name: "Ahmadu Bello Way", points: coast, width: 18, kind: "highway" });
  // Lagoon bridges link Mainland and the city.
  roads.push(line("bridge-west", "Third Mainland Bridge", [-450, -500], [-450, 450], 16, "highway"));
  roads.push(line("bridge-east", "Eko Bridge", [550, -500], [550, 450], 16, "highway"));
  // Airport expressway.
  roads.push(curve("airport-exp", "Airport Road", [[-1250, -300], [-1250, -500], [-1200, -640], [-1050, -660], [-700, -640], [-450, -500]], 16, "highway"));
  // Scenic highway up into Ridge Hills.
  roads.push(curve("scenic", "Ikorodu Road", [[1000, 450], [1150, 250], [1300, -50], [1250, -420], [1050, -780], [1150, -1100], [1450, -1350], [1700, -1500]], 14, "highway"));
  // Northern ring connects the airport side to the hills.
  roads.push(curve("north-ring", "Apapa–Oworonshoki Expressway", [[-1250, -500], [-1300, -1100], [-800, -1450], [0, -1500], [700, -1400], [1050, -780]], 13, "highway"));
  // Palm Crest Estate loop and gate road.
  roads.push(curve("estate", "Admiralty Way", [[960, 900], [1000, 900], [1150, 880], [1450, 860], [1650, 950], [1650, 1120], [1400, 1170], [1150, 1120], [1000, 1050]], 10, "street"));
  // Causeway to Sunset Island.
  roads.push(curve("causeway", "Tarkwa Bay Causeway", [[-450, coastZ(-450) - 165], [-500, coastZ(-500) + 40], [-600, ISLAND.z - ISLAND.r - 20], [-650, ISLAND.z]], 12, "highway"));
  // Airport surfaces.
  roads.push(line("runway", "Runway 09/27", [RUNWAY.x0, RUNWAY.z], [RUNWAY.x1, RUNWAY.z], RUNWAY.width, "runway"));
  roads.push(line("taxiway", "Taxiway A", [TAXIWAY.x0, TAXIWAY.z], [TAXIWAY.x1, TAXIWAY.z], TAXIWAY.width, "taxiway"));
  roads.push(line("taxi-link-w", "Taxiway B", [TAXIWAY.x0, TAXIWAY.z], [TAXIWAY.x0 - 40, RUNWAY.z], 20, "taxiway"));
  roads.push(line("taxi-link-e", "Taxiway C", [TAXIWAY.x1, TAXIWAY.z], [TAXIWAY.x1 + 40, RUNWAY.z], 20, "taxiway"));
  return roads;
}
export const ROADS: Road[] = buildRoads();

// ── railway (closed loop) ────────────────────────────────────────────
export const RAIL_CTRL: [number, number][] = [
  [-1150, -1060], [-500, -1120], [-20, -900], [75, -450], [75, 120], [75, 420], [75, 740], [80, 1010], [330, 1090], [720, 1040], [980, 830],
  [1180, 470], [1330, 40], [1420, -420], [1330, -880], [950, -1230], [300, -1330], [-500, -1300], [-1000, -1220], [-1300, -1150],
];
export const RAIL_GAUGE = 1.435;

/** Dense polyline along the closed rail loop with cumulative distance. */
export const RAIL = (() => {
  const c = RAIL_CTRL;
  const pts: [number, number][] = [];
  const n = c.length;
  for (let i = 0; i < n; i++) {
    const p0 = c[(i - 1 + n) % n], p1 = c[i], p2 = c[(i + 1) % n], p3 = c[(i + 2) % n];
    const steps = Math.max(4, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 6));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const dist = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    dist.push(dist[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  // Track height: follows terrain, smoothed into gentle grades; clears water by 7 m.
  const raw = pts.map(([x, z]) => Math.max(terrainHeight(x, z), WATER + 7));
  const win = 40; // ≈ 240 m moving average
  const heights = raw.map((_, i) => {
    let s = 0;
    for (let k = -win; k <= win; k++) s += raw[(i + k + raw.length) % raw.length];
    return Math.max(s / (2 * win + 1), WATER + 6.5);
  });
  return { pts, dist, heights, length: dist[dist.length - 1] };
})();

export function railAt(s: number) {
  const L = RAIL.length;
  s = ((s % L) + L) % L;
  let lo = 0, hi = RAIL.pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (RAIL.dist[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  const i = lo, j = (i + 1) % RAIL.pts.length;
  const t = (s - RAIL.dist[i]) / (RAIL.dist[i + 1] - RAIL.dist[i] || 1);
  const a = RAIL.pts[i], b = RAIL.pts[j];
  return {
    x: lerp(a[0], b[0], t),
    z: lerp(a[1], b[1], t),
    y: lerp(RAIL.heights[i], RAIL.heights[j], t),
    heading: Math.atan2(b[0] - a[0], b[1] - a[1]),
  };
}

export function nearestRailS(x: number, z: number) {
  let best = 0, bd = Infinity;
  RAIL.pts.forEach(([px, pz], i) => {
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) {
      bd = d;
      best = RAIL.dist[i];
    }
  });
  return { s: best, d: Math.sqrt(bd) };
}

export const STATIONS = [
  { id: "airport", name: "Ikeja Station", near: [-1150, -1060] as [number, number] },
  { id: "central", name: "Marina Station", near: [75, 740] as [number, number] },
  { id: "victoria", name: "Victoria Island Station", near: [720, 1040] as [number, number] },
  { id: "ridge", name: "Ikorodu Station", near: [1330, -880] as [number, number] },
  { id: "mainland", name: "Yaba Station", near: [75, -450] as [number, number] },
].map((st) => ({ ...st, s: nearestRailS(st.near[0], st.near[1]).s }));

// ── train timetable (deterministic from shared clock) ─────────────────
export const TRAIN = { cruise: 24, accel: 0.7, dwell: 28, cars: 4, carLength: 22 };

const sortedStations = [...STATIONS].sort((a, b) => a.s - b.s);
const legs = sortedStations.map((st, i) => {
  const next = sortedStations[(i + 1) % sortedStations.length];
  let d = next.s - st.s;
  if (d <= 0) d += RAIL.length;
  const tAcc = TRAIN.cruise / TRAIN.accel;
  const dAcc = 0.5 * TRAIN.accel * tAcc * tAcc;
  const travel = d >= 2 * dAcc ? 2 * tAcc + (d - 2 * dAcc) / TRAIN.cruise : 2 * Math.sqrt(d / TRAIN.accel);
  return { from: st, to: next, d, travel };
});
export const TRAIN_LOOP_SECONDS = legs.reduce((a, l) => a + TRAIN.dwell + l.travel, 0);

/** Where the train is (arc length), how fast, and which station it's standing at. */
export function trainState(seconds: number) {
  let t = ((seconds % TRAIN_LOOP_SECONDS) + TRAIN_LOOP_SECONDS) % TRAIN_LOOP_SECONDS;
  for (const leg of legs) {
    if (t < TRAIN.dwell) return { s: leg.from.s, speed: 0, station: leg.from, departsIn: TRAIN.dwell - t, next: leg.to };
    t -= TRAIN.dwell;
    if (t < leg.travel) {
      const tAcc = Math.min(TRAIN.cruise / TRAIN.accel, leg.travel / 2);
      const vmax = TRAIN.accel * tAcc;
      let d: number, v: number;
      if (t < tAcc) {
        d = 0.5 * TRAIN.accel * t * t;
        v = TRAIN.accel * t;
      } else if (t < leg.travel - tAcc) {
        d = 0.5 * TRAIN.accel * tAcc * tAcc + vmax * (t - tAcc);
        v = vmax;
      } else {
        const r = leg.travel - t;
        d = leg.d - 0.5 * TRAIN.accel * r * r;
        v = TRAIN.accel * r;
      }
      return { s: (leg.from.s + d) % RAIL.length, speed: v, station: null, departsIn: 0, next: leg.to };
    }
    t -= leg.travel;
  }
  const first = legs[0];
  return { s: first.from.s, speed: 0, station: first.from, departsIn: 0, next: first.to };
}

// ── spatial helpers for placement ─────────────────────────────────────
function segDist(px: number, pz: number, a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const t = clamp(((px - a[0]) * vx + (pz - a[1]) * vz) / (vx * vx + vz * vz || 1), 0, 1);
  return Math.hypot(px - (a[0] + vx * t), pz - (a[1] + vz * t));
}

const CELL = 100;
const roadIndex = new Map<string, { a: [number, number]; b: [number, number]; half: number }[]>();
for (const r of ROADS) {
  for (let i = 0; i < r.points.length - 1; i++) {
    const a = r.points[i], b = r.points[i + 1];
    const seg = { a, b, half: r.width / 2 };
    const minx = Math.floor((Math.min(a[0], b[0]) - 40) / CELL), maxx = Math.floor((Math.max(a[0], b[0]) + 40) / CELL);
    const minz = Math.floor((Math.min(a[1], b[1]) - 40) / CELL), maxz = Math.floor((Math.max(a[1], b[1]) + 40) / CELL);
    for (let cx = minx; cx <= maxx; cx++)
      for (let cz = minz; cz <= maxz; cz++) {
        const k = `${cx},${cz}`;
        if (!roadIndex.has(k)) roadIndex.set(k, []);
        roadIndex.get(k)!.push(seg);
      }
  }
}
/** Distance from a point to the nearest road edge (negative = on the road). */
export function roadClearance(x: number, z: number) {
  const segs = roadIndex.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
  if (!segs) return 60;
  let best = 60;
  for (const s of segs) best = Math.min(best, segDist(x, z, s.a, s.b) - s.half);
  return best;
}
export function railClearance(x: number, z: number) {
  return nearestRailS(x, z).d;
}

// ── buildings ─────────────────────────────────────────────────────────
export type BuildingStyle = "glass" | "office" | "residential" | "house" | "villa" | "hotel" | "mall" | "terminal" | "hangar" | "warehouse";
export type Building = { x: number; z: number; w: number; d: number; h: number; rot: number; style: BuildingStyle; color: number; y: number };

const PLASTER = [0xe8d8b8, 0xd9b48f, 0xc9e0d4, 0xf0e6d2, 0xe2c2a6, 0xd3dce6, 0xf2d0a4, 0xe9c9c0];

/** Sites reserved for landmarks (no ordinary buildings there). */
export const SITES = {
  nationalTheatre: { x: 380, z: -110, r: 95 },
  tbs: { x: -150, z: 600, r: 70 }, // Tafawa Balewa Square
  tollGate: { x: 1500, z: 0, r: 0 }, // placed on the coast road at runtime
  gateway: { x: -450, z: -470, r: 30 },
  balogun: { x: -760, z: 760, r: 120 }, // Balogun Market
  yabaMarket: { x: -650, z: -260, r: 90 },
};
const SITE_LIST = Object.values(SITES).filter((s) => s.r > 0);

function placeLot(out: Building[], x: number, z: number, w: number, d: number, style: BuildingStyle, h: number, color: number) {
  if (SITE_LIST.some((st) => Math.hypot(x - st.x, z - st.z) < st.r + Math.max(w, d) / 2)) return;
  // Keep every corner (plus a margin) off roads, rails and water.
  const corners: [number, number][] = [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2], [x, z]];
  for (const [cx, cz] of corners) {
    if (roadClearance(cx, cz) < 4 || railClearance(cx, cz) < 12 || terrainHeight(cx, cz) < WATER + 0.8) return;
  }
  const y = Math.min(...corners.map(([cx, cz]) => terrainHeight(cx, cz)));
  out.push({ x, z, w, d, h, rot: 0, style, color, y });
}

function buildBuildings(): Building[] {
  const out: Building[] = [];
  const city = GRIDS[0];
  for (let x = city.x0; x < city.x1; x += city.step) {
    for (let z = city.z0; z < city.z1; z += city.step) {
      const cx = x + city.step / 2, cz = z + city.step / 2;
      const dist = districtAt(cx, cz).id;
      const r = hash2(cx, cz);
      if (dist === "central") {
        // Towers: 2 per block, varied heights.
        for (const [ox, oz] of [[-32, -30], [32, 30]]) {
          const h = 45 + Math.pow(hash2(cx + ox, cz + oz), 1.6) * 150;
          placeLot(out, cx + ox, cz + oz, 46 + r * 10, 44, hash2(cx, oz) > 0.45 ? "glass" : "office", h, 0x9fb4c8);
        }
        for (const [ox, oz] of [[-32, 32], [32, -32]]) placeLot(out, cx + ox, cz + oz, 40, 40, "office", 18 + r * 22, PLASTER[(r * 8) | 0]);
      } else if (dist === "victoria") {
        if (r < 0.22) placeLot(out, cx, cz, 110, 90, "mall", 16, 0xe9e4da);
        else if (r < 0.4) placeLot(out, cx, cz, 70, 50, "hotel", 40 + r * 60, 0xf3efe6);
        else for (const [ox, oz] of [[-33, -33], [33, -33], [-33, 33], [33, 33]]) placeLot(out, cx + ox, cz + oz, 42, 42, "office", 12 + hash2(cx + ox, cz) * 30, PLASTER[(hash2(ox, cz) * 8) | 0]);
      } else if (dist === "waterfront") {
        // Eko Atlantic: new glass towers by the sea.
        placeLot(out, cx - 30, cz, 40, 40, "glass", 70 + r * 90, 0xa9c4d8);
        placeLot(out, cx + 32, cz, 36, 36, "glass", 45 + hash2(cz, cx) * 70, 0xb8cfe0);
      } else {
        // Residential walk-ups and houses with gaps for yards.
        for (const [ox, oz] of [[-36, -36], [36, -36], [-36, 36], [36, 36], [0, 0]]) {
          if (hash2(cx + ox * 3, cz + oz * 7) < 0.18) continue;
          const tall = hash2(cx + ox, cz - oz) > 0.6;
          placeLot(out, cx + ox, cz + oz, tall ? 30 : 22, tall ? 26 : 18, tall ? "residential" : "house", tall ? 12 + r * 10 : 6 + r * 3, PLASTER[(hash2(cx - ox, cz + oz) * 8) | 0]);
        }
      }
    }
  }
  const main = GRIDS[1];
  for (let x = main.x0; x < main.x1; x += main.step)
    for (let z = main.z0; z < main.z1; z += main.step) {
      const cx = x + main.step / 2, cz = z + main.step / 2;
      for (let i = 0; i < 9; i++) {
        const ox = ((i % 3) - 1) * 55, oz = (Math.floor(i / 3) - 1) * 55;
        const rr = hash2(cx + ox, cz + oz);
        if (rr < 0.15) continue;
        if (rr > 0.9) placeLot(out, cx + ox, cz + oz, 40, 30, "warehouse", 9, 0xb8bcc2);
        else placeLot(out, cx + ox, cz + oz, 24, 20, rr > 0.6 ? "residential" : "house", rr > 0.6 ? 10 + rr * 8 : 6.5, PLASTER[(rr * 8) | 0]);
      }
    }
  // Palm Crest Estate villas.
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const x = 1325 + Math.cos(a) * 250, z = 1015 + Math.sin(a) * 95;
    placeLot(out, x + Math.cos(a) * 45, z + Math.sin(a) * 30, 26, 20, "villa", 7.5, 0xf4efe6);
  }
  // Sunset Island resort.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    placeLot(out, ISLAND.x + Math.cos(a) * 85, ISLAND.z + Math.sin(a) * 85, 28, 18, "villa", 7, 0xf8f4ec);
  }
  placeLot(out, ISLAND.x + 10, ISLAND.z - 5, 60, 30, "hotel", 14, 0xf8f4ec);
  // Airport.
  placeLot(out, -1200, -665, 260, 50, "terminal", 22, 0xdfe6ee);
  for (let i = 0; i < 3; i++) placeLot(out, -1700 + i * 95, -675, 70, 55, "hangar", 18, 0xc7ccd3);
  // Hill villages.
  for (let i = 0; i < 40; i++) {
    const a = hash2(i, 9) * Math.PI * 2, r = 250 + hash2(i, 3) * 450;
    placeLot(out, HILLS.x + Math.cos(a) * r, HILLS.z + Math.sin(a) * r, 16, 14, "house", 6, PLASTER[i % 8]);
  }
  return out;
}
export const BUILDINGS: Building[] = buildBuildings();

// ── trees / palms / streetlights ──────────────────────────────────────
export type Prop = { x: number; z: number; y: number; s: number; r: number };
function buildProps() {
  const palms: Prop[] = [];
  const trees: Prop[] = [];
  const lights: Prop[] = [];
  const blockedByBuilding = (x: number, z: number) => BUILDINGS.some((b) => Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3);
  // Palms along the coastal highway, beach and island.
  for (let x = -1950; x <= 1950; x += 26) {
    const z = coastZ(x) - 165 + 14 * (hash2(x, 1) > 0.5 ? 1 : -1);
    if (roadClearance(x, z) > 1.5 && hash2(x, 2) > 0.2) palms.push({ x, z, y: terrainHeight(x, z), s: 0.85 + hash2(x, 3) * 0.4, r: hash2(x, 4) * 6.28 });
    const bz = coastZ(x) - 70 - hash2(x, 5) * 50;
    if (hash2(x, 6) > 0.55) palms.push({ x: x + 8, z: bz, y: terrainHeight(x + 8, bz), s: 0.8 + hash2(x, 7) * 0.5, r: hash2(x, 8) * 6.28 });
  }
  for (let i = 0; i < 60; i++) {
    const a = hash2(i, 11) * Math.PI * 2, r = hash2(i, 12) * (ISLAND.r - 20);
    const x = ISLAND.x + Math.cos(a) * r, z = ISLAND.z + Math.sin(a) * r;
    if (roadClearance(x, z) > 2 && !blockedByBuilding(x, z)) palms.push({ x, z, y: terrainHeight(x, z), s: 0.8 + hash2(i, 13) * 0.5, r: a });
  }
  // Forests on Ridge Hills and the north-west.
  for (let i = 0; i < 2600; i++) {
    const x = -2000 + hash2(i, 21) * 4000, z = -2000 + hash2(i, 22) * 2200;
    const hill = Math.hypot(x - HILLS.x, z - HILLS.z) < HILLS.r || Math.hypot(x + 1500, z + 1700) < 650 || z < -1550;
    if (!hill || inRect(AIRPORT, x, z, 60)) continue;
    if (roadClearance(x, z) < 6 || railClearance(x, z) < 10 || blockedByBuilding(x, z) || terrainHeight(x, z) < 1) continue;
    trees.push({ x, z, y: terrainHeight(x, z), s: 0.7 + hash2(i, 23) * 0.8, r: hash2(i, 24) * 6.28 });
  }
  // Street trees in residential areas.
  for (let i = 0; i < 1400; i++) {
    const x = -1300 + hash2(i, 31) * 2400, z = -560 + hash2(i, 32) * 1800;
    const d = districtAt(x, z).id;
    if (!["adeyemi", "mainland", "estate", "victoria"].includes(d)) continue;
    const rc = roadClearance(x, z);
    if (rc < 3 || rc > 9 || railClearance(x, z) < 8 || blockedByBuilding(x, z)) continue;
    (d === "estate" || hash2(i, 33) > 0.6 ? palms : trees).push({ x, z, y: terrainHeight(x, z), s: 0.6 + hash2(i, 34) * 0.4, r: hash2(i, 35) * 6.28 });
  }
  // Streetlights every ~45 m along avenues and highways.
  for (const r of ROADS) {
    if (r.kind === "runway" || r.kind === "taxiway") continue;
    let acc = 0;
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1], b = r.points[i];
      acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc < (r.kind === "street" ? 60 : 45)) continue;
      acc = 0;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const side = i % 2 ? 1 : -1;
      const ox = -Math.sin(ang) * (r.width / 2 + 1.5) * side, oz = Math.cos(ang) * (r.width / 2 + 1.5) * side;
      const x = b[0] + ox, z = b[1] + oz;
      if (terrainHeight(x, z) < WATER) continue; // bridges get lights from the deck renderer
      lights.push({ x, z, y: terrainHeight(x, z), s: 1, r: ang + (side > 0 ? Math.PI : 0) });
    }
  }
  return { palms, trees, lights };
}
export const PROPS = buildProps();

// ── points of interest & spawns ───────────────────────────────────────
export const LANDMARKS = [
  { id: "sunset-point", name: "Bar Beach Sunset", x: 300, z: coastZ(300) - 40, kind: "romance", text: "Watch the sun go down together" },
  { id: "rooftop", name: "Eko Skyline Rooftop", x: 0, z: 0, kind: "romance", text: "Dinner above the city" },
  { id: "pier", name: "Marina Jetty", x: -150, z: coastZ(-150) + 30, kind: "romance", text: "Walk to the end of the pier" },
  { id: "island", name: "Tarkwa Bay", x: ISLAND.x, z: ISLAND.z, kind: "romance", text: "A private island for two" },
  { id: "lookout", name: "Ikorodu Lookout", x: HILLS.x - 120, z: HILLS.z + 60, kind: "romance", text: "All of Lagos at your feet" },
  { id: "airport", name: "Murtala Muhammed Int'l Airport, Ikeja", x: -1200, z: -700, kind: "transport", text: "Fly the jet" },
  ...STATIONS.map((s) => ({ id: `stn-${s.id}`, name: s.name, x: railAt(s.s).x, z: railAt(s.s).z, kind: "transport", text: "Ride the train together" })),
] as { id: string; name: string; x: number; z: number; kind: "romance" | "transport"; text: string }[];

// The rooftop restaurant sits on top of the tallest central tower.
const tallest = BUILDINGS.filter((b) => b.style === "glass").sort((a, b) => b.h - a.h)[0];
if (tallest) Object.assign(LANDMARKS.find((l) => l.id === "rooftop")!, { x: tallest.x, z: tallest.z });
export const ROOFTOP = tallest ? { x: tallest.x, z: tallest.z, y: tallest.y + tallest.h, w: tallest.w, d: tallest.d } : null;

// ── date spots: little scenes that light up when you're both there ────
export type DateKind = "sunset" | "dinner" | "bonfire";
/** Seats are [dx, dz, facing] relative to the spot; facing 0 looks toward +z. */
export type DateSpot = { id: string; name: string; emoji: string; kind: DateKind; x: number; y: number; z: number; seats: [number, number, number][] };
const beachZ = coastZ(300) - 25;
export const DATE_SPOTS: DateSpot[] = [
  { id: "picnic", name: "Sunset picnic", emoji: "🧺", kind: "sunset", x: 300, y: terrainHeight(300, beachZ), z: beachZ, seats: [[-0.8, 0, 0], [0.8, 0, 0]] },
  ...(ROOFTOP
    ? [{ id: "dinner", name: "Rooftop dinner", emoji: "🕯️", kind: "dinner" as const, x: ROOFTOP.x, y: ROOFTOP.y, z: ROOFTOP.z + 8, seats: [[0, -0.95, 0], [0, 0.95, Math.PI]] as [number, number, number][] }]
    : []),
  { id: "bonfire", name: "Island bonfire", emoji: "🔥", kind: "bonfire", x: ISLAND.x + 40, y: terrainHeight(ISLAND.x + 40, ISLAND.z + 60), z: ISLAND.z + 60, seats: [[-1.6, -1.1, 0.95], [1.6, -1.1, -0.95]] },
];
/** Where the rooftop lift waits at street level. */
export const LIFT = ROOFTOP ? { x: ROOFTOP.x, z: ROOFTOP.z + ROOFTOP.d / 2 + 1.5 } : null;

export const SPAWN = { x: 160, z: coastZ(160) - 120 };

export const PARKING: { id: string; x: number; z: number; heading: number; color: string }[] = [
  { id: "car-1", x: SPAWN.x + 14, z: SPAWN.z - 30, heading: Math.PI / 2, color: "#b3001b" },
  { id: "car-2", x: SPAWN.x + 14, z: SPAWN.z - 38, heading: Math.PI / 2, color: "#f2f2f2" },
  { id: "car-3", x: -1150, z: -560, heading: 0, color: "#101820" },
  { id: "car-4", x: 1160, z: 878, heading: Math.PI / 2, color: "#f5b700" },
  { id: "car-5", x: 0, z: -470, heading: 0, color: "#1d4e89" },
];

export const JET_SPAWN = { x: -1700, z: -740, heading: Math.PI / 2 };
