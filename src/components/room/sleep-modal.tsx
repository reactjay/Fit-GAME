"use client";
import { useState } from "react";
import { Button, Sheet } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useSendBurst } from "@/components/ui/bursts";
import { db } from "@/lib/db/client";
import { sfx } from "@/lib/sound";
import { errorMessage } from "@/lib/utils";
import { useWorld } from "@/lib/world-context";
import { emoteMe } from "@/home/state";

const MORNING_QUOTES = [
  "Good morning sweet heart! Rise and shine in Lagos ☀️",
  "Waking up next to you is the best part of every Lagos day 💞",
  "The birds are singing over the Lekki waters. Have an amazing day together! 🌴",
  "Fresh morning breeze, hot puff-puff, and endless love with you ☕✨",
];

export function SleepModal({
  open,
  onClose,
  bedName = "Bed",
}: {
  open: boolean;
  onClose: () => void;
  bedName?: string;
}) {
  const { partner, world, updateWorld } = useWorld();
  const api = db();
  const sendBurst = useSendBurst();
  const [sleeping, setSleeping] = useState<boolean>(false);
  const [sleepPhase, setSleepPhase] = useState<"menu" | "sleeping" | "awake">("menu");
  const [rewardInfo, setRewardInfo] = useState<{ pts: number; quote: string } | null>(null);

  async function startSleep(kind: "sleep" | "nap") {
    setSleeping(true);
    setSleepPhase("sleeping");
    emoteMe("sit", kind === "sleep" ? 6 : 4);
    sfx.piano();

    try {
      const { data, error } = await api.rpc("record_sleep", { p_kind: kind });
      if (error) throw error;

      const res = data as { ok: boolean; points_awarded: number };
      const pts = res.points_awarded || (kind === "sleep" ? 10 : 3);
      updateWorld({ points: (world.points || 0) + pts });

      const quote = MORNING_QUOTES[Math.floor(Math.random() * MORNING_QUOTES.length)];

      setTimeout(() => {
        setSleeping(false);
        setSleepPhase("awake");
        setRewardInfo({
          pts,
          quote,
        });
        sfx.reward();
        sendBurst(kind === "sleep" ? "☀️" : "✨");
      }, 3500);
    } catch (err) {
      setSleeping(false);
      setSleepPhase("menu");
      toast(errorMessage(err), "error");
    }
  }

  function handleCuddle() {
    emoteMe("clap", 6);
    sfx.romance();
    sendBurst("💞");
    toast(`Cuddling closely in bed with ${partner ? partner.display_name : "love"} 💞`, "ok");
    onClose();
  }

  function handleFinish() {
    setSleepPhase("menu");
    setRewardInfo(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={handleFinish} title={`${bedName} 🛏️`}>
      {sleepPhase === "menu" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-4 text-center">
            <span className="text-4xl">🌙</span>
            <h4 className="mt-2 font-display text-base font-bold text-ink">Rest & Sleep in Lagos</h4>
            <p className="mt-1 text-xs text-ink-soft">
              Sleeping restores your energy, triggers cozy couple dreams, and earns you Love Points!
            </p>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={() => startSleep("sleep")}
              disabled={sleeping}
              className="flex w-full items-center justify-between rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/20 to-purple-950/20 p-4 text-left transition hover:border-indigo-500 hover:bg-indigo-950/30 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5">
                <span className="text-3xl">💤</span>
                <div>
                  <div className="font-bold text-ink text-sm">Full Night&apos;s Sleep</div>
                  <div className="text-xs text-ink-soft">Restore 100% energy and wake up refreshed</div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-gold bg-gold/15 px-2.5 py-1 rounded-full">+10 ✦ Points</span>
              </div>
            </button>

            <button
              onClick={() => startSleep("nap")}
              disabled={sleeping}
              className="flex w-full items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-left transition hover:border-amber-500 hover:bg-amber-500/15 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5">
                <span className="text-3xl">😴</span>
                <div>
                  <div className="font-bold text-ink text-sm">Afternoon Power Nap</div>
                  <div className="text-xs text-ink-soft">Quick refreshing rest</div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-gold bg-gold/15 px-2.5 py-1 rounded-full">+3 ✦ Points</span>
              </div>
            </button>

            <button
              onClick={handleCuddle}
              className="flex w-full items-center gap-3.5 rounded-2xl border border-rose/30 bg-rose/10 p-4 text-left transition hover:border-rose hover:bg-rose/15 active:scale-[0.99]"
            >
              <span className="text-3xl">🤗</span>
              <div>
                <div className="font-bold text-ink text-sm">Cuddle in Bed</div>
                <div className="text-xs text-ink-soft">Snuggle under the duvet with your partner</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {sleepPhase === "sleeping" && (
        <div className="py-12 text-center space-y-4">
          <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
            <span className="text-6xl animate-pulse">🌙</span>
            <span className="absolute -top-1 -right-1 text-2xl animate-bounce">✨</span>
            <span className="absolute -bottom-1 -left-1 text-2xl animate-pulse">💤</span>
          </div>
          <h3 className="font-display text-xl font-bold text-ink">Falling asleep in Lagos...</h3>
          <p className="text-xs text-ink-soft max-w-xs mx-auto">
            Resting peacefully. Dream sweet dreams of you and {partner?.display_name ?? "your love"}...
          </p>
        </div>
      )}

      {sleepPhase === "awake" && rewardInfo && (
        <div className="py-6 text-center space-y-5">
          <div className="text-5xl animate-bounce">☀️</div>
          <div>
            <h3 className="font-display text-2xl font-extrabold text-ink">Good Morning!</h3>
            <p className="mt-2 text-sm italic text-ink-soft max-w-xs mx-auto">&ldquo;{rewardInfo.quote}&rdquo;</p>
          </div>

          <div className="flex justify-center">
            <div className="rounded-2xl border border-gold/30 bg-gold/10 px-6 py-3 text-center">
              <span className="text-xs text-ink-faint block">Love Points Earned</span>
              <span className="font-display font-bold text-xl text-gold">+{rewardInfo.pts} ✦</span>
            </div>
          </div>

          <Button onClick={handleFinish} className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-md">
            Rise and Shine ✨
          </Button>
        </div>
      )}
    </Sheet>
  );
}
