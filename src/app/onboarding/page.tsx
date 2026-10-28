import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { AuthFrame } from "@/components/auth/scene";
import { getSessionUser } from "@/lib/server/auth";
import { pool } from "@/lib/server/pg";

export const metadata = { title: "Welcome" };

export default async function Onboarding() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/onboarding");
  const { rows } = await pool().query(
    "select p.display_name, exists (select 1 from public.world_members m where m.user_id = p.id) as member from public.profiles p where p.id = $1",
    [user.id],
  );
  if (rows[0]?.member) redirect("/home");
  const profile = rows[0] as { display_name: string } | undefined;

  return (
    <AuthFrame>
      <h1 className="text-center font-display text-3xl">Hello, {profile?.display_name ?? "love"}</h1>
      <p className="mb-6 mt-2 text-center text-sm text-ink-soft">Every world here has room for exactly two.</p>
      <OnboardingForm defaultName={profile?.display_name ?? ""} userId={user.id} />
    </AuthFrame>
  );
}
