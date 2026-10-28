import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthFrame, NightScene } from "@/components/auth/scene";

export const metadata = { title: "Sign in" };

export default function Page() {
  return (
    <AuthFrame>
      <NightScene compact />
      <h1 className="mt-4 text-center font-display text-3xl">Welcome home</h1>
      <p className="mb-6 mt-2 text-center text-sm text-ink-soft">Sign in to step back into your world.</p>
      <Suspense fallback={<div className="skeleton h-80" />}>
        <AuthForm mode="login" />
      </Suspense>
    </AuthFrame>
  );
}
