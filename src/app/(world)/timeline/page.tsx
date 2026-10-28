"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, ErrorNote, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db/client";
import type { Activity } from "@/lib/types";
import { dayLabel, errorMessage, timeLabel } from "@/lib/utils";
import { useActivity, useWorld } from "@/lib/world-context";

const ICON: Record<string, string> = { world: "🏡", memory: "💌", calendar: "📅", music: "🎶", call: "📞", story: "📖", quest: "🗝️", question: "💭", decor: "🛋️" };
const PAGE = 40;

export default function TimelinePage() {
  useActivity("Looking back at our timeline 🕰️");
  const { world, nameOf, onChange } = useWorld();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      let q = db().from("activity").select("*").eq("world_id", world.id).order("created_at", { ascending: false }).limit(PAGE);
      if (before) q = q.lt("created_at", before);
      const { data, error } = await q;
      if (error) return setError(errorMessage(error));
      setItems((cur) => (before ? [...(cur ?? []), ...(data as Activity[])] : (data as Activity[])));
      setMore((data ?? []).length === PAGE);
    },
    [world.id],
  );

  useEffect(() => {
    load();
    return onChange("activity", (p) => setItems((cur) => [p.new as Activity, ...(cur ?? [])]));
  }, [load, onChange]);

  return (
    <>
      <PageHeader title="Our Timeline" subtitle="Everything you've done together, as it happened." />
      {error && <ErrorNote onRetry={() => load()}>{error}</ErrorNote>}
      {items === null ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-14" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState emoji="🕰️" title="Your story starts here">Play, write, call and explore — your milestones collect on this page.</EmptyState>
      ) : (
        <ol className="relative ml-4 border-l border-line">
          {items.map((a, i) => {
            const showDay = i === 0 || new Date(items[i - 1].created_at).toDateString() !== new Date(a.created_at).toDateString();
            return (
              <li key={a.id} className="mb-4 ml-6">
                {showDay && <div className="-ml-6 mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-ink-faint">{dayLabel(a.created_at)}</div>}
                <span className="absolute -left-4 grid h-8 w-8 place-items-center rounded-full border border-line bg-raised text-sm">{ICON[a.kind] ?? "✨"}</span>
                <p className="text-[15px]">
                  <b className="font-semibold">{nameOf(a.actor_id)}</b> <span className="text-ink-soft">{a.summary}</span>
                </p>
                <p className="text-xs text-ink-faint">{timeLabel(a.created_at)}</p>
              </li>
            );
          })}
        </ol>
      )}
      {more && (
        <div className="text-center">
          <Button variant="soft" onClick={() => load(items?.[items.length - 1]?.created_at)}>
            Load earlier
          </Button>
        </div>
      )}
    </>
  );
}
