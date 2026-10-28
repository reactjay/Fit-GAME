"use client";
import { AnimatePresence, m } from "motion/react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "soft" | "ghost" | "danger" | "gold";

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "min-h-9 px-3.5 text-sm",
        size === "md" && "min-h-11 px-5 text-[15px]",
        size === "lg" && "min-h-13 px-7 text-base",
        variant === "primary" && "bg-rose-strong text-[var(--bubble-me-ink)] hover:brightness-110",
        variant === "soft" && "bg-surface-2 text-ink hover:bg-line",
        variant === "ghost" && "text-ink-soft hover:bg-surface-2 hover:text-ink",
        variant === "danger" && "bg-danger/15 text-danger hover:bg-danger/25",
        variant === "gold" && "bg-gold text-[#2a1d05] hover:brightness-110",
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} aria-hidden />;
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-surface-2 hover:text-ink active:scale-95 disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-2xl border border-line bg-raised px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint focus:border-rose focus:outline-none";

export function EmptyState({ emoji, title, children, action }: { emoji: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-20 w-20 place-items-center rounded-full bg-surface-2 text-4xl animate-bob" aria-hidden>
        {emoji}
      </div>
      <h3 className="font-display text-xl">{title}</h3>
      {children && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      <span>{children}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  );
}

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <m.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
          <m.div
            role="dialog"
            aria-modal
            aria-label={title}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className={cn(
              "relative max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-raised p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl",
              wide ? "sm:max-w-2xl" : "sm:max-w-md",
            )}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl">{title}</h2>
              <IconButton label="Close" onClick={onClose}>
                ✕
              </IconButton>
            </div>
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl leading-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div role="tablist" className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cn(
            "min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition",
            value === it.id ? "bg-ink text-bg" : "bg-surface text-ink-soft hover:text-ink",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
