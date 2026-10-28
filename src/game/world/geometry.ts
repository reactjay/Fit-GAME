import * as THREE from "three";

/**
 * Sweeps a 2D profile (x = right, y = up) along a 3D path, keeping the profile
 * upright (no banking). Used for rails, ballast, tunnels and decks.
 */
export function sweep(path: THREE.Vector3[], profile: [number, number][], opts: { closed?: boolean; uvScale?: number; capEnds?: boolean } = {}) {
  const { closed = false, uvScale = 1 } = opts;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const n = path.length;
  let along = 0;
  for (let i = 0; i < n; i++) {
    const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(t, up).normalize();
    if (i > 0) along += path[i].distanceTo(path[i - 1]);
    let across = 0;
    profile.forEach(([px, py], k) => {
      const p = path[i].clone().addScaledVector(right, px).addScaledVector(up, py);
      pos.push(p.x, p.y, p.z);
      if (k > 0) across += Math.hypot(px - profile[k - 1][0], py - profile[k - 1][1]);
      uv.push(across / uvScale, along / uvScale);
    });
  }
  const m = profile.length;
  const rings = closed ? n : n - 1;
  for (let i = 0; i < rings; i++) {
    const i2 = (i + 1) % n;
    for (let k = 0; k < m - 1; k++) {
      const a = i * m + k, b = i * m + k + 1, c = i2 * m + k, d = i2 * m + k + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Canvas texture with centred text, for station and road signs. */
export function textTexture(text: string, opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string } = {}) {
  const { bg = "#0b5e3b", fg = "#ffffff", w = 1024, h = 160, font = "bold 84px system-ui, sans-serif" } = opts;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
