// Lagos street life as data: traffic routes, pedestrian paths, markets, bus stops,
// electric poles, billboards and road signs. Everything moving is a pure function
// of the shared world clock, so both partners see the same danfo at the same stop.
import { BUILDINGS, ROADS, SITES, districtAt, hash2, roadClearance, terrainHeight, type Road } from "./layout";
import { roadHeights } from "./roadHeights";

export type Route = { road: Road; pts: [number, number][]; ys: number[]; cum: number[]; length: number; lanes: number };

function makeRoute(road: Road): Route {
  const ys = roadHeights(road);
  const cum = [0];
  for (let i = 1; i < road.points.length; i++) cum.push(cum[i - 1] + Math.hypot(road.points[i][0] - road.points[i - 1][0], road.points[i][1] - road.points[i - 1][1]));
  return { road, pts: road.points, ys, cum, length: cum[cum.length - 1], lanes: road.width >= 16 ? 2 : 1 };
}

/** Point on a route at distance d, offset sideways (positive = right of travel direction). */
export function routePoint(r: Route, d: number, side: number) {
  d = Math.max(0, Math.min(r.length - 0.01, d));
  let lo = 0, hi = r.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (r.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const t = (d - r.cum[lo]) / (r.cum[hi] - r.cum[lo] || 1);
  const [ax, az] = r.pts[lo], [bx, bz] = r.pts[hi];
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len; // left normal
  return {
    x: ax + dx * t - nx * side,
    z: az + dz * t - nz * side,
    y: r.ys[lo] + (r.ys[hi] - r.ys[lo]) * t,
    heading: Math.atan2(dx, dz),
  };
}

const drivable = ROADS.filter((r) => r.kind !== "runway" && r.kind !== "taxiway" && r.points.length > 3);
export const ROUTES: Route[] = drivable.map(makeRoute).filter((r) => r.length > 150);
const routeByName = (name: string) => ROUTES.filter((r) => r.road.name === name);

// ── traffic ───────────────────────────────────────────────────────────
export type VehicleKind = "danfo" | "brt" | "car" | "suv" | "okada" | "keke";
export type TrafficVehicle = { id: number; kind: VehicleKind; route: number; offset: number; speed: number; lane: number; color: number; stops: boolean };

const CAR_COLORS = [0xf2f2f2, 0x1b1b1b, 0x8a8f96, 0x2b3a67, 0x7a1f1f, 0xc0c4c8, 0x234f3a, 0xd9d4c7];
const SPEED: Record<VehicleKind, [number, number]> = { danfo: [9, 13], brt: [10, 12], car: [11, 16], suv: [11, 15], okada: [10, 15], keke: [7, 9] };

export function buildTraffic(scale: number): TrafficVehicle[] {
  const out: TrafficVehicle[] = [];
  const majors = ROUTES.filter((r) => r.road.kind === "highway" || r.road.kind === "avenue");
  const streets = ROUTES.filter((r) => r.road.kind === "street");
  const brtRoutes = [...routeByName("Ikorodu Road"), ...routeByName("Ahmadu Bello Way")];
  const plan: [VehicleKind, number, Route[]][] = [
    ["danfo", 46, majors],
    ["car", 60, majors],
    ["suv", 26, majors],
    ["okada", 40, [...streets, ...majors]],
    ["keke", 30, streets],
    ["brt", 6, brtRoutes],
  ];
  let id = 0;
  for (const [kind, count, pool] of plan) {
    const n = Math.round(count * scale);
    for (let i = 0; i < n && pool.length; i++) {
      const seed = id * 7.31 + i;
      const route = ROUTES.indexOf(pool[Math.floor(hash2(seed, 1) * pool.length)]);
      const [lo, hi] = SPEED[kind];
      const lane = kind === "okada" || kind === "keke" ? 1 : ROUTES[route].lanes > 1 && hash2(seed, 2) > 0.5 ? 1 : 0;
      out.push({
        id: id++,
        kind,
        route,
        offset: hash2(seed, 3) * 10000,
        speed: lo + hash2(seed, 4) * (hi - lo),
        lane,
        color: kind === "car" || kind === "suv" ? CAR_COLORS[Math.floor(hash2(seed, 5) * CAR_COLORS.length)] : 0xffffff,
        stops: kind === "danfo" || kind === "brt",
      });
    }
  }
  return out;
}

const STOP_EVERY = 320; // metres between danfo stops
const DWELL = 7; // seconds at each stop

/** Where a traffic vehicle is at a given moment (ping-pong along its route; danfos pause at stops). */
export function trafficPose(v: TrafficVehicle, seconds: number) {
  const r = ROUTES[v.route];
  let dist: number;
  let stopped = false;
  if (v.stops) {
    const cycle = STOP_EVERY / v.speed + DWELL;
    const tt = seconds + v.offset / v.speed;
    const n = Math.floor(tt / cycle);
    const f = tt - n * cycle;
    const move = Math.min(f, STOP_EVERY / v.speed);
    stopped = f > STOP_EVERY / v.speed;
    dist = n * STOP_EVERY + move * v.speed;
  } else dist = v.offset + seconds * v.speed;
  const L = r.length;
  const u = ((dist % (2 * L)) + 2 * L) % (2 * L);
  const forward = u < L;
  const d = forward ? u : 2 * L - u;
  const laneWidth = r.road.width / (r.lanes * 2);
  const side = (v.lane + 0.5) * laneWidth;
  const p = routePoint(r, d, forward ? side : -side);
  return { ...p, heading: forward ? p.heading : p.heading + Math.PI, stopped, speed: stopped ? 0 : v.speed };
}

// ── pedestrians ───────────────────────────────────────────────────────
export type Pedestrian = {
  id: number; route: number; side: number; offset: number; speed: number; skin: number; top: number; bottom: number; wrap: number; woman: boolean; walking: boolean;
  x?: number; z?: number; ry?: number;
  /** Market shoppers stroll back and forth between two points (route = -2). */
  a?: [number, number]; b?: [number, number];
};

const SKINS = [0x3b2219, 0x4a2b1d, 0x5c3824, 0x6b4127, 0x7a4b2c, 0x8d5a36];
const TOPS = [0xf2f2f2, 0xe8a33d, 0x1f7a4c, 0x7b2d8b, 0xc0392b, 0x2e5e9e, 0xf4d03f, 0x16a085, 0x222222, 0xd35400, 0x8e44ad, 0xffffff];
const BOTTOMS = [0x2c3e50, 0x1b1b1b, 0x34495e, 0x5d4037, 0x2e86c1, 0xa04000, 0x145a32, 0x6c3483];

function busyness(x: number, z: number) {
  const d = districtAt(x, z).id;
  return d === "adeyemi" || d === "central" || d === "victoria" || d === "mainland" ? 1 : d === "waterfront" || d === "estate" || d === "beach" ? 0.4 : 0.15;
}

export function buildCrowd(scale: number): Pedestrian[] {
  const out: Pedestrian[] = [];
  const target = Math.round(650 * scale);
  const walkRoutes = ROUTES.filter((r) => r.road.kind !== "highway");
  let tries = 0;
  while (out.length < target && tries++ < target * 6) {
    const seed = tries * 3.17;
    const route = ROUTES.indexOf(walkRoutes[Math.floor(hash2(seed, 11) * walkRoutes.length)]);
    const r = ROUTES[route];
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    if (hash2(seed, 12) > busyness(mid[0], mid[1])) continue;
    const woman = hash2(seed, 13) > 0.5;
    out.push({
      id: out.length,
      route,
      side: (hash2(seed, 14) > 0.5 ? 1 : -1) * (r.road.width / 2 + 1.3 + hash2(seed, 15) * 1.4),
      offset: hash2(seed, 16) * 5000,
      speed: 0.9 + hash2(seed, 17) * 0.7,
      skin: SKINS[Math.floor(hash2(seed, 18) * SKINS.length)],
      top: TOPS[Math.floor(hash2(seed, 19) * TOPS.length)],
      bottom: BOTTOMS[Math.floor(hash2(seed, 20) * BOTTOMS.length)],
      wrap: woman && hash2(seed, 21) > 0.45 ? TOPS[Math.floor(hash2(seed, 22) * TOPS.length)] : 0,
      woman,
      walking: true,
    });
  }
  // Shoppers milling about inside the markets.
  for (const site of [SITES.balogun, SITES.yabaMarket]) {
    const n = Math.round(110 * scale);
    for (let i = 0; i < n; i++) {
      const seed = 500 + out.length * 2.71;
      const pick = (k: number): [number, number] => {
        const a = hash2(seed, k) * Math.PI * 2, r = Math.sqrt(hash2(seed, k + 1)) * site.r * 0.9;
        return [site.x + Math.cos(a) * r, site.z + Math.sin(a) * r];
      };
      const woman = hash2(seed, 41) > 0.4;
      out.push({
        id: out.length, route: -2, side: 0, offset: hash2(seed, 42) * 500, speed: 0.6 + hash2(seed, 43) * 0.6,
        skin: SKINS[Math.floor(hash2(seed, 44) * SKINS.length)], top: TOPS[Math.floor(hash2(seed, 45) * TOPS.length)], bottom: BOTTOMS[Math.floor(hash2(seed, 46) * BOTTOMS.length)],
        wrap: woman && hash2(seed, 47) > 0.35 ? TOPS[Math.floor(hash2(seed, 48) * TOPS.length)] : 0,
        woman, walking: true, a: pick(50), b: pick(52),
      });
    }
  }
  // Traders standing at market stalls and people waiting at bus stops.
  for (const s of [...STALLS.filter((_, i) => i % 2 === 0), ...BUS_STOPS.flatMap((b) => [b, b, b])]) {
    if (out.length >= target * 1.7) break;
    const seed = out.length * 1.91;
    const woman = hash2(seed, 31) > 0.35;
    const a = hash2(seed, 32) * Math.PI * 2;
    out.push({
      id: out.length, route: -1, side: 0, offset: 0, speed: 0,
      skin: SKINS[Math.floor(hash2(seed, 33) * SKINS.length)], top: TOPS[Math.floor(hash2(seed, 34) * TOPS.length)], bottom: BOTTOMS[Math.floor(hash2(seed, 35) * BOTTOMS.length)],
      wrap: woman && hash2(seed, 36) > 0.3 ? TOPS[Math.floor(hash2(seed, 37) * TOPS.length)] : 0,
      woman, walking: false,
      x: s.x + Math.cos(a) * 1.6, z: s.z + Math.sin(a) * 1.6, ry: a + Math.PI,
    });
  }
  return out;
}

export function pedestrianPose(p: Pedestrian, seconds: number) {
  if (!p.walking) return { x: p.x!, y: terrainHeight(p.x!, p.z!) + 0.16, z: p.z!, heading: p.ry ?? 0 };
  if (p.route === -2 && p.a && p.b) {
    const L = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) || 1;
    const u = ((p.offset + seconds * p.speed) % (2 * L) + 2 * L) % (2 * L);
    const t = u < L ? u / L : 2 - u / L;
    const x = p.a[0] + (p.b[0] - p.a[0]) * t, z = p.a[1] + (p.b[1] - p.a[1]) * t;
    const heading = Math.atan2(p.b[0] - p.a[0], p.b[1] - p.a[1]) + (u < L ? 0 : Math.PI);
    return { x, y: terrainHeight(x, z) + 0.05, z, heading };
  }
  const r = ROUTES[p.route];
  const L = r.length;
  const dist = p.offset + seconds * p.speed;
  const u = ((dist % (2 * L)) + 2 * L) % (2 * L);
  const forward = u < L;
  const pt = routePoint(r, forward ? u : 2 * L - u, p.side);
  return { x: pt.x, y: Math.max(pt.y + 0.06, terrainHeight(pt.x, pt.z)), z: pt.z, heading: forward ? pt.heading : pt.heading + Math.PI };
}

