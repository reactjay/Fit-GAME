"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { VoicePlayer, VoiceRecorder } from "@/components/chat/voice";
import { PrivateImage } from "@/components/media/private-image";
import { IconEdit, IconLock, IconPlus, IconTrash } from "@/components/ui/icons";
import { Button, EmptyState, ErrorNote, Field, IconButton, PageHeader, Sheet, Tabs, inputClass } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { compressImage, validateMedia } from "@/lib/media";
import { db, deleteMedia } from "@/lib/db/client";
import type { Memory, MemoryKind, Message } from "@/lib/types";
import { uploadMedia } from "@/lib/upload";
import { useSignedUrl } from "@/lib/signed-urls";
import { cn, errorMessage, formatDuration, relativeTime, timeLabel } from "@/lib/utils";
import { useActivity, useWorld } from "@/lib/world-context";

type Tab = "all" | MemoryKind | "favorites";
const KIND_META: Record<MemoryKind, { label: string; emoji: string }> = {
  photo: { label: "Photo", emoji: "📷" },
  letter: { label: "Love letter", emoji: "💌" },
  voice: { label: "Voice memory", emoji: "🎙️" },
  milestone: { label: "Milestone", emoji: "🏁" },
  open_when: { label: "Open when…", emoji: "✉️" },
  capsule: { label: "Time capsule", emoji: "⏳" },
};
const MOODS = ["you miss me", "you're sad", "you can't sleep", "you need a laugh", "you're stressed", "it's our anniversary", "you doubt yourself"];

type Sealed = { id: string; title: string; unlock_at: string; author_id: string };

