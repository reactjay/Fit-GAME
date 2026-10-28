"use client";
import { DailyCard } from "@/components/daily/daily-card";
import { GameFrame } from "@/components/games/game-frame";
import { useActivity } from "@/lib/world-context";

export default function QuestPage() {
  useActivity("On the Daily Love Quest 🗝️");
  return (
    <GameFrame title="Daily Love Quest" subtitle="A new quest every day. Finish your parts to earn love points — rewarded once per day.">
      <div className="space-y-4">
        <DailyCard kind="quest" />
        <DailyCard kind="question" />
        <p className="text-center text-xs text-ink-faint">Spend love points on decorations in Our Home.</p>
      </div>
    </GameFrame>
  );
}
