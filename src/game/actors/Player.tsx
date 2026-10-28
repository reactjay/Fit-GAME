"use client";
import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from "@react-three/rapier";
import type { KinematicCharacterController, Collider } from "@dimforge/rapier3d-compat";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { axis, input, take } from "../input";
import { isMine, live } from "../shared";
import { hud, toastHud } from "../store";
import { sfx } from "@/lib/sound";
import { WATER, districtAt, terrainHeight } from "../world/layout";
import { surfaceHeight } from "../world/roadHeights";
import { Avatar, type AnimId, type ModelId } from "./Avatar";

const WALK = 1.6, JOG = 4.2, SPRINT = 7.2, GRAVITY = 22, JUMP = 6.2;
export const emote = { anim: null as AnimId | null, until: 0 };
/** True while you're auto-walking hand in hand beside your partner. */
export const hands = { holding: false, toasted: false };

const ROMANCE_OPTIONS = [
  { label: "💋 Kiss", anim: "wave" as AnimId },
  { label: "🤗 Hug", anim: "clap" as AnimId },
  { label: "💃 Dance", anim: "run" as AnimId },
  { label: "🍽️ Eat together", anim: "sit" as AnimId },
] as const;

/**
 * The local player on foot. A kinematic capsule driven by Rapier's character
 * controller (slopes, steps, snapping to ground). In vehicles/train the capsule is
 * parked and disabled, and the vehicle drives `live.me` and the camera instead.
 */
