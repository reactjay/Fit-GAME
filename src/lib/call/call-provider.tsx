"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import { startRing, stopRing } from "@/lib/sound";
import { db } from "@/lib/db/client";
import type { CallRow } from "@/lib/types";
import { useWorld } from "@/lib/world-context";
import { notify } from "@/lib/notify";

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "connected" | "reconnecting" | "ended";

export type CallState = {
  phase: CallPhase;
  call: CallRow | null;
  kind: "audio" | "video";
  direction: "out" | "in";
  local: MediaStream | null;
  remote: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  connectedAt: number | null;
  endReason: string | null;
  canSwitchCamera: boolean;
};

type CallApi = CallState & {
  startCall: (kind: "audio" | "video") => Promise<void>;
  accept: () => Promise<void>;
  decline: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => Promise<void>;
};

const IDLE: CallState = {
  phase: "idle",
  call: null,
  kind: "audio",
  direction: "out",
  local: null,
  remote: null,
  muted: false,
  cameraOff: false,
  connectedAt: null,
  endReason: null,
  canSwitchCamera: false,
};

const RING_TIMEOUT_MS = 35_000;
const CONNECT_TIMEOUT_MS = 25_000;
const RECONNECT_GRACE_MS = 6_000;
const RECONNECT_GIVE_UP_MS = 20_000;

const CallContext = createContext<CallApi | null>(null);
export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used inside CallProvider");
  return ctx;
}

