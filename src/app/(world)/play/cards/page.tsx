"use client";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { GameFrame } from "@/components/games/game-frame";
import { nextPrompt, useGame } from "@/components/games/use-game";
import { Button } from "@/components/ui/primitives";
import { CARDS, CARD_CATEGORIES, type CardCategory } from "@/content/games";
import { cn } from "@/lib/utils";
import { useActivity } from "@/lib/world-context";

export default function CardsPage() {
  useActivity("Drawing question cards 🃏");
  const g = useGame("cards");
  const [cat, setCat] = useState<CardCategory | "all">("all");
  const s = g.session;
  const card = s ? CARDS.find((c) => c.id === s.prompt_id) ?? CARDS[0] : null;
  const pool = cat === "all" ? CARDS : CARDS.filter((c) => c.cat === cat);
  const meta = card ? CARD_CATEGORIES.find((c) => c.id === card.cat)! : null;

  const draw = () => {
    const p = nextPrompt(pool, s?.used_prompts ?? [], s?.prompt_id);
    if (s) g.next(p.id);
    else g.start(p.id);
  };

  return (
    <GameFrame title="Question Cards" subtitle="You both see the same card. Talk, laugh, take your time. Skip anything, anytime." error={g.error} onRetry={g.reload} loading={g.session === undefined}>
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
        {[{ id: "all" as const, label: "All", emoji: "✨" }, ...CARD_CATEGORIES].map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            aria-pressed={cat === c.id}
            className={cn("min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold", cat === c.id ? "bg-ink text-bg" : "bg-surface text-ink-soft")}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {card && meta ? (
          <m.div
            key={s!.round}
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative mx-auto flex aspect-[3/4] max-w-sm flex-col justify-between overflow-hidden rounded-[28px] border border-gold/30 bg-gradient-to-br from-surface-2 to-surface p-7 shadow-2xl"
          >
            <span className="text-sm font-semibold text-gold">
              {meta.emoji} {meta.label}
            </span>
            <p className="font-display text-[26px] leading-snug">{card.q}</p>
            <span className="text-right text-xs text-ink-faint">Card {s!.round}</span>
          </m.div>
        ) : (
          <div className="card mx-auto max-w-sm p-8 text-center">
            <div className="text-5xl">🃏</div>
            <p className="mt-3 text-ink-soft">{CARDS.length} cards across five categories. Pick a category above, or draw from all.</p>
          </div>
        )}
      </AnimatePresence>
      <div className="mx-auto mt-6 flex max-w-sm gap-2">
        {card && (
          <Button variant="ghost" className="flex-1" onClick={draw} disabled={g.busy}>
            Skip
          </Button>
        )}
        <Button className="flex-1" onClick={draw} loading={g.busy}>
          {card ? "Next card" : "Draw a card"}
        </Button>
      </div>
    </GameFrame>
  );
}
