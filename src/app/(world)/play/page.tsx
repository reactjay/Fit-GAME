"use client";
import Link from "next/link";
import { PageHeader } from "@/components/ui/primitives";
import { useActivity } from "@/lib/world-context";

const GAMES = [
  { href: "/play/quest", emoji: "🗝️", title: "Daily Love Quest", text: "One shared little mission a day. Finish together for ✦10." },
  { href: "/play/trivia", emoji: "🧠", title: "Couple Trivia", text: "How well do you really know each other? Take turns being the subject." },
  { href: "/play/wyr", emoji: "⚖️", title: "Would You Rather?", text: "Funny, thoughtful and romantic dilemmas. See if you match." },
  { href: "/play/cards", emoji: "🃏", title: "Question Cards", text: "Conversation cards for long calls and lazy evenings." },
  { href: "/city", emoji: "🚗", title: "Port Amara (3D)", text: "Explore a whole coastal city together: drive, ride the train, fly the jet." },
];

export default function PlayPage() {
  useActivity("Choosing a game 🎮");
  return (
    <>
      <PageHeader title="Just Two of Us" subtitle="Games built for two. Every question can be skipped — no pressure, only play." />
      <div className="grid gap-3 sm:grid-cols-2">
        {GAMES.map((g) => (
          <Link key={g.href} href={g.href} className="card flex gap-4 p-5 transition hover:border-rose">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface-2 text-3xl">{g.emoji}</span>
            <span>
              <span className="block font-display text-lg">{g.title}</span>
              <span className="mt-1 block text-sm text-ink-soft">{g.text}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
