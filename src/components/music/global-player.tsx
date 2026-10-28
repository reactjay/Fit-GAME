"use client";
import { IconMaximize, IconMinimize } from "@/components/ui/icons";
import { useMusic } from "@/lib/music-context";
import { cn } from "@/lib/utils";

export function GlobalMusicPlayer() {
  const { activeTrack, minimized, setMinimized, stop } = useMusic();

  if (!activeTrack) return null;

  return (
    <>
      {/* 1. Minimized Floating Pill (visible across all pages while browsing) */}
      {minimized && (
        <div
          onClick={() => setMinimized(false)}
          className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-[65] flex cursor-pointer items-center gap-2.5 rounded-full border border-gold/40 bg-slate-950/95 px-3.5 py-2 shadow-2xl backdrop-blur-md transition-all hover:scale-105 hover:border-gold"
          title="Click to view music player"
          role="button"
          tabIndex={0}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold" />
          </span>
          <span className="text-sm">🎵</span>
          <div className="flex max-w-[140px] flex-col sm:max-w-[200px]">
            <span className="truncate text-xs font-bold text-white leading-tight">
              {activeTrack.title}
            </span>
            <span className="text-[10px] text-gold/90 font-medium">
              {activeTrack.provider} · Playing
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMinimized(false);
            }}
            className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
            aria-label="Expand player"
          >
            <IconMaximize size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stop();
            }}
            className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-rose hover:text-white"
            aria-label="Stop music"
            title="Stop music"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Expanded Player Card (kept mounted in DOM so audio stream is continuous) */}
      <div
        className={cn(
          "fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-[65] w-[92vw] max-w-sm overflow-hidden rounded-2xl border border-gold/40 bg-slate-950/95 shadow-2xl backdrop-blur-xl transition-all duration-200",
          minimized
            ? "pointer-events-none h-0 w-0 opacity-0 overflow-hidden border-0 p-0 m-0"
            : "opacity-100 scale-100"
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 bg-black/40 px-3.5 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm">🎶</span>
            <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold text-gold uppercase tracking-wider">
              {activeTrack.provider}
            </span>
            <span className="truncate text-xs font-medium text-white/90">
              {activeTrack.title}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="grid h-7 w-7 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition"
              title="Minimize to floating pill"
              aria-label="Minimize player"
            >
              <IconMinimize size={14} />
            </button>
            <button
              type="button"
              onClick={stop}
              className="grid h-7 w-7 place-items-center rounded-lg text-white/70 hover:bg-rose/80 hover:text-white transition"
              title="Stop playback"
              aria-label="Stop music"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="p-2">
          <iframe
            src={activeTrack.embed}
            title={activeTrack.title}
            height={Math.min(activeTrack.height, 280)}
            className="w-full rounded-xl border-0"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          />
        </div>
      </div>
    </>
  );
}
