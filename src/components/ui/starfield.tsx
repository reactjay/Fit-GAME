import { hashString } from "@/lib/utils";

// CSS-only twinkling stars; positions are deterministic so server and client agree.
export function Starfield({ count = 40, className = "" }: { count?: number; className?: string }) {
  const stars = Array.from({ length: count }, (_, i) => {
    const h = hashString(`star-${i}`);
    return {
      left: (h % 1000) / 10,
      top: ((h >>> 10) % 1000) / 10,
      size: 1 + ((h >>> 20) % 3) * 0.6,
      delay: ((h >>> 4) % 35) / 10,
      gold: i % 9 === 0,
    };
  });
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full animate-twinkle"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            background: s.gold ? "var(--gold)" : "var(--ink)",
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
