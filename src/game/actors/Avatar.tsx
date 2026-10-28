"use client";
import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

// Realistic humans: Microsoft Rocketbox avatars (MIT), converted by
// scripts/assets/convert-rocketbox.mjs. Textures are assigned by material name.
export type ModelId = "amara" | "kofi" | LocalId;
/** Lagos locals: extra Rocketbox avatars used for the people closest to you. */
export type LocalId = "emeka" | "musa" | "tunde" | "chidi" | "ngozi" | "bisi";
export type AnimId = "idle" | "walk" | "run" | "wave" | "clap" | "sit";

type ModelDef = { glb: string; prefix: "f" | "m"; mats: Record<string, string> };
// Material name in the GLB → texture key (`<key>_color.jpg` + `_normal.jpg`, or `<key>.png` for opacity).
function def(id: string, prefix: "f" | "m", code: string, parts: string[]): ModelDef {
  return { glb: `/assets/characters/${id}.glb`, prefix, mats: Object.fromEntries(parts.map((p) => [`${code}_${p}`, `${id}_${p}`])) };
}
const MODELS: Record<ModelId, ModelDef> = {
  amara: def("amara", "f", "f014", ["body", "head", "opacity"]),
  kofi: def("kofi", "m", "m007", ["body", "head"]),
  emeka: def("emeka", "m", "m023", ["body", "head"]),
  musa: def("musa", "m", "m102", ["body", "head", "helmet", "tools"]),
  tunde: def("tunde", "m", "m006", ["body", "head", "opacity"]),
  chidi: def("chidi", "m", "m300", ["body", "head", "opacity"]),
  ngozi: def("ngozi", "f", "f152", ["body", "head", "opacity"]),
  bisi: def("bisi", "f", "f011", ["body", "head", "opacity"]),
};
export const LOCAL_MEN: LocalId[] = ["emeka", "musa", "tunde", "chidi"];
export const LOCAL_WOMEN: LocalId[] = ["ngozi", "bisi"];
const ANIMS: AnimId[] = ["idle", "walk", "run", "wave", "clap", "sit"];
// Gestures loop; the player controller returns to idle after a few seconds.
const ONE_SHOT: AnimId[] = [];

