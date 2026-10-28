import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSocket, type LiveStatus } from "./live-socket";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function setup() {
  const statuses: LiveStatus[] = [];
  const opens: boolean[] = [];
  const authLost = vi.fn();
  const live = new LiveSocket({
    url: () => "ws://test/ws",
    create: (u) => new FakeSocket(u),
    onStatus: (s) => statuses.push(s),
    onMessage: () => {},
    onOpen: (re) => opens.push(re),
    onAuthLost: authLost,
  });
  return { live, statuses, opens, authLost, last: () => FakeSocket.all[FakeSocket.all.length - 1] };
}

describe("LiveSocket reconnection", () => {
  beforeEach(() => {
    FakeSocket.all = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("keeps retrying with backoff through a long outage, then resyncs", () => {
    const { live, statuses, opens, last } = setup();
    live.start();
    last().open();
    expect(opens).toEqual([false]);
    last().drop(); // server goes away
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(16_000); // more than the max backoff
      last().drop(); // still down
    }
    expect(FakeSocket.all.length).toBe(13); // 1 initial + 12 retries, none given up
    vi.advanceTimersByTime(16_000);
    last().open(); // server is back
    expect(statuses.at(-1)).toBe("connected");
    expect(opens).toEqual([false, true]); // second open is flagged as a reconnect → pages re-fetch
  });

  it("backoff grows and is capped", () => {
    const { live, last } = setup();
    live.start();
    last().drop();
    vi.advanceTimersByTime(999);
    expect(FakeSocket.all.length).toBe(1);
    vi.advanceTimersByTime(600);
    expect(FakeSocket.all.length).toBe(2);
  });

  it("nudge reconnects immediately when the network returns", () => {
    const { live, last } = setup();
    live.start();
    last().drop();
    live.nudge();
    expect(FakeSocket.all.length).toBe(2);
  });

  it("stops cleanly and ignores late events from old sockets", () => {
    const { live, last, statuses } = setup();
    live.start();
    const first = last();
    live.stop();
    first.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all.length).toBe(1);
    expect(statuses).toEqual(["connecting"]);
  });

  it("signals a lost session instead of retrying", () => {
    const { live, last, authLost } = setup();
    live.start();
    last().open();
    last().drop(4001);
    vi.advanceTimersByTime(60_000);
    expect(authLost).toHaveBeenCalledOnce();
    expect(FakeSocket.all.length).toBe(1);
  });
});
