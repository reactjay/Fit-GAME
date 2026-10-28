import { describe, expect, it } from "vitest";
import { BILLBOARDS, BUS_STOPS, KIOSKS, POLES, ROUTES, STALLS, buildCrowd, buildTraffic, pedestrianPose, trafficPose } from "./lagos";
import { WATER, terrainHeight } from "./layout";

describe("Lagos street life", () => {
  it("builds busy streets", () => {
    const traffic = buildTraffic(1);
    const crowd = buildCrowd(1);
    const counts = traffic.reduce<Record<string, number>>((a, v) => ((a[v.kind] = (a[v.kind] ?? 0) + 1), a), {});
    console.log({ routes: ROUTES.length, traffic: counts, crowd: crowd.length, stalls: STALLS.length, kiosks: KIOSKS.length, busStops: BUS_STOPS.length, poleLines: POLES.length, billboards: BILLBOARDS.length });
    expect(counts.danfo).toBeGreaterThan(30);
    expect(crowd.length).toBeGreaterThan(400);
    expect(STALLS.length).toBeGreaterThan(150);
  });

  it("traffic is deterministic, stays on dry roads, and danfos stop", () => {
    const traffic = buildTraffic(1);
    let stops = 0;
    for (const v of traffic.slice(0, 60)) {
      for (let t = 0; t < 600; t += 37) {
        const a = trafficPose(v, t), b = trafficPose(v, t);
        expect(a).toEqual(b);
        expect(a.y).toBeGreaterThan(WATER);
        if (a.stopped) stops++;
      }
      const p0 = trafficPose(v, 100), p1 = trafficPose(v, 101);
      expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(v.speed + 25);
    }
    expect(stops).toBeGreaterThan(0);
  });

  it("pedestrians walk on land or bridge decks, never in the water", () => {
    for (const p of buildCrowd(0.5).slice(0, 300)) {
      const q = pedestrianPose(p, 123);
      expect(q.y).toBeGreaterThan(WATER);
      expect(q.y).toBeGreaterThanOrEqual(terrainHeight(q.x, q.z));
    }
  });
});
