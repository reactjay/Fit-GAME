"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useWorld } from "@/lib/world-context";
import { CameraRig } from "./actors/CameraRig";
import { Car } from "./actors/Car";
import { Avatar, LOCAL_MEN, LOCAL_WOMEN, preloadAvatar, type ModelId } from "./actors/Avatar";
import { Jet, ParkedAirliner } from "./actors/Aircraft";
import { Player } from "./actors/Player";
import { RemotePlayer } from "./actors/RemotePlayer";
import { Traffic, danfoSeat } from "./actors/Traffic";
import { Train, trainSeat, trainCarPose } from "./actors/Train";
import { Hud } from "./hud/Hud";
import { bindDesktopInput, input } from "./input";
import { GameNet } from "./net";
import { live } from "./shared";
import { QUALITY, hud, toastHud, useHud } from "./store";
import { Crowd } from "./actors/Crowd";
import { Locals } from "./actors/Locals";
import { HandLink, RomanceAura } from "./actors/RomanceAura";
import { Atmosphere } from "./world/Atmosphere";
import { Near } from "./world/Near";
import { Landmarks } from "./world/Landmarks";
import { DateSpots } from "./world/DateSpots";
import { Weather } from "./world/Weather";
import { Fireworks, fireworks } from "./world/Fireworks";
import { LoveNotesNet, NoteMarkers } from "./notes";
import { milestoneToday } from "@/lib/milestones";
import { Ambience } from "./Ambience";
import { Streetlife } from "./world/Streetlife";
import { Buildings } from "./world/Buildings";
import { PARKING, SPAWN } from "./world/layout";
import { Railway } from "./world/Rail";
import { Roads } from "./world/Roads";
import { Terrain, Water } from "./world/Terrain";
import { StreetLights, Vegetation } from "./world/Vegetation";

/** Exposes a "take a photo" function to the HUD (renders one frame, then reads the canvas). */
export const capture = { photo: null as null | (() => Promise<Blob | null>) };
function CaptureBridge() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    capture.photo = () =>
      new Promise((resolve) => {
        gl.render(scene, camera);
        gl.domElement.toBlob((b) => resolve(b), "image/jpeg", 0.88);
      });
    if (process.env.NODE_ENV !== "production") Object.assign((window as unknown as { __justus?: object }).__justus ?? {}, { gl, scene, camera });
    return () => void (capture.photo = null);
  }, [gl, scene, camera]);
  return null;
}

/** Marks loading as done once the first frame has rendered with everything mounted. */
function Ready() {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    hud.set({ loading: { done: true, progress: 100, label: "Welcome to Lagos" } });
  });
  return null;
}

/** Real loading progress from three.js's loading manager (every texture, model and sky). */
function useLoadingProgress() {
  useEffect(() => {
    const m = THREE.DefaultLoadingManager;
    const label = (url: string) => (/characters|anims/.test(url) ? "Dressing your characters" : /vehicles|draco/.test(url) ? "Parking the cars" : /textures|env/.test(url) ? "Painting the streets" : "Building Lagos");
    m.onProgress = (url, loaded, total) => {
      if (hud.get().loading.done) return;
      queueMicrotask(() => hud.set({ loading: { done: false, progress: Math.round((loaded / Math.max(total, 1)) * 95), label: label(url) } }));
    };
    return () => void (m.onProgress = () => {});
  }, []);
}

/** Your own avatar while riding the train (on foot, the Player component draws it). */
function SelfOnTrain({ model }: { model: ModelId }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current) return;
    const v = live.me.vehicle ?? "";
    if (live.me.mode === "train" && v.startsWith("train:")) {
      const [, car, seat] = v.split(":").map(Number);
      g.current.position.copy(trainSeat(car, seat)).y -= 0.55;
      g.current.rotation.y = trainCarPose(car).heading;
      g.current.visible = true;
    } else if (live.me.mode === "bus" && v.startsWith("danfo:")) {
      const [, id, seat] = v.split(":").map(Number);
      const s = danfoSeat(id, seat);
      if (s) {
        g.current.position.copy(s.pos).y -= 0.5;
        g.current.rotation.y = s.heading;
      }
      g.current.visible = true;
    } else g.current.visible = false;
  });
  return (
    <group ref={g} visible={false}>
      <Suspense fallback={null}>
        <Avatar model={model} anim="sit" />
      </Suspense>
    </group>
  );
}

