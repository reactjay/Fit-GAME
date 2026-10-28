"use client";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import { useSignedUrl } from "@/lib/signed-urls";
import { Avatar, preloadAvatar, type AnimId, type ModelId } from "@/game/actors/Avatar";
import { Box, Cyl, Palm, itemDef, mat } from "./furniture";
import { FURNITURE_IDS, home, houseApi, setTv, type SeatTarget } from "./state";
import { FIXED_SEATS, FRONT_DOOR, KITCHEN_ISLAND, ROOMS, SLOTS, STARTER, WALLS, WALL_H, WALL_T, buildGrid, findPath, type Blocker } from "./layout";

const SIT_OFFSET = 0.5; // the sit animation drops the hips this far behind the feet
const WALK_SPEED = 1.7;



export const WALLPAPER_COLOR: Record<string, string> = {
  plum: "#6c5a8e", rose: "#c27a93", stars: "#3a3f86", cream: "#efe3cc", sage: "#8aa592", ankara: "#c8763a",
};

export type Placed = { slot: number; item: string };
export type HouseProps = {
  placed: Placed[];
  emojiOf: (id: string) => string | undefined;
  wallpaper: string;
  ambience: string;
  photos: string[];
  myModel: ModelId;
  placing: string | null;
  removing: boolean;
  onSlot: (slot: number) => void;
  onAction: (a: "tv" | "radio" | "piano" | "sat" | "sleep", key?: string) => void;
  azimuth: number;
};

const now = () => performance.now() / 1000;

export function House(props: HouseProps) {
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 36, position: [6, 15, 15], near: 0.5, far: 200 }} gl={{ antialias: true }}>
      <Suspense fallback={null}>
        <Scene {...props} />
      </Suspense>
    </Canvas>
  );
}

