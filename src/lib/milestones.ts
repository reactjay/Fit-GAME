import { daysTogether, daysUntil } from "@/lib/utils";

export type Milestone = { label: string; emoji: string; days: number };

/** Today's relationship milestone, if any: anniversaries, 50 days, and every 100 days. */
export function milestoneToday(start: string | null): Milestone | null {
  const days = daysTogether(start);
  if (!start || !days) return null;
  const years = new Date().getFullYear() - Number(start.slice(0, 4));
  if (years >= 1 && daysUntil(start, true) === 0) return { label: `${years} ${years === 1 ? "year" : "years"} together`, emoji: "💍", days };
  if (days % 100 === 0) return { label: `${days.toLocaleString()} days together`, emoji: "🎉", days };
  if (days === 50) return { label: "50 days together", emoji: "🌸", days };
  return null;
}

/** The next milestone coming up (for a countdown). */
export function nextMilestone(start: string | null): Milestone & { in: number } | null {
  const days = daysTogether(start);
  if (!start || days === null) return null;
  const next100 = days < 50 ? 50 : Math.ceil((days + 1) / 100) * 100;
  const toAnniv = daysUntil(start, true) || 365;
  const years = new Date().getFullYear() - Number(start.slice(0, 4)) + (daysUntil(start, true) === 0 ? 1 : 0);
  if (toAnniv < next100 - days && years >= 1) return { label: `${years} ${years === 1 ? "year" : "years"} together`, emoji: "💍", days: days + toAnniv, in: toAnniv };
  return { label: `${next100} days together`, emoji: "🎉", days: next100, in: next100 - days };
}
