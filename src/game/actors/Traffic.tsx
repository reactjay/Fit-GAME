"use client";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { take } from "../input";
import { live, worldSeconds } from "../shared";
import { hud, toastHud } from "../store";
import { ROUTES, buildTraffic, trafficPose, type TrafficVehicle, type VehicleKind } from "../world/lagos";
import { groundHeight, terrainHeight, WATER } from "../world/layout";
import { sfx } from "@/lib/sound";
import { VEHICLE_HALF, vehicleGeometry } from "./vehicleModels";

const KINDS: VehicleKind[] = ["danfo", "brt", "car", "suv", "okada", "keke"];
const POOL: Record<VehicleKind, number> = { danfo: 4, brt: 1, car: 4, suv: 2, okada: 2, keke: 2 };
const CONDUCTOR = ["Oya enter, enter!", "CMS! Obalende! Wole!", "Owa o! Make we go!", "Shift small, shift!", "Last bus o!"];

const fleet: { list: TrafficVehicle[] } = { list: [] };
/** Seconds each vehicle has spent waiting behind something; it runs that far behind the shared timetable. */
const delay = new Float64Array(4096);
/** Pose of a traffic vehicle by id (used for riding and by the partner's view). */
export function fleetPose(id: number, seconds = worldSeconds()) {
  const v = fleet.list[id];
  return v ? trafficPose(v, seconds - delay[id]) : null;
}

const fwd = new THREE.Vector3(), tilt =new THREE.Euler(0, 0, 0, "YXZ");
/** Pitch/roll so the wheels follow the drawn ground instead of the front or back sinking into slopes. */
function ground(x: number, z: number, heading: number, half: [number, number, number], roadY: number, q: THREE.Quaternion) {
  const g0 = groundHeight(x, z);
  // On a bridge or flyover the road is well above the ground: keep it level.
  if (roadY > g0 + 0.6) return { y: roadY, q: q.setFromEuler(tilt.set(0, heading, 0)) };
  const s = Math.sin(heading), c = Math.cos(heading), L = half[2] * 0.8, W = half[0] * 0.8;
  const yF = Math.max(groundHeight(x + s * L, z + c * L), WATER), yB = Math.max(groundHeight(x - s * L, z - c * L), WATER);
  const yR = Math.max(groundHeight(x + c * W, z - s * W), WATER), yL = Math.max(groundHeight(x - c * W, z + s * W), WATER);
  const y = Math.max((yF + yB) / 2, (yL + yR) / 2, roadY);
  return { y, q: q.setFromEuler(tilt.set(-Math.atan2(yF - yB, 2 * L), heading, Math.atan2(yR - yL, 2 * W))) };
}
/** Seat position inside a danfo (4 rows × 3 seats). */
export function danfoSeat(id: number, seat: number, seconds?: number) {
  const p = fleetPose(id, seconds);
  if (!p) return null;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading);
  const local = new THREE.Vector3(((seat % 3) - 1) * 0.55, 0.65, 0.9 - Math.floor(seat / 3) * 0.9).applyQuaternion(q);
  return { pos: new THREE.Vector3(p.x, p.y, p.z).add(local), heading: p.heading, stopped: p.stopped };
}

