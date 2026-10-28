import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { MotionRoot } from "@/components/motion";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: { default: "JustUs", template: "%s · JustUs" },
  description: "A private little world for two.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0e0b1f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="midnight" className={`${fraunces.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <MotionRoot>{children}</MotionRoot>
      </body>
    </html>
  );
}
