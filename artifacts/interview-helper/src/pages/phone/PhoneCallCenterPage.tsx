import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Headphones, Plus, Trash2, ToggleLeft, ToggleRight, Loader2, X, FileText, Zap, PhoneOutgoing, PhoneIncoming, AlertTriangle, Users } from 'lucide-react';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, INPUT_STYLE } from './PhoneLayout';
import {
  slate, warning, primary, destructive, accent, formatPhone,
  type CallCenterAgent, type InboundScreening, type OutboundCampaign } from '@/lib/phone-utils';

type Tab = 'inbound' | 'outbound';
type CampaignContact = {
  id: number;
  name: string;
  phone: string;
  company: string;
  phoneCallOptIn: boolean;
  phoneCallConsentedAt: string | null;
};
type ScriptBranchDraft = { response: string; nextNodeId: string };
type ScriptNodeDraft = {
  id: string;
  question: string;
  yes: ScriptBranchDraft;
  no: ScriptBranchDraft;
};

const makeScriptNode = (index: number): ScriptNodeDraft => ({
  id: `question-${index}`,
  question: '',
  yes: { response: '', nextNodeId: '' },
  no: { response: '', nextNodeId: '' },
});

export default function PhoneCallCenterPage() {
  const isMobile = useIsMobile();

  const BASE = import.meta.env.BASE_URL;
  const [, navigate] = useLocation();

  const [tab, setTab] = useState<Tab>('outbound');
  const [agents, setAgents] = useState<CallCenterAgent[]>([]);
  const [screenings, setScreenings] = useState<InboundScreening[]>([]);
  const [metrics, setMetrics] = useState({ activeAgents: 0, totalScreenings: 0, transferred: 0, ended: 0, avgScreenTime: 0 });
  const [campaigns, setCampaigns] = useState<OutboundCampaign[]>([]);
  const [campaignContacts, setCampaignContacts] = useState<CampaignContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [addingAgent, setAddingAgent] = useState(false);

  const [campaignName, setCampaignName] = useState('');
  const [scriptBusinessName, setScriptBusinessName] = useState('');
  const [scriptOpening, setScriptOpening] = useState('');
  const [scriptClosing, setScriptClosing] = useState('Thank you for your time. Goodbye.');
  const [scriptNodes, setScriptNodes] = useState<ScriptNodeDraft[]>([{
    ...makeScriptNode(1),
    question: 'Would you like to hear more?',
    yes: { response: 'Great, I can tell you more.', nextNodeId: '' },
    no: { response: 'Understood. Thank you for your time.', nextNodeId: '' },
  }]);
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [campaignCreating, setCampaignCreating] = useState(false);
  const [consentSavingId, setConsentSavingId] = useState<number | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'checking' | 'ready' | 'error'>('idle');

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  const handleAuthStatus = useCallback((r: Response): boolean => {
    if (r.status === 401) return true;
    if (r.status === 403) { navigate('/pricing'); return true; }
    return false;
  }, [navigate]);

  useEffect(() => {
    const safeFetch = async (url: string) => {
      const r = await apiFetch(url, { credentials: 'include' });
      if (handleAuthStatus(r)) return null;
      return r.ok ? r.json() : null;
    };
    Promise.all([
      safeFetch(apiUrl('twilio/call-center/agents')).then(d => { if (d) setAgents(d.agents ?? []); }),
      safeFetch(apiUrl('twilio/call-center/screenings')).then(d => { if (d) setScreenings(d.screenings ?? []); }),
      safeFetch(apiUrl('twilio/call-center/metrics')).then(d => { if (d) setMetrics(d); }),
      safeFetch(apiUrl('twilio/pablo/campaigns')).then(d => { if (d) setCampaigns(d.campaigns ?? []); }),
      safeFetch(apiUrl('twilio/pablo/campaign-contacts')).then(d => { if (d) setCampaignContacts(d.contacts ?? []); }),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [apiUrl, handleAuthStatus]);

  const addAgent = async () => {
    if (!agentName || !agentPhone) return;
    setAddingAgent(true);
    try {
      const r = await apiFetch(apiUrl('twilio/call-center/agents'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: agentName, phone: agentPhone, email: agentEmail || null }) });
      if (handleAuthStatus(r)) return;
      if (r.ok) {
        const d = await r.json();
        setAgents(prev => [...prev, d.agent]);
        setAgentName(''); setAgentPhone(''); setAgentEmail('');
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d.error || 'Failed to add agent');
      }
    } catch { setError('Network error'); }
    finally { setAddingAgent(false); }
  };

  const toggleAgent = async (id: number) => {
    try {
      const r = await apiFetch(apiUrl(`twilio/call-center/agents/${id}/toggle`), { method: 'POST', credentials: 'include' });
      if (r.ok) { const d = await r.json(); setAgents(prev => prev.map(a => a.id === id ? d.agent : a)); }
    } catch {}
  };

  const removeAgent = async (id: number) => {
    try {
      const r = await apiFetch(apiUrl(`twilio/call-center/agents/${id}`), { method: 'DELETE', credentials: 'include' });
      if (r.ok) { setAgents(prev => prev.filter(a => a.id !== id)); }
    } catch {}
  };

  const updateScriptNode = (id: string, update: (node: ScriptNodeDraft) => ScriptNodeDraft) => {
    setScriptNodes(prev => prev.map(node => node.id === id ? update(node) : node));
  };

  const addScriptNode = () => {
    setScriptNodes(prev => prev.length >= 8 ? prev : [...prev, makeScriptNode(Date.now())]);
  };

  const removeScriptNode = (id: string) => {
    setScriptNodes(prev => {
      if (prev.length <= 1) return prev;
      return prev
        .filter(node => node.id !== id)
        .map(node => ({
          ...node,
          yes: node.yes.nextNodeId === id ? { ...node.yes, nextNodeId: '' } : node.yes,
          no: node.no.nextNodeId === id ? { ...node.no, nextNodeId: '' } : node.no,
        }));
    });
  };

  const updateCallConsent = async (contact: CampaignContact, phoneCallOptIn: boolean) => {
    setConsentSavingId(contact.id);
    try {
      const r = await apiFetch(apiUrl(`campaigns/contact-prefs/${contact.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phoneCallOptIn }),
      });
      if (handleAuthStatus(r)) return;
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || 'Could not update contact permission');
        return;
      }
      const d = await r.json();
      const optedIn = Boolean(d.pref?.phoneCallOptIn && d.pref?.phoneCallConsentedAt && !d.pref?.phoneCallOptedOutAt);
      setCampaignContacts(prev => prev.map(item => item.id === contact.id
        ? { ...item, phoneCallOptIn: optedIn, phoneCallConsentedAt: d.pref?.phoneCallConsentedAt ?? null }
        : item));
      if (!optedIn) setSelectedContactIds(prev => prev.filter(id => id !== contact.id));
    } catch {
      setError('Network error updating contact permission');
    } finally {
      setConsentSavingId(null);
    }
  };

  const checkPabloVoice = async () => {
    setVoiceStatus('checking');
    setError('');
    try {
      const r = await apiFetch(apiUrl('twilio/pablo/voice-check'), {
        method: 'POST',
        credentials: 'include',
      });
      if (handleAuthStatus(r)) {
        setVoiceStatus('error');
        return;
      }
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || 'Pablo voice check failed');
        setVoiceStatus('error');
        return;
      }
      const objectUrl = URL.createObjectURL(await r.blob());
      setVoiceStatus('ready');
      try {
        const audio = new Audio(objectUrl);
        audio.onended = () => URL.revokeObjectURL(objectUrl);
        await audio.play();
      } catch {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      setVoiceStatus('error');
      setError('Network error checking Pablo voice');
    }
  };

  const createCampaign = async () => {
    if (!campaignName.trim() || selectedContactIds.length === 0) return;
    setCampaignCreating(true);
    try {
      const script = {
        version: 1,
        businessName: scriptBusinessName,
        opening: scriptOpening,
        startNodeId: scriptNodes[0]?.id,
        closing: scriptClosing,
        nodes: scriptNodes.map(node => ({
          ...node,
          yes: { ...node.yes, nextNodeId: node.yes.nextNodeId || null },
          no: { ...node.no, nextNodeId: node.no.nextNodeId || null },
        })),
      };
      const r = await apiFetch(apiUrl('twilio/pablo/campaigns'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: campaignName.trim(), script: JSON.stringify(script), contactIds: selectedContactIds }) });
      if (handleAuthStatus(r)) return;
      if (r.ok) {
        const d = await r.json();
        setCampaigns(prev => [d.campaign, ...prev]);
        setCampaignName('');
        setSelectedContactIds([]);
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d.error || 'Failed to create campaign');
      }
    } catch { setError('Network error creating campaign'); }
    finally { setCampaignCreating(false); }
  };

  const startCampaign = async (id: number) => {
    try {
      const r = await apiFetch(apiUrl(`twilio/pablo/campaigns/${id}/start`), { method: 'POST', credentials: 'include' });
      if (handleAuthStatus(r)) return;
      if (r.ok) {
        setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'active' } : c));
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d.error || 'Campaign could not start');
      }
    } catch { setError('Network error starting campaign'); }
  };

  const outcomeColor = (outcome: string) => {
    if (outcome === 'transferred') return (o: number) => primary(o);
    if (outcome === 'ended') return destructive;
    if (outcome === 'screening') return warning;
    if (outcome === 'timeout_transfer') return primary;
    return slate;
  };

  if (loading) return (
    <PhonePageLayout title="CALL CENTER" subtitle="Loading..." icon={<Headphones size={24} style={{ color: accent(0.8) }} />}>
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: slate(0.55) }} />
      </div>
    </PhonePageLayout>
  );

  return (
    <PhonePageLayout
      title="TELEMARKETING CENTER"
      subtitle="Saved-contact campaigns with editable yes/no scripts and call-permission checks"
      icon={<Headphones size={24} style={{ color: accent(0.8) }} />}
      statusLine={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: agents.some(a => a.isActive) ? primary(0.8) : slate(0.15) }} />
          <span style={{ color: agents.some(a => a.isActive) ? slate(0.5) : slate(0.2) }}>
            {agents.filter(a => a.isActive).length} AGENTS ONLINE
          </span>
        </div>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: destructive(0.05), border: `1px solid ${destructive(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: destructive(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={14} />{error}</div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: destructive(0.55), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="AGENTS ONLINE" value={metrics.activeAgents} color={metrics.activeAgents > 0 ? (o: number) => primary(o) : undefined} />
        <StatBlock label="TOTAL SCREENINGS" value={metrics.totalScreenings} color={accent} />
        <StatBlock label="TRANSFERRED" value={metrics.transferred} color={primary} />
        <StatBlock label="ENDED" value={metrics.ended} color={destructive} />
        <StatBlock label="AVG SCREEN TIME" value={metrics.avgScreenTime > 0 ? `${metrics.avgScreenTime}s` : '--'} color={warning} />
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `1px solid ${slate(0.08)}` }}>
        {([['inbound', 'INBOUND', <PhoneIncoming key="i" size={12} />], ['outbound', 'OUTBOUND', <PhoneOutgoing key="o" size={12} />]] as const).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 24px', fontSize: '0.55rem', letterSpacing: '0.15em',
              color: tab === key ? accent(0.9) : slate(0.3),
              borderBottom: tab === key ? `2px solid ${accent(0.6)}` : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6 }}
          >{icon}{label}</button>
        ))}
      </div>

      {tab === 'inbound' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '380px 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <PhoneCard>
              <PhoneCardHeader accent={accent(0.5)}>
                <Users size={10} style={{ marginRight: 4 }} /> AGENT POOL
              </PhoneCardHeader>
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Agent name" style={INPUT_STYLE} />
                  <input value={agentPhone} onChange={e => setAgentPhone(e.target.value)} placeholder="Phone (+1 555...)" style={INPUT_STYLE} />
                  <input value={agentEmail} onChange={e => setAgentEmail(e.target.value)} placeholder="Email (optional)" style={INPUT_STYLE} />
                  <PhoneBtn onClick={addAgent} disabled={addingAgent || !agentName || !agentPhone} color={accent}>
                    {addingAgent ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    {addingAgent ? 'ADDING...' : 'ADD AGENT'}
                  </PhoneBtn>
                </div>

                {agents.length === 0 ? (
                  <EmptyState message="NO AGENTS — ADD AGENTS TO ENABLE ROUND-ROBIN ROUTING" icon={<Users size={24} />} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {agents.map(a => (
                      <div key={a.id} style={{
                        padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: a.isActive ? primary(0.03) : slate(0.04),
                        border: `1px solid ${a.isActive ? primary(0.15) : slate(0.06)}`,
                        borderRadius: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: a.isActive ? primary(0.8) : slate(0.15) }} />
                          <div>
                            <div style={{ fontSize: '0.58rem', color: slate(a.isActive ? 0.9 : 0.5) }}>{a.name}</div>
                            <div style={{ fontSize: '0.4rem', color: slate(0.55), marginTop: 2 }}>
                              {formatPhone(a.phone)} · {a.totalCalls} calls
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => toggleAgent(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                            {a.isActive
                              ? <ToggleRight size={20} style={{ color: primary(0.7) }} />
                              : <ToggleLeft size={20} style={{ color: slate(0.55) }} />
                            }
                          </button>
                          <button onClick={() => removeAgent(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: destructive(0.55) }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </PhoneCard>
          </div>

          <PhoneCard>
            <PhoneCardHeader accent={warning(0.5)}>SCREENING HISTORY</PhoneCardHeader>
            {screenings.length === 0 ? (
              <EmptyState message="NO SCREENINGS YET — INBOUND CALLS WILL APPEAR HERE AFTER PABLO SCREENS THEM" icon={<PhoneIncoming size={28} />} />
            ) : (
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {screenings.map(s => {
                  const oc = outcomeColor(s.outcome);
                  return (
                    <div key={s.id} style={{
                      padding: '12px 16px', borderBottom: `1px solid ${slate(0.04)}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                          background: slate(0.02),
                          border: `1px solid ${oc(0.2)}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <PhoneIncoming size={16} style={{ color: oc(0.7) }} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.58rem', color: slate(0.8) }}>{s.callerName || formatPhone(s.callerNumber)}</div>
                          <div style={{ fontSize: '0.4rem', color: slate(0.55), marginTop: 2 }}>
                            {formatPhone(s.callerNumber)}
                            {s.agentName && ` → ${s.agentName}`}
                            {s.screeningDurationSeconds != null && ` · ${s.screeningDurationSeconds}s`}
                          </div>
                          {s.summary && <div style={{ fontSize: '0.4rem', color: slate(0.55), marginTop: 3, maxWidth: 400 }}>{s.summary}</div>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{
                          fontSize: '0.42rem', color: oc(0.8), letterSpacing: '0.1em',
                          padding: '2px 8px', borderRadius: 4, background: oc(0.06), border: `1px solid ${oc(0.15)}` }}>
                          {s.outcome.toUpperCase().replace(/_/g, ' ')}
                        </div>
                        <div style={{ fontSize: '0.38rem', color: slate(0.55), marginTop: 4 }}>
                          {new Date(s.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PhoneCard>
        </div>
      )}

      {tab === 'outbound' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <PhoneCard>
            <PhoneCardHeader accent={warning(0.5)}>CREATE CAMPAIGN</PhoneCardHeader>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>CAMPAIGN NAME</label>
                <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Q1 Lead Follow-up" style={INPUT_STYLE} />
              </div>
              <div style={{ padding: 12, border: `1px solid ${slate(0.08)}`, borderRadius: 7, background: slate(0.015) }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '0.48rem', color: slate(0.75), letterSpacing: '0.12em' }}>PABLO VOICE</div>
                    <div style={{ fontSize: '0.39rem', color: slate(0.45), marginTop: 4 }}>
                      Tests Pablo's assigned ElevenLabs voice. Campaign start checks it again.
                    </div>
                  </div>
                  <PhoneBtn onClick={checkPabloVoice} disabled={voiceStatus === 'checking'} color={voiceStatus === 'ready' ? primary : warning} size="sm">
                    {voiceStatus === 'checking' ? <Loader2 size={10} className="animate-spin" /> : <PhoneOutgoing size={10} />}
                    {voiceStatus === 'checking' ? 'CHECKING...' : 'TEST VOICE'}
                  </PhoneBtn>
                </div>
                <div aria-live="polite" style={{ fontSize: '0.4rem', color: voiceStatus === 'ready' ? primary(0.85) : voiceStatus === 'error' ? destructive(0.85) : slate(0.4), marginTop: 6 }}>
                  {voiceStatus === 'ready' ? 'VOICE READY' : voiceStatus === 'error' ? 'VOICE UNAVAILABLE' : ''}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', marginBottom: 8 }}>YES / NO SCRIPT MATRIX</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={scriptBusinessName} onChange={e => setScriptBusinessName(e.target.value)} placeholder="Business name" style={INPUT_STYLE} />
                  <textarea value={scriptOpening} onChange={e => setScriptOpening(e.target.value)} placeholder="Opening after Pablo introduces himself" style={{ ...INPUT_STYLE, minHeight: 64, resize: 'vertical' }} />
                  {scriptNodes.map((node, index) => (
                    <div key={node.id} style={{ padding: 10, border: `1px solid ${slate(0.08)}`, borderRadius: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                        <span style={{ fontSize: '0.42rem', color: warning(0.8), letterSpacing: '0.1em' }}>QUESTION {index + 1}{index === 0 ? ' · START' : ''}</span>
                        {scriptNodes.length > 1 && (
                          <button type="button" onClick={() => removeScriptNode(node.id)} aria-label={`Remove question ${index + 1}`} style={{ border: 0, background: 'none', color: destructive(0.75), cursor: 'pointer' }}>
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      <textarea
                        value={node.question}
                        onChange={e => updateScriptNode(node.id, current => ({ ...current, question: e.target.value }))}
                        placeholder="Ask one question that can be answered yes or no"
                        style={{ ...INPUT_STYLE, minHeight: 58, resize: 'vertical', marginBottom: 8 }}
                      />
                      {(['yes', 'no'] as const).map(answer => (
                        <div key={answer} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '52px 1fr', gap: 6, marginBottom: 7, alignItems: 'start' }}>
                          <div style={{ fontSize: '0.42rem', color: answer === 'yes' ? primary(0.9) : destructive(0.8), letterSpacing: '0.1em', paddingTop: 8 }}>{answer.toUpperCase()}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <textarea
                              value={node[answer].response}
                              onChange={e => updateScriptNode(node.id, current => ({ ...current, [answer]: { ...current[answer], response: e.target.value } }))}
                              placeholder={`${answer === 'yes' ? 'Response to yes' : 'Response to no'}`}
                              style={{ ...INPUT_STYLE, minHeight: 54, resize: 'vertical' }}
                            />
                            <select
                              value={node[answer].nextNodeId}
                              onChange={e => updateScriptNode(node.id, current => ({ ...current, [answer]: { ...current[answer], nextNodeId: e.target.value } }))}
                              style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                              aria-label={`${answer} follow-up question`}
                            >
                              <option value="">End call after this response</option>
                              {scriptNodes.filter(candidate => candidate.id !== node.id).map(candidate => (
                                <option key={candidate.id} value={candidate.id}>
                                  Continue to question {scriptNodes.findIndex(item => item.id === candidate.id) + 1}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addScriptNode}
                    disabled={scriptNodes.length >= 8}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', border: `1px solid ${slate(0.12)}`, borderRadius: 5, padding: '7px 10px', background: 'transparent', color: slate(0.65), cursor: scriptNodes.length >= 8 ? 'not-allowed' : 'pointer', fontSize: '0.42rem' }}
                  >
                    <Plus size={11} /> ADD QUESTION ({scriptNodes.length}/8)
                  </button>
                  <textarea value={scriptClosing} onChange={e => setScriptClosing(e.target.value)} placeholder="Closing line" style={{ ...INPUT_STYLE, minHeight: 54, resize: 'vertical' }} />
                  <div style={{ fontSize: '0.38rem', color: slate(0.38), lineHeight: 1.5 }}>
                    Use {'{{name}}'} or {'{{company}}'} for saved contact details. Unclear answers are clarified once, then the call ends.
                  </div>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>
                  SAVED CONTACTS · RECORDED PHONE-CALL PERMISSION REQUIRED
                </label>
                <div style={{ fontSize: '0.38rem', color: warning(0.7), margin: '0 0 7px', lineHeight: 1.5 }}>
                  Mark permission only after the contact has explicitly agreed to receive calls.
                </div>
                {campaignContacts.length === 0 ? (
                  <EmptyState message="NO SAVED CONTACTS WITH PHONE NUMBERS — ADD THEM IN CONTACTS" icon={<Users size={22} />} />
                ) : (
                  <div style={{ maxHeight: 250, overflowY: 'auto', border: `1px solid ${slate(0.08)}`, borderRadius: 6 }}>
                    {campaignContacts.map(contact => {
                      const selected = selectedContactIds.includes(contact.id);
                      return (
                        <div key={contact.id} style={{ padding: '9px 10px', borderBottom: `1px solid ${slate(0.04)}`, display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: 8 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, opacity: contact.phoneCallOptIn ? 1 : 0.72 }}>
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={!contact.phoneCallOptIn || (!selected && selectedContactIds.length >= 50)}
                              onChange={e => setSelectedContactIds(prev => e.target.checked
                                ? [...prev, contact.id]
                                : prev.filter(id => id !== contact.id))}
                              aria-label={`Select ${contact.name} for campaign`}
                            />
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: '0.48rem', color: slate(0.8) }}>{contact.name || 'Unnamed contact'}</span>
                              <span style={{ display: 'block', fontSize: '0.38rem', color: slate(0.45), marginTop: 2 }}>
                                {formatPhone(contact.phone)}{contact.company ? ` · ${contact.company}` : ''}
                              </span>
                            </span>
                          </label>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 3 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.38rem', color: contact.phoneCallOptIn ? primary(0.8) : slate(0.5), cursor: consentSavingId === contact.id ? 'wait' : 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={contact.phoneCallOptIn}
                                disabled={consentSavingId === contact.id}
                                onChange={e => updateCallConsent(contact, e.target.checked)}
                              />
                              {consentSavingId === contact.id ? 'SAVING...' : contact.phoneCallOptIn ? 'CALL PERMISSION RECORDED' : 'I HAVE RECORDED PERMISSION'}
                            </label>
                            {contact.phoneCallOptIn && contact.phoneCallConsentedAt && (
                              <span style={{ fontSize: '0.34rem', color: slate(0.4), paddingLeft: 18 }}>
                                {new Date(contact.phoneCallConsentedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ fontSize: '0.38rem', color: slate(0.4), marginTop: 6 }}>
                  {selectedContactIds.length}/50 selected
                </div>
              </div>
              <PhoneBtn onClick={createCampaign} disabled={campaignCreating || !campaignName.trim() || !scriptBusinessName || !scriptOpening || !scriptClosing || !scriptNodes[0]?.question || selectedContactIds.length === 0} color={warning}>
                {campaignCreating ? <Loader2 size={12} className="animate-spin" /> : <PhoneOutgoing size={12} />}
                {campaignCreating ? 'CREATING...' : 'CREATE CAMPAIGN'}
              </PhoneBtn>
            </div>
          </PhoneCard>

          <PhoneCard>
            <PhoneCardHeader accent={slate(0.3)}>CAMPAIGNS</PhoneCardHeader>
            {campaigns.length === 0 ? (
              <EmptyState message="NO OUTBOUND CAMPAIGNS — CREATE ONE TO START DIALING" icon={<FileText size={28} />} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {campaigns.map(c => (
                  <div key={c.id} style={{
                    padding: '14px 16px', borderBottom: `1px solid ${slate(0.04)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: c.status === 'active' ? warning(0.02) : 'transparent' }}>
                    <div>
                      <div style={{ fontSize: '0.58rem', color: slate(0.7), letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileText size={12} style={{ color: slate(0.55) }} />
                        {c.name}
                      </div>
                      <div style={{ fontSize: '0.4rem', color: slate(0.55), marginTop: 3 }}>
                        {c.totalLeads} LEADS · {c.dialedCount} DIALED · {c.answeredCount} ANSWERED · {c.status.toUpperCase()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {c.status === 'draft' && (
                        <PhoneBtn onClick={() => startCampaign(c.id)} color={warning} size="sm">
                          <Zap size={10} /> START
                        </PhoneBtn>
                      )}
                      {c.status === 'active' && (
                        <div style={{ fontSize: '0.42rem', color: warning(0.7), letterSpacing: '0.1em', padding: '4px 10px' }}>
                          IN PROGRESS
                        </div>
                      )}
                      {c.status === 'completed' && (
                        <div style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.1em', padding: '4px 10px' }}>
                          COMPLETED
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PhoneCard>
        </div>
      )}
    </PhonePageLayout>
  );
}