export default function VaultPage() {
  useActivity("In the Memory Vault 💌");
  const { world, me, nameOf } = useWorld();
  const api = db();
  const [tab, setTab] = useState<Tab>("all");
  const [items, setItems] = useState<Memory[] | null>(null);
  const [sealed, setSealed] = useState<Sealed[]>([]);
  const [favorites, setFavorites] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Memory> | null>(null);
  const [opened, setOpened] = useState<Memory | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [m, s] = await Promise.all([api.from("memories").select("*").eq("world_id", world.id).order("created_at", { ascending: false }), api.rpc("sealed_capsules")]);
    if (m.error) return setError(errorMessage(m.error));
    setItems((m.data ?? []) as Memory[]);
    setSealed((s.data ?? []) as Sealed[]);
  }, [api, world.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== "favorites" || favorites) return;
    api
      .from("messages")
      .select("*")
      .eq("world_id", world.id)
      .neq("starred_by", "{}")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setFavorites((data ?? []) as Message[]));
  }, [tab, favorites, api, world.id]);

  const shown = useMemo(() => (items ?? []).filter((m) => tab === "all" || m.kind === tab), [items, tab]);

  async function remove(m: Memory) {
    if (!confirm(`Delete “${m.title}”? This can't be undone.`)) return;
    const { error } = await api.from("memories").delete().eq("id", m.id);
    if (error) return toast(errorMessage(error), "error");
    if (m.media_path) await deleteMedia([m.media_path]);
    setItems((x) => x?.filter((y) => y.id !== m.id) ?? null);
    toast("Deleted");
  }

  return (
    <>
      <PageHeader
        title="Memory Vault"
        subtitle="Your private scrapbook. Only the two of you can ever see it."
        action={
          <Button onClick={() => setEditing({ kind: tab === "all" || tab === "favorites" ? "letter" : tab })} size="sm">
            <IconPlus size={18} /> Add
          </Button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: "All" },
          { id: "photo", label: "Photos" },
          { id: "letter", label: "Letters" },
          { id: "voice", label: "Voice" },
          { id: "milestone", label: "Milestones" },
          { id: "open_when", label: "Open when…" },
          { id: "capsule", label: "Time capsules" },
          { id: "favorites", label: "⭐ Favourites" },
        ]}
      />
      {error && <ErrorNote onRetry={load}>{error}</ErrorNote>}

      {tab === "favorites" ? (
        favorites === null ? (
          <div className="skeleton h-24" />
        ) : favorites.length === 0 ? (
          <EmptyState emoji="⭐" title="No favourite messages yet">Long-press any message in the chat and choose “Save to favourites”.</EmptyState>
        ) : (
          <div className="space-y-2">
            {favorites.map((f) => (
              <div key={f.id} className="card p-4">
                <div className="text-xs text-ink-faint">
                  {nameOf(f.sender_id)} · {new Date(f.created_at).toLocaleDateString()} {timeLabel(f.created_at)}
                </div>
                {f.kind === "image" ? (
                  <PrivateImage path={f.media_path} alt="Favourite photo" className="mt-2 h-40 w-full rounded-xl" />
                ) : f.kind === "video" ? (
                  <VaultVideo path={f.media_path} />
                ) : f.kind === "voice" ? (
                  <VoicePlayer path={f.media_path} durationMs={f.media_meta?.duration_ms} />
                ) : (
                  <p className="mt-1 whitespace-pre-wrap">{f.body}</p>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {(tab === "all" || tab === "capsule") && sealed.length > 0 && (
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {sealed.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-gold/30 bg-gold/5 p-4">
                  <IconLock className="text-gold" />
                  <div>
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-xs text-ink-soft">
                      Sealed by {nameOf(s.author_id)} · opens {new Date(s.unlock_at).toLocaleDateString([], { dateStyle: "medium" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {items === null ? (
            <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-32" />)}</div>
          ) : shown.length === 0 ? (
            <EmptyState emoji="📔" title="Nothing here yet" action={<Button onClick={() => setEditing({ kind: tab === "all" ? "letter" : (tab as MemoryKind) })}>Add the first one</Button>}>
              {tab === "open_when" ? "Write letters for specific moments — “Open when you miss me”, “Open when you can't sleep”…" : tab === "capsule" ? "Seal a note that your partner can only open on a date you choose." : "Save the moments you never want to forget."}
            </EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {shown.map((m) => {
                const locked = m.unlock_at && new Date(m.unlock_at) > new Date();
                return (
                  <article key={m.id} className={cn("card overflow-hidden", m.kind === "open_when" && "border-rose/40")}>
                    {m.kind === "photo" && m.media_path && <PrivateImage path={m.media_path} alt={m.title} className="h-48 w-full" />}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gold">
                            {KIND_META[m.kind].emoji} {m.kind === "open_when" ? `Open when ${m.mood ?? "…"}` : KIND_META[m.kind].label}
                            {m.occurred_on && ` · ${new Date(m.occurred_on + "T00:00").toLocaleDateString([], { dateStyle: "medium" })}`}
                          </div>
                          <h3 className="mt-1 font-display text-lg leading-snug">{m.title}</h3>
                        </div>
                        {m.author_id === me.id && (
                          <div className="-mr-2 -mt-2 flex">
                            <IconButton label="Edit" onClick={() => setEditing(m)}>
                              <IconEdit size={18} />
                            </IconButton>
                            <IconButton label="Delete" onClick={() => remove(m)}>
                              <IconTrash size={18} />
                            </IconButton>
                          </div>
                        )}
                      </div>
                      {m.kind === "voice" && <VoicePlayer path={m.media_path} />}
                      {m.kind === "open_when" ? (
                        <Button variant="soft" size="sm" className="mt-3" onClick={() => setOpened(m)}>
                          ✉️ Open the envelope
                        </Button>
                      ) : (
                        m.body && <p className={cn("mt-2 whitespace-pre-wrap text-[15px] text-ink-soft", m.kind === "letter" && "line-clamp-4 font-display text-ink")}>{m.body}</p>
                      )}
                      {m.kind === "letter" && m.body && m.body.length > 220 && (
                        <button className="mt-1 text-sm font-semibold text-rose" onClick={() => setOpened(m)}>
                          Read the whole letter
                        </button>
                      )}
                      <div className="mt-3 text-xs text-ink-faint">
                        {nameOf(m.author_id)} · {relativeTime(m.created_at)}
                        {locked && ` · 🔒 your partner can open this ${new Date(m.unlock_at!).toLocaleDateString()}`}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <Sheet open={Boolean(opened)} onClose={() => setOpened(null)} title={opened?.kind === "open_when" ? `Open when ${opened.mood}` : opened?.title ?? ""} wide>
        {opened && (
          <div className="rounded-2xl bg-[#f7efe3] p-6 text-[#2a1d3d]">
            <h3 className="font-display text-2xl">{opened.title}</h3>
            <p className="mt-4 whitespace-pre-wrap font-display text-lg leading-relaxed">{opened.body}</p>
            <p className="mt-6 text-right font-display italic">— {nameOf(opened.author_id)}</p>
          </div>
        )}
      </Sheet>

      <MemoryEditor initial={editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), load())} />
    </>
  );
}

function MemoryEditor({ initial, onClose, onSaved }: { initial: Partial<Memory> | null; onClose: () => void; onSaved: () => void }) {
  const { world, me } = useWorld();
  const api = db();
  const [draft, setDraft] = useState<Partial<Memory>>({});
  const [file, setFile] = useState<Blob | null>(null);
  const [voiceMs, setVoiceMs] = useState(0);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tomorrow] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));

  useEffect(() => {
    setDraft(initial ?? {});
    setFile(null);
    setError(null);
    setProgress(null);
    setRecording(false);
  }, [initial]);

  const kind = (draft.kind ?? "letter") as MemoryKind;
  const isEdit = Boolean(draft.id);
  const set = (p: Partial<Memory>) => setDraft((d) => ({ ...d, ...p }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!draft.title?.trim()) return setError("Give it a title.");
    if ((kind === "photo" || kind === "voice") && !file && !draft.media_path) return setError(kind === "photo" ? "Choose a photo." : "Record a voice memory first.");
    if (kind === "capsule" && (!draft.unlock_at || new Date(draft.unlock_at) <= new Date())) return setError("Choose a future date for the capsule to open.");
    try {
      let media_path = draft.media_path ?? null;
      if (file) {
        setProgress(0);
        media_path = (await uploadMedia({ worldId: world.id, userId: me.id, blob: file, kind: kind === "voice" ? "voice" : "image", meta: kind === "voice" ? { duration_ms: voiceMs } : undefined, onProgress: setProgress })).path;
      }
      const row = {
        kind,
        title: draft.title.trim().slice(0, 120),
        body: draft.body?.trim().slice(0, 10000) || null,
        media_path,
        occurred_on: draft.occurred_on || null,
        unlock_at: kind === "capsule" ? draft.unlock_at : null,
        mood: kind === "open_when" ? draft.mood || MOODS[0] : null,
      };
      const { error } = isEdit ? await api.from("memories").update(row).eq("id", draft.id!) : await api.from("memories").insert({ ...row, world_id: world.id, author_id: me.id });
      if (error) throw error;
      toast(isEdit ? "Saved" : "Kept safe in the vault 💜", "ok");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <Sheet open={Boolean(initial)} onClose={onClose} title={isEdit ? "Edit memory" : "New memory"} wide>
      <form onSubmit={save} className="space-y-4">
        {!isEdit && (
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(KIND_META) as MemoryKind[]).map((k) => (
              <button type="button" key={k} onClick={() => (set({ kind: k }), setFile(null))} aria-pressed={kind === k} className={cn("min-h-9 rounded-full px-3 text-sm font-semibold", kind === k ? "bg-ink text-bg" : "bg-surface-2 text-ink-soft")}>
                {KIND_META[k].emoji} {KIND_META[k].label}
              </button>
            ))}
          </div>
        )}
        {kind === "open_when" && (
          <Field label="Open when…">
            <input className={inputClass} list="moods" value={draft.mood ?? ""} maxLength={60} onChange={(e) => set({ mood: e.target.value })} placeholder={MOODS[0]} />
            <datalist id="moods">
              {MOODS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
        )}
        <Field label="Title">
          <input className={inputClass} required maxLength={120} value={draft.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder={kind === "milestone" ? "Our first trip together" : "Something to remember"} />
        </Field>
        {kind === "photo" && (
          <Field label="Photo" hint="Large photos are resized before upload to save data.">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-4 file:py-2 file:font-semibold file:text-ink"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const bad = validateMedia(f, "image");
                if (bad && !/10 MB/.test(bad)) return setError(bad);
                setFile((await compressImage(f)).blob);
              }}
            />
          </Field>
        )}
        {kind === "voice" && (
          <div>
            {recording ? (
              <VoiceRecorder onCancel={() => setRecording(false)} onError={(m) => (setError(m), setRecording(false))} onDone={(b, ms) => (setFile(b), setVoiceMs(ms), setRecording(false))} />
            ) : (
              <Button type="button" variant="soft" onClick={() => setRecording(true)}>
                🎙️ {file ? `Re-record (${formatDuration(voiceMs)} recorded)` : draft.media_path ? "Replace recording" : "Record a voice memory"}
              </Button>
            )}
          </div>
        )}
        {kind !== "photo" && kind !== "voice" ? (
          <Field label={kind === "letter" || kind === "open_when" || kind === "capsule" ? "Your letter" : "Notes"}>
            <textarea className={`${inputClass} min-h-40 font-display text-[17px]`} maxLength={10000} value={draft.body ?? ""} onChange={(e) => set({ body: e.target.value })} placeholder="My love…" />
          </Field>
        ) : (
          <Field label="Caption (optional)">
            <textarea className={`${inputClass} min-h-20`} maxLength={2000} value={draft.body ?? ""} onChange={(e) => set({ body: e.target.value })} />
          </Field>
        )}
        {kind === "capsule" ? (
          <Field label="Opens on" hint="Your partner can see the capsule exists, but not what's inside, until this date.">
            <input className={inputClass} type="date" min={tomorrow} value={draft.unlock_at?.slice(0, 10) ?? ""} onChange={(e) => set({ unlock_at: e.target.value ? new Date(e.target.value + "T00:00").toISOString() : null })} />
          </Field>
        ) : (
          <Field label="Date (optional)">
            <input className={inputClass} type="date" value={draft.occurred_on ?? ""} onChange={(e) => set({ occurred_on: e.target.value || null })} />
          </Field>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        {progress !== null && (
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-rose transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        <Button type="submit" className="w-full" loading={progress !== null}>
          {isEdit ? "Save changes" : "Keep it safe"}
        </Button>
      </form>
    </Sheet>
  );
}

function VaultVideo({ path }: { path: string | null }) {
  const { url, failed } = useSignedUrl(path);
  if (failed) return <div className="mt-2 rounded-xl bg-black/20 p-4 text-center text-xs text-ink-faint">Video unavailable</div>;
  if (!url) return <div className="skeleton mt-2 h-40 w-full rounded-xl" />;
  return <video src={url} controls playsInline className="mt-2 max-h-60 w-full rounded-xl bg-black object-contain shadow" />;
}
