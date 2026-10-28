"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

// Procedural furniture for the 3D home. Every piece faces +z at ry = 0.

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** Shared material by colour (+ options), so 40 pieces don't make 400 materials. */
export function mat(color: string, o: { rough?: number; metal?: number; emissive?: string; glow?: number; opacity?: number } = {}) {
  const key = `${color}|${o.rough ?? 0.7}|${o.metal ?? 0}|${o.emissive ?? ""}|${o.glow ?? 0}|${o.opacity ?? 1}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0 });
    if (o.emissive) {
      m.emissive.set(o.emissive);
      m.emissiveIntensity = o.glow ?? 1;
      m.toneMapped = false;
    }
    if (o.opacity !== undefined && o.opacity < 1) {
      m.transparent = true;
      m.opacity = o.opacity;
      m.depthWrite = false;
    }
    mats.set(key, m);
  }
  return m;
}

type V3 = [number, number, number];
const Box = ({ s, p, c, r, m }: { s: V3; p: V3; c?: string; r?: V3; m?: THREE.Material }) => (
  <mesh position={p} rotation={r} material={m ?? mat(c ?? "#ccc")} castShadow receiveShadow>
    <boxGeometry args={s} />
  </mesh>
);
const Cyl = ({ rt, rb, h, p, c, seg = 20, r, m }: { rt: number; rb?: number; h: number; p: V3; c?: string; seg?: number; r?: V3; m?: THREE.Material }) => (
  <mesh position={p} rotation={r} material={m ?? mat(c ?? "#ccc")} castShadow receiveShadow>
    <cylinderGeometry args={[rt, rb ?? rt, h, seg]} />
  </mesh>
);

export type ItemDef = {
  /** Half width (x) and half depth (z) of the footprint, for walking around it. */
  hw: number;
  hd: number;
  /** Seats: [dx, dz, facing] in the item's own frame. */
  seats?: [number, number, number][];
  sitLabel?: string;
  /** Tap action for things that aren't seats. */
  action?: "tv" | "radio" | "piano";
  render: (on: boolean) => ReactNode;
};

const GREEN = "#1f7a4d", GREEN_D = "#17603c", GOLD = "#e2bd78", NAVY = "#1d2c6b";

function Sofa({ color = GREEN, dark = GREEN_D, w = 2.6, l = true }: { color?: string; dark?: string; w?: number; l?: boolean }) {
  return (
    <group>
      <Box s={[w, 0.42, 0.95]} p={[0, 0.21, 0]} c={dark} />
      <Box s={[w - 0.3, 0.16, 0.8]} p={[0, 0.5, 0.05]} c={color} />
      <Box s={[w, 0.55, 0.22]} p={[0, 0.7, -0.38]} c={color} />
      <Box s={[0.18, 0.62, 0.95]} p={[-w / 2 + 0.09, 0.42, 0]} c={dark} />
      <Box s={[0.18, 0.62, 0.95]} p={[w / 2 - 0.09, 0.42, 0]} c={dark} />
      {[-0.7, 0, 0.7].map((x) => (
        <Box key={x} s={[0.32, 0.3, 0.1]} p={[x * (w / 2.6), 0.75, -0.24]} r={[-0.25, 0, 0]} c={GOLD} />
      ))}
      {l && (
        <group position={[w / 2 + 0.47, 0, 0.6]}>
          <Box s={[0.95, 0.42, 2.1]} p={[0, 0.21, 0]} c={dark} />
          <Box s={[0.8, 0.16, 1.9]} p={[-0.05, 0.5, 0]} c={color} />
          <Box s={[0.22, 0.55, 2.1]} p={[0.38, 0.7, 0]} c={color} />
        </group>
      )}
    </group>
  );
}

function ringTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f1ea";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = NAVY;
  g.beginPath();
  g.arc(128, 128, 120, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#f4f1ea";
  g.lineWidth = 10;
  for (const r of [100, 60]) {
    g.beginPath();
    g.arc(128, 128, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = "#f4f1ea";
  g.beginPath();
  g.arc(128, 128, 22, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    g.fillRect(128 + Math.cos(a) * 82 - 8, 128 + Math.sin(a) * 82 - 8, 16, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let rugMat: THREE.MeshStandardMaterial | null = null;
const Rug = () => {
  rugMat ??= new THREE.MeshStandardMaterial({ map: ringTexture(), roughness: 1 });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0]} material={rugMat} receiveShadow>
      <circleGeometry args={[1.7, 48]} />
    </mesh>
  );
};

function Tv({ on }: { on: boolean }) {
  const screen = useMemo(() => new THREE.MeshStandardMaterial({ color: "#05060a", emissive: "#6aa8ff", emissiveIntensity: 0, toneMapped: false }), []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current?.material as THREE.MeshStandardMaterial | undefined;
    if (!m) return;
    m.emissiveIntensity = on ? 0.9 + 0.25 * Math.sin(clock.elapsedTime * 3.1) : 0;
    if (on) m.emissive.setHSL((clock.elapsedTime * 0.05) % 1, 0.6, 0.55);
  });
  return (
    <group>
      <Box s={[1.8, 0.45, 0.45]} p={[0, 0.225, 0]} c="#3a2a20" />
      <Box s={[1.6, 0.92, 0.05]} p={[0, 1.0, 0.0]} c="#111" />
      <mesh ref={ref} position={[0, 1.0, 0.03]} material={screen}>
        <planeGeometry args={[1.5, 0.84]} />
      </mesh>
    </group>
  );
}

function Fish() {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.children.forEach((f, i) => {
      const t = clock.elapsedTime * (0.5 + i * 0.17) + i * 2;
      f.position.set(Math.sin(t) * 0.45, 0.75 + 0.12 * Math.sin(t * 1.7 + i), Math.cos(t * 0.6) * 0.12);
      f.rotation.y = Math.cos(t) > 0 ? 0 : Math.PI;
    });
  });
  return (
    <group ref={g}>
      {["#ff8a2a", "#ffd23f", "#ff4d6d", "#4dd6ff"].map((c) => (
        <mesh key={c} material={mat(c, { emissive: c, glow: 0.3 })}>
          <boxGeometry args={[0.1, 0.05, 0.02]} />
        </mesh>
      ))}
    </group>
  );
}

function Lamp() {
  return (
    <group>
      <Cyl rt={0.18} h={0.04} p={[0, 0.02, 0]} c="#222" />
      <mesh position={[0.35, 1.0, 0]} rotation-z={-0.35} material={mat("#c9a24a", { metal: 0.8, rough: 0.3 })}>
        <torusGeometry args={[0.9, 0.025, 6, 24, Math.PI * 0.75]} />
      </mesh>
      <mesh position={[0.95, 1.55, 0]} material={mat("#fff2c4", { emissive: "#ffd98a", glow: 1.6 })}>
        <sphereGeometry args={[0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <pointLight position={[0.95, 1.4, 0]} color="#ffd59a" intensity={1.6} distance={5} decay={1.6} />
    </group>
  );
}

function Palm({ s = 1 }: { s?: number }) {
  return (
    <group scale={s}>
      <Cyl rt={0.22} rb={0.17} h={0.4} p={[0, 0.2, 0]} c="#e9e4da" />
      <Cyl rt={0.03} h={0.9} p={[0, 0.85, 0]} c="#6b4a2b" />
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[0, 1.25, 0]} rotation={[0.9, (i / 7) * Math.PI * 2, 0]} material={mat("#2f8a3e")}>
          <coneGeometry args={[0.12, 0.8, 4]} />
        </mesh>
      ))}
    </group>
  );
}

function Chair({ ry = 0, x = 0, z = 0, c = "#e9dfcc" }: { ry?: number; x?: number; z?: number; c?: string }) {
  return (
    <group position={[x, 0, z]} rotation-y={ry}>
      <Box s={[0.46, 0.05, 0.46]} p={[0, 0.46, 0]} c={c} />
      <Box s={[0.46, 0.55, 0.05]} p={[0, 0.75, -0.21]} c={c} />
      {[-0.19, 0.19].flatMap((a) => [-0.19, 0.19].map((b) => <Cyl key={`${a}${b}`} rt={0.02} h={0.46} p={[a, 0.23, b]} c="#3a2a20" seg={6} />))}
    </group>
  );
}

const emojiTex = new Map<string, THREE.Texture>();
function emojiTexture(e: string) {
  let t = emojiTex.get(e);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.font = "100px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji'";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(e, 64, 72);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    emojiTex.set(e, t);
  }
  return t;
}
/** Small decor: a side table with the item on top as a picture. */
function SideTable({ emoji }: { emoji: string }) {
  const tex = useMemo(() => emojiTexture(emoji), [emoji]);
  return (
    <group>
      <Cyl rt={0.28} h={0.04} p={[0, 0.58, 0]} c="#7a5236" />
      <Cyl rt={0.04} h={0.56} p={[0, 0.28, 0]} c="#3a2a20" seg={8} />
      <Cyl rt={0.18} h={0.03} p={[0, 0.015, 0]} c="#3a2a20" />
      <sprite position={[0, 0.95, 0]} scale={[0.6, 0.6, 1]}>
        <spriteMaterial map={tex} transparent />
      </sprite>
    </group>
  );
}

export const ITEMS: Record<string, ItemDef> = {
  starter_table: {
    hw: 0.55,
    hd: 0.35,
    render: () => (
      <group>
        <Box s={[1.1, 0.06, 0.7]} p={[0, 0.42, 0]} c="#7a5236" />
        <Box s={[0.95, 0.04, 0.55]} p={[0, 0.12, 0]} c="#5b3f2c" />
        {[-0.48, 0.48].flatMap((x) => [-0.28, 0.28].map((z) => <Cyl key={`${x}${z}`} rt={0.025} h={0.42} p={[x, 0.21, z]} c="#3a2a20" seg={6} />))}
        <Cyl rt={0.1} rb={0.07} h={0.05} p={[0.25, 0.47, 0.05]} c="#e9e4da" />
      </group>
    ),
  },
  starter_sofa: { hw: 1.0, hd: 0.45, seats: [[-0.45, 0.1, 0], [0.45, 0.1, 0]], sitLabel: "🛋️ Sit together", render: () => <Sofa color="#7d6a8f" dark="#5d4d6e" w={2} l={false} /> },
  starter_bed: {
    hw: 0.85,
    hd: 1.05,
    seats: [[-0.4, 0.75, 0], [0.4, 0.75, 0]],
    sitLabel: "🛏️ Cuddle in bed",
    render: () => (
      <group>
        <Box s={[1.7, 0.35, 2.1]} p={[0, 0.18, 0]} c="#5b3f2c" />
        <Box s={[1.6, 0.18, 2.0]} p={[0, 0.43, 0]} c="#f2efe8" />
        <Box s={[1.62, 0.1, 1.2]} p={[0, 0.54, 0.4]} c="#c2476e" />
        <Box s={[1.7, 0.9, 0.08]} p={[0, 0.6, -1.05]} c="#5b3f2c" />
        <Box s={[0.6, 0.12, 0.35]} p={[-0.4, 0.58, -0.75]} c="#fff" />
        <Box s={[0.6, 0.12, 0.35]} p={[0.4, 0.58, -0.75]} c="#fff" />
      </group>
    ),
  },
  sofa_green: { hw: 1.8, hd: 1.1, seats: [[-0.75, 0.1, 0], [0, 0.1, 0], [0.75, 0.1, 0]], sitLabel: "🛋️ Sit together", render: () => <Sofa /> },
  rug_round: { hw: 0, hd: 0, render: () => <Rug /> },
  piano: {
    hw: 0.8,
    hd: 0.9,
    seats: [[0, 0.95, Math.PI]],
    sitLabel: "🎹 Play the piano",
    action: "piano",
    render: () => (
      <group>
        <mesh position={[0, 0.85, -0.1]} material={mat("#0b0b0e", { rough: 0.15, metal: 0.3 })} castShadow>
          <cylinderGeometry args={[0.75, 0.75, 0.32, 24, 1, false, Math.PI * 0.5, Math.PI]} />
        </mesh>
        <Box s={[1.5, 0.32, 0.4]} p={[0, 0.85, 0.3]} m={mat("#0b0b0e", { rough: 0.15, metal: 0.3 })} />
        <Box s={[1.3, 0.04, 0.16]} p={[0, 0.94, 0.55]} c="#f8f8f4" />
        {[-0.6, 0.6, 0].map((x, i) => (
          <Cyl key={i} rt={0.05} h={0.7} p={[x, 0.35, i === 2 ? -0.6 : 0.3]} c="#0b0b0e" seg={8} />
        ))}
        <Box s={[0.8, 0.08, 0.35]} p={[0, 0.48, 0.95]} c="#0b0b0e" />
        <Box s={[0.7, 0.44, 0.3]} p={[0, 0.22, 0.95]} c="#141418" />
      </group>
    ),
  },
  tv: { hw: 0.9, hd: 0.25, action: "tv", render: (on) => <Tv on={on} /> },
  bed_round: {
    hw: 1.3,
    hd: 1.3,
    seats: [[-0.45, 0.6, 0], [0.45, 0.6, 0]],
    sitLabel: "🛏️ Cuddle in bed",
    render: () => (
      <group>
        <Cyl rt={1.3} h={0.4} p={[0, 0.2, 0]} c="#e9e6df" seg={36} />
        <mesh position={[0, 0.42, 0.25]} rotation-x={-Math.PI / 2} material={mat(NAVY)}>
          <circleGeometry args={[1.18, 36, Math.PI, Math.PI]} />
        </mesh>
        <mesh position={[0, 0.7, 0]} rotation-x={Math.PI / 2} material={mat("#d8d2c6")}>
          <torusGeometry args={[1.3, 0.12, 8, 36, Math.PI]} />
        </mesh>
        <Box s={[0.55, 0.12, 0.3]} p={[-0.35, 0.47, -0.75]} c="#fff" />
        <Box s={[0.55, 0.12, 0.3]} p={[0.35, 0.47, -0.75]} c="#fff" />
      </group>
    ),
  },
  bed_kingsize: {
    hw: 1.3,
    hd: 1.25,
    seats: [[-0.5, 0.65, 0], [0.5, 0.65, 0]],
    sitLabel: "🛏️ Sleep in King Bed",
    render: () => (
      <group>
        {/* Dark oak wooden frame */}
        <Box s={[2.4, 0.42, 2.5]} p={[0, 0.21, 0]} c="#2e1f14" />
        {/* Headboard with tufted velvet */}
        <Box s={[2.4, 1.4, 0.2]} p={[0, 0.9, -1.2]} c="#1b2838" />
        <Box s={[2.2, 1.1, 0.08]} p={[0, 0.95, -1.08]} c="#243447" />
        {/* Plush white & gold duvet */}
        <Box s={[2.2, 0.26, 2.3]} p={[0, 0.52, 0.05]} c="#f8f9fa" />
        <Box s={[2.22, 0.12, 1.4]} p={[0, 0.62, 0.5]} c="#c59b27" />
        {/* Two King Pillows */}
        <Box s={[0.8, 0.16, 0.45]} p={[-0.55, 0.68, -0.8]} c="#ffffff" />
        <Box s={[0.8, 0.16, 0.45]} p={[0.55, 0.68, -0.8]} c="#ffffff" />
        {/* Nightstands with soft bedside lamps */}
        <Box s={[0.45, 0.55, 0.45]} p={[-1.5, 0.275, -1.1]} c="#2e1f14" />
        <Box s={[0.45, 0.55, 0.45]} p={[1.5, 0.275, -1.1]} c="#2e1f14" />
        <Cyl rt={0.12} rb={0.16} h={0.22} p={[-1.5, 0.68, -1.1]} m={mat("#ffdd99", { emissive: "#ffaa33", glow: 1.5 })} />
        <Cyl rt={0.12} rb={0.16} h={0.22} p={[1.5, 0.68, -1.1]} m={mat("#ffdd99", { emissive: "#ffaa33", glow: 1.5 })} />
      </group>
    ),
  },
  bed_vono: {
    hw: 0.95,
    hd: 1.15,
    seats: [[0, 0.6, 0]],
    sitLabel: "🛌 Rest on Vono Bed",
    render: () => (
      <group>
        {/* Classic Lagos steel tube bed frame */}
        <Box s={[1.7, 0.08, 2.2]} p={[0, 0.38, 0]} c="#1a4d2e" />
        <Box s={[1.7, 0.95, 0.06]} p={[0, 0.65, -1.08]} c="#1a4d2e" />
        <Box s={[1.7, 0.65, 0.06]} p={[0, 0.5, 1.08]} c="#1a4d2e" />
        {[-0.8, 0.8].flatMap((x) => [-1.05, 1.05].map((z) => (
          <Cyl key={`${x}${z}`} rt={0.03} h={0.4} p={[x, 0.2, z]} c="#1a4d2e" seg={6} />
        )))}
        {/* Floral Ankara patterned mattress */}
        <Box s={[1.55, 0.24, 2.05]} p={[0, 0.52, 0]} c="#d97736" />
        {/* Pillow */}
        <Box s={[0.85, 0.14, 0.4]} p={[0, 0.68, -0.75]} c="#fefefe" />
      </group>
    ),
  },
  couch_leather: {
    hw: 1.35,
    hd: 0.65,
    seats: [[-0.55, 0.1, 0], [0.55, 0.1, 0]],
    sitLabel: "🛋️ Chill on leather couch",
    render: () => (
      <group>
        <Box s={[2.4, 0.45, 1.0]} p={[0, 0.225, 0]} c="#3d2314" />
        <Box s={[2.1, 0.2, 0.8]} p={[0, 0.52, 0.05]} c="#5a331c" />
        <Box s={[2.4, 0.65, 0.25]} p={[0, 0.75, -0.38]} c="#3d2314" />
        <Box s={[0.22, 0.65, 1.0]} p={[-1.1, 0.45, 0]} c="#3d2314" />
        <Box s={[0.22, 0.65, 1.0]} p={[1.1, 0.45, 0]} c="#3d2314" />
      </group>
    ),
  },
  armchair: {
    hw: 0.5,
    hd: 0.5,
    seats: [[0, 0.05, 0]],
    sitLabel: "🪑 Sit",
    render: () => (
      <group>
        <Box s={[0.95, 0.4, 0.9]} p={[0, 0.2, 0]} c="#d9c27c" />
        <Box s={[0.95, 0.6, 0.2]} p={[0, 0.65, -0.35]} c="#d9c27c" />
        <Box s={[0.15, 0.3, 0.9]} p={[-0.4, 0.5, 0]} c="#cfb56a" />
        <Box s={[0.15, 0.3, 0.9]} p={[0.4, 0.5, 0]} c="#cfb56a" />
      </group>
    ),
  },
  bookshelf: {
    hw: 0.7,
    hd: 0.2,
    render: () => (
      <group>
        <Box s={[1.4, 2.0, 0.38]} p={[0, 1.0, 0]} c="#f1ece4" />
        {[0.35, 0.85, 1.35].map((y, r) =>
          Array.from({ length: 7 }, (_, i) => (
            <Box key={`${r}${i}`} s={[0.1, 0.36, 0.28]} p={[-0.5 + i * 0.165, y + 0.05, 0.03]} c={["#c0392b", "#2e86c1", "#f2b705", "#1f7a4c", "#8e44ad", "#e67e22", "#34495e"][(i + r * 3) % 7]} />
          )),
        )}
      </group>
    ),
  },
  aquarium: {
    hw: 0.65,
    hd: 0.3,
    render: () => (
      <group>
        <Box s={[1.3, 0.55, 0.55]} p={[0, 0.275, 0]} c="#2a2a2e" />
        <Box s={[1.25, 0.55, 0.5]} p={[0, 0.83, 0]} m={mat("#3aa0d8", { emissive: "#1d7fb8", glow: 0.35, opacity: 0.55 })} />
        <Fish />
      </group>
    ),
  },
  floor_lamp: { hw: 0.2, hd: 0.2, render: () => <Lamp /> },
  palm: { hw: 0.25, hd: 0.25, render: () => <Palm s={1.3} /> },
  dining: {
    hw: 0.95,
    hd: 0.55,
    seats: [[0, -0.8, 0], [0, 0.8, Math.PI]],
    sitLabel: "🍽️ Dinner for two",
    render: () => (
      <group>
        <Cyl rt={0.55} h={0.04} p={[0, 0.75, 0]} c="#fbf6ef" />
        <Cyl rt={0.06} h={0.73} p={[0, 0.37, 0]} c="#3a2a20" seg={8} />
        <Chair z={-0.8} />
        <Chair z={0.8} ry={Math.PI} />
        <Cyl rt={0.02} h={0.18} p={[0, 0.86, 0]} c="#fff" seg={6} />
        <mesh position={[0, 0.98, 0]} material={mat("#ffb44d", { emissive: "#ff9a2e", glow: 3 })}>
          <coneGeometry args={[0.025, 0.07, 6]} />
        </mesh>
      </group>
    ),
  },
  bathtub: {
    hw: 0.9,
    hd: 0.45,
    render: () => (
      <group>
        <Box s={[1.8, 0.55, 0.85]} p={[0, 0.275, 0]} c="#fbfbfb" />
        <Box s={[1.6, 0.04, 0.65]} p={[0, 0.5, 0]} m={mat("#a9dcf2", { opacity: 0.8, rough: 0.05 })} />
        {Array.from({ length: 10 }, (_, i) => (
          <mesh key={i} position={[-0.6 + (i % 5) * 0.3, 0.55, i < 5 ? -0.12 : 0.14]} material={mat("#ffffff", { rough: 0.3 })}>
            <sphereGeometry args={[0.09 + (i % 3) * 0.02, 8, 6]} />
          </mesh>
        ))}
      </group>
    ),
  },
  beanbag: {
    hw: 0.9,
    hd: 0.45,
    seats: [[-0.45, 0.05, 0], [0.45, 0.05, 0]],
    sitLabel: "🫘 Flop down together",
    render: () => (
      <group>
        {[-0.45, 0.45].map((x, i) => (
          <mesh key={x} position={[x, 0.25, 0]} scale={[1, 0.6, 1]} material={mat(i ? "#f2b705" : "#f4f1ea")} castShadow>
            <sphereGeometry args={[0.42, 16, 12]} />
          </mesh>
        ))}
      </group>
    ),
  },
  art: {
    hw: 0.4,
    hd: 0.2,
    render: () => (
      <group>
        <Box s={[0.9, 1.1, 0.06]} p={[0, 1.2, 0]} c={GOLD} />
        <Box s={[0.78, 0.98, 0.02]} p={[0, 1.2, 0.035]} c="#2a6f97" />
        <mesh position={[0.1, 1.3, 0.05]} material={mat("#f2b705")}>
          <circleGeometry args={[0.16, 20]} />
        </mesh>
        {[-0.3, 0.3].map((x) => (
          <Cyl key={x} rt={0.02} h={1.4} p={[x, 0.65, -0.15]} r={[-0.15, 0, 0]} c="#6b4a2b" seg={6} />
        ))}
      </group>
    ),
  },
  record: { hw: 0.3, hd: 0.3, action: "radio", render: () => <SideTable emoji="📻" /> },
};

/** Small decor from the original shop: shown on a little side table. */
export function itemDef(id: string, emoji?: string): ItemDef {
  return ITEMS[id] ?? { hw: 0.3, hd: 0.3, render: () => <SideTable emoji={emoji ?? "✨"} /> };
}

export { Palm, Chair, Box, Cyl };
