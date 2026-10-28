"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { db } from "@/lib/db/client";
import { sfx } from "@/lib/sound";
import { useWorld } from "@/lib/world-context";
import { live } from "./shared";
import { hud, toastHud } from "./store";
import { terrainHeight, WATER } from "./world/layout";

export type LoveNote = { id: string; author_id: string; x: number; z: number; place: string | null; body: string; found_at: string | null; created_at: string };

/** Notes still waiting to be found (yours and your partner's). Read by the 3D markers. */
export const notes = { list: [] as LoveNote[], version: 0 };

const FIND_RADIUS = 3;

/** Loads hidden notes, keeps them live, and opens one when you walk up to it. */
export function LoveNotesNet() {
  const { world, me, partner, onChange } = useWorld();
  useEffect(() => {
    const api = db();
    let alive = true;
    const hinted = new Set<string>();
    const set = (list: LoveNote[]) => {
      notes.list = list.filter((n) => !n.found_at);
      notes.version++;
    };
    api
      .from("love_notes")
      .select("*")
      .eq("world_id", world.id)
      .is("found_at", null)
      .then(({ data }) => {
        if (!alive) return;
        set((data ?? []) as LoveNote[]);
        const theirs = notes.list.filter((n) => n.author_id !== me.id).length;
        if (theirs) setTimeout(() => toastHud(`💌 ${partner?.display_name ?? "Your partner"} hid ${theirs === 1 ? "a love note" : `${theirs} love notes`} somewhere in Lagos…`, 5000), 4000);
      });
    const off = onChange("love_notes", (p) => {
      const row = p.new as LoveNote;
      if (p.eventType === "DELETE") return set(notes.list.filter((n) => n.id !== (p.old as LoveNote).id));
      if (row.found_at) {
        if (row.author_id === me.id) toastHud(`💌 ${partner?.display_name ?? "Your partner"} found your note${row.place ? ` at ${row.place}` : ""}!`, 4500);
        return set(notes.list.filter((n) => n.id !== row.id));
      }
      set([...notes.list.filter((n) => n.id !== row.id), row]);
    });
    const timer = setInterval(() => {
      if (live.me.mode !== "walk") return;
      for (const n of notes.list) {
        if (n.author_id === me.id) continue;
        const d = Math.hypot(n.x - live.me.pos.x, n.z - live.me.pos.z);
        if (d < FIND_RADIUS && !hud.get().foundNote) {
          hud.set({ foundNote: { id: n.id, body: n.body, place: n.place } });
          sfx.chime();
          set(notes.list.filter((x) => x.id !== n.id));
          api.rpc("find_note", { p_note: n.id });
          break;
        }
        if (d < 60 && !hinted.has(n.id)) {
          hinted.add(n.id);
          toastHud("💌 You feel a love note nearby… look for the glow");
        }
      }
    }, 400);
    return () => {
      alive = false;
      off();
      clearInterval(timer);
    };
  }, [world.id, me.id, partner?.display_name, onChange]);
  return null;
}

/** Hides a note where you're standing. */
export async function hideNote(worldId: string, userId: string, body: string, place: string) {
  const { data, error } = await db()
    .from("love_notes")
    .insert({ world_id: worldId, author_id: userId, x: Math.round(live.me.pos.x * 10) / 10, z: Math.round(live.me.pos.z * 10) / 10, place, body: body.trim().slice(0, 280) })
    .select("*")
    .single();
  if (error) throw error;
  notes.list = [...notes.list, data as LoveNote];
  notes.version++;
}

function envelopeTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, "rgba(255,180,210,0.9)");
  grad.addColorStop(1, "rgba(255,120,170,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.font = "64px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji'";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("💌", 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MAX = 24;
/** Glowing, bobbing envelopes in the world (yours are fainter — they're waiting for your partner). */
export function NoteMarkers({ meId }: { meId: string }) {
  const tex = useMemo(() => envelopeTexture(), []);
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < MAX; i++) {
      const s = refs.current[i];
      if (!s) continue;
      const n = notes.list[i];
      const d = n ? Math.hypot(n.x - live.me.pos.x, n.z - live.me.pos.z) : Infinity;
      s.visible = Boolean(n) && d < 140;
      if (!s.visible || !n) continue;
      const y = Math.max(terrainHeight(n.x, n.z), WATER) + 1.3 + Math.sin(t * 2 + i) * 0.15;
      s.position.set(n.x, y, n.z);
      const mine = n.author_id === meId;
      (s.material as THREE.SpriteMaterial).opacity = mine ? 0.45 : 0.95;
      s.scale.setScalar((mine ? 0.8 : 1.1) * (1 + 0.08 * Math.sin(t * 4 + i)));
    }
  });
  return (
    <group>
      {Array.from({ length: MAX }, (_, i) => (
        <sprite key={i} ref={(s) => void (refs.current[i] = s)} visible={false}>
          <spriteMaterial map={tex} transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}
