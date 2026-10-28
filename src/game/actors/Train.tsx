"use client";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { take } from "../input";
import { live, worldSeconds } from "../shared";
import { hud, toastHud } from "../store";
import { RAIL, TRAIN, railAt, trainState } from "../world/layout";
import { PLATFORM, platformFrame } from "../world/Rail";

// Procedural train (no licensed train model was available without an account —
// see public/assets/ASSETS.md for the drop-in slot for a real GLB).
const L = TRAIN.carLength;
const GAP = 1.2;

/** Pose of car i at a moment in time, from the shared timetable. */
export function trainCarPose(i: number, seconds = worldSeconds()) {
  const st = trainState(seconds);
  const front = st.s - i * (L + GAP);
  const a = railAt(front - 3.2), b = railAt(front - L + 3.2);
  const pos = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.36, (a.z + b.z) / 2);
  const heading = Math.atan2(a.x - b.x, a.z - b.z);
  const pitch = Math.atan2(a.y - b.y, Math.hypot(a.x - b.x, a.z - b.z));
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, heading, 0, "YXZ"));
  return { pos, quat, heading, st };
}

/** Seat k (0..7) in car i: world position. */
export function trainSeat(i: number, k: number, seconds?: number) {
  const { pos, quat } = trainCarPose(i, seconds);
  const local = new THREE.Vector3(k % 2 ? 0.75 : -0.75, 1.32, -L / 2 + 4 + Math.floor(k / 2) * 3.4);
  return pos.clone().add(local.applyQuaternion(quat));
}

function bodyGeometry(nose: boolean) {
  const w = 3.0, h = 3.6, r = 0.45;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h - r);
  s.quadraticCurveTo(w / 2, h, w / 2 - r, h);
  s.lineTo(-w / 2 + r, h);
  s.quadraticCurveTo(-w / 2, h, -w / 2, h - r);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 2, steps: nose ? 24 : 1, curveSegments: 6 });
  g.translate(0, 0.95, -L / 2);
  if (nose) {
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      const t = THREE.MathUtils.clamp((z - (L / 2 - 4.5)) / 4.5, 0, 1);
      if (t <= 0) continue;
      const y = p.getY(i);
      const floor = 0.95;
      p.setY(i, floor + (y - floor) * (1 - 0.42 * t * t));
      p.setX(i, p.getX(i) * (1 - 0.1 * t * t));
      p.setZ(i, z - (y - floor) * 0.32 * t); // raked windscreen
    }
    g.computeVertexNormals();
  }
  return g;
}