const clipCache = new Map<string, Promise<THREE.AnimationClip>>();
function loadClip(name: string) {
  if (!clipCache.has(name)) {
    clipCache.set(
      name,
      fetch(`/assets/anims/${name}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`missing animation ${name}`);
          return r.json();
        })
        .then((j) => {
          const clip = THREE.AnimationClip.parse(j);
          clip.name = name;
          return clip;
        }),
    );
  }
  return clipCache.get(name)!;
}

export function preloadAvatar(model: ModelId) {
  useGLTF.preload(MODELS[model].glb);
  for (const a of ANIMS) loadClip(`${MODELS[model].prefix}_${a}`);
}

// Stable arrays per model: a new array each render would re-clone the character every frame.
const NAMES = Object.fromEntries(Object.entries(MODELS).map(([id, m]) => [id, Object.values(m.mats)])) as Record<ModelId, string[]>;
const URLS = Object.fromEntries(
  Object.entries(NAMES).map(([id, names]) => [id, names.flatMap((n) => (n.endsWith("opacity") ? [`/assets/characters/${n}.png`] : [`/assets/characters/${n}_color.jpg`, `/assets/characters/${n}_normal.jpg`]))]),
) as Record<ModelId, string[]>;

function useAvatarTextures(model: ModelId) {
  const names = NAMES[model];
  const urls = URLS[model];
  const textures = useTexture(urls);
  return useMemo(() => {
    const out: Record<string, { map: THREE.Texture; normal?: THREE.Texture }> = {};
    let k = 0;
    for (const n of names) {
      if (n.endsWith("opacity")) out[n] = { map: textures[k++] };
      else out[n] = { map: textures[k++], normal: textures[k++] };
    }
    for (const t of textures) {
      // The converter keeps three.js's own UV orientation (it doesn't re-encode
      // textures), so these external images use three's default flipY = true.
      t.anisotropy = 4;
    }
    for (const v of Object.values(out)) v.map.colorSpace = THREE.SRGBColorSpace;
    return out;
  }, [textures, names]);
}

// The FBX conversion splits each avatar into many sub-meshes, several sharing a
// material. Merge those once per loaded model (same parent, skeleton and bind
// pose) so each character costs ~3 draw calls instead of ~10.
const merged = new WeakSet<THREE.Object3D>();
function mergeSubmeshes(scene: THREE.Object3D) {
  if (merged.has(scene)) return;
  merged.add(scene);
  const groups = new Map<string, THREE.SkinnedMesh[]>();
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || Array.isArray(m.material) || !o.parent) return;
    const key = `${o.parent.uuid}|${m.skeleton.uuid}|${m.material.name}|${m.bindMatrix.elements.join(",")}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geo = mergeGeometries(list.map((m) => m.geometry));
    if (!geo) continue; // attribute sets differ: leave as is
    const [first, ...rest] = list;
    first.geometry = geo;
    for (const m of rest) m.removeFromParent();
  }
}

export function Avatar({ model, anim, speed = 1, castShadow = true, phase = 0 }: { model: ModelId; anim: AnimId; speed?: number; castShadow?: boolean; phase?: number }) {
  const { scene } = useGLTF(MODELS[model].glb);
  const tex = useAvatarTextures(model);
  const root = useMemo(() => {
    mergeSubmeshes(scene);
    const c = cloneSkinned(scene);
    c.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // skinned bounds are unreliable when animated
      const apply = (m: THREE.Material) => {
        const key = MODELS[model].mats[m.name];
        const t = key ? tex[key] : undefined;
        const mat = new THREE.MeshStandardMaterial({ name: m.name, roughness: 0.75, metalness: 0 });
        if (t) {
          mat.map = t.map;
          if (t.normal) mat.normalMap = t.normal;
          if (key.endsWith("opacity")) {
            // Hair, eyelashes: alpha-tested so they sort correctly.
            mat.alphaTest = 0.4;
            mat.side = THREE.DoubleSide;
            mat.roughness = 0.6;
          }
          if (key.endsWith("head")) mat.roughness = 0.6; // a little sheen on skin
        }
        return mat;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(apply) : apply(mesh.material);
    });
    return c;
  }, [scene, tex, model, castShadow]);

  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root]);
  const [actions, setActions] = useState<Partial<Record<AnimId, THREE.AnimationAction>>>({});
  const current = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    let alive = true;
    const prefix = MODELS[model].prefix;
    Promise.all(ANIMS.map((a) => loadClip(`${prefix}_${a}`).then((c) => [a, c] as const).catch(() => null))).then((list) => {
      if (!alive) return;
      const acts: Partial<Record<AnimId, THREE.AnimationAction>> = {};
      for (const item of list) {
        if (!item) continue;
        const [id, clip] = item;
        const action = mixer.clipAction(clip);
        if (ONE_SHOT.includes(id)) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = false;
        }
        acts[id] = action;
      }
      setActions(acts);
    });
    return () => {
      alive = false;
      mixer.stopAllAction();
    };
  }, [mixer, model]);

  // Cross-fade between movement states.
  useEffect(() => {
    const next = actions[anim] ?? actions.idle;
    if (!next || next === current.current) return;
    next.reset().setEffectiveWeight(1).fadeIn(0.25).play();
    if (phase) next.time = (phase % 1) * next.getClip().duration; // desync crowds
    current.current?.fadeOut(0.25);
    current.current = next;
  }, [anim, actions, phase]);

  useFrame((_, dt) => {
    if (current.current) current.current.timeScale = anim === "walk" || anim === "run" ? speed : 1;
    mixer.update(Math.min(dt, 0.1));
  });

  return <primitive object={root} scale={0.01} />;
}
