import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthFrame, NightScene } from "@/components/auth/scene";

export const metadata = { title: "Sign up" };

export default function Page() {
  return (
    <AuthFrame>
      <NightScene compact />
      <h1 className="mt-4 text-center font-display text-3xl">Begin your world</h1>
      <p className="mb-6 mt-2 text-center text-sm text-ink-soft">{"Create your account. Next you'll build your world or join your partner's."}</p>
      <Suspense fallback={<div className="skeleton h-80" />}>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthFrame>
  );
}
