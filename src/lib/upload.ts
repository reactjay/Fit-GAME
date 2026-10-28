"use client";
import { completeUpload, requestUpload } from "@/lib/db/client";
import { baseMime, uploadWithProgress, validateMedia } from "@/lib/media";
import { primeSignedUrl } from "@/lib/signed-urls";

/**
 * Validates, asks the server for an upload slot, PUTs the file with progress,
 * then has the server verify the stored file and register it in `media`.
 */
export async function uploadMedia(opts: {
  worldId: string;
  userId: string;
  blob: Blob;
  kind: "image" | "voice";
  meta?: { width?: number; height?: number; duration_ms?: number };
  onProgress?: (f: number) => void;
}) {
  const mime = baseMime(opts.blob.type || (opts.kind === "voice" ? "audio/webm" : "image/jpeg"));
  const invalid = validateMedia({ type: mime, size: opts.blob.size }, opts.kind);
  if (invalid) throw new Error(invalid);
  const target = await requestUpload(opts.worldId, mime, opts.blob.size);
  await uploadWithProgress({ url: target.url, headers: target.headers, blob: opts.blob, onProgress: opts.onProgress });
  await completeUpload({ path: target.path, kind: opts.kind, ...opts.meta });
  primeSignedUrl(target.path, URL.createObjectURL(opts.blob));
  return { path: target.path, mime };
}
