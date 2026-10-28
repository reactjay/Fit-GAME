"use client";
import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoryScene } from "@/components/stories/scene";
import { Avatar } from "@/components/ui/avatar";
import { IconBack } from "@/components/ui/icons";
import { Button, ErrorNote } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { fillNames, getStory } from "@/content/stories";
import { sfx } from "@/lib/sound";
import { db } from "@/lib/db/client";
import type { StorySession } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { useActivity, useWorld } from "@/lib/world-context";

const MOOD_LABEL = { sweet: "A sweet ending", bittersweet: "A bittersweet ending", funny: "A funny ending", epic: "An epic ending" };

export function StoryReader({ storyId }: { storyId: string }) {
  const story = getStory(storyId)!;
  useActivity(`Reading “${story.title}” 📖`);
  const { world, me, partner, onChange, onResync, role, nameOf } = useWorld();
  const api = db();
  const [session, setSession] = useState<StorySession | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const advancing = useRef<string | null>(null);

  const creatorName = role === "creator" ? me.display_name : partner?.display_name ?? "your love";
  const partnerName = role === "creator" ? partner?.display_name ?? "your love" : me.display_name;
  const fill = useCallback((t: string) => fillNames(t, creatorName, partnerName), [creatorName, partnerName]);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await api.from("story_sessions").select("*").eq("world_id", world.id).eq("story_id", storyId).maybeSingle();
    if (error) return setError(errorMessage(error));
    setSession((data as StorySession) ?? null);
  }, [api, world.id, storyId]);

  useEffect(() => {
    load();
    return onChange("story_sessions", (p) => {
      const row = p.new as StorySession;
      if (row?.story_id === storyId) setSession(row);
    });
  }, [load, onChange, storyId]);

  useEffect(() => onResync(load), [onResync, load]);

  const node = session ? story.nodes[session.node_id] ?? story.nodes[story.start] : null;
  const together = session?.mode === "together" && Boolean(partner);
  const myVote = session?.votes?.[me.id];
  const partnerVote = partner ? session?.votes?.[partner.id] : undefined;

  const advance = useCallback(
    async (s: StorySession, choice: number) => {
      const from = s.node_id;
      if (advancing.current === from) return;
      advancing.current = from;
      const to = story.nodes[from]?.choices?.[choice]?.to;
      if (!to) return;
      const ending = story.nodes[to]?.ending?.title ?? null;
      const { data, error } = await api.rpc("story_advance", { p_session: s.id, p_from: from, p_to: to, p_choice: choice, p_ending: ending });
      if (error) {
        advancing.current = null;
        return toast(errorMessage(error), "error");
      }
      setSession(data as StorySession);
      if (ending) sfx.chime();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [api, story.nodes],
  );

  // When both have voted, resolve the choice (agreement wins; otherwise partners take turns deciding).
  useEffect(() => {
    if (!session || !together || myVote === undefined || partnerVote === undefined) return;
    let pick = myVote;
    let label: string;
    if (myVote === partnerVote) {
      label = "You both chose the same path 💞";
    } else {
      const creatorTurn = session.history.length % 2 === 0;
      const iDecide = (role === "creator") === creatorTurn;
      pick = iDecide ? myVote : partnerVote;
      label = `${iDecide ? "Your" : `${partner?.display_name}'s`} choice wins this time — you take turns when you disagree.`;
    }
    setResolved(label);
    const t = setTimeout(() => {
      setResolved(null);
      advance(session, pick);
    }, 1600);
    return () => clearTimeout(t);
  }, [session, together, myVote, partnerVote, role, partner?.display_name, advance]);

  async function begin() {
    setBusy(true);
    const { data, error } = await api.rpc("story_start", { p_story: storyId, p_start: story.start });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    setSession(data as StorySession);
  }

  async function choose(i: number) {
    if (!session || busy) return;
    if (!together) return advance(session, i);
    setBusy(true);
    const { data, error } = await api.rpc("story_vote", { p_session: session.id, p_node: session.node_id, p_choice: i });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    setSession(data as StorySession);
  }

  async function restart() {
    if (!session) return;
    advancing.current = null;
    const { data, error } = await api.rpc("story_reset", { p_session: session.id, p_start: story.start, p_mode: session.mode });
    if (error) return toast(errorMessage(error), "error");
    setSession(data as StorySession);
  }

  async function toggleMode() {
    if (!session) return;
    const { data, error } = await api.rpc("story_set_mode", { p_session: session.id, p_mode: session.mode === "together" ? "solo" : "together" });
    if (error) return toast(errorMessage(error), "error");
    setSession(data as StorySession);
  }

  const progress = useMemo(() => (node ? (node.ending ? 1 : (node.chapter + 0.5) / story.chapters.length) : 0), [node, story.chapters.length]);

  return (
    <article className="-mx-4 -mt-4 sm:mx-0 sm:mt-0">
      <div className="relative overflow-hidden sm:rounded-3xl">
        <StoryScene scene={node?.scene ?? story.nodes[story.start].scene} palette={story.palette} className="h-48 w-full sm:h-64" />
        <Link href="/stories" className="absolute left-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-black/35 text-white backdrop-blur" aria-label="Back to stories">
          <IconBack />
        </Link>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
          <div className="h-full bg-gold transition-[width] duration-700" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <div className="px-4 pt-5 sm:px-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold">
            {node ? `Chapter ${node.chapter + 1} of ${story.chapters.length} · ${story.chapters[node.chapter]}` : `${story.emoji} ${story.chapters.length} chapters`}
          </p>
          {session && partner && !node?.ending && (
            <button onClick={toggleMode} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink">
              {session.mode === "together" ? "👫 Reading together" : "👤 Reading solo"} · switch
            </button>
          )}
        </div>
        <h1 className="mt-2 font-display text-3xl">{story.title}</h1>

        {error && <div className="mt-4"><ErrorNote onRetry={load}>{error}</ErrorNote></div>}
        {session === undefined && !error && (
          <div className="mt-6 space-y-3">
            {[90, 100, 80, 95].map((w, i) => (
              <div key={i} className="skeleton h-4" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {session === null && (
          <div className="mt-4">
            <p className="text-ink-soft">{story.tagline}</p>
            <p className="mt-3 text-sm text-ink-faint">
              {partner ? `When you read together, you and ${partner.display_name} each pick a choice. Agree, and the story follows. Disagree, and you take turns deciding.` : "You can begin now — your partner can join in once they arrive."}
            </p>
            <Button className="mt-5" size="lg" onClick={begin} loading={busy}>
              Open the book
            </Button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {session && node && (
            <m.div key={session.node_id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
              <div className="prose-story mt-5 max-w-prose font-display text-[18px] text-ink">
                {node.text.map((p, i) => (
                  <p key={i}>{fill(p)}</p>
                ))}
              </div>

              {node.ending ? (
                <div className="mt-8 rounded-3xl border border-gold/40 bg-gold/10 p-6 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gold">{MOOD_LABEL[node.ending.mood]}</p>
                  <h2 className="mt-2 font-display text-2xl">{node.ending.title}</h2>
                  <p className="mt-2 text-sm text-ink-soft">
                    You&apos;ve found {session.endings_seen.length} of {new Set(Object.values(story.nodes).flatMap((n) => (n.ending ? [n.ending.id] : []))).size} endings.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <Button onClick={restart}>Read again, choose differently</Button>
                    <Link href="/stories" className="inline-flex min-h-11 items-center rounded-full bg-surface-2 px-5 font-semibold">
                      Other stories
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="mt-8 space-y-2.5 pb-6">
                  <p className="text-sm font-semibold text-ink-soft">{together ? "What do you choose?" : "What happens next?"}</p>
                  {node.choices!.map((c, i) => (
                    <button
                      key={c.to + i}
                      onClick={() => choose(i)}
                      disabled={busy || Boolean(resolved)}
                      className={cn(
                        "flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left font-medium transition",
                        myVote === i ? "border-rose bg-rose/10" : "border-line bg-surface hover:border-rose",
                      )}
                    >
                      <span>{fill(c.label)}</span>
                      <span className="flex shrink-0 -space-x-2">
                        {myVote === i && <Avatar look={me.avatar} size={26} label="Your choice" />}
                        {together && myVote !== undefined && partnerVote === i && <Avatar look={partner?.avatar} size={26} label={`${nameOf(partner?.id)}'s choice`} />}
                      </span>
                    </button>
                  ))}
                  {together && (
                    <p className="pt-1 text-center text-xs text-ink-faint" aria-live="polite">
                      {resolved ??
                        (myVote === undefined && partnerVote !== undefined
                          ? `${partner?.display_name} has chosen — your turn.`
                          : myVote !== undefined && partnerVote === undefined
                            ? `Waiting for ${partner?.display_name} to choose…`
                            : "Both of you choose. Their pick stays hidden until you've picked too.")}
                    </p>
                  )}
                </div>
              )}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </article>
  );
}
