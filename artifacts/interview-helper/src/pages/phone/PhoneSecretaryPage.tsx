import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { Save, Loader2, ToggleLeft, ToggleRight, Bot, Shield, Clock, MessageSquare, Phone, AlertTriangle, X, Zap, Upload, PhoneOutgoing, FileText , Check} from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, StatBlock, MiniWaveform, INPUT_STYLE } from './PhoneLayout';
import {
  slate, warning, primary, destructive, accent,
  type SecretaryConfig,
  type OutboundCampaign } from '@/lib/phone-utils';

export default function PhoneSecretaryPage() {
  const isMobile = useIsMobile();

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
  const [campaigns, setCampaigns] = useState<OutboundCampaign[]>([]);
  const [campaignName, setCampaignName] = useState('');
  const [campaignScript, setCampaignScript] = useState('');
  const [campaignLeads, setCampaignLeads] = useState('');
  const [campaignCreating, setCampaignCreating] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  const handleAuthStatus = useCallback((r: Response): boolean => {
    if (r.status === 401) { setNeedsLogin(true); return true; }
    if (r.status === 403) { navigate('/pricing'); return true; }
    return false;
  }, [navigate]);

  useEffect(() => {
    apiFetch(apiUrl('twilio/secretary/config'), { credentials: 'include' })
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
              autoAnswer: false, qualificationQuestions: null, transferRouting: null,
              outboundScript: null, outboundSchedule: null };
            setSecretaryForm(defaults);
          }
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load secretary configuration');
      })
      .finally(() => setLoading(false));

    apiFetch(apiUrl('twilio/pablo/campaigns'), { credentials: 'include' })
      .then(async r => { if (r.ok) { const d = await r.json(); setCampaigns(d.campaigns ?? []); } })
      .catch(() => {});
  }, [apiUrl, handleAuthStatus]);

  const createCampaign = async () => {
    if (!campaignName || !campaignScript || !campaignLeads) return;
    setCampaignCreating(true);
    try {
      const leads = campaignLeads.split('\n').filter(l => l.trim()).map(l => {
        const parts = l.split(',');
        return { phone: parts[0]?.trim() ?? '', name: parts[1]?.trim() ?? '' };
      }).filter(l => l.phone);
      const r = await apiFetch(apiUrl('twilio/pablo/campaigns'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: campaignName, script: campaignScript, leadsJson: JSON.stringify(leads) }) });
      if (r.ok) {
        const d = await r.json();
        setCampaigns(prev => [d.campaign, ...prev]);
        setCampaignName(''); setCampaignScript(''); setCampaignLeads('');
      }
    } catch {} finally { setCampaignCreating(false); }
  };

  const startCampaign = async (id: number) => {
    try {
      const r = await apiFetch(apiUrl(`twilio/pablo/campaigns/${id}/start`), {
        method: 'POST', credentials: 'include' });
      if (r.ok) {
        setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'active' } : c));
      }
    } catch {}
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setCampaignLeads(text);
    };
    reader.readAsText(file);
  };

  const saveConfig = async () => {
    setSaving(true);
    setError('');
    try {
      const r = await apiFetch(apiUrl('twilio/secretary/config'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(secretaryForm) });
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
    { key: 'professional', label: 'PROFESSIONAL', desc: 'Formal, businesslike, and efficient', icon: '💼', color: primary },
    { key: 'friendly', label: 'FRIENDLY', desc: 'Warm, conversational, and approachable', icon: '😊', color: slate },
    { key: 'assertive', label: 'ASSERTIVE', desc: 'Direct, efficient, and to-the-point', icon: <Zap size={14} />, color: warning },
    { key: 'custom', label: 'CUSTOM', desc: 'Define your own personality in the greeting', icon: '🎭', color: accent },
  ];

  const AFTER_HOURS = [
    { key: 'voicemail', label: 'VOICEMAIL', desc: 'Record a message for you', icon: <MessageSquare size={14} />, color: primary },
    { key: 'forward', label: 'FORWARD', desc: 'Forward to another number', icon: <Phone size={14} />, color: slate },
    { key: 'hang_up', label: 'HANG UP', desc: 'Politely decline the call', icon: <Shield size={14} />, color: destructive },
  ];

  if (loading) return (
    <PhonePageLayout title="AI SECRETARY" subtitle="Loading configuration..." icon={<Bot size={24} style={{ color: primary(0.8) }} />}>
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: slate(0.55), marginBottom: 12 }} />
        <div style={{ fontSize: '0.55rem', color: slate(0.55), letterSpacing: '0.15em' }}>LOADING SECRETARY CONFIGURATION...</div>
      </div>
    </PhonePageLayout>
  );

  if (needsLogin) return (
    <PhonePageLayout title="AI SECRETARY" subtitle="Authentication required" icon={<Bot size={24} style={{ color: primary(0.8) }} />}>
      <div style={{ padding: '60px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <AlertTriangle size={32} style={{ color: warning(0.6) }} />
        <div style={{ fontSize: '0.65rem', color: warning(0.8), letterSpacing: '0.15em', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}>
          SESSION EXPIRED
        </div>
        <div style={{ fontSize: '0.55rem', color: slate(0.55), letterSpacing: '0.08em', maxWidth: 320, lineHeight: 1.7 }}>
          Your session has expired or you are not logged in. Please sign in again to access your secretary configuration.
        </div>
        <button
          onClick={() => login()}
          style={{
            ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), fontSize: '0.7rem', color: '#38bdf8',
            border: `1px solid ${slate(0.4)}`, padding: '10px 28px',
            background: slate(0.06), cursor: 'pointer', letterSpacing: '0.12em',
            transition: 'all 0.2s', marginTop: 8 }}
          onMouseEnter={e => { e.currentTarget.style.background = slate(0.12); e.currentTarget.style.borderColor = slate(0.6); }}
          onMouseLeave={e => { e.currentTarget.style.background = slate(0.06); e.currentTarget.style.borderColor = slate(0.4); }}
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
      icon={<Bot size={24} style={{ color: primary(0.8) }} />}
      statusLine={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isEnabled ? slate(0.8) : slate(0.15),

            animation: isEnabled ? 'pulse 2s infinite' : 'none' }} />
          <span style={{ color: isEnabled ? slate(0.5) : slate(0.2) }}>
            {isEnabled ? 'SECRETARY ACTIVE' : 'SECRETARY DISABLED'}
          </span>
        </div>
      }
      actions={
        <PhoneBtn onClick={saveConfig} disabled={saving} color={primary}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : <Save size={12} />}
          {saving ? 'SAVING...' : saved ? 'SAVED!' : 'SAVE CONFIG'}
        </PhoneBtn>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: slate(0.02), border: `1px solid ${destructive(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: destructive(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} />
            {error}
          </div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: destructive(0.55), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="STATUS" value={isEnabled ? 'ACTIVE' : 'OFF'} color={isEnabled ? slate : undefined} sub={isEnabled ? 'answering calls' : 'disabled'} />
        <StatBlock label="PERSONALITY" value={(secretaryForm.personality ?? 'professional').toUpperCase()} color={PERSONALITIES.find(p => p.key === secretaryForm.personality)?.color || primary} />
        <StatBlock label="HOURS" value={`${secretaryForm.businessHoursStart ?? '09:00'} - ${secretaryForm.businessHoursEnd ?? '17:00'}`} color={warning} />
        <StatBlock label="AFTER HOURS" value={(secretaryForm.afterHoursAction ?? 'voicemail').toUpperCase()} color={primary} />
      </div>

      <PhoneCard style={{ marginBottom: 20 }}>
        <div style={{
          padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: isEnabled
            ? `linear-gradient(90deg, ${slate(0.04)}, transparent)`
            : 'transparent' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 50, height: 50, borderRadius: 12,
              background: isEnabled
                ? `linear-gradient(135deg, ${slate(0.12)}, ${slate(0.03)})`
                : slate(0.04),
              border: `1px solid ${isEnabled ? slate(0.3) : slate(0.1)}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',

              transition: 'all 0.3s' }}>
              <Bot size={24} style={{ color: isEnabled ? slate(0.8) : slate(0.25) }} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: slate(isEnabled ? 0.9 : 0.5) }}>
                AI SECRETARY IS {isEnabled ? 'ENABLED' : 'DISABLED'}
              </div>
              <div style={{ fontSize: '0.48rem', color: slate(0.55), marginTop: 3, maxWidth: 400 }}>
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
              transition: 'all 0.2s' }}
          >
            {isEnabled
              ? <ToggleRight size={36} style={{ color: slate(0.8) }} />
              : <ToggleLeft size={36} style={{ color: slate(0.55) }} />
            }
          </button>
        </div>
        {isEnabled && (
          <div style={{ padding: '0 24px 12px' }}>
            <MiniWaveform active bars={12} />
          </div>
        )}
      </PhoneCard>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard>
            <PhoneCardHeader accent={primary(0.4)}>PERSONALITY</PhoneCardHeader>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PERSONALITIES.map(p => {
                const isSel = secretaryForm.personality === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => update('personality', p.key)}
                    style={{
                      padding: '14px 16px', textAlign: 'left', borderRadius: 8, cursor: 'pointer',
                      background: isSel ? slate(0.06) : slate(0.04),
                      border: `1px solid ${isSel ? p.color(0.35) : slate(0.08)}`,
                      transition: 'all 0.15s',

                      display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>{p.icon}</span>
                    <div>
                      <div style={{ fontSize: '0.58rem', color: isSel ? p.color(0.9) : slate(0.5), letterSpacing: '0.1em' }}>{p.label}</div>
                      <div style={{ fontSize: '0.45rem', color: isSel ? p.color(0.45) : slate(0.2), marginTop: 2 }}>{p.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader accent={slate(0.3)}>GREETING SCRIPT</PhoneCardHeader>
            <div style={{ padding: 18 }}>
              <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 6 }}>
                WHAT THE SECRETARY SAYS WHEN ANSWERING
              </label>
              <textarea
                value={secretaryForm.greetingScript ?? ''}
                onChange={e => update('greetingScript', e.target.value || null)}
                placeholder='e.g. "Thank you for calling. This is the office of [Your Name]. How may I assist you today?"'
                style={{ ...INPUT_STYLE, height: 120, resize: 'vertical', display: 'block', lineHeight: 1.7 }}
              />
              <div style={{ fontSize: '0.42rem', color: slate(0.55), marginTop: 6 }}>
                Leave blank for a default professional greeting.
              </div>
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader accent={warning(0.4)}>CALL SCREENING RULES</PhoneCardHeader>
            <div style={{ padding: 18 }}>
              <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 6 }}>
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
            <PhoneCardHeader accent={warning(0.4)}>
              <Clock size={10} style={{ marginRight: 4 }} /> BUSINESS HOURS
            </PhoneCardHeader>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>ACTIVE DAYS</label>
                <input value={secretaryForm.businessDays ?? 'Mon-Fri'} onChange={e => update('businessDays', e.target.value)} placeholder="Mon-Fri" style={INPUT_STYLE} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>OPENS AT</label>
                  <input type="time" value={secretaryForm.businessHoursStart ?? '09:00'} onChange={e => update('businessHoursStart', e.target.value)} style={{ ...INPUT_STYLE, colorScheme: 'dark' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>CLOSES AT</label>
                  <input type="time" value={secretaryForm.businessHoursEnd ?? '17:00'} onChange={e => update('businessHoursEnd', e.target.value)} style={{ ...INPUT_STYLE, colorScheme: 'dark' }} />
                </div>
              </div>
              <div style={{
                padding: '10px 14px', borderRadius: 6,
                background: warning(0.03), border: `1px solid ${warning(0.1)}`,
                fontSize: '0.45rem', color: warning(0.5), lineHeight: 1.6 }}>
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
                      background: isSel ? slate(0.06) : slate(0.04),
                      border: `1px solid ${isSel ? a.color(0.3) : slate(0.08)}`,
                      display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}
                  >
                    <div style={{ color: isSel ? a.color(0.7) : slate(0.25) }}>{a.icon}</div>
                    <div>
                      <div style={{ fontSize: '0.58rem', color: isSel ? a.color(0.9) : slate(0.5), letterSpacing: '0.1em' }}>{a.label}</div>
                      <div style={{ fontSize: '0.45rem', color: isSel ? a.color(0.45) : slate(0.2), marginTop: 2 }}>{a.desc}</div>
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
                <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>FORWARD TO NUMBER</label>
                <input value={secretaryForm.forwardToNumber ?? ''} onChange={e => update('forwardToNumber', e.target.value || null)} placeholder="e.g. +1 555 000 0000" style={INPUT_STYLE} />
                <div style={{ fontSize: '0.4rem', color: slate(0.55), marginTop: 4 }}>
                  Used for forwarding and as fallback when the secretary connects a screened call.
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>ROUTING INSTRUCTIONS</label>
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

      <PhoneCard style={{ marginTop: 20 }}>
        <PhoneCardHeader accent={accent(0.5)}>
          <Zap size={10} style={{ marginRight: 4 }} /> PABLO AUTONOMOUS AGENT
        </PhoneCardHeader>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: secretaryForm.autoAnswer ? `linear-gradient(90deg, ${accent(0.06)}, transparent)` : 'transparent',
            border: `1px solid ${secretaryForm.autoAnswer ? accent(0.2) : slate(0.06)}` }}>
            <div>
              <div style={{ fontSize: '0.65rem', color: secretaryForm.autoAnswer ? accent(0.9) : slate(0.5), letterSpacing: '0.1em' }}>
                AUTO-ANSWER MODE
              </div>
              <div style={{ fontSize: '0.42rem', color: secretaryForm.autoAnswer ? accent(0.4) : slate(0.2), marginTop: 3, maxWidth: 400 }}>
                When enabled, Pablo will autonomously handle inbound calls with multi-turn conversation, CRM integration, and intelligent call routing. No human intervention needed.
              </div>
            </div>
            <button
              onClick={() => update('autoAnswer', !secretaryForm.autoAnswer)}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {secretaryForm.autoAnswer
                ? <ToggleRight size={32} style={{ color: accent(0.8) }} />
                : <ToggleLeft size={32} style={{ color: slate(0.55) }} />
              }
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>
                QUALIFICATION QUESTIONS
              </label>
              <textarea
                value={secretaryForm.qualificationQuestions ?? ''}
                onChange={e => update('qualificationQuestions', e.target.value || null)}
                placeholder={'e.g.\n- What is your budget range?\n- What is your timeline?\n- Who is the decision maker?'}
                style={{ ...INPUT_STYLE, height: 120, resize: 'vertical', display: 'block', lineHeight: 1.7 }}
              />
              <div style={{ fontSize: '0.38rem', color: slate(0.55), marginTop: 4 }}>
                Pablo will weave these questions into the conversation naturally.
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>
                TRANSFER ROUTING RULES
              </label>
              <textarea
                value={secretaryForm.transferRouting ?? ''}
                onChange={e => update('transferRouting', e.target.value || null)}
                placeholder={'e.g.\n- Sales inquiries → +15551234567\n- Support issues → +15559876543\n- VIP clients → transfer immediately'}
                style={{ ...INPUT_STYLE, height: 120, resize: 'vertical', display: 'block', lineHeight: 1.7 }}
              />
              <div style={{ fontSize: '0.38rem', color: slate(0.55), marginTop: 4 }}>
                Pablo will transfer calls based on these rules automatically.
              </div>
            </div>
          </div>
        </div>
      </PhoneCard>

      <PhoneCard style={{ marginTop: 20 }}>
        <PhoneCardHeader accent={primary(0.5)}>
          <Phone size={10} style={{ marginRight: 4 }} /> DID CONFIGURATION
        </PhoneCardHeader>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            padding: '10px 14px', borderRadius: 6,
            background: primary(0.03), border: `1px solid ${primary(0.1)}`,
            fontSize: '0.45rem', color: primary(0.5), lineHeight: 1.6 }}>
            Configure separate DIDs for inbound call center screening and outbound campaigns. When a call comes in on the Inbound DID, Pablo will screen the caller and route to available agents via round-robin.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>INBOUND DID (SCREENING LINE)</label>
              <input value={secretaryForm.inboundDid ?? ''} onChange={e => update('inboundDid', e.target.value || null)} placeholder="e.g. +1 555 000 1111" style={INPUT_STYLE} />
              <div style={{ fontSize: '0.38rem', color: slate(0.55), marginTop: 4 }}>
                Calls to this number go through Pablo screening → round-robin agent transfer.
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>OUTBOUND DID (CAMPAIGN LINE)</label>
              <input value={secretaryForm.outboundDid ?? ''} onChange={e => update('outboundDid', e.target.value || null)} placeholder="e.g. +1 555 000 2222" style={INPUT_STYLE} />
              <div style={{ fontSize: '0.38rem', color: slate(0.55), marginTop: 4 }}>
                Outbound campaigns will dial from this number.
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>SCREENING TIME LIMIT (SEC)</label>
              <input type="number" value={secretaryForm.screeningTimeLimit ?? 120} onChange={e => update('screeningTimeLimit', parseInt(e.target.value) || 120)} min={30} max={300} style={INPUT_STYLE} />
              <div style={{ fontSize: '0.38rem', color: slate(0.55), marginTop: 4 }}>
                Max seconds Pablo screens before auto-transferring (30–300).
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>SCREENING SCRIPT</label>
              <textarea
                value={secretaryForm.screeningScript ?? ''}
                onChange={e => update('screeningScript', e.target.value || null)}
                placeholder="Custom greeting for inbound DID screening calls. Leave blank for default."
                style={{ ...INPUT_STYLE, height: 60, resize: 'vertical', display: 'block', lineHeight: 1.7 }}
              />
            </div>
          </div>
        </div>
      </PhoneCard>

      <PhoneCard style={{ marginTop: 20 }}>
        <PhoneCardHeader accent={warning(0.5)}>
          <PhoneOutgoing size={10} style={{ marginRight: 4 }} /> OUTBOUND AUTO-DIALER
        </PhoneCardHeader>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>
              DEFAULT OUTBOUND SCRIPT
            </label>
            <textarea
              value={secretaryForm.outboundScript ?? ''}
              onChange={e => update('outboundScript', e.target.value || null)}
              placeholder="e.g. Hi, I'm calling from [Company] to follow up on your recent inquiry. We'd love to schedule a brief demo of our platform..."
              style={{ ...INPUT_STYLE, height: 100, resize: 'vertical', display: 'block', lineHeight: 1.7 }}
            />
          </div>

          <div style={{ borderTop: `1px solid ${slate(0.06)}`, paddingTop: 16 }}>
            <div style={{ fontSize: '0.55rem', color: warning(0.8), letterSpacing: '0.12em', marginBottom: 12 }}>
              CREATE OUTBOUND CAMPAIGN
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>CAMPAIGN NAME</label>
                <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Q1 Lead Follow-up" style={INPUT_STYLE} />
              </div>
              <div>
                <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>CAMPAIGN SCRIPT</label>
                <input value={campaignScript} onChange={e => setCampaignScript(e.target.value)} placeholder="Hi, we wanted to follow up on..." style={INPUT_STYLE} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>
                LEAD LIST (PHONE,NAME — ONE PER LINE)
              </label>
              <textarea
                value={campaignLeads}
                onChange={e => setCampaignLeads(e.target.value)}
                placeholder={'+15551234567,John Smith\n+15559876543,Jane Doe\n+15550001111,Bob Johnson'}
                style={{ ...INPUT_STYLE, height: 80, resize: 'vertical', display: 'block', lineHeight: 1.7 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <input type="file" accept=".csv,.txt" ref={csvInputRef} onChange={handleCsvUpload} style={{ display: 'none' }} />
                <button
                  onClick={() => csvInputRef.current?.click()}
                  style={{
                    fontSize: '0.45rem', color: slate(0.5), background: slate(0.5),
                    border: `1px solid ${slate(0.12)}`, padding: '6px 12px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '0.1em' }}
                >
                  <Upload size={10} /> UPLOAD CSV
                </button>
                <span style={{ fontSize: '0.38rem', color: slate(0.55) }}>
                  {campaignLeads ? `${campaignLeads.split('\n').filter(l => l.trim()).length} LEADS LOADED` : 'OR PASTE LEADS ABOVE'}
                </span>
              </div>
            </div>
            <PhoneBtn onClick={createCampaign} disabled={campaignCreating || !campaignName || !campaignScript || !campaignLeads} color={warning}>
              {campaignCreating ? <Loader2 size={12} className="animate-spin" /> : <PhoneOutgoing size={12} />}
              {campaignCreating ? 'CREATING...' : 'CREATE CAMPAIGN'}
            </PhoneBtn>
          </div>

          {campaigns.length > 0 && (
            <div style={{ borderTop: `1px solid ${slate(0.06)}`, paddingTop: 16 }}>
              <div style={{ fontSize: '0.55rem', color: slate(0.5), letterSpacing: '0.12em', marginBottom: 10 }}>
                CAMPAIGNS ({campaigns.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {campaigns.map(c => (
                  <div key={c.id} style={{
                    padding: '12px 16px', background: slate(0.4),
                    border: `1px solid ${c.status === 'active' ? warning(0.3) : slate(0.08)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.55rem', color: slate(0.7), letterSpacing: '0.08em' }}>
                        <FileText size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        {c.name}
                      </div>
                      <div style={{ fontSize: '0.4rem', color: slate(0.55), marginTop: 3 }}>
                        {c.totalLeads} LEADS | {c.dialedCount} CALLED | STATUS: {c.status.toUpperCase()}
                      </div>
                    </div>
                    {c.status === 'draft' && (
                      <PhoneBtn onClick={() => startCampaign(c.id)} color={warning}>
                        <Zap size={10} /> START
                      </PhoneBtn>
                    )}
                    {c.status === 'active' && (
                      <div style={{ fontSize: '0.45rem', color: warning(0.7), letterSpacing: '0.1em' }}>
                        IN PROGRESS...
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PhoneCard>
    </PhonePageLayout>
  );
}
