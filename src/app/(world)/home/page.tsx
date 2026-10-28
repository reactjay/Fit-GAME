"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { InviteCard } from "@/components/auth/invite-card";
import { DailyCard } from "@/components/daily/daily-card";
import { Character } from "@/components/ui/avatar";
import { useSendBurst } from "@/components/ui/bursts";
import { Starfield } from "@/components/ui/starfield";
import { STORIES } from "@/content/stories";
import { db } from "@/lib/db/client";
import type { Activity, CalendarEvent, StorySession } from "@/lib/types";
import { cn, daysTogether, daysUntil, relativeTime } from "@/lib/utils";
import { useActivity, useWorld } from "@/lib/world-context";
import { milestoneToday, nextMilestone } from "@/lib/milestones";
import { useStreak } from "@/lib/streak";

// Mirror of the game's CHARACTER_DEFS so the home page can show the chosen 3D avatar.
const CHARACTER_DEFS = [
  { id: "amara",  label: "Amara",  role: "Business woman",      emoji: "👩🏾‍💼" },
  { id: "kofi",   label: "Kofi",   role: "Smart casual",        emoji: "👨🏾‍💼" },
  { id: "emeka",  label: "Emeka",  role: "Hoodie guy",          emoji: "🧑🏿‍🦱" },
  { id: "musa",   label: "Musa",   role: "Construction worker", emoji: "👷🏿"  },
  { id: "tunde",  label: "Tunde",  role: "Leather jacket",      emoji: "🧥"   },
  { id: "chidi",  label: "Chidi",  role: "Footballer",          emoji: "⚽"   },
  { id: "ngozi",  label: "Ngozi",  role: "Nurse",               emoji: "👩🏿‍⚕️" },
  { id: "bisi",   label: "Bisi",   role: "Black dress",         emoji: "👗"   },
] as const;
type CharId = (typeof CHARACTER_DEFS)[number]["id"];

// Rotating love quotes keyed to day-of-year.
const LOVE_QUOTES = [
  "Every love story is beautiful, but ours is my favourite.",
  "You are my today and all of my tomorrows.",
  "In you, I found the love I always dreamed of.",
  "Together is my favourite place to be.",
  "You make ordinary moments extraordinary.",
  "Home is wherever I'm with you.",
  "I love you not just for who you are, but for who I am when I'm with you.",
  "Every day with you feels like a gift.",
  "You are the reason I believe in love.",
  "The best thing to hold onto in life is each other.",
  "I choose you. And I'll choose you over and over and over.",
  "You are my adventure and my calm at the same time.",
];

function todaysQuote() {
  const d = new Date();
  const day = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  return LOVE_QUOTES[day % LOVE_QUOTES.length];
}

