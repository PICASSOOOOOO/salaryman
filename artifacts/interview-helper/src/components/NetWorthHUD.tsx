import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface NetWorthHUDProps {
  netWorth: number;
  netWorthMax?: number;
  cash?: number;
  savings?: number;
  gold?: number;
  fiatPerGold?: number;
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

function fmtF(v: number): string {
  const abs = Math.abs(v);
  const s = abs >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
    : abs >= 1_000           ? `${Math.round(v / 1_000)}K`
    :                          String(Math.round(v));
  return s;
}

/**
 * NetWorthHUD — shared stat overlay for both the city WorldPlay canvas and the
 * /office IsoOffice. Shows net worth as the primary survival metric (replaces
 * the HP arc), stamina, and an optional credit score sub-label.
 *
 * Tap or hover the net worth bar to see a compact breakdown: CASH / SAVINGS /
 * GOLD / TOTAL. The popover auto-dismisses after 3 s or on the next tap.
 */
export function NetWorthHUD({
  netWorth,
  netWorthMax = 1_000_000,
  cash,
  savings,
  gold,
  fiatPerGold = 100_000,
  stamina,
  creditScore,
  creditTier,
  showStamina = true,
  showCredit = true,
  comboCount,
  compact = false,
}: NetWorthHUDProps) {
  const prevCashRef = useRef<number | undefined>(undefined);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashColor, setFlashColor] = useState<string | null>(null);

  const prevNetWorthRef = useRef<number | undefined>(undefined);
  const nwFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nwFlashColor, setNwFlashColor] = useState<string | null>(null);

  useEffect(() => {
    if (cash === undefined) return;
    const prev = prevCashRef.current;
    if (prev !== undefined && cash !== prev) {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      setFlashColor(cash > prev ? '#4ade80' : '#ff4444');
      flashTimerRef.current = setTimeout(() => setFlashColor(null), 400);
    }
    prevCashRef.current = cash;
  }, [cash]);

  useEffect(() => {
    const prev = prevNetWorthRef.current;
    if (prev !== undefined && netWorth !== prev) {
      if (nwFlashTimerRef.current) clearTimeout(nwFlashTimerRef.current);
      setNwFlashColor(netWorth > prev ? '#4ade80' : '#ff4444');
      nwFlashTimerRef.current = setTimeout(() => setNwFlashColor(null), 400);
    }
    prevNetWorthRef.current = netWorth;
  }, [netWorth]);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    if (nwFlashTimerRef.current) clearTimeout(nwFlashTimerRef.current);
  }, []);

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

  /* ── breakdown popover ───────────────────────────────────────────────── */
  const hasBreakdown = cash !== undefined || savings !== undefined || gold !== undefined;
  const [open, setOpen] = useState(false);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef   = useRef<HTMLDivElement>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const closePopover = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  const showPopover = useCallback(() => {
    if (!hasBreakdown) return;
    setOpen(true);
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(false), 3000);
  }, [hasBreakdown, clearTimer]);

  const togglePopover = useCallback(() => {
    if (open) {
      closePopover();
    } else {
      showPopover();
    }
  }, [open, showPopover, closePopover]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closePopover();
      }
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [open, closePopover]);

  const cashF    = cash    ?? 0;
  const savingsF = savings ?? 0;
  const goldOz   = gold    ?? 0;
  const goldF    = goldOz * fiatPerGold;
  const totalF   = cashF + savingsF + goldF;

  return (
    <div
      ref={rootRef}
      style={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 3, minWidth: barW, fontFamily: "'Share Tech Mono',monospace", position: 'relative' }}
    >
      {/* Headline: net worth label + value */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: compact ? '.44rem' : '.5rem', color: 'rgba(255,215,0,.55)', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>NET WORTH</span>
        <span style={{ fontFamily: "'VT323',monospace", fontSize: compact ? '.85rem' : '.95rem', color: nwFlashColor ?? barColor, textShadow: `0 0 5px ${nwFlashColor ?? barGlow}`, letterSpacing: '.03em', transition: 'color .4s ease' }}>
          {inDebt ? '-' : ''}ƒ{nwLabel}
        </span>
        {comboCount !== undefined && comboCount > 1 && (
          <span style={{ fontFamily: "'VT323',monospace", fontSize: '.65rem', color: '#ffcc44', textShadow: '0 0 3px rgba(255,204,68,.7)' }}>×{comboCount}</span>
        )}
      </div>

      {/* Net worth bar — tappable when breakdown data is present */}
      <div
        onClick={hasBreakdown ? togglePopover : undefined}
        onMouseEnter={hasBreakdown ? showPopover : undefined}
        style={{
          width: barW, height: compact ? 4 : 6,
          background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden',
          filter: nwFlashColor
            ? `drop-shadow(0 0 6px ${nwFlashColor}) drop-shadow(0 0 3px ${nwFlashColor})`
            : `drop-shadow(0 0 4px ${barGlow})`,
          transition: 'filter .4s ease',
          cursor: hasBreakdown ? 'pointer' : 'default',
        }}
      >
        {inDebt ? (
          <div style={{ width: '100%', height: '100%', background: 'repeating-linear-gradient(90deg,#ff333355 0,#ff333355 5px,transparent 5px,transparent 9px)', borderRadius: 2, filter: nwFlashColor ? 'brightness(1.5)' : undefined, transition: 'filter .4s ease' }} />
        ) : (
          <div style={{ width: `${ratio * 100}%`, height: '100%', background: `linear-gradient(90deg,${barColor}88,${barColor})`, borderRadius: 2, transition: 'width .4s ease, filter .4s ease', filter: nwFlashColor ? 'brightness(1.6)' : undefined }} />
        )}
      </div>

      {/* Breakdown popover */}
      {open && hasBreakdown && (
        <div
          onClick={() => { clearTimer(); setOpen(false); }}
          style={{
            position: 'absolute', top: compact ? 24 : 28, left: 0, zIndex: 9999,
            background: 'rgba(4,10,6,.93)', border: '1px solid rgba(255,215,0,.28)',
            borderRadius: 5, padding: '.35rem .6rem',
            display: 'flex', flexDirection: 'column', gap: 3,
            boxShadow: '0 4px 18px rgba(0,0,0,.7)',
            minWidth: 148,
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
        >
          {cash !== undefined && (
            <PopRow label="CASH" value={`ƒ${fmtF(cashF)}`} color="rgba(255,255,255,.7)" />
          )}
          {savings !== undefined && (
            <PopRow label="SAVINGS" value={`ƒ${fmtF(savingsF)}`} color="rgba(56,189,248,.85)" />
          )}
          {gold !== undefined && (
            <PopRow label={`GOLD ${goldOz.toFixed(goldOz < 10 ? 1 : 0)}oz`} value={`ƒ${fmtF(goldF)}`} color="#FFD700" />
          )}
          <div style={{ height: 1, background: 'rgba(255,215,0,.15)', margin: '1px 0' }} />
          <PopRow label="TOTAL" value={`ƒ${fmtF(totalF)}`} color={barColor} bold />
        </div>
      )}

      {/* Cash on hand — subordinate secondary line */}
      {cash !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '.42rem', color: 'rgba(255,255,255,.3)', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>CASH</span>
          <span style={{ fontFamily: "'VT323',monospace", fontSize: compact ? '.72rem' : '.8rem', color: flashColor ?? 'rgba(255,255,255,.55)', letterSpacing: '.03em', transition: 'color .4s ease', textShadow: flashColor ? `0 0 6px ${flashColor}` : undefined }}>
            ƒ{cash >= 1_000_000 ? `${(cash / 1_000_000).toFixed(1)}M` : cash >= 1_000 ? `${Math.round(cash / 1_000)}K` : String(Math.round(cash))}
          </span>
        </div>
      )}

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

function PopRow({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: '.42rem', color: 'rgba(255,255,255,.4)', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{
        fontFamily: "'VT323',monospace", fontSize: '.78rem', color, letterSpacing: '.04em',
        fontWeight: bold ? 700 : 400,
      }}>{value}</span>
    </div>
  );
}
