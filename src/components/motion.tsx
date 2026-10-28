"use client";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { Toaster } from "@/components/ui/toast";

// Loads only the DOM animation subset of Motion (smaller bundle) and honours reduced motion.
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster />
      </MotionConfig>
    </LazyMotion>
  );
}