function Scene(p: HouseProps) {
  const night = p.ambience === "stars";
  const sky = p.ambience === "sunset" ? "#f2a37a" : p.ambience === "rain" ? "#8d97a8" : night ? "#141433" : "#cfe7f5";
  const items = useMemo(() => {
    const bySlot = new Map(p.placed.map((x) => [x.slot, x.item]));
    return SLOTS.map((s, i) => {
      const placed = bySlot.get(i) ?? null;
      // Small decor never pushes out the starter sofa/bed/table: it sits on a side table beside it.
      if (placed && STARTER[i] && !FURNITURE_IDS.has(placed)) return { slot: i, s, item: STARTER[i], touch: placed };
      return { slot: i, s, item: placed ?? STARTER[i] ?? null, touch: null as string | null };
    });
  }, [p.placed]);
  const blocked = useMemo(() => {
    const blockers: Blocker[] = [
      { x: KITCHEN_ISLAND.x, z: KITCHEN_ISLAND.z, hw: KITCHEN_ISLAND.w / 2, hd: KITCHEN_ISLAND.d / 2, ry: 0 },
      { x: 8.55, z: 1.0, hw: 0.35, hd: 2.4, ry: 0 }, // counters
      { x: 8.4, z: -1.0, hw: 0.45, hd: 0.4, ry: 0 }, // fridge
      { x: 8.25, z: 4.3, hw: 0.65, hd: 0.65, ry: 0 }, // shower
      { x: 2.0, z: 6.5, hw: 0.3, hd: 0.35, ry: 0 }, // toilet
      { x: 4.6, z: 6.75, hw: 0.4, hd: 0.25, ry: 0 }, // sink
      { x: -7.8, z: -4.7, hw: 0.75, hd: 2.3, ry: 0 }, // stairs
      { x: 8.6, z: -5.8, hw: 0.3, hd: 0.7, ry: 0 }, // wardrobe
      { x: 12, z: 4, hw: 1.0, hd: 2.2, ry: 0 }, // car
    ];
    for (const it of items) {
      if (!it.item) continue;
      const d = itemDef(it.item);
      if (d.hw > 0) blockers.push({ x: it.s.x, z: it.s.z, hw: d.hw, hd: d.hd, ry: it.s.ry });
    }
    return buildGrid(blockers);
  }, [items]);

  // Every seat in the house, in world space.
  const seats = useMemo(() => {
    const out: (SeatTarget & { label: string })[] = FIXED_SEATS.map((s, i) => ({ key: `fixed:${i}`, x: s.x, z: s.z, ry: s.ry, label: s.label }));
    for (const it of items) {
      const d = it.item ? itemDef(it.item) : null;
      d?.seats?.forEach(([dx, dz, r], k) => {
        const c = Math.cos(it.s.ry), s = Math.sin(it.s.ry);
        out.push({ key: `slot:${it.slot}:${k}`, x: it.s.x + dx * c + dz * s, z: it.s.z - dx * s + dz * c, ry: it.s.ry + r, label: d.sitLabel ?? "Sit" });
      });
    }
    return out;
  }, [items]);

  const walkTo = (x: number, z: number, sit: SeatTarget | null = null) => {
    const m = home.me;
    const goal: [number, number] = sit ? [sit.x + Math.sin(sit.ry) * SIT_OFFSET, sit.z + Math.cos(sit.ry) * SIT_OFFSET] : [x, z];
    const path = findPath(blocked, [m.x, m.z], goal);
    if (!path) return;
    m.path = path.slice(1);
    m.sitTarget = sit;
    m.seat = null;
    m.emote = null;
  };
  const sitIn = (keys: string[]) => {
    const taken = home.partner?.seat;
    const free = seats.filter((s) => keys.includes(s.key) && s.key !== taken);
    if (!free.length) return;
    const m = home.me;
    free.sort((a, b) => Math.hypot(a.x - m.x, a.z - m.z) - Math.hypot(b.x - m.x, b.z - m.z));
    walkTo(0, 0, free[0]);
  };
  // Lets the overlay ask us to go eat.
  useEffect(() => {
    houseApi.eat = () => sitIn(seats.filter((s) => s.key.startsWith("fixed:")).map((s) => s.key));
    houseApi.walkToPartner = () => {
      if (home.partner) walkTo(home.partner.sx + 0.9, home.partner.sz + 0.4);
    };
  });

  const floorClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (p.placing || p.removing) return;
    walkTo(e.point.x, e.point.z);
  };

  return (
    <>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 40, 90]} />
      <hemisphereLight args={[night ? "#5a5aa0" : "#ffffff", "#6b7d4a", night ? 0.45 : 1.1]} />
      <directionalLight
        position={[12, 20, 9]}
        intensity={night ? 0.35 : p.ambience === "rain" ? 0.7 : 1.7}
        color={p.ambience === "sunset" ? "#ffb070" : "#fff6e6"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-bias={-0.0004}
      />
      <CameraRig azimuth={p.azimuth} />
      <Ground onClick={floorClick} />
      <Floors onClick={floorClick} />
      <Walls color={WALLPAPER_COLOR[p.wallpaper] ?? WALLPAPER_COLOR.plum} />
      <Fixtures night={night} onEat={() => sitIn(["fixed:0", "fixed:1"])} />
      <PhotoWall photos={p.photos} />
      {items.map(({ slot, s, item, touch }) => (
        <group key={slot} position={[s.x, 0, s.z]} rotation-y={s.ry}>
          {item && (
            <group
              onClick={(e) => {
                e.stopPropagation();
                if (p.removing || p.placing) return p.onSlot(slot);
                const d = itemDef(item);
                if (d.action === "tv") {
                  setTv(!home.tvOn);
                  p.onAction("tv");
                } else if (d.action === "radio") p.onAction("radio");
                if (item.includes("bed")) {
                  p.onAction("sleep", item);
                }
                if (d.seats?.length) sitIn(d.seats.map((_, k) => `slot:${slot}:${k}`));
                else if (d.action !== "tv" && d.action !== "radio" && !item.includes("bed")) walkTo(s.x + Math.sin(s.ry) * (d.hd + 0.6), s.z + Math.cos(s.ry) * (d.hd + 0.6));
              }}
            >
              <ItemModel id={item} emoji={p.emojiOf(item)} />
              {p.removing && !item.startsWith("starter_") && <Ring color="#ff6b6b" />}
            </group>
          )}
          {touch && (
            <group position={[itemDef(item!).hw + 0.5, 0, 0]} onClick={(e) => (e.stopPropagation(), (p.removing || p.placing) && p.onSlot(slot))}>
              <ItemModel id={touch} emoji={p.emojiOf(touch)} />
              {p.removing && <Ring color="#ff6b6b" />}
            </group>
          )}
          {p.placing && <SlotMarker onPick={() => p.onSlot(slot)} filled={Boolean(item)} />}
        </group>
      ))}
      <IslandPlates />
      <Me model={p.myModel} onSat={(key) => p.onAction(seats.find((s) => s.key === key)?.label.includes("piano") ? "piano" : "sat", key)} />
      <Partner />
      <Hearts />
    </>
  );
}


