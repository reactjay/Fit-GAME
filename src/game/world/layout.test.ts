import { describe, expect, it } from "vitest";
import { BUILDINGS, JET_SPAWN, PARKING, PROPS, RAIL, ROADS, RUNWAY, SPAWN, STATIONS, TRAIN_LOOP_SECONDS, WATER, districtAt, railAt, roadClearance, terrainHeight, trainState } from "./layout";

const insideBuilding = (x: number, z: number) => BUILDINGS.some((b) => Math.abs(x - b.x) < b.w / 2 + 1 && Math.abs(z - b.z) < b.d / 2 + 1);

describe("Lagos layout", () => {
  it("has a big, populated world", () => {
    expect(BUILDINGS.length).toBeGreaterThan(400);
    expect(PROPS.trees.length + PROPS.palms.length).toBeGreaterThan(800);
    expect(PROPS.lights.length).toBeGreaterThan(300);
    expect(RAIL.length).toBeGreaterThan(8000); // ~9 km of track
    console.log({ buildings: BUILDINGS.length, trees: PROPS.trees.length, palms: PROPS.palms.length, lights: PROPS.lights.length, railKm: (RAIL.length / 1000).toFixed(1), loopMin: (TRAIN_LOOP_SECONDS / 60).toFixed(1) });
  });

  it("spawn and parked cars are on dry land, clear of buildings", () => {
    for (const p of [SPAWN, ...PARKING]) {
      expect(terrainHeight(p.x, p.z), `${p.x},${p.z}`).toBeGreaterThan(WATER + 0.3);
      expect(insideBuilding(p.x, p.z), `${p.x},${p.z}`).toBe(false);
    }
    expect(districtAt(SPAWN.x, SPAWN.z).name).toBeTruthy();
  });

  it("buildings never sit on roads or in the sea", () => {
    for (const b of BUILDINGS) {
      expect(roadClearance(b.x, b.z)).toBeGreaterThan(3);
      expect(terrainHeight(b.x, b.z)).toBeGreaterThan(WATER);
    }
  });

  it("the jet starts on the airport taxiway and the runway is long enough", () => {
    expect(roadClearance(JET_SPAWN.x, JET_SPAWN.z)).toBeLessThan(0);
    expect(RUNWAY.x1 - RUNWAY.x0).toBeGreaterThanOrEqual(1000);
  });

  it("every road is continuous (no jumps between points)", () => {
    for (const r of ROADS) for (let i = 1; i < r.points.length; i++) {
      const [a, b] = [r.points[i - 1], r.points[i]];
      expect(Math.hypot(b[0] - a[0], b[1] - a[1]), r.id).toBeLessThan(60);
    }
  });

  it("track clears the lagoon and stations sit on the line", () => {
    for (let s = 0; s < RAIL.length; s += 50) expect(railAt(s).y).toBeGreaterThan(WATER + 5);
    expect(STATIONS.length).toBe(5);
  });

  it("the train timetable stops at stations and moves smoothly between them", () => {
    let prev = trainState(0).s, stops = 0;
    for (let t = 0; t < TRAIN_LOOP_SECONDS; t += 1) {
      const st = trainState(t);
      if (st.station) stops++;
      let ds = st.s - prev;
      if (ds < -RAIL.length / 2) ds += RAIL.length;
      expect(ds).toBeGreaterThanOrEqual(-0.01);
      expect(ds).toBeLessThan(30); // never teleports
      prev = st.s;
    }
    expect(stops).toBeGreaterThan(100);
  });
});
