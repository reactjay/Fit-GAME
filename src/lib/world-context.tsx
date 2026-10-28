"use client";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { db } from "@/lib/db/client";
import { LiveSocket } from "@/lib/live-socket";
import { setSoundEnabled } from "@/lib/sound";
import type { Preferences, Profile, World } from "@/lib/types";

export type PartnerStatus = "online" | "offline" | "connecting";
type Row = Record<string, unknown>;
export type ChangePayload = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Row; old: Row };
type ChangeHandler = (payload: ChangePayload) => void;
type BroadcastHandler = (payload: Record<string, unknown>) => void;

// Tables the server streams to members of this world (see db/migrations/003_realtime.sql).
export type WorldTable =
  | "messages"
  | "message_reads"
  | "calls"
  | "story_sessions"
  | "game_sessions"
  | "room_state"
  | "world_members"
  | "daily_rewards"
  | "world_rewards"
  | "activity"
  | "worlds"
  | "love_notes"
  | "cash_transfers"
  | "owned_vehicles"
  | "sleep_sessions"
  | "profiles";

type WorldContextValue = {
  world: World;
  me: Profile;
  partner: Profile | null;
  role: "creator" | "partner";
  prefs: Preferences;
  connection: "connected" | "connecting" | "offline";
  partnerStatus: PartnerStatus;
  partnerActivity: string | null;
  setActivity: (label: string) => void;
  onChange: (table: WorldTable, handler: ChangeHandler) => () => void;
  onBroadcast: (event: string, handler: BroadcastHandler) => () => void;
  /** Raw server messages (game: "ready", "seats", "pose", "seat-denied"). */
  onServer: (type: string, handler: (msg: Record<string, unknown>) => void) => () => void;
  sendServer: (msg: Record<string, unknown>) => boolean;
  /** Called after the live connection comes back, so pages can re-fetch anything they missed. */
  onResync: (handler: () => void) => () => void;
  broadcast: (event: string, payload: Record<string, unknown>) => void;
  updateMe: (p: Partial<Profile>) => void;
  updatePrefs: (p: Partial<Preferences>) => void;
  updateWorld: (w: Partial<World>) => void;
  nameOf: (userId: string | null | undefined) => string;
};

const WorldContext = createContext<WorldContextValue | null>(null);

export function useWorld() {
  const ctx = useContext(WorldContext);
  if (!ctx) throw new Error("useWorld must be used inside WorldProvider");
  return ctx;
}

/** Sets what this partner is "doing" (shown to the other one) while a page is mounted. */
export function useActivity(label: string) {
  const { setActivity } = useWorld();
  useEffect(() => {
    setActivity(label);
  }, [label, setActivity]);
}

