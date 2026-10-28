// Shared weather: both devices derive it from the synced world clock, so you see the same sky.
export type WeatherKind = "clear" | "rain" | "harmattan";

/** Eased live values (0..1) read by the sky, rain, sound and umbrella every frame. */
export const weather = { rain: 0, haze: 0, kind: "clear" as WeatherKind };

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Weather changes every 15 minutes. Harmattan haze is common from November to February. */
export function scheduledWeather(seconds: number, date = new Date()): WeatherKind {
  const r = hash(Math.floor(seconds / 900));
  const m = date.getMonth();
  const harmattanSeason = m >= 10 || m <= 1;
  if (r < 0.16) return "rain";
  if (harmattanSeason ? r < 0.6 : r > 0.96) return "harmattan";
  return "clear";
}
