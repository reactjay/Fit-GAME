"use client";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { InviteCard } from "@/components/auth/invite-card";
import { AvatarEditor } from "@/components/room/avatar-editor";
import { Button, Field, PageHeader, inputClass } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { requestNotificationPermission } from "@/lib/notify";
import { sfx } from "@/lib/sound";
import { auth, db } from "@/lib/db/client";
import type { Preferences } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { useActivity, useWorld } from "@/lib/world-context";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96" />}>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  useActivity("Tweaking settings ⚙️");
  const { world, me, partner, role, prefs, updateMe, updatePrefs, updateWorld } = useWorld();
  const api = db();
  const router = useRouter();
  const [name, setName] = useState(me.display_name);
  const [worldName, setWorldName] = useState(world.name);
  const [start, setStart] = useState(world.relationship_start ?? "");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy("profile");
    const [p, w] = await Promise.all([
      api.from("profiles").update({ display_name: name.trim().slice(0, 40) || "Love" }).eq("id", me.id),
      api.from("worlds").update({ name: worldName.trim().slice(0, 60) || "Our World", relationship_start: start || null }).eq("id", world.id),
    ]);
    setBusy(null);
    if (p.error || w.error) return toast(errorMessage(p.error ?? w.error), "error");
    updateMe({ display_name: name.trim() || "Love" });
    updateWorld({ name: worldName.trim() || "Our World", relationship_start: start || null });
    toast("Saved", "ok");
  }

  async function setPref<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    if ((key === "notify_messages" || key === "notify_calls") && value === true) {
      const res = await requestNotificationPermission();
      if (res === "denied") toast("Notifications are blocked for this site in your browser settings.", "error");
      if (res === "unsupported") toast("This browser doesn't support notifications.", "error");
    }
    updatePrefs({ [key]: value } as Partial<Preferences>);
    const { error } = await api.from("user_preferences").upsert({ ...prefs, user_id: me.id, [key]: value, updated_at: new Date().toISOString() });
    if (error) {
      updatePrefs({ [key]: prefs[key] } as Partial<Preferences>);
      toast(errorMessage(error), "error");
    } else if (key === "sound_enabled" && value) sfx.pop();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast("Use at least 8 characters.", "error");
    setBusy("password");
    try {
      await auth.changePassword(currentPassword, password);
      setPassword("");
      setCurrentPassword("");
      toast("Password updated — other devices were signed out", "ok");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy("signout");
    await auth.signOut().catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      <Section title="You and your world">
        <form onSubmit={saveProfile} className="space-y-4">
          <Field label="Your name">
            <input className={inputClass} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="World name">
            <input className={inputClass} maxLength={60} value={worldName} onChange={(e) => setWorldName(e.target.value)} />
          </Field>
          <Field label="Our story began on">
            <input className={inputClass} type="date" value={start} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy === "profile"}>
            Save
          </Button>
        </form>
      </Section>

      <Section title="My character">
        <AvatarEditor />
      </Section>

      {!partner && role === "creator" && <InviteCard />}

      <Section title="Preferences">
        <Toggle label="Sound effects" hint="Message pops, ringing and little chimes." checked={prefs.sound_enabled} onChange={(v) => setPref("sound_enabled", v)} />
        <Toggle label="Message notifications" hint="When JustUs is open in a background tab." checked={prefs.notify_messages} onChange={(v) => setPref("notify_messages", v)} />
        <Toggle label="Call notifications" hint="Alerts for incoming calls while the app is open." checked={prefs.notify_calls} onChange={(v) => setPref("notify_calls", v)} />
        <Toggle label="Reduce motion" hint="Turns off floating, twinkling and sliding effects." checked={prefs.reduced_motion} onChange={(v) => setPref("reduced_motion", v)} />
        <p className="pt-1 text-xs text-ink-faint">Push notifications when JustUs is fully closed aren&apos;t available in this version.</p>
        <div className="pt-3">
          <div className="mb-2 text-sm font-medium text-ink-soft">Theme</div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["midnight", "Midnight", "#0e0b1f", "#e8789a"],
                ["rose", "Rosewood", "#1a0d18", "#ffb3c6"],
                ["dawn", "Dawn", "#f8f1e7", "#b23a61"],
              ] as const
            ).map(([id, label, bg, accent]) => (
              <button key={id} onClick={() => setPref("theme", id)} aria-pressed={prefs.theme === id} className={cn("overflow-hidden rounded-2xl border-2 text-sm font-semibold", prefs.theme === id ? "border-rose" : "border-line")}>
                <span className="flex h-12 items-center justify-center gap-1" style={{ background: bg }}>
                  <span className="h-4 w-4 rounded-full" style={{ background: accent }} />
                </span>
                <span className="block bg-raised py-1.5">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Account & privacy">
        <form onSubmit={changePassword} className="space-y-3" id="password">
          <Field label="Current password">
            <input className={inputClass} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </Field>
          <Field label="New password" hint="At least 8 characters. Signs out your other devices.">
            <input className={inputClass} type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" variant="soft" loading={busy === "password"} disabled={!password || !currentPassword}>
            Update password
          </Button>
        </form>
        <ul className="mt-5 space-y-2 text-sm text-ink-soft">
          <li>🔒 Your world holds exactly two accounts. The database itself refuses anyone else.</li>
          <li>🖼️ Photos and voice notes live in private storage and are shown only to the two of you, through links that expire after an hour.</li>
          <li>📞 Calls go directly between your devices (peer-to-peer, encrypted by WebRTC). A relay server is only used when networks block direct connections.</li>
          <li>🙈 There are no ads, trackers or public pages for your world.</li>
        </ul>
        <Button variant="danger" className="mt-5" onClick={signOut} loading={busy === "signout"}>
          Sign out on this device
        </Button>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 font-display text-lg">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 border-b border-line py-2 last:border-0">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        <span className="block text-xs text-ink-faint">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={cn("relative h-7 w-12 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-rose", checked ? "bg-rose-strong" : "bg-surface-2")}>
        <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white transition-all", checked ? "left-6" : "left-1")} />
      </span>
    </label>
  );
}