export function Train() {
  const cars = useRef<THREE.Group[]>([]);
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const wheels = useRef<THREE.Object3D[]>([]);
  const spin = useRef(0);
  const lastInfo = useRef(0);

  const parts = useMemo(() => {
    const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f0, metalness: 0.3, roughness: 0.3, clearcoat: 0.6 });
    const green = new THREE.MeshStandardMaterial({ color: 0x00704a, roughness: 0.4, metalness: 0.2 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0d1820, metalness: 0.9, roughness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x25282c, metalness: 0.6, roughness: 0.5 });
    const seat = new THREE.MeshStandardMaterial({ color: 0x1f4e79, roughness: 0.8 });
    const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 2 });
    const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 1.5 });
    return { white, green, yellow, glass, dark, seat, lamp, tail, loco: bodyGeometry(true), coach: bodyGeometry(false), wheel: new THREE.CylinderGeometry(0.46, 0.46, 0.18, 20).rotateZ(Math.PI / 2) };
  }, []);

  // Boarding / leaving at stations.
  useEffect(() => {
    live.interactables.set("train", {
      radius: 6,
      pos: () => {
        // nearest door of any coach (doors on the right-hand side, platform side)
        let best = new THREE.Vector3(1e9, 0, 0);
        for (let i = 0; i < TRAIN.cars; i++) {
          const { pos, quat } = trainCarPose(i);
          for (const z of [-L / 4, L / 4]) {
            const d = pos.clone().add(new THREE.Vector3(1.9, 0.6, z).applyQuaternion(quat));
            if (d.distanceTo(live.me.pos) < best.distanceTo(live.me.pos)) best = d;
          }
        }
        return best;
      },
      label: () => {
        if (live.me.mode !== "walk") return null;
        const st = trainState(worldSeconds());
        return st.station ? `Board the train to ${st.next.name}` : null;
      },
      act: () => {
        const st = trainState(worldSeconds());
        if (!st.station) return;
        // Pick the nearest coach; take the partner's coach if they're aboard so you sit together.
        let car = 1;
        let bd = Infinity;
        for (let i = 0; i < TRAIN.cars; i++) {
          const d = trainCarPose(i).pos.distanceTo(live.me.pos);
          if (d < bd) {
            bd = d;
            car = i;
          }
        }
        const partnerSeat = live.partner?.target.vehicle?.startsWith("train:") ? live.partner.target.vehicle.split(":").map(Number) : null;
        if (partnerSeat) car = partnerSeat[1];
        const seat = partnerSeat ? (partnerSeat[2] % 2 ? partnerSeat[2] - 1 : partnerSeat[2] + 1) : 2;
        live.me.mode = "train";
        live.me.vehicle = `train:${car}:${seat}`;
        hud.set({ mode: "train" });
        toastHud(`All aboard! Next stop: ${st.next.name}`);
      },
    });
    return () => void live.interactables.delete("train");
  }, []);

  useFrame((state, dt) => {
    const t = worldSeconds();
    const st = trainState(t);
    spin.current += (st.speed / 0.46) * dt;
    for (let i = 0; i < TRAIN.cars; i++) {
      const { pos, quat } = trainCarPose(i, t);
      cars.current[i]?.position.copy(pos);
      if (cars.current[i]) cars.current[i].visible = state.camera.position.distanceTo(pos) < 900;
      cars.current[i]?.quaternion.copy(quat);
      const b = bodies.current[i];
      if (b) {
        b.setNextKinematicTranslation(pos);
        b.setNextKinematicRotation(quat);
      }
    }
    for (const w of wheels.current) if (w) w.rotation.x = spin.current;

    // Riding: keep the player in their seat; leave at a station.
    if (live.me.mode === "train" && live.me.vehicle?.startsWith("train:")) {
      const [, car, seat] = live.me.vehicle.split(":").map(Number);
      const p = trainSeat(car, seat, t);
      const { heading, quat } = trainCarPose(car, t);
      live.me.pos.copy(p);
      live.me.heading = heading;
      live.me.ry = heading;
      live.cameraTarget.set(p.x, p.y + (hud.get().view === "first" ? 0.55 : 1.2), p.z);
      if (state.clock.elapsedTime - lastInfo.current > 0.5) {
        lastInfo.current = state.clock.elapsedTime;
        hud.set({
          speedKmh: Math.round(st.speed * 3.6),
          location: st.station ? st.station.name : `Between stations`,
          trainInfo: st.station ? `Departing in ${Math.ceil(st.departsIn)}s · next: ${st.next.name}` : `Next stop: ${st.next.name}`,
          prompt: st.station ? `Get off at ${st.station.name}` : null,
        });
      }
      if (take("interact")) {
        if (!st.station) toastHud("Wait until the train stops at a station");
        else {
          const f = platformFrame(st.station.s);
          const side = new THREE.Vector3(2.2 + PLATFORM.offset - 3, 0, 0).applyQuaternion(quat);
          const pos = trainCarPose(car, t).pos;
          const out = new THREE.Vector3(pos.x, f.topY + 0.3, pos.z).add(side);
          live.me.mode = "walk";
          live.me.vehicle = null;
          live.teleport = { x: out.x, y: out.y, z: out.z };
          hud.set({ mode: "walk", trainInfo: null });
        }
      }
    }
  });

  return (
    <group>
      {Array.from({ length: TRAIN.cars }, (_, i) => (
        <group key={i}>
          <group ref={(g) => void (g && (cars.current[i] = g))}>
            <mesh geometry={i === 0 ? parts.loco : parts.coach} material={parts.white} castShadow receiveShadow />
            {/* livery */}
            {[-1, 1].map((side) => (
              <group key={side}>
                <mesh position={[side * 1.6, 1.45, 0]} material={parts.green}>
                  <boxGeometry args={[0.04, 0.35, L * (i === 0 ? 0.8 : 0.98)]} />
                </mesh>
                <mesh position={[side * 1.6, 1.12, 0]} material={parts.yellow}>
                  <boxGeometry args={[0.04, 0.12, L * (i === 0 ? 0.8 : 0.98)]} />
                </mesh>
                {/* windows */}
                {Array.from({ length: i === 0 ? 4 : 7 }, (_, k) => (
                  <mesh key={k} position={[side * 1.6, 2.75, -L / 2 + 3 + k * (i === 0 ? 3.2 : 2.6) + (i === 0 ? 0 : 0)]} material={parts.glass}>
                    <boxGeometry args={[0.04, 1.05, 1.6]} />
                  </mesh>
                ))}
                {/* doors */}
                {[-L / 4, L / 4].map((z) => (
                  <mesh key={z} position={[side * 1.6, 2.3, z]} material={parts.yellow}>
                    <boxGeometry args={[0.05, 2.5, 1.5]} />
                  </mesh>
                ))}
              </group>
            ))}
            {i === 0 ? (
              <>
                <mesh position={[0, 3.15, L / 2 - 1.2]} rotation-x={-0.95} material={parts.glass}>
                  <planeGeometry args={[2.5, 1.5]} />
                </mesh>
                {[-0.9, 0.9].map((x) => (
                  <mesh key={x} position={[x, 1.55, L / 2 + 0.05]} material={parts.lamp}>
                    <circleGeometry args={[0.16, 16]} />
                  </mesh>
                ))}
                <mesh position={[0, 4.95, 0]} material={parts.dark}>
                  <boxGeometry args={[1.4, 0.3, 3.5]} />
                </mesh>
              </>
            ) : (
              <mesh position={[0, 4.75, 0]} material={parts.dark}>
                <boxGeometry args={[1.8, 0.35, 4]} />
              </mesh>
            )}
            {i === TRAIN.cars - 1 &&
              [-0.9, 0.9].map((x) => (
                <mesh key={x} position={[x, 1.55, -L / 2 - 0.13]} rotation-y={Math.PI} material={parts.tail}>
                  <circleGeometry args={[0.14, 12]} />
                </mesh>
              ))}
            {/* interior: floor + seat rows, visible through the windows */}
            <mesh position={[0, 1.05, 0]} material={parts.dark}>
              <boxGeometry args={[2.8, 0.1, L - 1]} />
            </mesh>
            {Array.from({ length: 5 }, (_, k) => (
              <group key={k} position={[0, 1.4, -L / 2 + 4 + k * 3.4]}>
                {[-0.75, 0.75].map((x) => (
                  <mesh key={x} position={[x, 0, 0]} material={parts.seat}>
                    <boxGeometry args={[1.0, 0.5, 0.9]} />
                  </mesh>
                ))}
              </group>
            ))}
            {/* bogies */}
            {[-L / 2 + 3.2, L / 2 - 3.2].map((z) => (
              <group key={z} position={[0, 0.46, z]}>
                <mesh material={parts.dark} position={[0, 0.25, 0]}>
                  <boxGeometry args={[2.2, 0.45, 3]} />
                </mesh>
                {[-1.1, 1.1].flatMap((dz) =>
                  [-0.72, 0.72].map((x) => (
                    <mesh key={`${dz}${x}`} geometry={parts.wheel} material={parts.dark} position={[x, 0, dz]} ref={(m) => void (m && !wheels.current.includes(m) && wheels.current.push(m))} />
                  )),
                )}
              </group>
            ))}
          </group>
          <RigidBody ref={(b) => void (bodies.current[i] = b)} type="kinematicPosition" colliders={false} userData={{ kind: "train" }}>
            <CuboidCollider args={[1.5, 1.95, L / 2]} position={[0, 2.85, 0]} />
          </RigidBody>
        </group>
      ))}
    </group>
  );
}

export const TRAIN_LENGTH_M = TRAIN.cars * (L + GAP);
export { RAIL };
