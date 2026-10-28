import Link from "next/link";
import { redirect } from "next/navigation";
import { AcceptInvite } from "@/components/auth/accept-invite";
import { AuthFrame, NightScene } from "@/components/auth/scene";
import { getSessionUser } from "@/lib/server/auth";
import { asUser } from "@/lib/server/pg";

export const metadata = { title: "You're invited" };

export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/[^a-f0-9]/gi, "").slice(0, 96);
  const user = await getSessionUser();
  if (!user) redirect(`/signup?next=${encodeURIComponent(`/join/${clean}`)}`);

  const { member, p } = await asUser(user.id, async (c) => ({
    member: Boolean((await c.query("select 1 from public.world_members where user_id = $1", [user.id])).rowCount),
    p: (await c.query("select public.invitation_preview($1) as p", [clean])).rows[0].p as { valid: boolean; world?: string; inviter?: string },
  }));

  return (
    <AuthFrame>
      <NightScene compact />
      <div className="card mt-6 p-6 text-center">
        {member ? (
          <>
            <h1 className="font-display text-2xl">You already have a world</h1>
            <p className="mt-2 text-sm text-ink-soft">Each account belongs to exactly one world. Sign in with a different account to accept this invite.</p>
            <Link href="/home" className="mt-5 inline-block font-semibold text-rose">
              Go to my world →
            </Link>
          </>
        ) : p.valid ? (
          <>
            <p className="text-sm text-ink-soft">{p.inviter} invited you into</p>
            <h1 className="mt-1 font-display text-3xl">{p.world}</h1>
            <AcceptInvite token={clean} />
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl">This invitation has closed</h1>
            <p className="mt-2 text-sm text-ink-soft">It may have expired, already been used, or been replaced by a newer link. Ask your partner to send a fresh one.</p>
          </>
        )}
      </div>
    </AuthFrame>
  );
}
