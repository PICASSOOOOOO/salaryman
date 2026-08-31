import { ECONOMY_RAILS, ECONOMY_KEY_NOTE } from '@/lib/economy-key';

// Per-rail accent colors mirror the Game Economy page's CONVERSION card
// (USD emerald, FIAT fuchsia, GOLD amber) so the legend reads as the SAME
// key the player will see again on /game/economy.
const RAIL_COLORS: Record<string, string> = {
  USD: '#6ee7b7',
  FIAT: '#f0abfc',
  GOLD: '#fcd34d',
};

/**
 * Compact, always-visible "economy key" — the fixed ƒ ↔ USD ↔ GOLD conversion
 * legend. Rendered on every onboarding step where money is shown so a new
 * player has constant context for what the FIAT (ƒ) figures are worth.
 *
 * Self-contained inline styles in the cyan terminal aesthetic so it drops into
 * both the Pablo onboarding modal and the Immigration stamping panel without
 * pulling in Tailwind. Wraps cleanly on narrow (vertical iPhone) layouts.
 *
 * Single source of truth: the rails + wording come from `lib/economy-key`,
 * shared with the Game Economy page.
 */
export function EconomyKey({
  note = false,
  style,
}: {
  /** Show the short "fixed rate / real money" reassurance line. */
  note?: boolean;
  style?: React.CSSProperties;
}) {
  const ST: React.CSSProperties = { fontFamily: "var(--font-sans)" };
  return (
    <div
      data-testid="economy-key"
      style={{
        border: '1px solid rgba(56,189,248,.18)',
        background: 'rgba(56,189,248,.03)',
        padding: '.42rem .55rem',
        borderRadius: 2,
        ...style,
      }}
    >
      <div style={{ ...ST, fontSize: '.4rem', letterSpacing: '.16em', color: 'rgba(56,189,248,.42)', marginBottom: '.3rem' }}>
        ECONOMY KEY · BASE RAIL
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: '.25rem', columnGap: '.35rem' }}>
        {ECONOMY_RAILS.map((r, i) => (
          <span key={r.code} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '.32rem' }}>
            {i > 0 && <span style={{ ...ST, fontSize: '.62rem', color: 'rgba(56,189,248,.35)' }}>=</span>}
            <span style={{ ...ST, fontSize: '.66rem', color: RAIL_COLORS[r.code], letterSpacing: '.03em' }}>
              {r.value}
            </span>
            <span style={{ ...ST, fontSize: '.4rem', color: 'rgba(125,211,252,.42)', letterSpacing: '.1em' }}>
              {r.label}
            </span>
          </span>
        ))}
      </div>
      {note && (
        <div style={{ ...ST, fontSize: '.4rem', letterSpacing: '.06em', color: 'rgba(125,211,252,.38)', marginTop: '.3rem', lineHeight: 1.5 }}>
          {ECONOMY_KEY_NOTE}
        </div>
      )}
    </div>
  );
}
