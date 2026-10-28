import * as THREE from "three";

// Simplified but coherent private-jet flight model (pure: no rendering, no input
// devices) so it can be unit-tested. Model axes: nose = +z, up = +y, right = −x.
export const V_STALL = 58; // m/s
export const V_ROTATE = 64;

export type FlightState = { pos: THREE.Vector3; quat: THREE.Quaternion; speed: number; throttle: number; airborne: boolean; sink: number };
/** pitch: +1 = pull back (nose up). roll: +1 = bank right. yaw: +1 = rudder left. */
export type FlightControls = { throttle: -1 | 0 | 1; pitch: number; roll: number; yaw: number; brake: boolean };
export type FlightEvent = null | "landed" | "crashed";

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export function flightStep(st: FlightState, c: FlightControls, dt: number, ground: (x: number, z: number) => { y: number; paved: boolean }, gearHeight: number): FlightEvent {
  if (c.throttle > 0) st.throttle = Math.min(1, st.throttle + dt * 0.45);
  if (c.throttle < 0) st.throttle = Math.max(0, st.throttle - dt * 0.6);

  const fwd = Z.clone().applyQuaternion(st.quat);
  const pitchAngle = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
  const right = X.clone().negate().applyQuaternion(st.quat);
  const roll = Math.asin(THREE.MathUtils.clamp(-right.y, -1, 1));
  const authority = THREE.MathUtils.clamp(st.speed / V_STALL, 0, 1.4);

  // Thrust – drag – gravity along the path; rolling/brake friction on the ground.
  let acc = st.throttle * 26 - 0.0011 * st.speed * st.speed - 9.81 * Math.sin(pitchAngle);
  if (!st.airborne) acc -= (c.brake ? 9 : 0.35) * Math.sign(st.speed);
  st.speed = Math.max(0, st.speed + acc * dt);

  const q = st.quat;
  const local = (axis: THREE.Vector3, ang: number) => q.multiply(new THREE.Quaternion().setFromAxisAngle(axis, ang));
  if (st.airborne) {
    local(X, -c.pitch * 0.55 * authority * dt);
    local(Z, c.roll * 1.5 * authority * dt);
    local(Y, c.yaw * 0.25 * authority * dt);
    const turn = (9.81 * Math.tan(THREE.MathUtils.clamp(roll, -1.2, 1.2))) / Math.max(st.speed, 30);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(Y, -turn * dt));
    const lift = Math.min(1, (st.speed / V_STALL) ** 2);
    st.sink = THREE.MathUtils.lerp(st.sink, (1 - lift) * 18, Math.min(1, dt * 2));
    if (lift < 1) local(X, (1 - lift) * 0.4 * dt);
  } else {
    const steer = (c.yaw - c.roll * 0.6) * 0.5 * Math.min(1, st.speed / 8 + 0.2);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(Y, steer * dt));
    const level = new THREE.Quaternion().setFromAxisAngle(Y, Math.atan2(fwd.x, fwd.z));
    const nosePitch = st.speed > V_ROTATE ? THREE.MathUtils.clamp(c.pitch, 0, 1) * 0.18 : 0;
    q.slerp(level.multiply(new THREE.Quaternion().setFromAxisAngle(X, -nosePitch)), Math.min(1, dt * 4));
    st.sink = 0;
  }
  q.normalize();
  const dir = Z.clone().applyQuaternion(q);
  st.pos.addScaledVector(dir, st.speed * dt);
  st.pos.y -= st.sink * dt;

  const g = ground(st.pos.x, st.pos.z);
  const floor = g.y + gearHeight;
  let event: FlightEvent = null;
  if (st.pos.y <= floor) {
    const vs = dir.y * st.speed - st.sink;
    if (st.airborne) event = vs < -7 || Math.abs(roll) > 0.35 || !g.paved ? "crashed" : "landed";
    st.pos.y = floor;
    st.airborne = false;
  } else if (st.pos.y > floor + 1.5) st.airborne = true;
  return event;
}
