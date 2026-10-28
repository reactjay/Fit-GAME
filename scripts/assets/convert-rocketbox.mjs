// Converts Microsoft Rocketbox (MIT) FBX avatars/animations into game-ready files.
//
//   node scripts/assets/convert-rocketbox.mjs avatar <in.fbx> <out.glb>
//   node scripts/assets/convert-rocketbox.mjs anim   <in.fbx> <out.json> [--in-place] [--max=6] [--fps=15]
//
// Avatars: geometry + skeleton only (materials keep their names; textures are
// shrunk separately with `sips` and assigned at runtime — see src/game/assets.ts).
// Animations: three.js AnimationClip JSON, trimmed to rotation tracks + root
// motion, rounded, and (with --in-place) root XZ pinned so the clip loops in place.
import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// Node has no image decoding: FBX texture references become empty textures.
THREE.TextureLoader.prototype.load = () => new THREE.Texture();
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
      this.onload?.({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type};base64,${Buffer.from(b).toString("base64")}`;
      this.onloadend?.();
      this.onload?.({ target: this });
    });
  }
};

const [mode, input, output, ...flags] = process.argv.slice(2);
const flag = flags.includes("--in-place") ? "--in-place" : "";
const opt = (k, d) => Number(flags.find((f) => f.startsWith(`--${k}=`))?.split("=")[1] ?? d);
const maxSeconds = opt("max", Infinity);
const fps = opt("fps", 30);
const buf = readFileSync(input);
const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");

if (mode === "avatar") {
  root.animations = [];
  const extras = [];
  root.traverse((o) => (o.isLight || o.isCamera) && extras.push(o));
  extras.forEach((o) => o.removeFromParent());
  const materials = new Set();
  root.traverse((o) => {
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const clean = mats.map((m) => {
        materials.add(m.name);
        return new THREE.MeshStandardMaterial({ name: m.name, color: 0xffffff, roughness: 0.8 });
      });
      o.material = Array.isArray(o.material) ? clean : clean[0];
    }
  });
  const box = new THREE.Box3().setFromObject(root);
  const glb = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
  writeFileSync(output, Buffer.from(glb));
  console.log(JSON.stringify({ output, bytes: glb.byteLength, materials: [...materials], height: +(box.max.y - box.min.y).toFixed(2) }));
} else if (mode === "anim") {
  const clip = root.animations[0];
  if (!clip) throw new Error("no animation in " + input);
  const rootBone = clip.tracks.find((t) => t.name.endsWith(".position"))?.name.split(".")[0];
  clip.tracks = clip.tracks.filter((t) => t.name.endsWith(".quaternion") || (t.name.endsWith(".position") && t.name.startsWith(rootBone + ".")));
  for (const t of clip.tracks) {
    if (flag === "--in-place" && t.name.endsWith(".position")) {
      const [x0, , z0] = t.values;
      for (let i = 0; i < t.values.length; i += 3) {
        t.values[i] = x0;
        t.values[i + 2] = z0;
      }
    }
    // Trim long clips and drop keyframes down to the target frame rate.
    const size = t.getValueSize();
    const keepT = [];
    const keepV = [];
    let next = 0;
    for (let i = 0; i < t.times.length; i++) {
      const time = t.times[i];
      if (time > maxSeconds) break;
      if (time + 1e-6 < next && i !== t.times.length - 1) continue;
      next = time + 1 / fps;
      keepT.push(Math.round(time * 1e3) / 1e3);
      for (let k = 0; k < size; k++) keepV.push(Math.round(t.values[i * size + k] * 1e4) / 1e4);
    }
    t.times = Float32Array.from(keepT);
    t.values = Float32Array.from(keepV);
  }
  clip.resetDuration();
  clip.optimize();
  const json = THREE.AnimationClip.toJSON(clip);
  writeFileSync(output, JSON.stringify(json));
  console.log(JSON.stringify({ output, tracks: clip.tracks.length, duration: +clip.duration.toFixed(2), root: rootBone, bytes: JSON.stringify(json).length }));
} else {
  console.error("usage: avatar|anim <in> <out>");
  process.exit(1);
}