function CameraRig({ azimuth }: { azimuth: number }) {
  const ctrl = useRef<OrbitImpl>(null);
  const goal = useRef(azimuth);
  useEffect(() => {
    goal.current = azimuth;
  }, [azimuth]);
  useFrame((_, dt) => {
    const c = ctrl.current;
    if (!c) return;
    const cur = c.getAzimuthalAngle();
    let d = goal.current - cur;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 0.002) {
      c.setAzimuthalAngle(cur + d * Math.min(1, dt * 4));
      c.update();
    }
  });
  return (
    <OrbitControls
      ref={ctrl}
      target={[1, 0, 1.5]}
      enablePan={false}
      minPolarAngle={0.55}
      maxPolarAngle={0.95}
      minDistance={9}
      maxDistance={42}
      enableDamping
      onChange={() => {
        goal.current = ctrl.current?.getAzimuthalAngle() ?? goal.current;
      }}
    />
  );
}

function Ground({ onClick }: { onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[2, -0.02, 2]} receiveShadow onClick={onClick} material={mat("#8fbf6f", { rough: 1 })}>
        <circleGeometry args={[17, 64]} />
      </mesh>
      {/* paved border and the path to the front door */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow material={mat("#cdc5b6", { rough: 1 })}>
        <planeGeometry args={[19.6, 15.6]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[-5.9, -0.005, 10]} receiveShadow onClick={onClick} material={mat("#cdc5b6", { rough: 1 })}>
        <planeGeometry args={[1.6, 5.4]} />
      </mesh>
      {/* carport */}
      <mesh rotation-x={-Math.PI / 2} position={[12, -0.005, 4]} receiveShadow onClick={onClick} material={mat("#9b968e", { rough: 1 })}>
        <planeGeometry args={[4.2, 6]} />
      </mesh>
      <group position={[12, 0, 4]}>
        <Box s={[1.8, 0.55, 4.1]} p={[0, 0.5, 0]} c="#2f3338" />
        <Box s={[1.6, 0.5, 2.0]} p={[0, 1.0, -0.2]} c="#25282c" />
        <Box s={[1.55, 0.42, 1.9]} p={[0, 1.02, -0.2]} m={mat("#9fc4e6", { opacity: 0.6, rough: 0.1 })} />
        {[-0.85, 0.85].flatMap((x) => [-1.3, 1.3].map((z) => <Cyl key={`${x}${z}`} rt={0.34} h={0.25} p={[x, 0.34, z]} r={[0, 0, Math.PI / 2]} c="#111" />))}
        {[-2, 2].flatMap((x) => [-3, 3].map((z) => <Cyl key={`p${x}${z}`} rt={0.06} h={2.6} p={[x, 1.3, z]} c="#ddd" seg={8} />))}
        <Box s={[4.4, 0.1, 6.4]} p={[0, 2.62, 0]} m={mat("#f4f1ea", { opacity: 0.35 })} />
      </group>
      <group position={[-10.5, 0, 9]}>
        <Palm s={1.8} />
      </group>
      <group position={[14.5, 0, -3]}>
        <Palm s={2} />
      </group>
    </group>
  );
}

const FLOOR: Record<string, string> = { dark: "#4a4752", tile: "#e3ddd2", carpet: "#4a3f58", wood: "#8a5a35" };
function Floors({ onClick }: { onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  return (
    <group>
      {ROOMS.map((r) => (
        <mesh key={r.id} rotation-x={-Math.PI / 2} position={[(r.x0 + r.x1) / 2, 0.005, (r.z0 + r.z1) / 2]} receiveShadow onClick={onClick} material={mat(FLOOR[r.floor], { rough: r.floor === "tile" ? 0.35 : 0.9 })}>
          <planeGeometry args={[r.x1 - r.x0, r.z1 - r.z0]} />
        </mesh>
      ))}
      {/* white floor stripes like a designer living room */}
      {[-1, 0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[-7.6 + i * 0.36, 0.008, 4.6]} material={mat("#f4f1ea")}>
          <planeGeometry args={[0.12, 2.6]} />
        </mesh>
      ))}
    </group>
  );
}

