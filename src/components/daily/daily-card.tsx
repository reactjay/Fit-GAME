"use client";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button, ErrorNote, inputClass } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { DAILY_QUESTIONS, DAILY_QUESTS } from "@/content/games";
import { sfx } from "@/lib/sound";
import { db } from "@/lib/db/client";
import { errorMessage, localDay, pickDaily } from "@/lib/utils";
import { useWorld } from "@/lib/world-context";

type Entry = { user_id: string; answer: string };

/** Daily question (kind="question") or Daily Love Quest (kind="quest"). Both partners answer; reward is granted once by the database. */
export function DailyCard({ kind }: { kind: "question" | "quest" }) {
  const { world, me, partner, onChange } = useWorld();
  const api = db();
  const day = localDay();
  const prompt = kind === "question" ? { title: "Today's question", task: pickDaily(DAILY_QUESTIONS, `${world.id}:${day}:q`) } : pickDaily(DAILY_QUESTS, `${world.id}:${day}:quest`);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [rewarded, setRewarded] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data, error }, { data: reward }] = await Promise.all([
      api.from("daily_entries").select("user_id, answer").eq("world_id", world.id).eq("day", day).eq("kind", kind),
      api.from("daily_rewards").select("day").eq("world_id", world.id).eq("day", day).eq("kind", kind).maybeSingle(),
    ]);
    if (error) return setError(errorMessage(error));
    setEntries((data ?? []) as Entry[]);
    setRewarded(Boolean(reward));
  }, [api, world.id, day, kind]);

  useEffect(() => {
    load();
    return onChange("daily_rewards", () => load());
  }, [load, onChange]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const { data, error } = await api.rpc("submit_daily", { p_kind: kind, p_day: day, p_answer: text.trim() });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    if ((data as { rewarded: boolean }).rewarded) {
      sfx.reward();
      toast(`You both did it! +${kind === "quest" ? 10 : 3} love points ✦`, "gold");
    }
    setText("");
    load();
  }

  const mine = entries?.find((x) => x.user_id === me.id);
  const theirs = entries?.find((x) => x.user_id !== me.id);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gold">{kind === "quest" ? "Daily Love Quest" : "Daily question"}</span>
        {rewarded && <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-semibold text-gold">Completed ✦ +{kind === "quest" ? 10 : 3}</span>}
      </div>
      {kind === "quest" && <h3 className="mt-2 font-display text-xl">{prompt.title}</h3>}
      <p className={kind === "quest" ? "mt-1 text-ink-soft" : "mt-2 font-display text-xl"}>{prompt.task}</p>
      {error && <div className="mt-3"><ErrorNote onRetry={load}>{error}</ErrorNote></div>}
      {entries === null ? (
        <div className="skeleton mt-4 h-12" />
      ) : !mine ? (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <textarea className={`${inputClass} min-h-20`} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer — revealed once you both reply" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-ink-faint">{partner ? `${partner.display_name}'s answer appears after you answer.` : "Your partner can answer once they join."}</span>
            <Button type="submit" loading={busy} disabled={!text.trim()} size="sm">
              Answer
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 space-y-2">
          <Answer who={me} text={mine.answer} />
          {theirs ? (
            <Answer who={partner} text={theirs.answer} />
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-ink-faint">Waiting for {partner?.display_name ?? "your partner"}… their answer will appear here.</p>
          )}
        </div>
      )}
    </section>
  );
}

function Answer({ who, text }: { who: { display_name: string; avatar: import("@/lib/types").AvatarLook } | null; text: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
      <Avatar look={who?.avatar} size={28} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-ink-soft">{who?.display_name}</div>
        <p className="whitespace-pre-wrap break-words text-[15px]">{text}</p>
      </div>
    </div>
  );
}
