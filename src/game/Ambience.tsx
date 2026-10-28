"use client";
import { useEffect } from "react";
import { isSoundEnabled } from "@/lib/sound";
import { live } from "./shared";
import { hud } from "./store";
import { weather } from "./weather";
import { gameHour } from "./world/Atmosphere";
import { SITES, coastZ, districtAt, roadClearance } from "./world/layout";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
// F – Dm – B♭ – C, voiced low and soft.
type Graph = { master: GainNode; waves: GainNode; market: GainNode; traffic: GainNode; rain: GainNode; wind: GainNode; love: GainNode; loveFilter: BiquadFilterNode; loveOsc: OscillatorNode[] };
const LOVE_CHORDS = [[53, 57, 60, 64], [50, 53, 57, 62], [46, 50, 53, 57], [48, 52, 55, 60]];

/**
 * Synthesised soundscape for the city (no audio files): waves near the sea, market chatter,
 * traffic rumble by the roads, birds in green areas, rain and Harmattan wind — plus a love
 * theme that swells and warms up the closer you are to your partner.
 */
export function Ambience() {
  useEffect(() => {
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let graph: Graph | null = null;

    const start = () => {
      if (ctx) return;
      try {
        ctx = new AudioContext();
      } catch {
        return;
      }
      const a = ctx;
      const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const master = a.createGain();
      master.gain.value = 0;
      master.connect(a.destination);
      const layer = (type: BiquadFilterType, freq: number, q = 0.7) => {
        const src = a.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = 0.8 + Math.random() * 0.4;
        const f = a.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = a.createGain();
        g.gain.value = 0;
        src.connect(f).connect(g).connect(master);
        src.start();
        return g;
      };
      const loveFilter = a.createBiquadFilter();
      loveFilter.type = "lowpass";
      loveFilter.frequency.value = 400;
      const love = a.createGain();
      love.gain.value = 0;
      loveFilter.connect(love).connect(master);
      const loveOsc = LOVE_CHORDS[0].map((n, i) => {
        const o = a.createOscillator();
        o.type = i % 2 ? "triangle" : "sine";
        o.frequency.value = midi(n);
        o.detune.value = (i - 1.5) * 4;
        o.connect(loveFilter);
        o.start();
        return o;
      });
      graph = {
        master,
        waves: layer("lowpass", 520),
        market: layer("bandpass", 950, 0.9),
        traffic: layer("lowpass", 150),
        rain: layer("highpass", 1600),
        wind: layer("bandpass", 380, 0.4),
        love,
        loveFilter,
        loveOsc,
      };
      timer = setInterval(update, 250);
    };

    let chord = 0, lastChord = 0, lastChirp = 0, lastVoice = 0;
    const chirp = (a: AudioContext, out: AudioNode, vol: number) => {
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
      const f = 2600 + Math.random() * 1600;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.08);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.16);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.025 * vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.25);
    };
    // A murmur of voices: short, wobbling low tones layered over the market noise.
    const voice = (a: AudioContext, out: AudioNode, vol: number) => {
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime, d = 0.15 + Math.random() * 0.35;
      o.type = "triangle";
      const f = 140 + Math.random() * 180;
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * (0.85 + Math.random() * 0.3), t + d);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.012 * vol, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + d + 0.05);
    };

    const update = () => {
      const n = graph;
      if (!ctx || !n) return;
      const a = ctx, t = a.currentTime, set = (g: AudioParam, v: number, tc = 0.6) => g.setTargetAtTime(v, t, tc);
      const on = isSoundEnabled() && document.visibilityState === "visible";
      set(n.master.gain, on ? 1 : 0, 0.3);
      if (!on) return;
      const p = live.me.pos;
      const inside = live.me.mode === "car" || live.me.mode === "jet" || live.me.mode === "train" || live.me.mode === "bus" || live.me.mode === "passenger";
      const muffle = inside ? 0.35 : 1;
      const hour = gameHour(hud.get().hourOverride);
      const day = hour > 6.2 && hour < 18.6;

      const toSea = coastZ(p.x) - p.z;
      const waves = clamp01(1 - toSea / 220) * (0.75 + 0.25 * Math.sin(t * 0.45)) * (1 + 0.6 * weather.rain);
      set(n.waves.gain, 0.09 * waves * muffle);

      const market = Math.max(clamp01(1 - Math.hypot(p.x - SITES.balogun.x, p.z - SITES.balogun.z) / 140), clamp01(1 - Math.hypot(p.x - SITES.yabaMarket.x, p.z - SITES.yabaMarket.z) / 120));
      set(n.market.gain, 0.03 * market * (0.7 + 0.3 * Math.random()) * muffle * (day ? 1 : 0.35), 0.15);
      if (market > 0.15 && day && t - lastVoice > 0.12) {
        lastVoice = t;
        voice(a, n.master, market * muffle);
      }

      const road = clamp01(1 - roadClearance(p.x, p.z) / 45);
      set(n.traffic.gain, 0.05 * road * (day ? 1 : 0.5) * (inside ? 0.6 : 1));

      set(n.rain.gain, 0.06 * weather.rain * muffle, 1);
      set(n.wind.gain, 0.05 * weather.haze * muffle * (0.8 + 0.2 * Math.sin(t * 0.3)), 1);

      const green = ["hills", "island", "estate", "outskirts"].includes(districtAt(p.x, p.z).id) || toSea < 260;
      if (green && day && weather.rain < 0.3 && !inside && t - lastChirp > 1.2 + Math.random() * 4) {
        lastChirp = t;
        chirp(a, n.master, 1);
        if (Math.random() < 0.6) setTimeout(() => ctx && graph && chirp(ctx, graph.master, 0.8), 180);
      }

      // Love theme: louder and brighter as you get closer; makes way for date-spot music.
      const pt = live.partner;
      const here = pt && Date.now() - pt.seen < 6000;
      const d = here ? pt.shown.distanceTo(p) : Infinity;
      const close = clamp01(1 - d / 220) ** 1.6 * (hud.get().date ? 0 : 1);
      set(n.love.gain, 0.05 * close, 1.5);
      set(n.loveFilter.frequency, 300 + 2600 * close, 1.5);
      if (close > 0 && t - lastChord > 4) {
        lastChord = t;
        chord = (chord + 1) % LOVE_CHORDS.length;
        n.loveOsc.forEach((o, i) => o.frequency.setTargetAtTime(midi(LOVE_CHORDS[chord][i] + (close > 0.85 ? 12 : 0)), t, 0.4));
      }
    };

    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      if (timer) clearInterval(timer);
      ctx?.close().catch(() => {});
    };
  }, []);
  return null;
}