// ── markets, stalls, kiosks, bus stops ────────────────────────────────
export type Spot = { x: number; z: number; ry: number; v: number };
const blockedByBuilding = (x: number, z: number, pad = 1.5) => BUILDINGS.some((b) => Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad);

export const STALLS: Spot[] = (() => {
  const out: Spot[] = [];
  for (const site of [SITES.balogun, SITES.yabaMarket]) {
    // Dense market rows inside the market sites.
    for (let gx = -site.r; gx <= site.r; gx += 6.5)
      for (let gz = -site.r; gz <= site.r; gz += 8.5) {
        const x = site.x + gx + (hash2(gx, gz) - 0.5) * 1.5, z = site.z + gz;
        if (Math.hypot(gx, gz) > site.r || roadClearance(x, z) < 1 || hash2(gz, gx) < 0.12) continue;
        out.push({ x, z, ry: hash2(x, z) > 0.5 ? 0 : Math.PI, v: hash2(z, x) });
      }
  }
  // Roadside traders along busy streets.
  for (const r of ROUTES) {
    if (r.road.kind === "highway") continue;
    for (let d = 20; d < r.length; d += 34) {
      const p = routePoint(r, d, (r.road.width / 2 + 3.6) * (hash2(d, r.length) > 0.5 ? 1 : -1));
      if (busyness(p.x, p.z) < 0.9 || hash2(p.x, p.z) > 0.42 || blockedByBuilding(p.x, p.z)) continue;
      out.push({ x: p.x, z: p.z, ry: p.heading, v: hash2(p.z, p.x) });
    }
  }
  return out;
})();

