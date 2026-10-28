"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorNote } from "@/components/ui/primitives";
import { db } from "@/lib/db/client";
import { errorMessage } from "@/lib/utils";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    const { error } = await db().rpc("accept_invitation", { p_token: token });
    if (error) {
      setBusy(false);
      return setError(/full/.test(error.message) ? "This world already has two people in it." : errorMessage(error));
    }
    router.replace("/home");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-3">
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button onClick={accept} loading={busy} size="lg" className="w-full">
        Move in 💞
      </Button>
    </div>
  );
}
