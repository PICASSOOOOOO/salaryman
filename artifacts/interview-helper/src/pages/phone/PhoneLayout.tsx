import React, { useState, useEffect } from 'react';
import { slate } from '@/lib/phone-utils';
import { useInsideCalllHome } from './CalllHomeContext';
import { useBoomerMode } from '@/hooks/use-mobile';

export function PhonePageLayout({
  title,
  subtitle,
  icon,
  children,
  actions,
  statusLine }: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  statusLine?: React.ReactNode;
}) {

  const insideHub = useInsideCalllHome();
  const BASE = import.meta.env.BASE_URL;
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
  useEffect(() => {
    if (insideHub) return;
    const id = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })), 1000);
    return () => clearInterval(id);
  }, [insideHub]);

  if (insideHub) {
    return (
      <div style={{ padding: '16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {icon && (
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                border: `1px solid ${slate(0.2)}`,
                background: slate(0.02),
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {icon}
              </div>
            )}
            <div>
              <h2 style={{ fontSize: '0.9rem', letterSpacing: '0.2em', color: slate(0.85), margin: 0, fontWeight: 'normal', textTransform: 'uppercase' }}>
                {title}
              </h2>
              {subtitle && <p style={{ margin: '3px 0 0', fontSize: '0.7rem', color: '#050505', lineHeight: 1.45 }}>{subtitle}</p>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {statusLine && <div style={{ fontSize: '0.7rem' }}>{statusLine}</div>}
            {actions && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
          </div>
        </div>
        {children}
      </div>
    );
  }

  const [boomer] = useBoomerMode();

  return (
    <div style={{
      minHeight: 'var(--app-viewport-height, 100dvh)',
      background: slate(0.02),
      ...(boomer ? {} : { fontFamily: "var(--font-sans)" }),
      color: slate(0.85),
      position: 'relative',
       paddingBottom: 'calc(100px + var(--app-safe-bottom))',
       paddingLeft: 'var(--app-safe-left)',
       paddingRight: 'var(--app-safe-right)' }}>

      <div className="phone-page-shell" style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'max(6px, env(safe-area-inset-top, 0px)) 0 6px', borderBottom: `1px solid ${slate(0.06)}`,
          fontSize: '0.45rem', color: slate(0.55), letterSpacing: '0.2em' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src={`${BASE}brand/callhome/calll-home-brush.png`} alt="CALLL HOME" style={{ height: 16, width: 'auto', opacity: 0.55, filter: 'brightness(2) saturate(0)' }} />
            <span style={{ color: slate(0.55) }}>│</span>
            <span>ALPHA {__BUILD_VERSION__}</span>
            <span style={{ color: slate(0.55) }}>│</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: slate(0.6),  animation: 'pulse 2s infinite' }} />
              <span style={{ color: slate(0.55) }}>SYSTEM ONLINE</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {statusLine}
            <span style={{ color: slate(0.55), fontVariantNumeric: 'tabular-nums' }}>{clock}</span>
          </div>
        </div>

        <div style={{ padding: '24px 0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {icon && (
                <div style={{
                  width: 52, height: 52, borderRadius: 10,
                  border: `1px solid ${slate(0.25)}`,
                  background: slate(0.02),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',

                  position: 'relative' }}>
                  <div style={{
                    position: 'absolute', inset: -1, borderRadius: 11, pointerEvents: 'none',
                    background: `conic-gradient(from 0deg, transparent, ${slate(0.15)}, transparent, transparent, ${slate(0.08)}, transparent)`,
                    opacity: 0.5 }} />
                  {icon}
                </div>
              )}
              <div>
                <h1 style={{
                  fontSize: '1.3rem', letterSpacing: '0.25em', color: slate(0.95), margin: 0,
                  fontWeight: 'normal', textTransform: 'uppercase',
                   }}>
                  {title}
                </h1>
                {subtitle && (
                  <p style={{ margin: '5px 0 0', fontSize: '0.72rem', color: '#050505', lineHeight: 1.45 }}>
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
          </div>
        </div>

        {children}
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes waveform { 0% { height: 20%; } 25% { height: 60%; } 50% { height: 35%; } 75% { height: 80%; } 100% { height: 20%; } }
        .phone-page-shell { padding: 0 clamp(12px, 4vw, 24px); }
        @media (max-width: 640px) {
          .phone-page-shell > div:first-child {
            overflow: hidden;
          }
          .phone-page-shell > div:first-child > div:first-child {
            min-width: 0;
            gap: 8px !important;
          }
          .phone-page-shell h1 {
            font-size: 1rem !important;
            letter-spacing: 0.14em !important;
            overflow-wrap: anywhere;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .phone-page-shell *, .phone-card, .phone-wave-bar {
            animation: none !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}

export function PhoneCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties;  }) {

  return (
    <div className="phone-card" style={{
      background: slate(0.02),
      border: `1px solid ${slate(0.12)}`,
      borderRadius: 10,
      overflow: 'hidden',

      animation: 'fadeInUp 0.3s ease-out',
      ...style }}>
      {children}
    </div>
  );
}

export function PhoneCardHeader({ children, style, accent }: { children: React.ReactNode; style?: React.CSSProperties; accent?: string }) {

  return (
    <div style={{
      padding: '10px 16px',
      fontSize: '0.5rem',
      color: accent || slate(0.35),
      letterSpacing: '0.22em',
      borderBottom: `1px solid ${slate(0.07)}`,
      background: slate(0.015),
      textTransform: 'uppercase',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      ...style }}>
      <div style={{ width: 3, height: 3, borderRadius: '50%', background: accent || slate(0.3), flexShrink: 0 }} />
      {children}
    </div>
  );
}

export const INPUT_STYLE: React.CSSProperties = {
  background: slate(0.9),
  border: `1px solid ${slate(0.15)}`,
  color: slate(0.9),
  padding: '10px 14px',
  fontSize: '1rem',
  outline: 'none',
  borderRadius: 6,
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s ease' };

export function PhoneBtn({
  children, onClick, disabled, color = slate, style, title, size = 'md' }: {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent) => void;
  disabled?: boolean;
  color?: (o: number) => string;
  style?: React.CSSProperties;
  title?: string;
  size?: 'sm' | 'md' | 'lg';

}) {
  const pad = size === 'sm' ? '5px 10px' : size === 'lg' ? '12px 20px' : '8px 14px';
  const fs = size === 'sm' ? '0.7rem' : size === 'lg' ? '0.85rem' : '0.75rem';
  return (
    <button
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
      disabled={disabled}
      title={title}
      style={{
        background: slate(0.02),
        border: `1px solid ${color(disabled ? 0.08 : 0.28)}`,
        color: color(disabled ? 0.2 : 0.85),
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: pad,
        fontSize: fs,
        letterSpacing: '0.1em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
        minWidth: 44,
        touchAction: 'manipulation',
        gap: 6,
        borderRadius: 6,
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',

        textTransform: 'uppercase',
        ...style }}
    >
      {children}
    </button>
  );
}

export function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {

  return (
    <div style={{
      padding: '56px 24px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {icon && <div style={{ opacity: 0.15 }}>{icon}</div>}
      <div style={{ fontSize: '0.6rem', color: slate(0.55), letterSpacing: '0.12em', maxWidth: 300 }}>
        {message}
      </div>
    </div>
  );
}

export function StatBlock({ label, value, sub, color: c }: { label: string; value: React.ReactNode; sub?: string; color?: (o: number) => string }) {
  const col = c || slate;
  return (
    <div style={{
      padding: '14px 16px',
      background: slate(0.5),
      border: `1px solid ${col(0.1)}`,
      borderRadius: 8,
      textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', color: col(0.8), fontWeight: 'bold', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: '0.45rem', color: col(0.4), letterSpacing: '0.2em', marginTop: 6, textTransform: 'uppercase' }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: '0.4rem', color: col(0.25), marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function MiniWaveform({ active, color: c, bars = 5 }: { active?: boolean; color?: (o: number) => string; bars?: number }) {
  const col = c || slate;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 16 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} className="phone-wave-bar" style={{
          width: 3, borderRadius: 1,
          background: col(active ? 0.6 : 0.15),
          height: active ? `${30 + ((i * 37) % 65)}%` : '20%',
          animation: active ? `waveform ${0.45 + ((i * 13) % 7) * 0.06}s ease-in-out infinite alternate` : 'none',
          animationDelay: `${i * 0.08}s`,
          transition: 'all 0.3s ease' }} />
      ))}
    </div>
  );
}

export function SignalMeter({ level, max = 5, color: c }: { level: number; max?: number; color?: (o: number) => string }) {
  const col = c || slate;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 4,
          height: `${30 + (i * 70 / (max - 1))}%`,
          borderRadius: 1,
          background: i < level ? col(0.7) : col(0.1),
          transition: 'background 0.2s ease' }} />
      ))}
    </div>
  );
}

export function SectionDivider({ label }: { label?: string }) {

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: slate(0.02) }} />
      {label && <span style={{ fontSize: '0.45rem', color: slate(0.55), letterSpacing: '0.25em', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: slate(0.02) }} />
    </div>
  );
}