let iceCache: { servers: RTCIceServer[]; at: number } | null = null;
async function getIceServers(): Promise<RTCIceServer[]> {
  if (iceCache && Date.now() - iceCache.at < 10 * 60 * 1000) return iceCache.servers;
  try {
    const res = await fetch("/api/turn", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const { iceServers } = (await res.json()) as { iceServers: RTCIceServer[] };
    iceCache = { servers: iceServers, at: Date.now() };
    return iceServers;
  } catch {
    return [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  }
}

function mediaError(e: unknown, kind: "audio" | "video") {
  const name = (e as { name?: string })?.name;
  const what = kind === "video" ? "camera and microphone" : "microphone";
  if (name === "NotAllowedError" || name === "SecurityError") return `Please allow ${what} access in your browser to call.`;
  if (name === "NotFoundError" || name === "OverconstrainedError") return `No ${what} found on this device.`;
  if (name === "NotReadableError") return `Your ${what} is being used by another app.`;
  return `Couldn't start your ${what}.`;
}

async function getMedia(kind: "audio" | "video", facingMode: "user" | "environment" = "user") {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("unsupported"), { name: "NotSupported" });
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    // Modest resolution keeps calls smooth on mobile data and budget phones.
    video: kind === "video" ? { facingMode, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } : false,
  });
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { world, me, partner, broadcast, onBroadcast, onChange, prefs } = useWorld();
  const api = db();
  const [state, setStateRaw] = useState<CallState>(IDLE);
  const stateRef = useRef(state);
  // The ref is authoritative (read by async signaling handlers); state mirrors it for rendering.
  const setState = useCallback((next: CallState | ((prev: CallState) => CallState)) => {
    stateRef.current = typeof next === "function" ? next(stateRef.current) : next;
    setStateRaw(stateRef.current);
  }, []);

  const pc = useRef<RTCPeerConnection | null>(null);
  const iceQueue = useRef<RTCIceCandidateInit[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const facing = useRef<"user" | "environment">("user");
  const acceptedHere = useRef(false);

  const patch = useCallback((p: Partial<CallState>) => setState((s) => ({ ...s, ...p })), [setState]);
  const send = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      const callId = stateRef.current.call?.id;
      if (callId) broadcast(event, { ...payload, callId });
    },
    [broadcast],
  );

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
  };

  /** Releases camera/mic and the peer connection. Always safe to call. */
  const teardown = useCallback((reason: string | null) => {
    clearTimers();
    stopRing();
    const s = stateRef.current;
    s.local?.getTracks().forEach((t) => t.stop());
    pc.current?.getSenders().forEach((sn) => sn.track?.stop());
    pc.current?.close();
    pc.current = null;
    iceQueue.current = [];
    acceptedHere.current = false;
    setState((prev) => ({ ...prev, phase: "ended", local: null, remote: null, endReason: reason }));
    setTimeout(() => setState((prev) => (prev.phase === "ended" ? IDLE : prev)), 2200);
  }, [setState]);

  const recordCall = useCallback(
    async (call: CallRow, status: CallRow["status"]) => {
      const { data } = await api.rpc("update_call", { p_call: call.id, p_status: status });
      const final = (data as CallRow | null) ?? call;
      // The caller writes one chat record per call; client_id = call id makes it idempotent.
      if (call.caller_id === me.id && final.status !== "active") {
        const secs = final.answered_at && final.ended_at ? Math.round((+new Date(final.ended_at) - +new Date(final.answered_at)) / 1000) : 0;
        await api.from("messages").insert({
          world_id: world.id,
          sender_id: me.id,
          client_id: call.id,
          kind: "call",
          body: JSON.stringify({ kind: call.kind, status: final.status, secs }),
        });
      }
    },
    [api, me.id, world.id],
  );

  const endCall = useCallback(
    (status: CallRow["status"], reason: string | null, notifyPeer = true) => {
      const call = stateRef.current.call;
      if (!call || stateRef.current.phase === "ended" || stateRef.current.phase === "idle") return;
      if (notifyPeer) send(status === "declined" ? "call:decline" : "call:hangup");
      teardown(reason);
      recordCall(call, status).catch(() => {});
    },
    [send, teardown, recordCall],
  );

  const flushIce = async () => {
    const conn = pc.current;
    if (!conn?.remoteDescription) return;
    for (const c of iceQueue.current.splice(0)) await conn.addIceCandidate(c).catch(() => {});
  };

  const restartIce = useCallback(async () => {
    const conn = pc.current;
    if (!conn || stateRef.current.direction !== "out") return;
    try {
      const offer = await conn.createOffer({ iceRestart: true });
      await conn.setLocalDescription(offer);
      send("call:offer", { sdp: conn.localDescription?.toJSON() });
    } catch {
      /* the give-up timer handles persistent failure */
    }
  }, [send]);

  const createPeer = useCallback(
    async (local: MediaStream) => {
      const conn = new RTCPeerConnection({ iceServers: await getIceServers() });
      pc.current = conn;
      local.getTracks().forEach((t) => conn.addTrack(t, local));
      const remote = new MediaStream();
      patch({ remote });
      conn.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => remote.getTracks().includes(t) || remote.addTrack(t));
        if (!e.streams[0] && !remote.getTracks().includes(e.track)) remote.addTrack(e.track);
        patch({ remote });
      };
      conn.onicecandidate = (e) => e.candidate && send("call:ice", { candidate: e.candidate.toJSON() });
      conn.onconnectionstatechange = () => {
        const st = conn.connectionState;
        if (st === "connected") {
          clearTimers();
          const cur = stateRef.current;
          patch({ phase: "connected", connectedAt: cur.connectedAt ?? Date.now() });
          if (cur.direction === "out" && cur.call && cur.phase !== "reconnecting") {
            api.rpc("update_call", { p_call: cur.call.id, p_status: "active" }).then(() => {});
          }
        } else if (st === "disconnected" || st === "failed") {
          if (stateRef.current.phase === "connected") patch({ phase: "reconnecting" });
          if (st === "failed") restartIce();
          if (!reconnectTimer.current) {
            reconnectTimer.current = setTimeout(() => restartIce(), RECONNECT_GRACE_MS);
            timers.current.push(
              setTimeout(() => {
                if (pc.current?.connectionState !== "connected") endCall("ended", "Connection lost");
              }, RECONNECT_GIVE_UP_MS),
            );
          }
        }
      };
      return conn;
    },
    [patch, send, api, restartIce, endCall],
  );

  const startCall = useCallback(
    async (kind: "audio" | "video") => {
      if (!partner) return toast("Your partner hasn't joined yet.", "error");
      if (stateRef.current.phase !== "idle") return;
      if (typeof RTCPeerConnection === "undefined") return toast("This browser doesn't support calls.", "error");
      let local: MediaStream;
      try {
        local = await getMedia(kind);
      } catch (e) {
        return toast(mediaError(e, kind), "error");
      }
      const { data: call, error } = await api
        .from("calls")
        .insert({ world_id: world.id, caller_id: me.id, callee_id: partner.id, kind })
        .select()
        .single();
      if (error || !call) {
        local.getTracks().forEach((t) => t.stop());
        return toast("Couldn't start the call. Check your connection.", "error");
      }
      facing.current = "user";
      setState({ ...IDLE, phase: "outgoing", call: call as CallRow, kind, direction: "out", local, canSwitchCamera: kind === "video" && (await hasMultipleCameras()) });
      broadcast("call:ring", { callId: call.id, kind });
      startRing();
      timers.current.push(
        setTimeout(() => {
          if (stateRef.current.phase === "outgoing") endCall("missed", "No answer");
        }, RING_TIMEOUT_MS),
      );
    },
    [partner, api, world.id, me.id, broadcast, endCall, setState],
  );

  const accept = useCallback(async () => {
    const s = stateRef.current;
    if (s.phase !== "incoming" || !s.call) return;
    stopRing();
    let local: MediaStream;
    try {
      local = await getMedia(s.kind);
    } catch (e) {
      toast(mediaError(e, s.kind), "error");
      return endCall("declined", "Couldn't access your devices");
    }
    acceptedHere.current = true;
    patch({ phase: "connecting", local, canSwitchCamera: s.kind === "video" && (await hasMultipleCameras()) });
    await createPeer(local);
    send("call:accept");
    timers.current.push(
      setTimeout(() => {
        if (stateRef.current.phase === "connecting") endCall("failed", "Couldn't connect — the network may be blocking calls.");
      }, CONNECT_TIMEOUT_MS),
    );
  }, [patch, createPeer, send, endCall]);

  const decline = useCallback(() => endCall("declined", "Declined"), [endCall]);
  const hangup = useCallback(() => endCall("ended", "Call ended"), [endCall]);

  const toggleMute = useCallback(() => {
    const s = stateRef.current;
    const next = !s.muted;
    s.local?.getAudioTracks().forEach((t) => (t.enabled = !next));
    patch({ muted: next });
  }, [patch]);

  const toggleCamera = useCallback(() => {
    const s = stateRef.current;
    const next = !s.cameraOff;
    s.local?.getVideoTracks().forEach((t) => (t.enabled = !next));
    patch({ cameraOff: next });
  }, [patch]);

  const switchCamera = useCallback(async () => {
    const s = stateRef.current;
    if (!s.local || s.kind !== "video") return;
    const nextFacing = facing.current === "user" ? "environment" : "user";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: nextFacing }, width: { ideal: 640 }, height: { ideal: 480 } } });
      const track = fresh.getVideoTracks()[0];
      const sender = pc.current?.getSenders().find((sn) => sn.track?.kind === "video");
      await sender?.replaceTrack(track);
      s.local.getVideoTracks().forEach((t) => {
        t.stop();
        s.local!.removeTrack(t);
      });
      track.enabled = !s.cameraOff;
      s.local.addTrack(track);
      facing.current = nextFacing;
      patch({ local: new MediaStream(s.local.getTracks()) });
    } catch {
      toast("Couldn't switch camera on this device.", "error");
    }
  }, [patch]);

  // ── signaling ──
  useEffect(() => {
    const mine = (p: Record<string, unknown>) => p.callId && p.callId === stateRef.current.call?.id;
    const offs = [
      onBroadcast("call:ring", async (p) => {
        if (stateRef.current.phase !== "idle") {
          if (p.callId !== stateRef.current.call?.id) broadcast("call:busy", { callId: p.callId });
          return;
        }
        const { data } = await api.from("calls").select("*").eq("id", String(p.callId)).single();
        if (data && (data as CallRow).status === "ringing") ring(data as CallRow);
      }),
      onBroadcast("call:busy", (p) => mine(p) && endCall("ended", "They're on another call", false)),
      onBroadcast("call:decline", (p) => mine(p) && remoteEnded("declined", "They can't talk right now")),
      onBroadcast("call:hangup", (p) => mine(p) && remoteEnded("ended", stateRef.current.phase === "incoming" ? "Missed call" : "Call ended")),
      onBroadcast("call:accept", async (p) => {
        if (!mine(p) || stateRef.current.phase !== "outgoing") return;
        stopRing();
        clearTimers();
        patch({ phase: "connecting" });
        const conn = await createPeer(stateRef.current.local!);
        const offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        send("call:offer", { sdp: conn.localDescription?.toJSON() });
        timers.current.push(
          setTimeout(() => {
            if (stateRef.current.phase === "connecting") endCall("failed", "Couldn't connect — the network may be blocking calls.");
          }, CONNECT_TIMEOUT_MS),
        );
      }),
      onBroadcast("call:offer", async (p) => {
        const conn = pc.current;
        if (!mine(p) || !conn) return;
        await conn.setRemoteDescription(p.sdp as RTCSessionDescriptionInit);
        await flushIce();
        const answer = await conn.createAnswer();
        await conn.setLocalDescription(answer);
        send("call:answer", { sdp: conn.localDescription?.toJSON() });
      }),
      onBroadcast("call:answer", async (p) => {
        const conn = pc.current;
        if (!mine(p) || !conn || conn.signalingState !== "have-local-offer") return;
        await conn.setRemoteDescription(p.sdp as RTCSessionDescriptionInit);
        await flushIce();
      }),
      onBroadcast("call:ice", async (p) => {
        if (!mine(p)) return;
        const c = p.candidate as RTCIceCandidateInit;
        if (pc.current?.remoteDescription) await pc.current.addIceCandidate(c).catch(() => {});
        else iceQueue.current.push(c);
      }),
      // Database fallback: rings even if the broadcast was missed; stops other tabs when one answers.
      onChange("calls", (payload) => {
        const row = payload.new as CallRow;
        if (!row?.id) return;
        const s = stateRef.current;
        if (payload.eventType === "INSERT" && row.callee_id === me.id && row.status === "ringing" && s.phase === "idle") ring(row);
        if (payload.eventType === "UPDATE" && row.id === s.call?.id) {
          if (row.status === "active" && s.phase === "incoming" && !acceptedHere.current) teardown("Answered on another device");
          if (["ended", "missed", "declined", "failed"].includes(row.status) && s.phase !== "ended" && s.phase !== "idle") {
            teardown(row.status === "missed" ? "Missed call" : "Call ended");
          }
        }
      }),
    ];

    // The other side ended it; the caller still writes the call record.
    function remoteEnded(status: CallRow["status"], reason: string) {
      const call = stateRef.current.call;
      if (!call || stateRef.current.phase === "ended" || stateRef.current.phase === "idle") return;
      teardown(reason);
      if (call.caller_id === me.id) recordCall(call, status).catch(() => {});
    }

    function ring(call: CallRow) {
      if (Date.now() - new Date(call.created_at).getTime() > RING_TIMEOUT_MS) return;
      setState({ ...IDLE, phase: "incoming", call, kind: call.kind, direction: "in" });
      startRing();
      if (prefs.notify_calls) notify(`Incoming ${call.kind} call`, "Tap to answer 💞", true);
      timers.current.push(
        setTimeout(() => {
          if (stateRef.current.phase === "incoming") teardown("Missed call");
        }, RING_TIMEOUT_MS),
      );
    }
    return () => offs.forEach((off) => off());
  }, [onBroadcast, onChange, broadcast, api, me.id, patch, createPeer, send, endCall, teardown, recordCall, prefs.notify_calls, setState]);

  // Hang up cleanly if the tab is closed mid-call.
  useEffect(() => {
    const onUnload = () => {
      const s = stateRef.current;
      if (s.call && s.phase !== "idle" && s.phase !== "ended") send("call:hangup");
    };
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      onUnload();
      stateRef.current.local?.getTracks().forEach((t) => t.stop());
      pc.current?.close();
    };
  }, [send]);

  return (
    <CallContext.Provider value={{ ...state, startCall, accept, decline, hangup, toggleMute, toggleCamera, switchCamera }}>{children}</CallContext.Provider>
  );
}

async function hasMultipleCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput").length > 1;
  } catch {
    return false;
  }
}
