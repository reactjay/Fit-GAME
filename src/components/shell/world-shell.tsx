"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CallScreen } from "@/components/call/call-screen";
import { Avatar } from "@/components/ui/avatar";
import { BurstLayer } from "@/components/ui/bursts";
import {
  IconBook,
  IconCalendar,
  IconChat,
  IconClock,
  IconHome,
  IconImage,
  IconMap,
  IconMore,
  IconMusic,
  IconPhone,
  IconPlay,
  IconSettings,
  IconSofa,
  IconVault,
} from "@/components/ui/icons";
import { IconButton, Sheet } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { CallProvider, useCall } from "@/lib/call/call-provider";
import { notify } from "@/lib/notify";
import { sfx } from "@/lib/sound";
import { db } from "@/lib/db/client";
import type { Message, Preferences, Profile, World } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WorldProvider, useWorld } from "@/lib/world-context";
import { GIFTS } from "@/content/gifts";

const PRIMARY = [
  { href: "/home", label: "Home", icon: IconHome },
  { href: "/city", label: "Lagos", icon: IconMap },
  { href: "/room", label: "Apartment", icon: IconSofa },
  { href: "/chat", label: "Chat", icon: IconChat },
  { href: "/play", label: "Play", icon: IconPlay },
];
const SECONDARY = [
  { href: "/stories", label: "Storybook", icon: IconBook },
  { href: "/vault", label: "Memory Vault", icon: IconVault },
  { href: "/gallery", label: "Gallery", icon: IconImage },
  { href: "/calendar", label: "Love Calendar", icon: IconCalendar },
  { href: "/music", label: "Music Corner", icon: IconMusic },
  { href: "/timeline", label: "Our Timeline", icon: IconClock },
  { href: "/settings", label: "Settings", icon: IconSettings },
];

export function WorldShell(props: { world: World; me: Profile; partner: Profile | null; role: "creator" | "partner"; prefs: Preferences; children: ReactNode }) {
  return (
    <WorldProvider world={props.world} me={props.me} partner={props.partner} role={props.role} prefs={props.prefs}>
      <CallProvider>
        <Frame>{props.children}</Frame>
        <CallScreen />
        <BurstLayer />
        <MessageWatcher />
      </CallProvider>
    </WorldProvider>
  );
}

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const unread = useUnread();
  const fullBleed = path.startsWith("/chat");
  // The 3D world is a full-screen game: no app chrome around it.
  if (path.startsWith("/city")) return <>{children}</>;

  return (
    <div className="flex min-h-dvh">
      {/* desktop / tablet sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-raised/60 p-4 md:flex">
        <Link href="/home" className="mb-6 px-2 font-display text-2xl flex items-center justify-between">
          <span>JustUs</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose/15 text-rose font-sans font-bold">Lagos</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin" aria-label="Main">
          {[...PRIMARY, ...SECONDARY].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(path, item.href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition",
                isActive(path, item.href) ? "bg-surface-2 text-ink" : "text-ink-soft hover:bg-surface hover:text-ink",
              )}
            >
              <item.icon size={20} />
              {item.label}
              {item.href === "/chat" && unread > 0 && <Badge n={unread} />}
            </Link>
          ))}
        </nav>
        <div className="pt-2 border-t border-line">
          <PointsChip />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" className={cn("flex-1", fullBleed ? "flex flex-col" : "mx-auto w-full max-w-3xl px-4 pb-28 pt-4 md:pb-10")}>
          {children}
        </main>
      </div>

      {/* mobile bottom navigation matching Lagos Life */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg items-center">
          <Link
            href="/home"
            aria-current={isActive(path, "/home") ? "page" : undefined}
            className={cn("relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold", isActive(path, "/home") ? "text-rose" : "text-ink-faint")}
          >
            <IconHome size={22} />
            Home
          </Link>
          <Link
            href="/city"
            aria-current={isActive(path, "/city") ? "page" : undefined}
            className={cn("relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold", isActive(path, "/city") ? "text-rose" : "text-ink-faint")}
          >
            <IconMap size={22} />
            Lagos
          </Link>
          <Link
            href="/room"
            aria-current={isActive(path, "/room") ? "page" : undefined}
            className={cn("relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold", isActive(path, "/room") ? "text-rose" : "text-ink-faint")}
          >
            <IconSofa size={22} />
            Room
          </Link>
          <Link
            href="/play"
            aria-current={isActive(path, "/play") ? "page" : undefined}
            className={cn("relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold", isActive(path, "/play") ? "text-rose" : "text-ink-faint")}
          >
            <IconPlay size={22} />
            Play
          </Link>
          <Link
            href="/chat"
            aria-current={isActive(path, "/chat") ? "page" : undefined}
            className={cn("relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold", isActive(path, "/chat") ? "text-rose" : "text-ink-faint")}
          >
            <IconChat size={22} />
            Chat
            {unread > 0 && <Badge n={unread} className="absolute right-[14%] top-2" />}
          </Link>
          <button
            onClick={() => setMore(true)}
            className={cn("flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold", SECONDARY.some((s) => isActive(path, s.href)) ? "text-rose" : "text-ink-faint")}
          >
            <IconMore size={22} />
            More
          </button>
        </div>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="Our world">
        <div className="grid grid-cols-2 gap-2">
          {SECONDARY.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMore(false)} className="card flex min-h-20 flex-col justify-center gap-2 p-4 text-sm font-semibold">
              <item.icon className="text-rose" />
              {item.label}
            </Link>
          ))}
        </div>
        <div className="mt-4">
          <PointsChip />
        </div>
      </Sheet>
    </div>
  );
}

