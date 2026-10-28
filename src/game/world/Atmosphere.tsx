"use client";
import { Environment, Sky, Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { live, worldSeconds } from "../shared";
import { hud, toastHud } from "../store";
import { scheduledWeather, weather, type WeatherKind } from "../weather";

/** Shared shader uniforms (night glow for windows/lamps, wind for vegetation). */
export const worldUniforms = { uNight: { value: 0 }, uTime: { value: 0 } };

export const DAY_MINUTES = 24; // one in-game day = 24 real minutes
export function gameHour(override: number | null) {
  if (override !== null) return override;
  return ((worldSeconds() / 60) * (24 / DAY_MINUTES)) % 24;
}

const fogDay = new THREE.Color(0xbcd3e3);
const fogDusk = new THREE.Color(0xe7a77a);
const fogNight = new THREE.Color(0x0b1224);
const fogHaze = new THREE.Color(0xd8b98a);
const fogRain = new THREE.Color(0x7c8691);
const WEATHER_TOAST: Record<WeatherKind, string> = {
  clear: "☀️ The sky clears up",
  rain: "🌧️ It's starting to rain — stand close together to share an umbrella",
  harmattan: "🌫️ The Harmattan haze rolls in — dusty, golden and cosy",
};

export function Atmosphere({ shadows, shadowSize, fog, hourOverride }: { shadows: boolean; shadowSize: number; fog: readonly [number, number]; hourOverride: number | null }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const { scene } = useThree();
  const [sunPos, setSunPos] = useState<[number, number, number]>([100, 60, 40]);
  const [envIntensity, setEnvIntensity] = useState(1);
  const [night, setNight] = useState(false);
  const target = useMemo(() => new THREE.Object3D(), []);
  const lastSky = useRef(0);
  const [sky, setSky] = useState({ turbidity: 6, rayleigh: 1.4, mie: 0.006 });
  const lastKind = useRef<WeatherKind | null>(null);

  useMemo(() => {
    scene.fog = new THREE.Fog(fogDay, fog[0], fog[1]);
  }, [scene, fog]);

  useFrame((state, dt) => {
    worldUniforms.uTime.value += dt;
    const hour = gameHour(hourOverride);
    // Sun travels east → south → west (the sea is south), sunrise 6:00, sunset 18:00.
    const a = ((hour - 6) / 12) * Math.PI;
    const elev = Math.sin(a);
    const dir = new THREE.Vector3(Math.cos(a), Math.max(elev, -0.3), 0.45).normalize();
    const day = THREE.MathUtils.smoothstep(elev, -0.08, 0.25);
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * (elev > -0.15 ? 1 : 0);
    worldUniforms.uNight.value = 1 - THREE.MathUtils.smoothstep(elev, -0.12, 0.12);

    // Weather eases in over ~15 s (instantly-ish when you pick it in Settings).
    const forced = hud.get().weatherOverride;
    const kind = forced ?? scheduledWeather(worldSeconds());
    if (kind !== lastKind.current) {
      if (lastKind.current !== null) toastHud(WEATHER_TOAST[kind], 4000);
      lastKind.current = kind;
      weather.kind = kind;
    }
    const ease = Math.min(1, dt * (forced ? 1.5 : 0.07));
    weather.rain += ((kind === "rain" ? 1 : 0) - weather.rain) * ease;
    weather.haze += ((kind === "harmattan" ? 1 : 0) - weather.haze) * ease;
    const gloom = Math.max(weather.rain, weather.haze);

    const p = live.me.pos;
    if (sun.current) {
      sun.current.position.set(p.x + dir.x * 300, p.y + Math.max(dir.y, 0.05) * 300, p.z + dir.z * 300);
      target.position.copy(p);
      target.updateMatrixWorld();
      sun.current.intensity = (3.2 * day + 0.25 * (1 - day)) * (1 - 0.65 * weather.rain - 0.4 * weather.haze);
      sun.current.color.setHSL(0.1, 0.6 * dusk + 0.05, 0.5 + 0.45 * day * (1 - dusk * 0.3));
    }
    if (hemi.current) hemi.current.intensity = 0.25 + 0.9 * day;
    const f = scene.fog as THREE.Fog;
    f.color.copy(fogNight).lerp(fogDusk, Math.min(1, day * 1.5) * Math.max(dusk, 0.0)).lerp(fogDay, day * (1 - dusk * 0.8));
    f.color.lerp(fogHaze, weather.haze * 0.85 * Math.max(day, 0.25)).lerp(fogRain, weather.rain * 0.8 * Math.max(day, 0.3));
    f.near = fog[0] * (1 - 0.8 * gloom);
    f.far = fog[1] * (1 - 0.72 * weather.haze - 0.55 * weather.rain);
    state.gl.setClearColor(f.color);
    // React state only changes a few times a minute (sky shader/env re-render is cheap but not free).
    if (state.clock.elapsedTime - lastSky.current > 2) {
      lastSky.current = state.clock.elapsedTime;
      setSunPos([dir.x * 1000, dir.y * 1000, dir.z * 1000]);
      setEnvIntensity(0.12 + 0.9 * day);
      setNight(day < 0.2);
      setSky({ turbidity: 6 + 14 * gloom, rayleigh: (night ? 0.2 : 1.4) * (1 - 0.6 * weather.rain) + 1.5 * weather.haze, mie: 0.006 + 0.04 * weather.haze + 0.02 * weather.rain });
      const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
      hud.set({ clock: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` });
    }
  });

  return (
    <>
      <Sky sunPosition={sunPos} turbidity={sky.turbidity} rayleigh={sky.rayleigh} mieCoefficient={sky.mie} mieDirectionalG={0.86} distance={4500} />
      {night && <Stars radius={2500} depth={300} count={2500} factor={6} fade speed={0.3} />}
      <Environment files="/assets/env/qwantani_noon_1k.hdr" environmentIntensity={envIntensity} />
      <hemisphereLight ref={hemi} args={[0xcfe3ff, 0x5b4a33, 0.9]} />
      <primitive object={target} />
      <directionalLight
        ref={sun}
        target={target}
        castShadow={shadows}
        shadow-mapSize={[shadowSize || 1, shadowSize || 1]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={10}
        shadow-camera-far={700}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </>
  );
}
