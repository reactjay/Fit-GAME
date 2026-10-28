// Reconnecting WebSocket used for the live world connection. Kept free of React
// so the reconnect/backoff behaviour can be unit-tested with a fake socket.

export type LiveStatus = "connecting" | "connected" | "offline";

type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};

export type LiveSocketOptions = {
  url: () => string;
  create?: (url: string) => SocketLike;
  isOnline?: () => boolean;
  onStatus: (s: LiveStatus) => void;
  onMessage: (msg: { type: string; [k: string]: unknown }) => void;
  /** Runs on every successful (re)connection; `reconnected` is false the first time. */
  onOpen: (reconnected: boolean) => void;
  onAuthLost: () => void;
  maxDelayMs?: number;
};

const OPEN = 1;
const CLOSED = 3;

export class LiveSocket {
  private ws: SocketLike | null = null;
  private attempt = 0;
  private everConnected = false;
  private stopped = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private ping: ReturnType<typeof setInterval> | undefined;

  constructor(private o: LiveSocketOptions) {}

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearInterval(this.ping);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  /** Try again immediately (network came back, tab became visible). */
  nudge() {
    if (this.stopped) return;
    if (!this.ws || this.ws.readyState === CLOSED) {
      this.attempt = 0;
      this.connect();
    }
  }

  send(msg: unknown) {
    if (this.ws?.readyState === OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  private connect() {
    if (this.stopped) return;
    clearTimeout(this.retry);
    const online = this.o.isOnline?.() ?? true;
    this.o.onStatus(online ? "connecting" : "offline");
    const ws = (this.o.create ?? ((u) => new WebSocket(u) as unknown as SocketLike))(this.o.url());
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.o.onStatus("connected");
      this.o.onOpen(this.everConnected);
      this.everConnected = true;
      clearInterval(this.ping);
      this.ping = setInterval(() => ws.readyState === OPEN && ws.send('{"type":"ping"}'), 20_000);
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      try {
        this.o.onMessage(JSON.parse(e.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onerror = () => {};
    ws.onclose = (e) => {
      if (this.ws !== ws) return; // an old socket we already replaced
      clearInterval(this.ping);
      this.ws = null;
      if (this.stopped) return;
      if (e.code === 4001) return this.o.onAuthLost();
      this.o.onStatus(this.o.isOnline?.() ?? true ? "connecting" : "offline");
      const delay = Math.min(this.o.maxDelayMs ?? 15_000, 1000 * 2 ** this.attempt++) + Math.random() * 500;
      this.retry = setTimeout(() => this.connect(), delay);
    };
  }
}
