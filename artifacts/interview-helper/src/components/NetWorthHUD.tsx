import React from 'react';

export interface NetWorthHUDProps {
  netWorth: number;
  netWorthMax?: number;
  stamina?: number;
  creditScore?: number;
  creditTier?: string;
  showStamina?: boolean;
  showCredit?: boolean;
  comboCount?: number;
  compact?: boolean;
}

const TIER_COLOR: Record<string, string> = {
  EXCELLENT: '#4ade80',
  GOOD:      '#FFD700',
  FAIR:      '#ffaa44',
  POOR:      '#ff6666',
};

/**
 * NetWorthHUD — shared stat overlay for both the city WorldPlay canvas and the
 * /office IsoOffice. Shows net worth as the primary survival metric (replaces
 * the HP arc), stamina, and an optional credit score sub-label.
 */
export function NetWorthHUD({
  netWorth,
  netWorthMax = 1_000_000,
  stamina,
  creditScore,
  creditTier,
  showStamina = true,
  showCredit = true,
  comboCount,
  compact = false,
}: NetWorthHUDProps) {
  const inDebt  = netWorth < 0;
  const ratio   = Math.max(0, Math.min(1, netWorth / netWorthMax));
  const barColor = inDebt          ? '#ff3333'
    : netWorth < 50_000            ? '#ffaa22'
    : netWorth < 500_000           ? '#FFD700'
    :                                '#4ade80';
  const barGlow  = inDebt          ? 'rgba(255,50,50,.4)'
    : netWorth < 50_000            ? 'rgba(255,170,34,.3)'
    :                                'rgba(255,215,0,.3)';

  const absNW = Math.abs(netWorth);
  const nwLabel =
    absNW >= 1_000_000 ? `${(netWorth / 1_000_000).toFixed(1)}M`
    : absNW >= 1_000   ? `${Math.round(netWorth / 1_000)}K`
    :                    String(Math.round(netWorth));

  const staminaColor =
    stamina !== undefined && stamina <= 20 ? '#ff4422'
    : stamina !== undefined && stamina <= 50 ? '#ffaa44'
    : '#34d399';

  const tierColor = creditTier ? (TIER_COLOR[creditTier] ?? 'rgba(56,189,248,.6)') : 'rgba(56,189,248,.6)';
  const barW = compact ? 120 : 160;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 3, minWidth: barW, fontFamily: "'Share Tech Mono',monospace" }}>
      {/* Headline: net worth label + value */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: compact ? '.44rem' : '.5rem', color: 'rgba(255,215,0,.55)', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>NET WORTH</span>
        <span style={{ fontFamily: "'VT323',monospace", fontSize: compact ? '.85rem' : '.95rem', color: barColor, textShadow: `0 0 5px ${barGlow}`, letterSpacing: '.03em' }}>
          {inDebt ? '-' : ''}ƒ{nwLabel}
        </span>
        {comboCount !== undefined && comboCount > 1 && (
          <span style={{ fontFamily: "'VT323',monospace", fontSize: '.65rem', color: '#ffcc44', textShadow: '0 0 3px rgba(255,204,68,.7)' }}>×{comboCount}</span>
        )}
      </div>

      {/* Net worth bar */}
      <div style={{ width: barW, height: compact ? 4 : 6, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden', filter: `drop-shadow(0 0 4px ${barGlow})` }}>
        {inDebt ? (
          <div style={{ width: '100%', height: '100%', background: 'repeating-linear-gradient(90deg,#ff333355 0,#ff333355 5px,transparent 5px,transparent 9px)', borderRadius: 2 }} />
        ) : (
          <div style={{ width: `${ratio * 100}%`, height: '100%', background: `linear-gradient(90deg,${barColor}88,${barColor})`, borderRadius: 2, transition: 'width .4s ease' }} />
        )}
      </div>

      {/* Stamina sub-bar */}
      {showStamina && stamina !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '.44rem', color: 'rgba(34,211,238,.5)', letterSpacing: '.1em' }}>STAMINA</span>
          <div style={{ flex: 1, height: compact ? 3 : 4, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.max(0, Math.min(100, stamina))}%`, height: '100%',
              background: staminaColor, borderRadius: 2, transition: 'width .3s ease',
              ...(stamina <= 20 ? { animation: 'pulse 1s infinite' } : {}),
            }} />
          </div>
        </div>
      )}

      {/* Credit score */}
      {showCredit && creditScore !== undefined && creditTier && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '.44rem', color: 'rgba(255,215,0,.35)', letterSpacing: '.08em' }}>CREDIT</span>
          <span style={{ fontFamily: "'VT323',monospace", fontSize: '.72rem', color: tierColor, letterSpacing: '.04em' }}>{creditScore}</span>
          <span style={{ fontSize: '.42rem', color: tierColor, opacity: 0.85, letterSpacing: '.05em' }}>{creditTier}</span>
        </div>
      )}
    </div>
  );
}
