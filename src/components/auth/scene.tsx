import { Character } from "@/components/ui/avatar";
import { Starfield } from "@/components/ui/starfield";

/** The doorway illustration used on the welcome and sign-in screens. */
export function NightScene({ compact }: { compact?: boolean }) {
  return (
    <div className={`relative mx-auto w-full ${compact ? "max-w-[280px]" : "max-w-[420px]"}`} aria-hidden>
      <svg viewBox="0 0 400 260" className="w-full">
        <defs>
          <radialGradient id="moon" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff6dc" />
            <stop offset="100%" stopColor="#e2bd78" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="win" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffd88a" />
            <stop offset="100%" stopColor="#f08a5d" />
          </linearGradient>
        </defs>
        <circle cx="320" cy="56" r="46" fill="url(#moon)" opacity=".55" />
        <circle cx="320" cy="56" r="18" fill="#fff3d1" />
        <path d="M0 220c60-30 120-36 200-24s140 6 200-14v78H0z" fill="#241a4d" />
        <path d="M0 236c80-20 160-18 240-8s120 4 160-6v38H0z" fill="#1a1338" />
        {/* house */}
        <path d="M130 200V130l70-50 70 50v70z" fill="#2e2462" />
        <path d="M118 136l82-62 82 62" stroke="#e8789a" strokeWidth="6" fill="none" strokeLinecap="round" />
        <rect x="160" y="140" width="32" height="30" rx="4" fill="url(#win)" />
        <rect x="208" y="140" width="32" height="30" rx="4" fill="url(#win)" opacity=".85" />
        <path d="M176 140v30M160 155h32M224 140v30M208 155h32" stroke="#2e2462" strokeWidth="3" />
        <rect x="190" y="176" width="20" height="24" rx="3" fill="#1a1338" />
        <rect x="236" y="88" width="12" height="26" fill="#2e2462" />
        {/* palm */}
        <path d="M78 214c4-30 2-56-6-80" stroke="#3a2f74" strokeWidth="6" fill="none" />
        <path d="M72 134c-20-6-34 2-40 12 14-6 26-6 40-2zM72 134c14-16 32-16 42-8-14 0-28 4-42 8zM72 134c-6-16 0-30 10-34-4 12-6 22-10 34zM72 134c-16 4-24 18-24 30 8-12 16-22 24-30z" fill="#3a2f74" />
      </svg>
      <div className="absolute bottom-[6%] left-[58%] flex -translate-x-1/2 items-end gap-0">
        <Character look={{ skin: 3, hair: 2, hairColor: 0, outfit: 0, accessory: 2 }} size={compact ? 46 : 62} className="animate-bob" />
        <Character look={{ skin: 4, hair: 5, hairColor: 0, outfit: 1, accessory: 0 }} size={compact ? 48 : 66} flip />
      </div>
    </div>
  );
}

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="sky relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <Starfield count={50} />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </main>
  );
}
