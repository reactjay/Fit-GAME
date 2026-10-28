"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { sfx } from "@/lib/sound";
import { db } from "@/lib/db/client";
import type { GameAnswer, GameName, GameSession } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import { useWorld } from "@/lib/world-context";

/** Picks a prompt not used recently (falls back to any once the bank is exhausted). */
export function nextPrompt<T extends { id: string }>(bank: T[], used: string[], current?: string) {
  const fresh = bank.filter((p) => !used.includes(p.id) && p.id !== current);
  const pool = fresh.length ? fresh : bank.filter((p) => p.id !== current);
  return pool[Math.floor(Math.random() * pool.length)] ?? bank[0];
}

/**
 * Shared, realtime game state. All writes go through RPCs that are idempotent
 * per round, so double taps, simultaneous answers and reconnects are safe.
 */
export function useGame(game: GameName) {
  const { world, onChange, onResync, me } = useWorld();
  const api = db();
  const [session, setSession] = useState<GameSession | null | undefined>(undefined);
  const [answers, setAnswers] = useState<GameAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Several events can trigger overlapping fetches; only the newest response is applied.
  const latest = useRef(0);
  const loadAnswers = useCallback(
    async (s: GameSession) => {
      const ticket = ++latest.current;
      const { data } = await api.from("game_answers").select("*").eq("session_id", s.id).eq("round", s.round);
      if (ticket === latest.current) setAnswers((data ?? []) as GameAnswer[]);
    },
    [api],
  );

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await api.from("game_sessions").select("*").eq("world_id", world.id).eq("game", game).maybeSingle();
    if (error) return setError(errorMessage(error));
    setSession((data as GameSession) ?? null);
    if (data) loadAnswers(data as GameSession);
  }, [api, world.id, game, loadAnswers]);

  useEffect(() => {
    load();
    const off = onChange("game_sessions", (p) => {
      const row = p.new as GameSession;
      if (row?.game !== game) return;
      setSession((prev) => {
        if (prev && row.state === "revealed" && prev.state !== "revealed") sfx.chime();
        return row;
      });
      loadAnswers(row);
    });
    // Re-sync after the tab wakes up or the network returns.
    const resync = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", load);
    const offResync = onResync(load);
    return () => {
      off();
      offResync();
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("online", load);
    };
  }, [load, onChange, onResync, game, loadAnswers]);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      setBusy(true);
      const { data, error } = await api.rpc(fn, args);
      setBusy(false);
      if (error) {
        toast(errorMessage(error), "error");
        return null;
      }
      const s = data as GameSession;
      setSession(s);
      loadAnswers(s);
      return s;
    },
    [api, loadAnswers],
  );

  // Safety net: a revealed round must show both answers.
  const revealedMissing = session?.state === "revealed" && answers.filter((a) => a.round === session.round).length < 2;
  useEffect(() => {
    if (!revealedMissing || !session) return;
    const t = setTimeout(() => loadAnswers(session), 400);
    return () => clearTimeout(t);
  }, [revealedMissing, session, loadAnswers]);

  return {
    session,
    answers,
    busy,
    error,
    reload: load,
    myAnswer: answers.find((a) => a.user_id === me.id),
    start: (prompt: string, subject?: string) => call("game_start", { p_game: game, p_prompt: prompt, p_subject: subject ?? null }),
    submit: (answer: Record<string, unknown>) => session && call("game_submit", { p_session: session.id, p_round: session.round, p_answer: answer }),
    next: (prompt: string, subject?: string) => session && call("game_next", { p_session: session.id, p_round: session.round, p_prompt: prompt, p_subject: subject ?? null }),
    judge: (correct: boolean) => session && call("game_judge", { p_session: session.id, p_round: session.round, p_correct: correct }),
  };
}
