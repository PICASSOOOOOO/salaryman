import { PLANNED_CITIES } from '@/lib/world-servers';

const VT: React.CSSProperties = { fontFamily: "var(--font-sans)" };
const ST: React.CSSProperties = { fontFamily: "var(--font-sans)" };

// Capacity LOBBY. When a realm is at its player cap, non-business arrivals are
// held HERE instead of being bounced — they take no "floor" (no world slot /
// WS connection), can make calls from the lobby pay phones while they wait, and
// are pulled straight up the moment a floor frees. Business owners & their staff
// skip the lobby entirely and go straight to their floor (server-side priority),
// which is what keeps the realm from having to overflow its cap.
export function WaitingLobbyPanel({
  cityId,
  region,
  online,
  max,
  entering,
  voucherGranted,
  onBackToTerminal,
  onUsePayphone,
}: {
  cityId?: string;
  region?: string;
  online?: number;
  max?: number;
  entering: boolean;
  voucherGranted?: boolean;
  onBackToTerminal: () => void;
  onUsePayphone: () => void;
}) {
  const city = cityId ? PLANNED_CITIES.find((c) => c.cityId === cityId) : undefined;
  const cityName = city?.cityName ?? 'THIS CITY';
  const accent = city?.accentColor ?? '#38bdf8';
  const cap = typeof max === 'number' ? max : 50;
  const cur = typeof online === 'number' ? online : cap;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'radial-gradient(circle at 50% 25%, rgba(8,14,20,.98), rgba(0,3,6,.99))',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.2rem',
    }}>
      <div style={{
        width: 560, maxWidth: 'min(94vw, 560px)',
        border: `1px solid ${accent}55`,
        background: 'rgba(0,5,8,.96)',
        boxShadow: `0 0 60px ${accent}14`,
      }}>
        {/* Header */}
        <div style={{ padding: '.7rem .95rem', borderBottom: `1px solid ${accent}30` }}>
          <div style={{ ...VT, fontSize: '1.5rem', color: accent, letterSpacing: '.16em' }}>
            {cityName} · GROUND-FLOOR LOBBY
          </div>
          <div style={{ ...ST, fontSize: '.5rem', color: `${accent}88`, letterSpacing: '.12em', marginTop: '.15rem' }}>
            {region ?? 'REGIONAL REALM'} · ALL FLOORS OCCUPIED ({cur} / {cap})
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.1rem 1.1rem 1rem' }}>
          {/* Pay phone bank */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.4rem', margin: '.4rem 0 1rem' }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ ...VT, fontSize: '2.3rem', color: accent, opacity: 0.55 + i * 0.12, lineHeight: 1 }}>
                ☎
              </div>
            ))}
          </div>

          {entering ? (
            <div style={{ ...VT, fontSize: '1.6rem', color: accent, textAlign: 'center', letterSpacing: '.14em', padding: '.4rem 0' }}>
              A FLOOR OPENED — HEADING UP… ▴
            </div>
          ) : (
            <>
              <div style={{ ...ST, fontSize: '.62rem', lineHeight: 1.9, color: 'rgba(180,220,240,.78)', letterSpacing: '.04em', textAlign: 'center' }}>
                The building is full, so you can wait down here in the lobby —
                <b style={{ color: accent }}> you don't have to take a floor to wait</b>.
                Make a call from a pay phone if you like; we'll send you up
                automatically the moment a floor frees.
              </div>
              <div style={{
                ...ST, fontSize: '.5rem', letterSpacing: '.1em',
                color: 'rgba(140,180,200,.5)', textAlign: 'center',
                marginTop: '.8rem',
              }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: accent, marginRight: 6, animation: 'pulse 1.4s infinite' }} />
                WATCHING FOR AN OPEN FLOOR · AUTO-ENTRY THE MOMENT ONE FREES
              </div>
              <div style={{
                ...ST, fontSize: '.46rem', letterSpacing: '.08em',
                color: 'rgba(120,160,180,.4)', textAlign: 'center', marginTop: '.55rem',
              }}>
                Business owners &amp; their staff skip the lobby and go straight to their floor.
              </div>
              {voucherGranted && (
                <div style={{
                  ...ST, fontSize: '.52rem', lineHeight: 1.7, letterSpacing: '.05em',
                  color: '#6ee7b7', textAlign: 'center', marginTop: '.8rem',
                  border: '1px solid rgba(110,231,183,.3)', background: 'rgba(16,40,32,.55)',
                  padding: '.55rem .6rem',
                }}>
                  ✦ As a registered business, here's a <b>free travel voucher</b>.
                  Take the metro to another city on us while a floor frees up — no toll.
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'center', marginTop: '1.1rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onUsePayphone}
              data-testid="lobby-payphone"
              style={{
                padding: '.55rem 1.1rem', border: `1px solid ${accent}66`,
                background: `${accent}12`, color: accent,
                ...VT, fontSize: '1.1rem', letterSpacing: '.14em', cursor: 'pointer',
              }}
            >
              ☎ USE A PAY PHONE
            </button>
            <button
              type="button"
              onClick={onBackToTerminal}
              data-testid="lobby-back-terminal"
              style={{
                padding: '.55rem 1.1rem', border: '1px solid rgba(160,180,200,.3)',
                background: 'transparent', color: 'rgba(180,200,220,.7)',
                ...VT, fontSize: '1.1rem', letterSpacing: '.14em', cursor: 'pointer',
              }}
            >
              ← BACK TO TERMINAL
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}`}</style>
    </div>
  );
}
