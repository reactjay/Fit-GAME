"use client";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from "@react-three/rapier";
import type { DynamicRayCastVehicleController } from "@dimforge/rapier3d-compat";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { axis, input, isDown } from "../input";
import { isMine, live, seatUser } from "../shared";
import { hud } from "../store";
import { districtAt, groundHeight, terrainHeight } from "../world/layout";
import { surfaceHeight } from "../world/roadHeights";
import { Avatar, type ModelId } from "./Avatar";

// Ferrari 458 Italia by vicent091036 — CC-BY 4.0 (via the three.js examples). See public/assets/ASSETS.md.
const CAR_URL = "/assets/vehicles/ferrari.glb";
useGLTF.preload(CAR_URL, "/draco/");

const ENGINE = 4000; // N per driven wheel (tuned: 0–100 km/h ≈ 5 s)
const BRAKE = 70;
const HANDBRAKE = 140;
const TOP_SPEED = 190 / 3.6;
const MAX_STEER = 0.55;

type Rig = { body: THREE.Object3D; wheels: { node: THREE.Object3D; front: boolean; left: boolean; base: THREE.Quaternion }[]; steering: THREE.Object3D | null; half: THREE.Vector3; center: THREE.Vector3; wheelPos: THREE.Vector3[]; radius: number };

function useCarRig(color: string): Rig {
  const { scene } = useGLTF(CAR_URL, "/draco/");
  return useMemo(() => {
    const body = scene.clone(true);
    // Paint: each car gets its own body material.
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const next = mats.map((mat) => {
        if (mat.name === "Body_Color") {
          const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.9, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03 });
          paint.name = mat.name;
          return paint;
        }
        if (/glass/i.test(mat.name)) {
          const g = (mat as THREE.MeshStandardMaterial).clone();
          g.transparent = true;
          g.opacity = 0.45;
          return g;
        }
        return mat;
      });
      m.material = Array.isArray(m.material) ? next : next[0];
    });
    body.updateMatrixWorld(true);
    // Physics drives along +z: if the model's front wheels sit at −z, turn it around.
    const fz = body.getObjectByName("wheel_fl")!.getWorldPosition(new THREE.Vector3()).z;
    const rz = body.getObjectByName("wheel_rl")!.getWorldPosition(new THREE.Vector3()).z;
    if (fz < rz) {
      body.rotation.y = Math.PI;
      body.updateMatrixWorld(true);
    }
    const box = new THREE.Box3().setFromObject(body);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const names = ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"];
    const wheels = names.map((n) => {
      const node = body.getObjectByName(n)!;
      return { node, front: n.includes("_f"), left: n.endsWith("l"), base: node.quaternion.clone() };
    });
    const wheelPos = wheels.map((w) => w.node.getWorldPosition(new THREE.Vector3()).sub(center));
    const wb = new THREE.Box3().setFromObject(wheels[0].node).getSize(new THREE.Vector3());
    return { body, wheels, steering: body.getObjectByName("steering_wheel") ?? null, half: size.clone().multiplyScalar(0.5), center, wheelPos, radius: Math.max(wb.y, wb.z) / 2 };
  }, [scene, color]);
}

