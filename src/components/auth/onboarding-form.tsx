"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { InviteCard } from "@/components/auth/invite-card";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui/primitives";
import { db } from "@/lib/db/client";
import { errorMessage } from "@/lib/utils";

export function OnboardingForm({ defaultName, userId }: { defaultName: string; userId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"choose" | "create" | "join" | "invite">("choose");
  const [worldName, setWorldName] = useState("");
  const [start, setStart] = useState("");
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const api = db();
    if (name.trim()) await api.from("profiles").update({ display_name: name.trim().slice(0, 40) }).eq("id", userId);
    const { error } = await api.rpc("create_world", { p_name: worldName || "Our World", p_start: start || null });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setStep("invite");
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const token = code.trim().split("/join/").pop()?.replace(/[^a-f0-9]/gi, "");
    if (!token || token.length < 20) return setError("That doesn't look like an invite link. Paste the whole link your partner sent.");
    router.push(`/join/${token}`);
  }

  if (step === "invite") {
    return (
      <div className="space-y-4">
        <div className="card p-5 text-center">
          <div className="text-4xl">🏡</div>
          <h2 className="mt-2 font-display text-2xl">Your world is ready</h2>
          <p className="mt-1 text-sm text-ink-soft">Now invite the one person who belongs here.</p>
        </div>
        <InviteCard />
        <Button variant="soft" className="w-full" onClick={() => (router.replace("/home"), router.refresh())}>
          Step inside
        </Button>
      </div>
    );
  }

  if (step === "choose") {
    return (
      <div className="grid gap-3">
        <button onClick={() => setStep("create")} className="card p-5 text-left transition hover:border-rose">
          <div className="text-2xl">✨</div>
          <div className="mt-2 font-display text-xl">Create our world</div>
          <p className="mt-1 text-sm text-ink-soft">You&apos;ll get a private invite link for your partner.</p>
        </button>
        <button onClick={() => setStep("join")} className="card p-5 text-left transition hover:border-rose">
          <div className="text-2xl">💌</div>
          <div className="mt-2 font-display text-xl">I have an invitation</div>
          <p className="mt-1 text-sm text-ink-soft">Paste the link your partner sent you.</p>
        </button>
      </div>
    );
  }

  return step === "create" ? (
    <form onSubmit={create} className="card space-y-4 p-6">
      <Field label="Your name">
        <input className={inputClass} required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Name your world" hint="You can change this later.">
        <input className={inputClass} maxLength={60} value={worldName} onChange={(e) => setWorldName(e.target.value)} placeholder="Our Little Corner" />
      </Field>
      <Field label="When did your story begin?" hint="Optional — used for anniversaries and your day count.">
        <input className={inputClass} type="date" value={start} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setStart(e.target.value)} />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={() => setStep("choose")}>
          Back
        </Button>
        <Button type="submit" loading={busy} className="flex-1">
          Create our world
        </Button>
      </div>
    </form>
  ) : (
    <form onSubmit={join} className="card space-y-4 p-6">
      <Field label="Invitation link">
        <input className={inputClass} required value={code} onChange={(e) => setCode(e.target.value)} placeholder="https://…/join/…" />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={() => setStep("choose")}>
          Back
        </Button>
        <Button type="submit" className="flex-1">
          Continue
        </Button>
      </div>
    </form>
  );
}
