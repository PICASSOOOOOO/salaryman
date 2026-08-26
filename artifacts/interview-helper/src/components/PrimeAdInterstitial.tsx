import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { isTutorialDone } from '@/lib/tutorial-progress';

const AD_SEEN_KEY = 'sm_prime_ad_seen';
const SHOW_AFTER_MS = 1200;

function hasBeenSeen(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(AD_SEEN_KEY) === '1'; } catch { return true; }
}
function markSeen(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(AD_SEEN_KEY, '1'); } catch {}
}

export function PrimeAdInterstitial() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<'tune' | 'ad'>('tune');

  useEffect(() => {
    if (!isTutorialDone()) return;
    if (hasBeenSeen()) return;
    const t1 = setTimeout(() => setOpen(true), SHOW_AFTER_MS);
    const t2 = setTimeout(() => setStage('ad'), SHOW_AFTER_MS + 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (!open) return null;

  const dismiss = () => { markSeen(); setOpen(false); };
  const upgrade = () => { markSeen(); setOpen(false); navigate('/upgrade'); };

  const VT: React.CSSProperties = { fontFamily: "var(--font-sans)" };
  const ST: React.CSSProperties = { fontFamily: "var(--font-sans)" };

  return (
    <div
      role="dialog"
      aria-label="Pablo Prime advertisement"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.2rem',
        animation: 'prime-ad-fade .35s ease-out',
      }}
    >
      <style>{`
        @keyframes prime-ad-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes prime-pulse { 0%,100% { box-shadow: 0 0 18px rgba(244,114,182,.35) } 50% { box-shadow: 0 0 38px rgba(244,114,182,.65) } }
      `}</style>

      <div style={{
        position: 'relative',
        width: 520, maxWidth: 'min(92vw, 520px)',
        background: '#04060a',
        border: '2px solid rgba(244,114,182,.55)',
        boxShadow: '0 0 80px rgba(244,114,182,.25)',
        overflow: 'hidden',
      }}>
        {/* Channel header */}
        <div style={{
          padding: '.45rem .75rem',
          borderBottom: '1px solid rgba(244,114,182,.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(244,114,182,.06)',
        }}>
          <div style={{ ...VT, fontSize: '1rem', color: 'rgba(244,114,182,.9)', letterSpacing: '.18em' }}>
            ▸ MINX BROADCAST · CH 04
          </div>
          <div style={{ ...ST, fontSize: '.5rem', color: 'rgba(244,114,182,.55)', letterSpacing: '.18em' }}>
            ● LIVE · PAID PROGRAMMING
          </div>
        </div>

        {/* Body */}
        {stage === 'tune' ? (
          <div style={{
            padding: '3.2rem 1rem', textAlign: 'center', minHeight: 280,
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '.5rem',
          }}>
            <div style={{ ...VT, fontSize: '1.4rem', color: 'rgba(244,114,182,.7)', letterSpacing: '.3em' }}>
              ▌ TUNING ▌
            </div>
            <div style={{ ...ST, fontSize: '.55rem', color: 'rgba(244,114,182,.4)', letterSpacing: '.18em' }}>
              SIGNAL ACQUIRED — STAND BY
            </div>
            <div aria-hidden style={{
              marginTop: '.7rem', width: 240, maxWidth: '70vw', height: 80,
              background: 'radial-gradient(ellipse at center, rgba(244,114,182,.2), rgba(125,211,252,.06) 55%, transparent 72%)',
              border: '1px solid rgba(244,114,182,.25)',
            }} />
          </div>
        ) : (
          <div style={{ padding: '1.5rem 1.2rem 1.4rem', position: 'relative', zIndex: 1 }}>
            <div style={{
              ...ST, fontSize: '.5rem', color: 'rgba(125,211,252,.6)',
              letterSpacing: '.22em', marginBottom: '.4rem',
            }}>
              ━━━ A WORD FROM OUR SPONSORS ━━━
            </div>

            <div style={{
              ...VT, fontSize: 'clamp(1.7rem, 6vw, 2.4rem)',
              color: '#f9a8d4', letterSpacing: '.06em', lineHeight: 1.05,
              textShadow: '0 0 12px rgba(244,114,182,.55)',
              marginBottom: '.5rem',
            }}>
              GO PRIME.
            </div>
            <div style={{ ...VT, fontSize: '1.15rem', color: 'rgba(244,114,182,.85)', letterSpacing: '.08em' }}>
              PABLO PRIME · ƒ145/MO
            </div>

            <ul style={{
              ...ST, fontSize: '.62rem', color: 'rgba(125,211,252,.78)',
              letterSpacing: '.05em', lineHeight: 1.85,
              listStyle: 'none', padding: 0, margin: '.75rem 0 .9rem',
            }}>
              <li>▸ UNCAPPED PABLO AI · NO COOLDOWN</li>
              <li>▸ PRIORITY ROUTING · CALLS ANSWERED FIRST</li>
              <li>▸ PRIME-ONLY OFFICES &amp; PENTHOUSE TIERS</li>
              <li>▸ ZERO ADS · PABLO STOPS WATCHING (PROBABLY)</li>
            </ul>

            <div style={{
              ...ST, fontSize: '.45rem', color: 'rgba(125,211,252,.4)',
              letterSpacing: '.1em', lineHeight: 1.6, marginBottom: '.85rem',
            }}>
              * PABLO MAY STILL WATCH. TERMS APPLY. CITY DEBT NOT FORGIVEN.
            </div>

            <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={upgrade}
                data-testid="prime-ad-upgrade"
                style={{
                  flex: '1 1 180px', minWidth: 0,
                  padding: '.7rem 1.1rem',
                  border: '1px solid rgba(244,114,182,.7)',
                  background: 'rgba(244,114,182,.18)',
                  color: '#fbcfe8',
                  ...VT, fontSize: '1.05rem', letterSpacing: '.16em',
                  cursor: 'pointer',
                  animation: 'prime-pulse 2.4s ease-in-out infinite',
                }}
              >
                ✦ GO PRIME
              </button>
              <button
                type="button"
                onClick={dismiss}
                data-testid="prime-ad-dismiss"
                style={{
                  flex: '0 1 140px',
                  padding: '.7rem 1.1rem',
                  border: '1px solid rgba(125,211,252,.35)',
                  background: 'transparent',
                  color: 'rgba(125,211,252,.75)',
                  ...VT, fontSize: '1rem', letterSpacing: '.14em',
                  cursor: 'pointer',
                }}
              >
                MAYBE LATER
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
