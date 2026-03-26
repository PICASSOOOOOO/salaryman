import { useState, useEffect, useCallback } from 'react';
import { Hash, Plus, Trash2, Loader2, X, Phone, Activity, Shield } from 'lucide-react';
import { useLocation } from 'wouter';
import { useCalllHomeNavigate } from './CalllHomeContext';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, SignalMeter, MiniWaveform, INPUT_STYLE } from './PhoneLayout';
import {
  crt, red, amber, blue, purple,
  type PhoneNumber,
} from '@/lib/phone-utils';

const ROUTING_COLORS: Record<string, (o: number) => string> = {
  voicemail: blue,
  forward: crt,
  secretary: purple,
  ring: amber,
};

export default function PhoneNumbersPage() {
  const BASE = import.meta.env.BASE_URL;
  const [, rawNavigate] = useLocation();
  const hubNav = useCalllHomeNavigate();
  const navigate = (path: string) => { if (!hubNav(path)) rawNavigate(path); };

  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ number: '', label: '', greeting: '', routingMode: 'voicemail' });
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  const fetchNumbers = useCallback(() => {
    fetch(apiUrl('twilio/phone-numbers'))
      .then(async r => {
        if (r.status === 403) { navigate('/upgrade'); return; }
        if (r.ok) { const d = await r.json(); if (d?.numbers) setPhoneNumbers(d.numbers); }
        else { setError(`Failed to load phone numbers (${r.status})`); }
      })
      .catch(() => setError('Network error loading phone numbers'))
      .finally(() => setLoading(false));
  }, [apiUrl, navigate]);

  useEffect(() => { fetchNumbers(); }, [fetchNumbers]);

  const addNumber = async () => {
    if (!form.number) return;
    setAdding(true); setError('');
    try {
      const r = await fetch(apiUrl('twilio/phone-numbers'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (r.status === 403) { rawNavigate('/upgrade'); return; }
      if (r.ok) {
        fetchNumbers();
        setForm({ number: '', label: '', greeting: '', routingMode: 'voicemail' });
        setShowForm(false);
      } else {
        const d = await r.json().catch(() => ({}));
        setError((d as { error?: string }).error || 'Failed to add number');
      }
    } catch { setError('Network error'); }
    setAdding(false);
  };

  const deleteNumber = async (id: number) => {
    try {
      const r = await fetch(apiUrl(`twilio/phone-numbers/${id}`), { method: 'DELETE' });
      if (r.status === 403) { navigate('/upgrade'); return; }
      if (r.ok) fetchNumbers();
      else { const d = await r.json().catch(() => ({})); setError(d.error || 'Failed to delete number'); }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
  };

  const ROUTING_MODES = [
    { key: 'voicemail', label: 'VOICEMAIL', desc: 'Callers leave a recorded message', icon: <Hash size={14} />, color: blue },
    { key: 'forward', label: 'FORWARD', desc: 'Forward calls to your main number', icon: <Phone size={14} />, color: crt },
    { key: 'secretary', label: 'AI SECRETARY', desc: 'AI secretary answers and screens', icon: <Shield size={14} />, color: purple },
    { key: 'ring', label: 'RING THROUGH', desc: 'Direct ring to your device', icon: <Activity size={14} />, color: amber },
  ];

  const activeCount = phoneNumbers.filter(n => n.isActive).length;

  return (
    <PhonePageLayout
      title="PHONE NUMBERS"
      subtitle="Manage Twilio phone numbers, routing, and greetings"
      icon={<Hash size={24} style={{ color: crt(0.8) }} />}
      statusLine={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SignalMeter level={Math.min(phoneNumbers.length + 1, 5)} />
          <span style={{ color: crt(0.25) }}>{phoneNumbers.length} NUMBER{phoneNumbers.length !== 1 ? 'S' : ''}</span>
        </div>
      }
      actions={
        <PhoneBtn onClick={() => setShowForm(v => !v)} color={(o: number) => `rgba(0,220,60,${o})`} glow={!showForm}>
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? 'CANCEL' : 'ADD NUMBER'}
        </PhoneBtn>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: red(0.05), border: `1px solid ${red(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: red(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error} <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: red(0.4), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="TOTAL NUMBERS" value={phoneNumbers.length} />
        <StatBlock label="ACTIVE" value={activeCount} color={activeCount > 0 ? crt : undefined} sub="receiving calls" />
        <StatBlock label="INACTIVE" value={phoneNumbers.length - activeCount} color={phoneNumbers.length - activeCount > 0 ? amber : undefined} />
        <StatBlock label="ROUTING MODES" value={new Set(phoneNumbers.map(n => n.routingMode)).size || 0} color={blue} sub="configured" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: showForm ? '400px 1fr' : '1fr', gap: 20, alignItems: 'start' }}>
        {showForm && (
          <PhoneCard glow>
            <PhoneCardHeader accent={crt(0.5)}>ADD PHONE NUMBER</PhoneCardHeader>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.42rem', color: crt(0.3), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>PHONE NUMBER *</label>
                <input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} placeholder="+1 555 000 0000" style={INPUT_STYLE} />
              </div>
              <div>
                <label style={{ fontSize: '0.42rem', color: crt(0.3), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>LABEL</label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Main Line, Sales, Support..." style={INPUT_STYLE} />
              </div>
              <div>
                <label style={{ fontSize: '0.42rem', color: crt(0.3), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>GREETING MESSAGE</label>
                <textarea
                  value={form.greeting}
                  onChange={e => setForm(f => ({ ...f, greeting: e.target.value }))}
                  placeholder="Custom greeting when this number receives a call..."
                  style={{ ...INPUT_STYLE, height: 80, resize: 'none', display: 'block', lineHeight: 1.7 }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.42rem', color: crt(0.3), letterSpacing: '0.2em', display: 'block', marginBottom: 6 }}>ROUTING MODE</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {ROUTING_MODES.map(m => {
                    const isSel = form.routingMode === m.key;
                    return (
                      <button
                        key={m.key}
                        onClick={() => setForm(f => ({ ...f, routingMode: m.key }))}
                        style={{
                          padding: '10px 12px', textAlign: 'left', borderRadius: 6, cursor: 'pointer',
                          background: isSel ? `linear-gradient(135deg, ${m.color(0.1)}, transparent)` : 'rgba(0,12,0,0.5)',
                          border: `1px solid ${isSel ? m.color(0.3) : crt(0.08)}`,
                          transition: 'all 0.15s',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}
                      >
                        <div style={{ color: isSel ? m.color(0.7) : crt(0.2) }}>{m.icon}</div>
                        <div>
                          <div style={{ fontSize: '0.52rem', color: isSel ? m.color(0.9) : crt(0.45), letterSpacing: '0.05em' }}>{m.label}</div>
                          <div style={{ fontSize: '0.38rem', color: isSel ? m.color(0.4) : crt(0.18), marginTop: 1 }}>{m.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <PhoneBtn onClick={addNumber} disabled={!form.number || adding} color={(o: number) => `rgba(0,220,60,${o})`} glow={!!form.number} style={{ justifyContent: 'center', height: 44 }} size="lg">
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {adding ? 'ADDING...' : 'REGISTER NUMBER'}
              </PhoneBtn>
            </div>
          </PhoneCard>
        )}

        <PhoneCard>
          <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>REGISTERED NUMBERS</span>
            <span style={{ color: crt(0.4), fontVariantNumeric: 'tabular-nums' }}>{phoneNumbers.length} NUMBER{phoneNumbers.length !== 1 ? 'S' : ''}</span>
          </PhoneCardHeader>

          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <Loader2 size={20} className="animate-spin" style={{ color: crt(0.3), marginBottom: 8 }} />
              <div style={{ fontSize: '0.55rem', color: crt(0.25), letterSpacing: '0.15em' }}>LOADING NUMBERS...</div>
            </div>
          ) : phoneNumbers.length === 0 ? (
            <EmptyState message="NO PHONE NUMBERS CONFIGURED — ADD A TWILIO NUMBER TO START MAKING AND RECEIVING CALLS" icon={<Phone size={32} />} />
          ) : (
            phoneNumbers.map((n, i) => {
              const routeColor = ROUTING_COLORS[n.routingMode] ?? crt;
              const isExpanded = expandedId === n.id;
              return (
                <div key={n.id} style={{ borderBottom: `1px solid ${crt(0.05)}` }}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : n.id)}
                    style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'background 0.12s' }}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      background: `linear-gradient(135deg, ${routeColor(n.isActive ? 0.1 : 0.04)}, transparent)`,
                      border: `1px solid ${routeColor(n.isActive ? 0.25 : 0.08)}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative',
                      boxShadow: n.isActive ? `0 0 10px ${routeColor(0.06)}` : 'none',
                    }}>
                      <Phone size={18} style={{ color: routeColor(n.isActive ? 0.7 : 0.25) }} />
                      <div style={{
                        position: 'absolute', bottom: -2, right: -2,
                        width: 10, height: 10, borderRadius: '50%',
                        background: n.isActive ? crt(0.8) : crt(0.15),
                        border: '2px solid rgba(0,10,0,0.8)',
                        boxShadow: n.isActive ? `0 0 6px ${crt(0.4)}` : 'none',
                      }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: '0.85rem', color: crt(0.9),
                          fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em',
                        }}>{n.number}</span>
                        {n.isActive && <MiniWaveform active bars={3} />}
                      </div>
                      {n.label && <div style={{ fontSize: '0.55rem', color: crt(0.45), marginTop: 3 }}>{n.label}</div>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.42rem', letterSpacing: '0.08em',
                          color: routeColor(0.8), background: routeColor(0.06),
                          border: `1px solid ${routeColor(0.2)}`,
                          padding: '2px 8px', borderRadius: 4,
                        }}>
                          {n.routingMode.toUpperCase()}
                        </span>
                        <span style={{
                          fontSize: '0.42rem', letterSpacing: '0.08em',
                          color: n.isActive ? crt(0.7) : crt(0.3),
                          background: n.isActive ? crt(0.04) : 'transparent',
                          border: `1px solid ${n.isActive ? crt(0.15) : crt(0.08)}`,
                          padding: '2px 8px', borderRadius: 4,
                        }}>
                          {n.isActive ? '● ACTIVE' : '○ INACTIVE'}
                        </span>
                        {n.friendlyName && (
                          <span style={{ fontSize: '0.42rem', color: crt(0.2), padding: '2px 8px' }}>
                            {n.friendlyName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      <SignalMeter level={n.isActive ? 4 : 1} color={routeColor} />
                      <PhoneBtn onClick={e => { (e as React.MouseEvent).stopPropagation(); deleteNumber(n.id); }} color={red} size="sm" title="Remove number">
                        <Trash2 size={12} />
                      </PhoneBtn>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '14px 20px 18px', background: 'rgba(56,189,248,0.015)', borderTop: `1px solid ${crt(0.05)}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <div style={{ fontSize: '0.42rem', color: crt(0.3), letterSpacing: '0.2em', marginBottom: 6 }}>NUMBER DETAILS</div>
                          {[
                            ['NUMBER', n.number],
                            ['LABEL', n.label || '—'],
                            ['ROUTING', n.routingMode.toUpperCase()],
                            ['STATUS', n.isActive ? 'ACTIVE' : 'INACTIVE'],
                            ['FRIENDLY NAME', n.friendlyName || '—'],
                          ].map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: '0.45rem', color: crt(0.2), letterSpacing: '0.08em' }}>{k}</span>
                              <span style={{ fontSize: '0.45rem', color: crt(0.45), fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.42rem', color: crt(0.3), letterSpacing: '0.2em', marginBottom: 6 }}>GREETING</div>
                          {n.greeting ? (
                            <div style={{
                              fontSize: '0.52rem', color: crt(0.45), fontStyle: 'italic', lineHeight: 1.6,
                              padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, border: `1px solid ${crt(0.05)}`,
                            }}>
                              "{n.greeting}"
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.48rem', color: crt(0.2), fontStyle: 'italic' }}>No custom greeting configured</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </PhoneCard>
      </div>
    </PhonePageLayout>
  );
}
