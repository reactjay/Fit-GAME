"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PrivateImage } from "@/components/media/private-image";
import { AvatarEditor } from "@/components/room/avatar-editor";
import { useSendBurst } from "@/components/ui/bursts";
import { Button, EmptyState, ErrorNote, Sheet, Tabs } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import type { AnimId, ModelId } from "@/game/actors/Avatar";
import { FURNITURE_IDS, emoteMe, home, houseApi, partnerLeft, partnerPose, setTv } from "@/home/state";
import { db } from "@/lib/db/client";
import { dateMusic, sfx } from "@/lib/sound";
import { useStreak } from "@/lib/streak";
import type { DecorItem, RoomState } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { useActivity, useWorld } from "@/lib/world-context";

const House = dynamic(() => import("@/home/House").then((m) => m.House), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });

const WALLPAPERS: Record<string, string> = { plum: "Midnight plum", rose: "Rose", stars: "Starry indigo", cream: "Warm cream", sage: "Sage calm", ankara: "Ankara clay" };
const AMBIENCE: Record<string, string> = { cozy: "Sunny day", sunset: "Lagos sunset", stars: "Starry night", rain: "Rainy day" };
const MODELS: ModelId[] = ["amara", "kofi", "emeka", "musa", "tunde", "chidi", "ngozi", "bisi"];
const ROMANCE: { label: string; anim: AnimId }[] = [
  { label: "💋 Kiss", anim: "wave" },
  { label: "🤗 Hug", anim: "clap" },
  { label: "💃 Dance", anim: "run" },
];

import { SleepModal } from "@/components/room/sleep-modal";

