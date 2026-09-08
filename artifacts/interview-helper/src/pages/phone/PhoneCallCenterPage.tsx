import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { Headphones, Plus, Trash2, ToggleLeft, ToggleRight, Loader2, X, Upload, FileText, Zap, PhoneOutgoing, PhoneIncoming, AlertTriangle, Users } from 'lucide-react';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, INPUT_STYLE } from './PhoneLayout';
import {
  slate, warning, primary, destructive, accent, formatPhone,
  type CallCenterAgent, type InboundScreening, type OutboundCampaign } from '@/lib/phone-utils';

type Tab = 'inbound' | 'outbound';

export default function PhoneCallCenterPage() {
  const isMobile = useIsMobile();

  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [tab, setTab] = useState<Tab>('outbound');
  const [agents, setAgents] = useState<CallCenterAgent[]>([]);
  const [screenings, setScreenings] = useState<InboundScreening[]>([]);
  const [metrics, setMetrics] = useState({ activeAgents: 0, totalScreenings: 0, transferred: 0, ended: 0, avgScreenTime: 0 });
  const [campaigns, setCampaigns] = useState<OutboundCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [addingAgent, setAddingAgent] = useState(false);

  const [campaignName, setCampaignName] = useState('');
  const [campaignScript, setCampaignScript] = useState('');
  const [campaignLeads, setCampaignLeads] = useState('');
  const [campaignCreating, setCampaignCreating] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

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

  const createCampaign = async () => {
    if (!campaignName || !campaignScript || !campaignLeads) return;
    setCampaignCreating(true);
    try {
      const leads = campaignLeads.split('\n').filter(l => l.trim()).map(l => {
        const parts = l.split(',');
        return { phone: parts[0]?.trim() ?? '', name: parts[1]?.trim() ?? '', company: parts[2]?.trim() ?? '', email: parts[3]?.trim() ?? '' };
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
      const r = await apiFetch(apiUrl(`twilio/pablo/campaigns/${id}/start`), { method: 'POST', credentials: 'include' });
      if (r.ok) { setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'active' } : c)); }
    } catch {}
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setCampaignLeads(reader.result as string); };
    reader.readAsText(file);
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
      subtitle="Outbound lead campaigns, scripts, lists, and agent routing"
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
              <div>
                <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>SCRIPT</label>
                <textarea
                  value={campaignScript} onChange={e => setCampaignScript(e.target.value)}
                  placeholder="Hi, I'm calling from [Company] to follow up on your recent inquiry..."
                  style={{ ...INPUT_STYLE, height: 100, resize: 'vertical', display: 'block', lineHeight: 1.7 }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'block', marginBottom: 5 }}>
                  LEAD LIST (CSV: phone,name,company,email)
                </label>
                <textarea
                  value={campaignLeads} onChange={e => setCampaignLeads(e.target.value)}
                  placeholder={'+15551234567,John Smith,Acme Corp,john@acme.com\n+15559876543,Jane Doe,Beta Inc,jane@beta.com'}
                  style={{ ...INPUT_STYLE, height: 100, resize: 'vertical', display: 'block', lineHeight: 1.7 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <input type="file" accept=".csv,.txt" ref={csvInputRef} onChange={handleCsvUpload} style={{ display: 'none' }} />
                  <button onClick={() => csvInputRef.current?.click()} style={{
                    fontSize: '0.45rem', color: slate(0.5), background: slate(0.5),
                    border: `1px solid ${slate(0.12)}`, padding: '6px 12px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '0.1em' }}>
                    <Upload size={10} /> UPLOAD CSV
                  </button>
                  <span style={{ fontSize: '0.38rem', color: slate(0.55) }}>
                    {campaignLeads ? `${campaignLeads.split('\n').filter(l => l.trim()).length} LEADS` : 'OR PASTE ABOVE'}
                  </span>
                </div>
              </div>
              <PhoneBtn onClick={createCampaign} disabled={campaignCreating || !campaignName || !campaignScript || !campaignLeads} color={warning}>
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
