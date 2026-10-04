import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { Headphones, Plus, Trash2, ToggleLeft, ToggleRight, Loader2, X, FileText, Zap, PhoneOutgoing, PhoneIncoming, AlertTriangle, Users, Phone, MessageSquare, Send } from 'lucide-react';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, INPUT_STYLE } from './PhoneLayout';
import {
  slate, warning, primary, destructive, accent, formatPhone,
  type CallCenterAgent, type InboundScreening, type OutboundCampaign } from '@/lib/phone-utils';
import { usePhoneInternalDirectory } from './usePhoneInternalDirectory';
import { useCalllHomeNavigate } from './CalllHomeContext';
import { useTwilioDeviceContext } from '@/contexts/TwilioDeviceContext';
import { usePlan } from '@/hooks/use-plan';

type Tab = 'inbound' | 'outbound' | 'team';
type CampaignContact = {
  id: number;
  name: string;
  phone: string;
  company: string;
  phoneCallOptIn: boolean;
  phoneCallConsentedAt: string | null;
};
type SupervisionQuality = {
  mos: number | null;
  packetsLostFraction: number | null;
  jitter: number | null;
  rtt: number | null;
  capturedAt: string;
};
type SupervisedCall = {
  id: number;
  employeeName: string;
  customerName: string;
  customerPhoneLast4: string | null;
  status: string;
  startedAt: string;
  durationSeconds: number;
  transcript: string;
  connectionQuality: SupervisionQuality | null;
  active: boolean;
  canMonitor: boolean;
};
type ScriptBranchDraft = { response: string; nextNodeId: string; transferToUserId: string; captureField: string };
type ScriptNodeDraft = {
  id: string;
  question: string;
  yes: ScriptBranchDraft;
  no: ScriptBranchDraft;
};

const makeScriptNode = (index: number): ScriptNodeDraft => ({
  id: `question-${index}`,
  question: '',
  yes: { response: '', nextNodeId: '', transferToUserId: '', captureField: '' },
  no: { response: '', nextNodeId: '', transferToUserId: '', captureField: '' },
});

