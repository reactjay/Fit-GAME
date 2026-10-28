"use client";
import { BUILDINGS, HALF, RAIL, ROADS, WATER, groundType, terrainHeight } from "../world/layout";

// One pre-rendered top-down map of Lagos, shared by the minimap and world map.
export const MAP_PX = 800; // 1 px = 5 m
const S = MAP_PX / (HALF * 2);
export const toMap = (x: number, z: number) => [(x + HALF) * S, (z + HALF) * S] as const;

let cached: HTMLCanvasElement | null = null;
export function mapImage() {
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = c.height = MAP_PX;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(MAP_PX, MAP_PX);
  for (let py = 0; py < MAP_PX; py++)
    for (let px = 0; px < MAP_PX; px++) {
      const x = px / S - HALF, z = py / S - HALF;
      const h = terrainHeight(x, z);
      let r: number, g: number, b: number;
      if (h < WATER - 0.2) {
        const d = Math.min(1, -h / 20);
        [r, g, b] = [40 - d * 20, 110 - d * 40, 150 - d * 30];
      } else {
        const t = groundType(x, z);
        const shade = 0.85 + Math.min(0.3, h / 300);
        [r, g, b] = t === "sand" ? [222, 205, 160] : t === "rock" ? [140, 132, 120] : t === "paved" ? [150, 150, 155] : [96 * shade, 136 * shade, 82 * shade];
      }
      const i = (py * MAP_PX + px) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = "rgba(70,62,80,0.55)";
  for (const b of BUILDINGS) {
    const [x, y] = toMap(b.x - b.w / 2, b.z - b.d / 2);
    ctx.fillRect(x, y, Math.max(1, b.w * S), Math.max(1, b.d * S));
  }
  ctx.lineCap = "round";
  for (const r of ROADS) {
    ctx.strokeStyle = r.kind === "highway" ? "#f3d27a" : r.kind === "runway" || r.kind === "taxiway" ? "#d8d8d8" : "#f5f1ea";
    ctx.lineWidth = Math.max(1.2, r.width * S * (r.kind === "highway" ? 1.4 : 1.1));
    ctx.beginPath();
    r.points.forEach(([x, z], i) => {
      const [mx, my] = toMap(x, z);
      if (i) ctx.lineTo(mx, my);
      else ctx.moveTo(mx, my);
    });
    ctx.stroke();
  }
  ctx.strokeStyle = "#5b2a86";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  RAIL.pts.forEach(([x, z], i) => {
    const [mx, my] = toMap(x, z);
    if (i) ctx.lineTo(mx, my);
    else ctx.moveTo(mx, my);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  cached = c;
  return c;
}
