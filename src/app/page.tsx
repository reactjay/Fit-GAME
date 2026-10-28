import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame, NightScene } from "@/components/auth/scene";
import { getSessionUser } from "@/lib/server/auth";

export default async function Welcome() {
  if (await getSessionUser()) redirect("/home");

  return (
    <AuthFrame>
      <div className="text-center">
        <NightScene />
        <h1 className="mt-6 font-display text-5xl tracking-tight">JustUs</h1>
        <p className="mx-auto mt-3 max-w-xs text-ink-soft">A tiny private world with room for exactly two. Talk, play, read, wander Lagos, and keep every little memory.</p>
        <div className="mt-8 flex flex-col gap-3">
          <Link href="/login" className="inline-flex min-h-12 items-center justify-center rounded-full bg-rose-strong px-6 font-semibold text-[var(--bubble-me-ink)] hover:brightness-110">
            Open our world
          </Link>
          <Link href="/signup" className="inline-flex min-h-12 items-center justify-center rounded-full bg-surface-2 px-6 font-semibold text-ink hover:bg-line">
            Begin a new world
          </Link>
        </div>
        <p className="mt-6 text-xs text-ink-faint">Got an invitation? Open the link your partner sent — it brings you right in.</p>
      </div>
    </AuthFrame>
  );
}