export function WorldProvider(props: {
  world: World;
  me: Profile;
  partner: Profile | null;
  role: "creator" | "partner";
  prefs: Preferences;
  children: ReactNode;
}) {
  const router = useRouter();
  const [world, setWorld] = useState(props.world);
  const [me, setMe] = useState(props.me);
  const [partner, setPartner] = useState(props.partner);
  const [prefs, setPrefs] = useState(props.prefs);
  const [connection, setConnection] = useState<WorldContextValue["connection"]>("connecting");
  const [presence, setPresence] = useState<Record<string, { activity: string }>>({});
  const socket = useRef<LiveSocket | null>(null);
  const activityRef = useRef("Just arrived");
  const changeHandlers = useRef(new Map<string, Set<ChangeHandler>>());
  const broadcastHandlers = useRef(new Map<string, Set<BroadcastHandler>>());
  const resyncHandlers = useRef(new Set<() => void>());
  const serverHandlers = useRef(new Map<string, Set<(msg: Record<string, unknown>) => void>>());

  // Theme + motion preferences apply to <html> so every page picks them up.
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.dataset.motion = prefs.reduced_motion ? "reduced" : "full";
    setSoundEnabled(prefs.sound_enabled);
  }, [prefs.theme, prefs.reduced_motion, prefs.sound_enabled]);

  // Session expired (any API call got 401) → back to sign-in.
  useEffect(() => {
    const out = () => router.replace("/login?expired=1");
    window.addEventListener("justus:signed-out", out);
    return () => window.removeEventListener("justus:signed-out", out);
  }, [router]);

  // Live connection with automatic reconnect (backoff) and resync after gaps.
  useEffect(() => {
    const live = new LiveSocket({
      url: () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
      isOnline: () => navigator.onLine,
      onStatus: (s) => {
        setConnection(s);
        if (s !== "connected") setPresence({});
      },
      onOpen: (reconnected) => {
        live.send({ type: "track", activity: activityRef.current });
        if (reconnected) resyncHandlers.current.forEach((h) => h());
      },
      onAuthLost: () => router.replace("/login?expired=1"),
      onMessage: (msg) => {
        if (msg.type === "change") {
          const payload = { eventType: msg.eventType, new: msg.new, old: msg.old } as ChangePayload;
          if (msg.table === "worlds") setWorld((w) => ({ ...w, ...(payload.new as Partial<World>) }));
          changeHandlers.current.get(msg.table as string)?.forEach((h) => h(payload));
        } else if (msg.type === "broadcast") {
          broadcastHandlers.current.get(msg.event as string)?.forEach((h) => h((msg.payload as Record<string, unknown>) ?? {}));
        } else if (msg.type === "presence") {
          setPresence(msg.users as Record<string, { activity: string }>);
        }
        serverHandlers.current.get(msg.type)?.forEach((h) => h(msg));
      },
    });
    socket.current = live;
    live.start();
    const nudge = () => live.nudge();
    const onVisible = () => document.visibilityState === "visible" && live.nudge();
    const goOffline = () => setConnection("offline");
    window.addEventListener("online", nudge);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", nudge);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
      live.stop();
      socket.current = null;
    };
  }, [router]);

  // When the partner joins (invite accepted) load their profile without a reload.
  const partnerId = partner?.id ?? null;
  useEffect(() => {
    if (partnerId) return;
    return subscribe(changeHandlers.current, "world_members", async (p) => {
      const row = p.new as { user_id?: string };
      if (!row?.user_id || row.user_id === me.id) return;
      const { data } = await db().from<Profile[]>("profiles").select("id, display_name, avatar").eq("id", row.user_id).single();
      if (data) setPartner(data as unknown as Profile);
    });
  }, [partnerId, me.id]);

  const setActivity = useCallback((label: string) => {
    activityRef.current = label;
    socket.current?.send({ type: "track", activity: label });
  }, []);

  const onChange = useCallback((table: WorldTable, handler: ChangeHandler) => subscribe(changeHandlers.current, table, handler), []);
  const onBroadcast = useCallback((event: string, handler: BroadcastHandler) => subscribe(broadcastHandlers.current, event, handler), []);
  const onResync = useCallback((handler: () => void) => {
    resyncHandlers.current.add(handler);
    return () => {
      resyncHandlers.current.delete(handler);
    };
  }, []);
  const onServer = useCallback((type: string, handler: (msg: Record<string, unknown>) => void) => subscribe(serverHandlers.current, type, handler), []);
  const sendServer = useCallback((msg: Record<string, unknown>) => socket.current?.send(msg) ?? false, []);
  const broadcast = useCallback((event: string, payload: Record<string, unknown>) => {
    socket.current?.send({ type: "broadcast", event, payload });
  }, []);

  const partnerPresence = partnerId ? presence[partnerId] : undefined;
  const value = useMemo<WorldContextValue>(
    () => ({
      world,
      me,
      partner,
      role: props.role,
      prefs,
      connection,
      partnerStatus: connection !== "connected" ? "connecting" : partnerPresence ? "online" : "offline",
      partnerActivity: partnerPresence?.activity ?? null,
      setActivity,
      onChange,
      onBroadcast,
      onResync,
      onServer,
      sendServer,
      broadcast,
      updateMe: (p) => setMe((m) => ({ ...m, ...p })),
      updatePrefs: (p) => setPrefs((x) => ({ ...x, ...p })),
      updateWorld: (w) => setWorld((x) => ({ ...x, ...w })),
      nameOf: (id) => (id === me.id ? me.display_name : id && id === partner?.id ? partner.display_name : "Someone"),
    }),
    [world, me, partner, props.role, prefs, connection, partnerPresence, setActivity, onChange, onBroadcast, onResync, onServer, sendServer, broadcast],
  );

  return <WorldContext.Provider value={value}>{props.children}</WorldContext.Provider>;
}

function subscribe<T>(map: Map<string, Set<T>>, key: string, handler: T) {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(handler);
  return () => {
    set!.delete(handler);
  };
}