export const KIOSKS: Spot[] = (() => {
  const out: Spot[] = [];
  for (const r of ROUTES) {
    if (r.road.kind !== "street") continue;
    for (let d = 45; d < r.length; d += 120) {
      const p = routePoint(r, d, (r.road.width / 2 + 4.2) * (hash2(d, 7) > 0.5 ? 1 : -1));
      if (busyness(p.x, p.z) < 0.9 || hash2(p.x, d) > 0.5 || blockedByBuilding(p.x, p.z, 2)) continue;
      out.push({ x: p.x, z: p.z, ry: p.heading, v: hash2(p.x, p.z) });
    }
  }
  return out;
})();

export const BUS_STOPS: Spot[] = (() => {
  const out: Spot[] = [];
  for (const r of ROUTES) {
    if (r.road.kind === "street") continue;
    for (let d = 160; d < r.length - 100; d += 320) {
      const p = routePoint(r, d, r.road.width / 2 + 2.4);
      if (terrainHeight(p.x, p.z) < 0.5 || blockedByBuilding(p.x, p.z, 2)) continue;
      out.push({ x: p.x, z: p.z, ry: p.heading, v: 0 });
    }
  }
  return out;
})();

// ── electric poles (sagging wires on residential streets) ─────────────
export const POLES: { route: number; pts: { x: number; y: number; z: number }[] }[] = (() => {
  const out: { route: number; pts: { x: number; y: number; z: number }[] }[] = [];
  ROUTES.forEach((r, i) => {
    if (r.road.kind !== "street") return;
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    const d = districtAt(mid[0], mid[1]).id;
    if (d !== "mainland" && d !== "adeyemi") return;
    const pts: { x: number; y: number; z: number }[] = [];
    for (let s = 10; s < r.length; s += 38) {
      const p = routePoint(r, s, -(r.road.width / 2 + 0.6));
      pts.push({ x: p.x, y: terrainHeight(p.x, p.z), z: p.z });
    }
    if (pts.length > 1) out.push({ route: i, pts });
  });
  return out;
})();

