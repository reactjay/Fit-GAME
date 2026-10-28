"use client";
import { useCallback, useEffect, useState } from "react";
import { VoicePlayer } from "@/components/chat/voice";
import { PrivateImage } from "@/components/media/private-image";
import { Button, EmptyState, ErrorNote, PageHeader, Tabs } from "@/components/ui/primitives";
import { useSignedUrl } from "@/lib/signed-urls";
import { db } from "@/lib/db/client";
import { errorMessage, relativeTime } from "@/lib/utils";
import { useActivity, useWorld } from "@/lib/world-context";

type MediaRow = { id: string; path: string; kind: "image" | "voice"; uploader_id: string; duration_ms: number | null; created_at: string };
const PAGE = 36;

export default function GalleryPage() {
  useActivity("Browsing the gallery 🖼️");
  const { world, nameOf } = useWorld();
  const [tab, setTab] = useState<"image" | "voice">("image");
  const [items, setItems] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      setError(null);
      let q = db().from("media").select("id, path, kind, uploader_id, duration_ms, created_at").eq("world_id", world.id).eq("kind", tab).order("created_at", { ascending: false }).limit(PAGE);
      if (before) q = q.lt("created_at", before);
      const { data, error } = await q;
      setLoading(false);
      if (error) return setError(errorMessage(error));
      setItems((cur) => (before ? [...cur, ...(data as MediaRow[])] : (data as MediaRow[])));
      setMore((data ?? []).length === PAGE);
    },
    [world.id, tab],
  );

  useEffect(() => {
    setItems([]);
    load();
  }, [load]);

  return (
    <>
      <PageHeader title="Shared gallery" subtitle="Every photo and voice note you've shared, kept private to you two." />
      <Tabs value={tab} onChange={setTab} items={[{ id: "image", label: "Photos" }, { id: "voice", label: "Voice notes" }]} />
      {error && <ErrorNote onRetry={() => load()}>{error}</ErrorNote>}
      {!loading && !error && items.length === 0 && (
        <EmptyState emoji={tab === "image" ? "📷" : "🎙️"} title={tab === "image" ? "No photos yet" : "No voice notes yet"}>
          Share them in the chat or the Memory Vault and they&apos;ll gather here.
        </EmptyState>
      )}
      {tab === "image" ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {items.map((m) => (
            <button key={m.id} onClick={() => setViewing(m.path)} className="aspect-square overflow-hidden rounded-xl" aria-label={`Photo from ${nameOf(m.uploader_id)}`}>
              <PrivateImage path={m.path} alt="" className="h-full w-full transition hover:scale-105" />
            </button>
          ))}
          {loading && Array.from({ length: 9 }, (_, i) => <div key={i} className="skeleton aspect-square" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((m) => (
            <div key={m.id} className="card flex items-center justify-between gap-3 px-4 py-2">
              <VoicePlayer path={m.path} durationMs={m.duration_ms ?? 0} />
              <span className="text-right text-xs text-ink-faint">
                {nameOf(m.uploader_id)}
                <br />
                {relativeTime(m.created_at)}
              </span>
            </div>
          ))}
          {loading && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-16" />)}
        </div>
      )}
      {more && !loading && (
        <div className="mt-6 text-center">
          <Button variant="soft" onClick={() => load(items[items.length - 1]?.created_at)}>
            Load more
          </Button>
        </div>
      )}
      {viewing && <Viewer path={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function Viewer({ path, onClose }: { path: string; onClose: () => void }) {
  const { url } = useSignedUrl(path);
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/90 p-4" onClick={onClose} role="dialog" aria-label="Photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="Shared photo, full size" className="max-h-full max-w-full rounded-xl object-contain" />}
      <button className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] h-11 w-11 rounded-full bg-white/15 text-white" aria-label="Close">
        ✕
      </button>
    </div>
  );
}