function Walls({ color }: { color: string }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }), [color]);
  const cap = mat("#f6f2ea");
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    camera.getWorldDirection(dir);
    WALLS.forEach((w, i) => {
      const m = refs.current[i];
      if (!m) return;
      // Cutaway: outer walls between you and the camera drop to knee height.
      const facing = w.exterior && w.normal ? -(w.normal[0] * dir.x + w.normal[1] * dir.z) : 0;
      const h = facing > 0.25 ? 0.45 : WALL_H;
      m.scale.y = THREE.MathUtils.lerp(m.scale.y, h / WALL_H, 0.2);
      m.position.y = (WALL_H * m.scale.y) / 2;
    });
  });
  return (
    <group>
      {WALLS.map((w, i) => {
        const [ax, az] = w.a, [bx, bz] = w.b;
        const len = Math.hypot(bx - ax, bz - az) + WALL_T;
        return (
          <mesh key={i} ref={(m) => void (refs.current[i] = m)} position={[(ax + bx) / 2, WALL_H / 2, (az + bz) / 2]} rotation-y={-Math.atan2(bz - az, bx - ax)} material={w.exterior ? cap : wallMat} castShadow receiveShadow>
            <boxGeometry args={[len, WALL_H, WALL_T]} />
          </mesh>
        );
      })}
      {/* front door, swung open */}
      <group position={[FRONT_DOOR.x0, 0, FRONT_DOOR.z]} rotation-y={-1.2}>
        <Box s={[1.35, 2.1, 0.06]} p={[0.68, 1.05, 0]} c="#5a3420" />
      </group>
    </group>
  );
}

function Fixtures({ night, onEat }: { night: boolean; onEat: () => void }) {
  const white = "#f4f1ea", top = "#2a2a2e";
  return (
    <group>
      {/* kitchen run */}
      <Box s={[0.7, 0.9, 4.6]} p={[8.55, 0.45, 1.0]} c={white} />
      <Box s={[0.74, 0.05, 4.64]} p={[8.55, 0.92, 1.0]} c={top} />
      <Box s={[0.6, 0.02, 0.6]} p={[8.55, 0.95, 2.4]} c="#111" />
      {[[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]].map(([a, b], i) => (
        <Cyl key={i} rt={0.08} h={0.01} p={[8.55 + a, 0.965, 2.4 + b]} c="#444" seg={12} />
      ))}
      <Box s={[0.5, 0.06, 0.4]} p={[8.55, 0.95, 0.3]} c="#9aa3ad" />
      <Box s={[0.4, 0.6, 3.2]} p={[8.75, 1.9, 1.2]} c={white} />
      <Box s={[0.85, 1.9, 0.75]} p={[8.4, 0.95, -1.0]} c="#dfe3e6" />
      {/* island + stools */}
      <group onClick={(e) => (e.stopPropagation(), onEat())}>
        <Box s={[KITCHEN_ISLAND.w, 0.9, KITCHEN_ISLAND.d]} p={[KITCHEN_ISLAND.x, 0.45, KITCHEN_ISLAND.z]} c={white} />
        <Box s={[KITCHEN_ISLAND.w + 0.1, 0.05, KITCHEN_ISLAND.d + 0.2]} p={[KITCHEN_ISLAND.x, 0.93, KITCHEN_ISLAND.z + 0.1]} c="#e9e6e0" />
        {FIXED_SEATS.map((s, i) => (
          <group key={i} position={[s.x, 0, s.z]}>
            <Cyl rt={0.2} h={0.06} p={[0, 0.66, 0]} c="#1b1b1e" />
            <Cyl rt={0.03} h={0.64} p={[0, 0.32, 0]} c="#1b1b1e" seg={6} />
            <Cyl rt={0.16} h={0.02} p={[0, 0.01, 0]} c="#1b1b1e" />
          </group>
        ))}
      </group>
      {/* bathroom */}
      <Box s={[1.3, 2.1, 1.3]} p={[8.25, 1.05, 4.3]} m={mat("#cfe8f2", { opacity: 0.35, rough: 0.05 })} />
      <Box s={[1.3, 0.08, 1.3]} p={[8.25, 0.04, 4.3]} c="#fff" />
      <group position={[2.0, 0, 6.6]} rotation-y={Math.PI}>
        <Box s={[0.4, 0.4, 0.55]} p={[0, 0.2, 0.05]} c="#fff" />
        <Box s={[0.42, 0.5, 0.18]} p={[0, 0.55, -0.2]} c="#fff" />
      </group>
      <Box s={[0.8, 0.85, 0.45]} p={[4.6, 0.43, 6.75]} c="#fff" />
      <Box s={[0.7, 0.6, 0.04]} p={[4.6, 1.5, 6.9]} m={mat("#cfe3ee", { rough: 0.05, metal: 0.6 })} />
      {/* stairs to the (future) upstairs */}
      {Array.from({ length: 11 }, (_, i) => (
        <Box key={i} s={[1.4, 0.2 * (i + 1), 0.4]} p={[-7.8, 0.1 * (i + 1), -2.6 - i * 0.4]} c="#7a4a2c" />
      ))}
      <Box s={[0.05, 0.9, 4.6]} p={[-7.08, 2.0, -4.6]} r={[0.45, 0, 0]} c="#3a2a20" />
      {/* bedroom wardrobe */}
      <Box s={[0.6, 2.1, 1.4]} p={[8.6, 1.05, -5.8]} c="#f1ece4" />
      {/* lights: ceiling glow per room */}
      {[[-4, 0.6], [5, -4.2], [5, 1], [5, 5.2]].map(([x, z], i) => (
        <pointLight key={i} position={[x, 2.6, z]} intensity={night ? 6 : 1.5} distance={9} decay={1.7} color="#ffd9a8" />
      ))}
    </group>
  );
}

