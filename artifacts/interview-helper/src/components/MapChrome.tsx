import type { CSSProperties } from 'react';
import { CORE_ANCHORS } from '@/lib/city-config';

/**
 * Shared "visitor pamphlet" map chrome — the motifs that make all three map
 * surfaces (the VISITOR MAP overview, the paper chart, the in-world minimap)
 * read as one playful tourist-brochure family instead of three unrelated UIs.
 *
 * Keep this visual-only. The data + interactions live in each map.
 */

export type AnchorType = typeof CORE_ANCHORS[number]['type'];

/**
 * Friendly, tourist-pamphlet treatment for every landmark category: a toy
 * emoji sticker, a short tag, and a stable accent color. Drives the markers,
 * legends and minimap dots across every map so they match.
 */
export const LANDMARK_GUIDE: Record<AnchorType, { icon: string; tag: string; color: string }> = {
  tower:      { icon: '◆', tag: 'LANDMARK', color: '#c084fc' },
  security:   { icon: '✚', tag: 'POLICE',   color: '#f87171' },
  commerce:   { icon: '◇', tag: 'SHOPS',    color: '#34d399' },
  civic:      { icon: '▣', tag: 'CIVIC',    color: '#fbbf24' },
  realestate: { icon: '⌂', tag: 'HOMES',    color: '#a78bfa' },
  terminal:   { icon: '▤', tag: 'TERMINAL', color: '#38bdf8' },
};

/** Decorative compass rose — the shared "you are holding a printed map" cue. */
export function CompassRose({
  size = 56,
  color = '#e6cfa3',
  accent,
  className = '',
  style,
}: {
  size?: number;
  color?: string;
  accent?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const a = accent ?? color;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="2" opacity="0.5" />
      <circle cx="50" cy="50" r="37" fill="none" stroke={color} strokeWidth="1" opacity="0.3" />
      <polygon points="50,18 53,47 82,50 53,53 50,82 47,53 18,50 47,47" fill={a} opacity="0.45" transform="rotate(45 50 50)" />
      <polygon points="50,6 56,44 94,50 56,56 50,94 44,56 6,50 44,44" fill={color} opacity="0.9" />
      <circle cx="50" cy="50" r="4" fill={a} />
      <text x="50" y="15" textAnchor="middle" fontSize="13" fontFamily="var(--font-sans)" fontWeight="bold" fill={a}>N</text>
    </svg>
  );
}

/** Little stamped "welcome" ribbon used as a pamphlet title cartouche. */
export function PamphletBanner({
  title = 'VISITOR MAP',
  subtitle = 'WELCOME TO MINX CITY',
  color = '#38bdf8',
  bg = 'rgba(8,12,20,0.82)',
  className = '',
  style,
}: {
  title?: string;
  subtitle?: string;
  color?: string;
  bg?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        background: bg,
        border: `1px solid ${color}55`,
        borderRadius: 6,
        padding: '5px 12px',
        textAlign: 'center',
        backdropFilter: 'blur(4px)',
        boxShadow: `0 0 18px ${color}22`,
        ...style,
      }}
    >
      <div style={{ fontSize: '0.5rem', letterSpacing: '0.3em', color: `${color}aa`, fontFamily: "var(--font-sans)" }}>
        ★ {subtitle} ★
      </div>
      <div style={{ fontSize: '0.78rem', letterSpacing: '0.22em', color, fontWeight: 700, fontFamily: "var(--font-sans)" }}>
        {title}
      </div>
    </div>
  );
}
