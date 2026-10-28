"use client";
import { useState } from "react";
import { ACCESSORIES, Character, HAIR_COLORS, HAIR_STYLES, OUTFITS, SKINS } from "@/components/ui/avatar";
import { Button } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { db } from "@/lib/db/client";
import type { AvatarLook } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorld } from "@/lib/world-context";

export function AvatarEditor({ onSaved }: { onSaved?: () => void }) {
  const { me, updateMe } = useWorld();
  const [look, setLook] = useState<AvatarLook>(me.avatar);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof AvatarLook, v: number) => setLook((l) => ({ ...l, [k]: v }));

  async function save() {
    setBusy(true);
    const { error } = await db().from("profiles").update({ avatar: look }).eq("id", me.id);
    setBusy(false);
    if (error) return toast("Couldn't save your look — try again.", "error");
    updateMe({ avatar: look });
    toast("Looking good ✨", "ok");
    onSaved?.();
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
      <div className="mx-auto grid h-48 w-40 place-items-end justify-center rounded-3xl bg-surface-2">
        <Character look={look} size={130} />
      </div>
      <div className="space-y-4">
        <Swatches label="Skin" colors={SKINS} value={look.skin} onChange={(v) => set("skin", v)} />
        <Options label="Hair" options={HAIR_STYLES} value={look.hair} onChange={(v) => set("hair", v)} />
        <Swatches label="Hair colour" colors={HAIR_COLORS} value={look.hairColor} onChange={(v) => set("hairColor", v)} />
        <Swatches label="Outfit" colors={OUTFITS} value={look.outfit} onChange={(v) => set("outfit", v)} />
        <Options label="Accessory" options={ACCESSORIES} value={look.accessory} onChange={(v) => set("accessory", v)} />
        <Button onClick={save} loading={busy} className="w-full">
          Save my look
        </Button>
      </div>
    </div>
  );
}

function Swatches({ label, colors, value, onChange }: { label: string; colors: string[]; value: number; onChange: (v: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-soft">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {colors.map((c, i) => (
          <button key={c} onClick={() => onChange(i)} aria-label={`${label} ${i + 1}`} aria-pressed={value === i} className={cn("h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-raised", value === i ? "ring-rose" : "ring-transparent")} style={{ background: c }} />
        ))}
      </div>
    </fieldset>
  );
}

function Options({ label, options, value, onChange }: { label: string; options: string[]; value: number; onChange: (v: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-soft">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o, i) => (
          <button key={o} onClick={() => onChange(i)} aria-pressed={value === i} className={cn("min-h-9 rounded-full px-3 text-sm font-medium", value === i ? "bg-ink text-bg" : "bg-surface-2 text-ink-soft")}>
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