export default function Game() {
  const { me, partner, role, world } = useWorld();
  const quality = useHud((s) => s.quality);
  const character = useHud((s) => s.character);
  const hourOverride = useHud((s) => s.hourOverride);
  const q = QUALITY[quality];
  const wrap = useRef<HTMLDivElement>(null);
  useLoadingProgress();
  const [start] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("justus:pos3d") ?? "null");
      if (saved && Math.abs(saved.x) < 1950 && Math.abs(saved.z) < 1950) return saved as { x: number; z: number };
    } catch {}
    return { x: SPAWN.x + (role === "creator" ? -2 : 2), z: SPAWN.z };
  });

  // Character choice (saved per device; defaults differ per partner so you look like a couple).
  const ALL_MODEL_IDS: ModelId[] = ["amara", "kofi", ...LOCAL_MEN, ...LOCAL_WOMEN];
  useEffect(() => {
    let chosen: ModelId = role === "creator" ? "amara" : "kofi";
    try {
      const saved = localStorage.getItem("justus:character");
      if (saved && (ALL_MODEL_IDS as string[]).includes(saved)) chosen = saved as ModelId;
    } catch {}
    live.me.model = chosen;
    hud.set({ character: chosen });
    for (const m of ALL_MODEL_IDS) preloadAvatar(m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
  useEffect(() => {
    live.me.model = character as ModelId;
  }, [character]);

  // Milestone days (100 days, anniversaries…) light up the sky once the city has loaded.
  const loaded = useHud((s) => s.loading.done);
  useEffect(() => {
    const m = loaded ? milestoneToday(world.relationship_start) : null;
    if (!m) return;
    fireworks.until = performance.now() + 90_000;
    toastHud(`🎆 Happy ${m.label}! Look up — fireworks over Lagos ${m.emoji}`, 6000);
  }, [loaded, world.relationship_start]);

  // Development-only handle for scripted testing (stripped from production builds).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __justus: unknown }).__justus = { live, hud, input };
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const off = bindDesktopInput(el);
    const save = setInterval(() => {
      if (live.me.mode === "walk") {
        try {
          localStorage.setItem("justus:pos3d", JSON.stringify({ x: Math.round(live.me.pos.x), z: Math.round(live.me.pos.z) }));
        } catch {}
      }
    }, 4000);
    return () => {
      off();
      clearInterval(save);
    };
  }, []);

  const cars = useMemo(() => PARKING.map((p) => <Car key={p.id} id={p.id} color={p.color} spawn={p} />), []);

  return (
    <div ref={wrap} className="fixed inset-0 z-0 touch-none select-none bg-black" style={{ height: "100dvh" }}>
      <Canvas
        shadows={q.shadows ? "soft" : false}
        dpr={[1, q.dpr]}
        camera={{ fov: 62, near: 0.25, far: q.far, position: [start.x, 10, start.z + 8] }}
        gl={{ antialias: q.antialias, powerPreference: "high-performance", stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
            <Atmosphere shadows={q.shadows} shadowSize={q.shadowSize} fog={q.fog} hourOverride={hourOverride} />
            <Terrain segments={q.terrainSegments} />
            <Water />
            <Roads />
            <Buildings />
            <Vegetation share={q.treeShare} viewDistance={q.vegDistance} shadows={q.vegShadows} />
            <StreetLights />
            <Streetlife density={quality === "low" ? 0.45 : quality === "medium" ? 0.75 : 1} />
            <Landmarks />
            <DateSpots partnerName={partner?.display_name ?? null} />
            <Weather partnerName={partner?.display_name ?? null} />
            <Fireworks />
            <NoteMarkers meId={me.id} />
            <Crowd scale={quality === "low" ? 0.45 : quality === "medium" ? 0.75 : 1} viewDistance={quality === "low" ? 160 : quality === "medium" ? 260 : 380} />
            <Locals men={quality === "low" ? 3 : quality === "medium" ? 4 : 6} women={quality === "low" ? 1 : quality === "medium" ? 2 : 4} shadows={quality !== "low"} />
            <Railway sleeperStep={quality === "low" ? 1.4 : 0.75} />
            <Train />
            <Traffic scale={quality === "low" ? 0.5 : quality === "medium" ? 0.8 : 1} />
            <Near distance={1500} at={[-1100, 10, -712]}>
              <ParkedAirliner />
            </Near>
            <Jet />
            {cars}
            <Player model={character as ModelId} start={start} />
            <SelfOnTrain model={character as ModelId} />
            {partner && <RemotePlayer name={partner.display_name} />}
            {partner && <RomanceAura />}
            {partner && <HandLink partnerName={partner.display_name} />}
            <CameraRig />
          </Physics>
          <CaptureBridge />
          <Ready />
        </Suspense>
      </Canvas>
      <GameNet />
      <Ambience />
      <LoveNotesNet />
      <Hud meName={me.display_name} partnerName={partner?.display_name ?? null} />
    </div>
  );
}
