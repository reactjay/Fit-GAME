"use client";
import { AnimatePresence, m } from "motion/react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type Toast = { id: number; text: string; tone: "info" | "ok" | "error" | "gold" };
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  listeners.forEach((l) => l());
}

export function toast(text: string, tone: Toast["tone"] = "info") {
  const t = { id: nextId++, text, tone };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, 3800);
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {list.map((t) => (
          <m.div
            key={t.id}
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            className={cn(
              "pointer-events-auto max-w-md rounded-2xl border px-4 py-2.5 text-sm font-medium shadow-lg",
              t.tone === "error" && "border-danger/40 bg-[#2b1020] text-danger",
              t.tone === "ok" && "border-ok/30 bg-raised text-ink",
              t.tone === "gold" && "border-gold/40 bg-raised text-gold",
              t.tone === "info" && "border-line bg-raised text-ink",
            )}
          >
            {t.text}
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
