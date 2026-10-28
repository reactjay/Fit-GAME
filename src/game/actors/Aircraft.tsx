"use client";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { input, isDown } from "../input";
import { isMine, live, seatUser } from "../shared";
import { hud, toastHud } from "../store";
import { AIRPORT, AIRPORT_HEIGHT, JET_SPAWN, WATER, inRect, terrainHeight } from "../world/layout";
import { Avatar } from "./Avatar";
import { flightStep } from "./flight";

// Procedural aircraft (no licensed GLB available without an account; see ASSETS.md).
type Spec = { length: number; radius: number; span: number; rootChord: number; tipChord: number; sweep: number; engines: "rear" | "wing"; livery: number; stripe: number; windows: number };

function planform(root: number, tip: number, span: number, sweep: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(span, -sweep);
  s.lineTo(span, -sweep - tip);
  s.lineTo(0, -root);
  s.closePath();
  return s;
}

export function useAircraftParts(spec: Spec) {
  return useMemo(() => {
    const { length: Lf, radius: R } = spec;
    // Fuselage profile (radius along length), turned on a lathe, nose toward +z.
    const prof: THREE.Vector2[] = [];
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const t = i / N; // 0 = tail, 1 = nose
      let r = R;
      if (t < 0.22) r = R * (0.25 + 0.75 * Math.sin((t / 0.22) * Math.PI / 2));
      if (t > 0.86) r = R * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.86) / 0.14, 2)));
      prof.push(new THREE.Vector2(Math.max(r, 0.001), t * Lf - Lf / 2));
    }
    const fuselage = new THREE.LatheGeometry(prof, 28).rotateX(Math.PI / 2).rotateY(Math.PI);
    // Tail upsweep: lift the rear underside.
    const fp = fuselage.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) {
      const z = fp.getZ(i);
      const t = THREE.MathUtils.clamp((-z - Lf * 0.22) / (Lf * 0.28), 0, 1);
      if (fp.getY(i) < 0) fp.setY(i, fp.getY(i) * (1 - 0.6 * t));
      fp.setY(i, fp.getY(i) + t * R * 0.45);
    }
    fuselage.computeVertexNormals();
    const wingL = new THREE.ExtrudeGeometry(planform(spec.rootChord, spec.tipChord, spec.span / 2, spec.sweep), { depth: 0.22, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 })
      .rotateX(Math.PI / 2)
      .translate(R * 0.3, -R * 0.45, spec.rootChord * 0.45);
    const wingR = wingL.clone().scale(-1, 1, 1);
    const tailSpan = spec.span * 0.32;
    const stabL = new THREE.ExtrudeGeometry(planform(spec.rootChord * 0.45, spec.tipChord * 0.6, tailSpan / 2, spec.sweep * 0.5), { depth: 0.12, bevelEnabled: false })
      .rotateX(Math.PI / 2)
      .translate(0, spec.engines === "rear" ? R * 2.4 : R * 0.5, -Lf / 2 + spec.rootChord * 0.55);
    const stabR = stabL.clone().scale(-1, 1, 1);
    const fin = new THREE.ExtrudeGeometry(planform(spec.rootChord * 0.65, spec.tipChord * 0.7, R * 2.4, spec.sweep * 0.7), { depth: 0.14, bevelEnabled: false })
      .rotateZ(Math.PI / 2)
      .rotateY(Math.PI / 2)
      .translate(0.07, R * 0.6, -Lf / 2 + spec.rootChord * 0.7);
    const nacelle = new THREE.CylinderGeometry(R * 0.42, R * 0.36, spec.engines === "rear" ? Lf * 0.16 : Lf * 0.12, 20).rotateX(Math.PI / 2);
    return { fuselage, wingL, wingR, stabL, stabR, fin, nacelle };
  }, [spec]);
}

