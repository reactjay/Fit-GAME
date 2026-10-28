import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { RUNWAY } from "../world/layout";
import { V_ROTATE, flightStep, type FlightControls, type FlightState } from "./flight";

const GEAR = 1.9;
const ground = (x: number, z: number) => ({ y: 4, paved: x > RUNWAY.x0 - 100 && x < RUNWAY.x1 + 100 && Math.abs(z - RUNWAY.z) < 200 });
const onRunway = (): FlightState => ({ pos: new THREE.Vector3(RUNWAY.x0 + 20, 4 + GEAR, RUNWAY.z), quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), speed: 0, throttle: 0, airborne: false, sink: 0 });
const ctl = (c: Partial<FlightControls> = {}): FlightControls => ({ throttle: 0, pitch: 0, roll: 0, yaw: 0, brake: false, ...c });
function fly(st: FlightState, c: (t: number, s: FlightState) => FlightControls, seconds: number) {
  const events: string[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    const e = flightStep(st, c(t, st), 1 / 60, ground, GEAR);
    if (e) events.push(e);
  }
  return events;
}

describe("jet flight model", () => {
  it("takes off within the runway: full throttle, rotate at Vr", () => {
    const st = onRunway();
    const start = st.pos.x;
    // pull up to rotate and climb, then hold a gentle climb
    fly(st, (_, s) => ctl({ throttle: 1, pitch: s.speed > V_ROTATE && s.pos.y < 40 ? 1 : 0 }), 30);
    expect(st.airborne).toBe(true);
    expect(st.pos.y).toBeGreaterThan(60);
    // must have left the ground before the far end of the runway
    const st2 = onRunway();
    let liftoffX = Infinity;
    fly(st2, (_, s) => {
      if (s.airborne && liftoffX === Infinity) liftoffX = s.pos.x;
      return ctl({ throttle: 1, pitch: s.speed > V_ROTATE && s.pos.y < 40 ? 1 : 0 });
    }, 40);
    expect(liftoffX - start).toBeLessThan(RUNWAY.x1 - RUNWAY.x0);
  });

  it("can't take off without rotating (stays on the ground)", () => {
    const st = onRunway();
    fly(st, () => ctl({ throttle: 1 }), 15);
    expect(st.airborne).toBe(false);
  });

  it("banking turns the aircraft (from level flight)", () => {
    const st: FlightState = { pos: new THREE.Vector3(0, 600, 0), quat: new THREE.Quaternion(), speed: 110, throttle: 0.7, airborne: true, sink: 0 };
    const h0 = Math.atan2(new THREE.Vector3(0, 0, 1).applyQuaternion(st.quat).x, 1);
    fly(st, (t) => ctl({ throttle: 1, roll: t < 0.4 ? 1 : 0 }), 8);
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(st.quat);
    const heading = Math.atan2(f.x, f.z);
    expect(Math.abs(heading - h0)).toBeGreaterThan(0.3);
    expect(heading).toBeLessThan(0); // rolled right → turned right (toward −x)
  });

  it("a gentle approach onto the runway lands; a dive crashes", () => {
    const gentle: FlightState = { pos: new THREE.Vector3(RUNWAY.x0 + 50, 4 + GEAR + 25, RUNWAY.z), quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.04)), speed: 62, throttle: 0.25, airborne: true, sink: 0 };
    expect(fly(gentle, () => ctl({ throttle: 0 }), 20)).toContain("landed");
    const dive: FlightState = { ...gentle, pos: gentle.pos.clone().setY(300), quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.6)), speed: 120 };
    expect(fly(dive, () => ctl({ throttle: 1 }), 20)).toContain("crashed");
  });

  it("stalls and sinks when too slow", () => {
    const st: FlightState = { pos: new THREE.Vector3(0, 400, 0), quat: new THREE.Quaternion(), speed: 30, throttle: 0, airborne: true, sink: 0 };
    fly(st, () => ctl(), 3);
    expect(st.pos.y).toBeLessThan(390);
  });
});
