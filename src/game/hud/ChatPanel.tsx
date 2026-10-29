"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { VoicePlayer, VoiceRecorder } from "@/components/chat/voice";
import { PrivateImage } from "@/components/media/private-image";
import { toast } from "@/components/ui/toast";
import { db } from "@/lib/db/client";
import type { Message } from "@/lib/types";
import { uploadMedia } from "@/lib/upload";
import { cn, errorMessage, timeLabel, uuid } from "@/lib/utils";
import { useWorld } from "@/lib/world-context";

/** Compact in-game chat: same private conversation as the Chat page, while you explore. */
export function ChatPanel() {
  const { world, me, onChange, nameOf } = useWorld();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await db().from("messages").select("*").eq("world_id", world.id).order("created_at", { ascending: false }).limit(30);
    setMsgs(((data ?? []) as Message[]).reverse());
  }, [world.id]);

  useEffect(() => {
    load();
    return onChange("messages", (p) => {
      const row = p.new as Message;
      if (!row?.id) return;
      setMsgs((cur) => [...cur.filter((m) => m.client_id !== row.client_id), row].slice(-40));
    });
  }, [load, onChange]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const { error } = await db().from("messages").insert({ world_id: world.id, sender_id: me.id, client_id: uuid(), kind: "text", body: body.slice(0, 4000) });
    if (error) {
      setText(body);
      toast(error.message, "error");
    }
  }

  async function sendVoice(blob: Blob, ms: number) {
    setRecording(false);
    try {
      const { path } = await uploadMedia({ worldId: world.id, userId: me.id, blob, kind: "voice", meta: { duration_ms: ms } });
      await db().from("messages").insert({ world_id: world.id, sender_id: me.id, client_id: uuid(), kind: "voice", media_path: path, media_meta: { duration_ms: ms } });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="flex h-[52dvh] flex-col sm:h-[420px]">
      <div ref={list} className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2 text-[13px]">
        {msgs.map((m) => {
          const mine = m.sender_id === me.id;
          return (
            <div key={m.client_id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3 py-1.5", mine ? "bg-[#e8789a] text-[#1a0d1a]" : "bg-white/12 bg-white/10")}>
                {m.deleted_at ? (
                  <i className="opacity-60">Message unsent</i>
                ) : m.kind === "image" ? (
                  <PrivateImage path={m.media_path} alt="Shared photo" className="h-32 w-44 rounded-lg" />
                ) : m.kind === "video" ? (
                  <span className="opacity-90">📹 Video</span>
                ) : m.kind === "voice" ? (
                  <VoicePlayer path={m.media_path} durationMs={m.media_meta?.duration_ms} mine={mine} />
                ) : m.kind === "call" ? (
                  <span className="opacity-70">📞 Call</span>
                ) : m.kind === "gift" ? (
                  <span>🎁 Gift</span>
                ) : (
                  <span className="whitespace-pre-wrap break-words">{m.body}</span>
                )}
              </div>
              <span className="px-1 text-[10px] text-white/40">
                {mine ? "" : `${nameOf(m.sender_id)} · `}
                {timeLabel(m.created_at)}
              </span>
            </div>
          );
        })}
        {msgs.length === 0 && <p className="py-6 text-center text-white/50">Say hello while you explore 💌</p>}
      </div>
      <form onSubmit={send} className="flex items-center gap-1.5 border-t border-white/10 p-2">
        {recording ? (
          <VoiceRecorder onDone={sendVoice} onCancel={() => setRecording(false)} onError={(m) => (toast(m, "error"), setRecording(false))} />
        ) : (
          <>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message…"
              maxLength={4000}
              className="h-10 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
            />
            <button type="button" onClick={() => setRecording(true)} aria-label="Record voice note" className="grid h-10 w-10 place-items-center rounded-full bg-white/10">
              🎙️
            </button>
            <button type="submit" aria-label="Send" className="grid h-10 w-10 place-items-center rounded-full bg-[#e8789a] text-[#1a0d1a]">
              ➤
            </button>
          </>
        )}
      </form>
      <Link href="/chat" className="pb-2 text-center text-[11px] text-white/50 underline">
        Open full chat
      </Link>
    </div>
  );
}