export function AircraftModel({ spec, gear = 1 }: { spec: Spec; gear?: number }) {
  const parts = useAircraftParts(spec);
  const mats = useMemo(
    () => ({
      body: new THREE.MeshPhysicalMaterial({ color: spec.livery, metalness: 0.4, roughness: 0.25, clearcoat: 0.8 }),
      stripe: new THREE.MeshStandardMaterial({ color: spec.stripe, metalness: 0.3, roughness: 0.3 }),
      wing: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.6, roughness: 0.35 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1b1f24, metalness: 0.5, roughness: 0.4 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x0a1118, metalness: 0.9, roughness: 0.05 }),
      tyre: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    }),
    [spec.livery, spec.stripe],
  );
  const { length: Lf, radius: R } = spec;
  const engineSpots: [number, number, number][] =
    spec.engines === "rear"
      ? [[R * 1.25, R * 0.55, -Lf * 0.3], [-R * 1.25, R * 0.55, -Lf * 0.3]]
      : [[spec.span * 0.17, -R * 1.05, spec.rootChord * 0.4], [-spec.span * 0.17, -R * 1.05, spec.rootChord * 0.4]];
  return (
    <group>
      <mesh geometry={parts.fuselage} material={mats.body} castShadow receiveShadow />
      {/* cheatline */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * R * 0.985, -R * 0.1, -Lf * 0.04]} rotation-y={(s * Math.PI) / 2} material={mats.stripe}>
          <planeGeometry args={[Lf * 0.62, R * 0.16]} />
        </mesh>
      ))}
      {/* cabin windows */}
      {[-1, 1].map((s) =>
        Array.from({ length: spec.windows }, (_, i) => (
          <mesh key={`${s}${i}`} position={[s * R * 0.99, R * 0.22, Lf * 0.24 - i * ((Lf * 0.52) / spec.windows)]} rotation-y={(s * Math.PI) / 2} material={mats.glass}>
            <circleGeometry args={[R * 0.11, 12]} />
          </mesh>
        )),
      )}
      {/* cockpit */}
      <mesh position={[0, R * 0.45, Lf * 0.41]} rotation-x={-0.9} material={mats.glass}>
        <planeGeometry args={[R * 1.1, R * 0.45]} />
      </mesh>
      <mesh geometry={parts.wingL} material={mats.wing} castShadow />
      <mesh geometry={parts.wingR} material={mats.wing} castShadow />
      <mesh geometry={parts.stabL} material={mats.wing} castShadow />
      <mesh geometry={parts.stabR} material={mats.wing} castShadow />
      <mesh geometry={parts.fin} material={mats.body} castShadow />
      {/* winglets */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (spec.span / 2 + R * 0.3), -R * 0.1, spec.rootChord * 0.45 - spec.sweep - spec.tipChord / 2]} material={mats.stripe}>
          <boxGeometry args={[0.12, R * 0.9, spec.tipChord * 0.8]} />
        </mesh>
      ))}
      {engineSpots.map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={parts.nacelle} material={mats.wing} castShadow />
          <mesh position={[0, 0, (spec.engines === "rear" ? Lf * 0.08 : Lf * 0.06) + 0.01]} material={mats.dark}>
            <circleGeometry args={[R * 0.38, 20]} />
          </mesh>
        </group>
      ))}
      {/* landing gear */}
      {gear > 0.01 &&
        ([[0, Lf * 0.36], [R * 0.9, -Lf * 0.02], [-R * 0.9, -Lf * 0.02]] as [number, number][]).map(([x, z], i) => (
          <group key={i} position={[x, -R * 0.9, z]} scale={[1, gear, 1]}>
            <mesh position={[0, -R * 0.35, 0]} material={mats.dark}>
              <cylinderGeometry args={[0.07, 0.07, R * 0.7, 8]} />
            </mesh>
            <mesh position={[0, -R * 0.72, 0]} rotation-z={Math.PI / 2} material={mats.tyre}>
              <cylinderGeometry args={[R * 0.2, R * 0.2, 0.25, 16]} />
            </mesh>
          </group>
        ))}
    </group>
  );
}

export const JET_SPEC: Spec = { length: 20, radius: 1.15, span: 19, rootChord: 3.6, tipChord: 1.3, sweep: 3.2, engines: "rear", livery: 0xf7f5f0, stripe: 0xc9a227, windows: 8 };
export const AIRLINER_SPEC: Spec = { length: 44, radius: 2.05, span: 36, rootChord: 7.5, tipChord: 1.8, sweep: 8.5, engines: "wing", livery: 0xffffff, stripe: 0x00704a, windows: 30 };