export default function PhoneCallCenterPage() {
  const isMobile = useIsMobile();

  const BASE = import.meta.env.BASE_URL;
  const [, navigate] = useLocation();
  const navigateInsidePhone = useCalllHomeNavigate();
  const directory = usePhoneInternalDirectory();
  const { features, isOwner } = usePlan();
  const { connectToEmployee, disconnect, deviceState, ensureDeviceReady } = useTwilioDeviceContext();
  const hasPabloPrime = isOwner || features.has('claw_bot');

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
    yes: { response: 'Great, I can tell you more.', nextNodeId: '', transferToUserId: '', captureField: '' },
    no: { response: 'Understood. Thank you for your time.', nextNodeId: '', transferToUserId: '', captureField: '' },
  }]);
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [campaignCreating, setCampaignCreating] = useState(false);
  const [consentSavingId, setConsentSavingId] = useState<number | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'checking' | 'ready' | 'error'>('idle');
  const [teamCallingUserId, setTeamCallingUserId] = useState<string | null>(null);
  const [lineSavingId, setLineSavingId] = useState<number | null>(null);
  const [deliveryTargetUserId, setDeliveryTargetUserId] = useState('');
  const [deliveryCategory, setDeliveryCategory] = useState<'message' | 'report'>('message');
  const [deliveryTitle, setDeliveryTitle] = useState('');
  const [deliveryBody, setDeliveryBody] = useState('');
  const [deliverySending, setDeliverySending] = useState(false);
  const [deliverySuccess, setDeliverySuccess] = useState('');
  const [supervisionAllowed, setSupervisionAllowed] = useState<boolean | null>(null);
  const [supervisedCalls, setSupervisedCalls] = useState<SupervisedCall[]>([]);
  const [supervisionError, setSupervisionError] = useState('');
  const [supervisionNotice, setSupervisionNotice] = useState('');
  const [joiningCallId, setJoiningCallId] = useState<number | null>(null);
  const teamCallingUserIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (tab !== 'team') return;
    let disposed = false;
    const refreshSupervisedCalls = async () => {
      try {
        const response = await apiFetch(apiUrl('twilio/supervision/calls'), { credentials: 'include' });
        if (disposed) return;
        if (response.status === 403 || response.status === 401) {
          setSupervisionAllowed(false);
          return;
        }
        if (!response.ok) {
          setSupervisionError('Could not refresh live call details.');
          return;
        }
        const data = await response.json();
        if (disposed) return;
        setSupervisionAllowed(true);
        setSupervisedCalls(Array.isArray(data.calls) ? data.calls : []);
        setSupervisionError('');
      } catch {
        if (!disposed) setSupervisionError('Could not refresh live call details.');
      }
    };
    void refreshSupervisedCalls();
    const interval = setInterval(() => void refreshSupervisedCalls(), 5_000);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [apiUrl, tab]);

  const joinSupervisedCall = async (callId: number, mode: 'listen' | 'whisper') => {
    setJoiningCallId(callId);
    setSupervisionError('');
    setSupervisionNotice('');
    try {
      await ensureDeviceReady();
      const response = await apiFetch(apiUrl(`twilio/supervision/calls/${callId}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSupervisionError(data.error || 'Could not connect to the live call.');
        return;
      }
      setSupervisionNotice(data.message || 'Accept the incoming CALLL HOME call to join.');
    } catch (err) {
      setSupervisionError(err instanceof Error ? err.message : 'Could not connect to the live call.');
    } finally {
      setJoiningCallId(null);
    }
  };

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
          yes: { ...node.yes, nextNodeId: node.yes.nextNodeId || null, captureField: node.yes.captureField || null },
          no: { ...node.no, nextNodeId: node.no.nextNodeId || null, captureField: node.no.captureField || null },
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

  const teamMembers = directory.data?.members ?? [];
  const otherEmployees = teamMembers.filter(member => !member.isSelf);

  useEffect(() => {
    teamCallingUserIdRef.current = teamCallingUserId;
  }, [teamCallingUserId]);

  useEffect(() => () => {
    if (teamCallingUserIdRef.current) disconnect();
  }, [disconnect]);

  const callEmployee = async (userId: string) => {
    setError('');
    try {
      if (teamCallingUserId === userId) {
        disconnect();
        setTeamCallingUserId(null);
        return;
      }
      setTeamCallingUserId(userId);
      const call = await connectToEmployee(userId);
      const clearCall = () => setTeamCallingUserId(current => current === userId ? null : current);
      call.on('disconnect', clearCall);
      call.on('cancel', clearCall);
      call.on('reject', clearCall);
      call.on('error', clearCall);
    } catch (err) {
      setTeamCallingUserId(null);
      setError(err instanceof Error ? err.message : 'Could not connect to employee');
    }
  };

  const openEmployeeChat = (userId: string) => {
    window.dispatchEvent(new CustomEvent('salaryman:open-dm', { detail: { userId } }));
  };

  const openEmployeeSms = (member: (typeof otherEmployees)[number]) => {
    if (!member.phoneNumber) return;
    const url = new URL(window.location.href);
    url.searchParams.set('to', member.phoneNumber);
    url.searchParams.set('name', member.displayName);
    window.history.replaceState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}`);
    if (!navigateInsidePhone('/phone/sms')) {
      navigate(`/phone/sms?${url.searchParams.toString()}`);
    }
  };

  const assignOfficeLine = async (lineId: number, assignedUserId: string) => {
    setLineSavingId(lineId);
    setError('');
    try {
      const r = await apiFetch(apiUrl(`twilio/internal-directory/lines/${lineId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ assignedUserId }),
      });
      if (handleAuthStatus(r)) return;
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error || 'Could not assign office line');
        return;
      }
      await directory.refetch();
    } catch {
      setError('Network error assigning office line');
    } finally {
      setLineSavingId(null);
    }
  };

  const deliverWithPabloPrime = async () => {
    if (!deliveryTargetUserId || !deliveryTitle.trim() || !deliveryBody.trim()) return;
    setDeliverySending(true);
    setDeliverySuccess('');
    setError('');
    try {
      const r = await apiFetch(apiUrl('twilio/pablo/internal-delivery'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetUserId: deliveryTargetUserId,
          category: deliveryCategory,
          title: deliveryTitle.trim(),
          body: deliveryBody.trim(),
        }),
      });
      if (handleAuthStatus(r)) return;
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error || 'Pablo PRIME could not deliver the message');
        return;
      }
      setDeliverySuccess(`Delivered to ${teamMembers.find(member => member.userId === deliveryTargetUserId)?.displayName ?? 'employee'} in COMMS.`);
      setDeliveryTitle('');
      setDeliveryBody('');
    } catch {
      setError('Network error delivering the internal message');
    } finally {
      setDeliverySending(false);
    }
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
        {([
          ['inbound', 'INBOUND', <PhoneIncoming key="i" size={12} />],
          ['outbound', 'OUTBOUND', <PhoneOutgoing key="o" size={12} />],
          ['team', 'TEAM', <Users key="team" size={12} />],
        ] as const).map(([key, label, icon]) => (
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

      {teamCallingUserId && (
        <div role="status" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          flexWrap: 'wrap', marginBottom: 12, padding: '9px 12px',
          border: `1px solid ${primary(0.3)}`, borderRadius: 6, background: primary(0.04),
        }}>
          <span style={{ fontSize: '0.45rem', color: primary(0.85) }}>
            CALLL HOME call with {teamMembers.find(member => member.userId === teamCallingUserId)?.displayName ?? 'employee'}
          </span>
          <PhoneBtn onClick={() => { disconnect(); setTeamCallingUserId(null); }} color={destructive} size="sm">
            <Phone size={10} /> END CALL
          </PhoneBtn>
        </div>
      )}

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
                              onChange={e => {
                                const nextNodeId = e.target.value;
                                updateScriptNode(node.id, current => ({
                                  ...current,
                                  [answer]: {
                                    ...current[answer],
                                    nextNodeId,
                                    ...(nextNodeId ? { transferToUserId: '' } : {}),
                                  },
                                }));
                              }}
                              style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                              aria-label={`${answer} follow-up question`}
                            >
                              <option value="">End call or transfer after this response</option>
                              {scriptNodes.filter(candidate => candidate.id !== node.id).map(candidate => (
                                <option key={candidate.id} value={candidate.id}>
                                  Continue to question {scriptNodes.findIndex(item => item.id === candidate.id) + 1}
                                </option>
                              ))}
                            </select>
                            {answer === 'yes' && (
                              <>
                                <select
                                  value={node.yes.captureField}
                                  disabled={Boolean(node.yes.transferToUserId)}
                                  onChange={e => updateScriptNode(node.id, current => ({
                                    ...current,
                                    yes: { ...current.yes, captureField: e.target.value, transferToUserId: '' },
                                  }))}
                                  style={{ ...INPUT_STYLE, cursor: node.yes.transferToUserId ? 'not-allowed' : 'pointer' }}
                                  aria-label="CRM field to capture after yes"
                                >
                                  <option value="">No CRM field capture</option>
                                  <option value="email">Capture or update contact email</option>
                                  <option value="company">Capture or update company</option>
                                  <option value="timezone">Capture or update timezone</option>
                                </select>
                                <select
                                  value={node.yes.transferToUserId}
                                  disabled={otherEmployees.length === 0 || Boolean(node.yes.captureField)}
                                  onChange={e => {
                                    const transferToUserId = e.target.value;
                                    updateScriptNode(node.id, current => ({
                                      ...current,
                                      yes: {
                                        ...current.yes,
                                        transferToUserId,
                                        ...(transferToUserId ? { nextNodeId: '', captureField: '' } : {}),
                                      },
                                    }));
                                  }}
                                  style={{ ...INPUT_STYLE, cursor: otherEmployees.length === 0 || node.yes.captureField ? 'not-allowed' : 'pointer' }}
                                  aria-label="Employee to transfer to after yes"
                                >
                                  <option value="">No employee transfer</option>
                                  {otherEmployees.map(member => (
                                    <option key={member.userId} value={member.userId}>Ask permission to connect to {member.displayName}</option>
                                  ))}
                                </select>
                              </>
                            )}
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
                    Use {'{{name}}'} or {'{{company}}'} for saved contact details. Only YES paths can capture CRM details or offer a transfer; transfers require a separate spoken YES. Unclear answers are clarified once, then the call ends.
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

      {tab === 'team' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PhoneCard>
            <PhoneCardHeader accent={accent(0.55)}>CALLL HOME TEAM</PhoneCardHeader>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: '0.4rem', color: slate(0.48), marginBottom: 12, lineHeight: 1.5 }}>
                Active organization employees with CALLL HOME phone access.
              </div>
              {directory.isLoading ? (
                <div style={{ padding: 24, textAlign: 'center', color: slate(0.5) }}><Loader2 size={16} className="animate-spin" /></div>
              ) : directory.isError ? (
                <EmptyState message="COULD NOT LOAD THE EMPLOYEE DIRECTORY" icon={<Users size={22} />} />
              ) : !directory.data?.organizationId ? (
                <EmptyState message="SELECT AN ACTIVE ORGANIZATION TO SEE TEAM MEMBERS" icon={<Users size={22} />} />
              ) : teamMembers.length === 0 ? (
                <EmptyState message="NO ACTIVE EMPLOYEES HAVE CALLL HOME PHONE ACCESS" icon={<Users size={22} />} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {teamMembers.map(member => (
                    <div key={member.userId} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      flexWrap: 'wrap', padding: '10px 12px', border: `1px solid ${slate(0.08)}`, borderRadius: 6,
                    }}>
                      <div style={{ minWidth: 150 }}>
                        <div style={{ fontSize: '0.55rem', color: slate(0.82) }}>
                          {member.displayName}{member.isSelf ? ' · YOU' : ''}
                        </div>
                        <div style={{ fontSize: '0.39rem', color: slate(0.48), marginTop: 3 }}>
                          {member.title || member.role}{member.phoneNumber ? ` · ${formatPhone(member.phoneNumber)}` : ''}
                        </div>
                      </div>
                      {!member.isSelf && (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <PhoneBtn
                            onClick={() => void callEmployee(member.userId)}
                            disabled={Boolean(teamCallingUserId && teamCallingUserId !== member.userId)}
                            color={teamCallingUserId === member.userId ? destructive : primary}
                            size="sm"
                          >
                            <Phone size={10} />
                            {teamCallingUserId === member.userId ? 'END CALL' : deviceState === 'ready' ? 'CALL' : 'CONNECT'}
                          </PhoneBtn>
                          <PhoneBtn onClick={() => openEmployeeChat(member.userId)} color={slate} size="sm">
                            <MessageSquare size={10} /> CHAT
                          </PhoneBtn>
                          {member.phoneNumber && (
                            <PhoneBtn onClick={() => openEmployeeSms(member)} color={accent} size="sm">
                              <Send size={10} /> SMS
                            </PhoneBtn>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PhoneCard>

          {supervisionAllowed && (
            <PhoneCard>
              <PhoneCardHeader accent={primary(0.6)}>LIVE CALL SUPERVISION</PhoneCardHeader>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: '0.4rem', color: slate(0.5), lineHeight: 1.5 }}>
                  Active employee transfers show a live transcript and browser connection quality. Listening is muted; whisper coaching is heard only by the employee.
                </div>
                {supervisionNotice && (
                  <div role="status" style={{ fontSize: '0.42rem', color: primary(0.9), lineHeight: 1.5 }}>{supervisionNotice}</div>
                )}
                {supervisionError && (
                  <div role="alert" style={{ fontSize: '0.42rem', color: destructive(0.9), lineHeight: 1.5 }}>{supervisionError}</div>
                )}
                {supervisedCalls.length === 0 ? (
                  <EmptyState message="NO RECENT EMPLOYEE TRANSFERS" icon={<Headphones size={22} />} />
                ) : supervisedCalls.map(call => {
                  const quality = call.connectionQuality;
                  const minutes = Math.floor(call.durationSeconds / 60);
                  const seconds = String(call.durationSeconds % 60).padStart(2, '0');
                  const qualityLabel = quality
                    ? [
                        quality.mos != null ? `MOS ${quality.mos.toFixed(1)}` : null,
                        quality.packetsLostFraction != null ? `LOSS ${(quality.packetsLostFraction * 100).toFixed(1)}%` : null,
                        quality.jitter != null ? `JITTER ${Math.round(quality.jitter)} ms` : null,
                        quality.rtt != null ? `RTT ${Math.round(quality.rtt)} ms` : null,
                      ].filter(Boolean).join(' · ')
                    : 'WAITING FOR BROWSER QUALITY SAMPLES';
                  return (
                    <div key={call.id} style={{
                      border: `1px solid ${slate(0.1)}`, borderRadius: 6, padding: 12,
                      display: 'flex', flexDirection: 'column', gap: 9,
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        flexWrap: 'wrap', gap: 8,
                      }}>
                        <div>
                          <div style={{ fontSize: '0.52rem', color: slate(0.82) }}>
                            {call.customerName} {call.customerPhoneLast4 ? `· •••• ${call.customerPhoneLast4}` : ''}
                          </div>
                          <div style={{ fontSize: '0.4rem', color: slate(0.5), marginTop: 3 }}>
                            {call.employeeName} · {call.status.toUpperCase()} · {minutes}:{seconds}
                          </div>
                        </div>
                        {call.active && call.canMonitor && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <PhoneBtn
                              onClick={() => void joinSupervisedCall(call.id, 'listen')}
                              disabled={joiningCallId === call.id}
                              color={primary}
                              size="sm"
                            >
                              {joiningCallId === call.id ? <Loader2 size={10} className="animate-spin" /> : <Headphones size={10} />}
                              LISTEN
                            </PhoneBtn>
                            <PhoneBtn
                              onClick={() => void joinSupervisedCall(call.id, 'whisper')}
                              disabled={joiningCallId === call.id}
                              color={warning}
                              size="sm"
                            >
                              <MessageSquare size={10} /> WHISPER
                            </PhoneBtn>
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '0.38rem', color: slate(0.48) }}>{qualityLabel}</div>
                      <div style={{
                        maxHeight: 180, overflowY: 'auto', whiteSpace: 'pre-wrap',
                        background: slate(0.32), borderRadius: 4, padding: 9,
                        color: slate(0.68), fontSize: '0.4rem', lineHeight: 1.65,
                      }}>
                        {call.transcript || 'Live transcript will appear after the employee joins.'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </PhoneCard>
          )}

          {directory.data?.canManageLines && (
            <PhoneCard>
              <PhoneCardHeader accent={accent(0.45)}>ORGANIZATION OFFICE LINES</PhoneCardHeader>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {directory.data.lines.length === 0 ? (
                  <EmptyState message="NO ORGANIZATION-OWNED OFFICE LINES" icon={<Phone size={22} />} />
                ) : directory.data.lines.map(line => (
                  <div key={line.id} style={{
                    display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                    alignItems: 'center', gap: 10, padding: '10px 12px',
                    border: `1px solid ${slate(0.08)}`, borderRadius: 6,
                  }}>
                    <div>
                      <div style={{ fontSize: '0.52rem', color: slate(0.8) }}>{line.label}</div>
                      <div style={{ fontSize: '0.4rem', color: slate(0.5), marginTop: 3 }}>
                        {formatPhone(line.number)} · {line.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </div>
                    </div>
                    <select
                      value={line.assignedUserId ?? ''}
                      disabled={lineSavingId === line.id || teamMembers.length === 0}
                      onChange={event => {
                        if (event.target.value) void assignOfficeLine(line.id, event.target.value);
                      }}
                      aria-label={`Assign ${line.label} to an employee`}
                      style={{ ...INPUT_STYLE, cursor: lineSavingId === line.id ? 'wait' : 'pointer' }}
                    >
                      <option value="">Choose eligible employee</option>
                      {teamMembers.map(member => (
                        <option key={member.userId} value={member.userId}>
                          {member.displayName}{member.isSelf ? ' · YOU' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </PhoneCard>
          )}

          <PhoneCard>
            <PhoneCardHeader accent={warning(0.55)}>PABLO PRIME DELIVERY</PhoneCardHeader>
            <div style={{ padding: 16 }}>
              {hasPabloPrime ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: '0.4rem', color: slate(0.48), lineHeight: 1.5 }}>
                    Deliver a private message or report to an eligible coworker through COMMS.
                  </div>
                  <select value={deliveryTargetUserId} onChange={event => setDeliveryTargetUserId(event.target.value)} style={INPUT_STYLE}>
                    <option value="">Choose an employee</option>
                    {otherEmployees.map(member => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
                  </select>
                  <select value={deliveryCategory} onChange={event => setDeliveryCategory(event.target.value as 'message' | 'report')} style={INPUT_STYLE}>
                    <option value="message">Internal message</option>
                    <option value="report">Report</option>
                  </select>
                  <input
                    value={deliveryTitle}
                    onChange={event => setDeliveryTitle(event.target.value)}
                    maxLength={120}
                    placeholder={deliveryCategory === 'report' ? 'Report title' : 'Message title'}
                    style={INPUT_STYLE}
                  />
                  <textarea
                    value={deliveryBody}
                    onChange={event => setDeliveryBody(event.target.value)}
                    maxLength={1800}
                    placeholder={deliveryCategory === 'report' ? 'Write the report' : 'Write the internal message'}
                    style={{ ...INPUT_STYLE, minHeight: 110, resize: 'vertical' }}
                  />
                  {deliverySuccess && <div role="status" style={{ fontSize: '0.42rem', color: primary(0.85) }}>{deliverySuccess}</div>}
                  <PhoneBtn
                    onClick={() => void deliverWithPabloPrime()}
                    disabled={deliverySending || !deliveryTargetUserId || !deliveryTitle.trim() || !deliveryBody.trim()}
                    color={warning}
                  >
                    {deliverySending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                    {deliverySending ? 'DELIVERING...' : 'DELIVER WITH PABLO PRIME'}
                  </PhoneBtn>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: '0.42rem', color: slate(0.58), lineHeight: 1.5 }}>
                    Internal message and report delivery requires paid Pablo PRIME access.
                  </div>
                  <PhoneBtn onClick={() => navigate('/pricing')} color={warning} size="sm">VIEW PLANS</PhoneBtn>
                </div>
              )}
            </div>
          </PhoneCard>
        </div>
      )}
    </PhonePageLayout>
  );
}
