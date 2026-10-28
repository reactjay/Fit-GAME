import { uuid } from "@/lib/utils";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/x-m4a"] as const;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/aac": "aac",
  "audio/x-m4a": "m4a",
};

/** Strips codec parameters: "audio/webm;codecs=opus" → "audio/webm". */
export function baseMime(type: string) {
  return type.split(";")[0].trim().toLowerCase();
}

export function validateMedia(file: { type: string; size: number }, kind: "image" | "voice"): string | null {
  const mime = baseMime(file.type);
  const allowed: readonly string[] = kind === "image" ? IMAGE_TYPES : AUDIO_TYPES;
  if (!allowed.includes(mime)) return kind === "image" ? "Please choose a JPG, PNG, WebP or GIF image." : "This audio format isn't supported.";
  if (file.size <= 0) return "That file looks empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "That file is over 10 MB. Try a smaller one.";
  return null;
}

export function storagePath(worldId: string, mime: string) {
  return `${worldId}/${uuid()}.${EXT[baseMime(mime)] ?? "bin"}`;
}

/** Picks the best recording format this browser supports (Safari → mp4, Chrome/Firefox → webm/ogg). */
export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm", "audio/aac"];
  return candidates.find((c) => MediaRecorder.isTypeSupported?.(c)) ?? null;
}

/**
 * Downscales photos before upload so they're quick on mobile data. GIFs are kept
 * as-is (animation would be lost). Returns the original if the browser can't decode it.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<{ blob: Blob; width: number; height: number }> {
  if (file.type === "image/gif") {
    const dims = await imageSize(file).catch(() => ({ width: 0, height: 0 }));
    return { blob: file, ...dims };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size > file.size) return { blob: file, width, height };
    return { blob, width, height };
  } catch {
    const dims = await imageSize(file).catch(() => ({ width: 0, height: 0 }));
    return { blob: file, ...dims };
  }
}

function imageSize(file: Blob) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * PUTs the file to the upload target (a signed Cloudflare R2 URL in production,
 * the local media route in development) with real progress events.
 */
export function uploadWithProgress(opts: {
  url: string;
  headers: Record<string, string>;
  blob: Blob;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", opts.url);
    for (const [k, v] of Object.entries(opts.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(uploadError(xhr))));
    xhr.onerror = () => reject(new Error("Upload interrupted — check your connection and retry."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    opts.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(opts.blob);
  });
}

function uploadError(xhr: XMLHttpRequest) {
  try {
    if (xhr.status === 413) return "That file is too large.";
    const body = JSON.parse(xhr.responseText);
    return body?.error?.message || body?.message || `Upload failed (${xhr.status}).`;
  } catch {
    return `Upload failed (${xhr.status}).`;
  }
}