// Synthesised engine note (no audio files); only for the local driver.
function useEngineSound(active: boolean) {
  const nodes = useRef<{ ctx: AudioContext; osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null>(null);
  useEffect(() => {
    if (!active) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const osc2 = ctx.createOscillator();
    osc2.type = "square";
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(ctx.destination);
    osc.start();
    osc2.start();
    nodes.current = { ctx, osc, osc2, gain };
    return () => {
      ctx.close().catch(() => {});
      nodes.current = null;
    };
  }, [active]);
  return (speed: number, throttle: number) => {
    const n = nodes.current;
    if (!n) return;
    const muted = document.documentElement.dataset.sound === "off";
    const gear = Math.min(6, Math.floor(speed / 9));
    const rpm = 0.25 + ((speed - gear * 9) / 9) * 0.75;
    const f = 40 + rpm * 90 + gear * 6;
    n.osc.frequency.setTargetAtTime(f, n.ctx.currentTime, 0.05);
    n.osc2.frequency.setTargetAtTime(f / 2, n.ctx.currentTime, 0.05);
    n.gain.gain.setTargetAtTime(muted ? 0 : 0.035 + Math.abs(throttle) * 0.05, n.ctx.currentTime, 0.1);
  };
}

export function Car({ id, color, spawn }: { id: string; color: string; spawn: { x: number; z: number; heading: number } }) {
  return (
    <Suspense fallback={null}>
      <CarInner id={id} color={color} spawn={spawn} />
    </Suspense>
  );
}

function CarInner({ id, color, spawn }: { id: string; color: string; spawn: { x: number; z: number; heading: number } }) {
  const activeColor = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("justus:active_car") || "null");
      if (saved?.color && (id === "car:home" || id.endsWith(":0"))) return saved.color as string;
    } catch {}
    return color;
  }, [color, id]);
  const rig = useCarRig(activeColor);
  const { world, rapier } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const visual = useRef<THREE.Group>(null);
  const controller = useRef<DynamicRayCastVehicleController | null>(null);
  const steer = useRef(0);
  const throttle = useRef(0);
  const lastSend = useRef(0);
  const [mine, setMine] = useState(false);
  const engine = useEngineSound(mine);

  const isLocalDriver = () => isMine(live.seats[id]?.driver);

  // Register the "Press E" interaction.
  useEffect(() => {
    live.interactables.set(id, {
      radius: 3.6,
      pos: () => live.vehicles.get(id)?.pos ?? new THREE.Vector3(spawn.x, 0, spawn.z),
      label: () => {
        const s = live.seats[id] ?? {};
        if (live.me.mode !== "walk") return null;
        if (!s.driver) return "Drive";
        if (!s.passenger && seatUser(s.driver) !== live.me.id) return "Ride along";
        return null;
      },
      act: () => {
        const s = live.seats[id] ?? {};
        live.send({ type: "seat", vehicle: id, seat: s.driver ? "passenger" : "driver", action: "claim" });
      },
    });
    return () => void live.interactables.delete(id);
  }, [id, spawn.x, spawn.z]);

  // Create the wheel set once the chassis exists.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const v = world.createVehicleController(body);
    // Our cars face local +z; Rapier measures speed along local x unless told otherwise.
    v.setIndexForwardAxis = 2;
    rig.wheelPos.forEach((p) => {
      v.addWheel({ x: p.x, y: p.y + 0.12, z: p.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, 0.18, rig.radius);
    });
    for (let i = 0; i < 4; i++) {
      v.setWheelSuspensionStiffness(i, 32);
      v.setWheelSuspensionCompression(i, 2.4);
      v.setWheelSuspensionRelaxation(i, 2.9);
      v.setWheelMaxSuspensionForce(i, 60000);
      v.setWheelFrictionSlip(i, 2.6);
      v.setWheelSideFrictionStiffness(i, 1.1);
    }
    controller.current = v;
    // Start parked (kinematic) at the saved pose or the parking spot.
    const saved = live.poses.get(id)?.p;
    // Rest the tyres on the drawn ground (body centre sits above the wheel bottoms).
    const ground = surfaceHeight(spawn.x, spawn.z);
    const y = ground - Math.min(...rig.wheelPos.map((p) => p.y)) + rig.radius + 0.05;
    body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    if (saved) {
      const savedGround = surfaceHeight(saved[0], saved[2]);
      const sy = Math.max(saved[1], savedGround + 0.3);
      body.setTranslation({ x: saved[0], y: sy, z: saved[2] }, true);
      body.setRotation({ x: saved[3], y: saved[4], z: saved[5], w: saved[6] }, true);
    } else {
      body.setTranslation({ x: spawn.x, y, z: spawn.z }, true);
      body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spawn.heading), true);
    }
    return () => {
      world.removeVehicleController(v);
      controller.current = null;
    };
  }, [world, rapier, rig, id, spawn]);

  // Drive inputs → wheel forces, every physics step.
  useBeforePhysicsStep((w) => {
    const v = controller.current;
    const body = bodyRef.current;
    if (!v || !body) return;
    const driving = isLocalDriver();
    const dynamic = body.bodyType() === rapier.RigidBodyType.Dynamic;
    if (driving && !dynamic) {
      body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    if (!driving) {
      if (dynamic && !live.seats[id]?.driver) {
        // Driver just got out: park it where it stopped (and tell the server so the partner sees it).
        body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      }
      return;
    }
    const a = axis();
    const speed = v.currentVehicleSpeed();
    const fwd = -a.y; // up/W = +1
    const hand = isDown(" ") || input.held.brake;
    // Brake when pressing against the direction of travel; otherwise drive (incl. reverse).
    let force = 0, brake = 0;
    if (fwd > 0.05) {
      if (speed < -1) brake = BRAKE * fwd;
      else force = speed < TOP_SPEED ? ENGINE * fwd : 0;
    } else if (fwd < -0.05) {
      if (speed > 1) brake = BRAKE * -fwd;
      else force = speed > -12 ? ENGINE * 0.6 * fwd : 0;
    } else brake = 2; // engine braking
    throttle.current = fwd;
    // Less steering lock at speed keeps it stable.
    const target = -a.x * MAX_STEER * (1 - Math.min(Math.abs(speed) / 60, 0.65));
    steer.current = THREE.MathUtils.lerp(steer.current, target, 0.18);
    for (let i = 0; i < 4; i++) {
      const front = rig.wheels[i].front;
      v.setWheelSteering(i, front ? steer.current : 0);
      v.setWheelEngineForce(i, front ? 0 : force);
      v.setWheelBrake(i, brake + (hand && !front ? HANDBRAKE : 0));
      v.setWheelSideFrictionStiffness(i, hand && !front ? 0.55 : 1.1);
    }
    v.updateVehicle(w.timestep);
    if (process.env.NODE_ENV !== "production") {
      (live as unknown as { debug?: Record<string, unknown> }).debug = {
        speed: v.currentVehicleSpeed(),
        force,
        brake,
        contact: [0, 1, 2, 3].map((i) => v.wheelIsInContact(i)),
        susp: [0, 1, 2, 3].map((i) => +(v.wheelSuspensionLength(i) ?? -1).toFixed(2)),
        fwdImpulse: [0, 1, 2, 3].map((i) => +(v.wheelForwardImpulse(i) ?? 0).toFixed(1)),
        mass: body.mass(),
        linvel: body.linvel(),
        dt: w.timestep,
      };
    }
  });

  useFrame((state) => {
    const body = bodyRef.current;
    const v = controller.current;
    if (!body || !v) return;
    const now = state.clock.elapsedTime;
    const driving = isLocalDriver();
    // LOD: the Ferrari is ~250k triangles; distant cars are just a few pixels.
    if (visual.current) {
      const d = state.camera.position.distanceTo(body.translation() as THREE.Vector3);
      visual.current.visible = d < 350;
      const shadow = d < 80;
      if (visual.current.userData.shadow !== shadow) {
        visual.current.userData.shadow = shadow;
        visual.current.traverse((o) => void ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = shadow)));
      }
    }
    const seats = live.seats[id] ?? {};
    if (driving !== mine) setMine(driving);

    if (!driving) {
      // Follow the network pose (smoothly) if someone else is driving or it was moved.
      const pose = live.poses.get(id);
      if (pose && body.bodyType() !== rapier.RigidBodyType.Dynamic) {
        const p = pose.p;
        const cur = body.translation();
        const k = seats.driver ? 0.25 : 1;
        body.setNextKinematicTranslation({ x: cur.x + (p[0] - cur.x) * k, y: cur.y + (p[1] - cur.y) * k, z: cur.z + (p[2] - cur.z) * k });
        const q = new THREE.Quaternion().copy(body.rotation() as THREE.Quaternion).slerp(new THREE.Quaternion(p[3], p[4], p[5], p[6]), k);
        body.setNextKinematicRotation(q);
        steer.current = THREE.MathUtils.lerp(steer.current, p[8] ?? 0, 0.2);
      }
    }

    const t = body.translation();
    const r = body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const heading = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
    const speed = driving ? v.currentVehicleSpeed() : live.poses.get(id)?.p[7] ?? 0;
    let entry = live.vehicles.get(id);
    if (!entry) live.vehicles.set(id, (entry = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), heading: 0, speed: 0 }));
    entry.pos.set(t.x, t.y, t.z);
    entry.quat.copy(q);
    entry.heading = heading;
    entry.speed = speed;

    // Wheels: spin by distance travelled, steer the fronts.
    rig.wheels.forEach((w, i) => {
      const rot = driving ? v.wheelRotation(i) ?? 0 : (w.node.userData.spin = (w.node.userData.spin ?? 0) + (speed / rig.radius) * 0.016);
      w.node.quaternion.copy(w.base);
      if (w.front) w.node.rotateY(steer.current);
      w.node.rotateX(rot);
    });
    if (rig.steering) rig.steering.rotation.z = -steer.current * 3;

    if (driving) {
      live.me.pos.set(t.x, t.y, t.z);
      live.me.heading = heading;
      live.cameraTarget.set(t.x, t.y + 1.2, t.z);
      hud.set({ location: districtAt(t.x, t.z).name, speedKmh: Math.round(Math.abs(speed) * 3.6), gear: speed < -0.5 ? "R" : Math.abs(speed) < 0.3 && throttle.current === 0 ? "N" : "D" });
      engine(Math.abs(speed), throttle.current);
      // Reset if flipped, sunk or under ground / road surface.
      const ground = surfaceHeight(t.x, t.z);
      if (t.y < ground - 0.25) {
        body.setTranslation({ x: t.x, y: ground + 0.35, z: t.z }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      if (up.y < 0.2 && Math.abs(speed) < 1 && now - (body.userData as { flipT?: number }).flipT! > 2) {
        body.setTranslation({ x: t.x, y: ground + 0.8, z: t.z }, true);
        body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading), true);
      }
      if (up.y >= 0.2) (body.userData as { flipT?: number }).flipT = now;
      if (now - lastSend.current > 1 / 15) {
        lastSend.current = now;
        live.send({ type: "pose", vehicle: id, p: [t.x, t.y, t.z, q.x, q.y, q.z, q.w, +speed.toFixed(2), +steer.current.toFixed(3)] });
      }
    } else if (isMine(seats.passenger)) {
      live.me.pos.set(t.x, t.y, t.z);
      live.me.heading = heading;
      live.cameraTarget.set(t.x, t.y + 1.2, t.z);
      hud.set({ speedKmh: Math.round(Math.abs(speed) * 3.6) });
    }
  });

  const seatY = -rig.half.y + 0.28;
  return (
    <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false} canSleep={false} linearDamping={0.05} angularDamping={0.6} userData={{ kind: "vehicle", id }}>
      <CuboidCollider args={[rig.half.x * 0.92, rig.half.y * 0.55, rig.half.z * 0.96]} position={[0, -rig.half.y * 0.1, 0]} mass={1250} friction={0.4} />
      <group ref={visual} position={[-rig.center.x, -rig.center.y, -rig.center.z]}>
        <primitive object={rig.body} />
      </group>
      <SeatSlot id={id} seat="driver" position={[0.36, seatY, -0.15]} />
      <SeatSlot id={id} seat="passenger" position={[-0.36, seatY, -0.15]} />
    </RigidBody>
  );
}

/** A seat that shows whoever sits in it (driver is on the left: right-hand traffic). */
function SeatSlot({ id, seat, position }: { id: string; seat: "driver" | "passenger"; position: [number, number, number] }) {
  const [model, setModel] = useState<ModelId | null>(null);
  useFrame(() => {
    const user = live.seats[id]?.[seat] ?? null;
    const m = user ? (seatUser(user) === live.me.id ? live.me.model : live.partnerModel) : null;
    if (m !== model) setModel((m as ModelId) ?? null);
  });
  if (!model) return null;
  return (
    <group position={position}>
      <Suspense fallback={null}>
        <Avatar model={model} anim="sit" castShadow={false} />
      </Suspense>
    </group>
  );
}
