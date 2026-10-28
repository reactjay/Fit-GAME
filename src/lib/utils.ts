export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Local calendar date as YYYY-MM-DD (not UTC), used for daily content. */
export function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Stable small hash so both partners derive the same daily pick from the same inputs. */
export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickDaily<T>(items: readonly T[], seed: string): T {
  return items[hashString(seed) % items.length];
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Days from today until the next occurrence of a date (yearly) — 0 means today. */
export function daysUntil(dateStr: string, yearly: boolean) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-").map(Number);
  let next = new Date(yearly ? today.getFullYear() : y, m - 1, d);
  if (yearly && next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

export function daysTogether(start: string | null) {
  if (!start) return null;
  const [y, m, d] = start.split("-").map(Number);
  const s = new Date(y, m - 1, d);
  return Math.max(0, Math.floor((Date.now() - s.getTime()) / 86400000));
}

export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again.") {
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string") {
    const msg = e.message;
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return "You seem to be offline. Check your connection and try again.";
    return msg.length < 140 ? msg : fallback;
  }
  return fallback;
}

export function uuid() {
  return crypto.randomUUID();
}