// Couple goal challenges that cycle every few days.
const GOALS = [
  { emoji: "📸", text: "Take a photo together in the city" },
  { emoji: "🛍️", text: "Visit Balogun Market hand-in-hand" },
  { emoji: "🌅", text: "Watch the sunrise together" },
  { emoji: "🎭", text: "Visit the National Theatre" },
  { emoji: "🚂", text: "Ride the Lagos Metro together" },
  { emoji: "🏝️", text: "Escape to Tarkwa Bay island" },
  { emoji: "💃", text: "Dance somewhere in the city" },
  { emoji: "🌊", text: "Stand at Bar Beach together" },
  { emoji: "🏎️", text: "Race through the streets" },
  { emoji: "✈️", text: "Watch planes take off at the airport" },
];
function todaysGoal() {
  const d = new Date();
  const day = Math.floor(d.getTime() / (86400000 * 3)); // changes every 3 days
  return GOALS[day % GOALS.length];
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function HomePage() {
  useActivity("At home 🏡");
  const { world, me, partner, partnerStatus, partnerActivity, role, onChange, nameOf, updateWorld } = useWorld();
  const streak = useStreak((points) => updateWorld({ points }));
  const milestone = milestoneToday(world.relationship_start);
  const upcomingMilestone = nextMilestone(world.relationship_start);
  const sendBurst = useSendBurst();
  const [upcoming, setUpcoming] = useState<{ title: string; emoji: string; days: number } | null>(null);
  const [story, setStory] = useState<StorySession | null>(null);
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [myChar, setMyChar] = useState<CharId | null>(null);
  const together = daysTogether(world.relationship_start);
  const quote = todaysQuote();
  const goal = todaysGoal();

  // Read chosen 3D character from game localStorage.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("justus:character");
      if (saved && CHARACTER_DEFS.some((c) => c.id === saved)) setMyChar(saved as CharId);
    } catch {}
  }, []);

  useEffect(() => {
    const api = db();
    api
      .from("calendar_events")
      .select("*")
      .eq("world_id", world.id)
      .then(({ data }) => {
        const list = ((data ?? []) as CalendarEvent[]).map((e) => ({ title: e.title, emoji: e.emoji, days: daysUntil(e.event_date, e.yearly) }));
        if (world.relationship_start) list.push({ title: "Our anniversary", emoji: "💞", days: daysUntil(world.relationship_start, true) });
        setUpcoming(list.filter((x) => x.days >= 0).sort((a, b) => a.days - b.days)[0] ?? null);
      });
    api
      .from("story_sessions")
      .select("*")
      .eq("world_id", world.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .then(({ data }) => setStory((data?.[0] as StorySession) ?? null));
    const loadActivity = () =>
      api
        .from("activity")
        .select("*")
        .eq("world_id", world.id)
        .order("created_at", { ascending: false })
        .limit(4)
        .then(({ data }) => setActivity((data ?? []) as Activity[]));
    loadActivity();
    return onChange("activity", () => loadActivity());
  }, [world.id, world.relationship_start, onChange]);

  const storyMeta = story ? STORIES.find((s) => s.id === story.story_id) : null;
  const partnerOnline = partnerStatus === "online";
  const charDef = myChar ? CHARACTER_DEFS.find((c) => c.id === myChar) : null;

  return (
    <div className="space-y-4">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden rounded-3xl border border-line"
        style={{ background: "linear-gradient(160deg,#1a0e35 0%,#2d1550 40%,#1f0e2a 80%,#2a1220 100%)" }}
      >
        <Starfield count={40} />
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center">
          <div className="mb-0 h-48 w-72 rounded-full bg-[#e8789a]/10 blur-3xl" />
        </div>

        <div className="relative z-10 px-5 pb-0 pt-6 text-white">
          <p className="text-sm text-white/60">{greeting()}, {me.display_name}</p>
          <h1 className="mt-0.5 font-display text-3xl leading-tight text-white">{world.name}</h1>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {together !== null && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e2bd78]/15 px-3 py-0.5 text-sm font-semibold text-[#e2bd78]">
                ✦ {together.toLocaleString()} {together === 1 ? "day" : "days"} of us
              </span>
            )}
            {streak && (
              <span
                title={streak.today ? "You've both visited today" : "Visit together today to keep it going"}
                className="inline-flex items-center gap-1 rounded-full bg-orange-400/15 px-3 py-0.5 text-sm font-semibold text-orange-300"
              >
                🔥 {streak.streak}-day streak{streak.today ? "" : " · waiting for both of you today"}
              </span>
            )}
          </div>
        </div>

        {/* Avatars */}
        <div className="relative z-10 mt-3 flex items-end justify-center gap-4 px-6">
          {/* My side: 3D character badge + 2D profile */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[11px] font-semibold text-white/50">{me.display_name}</span>
            <div className="relative">
              <Character look={me.avatar} size={92} className="animate-bob drop-shadow-[0_4px_20px_rgba(232,120,154,0.4)]" />
              {charDef && (
                <span
                  title={`${charDef.label} · ${charDef.role}`}
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#1a0e35] bg-[#2d1550] text-base"
                >
                  {charDef.emoji}
                </span>
              )}
            </div>
          </div>
          <div className="mb-4 flex flex-col items-center">
            <span className="text-2xl">❤️</span>
          </div>
          {partner ? (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[11px] font-semibold text-white/50">{partner.display_name}</span>
              <Character
                look={partner.avatar}
                size={92}
                flip
                className={cn(
                  "animate-bob drop-shadow-[0_4px_20px_rgba(232,120,154,0.4)]",
                  !partnerOnline && "opacity-50 grayscale-[.5]",
                )}
              />
            </div>
          ) : (
            <div className="mb-4 flex h-[92px] w-[74px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 text-2xl text-white/20">
              ?
            </div>
          )}
        </div>

        {/* Love quote */}
        <div className="relative z-10 mt-3 border-t border-white/10 px-5 py-3">
          <p className="text-center text-[12px] italic text-white/45">&ldquo;{quote}&rdquo;</p>
        </div>
      </section>

      {milestone ? (
        <Link href="/city" className="block overflow-hidden rounded-2xl bg-gradient-to-r from-[#e8789a] via-[#c25ad6] to-[#e2bd78] p-[1px]">
          <div className="flex items-center gap-3 rounded-2xl bg-[#1e1036]/90 px-4 py-3">
            <span className="text-3xl">🎆</span>
            <div>
              <div className="font-display text-lg">Happy {milestone.label}! {milestone.emoji}</div>
              <div className="text-xs text-white/60">Fireworks are lighting up Lagos for you two tonight — go and watch together →</div>
            </div>
          </div>
        </Link>
      ) : (
        upcomingMilestone &&
        upcomingMilestone.in <= 30 && (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
            <span className="text-2xl">{upcomingMilestone.emoji}</span>
            <span>
              <b>{upcomingMilestone.label}</b> in {upcomingMilestone.in} {upcomingMilestone.in === 1 ? "day" : "days"} — there&apos;ll be fireworks over Lagos 🎆
            </span>
          </div>
        )
      )}

      {/* ── Partner status ────────────────────────────────────────────── */}
      {partner ? (
        <section
          className={cn(
            "overflow-hidden rounded-2xl border transition",
            partnerOnline ? "border-[#e8789a]/30 bg-gradient-to-r from-[#2d1220]/80 to-[#1e1240]/80" : "border-line bg-surface",
          )}
        >
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className={cn("mt-0.5 flex h-2.5 w-2.5 shrink-0 rounded-full", partnerOnline ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-white/20")} />
              <div>
                <div className="text-sm font-semibold">
                  {partner.display_name} {partnerOnline ? "is here 💞" : "is away"}
                </div>
                <div className="mt-0.5 text-xs text-ink-faint">
                  {partnerOnline ? partnerActivity ?? "Exploring Lagos" : "They'll see your love when they're back"}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {["💖", "🥰", "✨"].map((e) => (
                <button
                  key={e}
                  onClick={() => sendBurst(e)}
                  aria-label={`Send ${e} to ${partner.display_name}`}
                  className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-xl transition hover:scale-110 hover:bg-[#e8789a]/20 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          {partnerOnline && (
            <Link
              href="/city"
              className="flex w-full items-center justify-center gap-2 border-t border-[#e8789a]/15 bg-[#e8789a]/10 py-3 text-sm font-semibold text-rose transition hover:bg-[#e8789a]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose"
            >
              🌆 Explore Lagos together →
            </Link>
          )}
        </section>
      ) : role === "creator" ? (
        <InviteCard />
      ) : null}

      {/* ── Couple goal of the moment ─────────────────────────────────── */}
      <Link
        href="/city"
        className="flex items-center gap-3 rounded-2xl border border-dashed border-[#e2bd78]/30 bg-[#e2bd78]/5 p-4 transition hover:bg-[#e2bd78]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        <span className="text-3xl">{goal.emoji}</span>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gold">Couple goal</div>
          <div className="mt-0.5 text-sm font-semibold">{goal.text}</div>
        </div>
        <span className="ml-auto text-xs text-ink-faint">Lagos →</span>
      </Link>

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/city", emoji: "🌆", label: "Go to the city", sub: "Explore Lagos together", color: "hover:border-[#9b7de8]" },
          { href: "/room", emoji: "🛋️", label: "Our home", sub: "Decorate & hang out", color: "hover:border-rose" },
          { href: storyMeta ? `/stories/${storyMeta.id}` : "/stories", emoji: "📖", label: storyMeta ? "Continue story" : "Read a story", sub: storyMeta ? storyMeta.title : "Romance & adventure", color: "hover:border-gold" },
          { href: "/vault", emoji: "💌", label: "Memory vault", sub: "Photos & moments", color: "hover:border-[#7ad4e8]" },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "card group flex min-h-[100px] flex-col justify-between p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose",
              t.color,
            )}
          >
            <span className="text-3xl transition group-hover:scale-110">{t.emoji}</span>
            <div>
              <div className="text-sm font-semibold leading-tight">{t.label}</div>
              <div className="text-[11px] text-ink-faint">{t.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Daily love question ───────────────────────────────────────── */}
      <DailyCard kind="question" />

      {/* ── Quest + upcoming ─────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/play/quest"
          className="card block p-5 transition hover:border-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-gold">Daily Love Quest</span>
          <p className="mt-2 font-display text-lg">Complete today&apos;s quest together</p>
          <p className="mt-1 text-sm text-ink-soft">Earn ✦10 to unlock things for your home.</p>
        </Link>
        <Link
          href="/calendar"
          className="card block p-5 transition hover:border-rose focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-rose">Coming up</span>
          {upcoming ? (
            <>
              <p className="mt-2 font-display text-lg">{upcoming.emoji} {upcoming.title}</p>
              <p className="mt-1 text-sm text-ink-soft">
                {upcoming.days === 0 ? "Today! 🎉" : upcoming.days === 1 ? "Tomorrow" : `In ${upcoming.days} days`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">Add birthdays, anniversaries and plans to your love calendar.</p>
          )}
        </Link>
      </div>

      {/* ── Activity feed ─────────────────────────────────────────────── */}
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg">Lately</h2>
          <Link href="/timeline" className="text-sm font-semibold text-rose focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose">
            Timeline →
          </Link>
        </div>
        {activity === null ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-5" />)}</div>
        ) : activity.length === 0 ? (
          <p className="text-sm text-ink-faint">Your story together will be written here.</p>
        ) : (
          <ul className="space-y-2.5">
            {activity.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 text-sm">
                <span>
                  <b className="font-semibold">{nameOf(a.actor_id)}</b>{" "}
                  <span className="text-ink-soft">{a.summary}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-faint">{relativeTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
