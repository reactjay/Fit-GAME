"use client";
import { GameFrame, Scoreboard } from "@/components/games/game-frame";
import { nextPrompt, useGame } from "@/components/games/use-game";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/primitives";
import { WYR } from "@/content/games";
import { cn } from "@/lib/utils";
import { useActivity, useWorld } from "@/lib/world-context";

const TONE = { funny: "😂 Funny", thoughtful: "🌙 Thoughtful", romantic: "🌹 Romantic" };

export default function WyrPage() {
  useActivity("Playing Would You Rather ⚖️");
  const { me, partner } = useWorld();
  const g = useGame("wyr");
  const s = g.session;
  const prompt = s ? WYR.find((p) => p.id === s.prompt_id) ?? WYR[0] : null;
  const mine = g.answers.find((a) => a.user_id === me.id)?.answer.choice as number | undefined;
  const theirs = g.answers.find((a) => a.user_id !== me.id)?.answer.choice as number | undefined;
  const iAnswered = Boolean(s?.answered.includes(me.id));
  const partnerAnswered = Boolean(partner && s?.answered.includes(partner.id));

  return (
    <GameFrame title="Would You Rather?" subtitle="Pick secretly. Reveal together. Matching answers earn ✦2." error={g.error} onRetry={g.reload} loading={g.session === undefined}>
      {s === null ? (
        <div className="card p-6 text-center">
          <div className="text-5xl">⚖️</div>
          <p className="mt-3 text-ink-soft">{WYR.length} dilemmas — funny, thoughtful and romantic. Skip any you don&apos;t fancy.</p>
          <Button className="mt-5" onClick={() => g.start(nextPrompt(WYR, []).id)} loading={g.busy}>
            Start playing
          </Button>
        </div>
      ) : s && prompt ? (
        <>
          <Scoreboard
            items={[
              { label: "Matches", value: s.scores.matches ?? 0 },
              { label: "Played", value: s.scores.played ?? 0 },
              { label: "Match rate", value: s.scores.played ? `${Math.round(((s.scores.matches ?? 0) / s.scores.played) * 100)}%` : "—" },
            ]}
          />
          <div className="card p-5">
            <div className="text-xs font-semibold text-gold">{TONE[prompt.tone]} · Would you rather…</div>
            <div className="mt-4 grid gap-3">
              {[prompt.a, prompt.b].map((opt, i) => {
                const revealed = s.state === "revealed";
                return (
                  <button
                    key={i}
                    disabled={iAnswered || g.busy}
                    onClick={() => g.submit({ choice: i })}
                    className={cn(
                      "relative flex min-h-20 items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left text-[17px] font-medium transition",
                      mine === i ? "border-rose bg-rose/10" : "border-line bg-surface-2",
                      !iAnswered && "hover:border-rose",
                    )}
                  >
                    <span>{opt}</span>
                    <span className="flex shrink-0 -space-x-2">
                      {mine === i && <Avatar look={me.avatar} size={30} label="You" />}
                      {revealed && theirs === i && <Avatar look={partner?.avatar} size={30} label={partner?.display_name} />}
                    </span>
                    {i === 0 && <span className="absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-raised px-2 text-xs font-bold text-ink-faint">OR</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-5 text-center text-sm" aria-live="polite">
              {s.state === "revealed" ? (
                mine === theirs ? (
                  <span className="font-semibold text-gold">Perfect match! 💞 +✦2</span>
                ) : (
                  <span className="text-ink-soft">Different picks — talk it out! 😄</span>
                )
              ) : iAnswered ? (
                <span className="text-ink-faint">Waiting for {partner?.display_name}…</span>
              ) : partnerAnswered ? (
                <span className="text-ink-faint">{partner?.display_name} has chosen. Your turn!</span>
              ) : (
                <span className="text-ink-faint">Choose one — your partner won&apos;t see it until they choose too.</span>
              )}
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="ghost" className="flex-1" disabled={g.busy} onClick={() => g.next(nextPrompt(WYR, s.used_prompts, s.prompt_id).id)}>
              Skip
            </Button>
            {s.state === "revealed" && (
              <Button className="flex-1" disabled={g.busy} onClick={() => g.next(nextPrompt(WYR, s.used_prompts, s.prompt_id).id)}>
                Next dilemma
              </Button>
            )}
          </div>
        </>
      ) : null}
    </GameFrame>
  );
}
