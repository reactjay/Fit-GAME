import type { SceneKey } from "@/content/stories";

// Original, code-drawn illustrations for story pages — tiny, themable, no image downloads.
export function StoryScene({ scene, palette, className }: { scene: SceneKey; palette: [string, string]; className?: string }) {
  const [a, b] = palette;
  const id = `g-${scene}`;
  return (
    <svg viewBox="0 0 400 200" className={className} role="img" aria-label={`Illustration: ${scene.replace("-", " ")}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={b} />
          <stop offset="100%" stopColor={a} />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill={`url(#${id})`} />
      {(scene === "stars" || scene === "sky" || scene === "dragon" || scene === "city-night") &&
        Array.from({ length: 26 }, (_, i) => <circle key={i} cx={(i * 97) % 400} cy={(i * 53) % 120} r={i % 4 === 0 ? 1.6 : 0.9} fill="#fff8e6" opacity={0.5 + (i % 3) * 0.2} />)}
      {scene === "city-night" && (
        <g>
          {[0, 40, 70, 110, 150, 200, 235, 270, 320, 355].map((x, i) => (
            <g key={x}>
              <rect x={x} y={100 - (i % 4) * 18} width="34" height={100 + (i % 4) * 18} fill="#1a1338" />
              {Array.from({ length: 4 }, (_, j) => (
                <rect key={j} x={x + 6 + (j % 2) * 14} y={112 - (i % 4) * 18 + Math.floor(j / 2) * 22} width="7" height="9" fill="#ffd88a" opacity={(i + j) % 3 ? 0.9 : 0.25} />
              ))}
            </g>
          ))}
          <rect x="0" y="182" width="400" height="18" fill="#120d29" />
          <rect x="150" y="168" width="64" height="22" rx="5" fill="#f2c94c" />
          <rect x="156" y="172" width="40" height="8" fill="#1a1338" />
          <circle cx="164" cy="191" r="5" fill="#120d29" />
          <circle cx="202" cy="191" r="5" fill="#120d29" />
        </g>
      )}
      {scene === "bridge" && (
        <g>
          <circle cx="300" cy="90" r="34" fill="#ffd88a" opacity=".9" />
          <rect x="0" y="130" width="400" height="70" fill="#2e2462" />
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={i} x={i * 44} y={150 + (i % 2) * 8} width="26" height="2" fill="#ffd88a" opacity=".5" />
          ))}
          <rect x="0" y="118" width="400" height="10" fill="#1a1338" />
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} x={i * 50 + 10} y="126" width="8" height="74" fill="#1a1338" />
          ))}
        </g>
      )}
      {scene === "market" && (
        <g>
          {[20, 120, 220, 320].map((x, i) => (
            <g key={x}>
              <path d={`M${x} 110l30-26 30 26z`} fill={i % 2 ? "#e8789a" : "#e2bd78"} />
              <rect x={x + 4} y="110" width="52" height="50" fill="#2e2462" />
              <circle cx={x + 18} cy="132" r="7" fill="#f08a5d" />
              <circle cx={x + 38} cy="134" r="6" fill="#8fe3b5" />
            </g>
          ))}
          <path d="M0 80q100 20 200 0t200 0" stroke="#fff3d1" strokeWidth="1.5" fill="none" />
          {Array.from({ length: 12 }, (_, i) => (
            <circle key={i} cx={i * 34 + 16} cy={84 + Math.sin(i) * 4} r="3" fill="#ffd88a" />
          ))}
          <rect x="0" y="160" width="400" height="40" fill="#1a1338" />
        </g>
      )}
      {scene === "rain" && (
        <g>
          <rect x="0" y="0" width="400" height="200" fill="#1a1338" opacity=".35" />
          {Array.from({ length: 60 }, (_, i) => (
            <line key={i} x1={(i * 37) % 400} y1={(i * 23) % 200} x2={((i * 37) % 400) - 6} y2={((i * 23) % 200) + 16} stroke="#dfe8ff" strokeWidth="1.2" opacity=".55" />
          ))}
          <path d="M120 120h160l-14 -24h-132z" fill="#e8789a" />
          <rect x="130" y="120" width="140" height="80" fill="#2e2462" />
          <rect x="150" y="140" width="40" height="30" fill="#ffd88a" opacity=".85" />
        </g>
      )}
      {scene === "beach" && (
        <g>
          <circle cx="90" cy="70" r="28" fill="#fff3d1" />
          <path d="M0 120q50-10 100 0t100 0 100 0 100 0v80H0z" fill="#3c7bd9" opacity=".8" />
          <path d="M0 150q60-14 140 0t260 0v50H0z" fill="#f2d6a2" />
          <path d="M320 150c2-30 0-50-8-66" stroke="#3a2f74" strokeWidth="5" fill="none" />
          <path d="M312 84c-18-4-28 4-32 12 12-6 22-6 32-4zM312 84c10-14 26-14 34-6-12 0-22 2-34 6z" fill="#2f9e8f" />
        </g>
      )}
      {scene === "forest" && (
        <g>
          <circle cx="320" cy="50" r="18" fill="#fff3d1" opacity=".8" />
          <path d="M150 200c10-60 0-90 0-110h100c0 20-10 50 0 110z" fill="#5a4630" />
          <path d="M120 96c20-40 140-40 160 0-30-10-130-10-160 0z" fill="#2f5e4f" />
          <ellipse cx="200" cy="150" rx="16" ry="22" fill="#ffd88a" />
          <circle cx="210" cy="152" r="2.5" fill="#5a4630" />
          {[30, 70, 330, 370].map((x) => (
            <path key={x} d={`M${x} 200l20-70 20 70z`} fill="#1f3f37" />
          ))}
        </g>
      )}
      {scene === "sky" && (
        <g>
          {Array.from({ length: 18 }, (_, i) => (
            <g key={i} transform={`translate(${(i * 71) % 380 + 10} ${(i * 41) % 140 + 20})`}>
              <rect x="-5" y="-7" width="10" height="14" rx="3" fill="#ffd88a" opacity={0.4 + (i % 4) * 0.15} />
              <rect x="-2" y="-10" width="4" height="3" fill="#e8789a" />
            </g>
          ))}
          <ellipse cx="110" cy="170" rx="70" ry="16" fill="#fff3d1" opacity=".35" />
          <ellipse cx="300" cy="180" rx="90" ry="18" fill="#fff3d1" opacity=".3" />
        </g>
      )}
      {scene === "castle" && (
        <g>
          <circle cx="200" cy="60" r="40" fill="#ffd88a" opacity=".6" />
          <path d="M120 200V110h20v-14h12v14h22v-30h52v30h22v-14h12v14h20v90z" fill="#2e2462" />
          <path d="M174 80l26-30 26 30z" fill="#e8789a" />
          <rect x="190" y="150" width="20" height="50" rx="10" fill="#ffd88a" />
        </g>
      )}
      {scene === "dragon" && (
        <g>
          <circle cx="200" cy="96" r="30" fill="#2e2462" stroke="#ffd88a" strokeOpacity=".4" strokeWidth="2" />
          <path d="M60 170c40-60 100-10 140-50s80-60 140 0c-40-20-70 0-100 30s-90 50-180 20z" fill="#120d29" />
          <circle cx="300" cy="118" r="3" fill="#f08a5d" />
          <circle cx="312" cy="116" r="3" fill="#f08a5d" />
        </g>
      )}
      {scene === "kitchen" && (
        <g>
          <rect x="0" y="130" width="400" height="70" fill="#2e2462" />
          <rect x="0" y="126" width="400" height="8" fill="#e2bd78" />
          <rect x="40" y="40" width="80" height="60" rx="6" fill="#ffd88a" opacity=".8" />
          <path d="M80 40v60M40 70h80" stroke="#2e2462" strokeWidth="4" />
          <ellipse cx="250" cy="122" rx="40" ry="8" fill="#1a1338" />
          <rect x="288" y="118" width="40" height="5" rx="2" fill="#1a1338" />
          <ellipse cx="250" cy="116" rx="26" ry="6" fill="#e2bd78" />
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={240 + i * 12} cy={90 - i * 14} r={8 + i * 3} fill="#fff" opacity={0.25 - i * 0.05} />
          ))}
        </g>
      )}
      {scene === "home" && (
        <g>
          <rect x="0" y="150" width="400" height="50" fill="#2e2462" />
          <rect x="60" y="40" width="120" height="80" rx="8" fill="#1a1338" />
          {Array.from({ length: 8 }, (_, i) => (
            <circle key={i} cx={70 + i * 14} cy={50 + (i % 3) * 22} r="1.4" fill="#fff8e6" />
          ))}
          <path d="M220 150v-40a14 14 0 0 1 14-14h100a14 14 0 0 1 14 14v40z" fill="#e8789a" />
          <rect x="210" y="130" width="148" height="24" rx="10" fill="#c2476e" />
          <path d="M120 150v-50M110 100h20l-6-16h-8z" stroke="#e2bd78" strokeWidth="3" fill="#ffd88a" />
        </g>
      )}
      {scene === "stars" && (
        <g>
          <path d="M0 170q100-30 200-10t200-10v50H0z" fill="#1a1338" />
          <circle cx="300" cy="60" r="20" fill="#fff3d1" />
          <circle cx="292" cy="54" r="20" fill={b} />
        </g>
      )}
    </svg>
  );
}
