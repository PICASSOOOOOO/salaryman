import type React from 'react';

export interface PropertyCardProps {
  img: string;
  label: string;
  tagline: string;
  desc?: string;
  priceLabel: string;
  selected?: boolean;
  isCurrent?: boolean;
  locked?: boolean;
  lockReason?: string;
  badge?: string;
  badgeColor?: string;
  onSelect?: () => void;
  actionLabel?: string;
  boomer?: boolean;
}

/**
 * Shared property-tier marketplace card.
 *
 * Matches the estate-step card style from PabloOnboarding (16:9 hero image,
 * bottom vignette, selected glow, body with label + price + tagline + desc).
 *
 * Used in:
 *   • PabloOnboarding — estate step (office/home tier picker)
 *   • WorldPlay — housing management panel (post-onboarding upgrade flow)
 */
export function PropertyCard({
  img,
  label,
  tagline,
  desc,
  priceLabel,
  selected,
  isCurrent,
  locked,
  lockReason,
  badge,
  badgeColor,
  onSelect,
  actionLabel,
  boomer,
}: PropertyCardProps) {
  const VT: React.CSSProperties = boomer ? {} : { fontFamily: "var(--font-sans)" };
  const ST: React.CSSProperties = boomer ? {} : { fontFamily: "var(--font-sans)" };

  const accentFull = 'rgba(56,189,248,1)';
  const accentFade = 'rgba(56,189,248,0.45)';
  const opacity = locked ? 0.44 : selected || isCurrent ? 1 : 0.7;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!onSelect || locked}
      style={{
        background: selected || isCurrent ? 'rgba(56,189,248,.09)' : 'rgba(14,21,33,.85)',
        border: selected || isCurrent
          ? '1px solid rgba(56,189,248,.75)'
          : locked
          ? '1px solid rgba(255,255,255,.08)'
          : '1px solid rgba(56,189,248,.14)',
        boxShadow:
          selected || isCurrent
            ? '0 0 18px rgba(56,189,248,.22), inset 0 0 24px rgba(56,189,248,.05)'
            : 'none',
        padding: 0,
        cursor: onSelect && !locked ? 'pointer' : 'default',
        textAlign: 'left',
        opacity,
        transition: 'opacity .12s, box-shadow .12s, border-color .12s',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', flexShrink: 0 }}>
        <img
          src={img}
          alt={label}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', imageRendering: 'pixelated' }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(180deg, transparent 55%, rgba(3,6,15,.75) 100%)',
          }}
        />
        {(selected || isCurrent) && (
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              border: '2px solid rgba(56,189,248,.5)',
              boxShadow: 'inset 0 0 20px rgba(56,189,248,.15)',
            }}
          />
        )}
        {locked && (
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'rgba(0,0,0,.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{ ...ST, fontSize: '.45rem', color: 'rgba(255,100,100,.8)', letterSpacing: '.12em' }}>
              LOCKED
            </span>
          </div>
        )}
      </div>

      <div style={{ padding: '.45rem .55rem .5rem', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '.08rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.4rem', marginBottom: '.04rem' }}>
          <div style={{ ...VT, fontSize: '.92rem', color: selected || isCurrent ? accentFull : accentFade, letterSpacing: '.07em', lineHeight: 1.1 }}>
            {label}{isCurrent ? ' (CURRENT)' : ''}
          </div>
          <div style={{ ...VT, fontSize: '.88rem', color: selected || isCurrent ? '#7dd3fc' : accentFade, letterSpacing: '.05em', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {priceLabel}
          </div>
        </div>

        {badge && (
          <div style={{
            ...ST, fontSize: '.38rem', letterSpacing: '.12em',
            color: badgeColor ?? accentFade,
            border: `1px solid ${badgeColor ?? 'rgba(56,189,248,.2)'}`,
            display: 'inline-block', padding: '0px 4px', alignSelf: 'flex-start',
            marginBottom: '.06rem',
          }}>
            {badge}
          </div>
        )}

        <div style={{ ...ST, fontSize: '.45rem', color: selected || isCurrent ? 'rgba(125,211,252,.85)' : 'rgba(56,189,248,.45)', lineHeight: 1.45 }}>
          {tagline}
        </div>

        {desc && (
          <div style={{ ...ST, fontSize: '.42rem', color: 'rgba(56,189,248,.28)', lineHeight: 1.45 }}>
            {desc}
          </div>
        )}

        {lockReason && (
          <div style={{ ...ST, fontSize: '.4rem', color: 'rgba(255,80,80,.75)', lineHeight: 1.4, marginTop: '.12rem' }}>
            {lockReason}
          </div>
        )}

        {actionLabel && (
          <div style={{
            marginTop: '.3rem',
            ...ST, fontSize: '.45rem',
            color: selected || isCurrent ? accentFull : 'rgba(56,189,248,.4)',
            letterSpacing: '.1em',
            borderTop: '1px solid rgba(56,189,248,.1)',
            paddingTop: '.3rem',
          }}>
            {actionLabel}
          </div>
        )}
      </div>
    </button>
  );
}