export function Player({ model, start }: { model: ModelId; start: { x: number; z: number } }) {
  const { world } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<Collider | null>(null);
  const kcc = useRef<KinematicCharacterController | null>(null);
  const vy = useRef(0);
  const facing = useRef(0);
  const visual = useRef<THREE.Group>(null);
  const [anim, setAnim] = useState<AnimId>("idle");
  const [animSpeed, setAnimSpeed] = useState(1);
  const lastHud = useRef(0);
  const prevMode = useRef(live.me.mode);
  const romanceCycle = useRef(0);

  useEffect(() => {
    const c = world.createCharacterController(0.04);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.enableAutostep(0.42, 0.25, false);
    c.enableSnapToGround(0.6);
    c.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    c.setApplyImpulsesToDynamicBodies(true);
    kcc.current = c;
    return () => {
      world.removeCharacterController(c);
      kcc.current = null;
    };
  }, [world]);

  useEffect(() => {
    const b = body.current;
    if (!b) return;
    const y = surfaceHeight(start.x, start.z) + 1.2;
    b.setTranslation({ x: start.x, y, z: start.z }, true);
    live.me.pos.set(start.x, y, start.z);
  }, [start.x, start.z]);

  // Register a romance interactable when the partner is within 2.5 m.
  useEffect(() => {
    const id = "romance:partner";
    live.interactables.set(id, {
      label: () => {
        const p = live.partner;
        if (!p || Date.now() - p.seen > 6000) return null;
        if (live.me.mode !== "walk") return null;
        if (live.me.pos.distanceTo(p.shown) > 2.5) return null;
        return ROMANCE_OPTIONS[romanceCycle.current % ROMANCE_OPTIONS.length].label;
      },
      pos: () => live.partner?.shown ?? live.me.pos,
      radius: 2.5,
      act: () => {
        const opt = ROMANCE_OPTIONS[romanceCycle.current % ROMANCE_OPTIONS.length];
        romanceCycle.current = (romanceCycle.current + 1) % ROMANCE_OPTIONS.length;
        emote.anim = opt.anim;
        emote.until = performance.now() / 1000 + 4;
        live.pendingRomance = { action: opt.label, anim: opt.anim };
        sfx.romance();
      },
    });
    return () => { live.interactables.delete(id); };
  }, []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const b = body.current;
    const c = kcc.current;
    const col = collider.current ?? b?.collider(0) ?? null;
    collider.current = col;
    if (!b || !c || !col) return;
    const mode = live.me.mode;

    // Leaving a vehicle / teleporting: place the capsule.
    if (live.teleport) {
      const t = live.teleport;
      live.teleport = null;
      b.setNextKinematicTranslation({ x: t.x, y: t.y, z: t.z });
      b.setTranslation({ x: t.x, y: t.y, z: t.z }, true);
      if (t.ry !== undefined) facing.current = t.ry;
      vy.current = 0;
      live.me.pos.set(t.x, t.y, t.z);
    }
    if (mode !== prevMode.current) {
      col.setEnabled(mode === "walk");
      prevMode.current = mode;
      if (mode === "walk") live.me.heading = undefined;
    }

    if (mode !== "walk") {
      if (visual.current) visual.current.visible = false;
      // E leaves a car or the jet (the server frees the seat; the network layer puts us beside it).
      if ((mode === "car" || mode === "passenger" || mode === "jet") && live.me.vehicle) {
        const seat = isMine(live.seats[live.me.vehicle]?.driver) ? "driver" : "passenger";
        hud.set({ prompt: mode === "jet" ? "Leave the jet (on the ground)" : "Get out" });
        if (take("interact")) {
          if (mode === "jet" && live.jetAirborne) toastHud("Land the jet first");
          else live.send({ type: "seat", vehicle: live.me.vehicle, seat, action: "release" });
        }
      }
      return;
    }
    if (visual.current) visual.current.visible = true;

    // Camera-relative movement.
    const a = axis();
    const mag = Math.min(1, Math.hypot(a.x, a.y));
    const yaw = live.cameraYaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let mx = (fx * -a.y + rx * a.x) * mag, mz = (fz * -a.y + rz * a.x) * mag;
    const len = Math.hypot(mx, mz);
    if (len > 1e-3) {
      mx /= len;
      mz /= len;
    }
    const touchWalk = input.stick.x !== 0 || input.stick.y !== 0 ? mag < 0.55 : false;
    const p = b.translation();
    const swimming = p.y < WATER - 0.9;
    let speed = mag < 0.05 ? 0 : input.held.sprint ? SPRINT : touchWalk ? WALK : JOG;
    if (swimming) speed = Math.min(speed, 1.8);

    // Holding hands: when you're not steering and your partner walks off beside you, walk with them.
    const pt = live.partner;
    let holding = false;
    if (mag < 0.05 && pt && Date.now() - pt.seen < 3000 && pt.target.mode === "walk" && (pt.target.anim === "walk" || pt.target.anim === "run")) {
      const dx0 = p.x - pt.shown.x, dz0 = p.z - pt.shown.z;
      if (Math.hypot(dx0, dz0) < 3.2) {
        const h = pt.target.ry, rx2 = Math.cos(h), rz2 = -Math.sin(h);
        const side = dx0 * rx2 + dz0 * rz2 >= 0 ? 1 : -1;
        const tx = pt.shown.x + rx2 * side * 0.75 - Math.sin(h) * 0.1, tz = pt.shown.z + rz2 * side * 0.75 - Math.cos(h) * 0.1;
        const ddx = tx - p.x, ddz = tz - p.z, dd = Math.hypot(ddx, ddz);
        holding = true;
        if (dd > 0.08) {
          mx = ddx / dd;
          mz = ddz / dd;
          speed = Math.min(SPRINT, (pt.target.anim === "run" ? JOG : WALK) + dd * 3);
        }
      }
    }
    hands.holding = holding;

    // Gravity / jumping.
    const grounded = c.computedGrounded();
    if (grounded) vy.current = Math.max(vy.current, -2);
    if (take("jump") && grounded && !swimming) vy.current = JUMP;
    vy.current -= GRAVITY * dt;
    if (swimming && vy.current < 0) vy.current = 0;

    const desired = { x: mx * speed * dt, y: vy.current * dt, z: mz * speed * dt };
    c.computeColliderMovement(col, desired, undefined, undefined, (other) => (other.parent()?.userData as { kind?: string } | undefined)?.kind !== "player");
    const mv = c.computedMovement();
    let nx = p.x + mv.x, ny = p.y + mv.y, nz = p.z + mv.z;
    const minH = surfaceHeight(nx, nz);
    if (ny < minH) {
      ny = minH;
      vy.current = 0;
    }
    b.setNextKinematicTranslation({ x: nx, y: ny, z: nz });

    // Face the direction of travel.
    if (speed > 0) {
      const target = Math.atan2(mx, mz);
      let d = target - facing.current;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      facing.current += d * Math.min(1, dt * 12);
      emote.anim = null;
    }
    if (visual.current) visual.current.rotation.y = facing.current;

    // Animation state.
    let next: AnimId = speed === 0 ? "idle" : speed <= WALK ? "walk" : "run";
    let sp = speed === 0 ? 1 : speed <= WALK ? speed / 1.35 : speed / 4.6;
    if (emote.anim && state.clock.elapsedTime < emote.until) next = emote.anim;
    else emote.anim = null;
    if (swimming && speed > 0) {
      next = "walk";
      sp = 0.7;
    }
    if (next !== anim) setAnim(next);
    if (Math.abs(sp - animSpeed) > 0.1) setAnimSpeed(sp);

    live.me.pos.set(nx, ny, nz);
    live.me.ry = facing.current;
    live.me.anim = next;
    live.cameraTarget.set(nx, ny + (hud.get().view === "first" ? 1.62 : 1.45), nz);

    if (state.clock.elapsedTime - lastHud.current > 0.25) {
      lastHud.current = state.clock.elapsedTime;
      hud.set({ location: districtAt(nx, nz).name, speedKmh: Math.round(speed * 3.6) });
    }
    handleInteract();
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} userData={{ kind: "player" }} enabledRotations={[false, false, false]}>
      <CapsuleCollider args={[0.55, 0.3]} position={[0, 0.85, 0]} />
      <group ref={visual}>
        <Suspense fallback={null}>
          <Avatar model={model} anim={anim} speed={animSpeed} />
        </Suspense>
      </group>
    </RigidBody>
  );
}

/** Finds the nearest usable thing, shows its prompt, and runs it on E / the action button. */
function handleInteract() {
  const me = live.me.pos;
  let best: { label: string; act: () => void; d: number } | null = null;
  for (const it of live.interactables.values()) {
    const label = it.label();
    if (!label) continue;
    const d = it.pos().distanceTo(me);
    if (d < it.radius && (!best || d < best.d)) best = { label, act: it.act, d };
  }
  hud.set({ prompt: best ? best.label : null });
  if (best && take("interact")) best.act();
}

/** Puts the player on foot beside a vehicle (driver side first, then other side). */
export function exitBeside(pos: THREE.Vector3, quat: THREE.Quaternion, side = 1) {
  const left = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).setY(0).normalize();
  const spot = pos.clone().addScaledVector(left, 2.3 * side);
  const ground = Math.max(terrainHeight(spot.x, spot.z), WATER - 1);
  live.teleport = { x: spot.x, y: Math.max(ground, pos.y - 0.5) + 0.6, z: spot.z };
}