export function Traffic({ scale }: { scale: number }) {
  const vehicles = useMemo(() => buildTraffic(scale), [scale]);
  useEffect(() => {
    fleet.list = vehicles;
  }, [vehicles]);
  const meshes = useMemo(() => {
    const out = {} as Record<VehicleKind, THREE.InstancedMesh>;
    const c = new THREE.Color();
    for (const k of KINDS) {
      const list = vehicles.filter((v) => v.kind === k);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: k === "car" || k === "suv" ? 0.45 : 0.15 });
      const m = new THREE.InstancedMesh(vehicleGeometry(k), mat, Math.max(1, list.length));
      m.count = list.length;
      list.forEach((v, i) => m.setColorAt(i, c.setHex(v.color)));
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // instances span the whole city
      out[k] = m;
    }
    return out;
  }, [vehicles]);
  const byKind = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, vehicles.filter((v) => v.kind === k)])) as Record<VehicleKind, TrafficVehicle[]>, [vehicles]);
  const pool = useRef<Record<string, (RapierRigidBody | null)[]>>({});
  const lastHud = useRef(0);
  const shout = useRef(0);
  const honkAt = useRef<Record<number, number>>({});

  // Board a danfo that's stopped nearby.
  useEffect(() => {
    live.interactables.set("danfo", {
      radius: 6,
      pos: () => {
        let best = new THREE.Vector3(1e9, 0, 0);
        for (const v of byKind.danfo ?? []) {
          const p = trafficPose(v, worldSeconds());
          const d = Math.hypot(p.x - live.me.pos.x, p.z - live.me.pos.z);
          if (d < best.distanceTo(live.me.pos)) best = new THREE.Vector3(p.x, p.y, p.z);
        }
        return best;
      },
      label: () => {
        if (live.me.mode !== "walk") return null;
        const v = nearestDanfo(byKind.danfo ?? []);
        if (!v) return null;
        const p = trafficPose(v, worldSeconds());
        // Like real danfos: flag one down anywhere, or board at a bus stop.
        return `${p.stopped ? "Enter" : "Flag down"} danfo · ${ROUTES[v.route].road.name} (₦300)`;
      },
      act: () => {
        const v = nearestDanfo(byKind.danfo ?? []);
        if (!v) return;
        // Sit next to your partner if they're already on this bus.
        const pv = live.partner?.target.vehicle;
        const partnerSeat = pv?.startsWith(`danfo:${v.id}:`) ? Number(pv.split(":")[2]) : -1;
        const seat = partnerSeat >= 0 ? (partnerSeat % 3 === 2 ? partnerSeat - 1 : partnerSeat + 1) : 4;
        live.me.mode = "bus";
        live.me.vehicle = `danfo:${v.id}:${seat}`;
        hud.set({ mode: "bus" });
        toastHud(`Conductor: "${CONDUCTOR[v.id % CONDUCTOR.length]}"`, 3500);
      },
    });
    return () => void live.interactables.delete("danfo");
  }, [byKind]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const t = worldSeconds();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const me = live.me.pos;
    const near: Record<VehicleKind, { d: number; x: number; y: number; z: number; q: THREE.Quaternion }[]> = { danfo: [], brt: [], car: [], suv: [], okada: [], keke: [] };

    // Pass 1: where everyone is on their (delayed) timetable.
    const poses: Record<string, ReturnType<typeof trafficPose>[]> = {};
    const close: { v: TrafficVehicle; k: VehicleKind; p: ReturnType<typeof trafficPose>; d: number }[] = [];
    for (const k of KINDS) {
      poses[k] = byKind[k].map((v) => {
        const p = trafficPose(v, t - delay[v.id]);
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        if (d < 120) close.push({ v, k, p, d });
        return p;
      });
    }

    // Pass 2: nearby vehicles stop for people, your cars, and the vehicle in front.
    const people: THREE.Vector3[] = [];
    if (live.me.mode === "walk" || live.me.mode === "car") people.push(me);
    if (live.partner && Date.now() - live.partner.seen < 6000 && live.partner.target.mode === "walk") people.push(live.partner.shown);
    for (const veh of live.vehicles.values()) people.push(veh.pos);
    for (const c of close) {
      if (c.p.stopped) continue;
      const [hw, , hl] = VEHICLE_HALF[c.k];
      fwd.set(Math.sin(c.p.heading), 0, Math.cos(c.p.heading));
      const ahead = (x: number, y: number, z: number, gap: number, width: number) => {
        const rx = x - c.p.x, rz = z - c.p.z;
        const along = rx * fwd.x + rz * fwd.z, side = Math.abs(rx * fwd.z - rz * fwd.x);
        return along > 0 && along < hl + gap && side < hw + width && Math.abs(y - c.p.y) < 3;
      };
      let blockedByMe = false;
      let blocked = people.some((o) => {
        const hit = ahead(o.x, o.y, o.z, 4.5, 1.3);
        if (hit && o === me) blockedByMe = true;
        return hit;
      });
      if (!blocked)
        blocked = close.some((o) => {
          if (o === c || Math.cos(o.p.heading - c.p.heading) < 0.5) return false;
          const [ow, , ol] = VEHICLE_HALF[o.k];
          return ahead(o.p.x, o.p.y, o.p.z, ol + 1.5, ow + 0.2);
        });
      if (!blocked) continue;
      delay[c.v.id] += dt;
      if (blockedByMe && c.d < 35 && t - (honkAt.current[c.v.id] ?? -99) > 6 && delay[c.v.id] > 1.5) {
        honkAt.current[c.v.id] = t;
        sfx.horn(c.k === "okada" || c.k === "keke");
      }
    }

    // Pass 3: draw (tilted to the ground when close enough to see it) and move the physics boxes.
    for (const k of KINDS) {
      const mesh = meshes[k];
      poses[k].forEach((p, i) => {
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        let y: number;
        if (d < 160) ({ y } = ground(p.x, p.z, p.heading, VEHICLE_HALF[k], p.y, q));
        else {
          y = Math.max(p.y, terrainHeight(p.x, p.z), WATER);
          q.setFromAxisAngle(up, p.heading);
        }
        y -= 0.02;
        pos.set(p.x, y, p.z);
        mesh.setMatrixAt(i, m.compose(pos, q, one));
        if (d < 90) near[k].push({ d, x: p.x, y, z: p.z, q: q.clone() });
      });
      mesh.instanceMatrix.needsUpdate = true;
      // Recycle a few physics boxes onto the nearest vehicles so you can't drive through them.
      near[k].sort((a, b) => a.d - b.d);
      const bodies = pool.current[k] ?? [];
      bodies.forEach((b, i) => {
        if (!b) return;
        const n = near[k][i];
        if (n) {
          // Box centre sits half a height up along the vehicle's own (tilted) up axis.
          pos.set(0, VEHICLE_HALF[k][1], 0).applyQuaternion(n.q);
          b.setNextKinematicTranslation({ x: n.x + pos.x, y: n.y + pos.y, z: n.z + pos.z });
          b.setNextKinematicRotation(n.q);
        } else b.setNextKinematicTranslation({ x: 0, y: -500 - i * 10, z: 0 });
      });
    }

    // Riding a danfo.
    if (live.me.mode === "bus" && live.me.vehicle?.startsWith("danfo:")) {
      const [, id, seat] = live.me.vehicle.split(":").map(Number);
      const s = danfoSeat(id, seat, t);
      if (!s) return;
      live.me.pos.copy(s.pos);
      live.me.heading = s.heading;
      live.me.ry = s.heading;
      live.cameraTarget.set(s.pos.x, s.pos.y + (hud.get().view === "first" ? 0.9 : 1.4), s.pos.z);
      if (state.clock.elapsedTime - lastHud.current > 0.5) {
        lastHud.current = state.clock.elapsedTime;
        const v = fleet.list[id];
        hud.set({ speedKmh: s.stopped ? 0 : Math.round(v.speed * 3.6), location: ROUTES[v.route].road.name, trainInfo: s.stopped ? "Bus stop" : `Danfo · ${ROUTES[v.route].road.name}`, prompt: s.stopped ? "Get down here" : 'Shout "Owa o!" (get down)' });
        if (s.stopped && state.clock.elapsedTime - shout.current > 8) {
          shout.current = state.clock.elapsedTime;
          toastHud(`Conductor: "${CONDUCTOR[Math.floor(state.clock.elapsedTime) % CONDUCTOR.length]}"`);
        }
      }
      if (take("interact")) {
        {
          if (!s.stopped) toastHud('"Owa o!" — the driver pulls over for you');
          const right = new THREE.Vector3(Math.cos(s.heading), 0, -Math.sin(s.heading));
          const out = s.pos.clone().addScaledVector(right, -3.2);
          live.me.mode = "walk";
          live.me.vehicle = null;
          live.teleport = { x: out.x, y: Math.max(terrainHeight(out.x, out.z), s.pos.y - 0.65) + 0.5, z: out.z };
          hud.set({ mode: "walk", trainInfo: null });
        }
      }
    }
  });

  return (
    <group>
      {KINDS.map((k) => (
        <primitive key={k} object={meshes[k]} />
      ))}
      {KINDS.flatMap((k) =>
        Array.from({ length: POOL[k] }, (_, i) => (
          <RigidBody
            key={`${k}${i}`}
            ref={(b) => {
              pool.current[k] ??= [];
              pool.current[k][i] = b;
            }}
            type="kinematicPosition"
            colliders={false}
            position={[0, -500 - i * 10, 0]}
            userData={{ kind: "traffic" }}
          >
            <CuboidCollider args={VEHICLE_HALF[k]} />
          </RigidBody>
        )),
      )}
    </group>
  );
}

function nearestDanfo(list: TrafficVehicle[]) {
  let best: TrafficVehicle | null = null;
  let bd = 7;
  for (const v of list) {
    const p = trafficPose(v, worldSeconds());
    const d = Math.hypot(p.x - live.me.pos.x, p.z - live.me.pos.z);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}