// ── billboards and green road signs ───────────────────────────────────
export const BILLBOARD_TEXTS = [
  ["JOLLOF KINGS", "Party jollof, every day", "#c0392b"],
  ["NAIJANET 5G", "Fast like okada", "#16a085"],
  ["EKO PURE WATER", "Cold & clean", "#2e86c1"],
  ["MAMA CASS KITCHEN", "Amala • Ewedu • Gbegiri", "#d35400"],
  ["LAGOS FASHION WEEK", "Ankara reimagined", "#8e44ad"],
  ["SUYA SPOT", "Open till 2am", "#a04000"],
  ["NOLLYWOOD PREMIERE", "This Friday • Lekki", "#1b1b1b"],
  ["KEEP LAGOS CLEAN", "Eko o ni baje", "#1f7a4c"],
  ["AFROBEATS LIVE", "Tafawa Balewa Square", "#e67e22"],
  ["OGA BANK", "Your money, your way", "#2c3e50"],
] as const;

export const BILLBOARDS: Spot[] = (() => {
  const out: Spot[] = [];
  for (const r of ROUTES) {
    if (r.road.kind !== "highway") continue;
    for (let d = 120; d < r.length - 50; d += 420) {
      const p = routePoint(r, d, (r.road.width / 2 + 9) * (hash2(d, r.length) > 0.5 ? 1 : -1));
      if (terrainHeight(p.x, p.z) < 0.5 || blockedByBuilding(p.x, p.z, 4)) continue;
      out.push({ x: p.x, z: p.z, ry: p.heading + Math.PI / 2, v: out.length % BILLBOARD_TEXTS.length });
    }
  }
  return out;
})();

/** Overhead green direction signs on the expressways (as on Lagos roads). */
export const ROAD_SIGNS: { route: string; at: number; text: string }[] = [
  { route: "Third Mainland Bridge", at: 60, text: "LAGOS ISLAND  •  IKOYI  •  V.I." },
  { route: "Third Mainland Bridge", at: 900, text: "YABA  •  IKEJA  •  AIRPORT" },
  { route: "Eko Bridge", at: 60, text: "APAPA  •  LAGOS ISLAND" },
  { route: "Ahmadu Bello Way", at: 900, text: "VICTORIA ISLAND  •  BAR BEACH" },
  { route: "Ahmadu Bello Way", at: 2700, text: "LEKKI  •  AJAH  •  EPE" },
  { route: "Airport Road", at: 200, text: "MURTALA MUHAMMED AIRPORT  ✈" },
  { route: "Ikorodu Road", at: 300, text: "IKORODU  •  OJOTA" },
  { route: "Admiralty Way", at: 120, text: "LEKKI PHASE 1" },
];
