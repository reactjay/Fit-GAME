"use client";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { IconCamOff, IconFlip, IconMaximize, IconMic, IconMicOff, IconMinimize, IconPhone, IconVideo } from "@/components/ui/icons";
import { Starfield } from "@/components/ui/starfield";
import { useCall } from "@/lib/call/call-provider";
import { cn, formatDuration } from "@/lib/utils";
import { useWorld } from "@/lib/world-context";

/** Plays a remote stream; offers a tap-to-play fallback when autoplay is blocked. */
function RemoteMedia({ stream, video, visible }: { stream: MediaStream | null; video: boolean; visible: boolean }) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  const trackCount = stream?.getTracks().length ?? 0;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) el.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  }, [stream, trackCount]);
  const retry = () => ref.current?.play().then(() => setBlocked(false)).catch(() => {});
  return (
    <>
      {video ? (
        <video ref={ref} autoPlay playsInline className={cn("absolute inset-0 h-full w-full bg-black object-cover", !visible && "hidden")} />
      ) : (
        <audio ref={ref} autoPlay />
      )}
      {blocked && (
        <button onClick={retry} className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 rounded-full bg-white/20 px-5 py-3 text-sm font-semibold text-white backdrop-blur">
          Tap to hear them
        </button>
      )}
    </>
  );
}

function FloatingRemoteVideo({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className="h-full w-full object-cover" />;
}

function LocalPreview({ stream, hidden }: { stream: MediaStream | null; hidden: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cn("absolute right-4 top-[max(4.5rem,env(safe-area-inset-top)+3.5rem)] z-20 w-28 rounded-2xl border border-white/20 bg-black object-cover shadow-xl sm:w-40", hidden && "opacity-0")}
      style={{ aspectRatio: "3/4", transform: "scaleX(-1)" }}
    />
  );
}