export default function RoomPage() {
  useActivity("At home together 🏡");
  const { world, me, partner, role, onChange, onResync, updateWorld, broadcast, onBroadcast } = useWorld();
  const api = db();
  const sendBurst = useSendBurst();
  const streak = useStreak((points) => updateWorld({ points }));
  const [room, setRoom] = useState<RoomState | null>(null);
  const [items, setItems] = useState<DecorItem[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"style" | "photos" | "me">("style");
  const [shopOpen, setShopOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [activeBedName, setActiveBedName] = useState("Bed");
  const [placing, setPlacing] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [azimuth, setAzimuth] = useState(-0.55);
  const [radio, setRadio] = useState(false);
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [partnerHome, setPartnerHome] = useState(false);
  const [close, setClose] = useState(false);
  const [clock, setClock] = useState("");
  const [myModel] = useState<ModelId>(() => {
    try {
      const saved = localStorage.getItem("justus:character") as ModelId | null;
      if (saved && MODELS.includes(saved)) return saved;
    } catch {}
    return role === "creator" ? "amara" : "kofi";
  });

  const load = useCallback(async () => {
    setError(null);
    const [r, d, o] = await Promise.all([
      api.from("room_state").select("*").eq("world_id", world.id).single(),
      api.from("decor_items").select("*").order("cost"),
      api.from("world_rewards").select("item_id").eq("world_id", world.id),
    ]);
    if (r.error) return setError(errorMessage(r.error));
    setRoom(r.data as RoomState);
    setItems((d.data ?? []) as DecorItem[]);
    setOwned(new Set((o.data ?? []).map((x) => x.item_id as string)));
  }, [api, world.id]);

  useEffect(() => {
    load();
    const a = onChange("room_state", (p) => setRoom(p.new as RoomState));
    const b = onChange("world_rewards", (p) => setOwned((s) => new Set([...s, (p.new as { item_id: string }).item_id])));
    const c = onResync(load);
    return () => (a(), b(), c());
  }, [load, onChange, onResync]);

  // ── live presence in the house ──
  useEffect(() => {
    const anim = (): AnimId => {
      const m = home.me;
      if (m.path.length) return "walk";
      if (m.emote && performance.now() / 1000 < m.emote.until) return m.emote.anim;
      return m.seat ? "sit" : "idle";
    };
    const send = setInterval(() => {
      const m = home.me;
      broadcast("home:p", { x: +m.x.toFixed(2), z: +m.z.toFixed(2), ry: +m.ry.toFixed(2), anim: anim(), model: myModel, seat: m.seat });
      const p = home.partner;
      const here = Boolean(p && Date.now() - p.seen < 4000);
      setPartnerHome(here);
      setClose(here && Math.hypot(p!.sx - m.x, p!.sz - m.z) < 2.6);
    }, 125);
    const offs = [
      onBroadcast("home:p", (p) => {
        if (p.from === me.id) return;
        const x = Number(p.x), z = Number(p.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        const fresh = partnerPose({ x, z, ry: Number(p.ry) || 0, anim: String(p.anim ?? "idle") as AnimId, model: String(p.model ?? (role === "creator" ? "kofi" : "amara")), seat: (p.seat as string) ?? null });
        if (fresh) toast(`${partner?.display_name ?? "Your partner"} is home 💞`, "ok");
      }),
      onBroadcast("home:leave", (p) => {
        if (p.from !== me.id) partnerLeft();
      }),
      onBroadcast("home:romance", (p) => {
        if (p.from === me.id) return;
        emoteMe(String(p.anim) as AnimId);
        sfx.romance();
        toast(`${partner?.display_name ?? "💞"} · ${String(p.label)}`, "ok");
      }),
      onBroadcast("home:tv", (p) => setTv(Boolean(p.on))),
      onBroadcast("home:radio", (p) => setRadio(Boolean(p.on))),
    ];
    return () => {
      clearInterval(send);
      offs.forEach((o) => o());
      broadcast("home:leave", {});
      partnerLeft(true);
    };
  }, [broadcast, onBroadcast, me.id, myModel, role, partner?.display_name]);

  useEffect(() => {
    if (radio) dateMusic.start("dinner");
    else dateMusic.stop();
    return () => dateMusic.stop();
  }, [radio]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 20000);
    return () => clearInterval(t);
  }, []);

  async function save(patch: Partial<RoomState>) {
    if (!room) return;
    const prev = room;
    const next = { ...room, ...patch };
    setRoom(next);
    const { error } = await api
      .from("room_state")
      .update({ wallpaper: next.wallpaper, ambience: next.ambience, placed: next.placed, photo_paths: next.photo_paths, updated_by: me.id })
      .eq("world_id", world.id);
    if (error) {
      setRoom(prev);
      toast(errorMessage(error), "error");
    }
  }

  async function unlock(item: DecorItem) {
    const { data, error } = await api.rpc("unlock_decor", { p_item: item.id });
    if (error) return toast(errorMessage(error), "error");
    const r = data as { ok: boolean; points: number };
    updateWorld({ points: r.points });
    if (!r.ok) return toast(`You need ✦${item.cost - r.points} more. Keep your streak, play games and quests to earn love points!`, "error");
    sfx.reward();
    setOwned((s) => new Set([...s, item.id]));
    toast(`${item.emoji} ${item.name} is yours! Tap Place to put it somewhere.`, "gold");
  }

  const onSlot = (slot: number) => {
    if (!room) return;
    if (placing) {
      const placed = room.placed.filter((p) => p.slot !== slot && p.item !== placing);
      save({ placed: [...placed, { slot, item: placing }] });
      sfx.pop();
      setPlacing(null);
      return;
    }
    if (removing) {
      if (!room.placed.some((p) => p.slot === slot)) return;
      save({ placed: room.placed.filter((p) => p.slot !== slot) });
      sfx.pop();
    }
  };

  const toggleRadio = () => {
    setRadio(!radio);
    broadcast("home:radio", { on: !radio });
  };

  const romance = (r: (typeof ROMANCE)[number]) => {
    emoteMe(r.anim);
    sfx.romance();
    broadcast("home:romance", { anim: r.anim, label: r.label });
  };

  useEffect(() => {
    if (panel !== "photos" || photos) return;
    api
      .from("media")
      .select("path")
      .eq("world_id", world.id)
      .eq("kind", "image")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setPhotos((data ?? []).map((x) => x.path as string)));
  }, [panel, photos, api, world.id]);

  const emojiById = useMemo(() => new Map(items.map((i) => [i.id, i.emoji])), [items]);
  const furniture = items.filter((i) => FURNITURE_IDS.has(i.id));
  const touches = items.filter((i) => !FURNITURE_IDS.has(i.id));

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!room) return <div className="skeleton h-[70dvh] w-full rounded-3xl" />;

  const chip = "pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 text-[13px] font-semibold text-[#1a1030] shadow-md backdrop-blur";
  const side = "pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white/90 text-lg text-[#1a1030] shadow-md transition hover:scale-105 active:scale-95";

  return (
    <>
      <section className="relative h-[72dvh] min-h-[480px] w-full overflow-hidden rounded-3xl border border-line bg-[#cfe7f5]" aria-label="Our home in 3D">
        <House
          placed={room.placed}
          emojiOf={(id) => emojiById.get(id)}
          wallpaper={room.wallpaper}
          ambience={room.ambience}
          photos={room.photo_paths}
          myModel={myModel}
          placing={placing}
          removing={removing}
          onSlot={onSlot}
          azimuth={azimuth}
          onAction={(a, key) => {
            if (a === "tv") broadcast("home:tv", { on: home.tvOn });
            if (a === "radio") toggleRadio();
            if (a === "piano") sfx.piano();
            if (a === "sleep") {
              const def = items.find((it) => it.id === key);
              setActiveBedName(def?.name ?? "Bed");
              setSleepOpen(true);
            }
          }}
        />

        <div className="pointer-events-none absolute inset-0">
          {/* top status bar */}
          <div className="absolute inset-x-0 top-3 flex justify-center px-3">
            <div className="pointer-events-auto flex max-w-full items-center gap-3 overflow-x-auto rounded-full bg-white/95 px-4 py-2 text-[13px] font-medium text-[#1a1030] shadow-lg backdrop-blur">
              <span className="whitespace-nowrap font-semibold">☀️ {clock}</span>
              <span className="whitespace-nowrap text-orange-500 font-semibold">🔥 {streak?.streak ?? 0}</span>
              <span className="whitespace-nowrap font-bold text-gold">✦ {world.points}</span>
            </div>
          </div>

          {/* partner presence */}
          {partner && (
            <div className="absolute left-3 top-16 flex flex-col items-start gap-2">
              {partnerHome ? (
                <button className={chip} onClick={() => houseApi.walkToPartner()}>
                  💞 {partner.display_name} is home
                </button>
              ) : (
                <button
                  className={chip}
                  onClick={() => {
                    sendBurst("🏡");
                    toast(`Invite sent — ${partner.display_name} will see a 🏡`, "ok");
                  }}
                >
                  💌 Invite {partner.display_name} home
                </button>
              )}
            </div>
          )}

          {/* right-side actions */}
          <div className="absolute bottom-20 right-3 flex flex-col items-end gap-2">
            <button className={side} title="Turn the view" aria-label="Turn the view" onClick={() => setAzimuth((a) => a + Math.PI / 2)}>
              ↻
            </button>
            <button className={side} title="Sleep / Rest" aria-label="Sleep / Rest" onClick={() => setSleepOpen(true)}>
              💤
            </button>
            <button className={side} title="Eat together" aria-label="Eat together" onClick={() => houseApi.eat()}>
              🍽️
            </button>
            <button className={cn(side, removing && "bg-[#ff6b6b] text-white")} title="Move / remove furniture" aria-label="Move or remove furniture" onClick={() => (setPlacing(null), setRemoving((r) => !r))}>
              ✏️
            </button>
            <button
              className={cn(chip, radio && "bg-[#e8789a] text-white")}
              onClick={toggleRadio}
            >
              📻 Radio
            </button>
            <Link href="/city" className={chip}>
              🚪 Lagos City
            </Link>
          </div>

          {/* romance bar when you're close */}
          {close && !placing && !removing && (
            <div className="absolute inset-x-0 bottom-20 flex justify-center gap-2">
              {ROMANCE.map((r) => (
                <button key={r.label} onClick={() => romance(r)} className="pointer-events-auto rounded-full bg-gradient-to-r from-[#e8789a] to-[#9b5de5] px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:scale-105 active:scale-95">
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {(placing || removing) && (
            <div className="absolute inset-x-0 top-16 flex justify-center px-3">
              <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-[#1a1030]/85 px-4 py-2 text-sm text-white shadow-lg">
                {placing ? `Tap a glowing spot to place ${emojiById.get(placing) ?? ""}` : "Tap furniture to remove it"}
                <button className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs" onClick={() => (setPlacing(null), setRemoving(false))}>
                  Done
                </button>
              </div>
            </div>
          )}

          {/* bottom nav */}
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <nav className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/95 p-1.5 shadow-lg">
              <button className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-emerald-700" onClick={() => (setShopOpen(false), setPlacing(null), setRemoving(false))}>
                🏠 Home
              </button>
              <button className="rounded-full px-3 py-2 text-xs sm:text-sm font-semibold text-[#1a1030] hover:bg-black/5" onClick={() => setSleepOpen(true)}>
                💤 Sleep
              </button>
              <button className="rounded-full px-3 py-2 text-xs sm:text-sm font-semibold text-[#1a1030] hover:bg-black/5" onClick={() => setShopOpen(true)}>
                🛋️ Furniture
              </button>
              <Link href="/city" className="rounded-full px-3 py-2 text-xs sm:text-sm font-semibold text-[#1a1030] hover:bg-black/5">
                🗺️ Lagos
              </Link>
            </nav>
          </div>
        </div>
      </section>
      <p className="mt-2 text-center text-xs text-ink-faint">Tap the floor to walk · tap a sofa, bed or the kitchen island to sit together · drag to look around</p>

      <div className="mt-4">
        <Tabs
          value={panel}
          onChange={setPanel}
          items={[
            { id: "style", label: "Style" },
            { id: "photos", label: "Photo wall" },
            { id: "me", label: "My look" },
          ]}
        />
        {panel === "style" && (
          <div className="space-y-5">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink-soft">Walls</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(WALLPAPERS).map(([id, name]) => (
                  <button key={id} onClick={() => save({ wallpaper: id })} aria-pressed={room.wallpaper === id} className={cn("min-h-10 rounded-full px-4 text-sm font-semibold", room.wallpaper === id ? "bg-ink text-bg" : "bg-surface text-ink-soft")}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink-soft">Outside</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(AMBIENCE).map(([id, name]) => (
                  <button key={id} onClick={() => save({ ambience: id })} aria-pressed={room.ambience === id} className={cn("min-h-10 rounded-full px-4 text-sm font-semibold", room.ambience === id ? "bg-ink text-bg" : "bg-surface text-ink-soft")}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-ink-faint">Changes sync instantly — your partner sees the house change as you decorate.</p>
          </div>
        )}
        {panel === "photos" && (
          <div>
            <p className="mb-3 text-sm text-ink-soft">Choose up to six photos to hang in the living room.</p>
            {photos === null ? (
              <div className="grid grid-cols-4 gap-2">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton aspect-square" />)}</div>
            ) : photos.length === 0 ? (
              <EmptyState emoji="🖼️" title="No photos yet">Take couple photos in Lagos, send them in chat or save them in the vault first.</EmptyState>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {photos.map((p) => {
                  const on = room.photo_paths.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => {
                        if (!on && room.photo_paths.length >= 6) return toast("The wall holds six photos — remove one first.");
                        save({ photo_paths: on ? room.photo_paths.filter((x) => x !== p) : [...room.photo_paths, p] });
                      }}
                      aria-pressed={on}
                      className={cn("relative aspect-square overflow-hidden rounded-xl border-2", on ? "border-gold" : "border-transparent")}
                    >
                      <PrivateImage path={p} alt="" className="h-full w-full" />
                      {on && <span className="absolute right-1 top-1 rounded-full bg-gold px-1.5 text-xs font-bold text-[#2a1d05]">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {panel === "me" && <AvatarEditor />}
      </div>

      <Sheet open={shopOpen} onClose={() => setShopOpen(false)} title={`Furniture · ✦${world.points}`} wide>
        {[
          ["Furniture", furniture],
          ["Little touches", touches],
        ].map(([title, list]) => (
          <div key={title as string} className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">{title as string}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(list as DecorItem[]).map((i) => {
                const has = owned.has(i.id);
                const placedHere = room.placed.some((p) => p.item === i.id);
                return (
                  <div key={i.id} className="card flex items-center gap-3 p-3">
                    <span className="text-3xl">{i.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{i.name}</div>
                      {has ? <div className="text-xs text-ok">{placedHere ? "In your home" : "Owned"}</div> : <div className="text-xs text-gold">✦ {i.cost}</div>}
                    </div>
                    {has ? (
                      <Button size="sm" variant="soft" onClick={() => (setRemoving(false), setPlacing(i.id), setShopOpen(false))}>
                        {placedHere ? "Move" : "Place"}
                      </Button>
                    ) : (
                      <Button size="sm" variant={world.points >= i.cost ? "gold" : "soft"} onClick={() => unlock(i)}>
                        Buy
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <p className="text-sm text-ink-faint">Earn love points from your daily streak 🔥, the Daily Love Quest, questions and games.</p>
      </Sheet>

      <SleepModal open={sleepOpen} onClose={() => setSleepOpen(false)} bedName={activeBedName} />
    </>
  );
}
