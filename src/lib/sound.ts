"use client";
// Tiny synthesized sound effects (no audio files to download). Respect the mute preference.
let ctx: AudioContext | null = null;
let enabled = true;
let ringTimer: ReturnType<typeof setInterval> | null = null;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (!on) stopRing();
}

export const isSoundEnabled = () => enabled;

function audio() {
  if (typeof window === "undefined") return null;
  ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, start: number, dur: number, gain = 0.06, type: OscillatorType = "sine") {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

export const sfx = {
  pop() {
    if (enabled) tone(660, 0, 0.12, 0.05);
  },
  sent() {
    if (enabled) tone(880, 0, 0.08, 0.03);
  },
  chime() {
    if (!enabled) return;
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.4, 0.04, "triangle"));
  },
  reward() {
    if (!enabled) return;
    [784, 988, 1175].forEach((f, i) => tone(f, i * 0.07, 0.3, 0.05, "triangle"));
  },
  /** Two short beeps; small vehicles (okada/keke) have a higher, thinner horn. */
  horn(small = false) {
    if (!enabled) return;
    const f = small ? 620 : 410;
    tone(f, 0, 0.18, 0.035, "square");
    tone(f * 1.26, 0, 0.18, 0.02, "square");
    tone(f, 0.24, 0.32, 0.035, "square");
    tone(f * 1.26, 0.24, 0.32, 0.02, "square");
  },
  /** Boom and crackle of a firework; vol 0..1 for distance. */
  firework(vol = 1) {
    if (!enabled) return;
    tone(70, 0, 0.45, 0.07 * vol, "sine");
    tone(110, 0, 0.25, 0.04 * vol, "triangle");
    for (let i = 0; i < 9; i++) tone(2600 + Math.random() * 2600, 0.25 + Math.random() * 0.9, 0.03, 0.012 * vol, "square");
  },
  /** A few bars of a gentle love-song melody. */
  piano() {
    if (!enabled) return;
    const notes = [72, 76, 79, 76, 74, 72, 71, 72, 76, 74, 72, 67];
    notes.forEach((n, i) => {
      tone(440 * 2 ** ((n - 69) / 12), i * 0.32, 0.9, 0.04, "triangle");
      if (i % 3 === 0) tone(440 * 2 ** ((n - 81) / 12), i * 0.32, 1.2, 0.03, "sine");
    });
  },
  romance() {
    if (!enabled) return;
    // Sweet rising melody
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.5, 0.035, "triangle"));
    tone(1047, 0.5, 0.7, 0.02, "sine");
  },
};

// Gentle looping arpeggios for date spots. Chords are MIDI note lists.
const PROGRESSIONS = {
  sunset: { bar: 2.4, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]] },
  dinner: { bar: 2.8, chords: [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 61, 64, 67]] },
  bonfire: { bar: 3.2, chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]] },
} as const;
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
let musicTimer: ReturnType<typeof setInterval> | null = null;

export const dateMusic = {
  start(kind: keyof typeof PROGRESSIONS) {
    this.stop();
    if (!enabled) return;
    const p = PROGRESSIONS[kind];
    let i = 0;
    const bar = () => {
      if (!enabled) return dateMusic.stop();
      const chord = p.chords[i++ % p.chords.length];
      tone(midi(chord[0] - 12), 0, p.bar, 0.025, "sine");
      const step = p.bar / 8;
      for (let k = 0; k < 8; k++) tone(midi(chord[[0, 1, 2, 3, 2, 1, 2, 3][k] % chord.length] + 12), k * step, step * 2.2, 0.018, "triangle");
    };
    bar();
    musicTimer = setInterval(bar, p.bar * 1000);
  },
  stop() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
  },
};

export function startRing() {
  if (!enabled || ringTimer) return;
  const ring = () => {
    tone(740, 0, 0.35, 0.05);
    tone(587, 0.4, 0.5, 0.05);
  };
  ring();
  ringTimer = setInterval(ring, 2200);
}

export function stopRing() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
}