function Duration({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{formatDuration(now - since)}</span>;
}

export function CallScreen() {
  const call = useCall();
  const { partner } = useWorld();
  const [minimized, setMinimized] = useState(false);

  // Reset minimized on idle or new incoming calls
  useEffect(() => {
    if (call.phase === "idle" || call.phase === "incoming") {
      setMinimized(false);
    }
  }, [call.phase]);

  const visible = call.phase !== "idle";
  const hasRemoteVideo = call.kind === "video" && (call.phase === "connected" || call.phase === "reconnecting");
  const status =
    call.phase === "outgoing"
      ? "Ringing…"
      : call.phase === "incoming"
        ? `Incoming ${call.kind} call`
        : call.phase === "connecting"
          ? "Connecting…"
          : call.phase === "reconnecting"
            ? "Reconnecting…"
            : call.phase === "ended"
              ? call.endReason ?? "Call ended"
              : null;

  return (
    <>
      {/* 0. Primary remote media: always kept in DOM so audio/video streams are NEVER disrupted */}
      {visible && (
        <div className="contents">
          <RemoteMedia stream={call.remote} video={call.kind === "video"} visible={hasRemoteVideo && !minimized} />
        </div>
      )}

      {/* 1. Full Screen Call Interface (when NOT minimized) */}
      <AnimatePresence>
        {visible && !minimized && (
          <m.div
            role="dialog"
            aria-label="Call"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="sky fixed inset-0 z-[80] flex flex-col items-center justify-between overflow-hidden pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]"
          >
            {/* Top Bar with Minimize Button */}
            <div className="relative z-30 flex w-full max-w-xl items-center justify-between px-6 pt-2">
              {call.phase !== "incoming" && call.phase !== "ended" ? (
                <button
                  type="button"
                  onClick={() => setMinimized(true)}
                  aria-label="Minimize call"
                  className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-black/60 active:scale-95"
                >
                  <IconMinimize size={14} />
                  <span>Minimize</span>
                </button>
              ) : (
                <div />
              )}

              {call.phase !== "incoming" && call.connectedAt && (
                <div className="rounded-full border border-white/10 bg-black/40 px-3.5 py-1 text-xs font-medium text-white/90 backdrop-blur-md">
                  <Duration since={call.connectedAt} />
                </div>
              )}
            </div>

            <Starfield count={30} />

            <div className={cn("relative z-10 flex flex-col items-center text-center", hasRemoteVideo && "rounded-2xl bg-black/45 px-5 py-3 backdrop-blur-sm")}>
              {!hasRemoteVideo && (
                <div className={cn("mb-5 rounded-full p-1.5", (call.phase === "incoming" || call.phase === "outgoing") && "animate-ring")}>
                  <Avatar look={partner?.avatar} size={132} />
                </div>
              )}
              <h2 className="font-display text-2xl text-[#f7efe3]">{partner?.display_name ?? "Your love"}</h2>
              <p className="mt-1 text-sm text-[#e8dff0]" aria-live="polite">
                {status ?? (call.connectedAt ? <Duration since={call.connectedAt} /> : null)}
              </p>
            </div>

            {call.kind === "video" && call.local && <LocalPreview stream={call.local} hidden={call.cameraOff} />}

            <div className="relative z-10 flex items-center gap-4">
              {call.phase === "incoming" ? (
                <>
                  <CallButton label="Decline" onClick={call.decline} className="bg-[#e5484d] text-white">
                    <IconPhone className="rotate-[135deg]" />
                  </CallButton>
                  <CallButton label="Accept" onClick={call.accept} className="bg-[#30a46c] text-white">
                    {call.kind === "video" ? <IconVideo /> : <IconPhone />}
                  </CallButton>
                </>
              ) : call.phase !== "ended" ? (
                <>
                  <CallButton label={call.muted ? "Unmute" : "Mute"} onClick={call.toggleMute} active={call.muted}>
                    {call.muted ? <IconMicOff /> : <IconMic />}
                  </CallButton>
                  {call.kind === "video" && (
                    <CallButton label={call.cameraOff ? "Turn camera on" : "Turn camera off"} onClick={call.toggleCamera} active={call.cameraOff}>
                      {call.cameraOff ? <IconCamOff /> : <IconVideo />}
                    </CallButton>
                  )}
                  {call.kind === "video" && call.canSwitchCamera && (
                    <CallButton label="Switch camera" onClick={call.switchCamera}>
                      <IconFlip />
                    </CallButton>
                  )}
                  <CallButton label="Hang up" onClick={call.hangup} className="bg-[#e5484d] text-white">
                    <IconPhone className="rotate-[135deg]" />
                  </CallButton>
                </>
              ) : null}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* 2. Floating PiP Mini-Window / Island (when MINIMIZED) */}
      <AnimatePresence>
        {visible && minimized && (
          <m.div
            initial={{ opacity: 0, y: -16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.9 }}
            className="fixed right-4 top-[max(1rem,env(safe-area-inset-top)+3.5rem)] z-[95] select-none"
          >
            {call.kind === "video" && hasRemoteVideo ? (
              // Floating Video PiP Box
              <div
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  setMinimized(false);
                }}
                className="group relative w-36 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl transition-transform hover:scale-[1.02] sm:w-44 cursor-pointer"
                style={{ aspectRatio: "3/4" }}
              >
                <FloatingRemoteVideo stream={call.remote} />
                {call.local && !call.cameraOff && (
                  <video
                    ref={(el) => {
                      if (el) el.srcObject = call.local;
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="absolute bottom-2 right-2 h-12 w-9 rounded-lg border border-white/30 bg-black object-cover shadow-md"
                    style={{ transform: "scaleX(-1)" }}
                  />
                )}
                <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/70 via-transparent to-black/80 p-2">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                      {call.connectedAt ? <Duration since={call.connectedAt} /> : "Call"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMinimized(false)}
                      className="grid h-6 w-6 place-items-center rounded-full bg-white/25 text-white hover:bg-white/40"
                      aria-label="Maximize call"
                    >
                      <IconMaximize size={12} />
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={call.toggleMute}
                      className={cn("grid h-7 w-7 place-items-center rounded-full text-xs text-white", call.muted ? "bg-amber-500" : "bg-white/25 hover:bg-white/40")}
                      aria-label={call.muted ? "Unmute" : "Mute"}
                    >
                      {call.muted ? <IconMicOff size={13} /> : <IconMic size={13} />}
                    </button>
                    <button
                      type="button"
                      onClick={call.hangup}
                      className="grid h-7 w-7 place-items-center rounded-full bg-[#e5484d] text-white hover:brightness-110"
                      aria-label="Hang up"
                    >
                      <IconPhone size={13} className="rotate-[135deg]" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // Floating Audio Call Pill
              <div
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  setMinimized(false);
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-full border border-white/20 bg-slate-900/95 px-3.5 py-2 shadow-2xl backdrop-blur-md transition-all hover:border-white/35 hover:bg-slate-900"
              >
                <div className="relative">
                  <Avatar look={partner?.avatar} size={28} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-900 animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-white leading-tight">
                    {partner?.display_name ?? "Call"}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    {status ?? (call.connectedAt ? <Duration since={call.connectedAt} /> : "Active")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 ml-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      call.toggleMute();
                    }}
                    className={cn("grid h-7 w-7 place-items-center rounded-full text-xs text-white", call.muted ? "bg-amber-500" : "bg-white/15 hover:bg-white/25")}
                    aria-label={call.muted ? "Unmute" : "Mute"}
                  >
                    {call.muted ? <IconMicOff size={13} /> : <IconMic size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      call.hangup();
                    }}
                    className="grid h-7 w-7 place-items-center rounded-full bg-[#e5484d] text-white hover:brightness-110"
                    aria-label="Hang up"
                  >
                    <IconPhone size={13} className="rotate-[135deg]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMinimized(false)}
                    className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
                    aria-label="Maximize call"
                  >
                    <IconMaximize size={13} />
                  </button>
                </div>
              </div>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

function CallButton({ label, onClick, children, className, active }: { label: string; onClick: () => void; children: React.ReactNode; className?: string; active?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={cn("grid h-16 w-16 place-items-center rounded-full transition active:scale-95", className ?? (active ? "bg-white text-[#1a1430]" : "bg-white/15 text-white backdrop-blur"))}
      >
        {children}
      </button>
      <span className="text-xs text-white/80">{label}</span>
    </div>
  );
}