function IslandPlates() {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current) return;
    const occupied = new Set([home.me.seat, home.partner?.seat]);
    g.current.children.forEach((c, i) => void (c.visible = occupied.has(`fixed:${i}`)));
  });
  return (
    <group ref={g}>
      {FIXED_SEATS.map((s, i) => (
        <group key={i} position={[s.x, 0.96, KITCHEN_ISLAND.z + 0.25]} visible={false}>
          <Cyl rt={0.16} rb={0.13} h={0.02} p={[0, 0, 0]} c="#fff" />
          <mesh position={[-0.04, 0.03, 0]} scale={[1, 0.45, 1]} material={mat("#d9541e")}>
            <sphereGeometry args={[0.08, 10, 8]} />
          </mesh>
          <mesh position={[0.07, 0.025, 0.03]} rotation-y={0.6} scale={[1, 0.5, 0.5]} material={mat("#e8a531")}>
            <sphereGeometry args={[0.045, 8, 6]} />
          </mesh>
          <Cyl rt={0.035} rb={0.012} h={0.14} p={[0.18, 0.07, -0.1]} m={mat("#d9f0ff", { opacity: 0.4, rough: 0.05 })} />
        </group>
      ))}
    </group>
  );
}

function PhotoWall({ photos }: { photos: string[] }) {
  return (
    <group>
      {Array.from({ length: 6 }, (_, i) => (
        <PhotoFrame key={i} path={photos[i] ?? null} position={[-8.88, 1.85, -1.4 + i * 0.75]} />
      ))}
    </group>
  );
}

function PhotoFrame({ path, position }: { path: string | null; position: [number, number, number] }) {
  const { url } = useSignedUrl(path);
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        if (alive) setTex(t);
      },
      undefined,
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <group position={position} rotation-y={Math.PI / 2}>
      <mesh material={mat("#e2bd78", { metal: 0.6, rough: 0.35 })}>
        <boxGeometry args={[0.62, 0.52, 0.04]} />
      </mesh>
      <mesh position={[0, 0, 0.022]}>
        <planeGeometry args={[0.54, 0.44]} />
        {tex && url ? <meshBasicMaterial map={tex} toneMapped={false} /> : <meshStandardMaterial color="#2a2140" />}
      </mesh>
    </group>
  );
}

function ItemModel({ id, emoji }: { id: string; emoji?: string }) {
  const d = itemDef(id, emoji);
  const [on, setOn] = useState(false);
  useFrame(() => {
    if (id === "tv" && on !== home.tvOn) setOn(home.tvOn);
  });
  return <>{d.render(on)}</>;
}

function Ring({ color }: { color: string }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} material={mat(color, { emissive: color, glow: 1.5, opacity: 0.85 })}>
      <ringGeometry args={[0.55, 0.7, 32]} />
    </mesh>
  );
}

function SlotMarker({ onPick, filled }: { onPick: () => void; filled: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + 0.12 * Math.sin(clock.elapsedTime * 4));
  });
  return (
    <mesh
      ref={ref}
      rotation-x={-Math.PI / 2}
      position={[0, 0.05, 0]}
      onClick={(e) => (e.stopPropagation(), onPick())}
      material={mat(filled ? "#e2bd78" : "#e8789a", { emissive: filled ? "#e2bd78" : "#e8789a", glow: 1.8, opacity: 0.9 })}
    >
      <circleGeometry args={[0.55, 32]} />
    </mesh>
  );
}

