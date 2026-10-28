import type { AvatarLook } from "@/lib/types";
import { cn } from "@/lib/utils";

export const SKINS = ["#f6d7c3", "#e9b893", "#c98d62", "#a3683f", "#7a4a2a", "#4f2f1b"];
export const HAIR_COLORS = ["#1b1414", "#4a2c1d", "#8a3b24", "#d9b36a", "#6b3f8f"];
export const OUTFITS = ["#e8789a", "#6f63d9", "#2f9e8f", "#e2bd78", "#c2476e", "#3c7bd9"];
export const HAIR_STYLES = ["Short", "Afro", "Long braids", "Bun", "Locs", "Fade"];
export const ACCESSORIES = ["None", "Glasses", "Flower", "Gele", "Fila", "Earrings"];

export const DEFAULT_LOOK: AvatarLook = { skin: 2, hair: 0, hairColor: 0, outfit: 0, accessory: 0 };

/** An original, lightweight SVG character. Drawn in code so it costs no image downloads. */
export function Character({ look = DEFAULT_LOOK, size = 96, className, flip }: { look?: AvatarLook; size?: number; className?: string; flip?: boolean }) {
  const skin = SKINS[look.skin % SKINS.length];
  const hair = HAIR_COLORS[look.hairColor % HAIR_COLORS.length];
  const outfit = OUTFITS[look.outfit % OUTFITS.length];
  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2} className={className} style={flip ? { transform: "scaleX(-1)" } : undefined} aria-hidden>
      {/* body */}
      <path d="M22 118c0-24 12-38 28-38s28 14 28 38z" fill={outfit} />
      <path d="M40 82c3 6 17 6 20 0" stroke="#0003" strokeWidth="3" fill="none" />
      <rect x="44" y="66" width="12" height="14" rx="5" fill={skin} />
      {/* hair behind */}
      {look.hair === 2 && <path d="M24 44c0-22 52-22 52 0v44c-6 4-10-4-10-10V52H34v26c0 6-4 14-10 10z" fill={hair} />}
      {look.hair === 4 && (
        <g fill={hair}>
          {[26, 33, 40, 60, 67, 74].map((x) => (
            <rect key={x} x={x - 3} y="38" width="6" height="40" rx="3" />
          ))}
        </g>
      )}
      {look.hair === 1 && <circle cx="50" cy="40" r="30" fill={hair} />}
      {/* head */}
      <ellipse cx="50" cy="46" rx="22" ry="24" fill={skin} />
      {/* face */}
      <ellipse cx="42" cy="48" rx="2.4" ry="3" fill="#1b1414" />
      <ellipse cx="58" cy="48" rx="2.4" ry="3" fill="#1b1414" />
      <circle cx="37" cy="56" r="4" fill="#e8789a" opacity=".35" />
      <circle cx="63" cy="56" r="4" fill="#e8789a" opacity=".35" />
      <path d="M44 58c3 3.5 9 3.5 12 0" stroke="#1b1414" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {/* hair front */}
      {look.hair === 0 && <path d="M28 42c0-18 44-20 44 0-8-8-22-10-30-4-6 0-10 2-14 4z" fill={hair} />}
      {look.hair === 1 && <path d="M28 38c4-12 40-12 44 0-10-6-34-6-44 0z" fill={hair} />}
      {look.hair === 2 && <path d="M28 42c2-20 42-20 44 0-12-10-32-10-44 0z" fill={hair} />}
      {look.hair === 3 && (
        <g fill={hair}>
          <circle cx="50" cy="16" r="10" />
          <path d="M28 42c0-20 44-20 44 0-12-9-32-9-44 0z" />
        </g>
      )}
      {look.hair === 4 && <path d="M27 42c1-21 45-21 46 0-12-9-34-9-46 0z" fill={hair} />}
      {look.hair === 5 && <path d="M30 36c4-12 36-12 40 0-12-5-28-5-40 0z" fill={hair} opacity=".85" />}
      {/* accessories */}
      {look.accessory === 1 && (
        <g stroke="#1b1414" strokeWidth="2" fill="#ffffff22">
          <circle cx="42" cy="48" r="6" />
          <circle cx="58" cy="48" r="6" />
          <path d="M48 48h4" />
        </g>
      )}
      {look.accessory === 2 && (
        <g transform="translate(66 30)">
          {[0, 72, 144, 216, 288].map((r) => (
            <ellipse key={r} rx="3.2" ry="5.5" cy="-4" fill="#f3a6bd" transform={`rotate(${r})`} />
          ))}
          <circle r="2.6" fill="#e2bd78" />
        </g>
      )}
      {look.accessory === 3 && (
        <g>
          <path d="M24 34c4-20 48-22 52 0-6 4-46 4-52 0z" fill={outfit} />
          <path d="M30 22c10-10 34-10 42 2l8-10c-4 12-10 16-10 16" fill={outfit} stroke="#0002" strokeWidth="1.5" />
          <path d="M30 30c12-4 30-4 42 0" stroke="#0003" strokeWidth="2" fill="none" />
        </g>
      )}
      {look.accessory === 4 && (
        <g>
          <path d="M30 32c0-14 40-14 40 0 0 3-40 3-40 0z" fill={outfit} />
          <path d="M30 32c6-1 34-1 40 0" stroke="#0003" strokeWidth="2" />
          <path d="M60 22l10 6" stroke="#0003" strokeWidth="2" />
        </g>
      )}
      {look.accessory === 5 && (
        <g fill="#e2bd78">
          <circle cx="28" cy="58" r="3" />
          <circle cx="72" cy="58" r="3" />
        </g>
      )}
    </svg>
  );
}

/** Round avatar (head and shoulders crop) with optional presence dot. */
export function Avatar({
  look,
  size = 40,
  status,
  className,
  label,
}: {
  look?: AvatarLook;
  size?: number;
  status?: "online" | "offline" | "connecting";
  className?: string;
  label?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label}>
      <span className="block h-full w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
        <span className="block" style={{ marginTop: -size * 0.04, marginLeft: -size * 0.18 }}>
          <Character look={look} size={size * 1.36} />
        </span>
      </span>
      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 block rounded-full ring-2 ring-bg",
            status === "online" ? "bg-ok" : status === "connecting" ? "bg-gold animate-twinkle" : "bg-ink-faint",
          )}
          style={{ width: Math.max(9, size * 0.26), height: Math.max(9, size * 0.26) }}
        />
      )}
    </span>
  );
}
