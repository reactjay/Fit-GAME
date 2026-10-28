"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconBack, IconPlus, IconTrash } from "@/components/ui/icons";
import { Button, EmptyState, ErrorNote, Field, IconButton, PageHeader, Sheet, inputClass } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { db } from "@/lib/db/client";
import type { CalendarEvent } from "@/lib/types";
import { cn, daysUntil, errorMessage, localDay } from "@/lib/utils";
import { useActivity, useWorld } from "@/lib/world-context";

const EMOJIS = ["💜", "🎂", "💍", "✈️", "🍽️", "🎉", "🌹", "🎬", "🏖️", "⭐"];
type Shown = { id: string; title: string; emoji: string; date: string; yearly: boolean; note: string | null; editable: boolean };

export default function CalendarPage() {
  useActivity("Planning on the love calendar 📅");
  const { world, me } = useWorld();
  const api = db();
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [editing, setEditing] = useState<Partial<CalendarEvent> | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await api.from("calendar_events").select("*").eq("world_id", world.id).order("event_date");
    if (error) return setError(errorMessage(error));
    setEvents((data ?? []) as CalendarEvent[]);
  }, [api, world.id]);
  useEffect(() => {
    load();
  }, [load]);

  const all: Shown[] = useMemo(() => {
    const list: Shown[] = (events ?? []).map((e) => ({ id: e.id, title: e.title, emoji: e.emoji, date: e.event_date, yearly: e.yearly, note: e.note, editable: true }));
    if (world.relationship_start) list.push({ id: "anniv", title: "Our anniversary", emoji: "💞", date: world.relationship_start, yearly: true, note: null, editable: false });
    return list;
  }, [events, world.relationship_start]);

  const onDay = (y: number, m: number, d: number) =>
    all.filter((e) => {
      const [ey, em, ed] = e.date.split("-").map(Number);
      return em === m + 1 && ed === d && (e.yearly ? y >= ey : y === ey);
    });

  const upcoming = all
    .map((e) => ({ ...e, days: daysUntil(e.date, e.yearly) }))
    .filter((e) => e.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);

  const first = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = localDay();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing?.title?.trim() || !editing.event_date) return;
    const row = { title: editing.title.trim().slice(0, 120), event_date: editing.event_date, yearly: Boolean(editing.yearly), emoji: editing.emoji ?? "💜", note: editing.note?.trim() || null };
    const { error } = editing.id ? await api.from("calendar_events").update(row).eq("id", editing.id) : await api.from("calendar_events").insert({ ...row, world_id: world.id, author_id: me.id });
    if (error) return toast(errorMessage(error), "error");
    setEditing(null);
    toast("Saved to the calendar", "ok");
    load();
  }

  async function remove(id: string) {
    const { error } = await api.from("calendar_events").delete().eq("id", id);
    if (error) return toast(errorMessage(error), "error");
    setEditing(null);
    load();
  }

  return (
    <>
      <PageHeader title="Love Calendar" subtitle="Anniversaries, birthdays and plans — for both of you." action={<Button size="sm" onClick={() => setEditing({ event_date: today, emoji: "💜" })}><IconPlus size={18} /> Add</Button>} />
      {error && <ErrorNote onRetry={load}>{error}</ErrorNote>}
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <IconButton label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <IconBack />
          </IconButton>
          <h2 className="font-display text-xl">{month.toLocaleDateString([], { month: "long", year: "numeric" })}</h2>
          <IconButton label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <IconBack className="rotate-180" />
          </IconButton>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-ink-faint">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: first }, (_, i) => (
            <div key={`b${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const iso = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const evs = onDay(month.getFullYear(), month.getMonth(), d);
            return (
              <button
                key={d}
                onClick={() => (evs[0]?.editable ? setEditing(events!.find((e) => e.id === evs[0].id)!) : setEditing({ event_date: iso, emoji: "💜" }))}
                className={cn("flex aspect-square flex-col items-center justify-center rounded-xl text-sm", iso === today ? "bg-rose-strong font-bold text-[var(--bubble-me-ink)]" : evs.length ? "bg-surface-2" : "hover:bg-surface-2")}
                aria-label={`${iso}${evs.length ? `: ${evs.map((e) => e.title).join(", ")}` : ""}`}
              >
                {d}
                {evs.length > 0 && <span className="text-[11px] leading-none">{evs[0].emoji}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <h2 className="mb-2 mt-6 font-display text-xl">Coming up</h2>
      {events === null ? (
        <div className="skeleton h-20" />
      ) : upcoming.length === 0 ? (
        <EmptyState emoji="📅" title="Nothing planned yet">Add a birthday, an anniversary, or your next date night.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((e) => (
            <li key={e.id} className="card flex items-center gap-3 p-4">
              <span className="text-2xl">{e.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{e.title}</div>
                <div className="text-xs text-ink-faint">
                  {new Date(e.date + "T00:00").toLocaleDateString([], { month: "long", day: "numeric" })}
                  {e.yearly && " · every year"}
                  {e.note && ` · ${e.note}`}
                </div>
              </div>
              <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-bold", e.days === 0 ? "bg-gold text-[#2a1d05]" : "bg-surface-2 text-ink-soft")}>{e.days === 0 ? "Today" : `${e.days}d`}</span>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? "Edit date" : "Add a date"}>
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <Field label="What's happening?">
              <input className={inputClass} required maxLength={120} value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Tobi's birthday" />
            </Field>
            <Field label="Date">
              <input className={inputClass} type="date" required value={editing.event_date ?? ""} onChange={(e) => setEditing({ ...editing, event_date: e.target.value })} />
            </Field>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[var(--rose-strong)]" checked={Boolean(editing.yearly)} onChange={(e) => setEditing({ ...editing, yearly: e.target.checked })} />
              Repeats every year
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((em) => (
                <button type="button" key={em} onClick={() => setEditing({ ...editing, emoji: em })} aria-pressed={editing.emoji === em} className={cn("grid h-10 w-10 place-items-center rounded-full text-xl", editing.emoji === em ? "bg-surface-2 ring-2 ring-rose" : "bg-surface")}>
                  {em}
                </button>
              ))}
            </div>
            <Field label="Note (optional)">
              <input className={inputClass} maxLength={1000} value={editing.note ?? ""} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              {editing.id && (
                <Button type="button" variant="danger" onClick={() => remove(editing.id!)}>
                  <IconTrash size={18} />
                </Button>
              )}
              <Button type="submit" className="flex-1">
                Save
              </Button>
            </div>
          </form>
        )}
      </Sheet>
    </>
  );
}
