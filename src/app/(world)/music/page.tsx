"use client";
import { useCallback, useEffect, useState } from "react";
import { IconTrash } from "@/components/ui/icons";
import { Button, EmptyState, ErrorNote, Field, IconButton, PageHeader, inputClass } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { parseMusicUrl } from "@/lib/music";
import { db } from "@/lib/db/client";
import type { MusicLink } from "@/lib/types";
import { cn, errorMessage, relativeTime } from "@/lib/utils";
import { useActivity, useWorld } from "@/lib/world-context";

export default function MusicPage() {
  useActivity("In the Music Corner 🎶");
  const { world, me, nameOf } = useWorld();
  const api = db();
  const [links, setLinks] = useState<MusicLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await api.from("music_links").select("*").eq("world_id", world.id).order("created_at", { ascending: false });
    if (error) return setError(errorMessage(error));
    setLinks((data ?? []) as MusicLink[]);
  }, [api, world.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!parseMusicUrl(url)) return toast("Paste a full https:// link from Spotify, YouTube, Apple Music, Audiomack, Boomplay…", "error");
    setBusy(true);
    const { error } = await api.from("music_links").insert({ world_id: world.id, author_id: me.id, url: url.trim(), title: title.trim() || "A song for you", note: note.trim() || null });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    setUrl("");
    setTitle("");
    setNote("");
    load();
  }

  return (
    <>
      <PageHeader title="Music Corner" subtitle="Songs that sound like us. Links play through each service's own player." />
      <form onSubmit={add} className="card mb-5 space-y-3 p-4">
        <Field label="Song link">
          <input className={inputClass} type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://open.spotify.com/track/…" inputMode="url" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <input className={inputClass} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Our song" />
          </Field>
          <Field label="Why this one? (optional)">
            <input className={inputClass} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reminds me of that drive…" />
          </Field>
        </div>
        <Button type="submit" loading={busy}>
          Add to our playlist
        </Button>
      </form>
      {error && <ErrorNote onRetry={load}>{error}</ErrorNote>}
      {links === null ? (
        <div className="skeleton h-24" />
      ) : links.length === 0 ? (
        <EmptyState emoji="🎶" title="No songs yet">Share the first song that makes you think of them.</EmptyState>
      ) : (
        <div className="space-y-3">
          {links.map((l) => (
            <Track key={l.id} link={l} by={nameOf(l.author_id)} mine={l.author_id === me.id} onDelete={async () => {
              const { error } = await api.from("music_links").delete().eq("id", l.id);
              if (error) toast(errorMessage(error), "error");
              else setLinks((x) => x?.filter((y) => y.id !== l.id) ?? null);
            }} />
          ))}
        </div>
      )}
    </>
  );
}

import { useMusic } from "@/lib/music-context";

function Track({ link, by, mine, onDelete }: { link: MusicLink; by: string; mine: boolean; onDelete: () => void }) {
  const info = parseMusicUrl(link.url);
  const { activeTrack, play, stop, setMinimized } = useMusic();
  const isPlayingThis = activeTrack?.url === link.url;

  return (
    <article className={cn("card p-4 transition-all", isPlayingThis && "border-gold/60 bg-gold/5 shadow-md")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gold">{info?.provider}</span>
            {isPlayingThis && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold animate-pulse">
                <span>🎵</span> Now Playing
              </span>
            )}
          </div>
          <h3 className="font-display text-lg">{link.title}</h3>
          {link.note && <p className="text-sm text-ink-soft">{link.note}</p>}
          <p className="mt-1 text-xs text-ink-faint">
            Shared by {by} · {relativeTime(link.created_at)}
          </p>
        </div>
        {mine && (
          <IconButton label="Remove song" onClick={onDelete}>
            <IconTrash size={18} />
          </IconButton>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {info?.embed ? (
          isPlayingThis ? (
            <div className="flex items-center gap-2">
              <Button
                variant="soft"
                size="sm"
                onClick={() => setMinimized(false)}
                className="bg-gold/20 text-gold border-gold/30 hover:bg-gold/30"
              >
                🎶 View Player
              </Button>
              <Button variant="ghost" size="sm" onClick={stop} className="text-rose hover:bg-rose/10">
                Stop
              </Button>
            </div>
          ) : (
            <Button
              variant="soft"
              size="sm"
              onClick={() => play({ id: link.id, url: link.url, title: link.title, note: link.note })}
            >
              ▶ Play anywhere
            </Button>
          )
        ) : (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center rounded-full bg-surface-2 px-3.5 text-sm font-semibold hover:bg-line transition"
          >
            Open in {info?.provider ?? "app"} ↗
          </a>
        )}
      </div>
    </article>
  );
}
