"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { IconBack } from "@/components/ui/icons";
import { EmptyState, ErrorNote } from "@/components/ui/primitives";
import { useWorld } from "@/lib/world-context";

export function GameFrame({ title, subtitle, error, onRetry, loading, children }: { title: string; subtitle: string; error?: string | null; onRetry?: () => void; loading?: boolean; children: ReactNode }) {
  const { partner } = useWorld();
  return (
    <>
      <div className="mb-5 flex items-center gap-2">
        <Link href="/play" className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-ink-soft hover:bg-surface-2" aria-label="Back to games">
          <IconBack />
        </Link>
        <div>
          <h1 className="font-display text-2xl leading-tight">{title}</h1>
          <p className="text-sm text-ink-soft">{subtitle}</p>
        </div>
      </div>
      {error && <ErrorNote onRetry={onRetry}>{error}</ErrorNote>}
      {!partner ? (
        <EmptyState emoji="👫" title="This one needs two">
          Games unlock once your partner joins your world.
        </EmptyState>
      ) : loading ? (
        <div className="space-y-3">
          <div className="skeleton h-40" />
          <div className="skeleton h-14" />
        </div>
      ) : (
        children
      )}
    </>
  );
}

export function Scoreboard({ items }: { items: { label: string; value: number | string }[] }) {
  return (
    <div className="mb-4 flex gap-2">
      {items.map((i) => (
        <div key={i.label} className="flex-1 rounded-2xl border border-line bg-raised px-3 py-2 text-center">
          <div className="font-display text-xl text-gold">{i.value}</div>
          <div className="text-[11px] text-ink-faint">{i.label}</div>
        </div>
      ))}
    </div>
  );
}