function PointsChip() {
  const { world } = useWorld();
  return (
    <Link href="/room" className="flex items-center justify-between rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5 text-xs">
      <span className="text-ink-soft">Love points</span>
      <span className="font-display font-bold text-sm text-gold">✦ {world.points}</span>
    </Link>
  );
}

function TopBar() {
  const { world, partner, partnerStatus, partnerActivity, connection } = useWorld();
  const { startCall, phase } = useCall();
  const statusText = !partner
    ? "Waiting for your partner to join"
    : partnerStatus === "online"
      ? partnerActivity ?? "Online"
      : partnerStatus === "connecting"
        ? "Connecting…"
        : "Offline";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      {connection === "offline" && <div className="bg-danger/15 py-1 text-center text-xs font-semibold text-danger">You&apos;re offline — we&apos;ll reconnect automatically.</div>}
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Avatar look={partner?.avatar} size={36} status={partner ? partnerStatus : undefined} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{partner?.display_name ?? "Just you, for now"}</div>
          <div className="truncate text-xs text-ink-faint">{statusText}</div>
        </div>

        {/* Points indicator */}
        <Link
          href="/room"
          className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold hover:bg-gold/20 transition shadow-sm"
        >
          <span>✦</span>
          <span>{world.points}</span>
        </Link>

        {partner && (
          <IconButton label="Voice call" onClick={() => startCall("audio")} disabled={phase !== "idle"}>
            <IconPhone />
          </IconButton>
        )}
      </div>
    </header>
  );
}

function Badge({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("ml-auto grid min-w-5 place-items-center rounded-full bg-rose-strong px-1.5 text-[11px] font-bold leading-5 text-[var(--bubble-me-ink)]", className)}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Unread partner messages, for the Chat badge. */
function useUnread() {
  const { world, me, onChange } = useWorld();
  const path = usePathname();
  const [count, setCount] = useState(0);
  const onChat = path.startsWith("/chat");

  useEffect(() => {
    if (onChat) return;
    let alive = true;
    const api = db();
    (async () => {
      const { data: read } = await api.from("message_reads").select("last_read_at").eq("world_id", world.id).eq("user_id", me.id).maybeSingle();
      let q = api.from("messages").select("id", { count: "exact", head: true }).eq("world_id", world.id).neq("sender_id", me.id);
      if (read?.last_read_at) q = q.gt("created_at", read.last_read_at);
      const { count } = await q;
      if (alive) setCount(count ?? 0);
    })();
    const off = onChange("messages", (p) => {
      if (p.eventType === "INSERT" && (p.new as Message).sender_id !== me.id) setCount((c) => c + 1);
    });
    return () => {
      alive = false;
      off();
    };
  }, [onChat, world.id, me.id, onChange]);

  return onChat ? 0 : count;
}

/** Sound, toast and background notification for partner messages and gifts. */
function MessageWatcher() {
  const { me, onChange, prefs, nameOf } = useWorld();
  const path = usePathname();
  useEffect(() => {
    return onChange("messages", (p) => {
      if (p.eventType !== "INSERT") return;
      const msg = p.new as Message;
      if (msg.sender_id === me.id || msg.kind === "call") return;
      if (msg.kind === "gift") {
        const gift = GIFTS.find((g) => g.id === msg.body);
        window.dispatchEvent(new CustomEvent("justus:burst", { detail: gift?.emoji ?? "🎁" }));
        sfx.chime();
        toast(`${nameOf(msg.sender_id)} sent you ${gift?.name ?? "a gift"} ${gift?.emoji ?? ""}`, "gold");
        return;
      }
      const preview = msg.kind === "image" ? "📷 Photo" : msg.kind === "voice" ? "🎙️ Voice note" : (msg.body ?? "").slice(0, 80);
      if (document.visibilityState === "visible") {
        sfx.pop();
        if (!path.startsWith("/chat")) toast(`${nameOf(msg.sender_id)}: ${preview}`);
      } else if (prefs.notify_messages) {
        notify(nameOf(msg.sender_id), preview);
      }
    });
  }, [me.id, onChange, prefs.notify_messages, nameOf, path]);
  return null;
}