/** A parked airliner at the terminal gate. */
export function ParkedAirliner() {
  const y = AIRPORT_HEIGHT + AIRLINER_SPEC.radius * 1.62;
  return (
    <group position={[-1100, y, -712]} rotation-y={Math.PI}>
      <AircraftModel spec={AIRLINER_SPEC} />
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[AIRLINER_SPEC.radius, AIRLINER_SPEC.radius, AIRLINER_SPEC.length / 2]} />
      </RigidBody>
    </group>
  );
}

// ── flyable private jet ───────────────────────────────────────────────
const GEAR_H = JET_SPEC.radius * 1.62;
const JET_ID = "jet-1";

function groundAt(x: number, z: number) {
  return inRect(AIRPORT, x, z) ? AIRPORT_HEIGHT + 0.08 : Math.max(terrainHeight(x, z), WATER);
}

export function Jet() {
  const group = useRef<THREE.Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const s = useRef({
    pos: new THREE.Vector3(JET_SPAWN.x, AIRPORT_HEIGHT + GEAR_H, JET_SPAWN.z),
    quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), JET_SPAWN.heading),
    speed: 0,
    throttle: 0,
    airborne: false,
    sink: 0,
  });
  const lastSend = useRef(0);
  const lastHud = useRef(0);

  useEffect(() => {
    const saved = live.poses.get(JET_ID)?.p;
    if (saved) {
      s.current.pos.set(saved[0], saved[1], saved[2]);
      s.current.quat.set(saved[3], saved[4], saved[5], saved[6]);
    }
    live.interactables.set(JET_ID, {
      radius: 9,
      pos: () => s.current.pos,
      label: () => {
        if (live.me.mode !== "walk" || s.current.airborne) return null;
        const seats = live.seats[JET_ID] ?? {};
        if (!seats.driver) return "Fly the jet";
        if (!seats.passenger) return "Board as passenger";
        return null;
      },
      act: () => {
        const seats = live.seats[JET_ID] ?? {};
        live.send({ type: "seat", vehicle: JET_ID, seat: seats.driver ? "passenger" : "driver", action: "claim" });
      },
    });
    return () => void live.interactables.delete(JET_ID);
  }, []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const st = s.current;
    const seats = live.seats[JET_ID] ?? {};
    const pilot = isMine(seats.driver);

    if (pilot) {
      // Throttle: W/S or touch buttons. Pitch: ↑ nose down / ↓ pull up (or stick), roll: ←/→, rudder: A/D.
      const ev = flightStep(
        st,
        {
          throttle: isDown("w") || input.held.throttleUp ? 1 : isDown("s") || input.held.throttleDown ? -1 : 0,
          pitch: (isDown("arrowdown") ? 1 : 0) - (isDown("arrowup") ? 1 : 0) + input.stick.y,
          roll: (isDown("arrowright") ? 1 : 0) - (isDown("arrowleft") ? 1 : 0) + input.stick.x,
          yaw: (isDown("a") ? 1 : 0) - (isDown("d") ? 1 : 0),
          brake: isDown(" ") || input.held.brake,
        },
        dt,
        (x, z) => ({ y: groundAt(x, z), paved: inRect(AIRPORT, x, z) }),
        GEAR_H,
      );
      if (ev === "crashed") {
        toastHud(inRect(AIRPORT, st.pos.x, st.pos.z) ? "Hard landing! The jet is back at the hangar." : "That wasn't a runway! The jet is back at the airport.", 4000);
        st.pos.set(JET_SPAWN.x, AIRPORT_HEIGHT + GEAR_H, JET_SPAWN.z);
        st.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), JET_SPAWN.heading);
        st.speed = 0;
        st.throttle = 0;
      } else if (ev === "landed") toastHud("Smooth landing ✈️");
      const q = st.quat;
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      live.jetAirborne = st.airborne;

      live.me.pos.copy(st.pos);
      live.me.heading = Math.atan2(dir.x, dir.z);
      const eye = hud.get().view === "first" ? new THREE.Vector3(0, JET_SPEC.radius * 0.45, JET_SPEC.length * 0.38).applyQuaternion(q).add(st.pos) : st.pos.clone().add(new THREE.Vector3(0, 3, 0));
      live.cameraTarget.copy(eye);
      if (state.clock.elapsedTime - lastSend.current > 1 / 15) {
        lastSend.current = state.clock.elapsedTime;
        live.send({ type: "pose", vehicle: JET_ID, p: [st.pos.x, st.pos.y, st.pos.z, q.x, q.y, q.z, q.w, +st.speed.toFixed(1), st.airborne ? 1 : 0] });
      }
      if (state.clock.elapsedTime - lastHud.current > 0.2) {
        lastHud.current = state.clock.elapsedTime;
        hud.set({ speedKmh: Math.round(st.speed * 3.6), altitude: Math.round(st.pos.y - GEAR_H - WATER), throttle: Math.round(st.throttle * 100), location: st.airborne ? "Over Lagos" : "Murtala Muhammed Airport" });
      }
    } else {
      // Someone else is flying (or it's parked): follow the network pose.
      const pose = live.poses.get(JET_ID);
      if (pose) {
        const p = pose.p;
        st.pos.lerp(new THREE.Vector3(p[0], p[1], p[2]), seats.driver ? 0.2 : 1);
        st.quat.slerp(new THREE.Quaternion(p[3], p[4], p[5], p[6]), seats.driver ? 0.2 : 1);
        st.speed = p[7] ?? 0;
        st.airborne = (p[8] ?? 0) > 0.5;
      }
      if (isMine(seats.passenger)) {
        live.me.pos.copy(st.pos);
        const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(st.quat);
        live.me.heading = Math.atan2(dir.x, dir.z);
        live.cameraTarget.copy(st.pos).add(new THREE.Vector3(0, 3, 0));
        hud.set({ speedKmh: Math.round(st.speed * 3.6), altitude: Math.round(st.pos.y - GEAR_H) });
      }
    }
    group.current?.position.copy(st.pos);
    group.current?.quaternion.copy(st.quat);
    body.current?.setNextKinematicTranslation(st.pos);
    body.current?.setNextKinematicRotation(st.quat);
    let entry = live.vehicles.get(JET_ID);
    if (!entry) live.vehicles.set(JET_ID, (entry = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), heading: 0, speed: 0 }));
    entry.pos.copy(st.pos);
    entry.quat.copy(st.quat);
    entry.speed = st.speed;
  });

  return (
    <>
      <group ref={group}>
        <AircraftModel spec={JET_SPEC} gear={1} />
        <JetSeat seat="driver" position={[0.35, -0.3, JET_SPEC.length * 0.33]} />
        <JetSeat seat="passenger" position={[0.45, -0.3, 2]} />
      </group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} userData={{ kind: "jet" }}>
        <CuboidCollider args={[JET_SPEC.radius, JET_SPEC.radius, JET_SPEC.length / 2]} />
      </RigidBody>
    </>
  );
}

function JetSeat({ seat, position }: { seat: "driver" | "passenger"; position: [number, number, number] }) {
  const a = useRef<THREE.Group>(null);
  const k = useRef<THREE.Group>(null);
  useFrame(() => {
    const user = live.seats[JET_ID]?.[seat];
    const model = user ? (seatUser(user) === live.me.id ? live.me.model : live.partnerModel) : null;
    if (a.current) a.current.visible = model === "amara";
    if (k.current) k.current.visible = model === "kofi";
  });
  return (
    <group position={position}>
      <group ref={a} visible={false}>
        <Suspense fallback={null}>
          <Avatar model="amara" anim="sit" castShadow={false} />
        </Suspense>
      </group>
      <group ref={k} visible={false}>
        <Suspense fallback={null}>
          <Avatar model="kofi" anim="sit" castShadow={false} />
        </Suspense>
      </group>
    </group>
  );
}
