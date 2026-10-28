"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui/primitives";
import { safeNext } from "@/lib/safe-next";
import { auth } from "@/lib/db/client";
import { errorMessage } from "@/lib/utils";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"), mode === "signup" ? "/onboarding" : "/home");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("expired") ? "Your session ended. Please sign in again." : null);
  const [forgotOpen, setForgotOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "signup" && password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    try {
      if (mode === "login") await auth.signIn(email, password);
      else await auth.signUp(email, password, name.trim().slice(0, 40));
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      {mode === "signup" && (
        <Field label="What should your partner see you as?">
          <input className={inputClass} required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada, Sunshine…" autoComplete="nickname" />
        </Field>
      )}
      <Field label="Email">
        <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
      </Field>
      <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
        <input
          className={inputClass}
          type="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      {forgotOpen && mode === "login" && (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-soft">
          JustUs doesn&apos;t send emails, so passwords are reset by whoever looks after your JustUs server, with{" "}
          <code className="text-rose">npm run reset-password</code>. See the README.
        </p>
      )}
      <Button type="submit" loading={busy} className="w-full" size="lg">
        {mode === "login" ? "Sign in" : "Create my account"}
      </Button>
      <div className="flex items-center justify-between text-sm">
        {mode === "login" ? (
          <>
            <button type="button" onClick={() => setForgotOpen((v) => !v)} className="text-ink-soft underline-offset-2 hover:underline">
              Forgot password?
            </button>
            <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-rose">
              New here?
            </Link>
          </>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-rose">
            I already have an account
          </Link>
        )}
      </div>
    </form>
  );
}