// ── people ──────────────────────────────────────────────────────────────

function Me({ model, onSat }: { model: ModelId; onSat: (key: string) => void }) {
  const g = useRef<THREE.Group>(null);
  const [anim, setAnim] = useState<AnimId>("idle");
  useEffect(() => preloadAvatar(model), [model]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const m = home.me;
    let next: AnimId = "idle";
    if (m.path.length) {
      const [tx, tz] = m.path[0];
      const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz), step = WALK_SPEED * dt;
      if (d <= step) {
        m.x = tx;
        m.z = tz;
        m.path.shift();
      } else {
        m.x += (dx / d) * step;
        m.z += (dz / d) * step;
        let a = Math.atan2(dx, dz) - m.ry;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        m.ry += a * Math.min(1, dt * 10);
      }
      next = "walk";
      if (!m.path.length && m.sitTarget) {
        const s = m.sitTarget;
        m.x = s.x + Math.sin(s.ry) * SIT_OFFSET;
        m.z = s.z + Math.cos(s.ry) * SIT_OFFSET;
        m.ry = s.ry;
        m.seat = s.key;
        m.sitTarget = null;
        onSat(s.key);
      }
    } else if (m.seat) next = "sit";
    if (m.emote && now() < m.emote.until && !m.path.length) next = m.emote.anim;
    else if (m.emote && now() >= m.emote.until) m.emote = null;
    if (next !== anim) setAnim(next);
    g.current?.position.set(m.x, 0, m.z);
    if (g.current) g.current.rotation.y = m.ry;
  });
  return (
    <group ref={g}>
      <Suspense fallback={null}>
        <Avatar model={model} anim={anim} />
      </Suspense>
    </group>
  );
}

function Partner() {
  const g = useRef<THREE.Group>(null);
  const [anim, setAnim] = useState<AnimId>("idle");
  const [model, setModel] = useState<ModelId | null>(null);
  useFrame((_, dt) => {
    const p = home.partner;
    const here = Boolean(p && Date.now() - p.seen < 4000);
    if (!g.current) return;
    g.current.visible = here;
    if (!p || !here) return;
    if (p.model !== model) setModel(p.model as ModelId);
    const k = Math.hypot(p.x - p.sx, p.z - p.sz) > 6 ? 1 : 1 - Math.exp(-dt * 8);
    p.sx += (p.x - p.sx) * k;
    p.sz += (p.z - p.sz) * k;
    let a = p.ry - g.current.rotation.y;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    g.current.rotation.y += a * Math.min(1, dt * 10);
    g.current.position.set(p.sx, 0, p.sz);
    if (p.anim !== anim) setAnim(p.anim);
  });
  return (
    <group ref={g} visible={false}>
      {model && (
        <Suspense fallback={null}>
          <Avatar model={model} anim={anim} />
        </Suspense>
      )}
    </group>
  );
}

const heartTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.font = "52px system-ui, 'Apple Color Emoji'";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("💗", 32, 36);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
})();

/** Hearts rising between you two after a kiss or hug. */
function Hearts() {
  const g = useRef<THREE.Group>(null);
  const tex = useMemo(() => heartTex(), []);
  const seeds = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ dx: Math.sin(i * 2.4) * 0.5, dz: Math.cos(i * 1.7) * 0.4, delay: i * 0.12 })), []);
  useFrame(() => {
    if (!g.current) return;
    const t = now() - home.hearts;
    const live = t < 3;
    g.current.visible = live;
    if (!live) return;
    const p = home.partner;
    const cx = p ? (home.me.x + p.sx) / 2 : home.me.x, cz = p ? (home.me.z + p.sz) / 2 : home.me.z;
    g.current.children.forEach((s, i) => {
      const k = Math.max(0, t - seeds[i].delay);
      s.position.set(cx + seeds[i].dx * (1 + k * 0.3), 1.5 + k * 0.7, cz + seeds[i].dz);
      const sp = s as THREE.Sprite;
      (sp.material as THREE.SpriteMaterial).opacity = k > 0 ? Math.max(0, 1 - k / 2.6) : 0;
      sp.scale.setScalar(0.3 + 0.1 * Math.sin(k * 6));
    });
  });
  return (
    <group ref={g} visible={false}>
      {seeds.map((_, i) => (
        <sprite key={i}>
          <spriteMaterial map={tex} transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}

