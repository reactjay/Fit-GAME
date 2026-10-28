import { redirect } from "next/navigation";
import { WorldShell } from "@/components/shell/world-shell";
import { DEFAULT_LOOK } from "@/components/ui/avatar";
import { getSessionUser } from "@/lib/server/auth";
import { asUser } from "@/lib/server/pg";
import type { Preferences, Profile, World } from "@/lib/types";

// Server-side gate for every world page: a valid session for a member of a world.
// (Postgres RLS enforces the same rule again on every query.)
export default async function WorldLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const data = await asUser(user.id, async (c) => {
    const member = (await c.query("select world_id, role from public.world_members where user_id = $1", [user.id])).rows[0];
    if (!member) return null;
    // One connection runs one query at a time, so these are sequential.
    const world = await c.query("select id, name, relationship_start, created_by, points, created_at from public.worlds where id = $1", [member.world_id]);
    const profiles = await c.query("select p.id, p.display_name, p.avatar from public.profiles p join public.world_members m on m.user_id = p.id where m.world_id = $1", [member.world_id]);
    const prefs = await c.query("select * from public.user_preferences where user_id = $1", [user.id]);
    return { role: member.role as "creator" | "partner", world: world.rows[0] as World, profiles: profiles.rows as Profile[], prefs: prefs.rows[0] as Preferences | undefined };
  });
  if (!data?.world) redirect("/onboarding");

  const me = data.profiles.find((p) => p.id === user.id) ?? { id: user.id, display_name: "Me", avatar: DEFAULT_LOOK };
  const partner = data.profiles.find((p) => p.id !== user.id) ?? null;
  const preferences: Preferences = data.prefs ?? {
    user_id: user.id,
    sound_enabled: true,
    notify_messages: true,
    notify_calls: true,
    theme: "midnight",
    reduced_motion: false,
  };

  return (
    <WorldShell world={JSON.parse(JSON.stringify(data.world))} me={me} partner={partner} role={data.role} prefs={preferences}>
      {children}
    </WorldShell>
  );
}
