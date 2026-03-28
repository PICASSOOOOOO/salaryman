import { useState, useEffect, useCallback } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { Save, Loader2, ToggleLeft, ToggleRight, Bot, Shield, Clock, MessageSquare, Phone, AlertTriangle, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, StatBlock, MiniWaveform, INPUT_STYLE } from './PhoneLayout';
import {
  crt, amber, blue, red, purple,
  type SecretaryConfig,
} from '@/lib/phone-utils';

export default function PhoneSecretaryPage() {
  const [boomerMode] = useBoomerMode();
  const BASE = import.meta.env.BASE_URL;
  const [, navigate] = useLocation();
  const { login } = useAuth();

  const [_secretaryConfig, setSecretaryConfig] = useState<SecretaryConfig | null>(null);
  const [secretaryForm, setSecretaryForm] = useState<Partial<SecretaryConfig>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  const handleAuthStatus = useCallback((r: Response): boolean => {
    if (r.status === 401) { setNeedsLogin(true); return true; }
    if (r.status === 403) { navigate('/upgrade'); return true; }
    return false;
  }, [navigate]);

  useEffect(() => {
    fetch(apiUrl('twilio/secretary/config'), { credentials: 'include' })
      .then(async r => {
        if (handleAuthStatus(r)) return;
        if (r.ok) {
          const d = await r.json();
          if (d?.config) { setSecretaryConfig(d.config); setSecretaryForm(d.config); }
          else {
            const defaults: Partial<SecretaryConfig> = {
              isEnabled: false, personality: 'professional', greetingScript: null, screeningRules: null,
              businessHoursStart: '09:00', businessHoursEnd: '17:00', businessDays: 'Mon-Fri',
              routingInstructions: null, forwardToNumber: null, afterHoursAction: 'voicemail',
            };
            setSecretaryForm(defaults);
          }
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load secretary configuration');
      })
      .finally(() => setLoading(false));
  }, [apiUrl, handleAuthStatus]);

  const saveConfig = async () => {
    setSaving(true);
    setError('');
    try {
      const r = await fetch(apiUrl('twilio/secretary/config'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(secretaryForm),
      });
      if (handleAuthStatus(r)) return;
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || 'Failed to save configuration');
      } else {
        const d = await r.json();
        setSecretaryConfig(d.config);
        setSecretaryForm(d.config);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error'); }
    finally { setSaving(false); }
  };

  const update = (key: keyof SecretaryConfig, value: unknown) => {
    setSecretaryForm(prev => ({ ...prev, [key]: value }));
  };

  const isEnabled = !!secretaryForm.isEnabled;

  const PERSONALITIES = [
    { key: 'professional', label: 'PROFESSIONAL', desc: 'Formal, businesslike, and efficient', icon: '💼', color: blue },
    { key: 'friendly', label: 'FRIENDLY', desc: 'Warm, conversational, and approachable', icon: '😊', color: crt },
    { key: 'assertive', label: 'ASSERTIVE', desc: 'Direct, efficient, and to-the-point', icon: '⚡', color: amber },
    { key: 'custom', label: 'CUSTOM', desc: 'Define your own personality in the greeting', icon: '🎭', color: purple },
  ];

  const AFTER_HOURS = [
    { key: 'voicemail', label: 'VOICEMAIL', desc: 'Record a message for you', icon: <MessageSquare size={14} />, color: blue },
    { key: 'forward', label: 'FORWARD', desc: 'Forward to another number', icon: <Phone size={14} />, color: crt },
    { key: 'hang_up', label: 'HANG UP', desc: 'Politely decline the call', icon: <Shield size={14} />, color: red },
  ];

  if (loading) return (
    <PhonePageLayout title="AI SECRETARY" subtitle="Loading configuration..." icon={<Bot size={24} style={{ color: blue(0.8) }} />}>
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: crt(0.3), marginBottom: 12 }} />
        <div style={{ fontSize: '0.55rem', color: crt(0.25), letterSpacing: '0.15em' }}>LOADING SECRETARY CONFIGURATION...</div>
      </div>
    </PhonePageLayout>
  );

  if (needsLogin) return (
    <PhonePageLayout title="AI SECRETARY" subtitle="Authentication required" icon={<Bot size={24} style={{ color: blue(0.8) }} />}>
      <div style={{ padding: '60px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <AlertTriangle size={32} style={{ color: `rgba(251,191,36,0.6)` }} />
        <div style={{ fontSize: '0.65rem', color: `rgba(251,191,36,0.8)`, letterSpacing: '0.15em', fontFamily: "'Share Tech Mono', monospace" }}>
          SESSION EXPIRED
        </div>
        <div style={{ fontSize: '0.55rem', color: crt(0.35), letterSpacing: '0.08em', maxWidth: 320, lineHeight: 1.7 }}>
          Your session has expired or you are not logged in. Please sign in again to access your secretary configuration.
        </div>
        <button
          onClick={login}
          style={{
            ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }), fontSize: '0.7rem', color: '#38bdf8',
            border: '1px solid rgba(56,189,248,0.4)', padding: '10px 28px',
            background: 'rgba(56,189,248,0.06)', cursor: 'pointer', letterSpacing: '0.12em',
            transition: 'all 0.2s', marginTop: 8,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(56,189,248,0.12)'; e.currentTarget.style.borderColor = 'rgba(56,189,248,0.6)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(56,189,248,0.06)'; e.currentTarget.style.borderColor = 'rgba(56,189,248,0.4)'; }}
        >
          SIGN IN
        </button>
      </div>
    </PhonePageLayout>
  );

  return (
    <PhonePageLayout
      title="AI SECRETARY"
      subtitle="Configure your AI-powered secretary — personality, business hours, screening rules"
      icon={<Bot size={24} style={{ color: blue(0.8) }} />}
      statusLine={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isEnabled ? crt(0.8) : crt(0.15),
            boxShadow: isEnabled ? `0 0 8px ${crt(0.4)}` : 'none',
            animation: isEnabled ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ color: isEnabled ? crt(0.5) : crt(0.2) }}>
            {isEnabled ? 'SECRETARY ACTIVE' : 'SECRETARY DISABLED'}
          </span>
        </div>
      }
      actions={
        <PhoneBtn onClick={saveConfig} disabled={saving} color={(o: number) => `rgba(0,220,60,${o})`} glow={!saving && !saved}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? '✓' : <Save size={12} />}
          {saving ? 'SAVING...' : saved ? 'SAVED!' : 'SAVE CONFIG'}
        </PhoneBtn>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: 'linear-gradient(90deg, rgba(255,40,40,0.08), rgba(255,40,40,0.03))', border: `1px solid ${red(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: red(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} />
            {error}
          </div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: red(0.4), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="STATUS" value={isEnabled ? 'ACTIVE' : 'OFF'} color={isEnabled ? crt : undefined} sub={isEnabled ? 'answering calls' : 'disabled'} />
        <StatBlock label="PERSONALITY" value={(secretaryForm.personality ?? 'professional').toUpperCase()} color={PERSONALITIES.find(p => p.key === secretaryForm.personality)?.color || blue} />
        <StatBlock label="HOURS" value={`${secretaryForm.businessHoursStart ?? '09:00'} - ${secretaryForm.businessHoursEnd ?? '17:00'}`} color={amber} />
        <StatBlock label="AFTER HOURS" value={(secretaryForm.afterHoursAction ?? 'voicemail').toUpperCase()} color={blue} />
      </div>

      <PhoneCard glow={isEnabled} style={{ marginBottom: 20 }}>
        <div style={{
          padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: isEnabled
            ? `linear-gradient(90deg, ${crt(0.04)}, transparent)`
            : 'transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 50, height: 50, borderRadius: 12,
              background: isEnabled
                ? `linear-gradient(135deg, ${crt(0.12)}, ${crt(0.03)})`
                : 'rgba(0,12,0,0.5)',
              border: `1px solid ${isEnabled ? crt(0.3) : crt(0.1)}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isEnabled ? `0 0 20px ${crt(0.08)}` : 'none',
              transition: 'all 0.3s',
            }}>
              <Bot size={24} style={{ color: isEnabled ? crt(0.8) : crt(0.25) }} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: crt(isEnabled ? 0.9 : 0.5) }}>
                AI SECRETARY IS {isEnabled ? 'ENABLED' : 'DISABLED'}
              </div>
              <div style={{ fontSize: '0.48rem', color: crt(0.3), marginTop: 3, maxWidth: 400 }}>
                {isEnabled
                  ? 'Your AI secretary is actively handling incoming calls. It will greet callers, screen them, and route according to your configuration.'
                  : 'Enable the secretary to have AI handle your incoming calls. It will answer, screen, and route calls based on your preferences.'}
              </div>
            </div>
          </div>
          <button
            onClick={() => update('isEnabled', !isEnabled)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
              borderRadius: 8,
              transition: 'all 0.2s',
            }}
          >
            {isEnabled
              ? <ToggleRight size={36} style={{ color: crt(0.8) }} />
              : <ToggleLeft size={36} style={{ color: crt(0.2) }} />
            }
          </button>
        </div>
        {isEnabled && (
          <div style={{ padding: '0 24px 12px' }}>
            <MiniWaveform active bars={12} />
          </div>
        )}
      </PhoneCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard>
            <PhoneCardHeader accent={blue(0.4)}>PERSONALITY</PhoneCardHeader>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PERSONALITIES.map(p => {
                const isSel = secretaryForm.personality === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => update('personality', p.key)}
                    style={{
                      padding: '14px 16px', textAlign: 'left', borderRadius: 8, cursor: 'pointer',
                      background: isSel ? `linear-gradient(135deg, ${p.color(0.1)}, ${p.color(0.02)})` : 'rgba(0,12,0,0.5)',
                      border: `1px solid ${isSel ? p.color(0.35) : crt(0.08)}`,
                      transition: 'all 0.15s',
                      boxShadow: isSel ? `0 0 10px ${p.color(0.05)}` : 'none',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>{p.icon}</span>
                    <div>
                      <div style={{ fontSize: '0.58rem', color: isSel ? p.color(0.9) : crt(0.5), letterSpacing: '0.1em' }}>{p.label}</div>
                      <div style={{ fontSize: '0.45rem', color: isSel ? p.color(0.45) : crt(0.2), marginTop: 2 }}>{p.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader accent={crt(0.3)}>GREETING SCRIPT</PhoneCardHeader>
            <div style={{ padding: 18 }}>
              <label style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.2em', display: 'block', marginBottom: 6 }}>
                WHAT THE SECRETARY SAYS WHEN ANSWERING
              </label>
              <textarea
                value={secretaryForm.greetingScript ?? ''}
                onChange={e => update('greetingScript', e.target.value || null)}
                placeholder='e.g. "Thank you for calling. This is the office of [Your Name]. How may I assist you today?"'
                style={{ ...INPUT_STYLE, height: 120, resize: 'vertical', display: 'block', lineHeight: 1.7 }}
              />
              <div style={{ fontSize: '0.42rem', color: crt(0.2), marginTop: 6 }}>
                Leave blank for a default professional greeting.
              </div>
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader accent={amber(0.4)}>CALL SCREENING RULES</PhoneCardHeader>
            <div style={{ padding: 18 }}>
              <label style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.2em', display: 'block', marginBottom: 6 }}>
                INSTRUCTIONS FOR SCREENING CALLERS
              </label>
              <textarea
                value={secretaryForm.screeningRules ?? ''}
                onChange={e => update('screeningRules', e.target.value || null)}
                placeholder="e.g. Ask for the caller's name, company, and reason for calling. Screen out sales and recruitment calls. Immediately connect calls from clients and partners. Take messages for everyone else."
                style={{ ...INPUT_STYLE, height: 130, resize: 'vertical', display: 'block', lineHeight: 1.7 }}
              />
            </div>
          </PhoneCard>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard>
            <PhoneCardHeader accent={amber(0.4)}>
              <Clock size={10} style={{ marginRight: 4 }} /> BUSINESS HOURS
            </PhoneCardHeader>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>ACTIVE DAYS</label>
                <input value={secretaryForm.businessDays ?? 'Mon-Fri'} onChange={e => update('businessDays', e.target.value)} placeholder="Mon-Fri" style={INPUT_STYLE} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>OPENS AT</label>
                  <input type="time" value={secretaryForm.businessHoursStart ?? '09:00'} onChange={e => update('businessHoursStart', e.target.value)} style={{ ...INPUT_STYLE, colorScheme: 'dark' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>CLOSES AT</label>
                  <input type="time" value={secretaryForm.businessHoursEnd ?? '17:00'} onChange={e => update('businessHoursEnd', e.target.value)} style={{ ...INPUT_STYLE, colorScheme: 'dark' }} />
                </div>
              </div>
              <div style={{
                padding: '10px 14px', borderRadius: 6,
                background: amber(0.03), border: `1px solid ${amber(0.1)}`,
                fontSize: '0.45rem', color: amber(0.5), lineHeight: 1.6,
              }}>
                During business hours, the secretary will answer and screen calls. Outside these hours, the "After Hours" action below will apply.
              </div>
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader>AFTER HOURS ACTION</PhoneCardHeader>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {AFTER_HOURS.map(a => {
                const isSel = secretaryForm.afterHoursAction === a.key;
                return (
                  <button
                    key={a.key}
                    onClick={() => update('afterHoursAction', a.key)}
                    style={{
                      padding: '14px 16px', textAlign: 'left', borderRadius: 8, cursor: 'pointer',
                      background: isSel ? `linear-gradient(135deg, ${a.color(0.08)}, transparent)` : 'rgba(0,12,0,0.5)',
                      border: `1px solid ${isSel ? a.color(0.3) : crt(0.08)}`,
                      display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ color: isSel ? a.color(0.7) : crt(0.25) }}>{a.icon}</div>
                    <div>
                      <div style={{ fontSize: '0.58rem', color: isSel ? a.color(0.9) : crt(0.5), letterSpacing: '0.1em' }}>{a.label}</div>
                      <div style={{ fontSize: '0.45rem', color: isSel ? a.color(0.45) : crt(0.2), marginTop: 2 }}>{a.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader>CALL ROUTING</PhoneCardHeader>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>FORWARD TO NUMBER</label>
                <input value={secretaryForm.forwardToNumber ?? ''} onChange={e => update('forwardToNumber', e.target.value || null)} placeholder="e.g. +1 555 000 0000" style={INPUT_STYLE} />
                <div style={{ fontSize: '0.4rem', color: crt(0.2), marginTop: 4 }}>
                  Used for forwarding and as fallback when the secretary connects a screened call.
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>ROUTING INSTRUCTIONS</label>
                <textarea
                  value={secretaryForm.routingInstructions ?? ''}
                  onChange={e => update('routingInstructions', e.target.value || null)}
                  placeholder="Special routing rules — e.g. 'Forward VIP clients immediately. Send recruiters to voicemail. Text me for emergency calls.'"
                  style={{ ...INPUT_STYLE, height: 100, resize: 'vertical', display: 'block', lineHeight: 1.7 }}
                />
              </div>
            </div>
          </PhoneCard>
        </div>
      </div>
    </PhonePageLayout>
  );
}
