"use client";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { IconCamOff, IconFlip, IconMic, IconMicOff, IconPhone, IconVideo } from "@/components/ui/icons";
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
      className={cn("absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 w-28 rounded-2xl border border-white/20 bg-black object-cover shadow-xl sm:w-40", hidden && "opacity-0")}
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
    <AnimatePresence>
      {visible && (
        <m.div
          role="dialog"
          aria-label="Call"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="sky fixed inset-0 z-[80] flex flex-col items-center justify-between overflow-hidden pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]"
        >
          <Starfield count={30} />
          <RemoteMedia stream={call.remote} video={call.kind === "video"} visible={hasRemoteVideo} />

          <div className={cn("relative z-10 flex flex-col items-center text-center", hasRemoteVideo && "rounded-2xl bg-black/35 px-4 py-2")}>
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
