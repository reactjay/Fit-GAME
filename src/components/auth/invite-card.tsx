"use client";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/primitives";
import { db } from "@/lib/db/client";
import { errorMessage } from "@/lib/utils";

/** Creator-only: mints a single-use invite link (valid 7 days) for the partner. */
export function InviteCard({ initialLink }: { initialLink?: string | null }) {
  const [link, setLink] = useState<string | null>(initialLink ?? null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const { data, error } = await db().rpc("create_invitation");
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    setLink(`${location.origin}/join/${data as string}`);
  }

  async function share() {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Come home to JustUs", text: "I made us a little world 💞", url: link });
        return;
      } catch {
        /* user closed the share sheet — fall back to copy */
      }
    }
    await navigator.clipboard.writeText(link).then(
      () => toast("Invite link copied", "ok"),
      () => toast("Couldn't copy — select the link and copy it manually.", "error"),
    );
  }

  return (
    <div className="card p-5">
      <h3 className="font-display text-lg">Invite your person</h3>
      <p className="mt-1 text-sm text-ink-soft">This link works once, for one person, and expires in 7 days. Making a new one cancels the old one.</p>
      {link ? (
        <>
          <div className="mt-4 select-all break-all rounded-2xl border border-line bg-raised px-4 py-3 font-mono text-xs text-ink-soft">{link}</div>
          <div className="mt-3 flex gap-2">
            <Button onClick={share} className="flex-1">
              Share link
            </Button>
            <Button variant="soft" onClick={create} loading={busy}>
              New link
            </Button>
          </div>
        </>
      ) : (
        <Button onClick={create} loading={busy} className="mt-4 w-full">
          Create invite link
        </Button>
      )}
    </div>
  );
}
