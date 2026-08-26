import React, { useState, useEffect } from 'react';
import { crt } from '@/lib/phone-utils';
import { useInsideCalllHome } from './CalllHomeContext';
import { useBoomerMode } from '@/hooks/use-mobile';

export function PhonePageLayout({
  title,
  subtitle,
  icon,
  children,
  actions,
  statusLine,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  statusLine?: React.ReactNode;
}) {
  const insideHub = useInsideCalllHome();
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
                border: `1px solid ${crt(0.2)}`,
                background: 'linear-gradient(135deg, rgba(56,189,248,0.06) 0%, rgba(56,189,248,0.01) 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {icon}
              </div>
            )}
            <div>
              <h2 style={{ fontSize: '0.9rem', letterSpacing: '0.2em', color: crt(0.85), margin: 0, fontWeight: 'normal', textTransform: 'uppercase' }}>
                {title}
              </h2>
              {subtitle && <p style={{ margin: '3px 0 0', fontSize: '0.45rem', color: crt(0.25), letterSpacing: '0.1em' }}>{subtitle}</p>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {statusLine && <div style={{ fontSize: '0.42rem' }}>{statusLine}</div>}
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
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #010a01 0%, #020802 40%, #030a03 100%)',
      ...(boomer ? {} : { fontFamily: "var(--font-sans)" }),
      color: crt(0.85),
      position: 'relative',
      paddingBottom: 100,
    }}>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 0', borderBottom: `1px solid ${crt(0.06)}`,
          fontSize: '0.45rem', color: crt(0.2), letterSpacing: '0.2em',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src="/brand/callhome/calll-home-brush.png" alt="CALLL HOME" style={{ height: 16, width: 'auto', opacity: 0.55, filter: 'brightness(2) saturate(0)' }} />
            <span style={{ color: crt(0.12) }}>│</span>
            <span>ALPHA {__BUILD_VERSION__}</span>
            <span style={{ color: crt(0.12) }}>│</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: crt(0.6), boxShadow: `0 0 6px ${crt(0.3)}`, animation: 'pulse 2s infinite' }} />
              <span style={{ color: crt(0.35) }}>SYSTEM ONLINE</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {statusLine}
            <span style={{ color: crt(0.3), fontVariantNumeric: 'tabular-nums' }}>{clock}</span>
          </div>
        </div>

        <div style={{ padding: '24px 0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {icon && (
                <div style={{
                  width: 52, height: 52, borderRadius: 10,
                  border: `1px solid ${crt(0.25)}`,
                  background: 'linear-gradient(135deg, rgba(56,189,248,0.08) 0%, rgba(56,189,248,0.02) 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 0 20px ${crt(0.06)}, inset 0 0 20px rgba(0,0,0,0.3)`,
                  position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', inset: -1, borderRadius: 11, pointerEvents: 'none',
                    background: `conic-gradient(from 0deg, transparent, ${crt(0.15)}, transparent, transparent, ${crt(0.08)}, transparent)`,
                    opacity: 0.5,
                  }} />
                  {icon}
                </div>
              )}
              <div>
                <h1 style={{
                  fontSize: '1.3rem', letterSpacing: '0.25em', color: crt(0.95), margin: 0,
                  fontWeight: 'normal', textTransform: 'uppercase',
                  textShadow: `0 0 20px ${crt(0.15)}`,
                }}>
                  {title}
                </h1>
                {subtitle && (
                  <p style={{ margin: '5px 0 0', fontSize: '0.55rem', color: crt(0.28), letterSpacing: '0.15em' }}>
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
        @keyframes glowPulse { 0%,100% { box-shadow: 0 0 8px rgba(56,189,248,0.1); } 50% { box-shadow: 0 0 16px rgba(56,189,248,0.2); } }
        @keyframes waveform { 0% { height: 20%; } 25% { height: 60%; } 50% { height: 35%; } 75% { height: 80%; } 100% { height: 20%; } }
      `}</style>
    </div>
  );
}

export function PhoneCard({ children, style, glow }: { children: React.ReactNode; style?: React.CSSProperties; glow?: boolean }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(0,24,0,0.75) 0%, rgba(0,16,0,0.65) 100%)',
      border: `1px solid ${crt(0.12)}`,
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: glow ? `0 0 20px ${crt(0.06)}, inset 0 1px 0 ${crt(0.06)}` : `inset 0 1px 0 ${crt(0.04)}`,
      animation: 'fadeInUp 0.3s ease-out',
      ...style,
    }}>
      {children}
    </div>
  );
}

export function PhoneCardHeader({ children, style, accent }: { children: React.ReactNode; style?: React.CSSProperties; accent?: string }) {
  return (
    <div style={{
      padding: '10px 16px',
      fontSize: '0.5rem',
      color: accent || crt(0.35),
      letterSpacing: '0.22em',
      borderBottom: `1px solid ${crt(0.07)}`,
      background: 'rgba(56,189,248,0.015)',
      textTransform: 'uppercase',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      ...style,
    }}>
      <div style={{ width: 3, height: 3, borderRadius: '50%', background: accent || crt(0.3), flexShrink: 0 }} />
      {children}
    </div>
  );
}

export const INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(0,16,0,0.9)',
  border: `1px solid ${crt(0.15)}`,
  color: crt(0.9),
  padding: '10px 14px',
  fontSize: '0.72rem',
  outline: 'none',
  borderRadius: 6,
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s ease',
};

export function PhoneBtn({
  children, onClick, disabled, color = crt, style, title, size = 'md', glow,
}: {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent) => void;
  disabled?: boolean;
  color?: (o: number) => string;
  style?: React.CSSProperties;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
  glow?: boolean;
}) {
  const pad = size === 'sm' ? '5px 10px' : size === 'lg' ? '12px 20px' : '8px 14px';
  const fs = size === 'sm' ? '0.55rem' : size === 'lg' ? '0.75rem' : '0.65rem';
  return (
    <button
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
      disabled={disabled}
      title={title}
      style={{
        background: `linear-gradient(180deg, ${color(disabled ? 0.04 : 0.12)} 0%, ${color(disabled ? 0.02 : 0.06)} 100%)`,
        border: `1px solid ${color(disabled ? 0.08 : 0.28)}`,
        color: color(disabled ? 0.2 : 0.85),
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: pad,
        fontSize: fs,
        letterSpacing: '0.1em',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 6,
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        boxShadow: glow && !disabled ? `0 0 12px ${color(0.15)}` : 'none',
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div style={{
      padding: '56px 24px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    }}>
      {icon && <div style={{ opacity: 0.15 }}>{icon}</div>}
      <div style={{ fontSize: '0.6rem', color: crt(0.18), letterSpacing: '0.12em', maxWidth: 300 }}>
        {message}
      </div>
    </div>
  );
}

export function StatBlock({ label, value, sub, color: c }: { label: string; value: string | number; sub?: string; color?: (o: number) => string }) {
  const col = c || crt;
  return (
    <div style={{
      padding: '14px 16px',
      background: 'rgba(0,12,0,0.5)',
      border: `1px solid ${col(0.1)}`,
      borderRadius: 8,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.5rem', color: col(0.8), fontWeight: 'bold', lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 12px ${col(0.15)}` }}>
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
  const col = c || crt;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 16 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 1,
          background: col(active ? 0.6 : 0.15),
          height: active ? `${20 + Math.random() * 80}%` : '20%',
          animation: active ? `waveform ${0.4 + Math.random() * 0.5}s ease-in-out infinite alternate` : 'none',
          animationDelay: `${i * 0.08}s`,
          transition: 'all 0.3s ease',
        }} />
      ))}
    </div>
  );
}

export function SignalMeter({ level, max = 5, color: c }: { level: number; max?: number; color?: (o: number) => string }) {
  const col = c || crt;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 4,
          height: `${30 + (i * 70 / (max - 1))}%`,
          borderRadius: 1,
          background: i < level ? col(0.7) : col(0.1),
          transition: 'background 0.2s ease',
        }} />
      ))}
    </div>
  );
}

export function SectionDivider({ label }: { label?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px',
    }}>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${crt(0.1)}, transparent)` }} />
      {label && <span style={{ fontSize: '0.45rem', color: crt(0.2), letterSpacing: '0.25em', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${crt(0.1)})` }} />
    </div>
  );
}
