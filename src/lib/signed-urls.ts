"use client";
import { useEffect, useState } from "react";
import { signMediaUrls } from "@/lib/db/client";

// Private media is only reachable through short-lived signed URLs (checked per world). Requests made in
// the same tick are batched into one createSignedUrls call to save round trips.
const TTL_SECONDS = 60 * 60;
const cache = new Map<string, { url: string; expires: number }>();
let pending = new Map<string, ((url: string | null) => void)[]>();
let scheduled = false;

async function flush() {
  scheduled = false;
  const batch = pending;
  pending = new Map();
  const paths = [...batch.keys()];
  const data = await signMediaUrls(paths).catch(() => []);
  const byPath = new Map(data.map((d) => [d.path, d.url]));
  for (const p of paths) {
    const url = byPath.get(p) ?? null;
    if (url) cache.set(p, { url, expires: Date.now() + (TTL_SECONDS - 300) * 1000 });
    batch.get(p)!.forEach((cb) => cb(url));
  }
}

export function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.url);
  return new Promise((resolve) => {
    const list = pending.get(path) ?? [];
    list.push(resolve);
    pending.set(path, list);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  });
}

/** Seeds the cache with a local blob URL right after upload so the sender sees it instantly. */
export function primeSignedUrl(path: string, url: string) {
  cache.set(path, { url, expires: Date.now() + 10 * 60 * 1000 });
}

export function useSignedUrl(path: string | null | undefined) {
  const [state, setState] = useState<{ path: string; url: string | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    signedUrl(path).then((url) => alive && setState({ path, url, failed: !url }));
    return () => {
      alive = false;
    };
  }, [path]);
  const current = state && state.path === path ? state : null;
  return { url: current?.url ?? null, failed: current?.failed ?? false };
}
