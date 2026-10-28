"use client";
import { useSignedUrl } from "@/lib/signed-urls";
import { cn } from "@/lib/utils";

/** Image from private storage, fetched through a short-lived signed URL. */
export function PrivateImage({ path, alt, className, onClick }: { path: string | null; alt: string; className?: string; onClick?: () => void }) {
  const { url, failed } = useSignedUrl(path);
  if (!url) return <span className={cn("block", failed ? "grid place-items-center bg-surface-2 text-xs text-ink-faint" : "skeleton", className)}>{failed ? "Unavailable" : null}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" decoding="async" onClick={onClick} className={cn("object-cover", onClick && "cursor-zoom-in", className)} />;
}
