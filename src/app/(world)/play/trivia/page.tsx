"use client";
import { useState } from "react";
import { GameFrame, Scoreboard } from "@/components/games/game-frame";
import { nextPrompt, useGame } from "@/components/games/use-game";
import { Avatar } from "@/components/ui/avatar";
import { Button, inputClass } from "@/components/ui/primitives";
import { TRIVIA } from "@/content/games";
import { useActivity, useWorld } from "@/lib/world-context";

export default function TriviaPage() {
  useActivity("Playing Couple Trivia 🧠");
  const { me, partner, nameOf, world } = useWorld();
  const g = useGame("trivia");
  const [text, setText] = useState("");
  const s = g.session;
  const prompt = s ? TRIVIA.find((p) => p.id === s.prompt_id) ?? TRIVIA[0] : null;
  const subjectId = s?.subject_id ?? world.created_by;
  const iAmSubject = subjectId === me.id;
  const subjectName = nameOf(subjectId);
  const guesserId = iAmSubject ? partner?.id : me.id;
  const truth = g.answers.find((a) => a.user_id === subjectId);
  const guess = g.answers.find((a) => a.user_id !== subjectId);
  const judged = s ? s.judged_round >= s.round : false;
  const iAnswered = Boolean(s?.answered.includes(me.id));

  const advance = () => {
    if (!s || !partner) return;
    const p = nextPrompt(TRIVIA, s.used_prompts, s.prompt_id);
    // The subject alternates every round.
    g.next(p.id, subjectId === me.id ? partner.id : me.id);
    setText("");
  };

  return (
    <GameFrame title="Couple Trivia" subtitle="One of you answers about yourself, the other guesses. Then the truth comes out." error={g.error} onRetry={g.reload} loading={g.session === undefined}>
      {s === null ? (
        <div className="card p-6 text-center">
          <div className="text-5xl">🧠</div>
          <p className="mt-3 text-ink-soft">Take turns being the subject. The subject judges whether the guess was close enough — each right guess is +1 and ✦3.</p>
          <Button className="mt-5" onClick={() => g.start(nextPrompt(TRIVIA, []).id, world.created_by)} loading={g.busy}>
            Start playing
          </Button>
        </div>
      ) : s && prompt ? (
        <>
          <Scoreboard
            items={[
              { label: `${me.display_name}'s points`, value: s.scores[me.id] ?? 0 },
              { label: `${partner?.display_name}'s points`, value: partner ? s.scores[partner.id] ?? 0 : 0 },
              { label: "Round", value: s.round },
            ]}
          />
          <div className="card p-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-gold">
              <Avatar look={iAmSubject ? me.avatar : partner?.avatar} size={24} />
              About {iAmSubject ? "you" : subjectName}
            </div>
            <h2 className="mt-3 font-display text-2xl leading-snug">{prompt.q.replaceAll("{name}", subjectName)}</h2>

            {s.state === "answering" ? (
              iAnswered ? (
                <p className="mt-5 rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-ink-faint">
                  Locked in. Waiting for {partner?.display_name} to {iAmSubject ? "guess" : "answer"}…
                </p>
              ) : (
                <form
                  className="mt-5 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) g.submit({ text: text.trim().slice(0, 300) });
                  }}
                >
                  <input className={inputClass} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder={iAmSubject ? "The real answer…" : `Your guess about ${subjectName}…`} />
                  <Button type="submit" className="w-full" disabled={!text.trim()} loading={g.busy}>
                    {iAmSubject ? "Lock in the truth" : "Lock in my guess"}
                  </Button>
                </form>
              )
            ) : (
              <div className="mt-5 space-y-2">
                <Reveal label={`${subjectName}'s truth`} text={String(truth?.answer.text ?? "")} />
                <Reveal label={`${nameOf(guesserId)}'s guess`} text={String(guess?.answer.text ?? "")} />
                {!judged ? (
                  iAmSubject ? (
                    <div className="flex gap-2 pt-2">
                      <Button variant="soft" className="flex-1" onClick={() => g.judge(false)} loading={g.busy}>
                        Not quite
                      </Button>
                      <Button variant="gold" className="flex-1" onClick={() => g.judge(true)} loading={g.busy}>
                        Got it right! ✦
                      </Button>
                    </div>
                  ) : (
                    <p className="pt-2 text-center text-sm text-ink-faint">Waiting for {subjectName} to judge your guess…</p>
                  )
                ) : (
                  <p className="pt-2 text-center text-sm font-semibold text-gold">Judged! Ready for the next one.</p>
                )}
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="ghost" onClick={advance} disabled={g.busy} className="flex-1">
              Skip question
            </Button>
            {s.state === "revealed" && (
              <Button onClick={advance} disabled={g.busy || (!judged && iAmSubject)} className="flex-1">
                Next question
              </Button>
            )}
          </div>
        </>
      ) : null}
    </GameFrame>
  );
}

function Reveal({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-4 py-3">
      <div className="text-xs font-semibold text-ink-faint">{label}</div>
      <div className="mt-0.5 text-[16px]">{text || "—"}</div>
    </div>
  );
}
