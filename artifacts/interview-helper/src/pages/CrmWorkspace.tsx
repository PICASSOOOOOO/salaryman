import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import {
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  Building2,
  CircleDollarSign,
  Columns3,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useReliableOutboundBridge } from '@/hooks/useReliableOutboundBridge';
import { addActiveCallsBatch, type ActiveCall } from '@/lib/phone-utils';

interface LeadRecord {
  id: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  source?: string | null;
  status?: string | null;
  callCount?: number | null;
  createdAt?: string | null;
}

interface ContactRecord {
  id: number;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  title?: string | null;
  createdAt?: string | null;
}

interface DealRecord {
  id: number;
  title?: string | null;
  stage?: string | null;
  value?: number | string | null;
  contactId?: number | null;
  contactName?: string | null;
  expectedCloseDate?: string | null;
  notes?: string | null;
  createdAt?: string | null;
}

interface ActivityRecord {
  id: number;
  channel?: string | null;
  direction?: string | null;
  phone?: string | null;
  contactName?: string | null;
  body?: string | null;
  summary?: string | null;
  status?: string | null;
  durationSeconds?: number | null;
  occurredAt?: string | null;
  createdAt?: string | null;
}

interface EndpointResult {
  key: string;
  ok: boolean;
  data: Record<string, unknown>;
  error: string | null;
}

type RecordKind = 'lead' | 'contact' | 'deal';
type ViewMode = 'overview' | 'pipeline';
type SelectedRecord = { kind: RecordKind; id: number };

interface WorkspaceRecord {
  kind: RecordKind;
  id: number;
  name: string;
  subtitle: string;
  searchText: string;
  raw: LeadRecord | ContactRecord | DealRecord;
}

const PIPELINE_STAGES = ['Lead', 'Proposal', 'Negotiation', 'Won', 'Lost'];

const endpointLabels: Record<string, string> = {
  leads: 'leads',
  contacts: 'contacts',
  deals: 'deals',
  summary: 'summary',
  activities: 'activity',
};

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function arrayValue<T>(payload: Record<string, unknown>, key: string): T[] {
  const value = payload[key];
  return Array.isArray(value) ? value as T[] : [];
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function loadEndpoint(key: string, path: string): Promise<EndpointResult> {
  try {
    const response = await apiFetch(path);
    const data = await readPayload(response);
    return {
      key,
      ok: response.ok,
      data,
      error: response.ok ? null : `${endpointLabels[key] ?? key} unavailable (${response.status})`,
    };
  } catch {
    return { key, ok: false, data: {}, error: `${endpointLabels[key] ?? key} could not be loaded` };
  }
}

function formatRelative(value: string | null | undefined) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatCurrency(value: unknown) {
  const amount = numberValue(value);
  if (amount === null) return 'No value';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function activityIcon(channel: string) {
  if (channel === 'sms') return <MessageSquare size={12} />;
  if (channel === 'email' || channel === 'comms') return <Mail size={12} />;
  return <Phone size={12} />;
}

function SkeletonPage() {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-48px)] bg-[#FAFAF7]">
      <div className="animate-pulse flex flex-col items-center gap-2 text-black/50">
        <RefreshCw size={24} className="animate-spin" />
        <span className="text-xs font-bold uppercase tracking-widest">Loading Workspace...</span>
      </div>
    </div>
  );
}

export default function CrmWorkspace() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selected, setSelected] = useState<SelectedRecord | null>(null);
  const [callingRecordKey, setCallingRecordKey] = useState<string | null>(null);
  const [pabloCallingRecordKey, setPabloCallingRecordKey] = useState<string | null>(null);
  const [callError, setCallError] = useState('');
  const [pabloNotice, setPabloNotice] = useState<{ recordKey: string; message: string } | null>(null);

  const apiUrl = useCallback((path: string) => `${import.meta.env.BASE_URL}api/${path}`, []);
  const bridgeOutbound = useReliableOutboundBridge(apiUrl);

  const refreshActivities = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await apiFetch(apiUrl('crm/activities?limit=25'));
      if (!response.ok) return;
      const payload = await readPayload(response);
      setActivities(arrayValue<ActivityRecord>(payload, 'activities'));
    } catch {
      // Keep the last activity snapshot when a background refresh is offline.
    }
  }, [apiUrl, isAuthenticated]);

  const callRecord = useCallback(async (record: WorkspaceRecord) => {
    if (record.kind === 'deal') return;
    const entity = record.raw as LeadRecord | ContactRecord;
    if (!entity.phone) {
      setCallError('This CRM record has no phone number.');
      return;
    }
    const key = `${record.kind}-${record.id}`;
    setCallingRecordKey(key);
    setCallError('');
    try {
      const result = await bridgeOutbound(async () => {
        const response = await apiFetch(apiUrl('twilio/call'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientNumber: entity.phone,
            contactName: record.name,
            ...(record.kind === 'lead' ? { leadId: record.id } : { contactId: record.id }),
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'CRM call could not be started');
        return body;
      }, created => [{ callSid: created.callSid, conferenceName: created.conferenceName }]);

      const activeCall: ActiveCall = {
        callSid: result.callSid,
        phone: result.to,
        name: record.name,
        status: result.status || 'queued',
        startTime: Date.now(),
        elapsed: 0,
        direction: 'outbound',
        conferenceName: result.conferenceName,
      };
      addActiveCallsBatch([activeCall]);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'CRM call failed');
    } finally {
      setCallingRecordKey(null);
    }
  }, [apiUrl, bridgeOutbound]);

  const callWithPablo = useCallback(async (record: WorkspaceRecord) => {
    if (record.kind === 'deal') return;
    const recordKey = `${record.kind}-${record.id}`;
    setPabloCallingRecordKey(recordKey);
    setCallError('');
    setPabloNotice(null);
    try {
      const response = await apiFetch(apiUrl('twilio/pablo/outbound/dial'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record.kind === 'lead' ? { leadId: record.id } : { contactId: record.id }),
      });
      const body = await readPayload(response);
      if (!response.ok) throw new Error(stringValue(body.error, 'Pablo call could not be started.'));
      setPabloNotice({
        recordKey,
        message: `Pablo is calling ${record.name}. The call outcome will appear in CRM activity.`,
      });
      await refreshActivities();
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Pablo call could not be started.');
    } finally {
      setPabloCallingRecordKey(null);
    }
  }, [apiUrl, refreshActivities]);

  const loadWorkspace = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const results = await Promise.all([
      loadEndpoint('leads', '/api/leads'),
      loadEndpoint('contacts', '/api/tools/contacts'),
      loadEndpoint('deals', '/api/tools/deals'),
      loadEndpoint('summary', '/api/crm/summary'),
      loadEndpoint('activities', '/api/crm/activities?limit=25'),
    ]);
    const byKey = (key: string) => results.find(result => result.key === key);
    const leadsResult = byKey('leads');
    const contactsResult = byKey('contacts');
    const dealsResult = byKey('deals');
    const summaryResult = byKey('summary');
    const activitiesResult = byKey('activities');

    setLeads(arrayValue<LeadRecord>(leadsResult?.data ?? {}, 'leads'));
    setContacts(arrayValue<ContactRecord>(contactsResult?.data ?? {}, 'contacts'));
    setDeals(arrayValue<DealRecord>(dealsResult?.data ?? {}, 'deals'));
    setSummary(summaryResult?.data?.summary && typeof summaryResult.data.summary === 'object'
      ? summaryResult.data.summary as Record<string, unknown>
      : summaryResult?.data ?? {});
    setActivities(arrayValue<ActivityRecord>(activitiesResult?.data ?? {}, 'activities'));
    setErrors(results.flatMap(result => result.error ? [result.error] : []));
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) void loadWorkspace();
    else setLoading(false);
  }, [authLoading, isAuthenticated, loadWorkspace]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshActivities();
    };
    const interval = window.setInterval(refreshWhenVisible, 15000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isAuthenticated, refreshActivities]);

  const records = useMemo<WorkspaceRecord[]>(() => [
    ...leads.map(lead => ({
      kind: 'lead' as const,
      id: lead.id,
      name: stringValue(lead.name, lead.email || `Lead #${lead.id}`),
      subtitle: stringValue(lead.company, stringValue(lead.jobTitle, lead.email || 'Lead record')),
      searchText: [lead.name, lead.company, lead.email, lead.phone, lead.jobTitle, lead.status].map(value => stringValue(value)).join(' '),
      raw: lead,
    })),
    ...contacts.map(contact => ({
      kind: 'contact' as const,
      id: contact.id,
      name: stringValue(contact.name, contact.email || `Contact #${contact.id}`),
      subtitle: stringValue(contact.company, stringValue(contact.role || contact.title, contact.email || 'Contact record')),
      searchText: [contact.name, contact.company, contact.email, contact.phone, contact.role, contact.title].map(value => stringValue(value)).join(' '),
      raw: contact,
    })),
    ...deals.map(deal => ({
      kind: 'deal' as const,
      id: deal.id,
      name: stringValue(deal.title, `Deal #${deal.id}`),
      subtitle: stringValue(deal.contactName, stringValue(deal.stage, 'Deal record')),
      searchText: [deal.title, deal.stage, deal.contactName, deal.notes, deal.expectedCloseDate].map(value => stringValue(value)).join(' '),
      raw: deal,
    })),
  ], [contacts, deals, leads]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter(record => record.searchText.toLowerCase().includes(query));
  }, [records, search]);

  const selectedRecord = selected
    ? records.find(record => record.kind === selected.kind && record.id === selected.id) ?? null
    : null;

  const filteredDeals = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return deals;
    return deals.filter(deal => [
      deal.title,
      deal.stage,
      deal.contactName,
      deal.notes,
      deal.expectedCloseDate,
    ].map(value => stringValue(value)).join(' ').toLowerCase().includes(query));
  }, [deals, search]);

  const metric = (keys: string[], fallback: number) => {
    for (const key of keys) {
      const value = numberValue(summary[key]);
      if (value !== null) return value;
    }
    return fallback;
  };

  const activeDeals = deals.filter(deal => !['Won', 'Lost'].includes(stringValue(deal.stage)));
  const pipelineValue = activeDeals.reduce((total, deal) => total + (numberValue(deal.value) ?? 0), 0);
  const wonValue = deals
    .filter(deal => stringValue(deal.stage) === 'Won')
    .reduce((total, deal) => total + (numberValue(deal.value) ?? 0), 0);
  const allRequestsFailed = errors.length === 5 && records.length === 0 && activities.length === 0;

  if (authLoading) return <SkeletonPage />;
  if (!isAuthenticated) return <SignInPage context="Sign in to access the CRM workspace." />;

  return (
    <div className="flex min-h-[calc(100dvh-48px)] flex-col bg-[#FAFAF7] text-black font-sans text-sm">
      <header className="flex items-center justify-between px-4 py-3 border-b border-black">
        <div className="flex items-center gap-4">
          <h1 className="font-bold uppercase text-xs tracking-widest">SALARYMAN / CRM Workspace</h1>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-bold">
          <Link href="/business/contacts?new=1" className="flex items-center gap-1 border border-black px-2 py-1">
            <UserRound size={12} /> Add person
          </Link>
          <Link href="/business/contacts" className="flex items-center gap-1 px-2 py-1">
            Lead capture
          </Link>
          <Link href="/marketing/leads" className="flex items-center gap-1 uppercase hover:text-[#00ff41] hover:bg-black px-2 py-1 transition-colors">
            <Users size={12} /> Leads <ArrowUpRight size={10} />
          </Link>
          <Link href="/business/deals" className="flex items-center gap-1 uppercase hover:text-[#00ff41] hover:bg-black px-2 py-1 transition-colors">
            <Briefcase size={12} /> Deals <ArrowUpRight size={10} />
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-4 border-b border-black bg-white">
        <div className="p-3 border-r border-black flex flex-col">
          <span className="text-[9px] uppercase text-black/50 font-bold mb-1 tracking-widest">Leads</span>
          <strong className="text-xl font-mono leading-none">{metric(['leads', 'leadCount', 'totalLeads'], leads.length)}</strong>
        </div>
        <div className="p-3 border-r border-black flex flex-col">
          <span className="text-[9px] uppercase text-black/50 font-bold mb-1 tracking-widest">People in CRM</span>
          <strong className="text-xl font-mono leading-none">{metric(['contacts', 'contactCount', 'totalContacts'], contacts.length)}</strong>
        </div>
        <div className="p-3 border-r border-black flex flex-col">
          <span className="text-[9px] uppercase text-black/50 font-bold mb-1 tracking-widest">Active Pipeline ({activeDeals.length})</span>
          <strong className="text-xl font-mono leading-none text-[#008f11]">{formatCurrency(pipelineValue)}</strong>
        </div>
        <div className="p-3 flex flex-col">
          <span className="text-[9px] uppercase text-black/50 font-bold mb-1 tracking-widest">Won to Date ({deals.filter(d => stringValue(d.stage) === 'Won').length})</span>
          <strong className="text-xl font-mono leading-none">{formatCurrency(wonValue)}</strong>
        </div>
      </section>

      <div className="flex items-center justify-between px-4 py-2 border-b border-black bg-[#FAFAF7]">
        <div className="flex items-center gap-2 w-[400px] relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-black/50" />
          <input
            className="w-full pl-7 pr-7 py-1.5 text-xs font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black bg-white uppercase placeholder:text-black/30"
            placeholder="SEARCH RECORDS..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-black hover:text-[#00ff41]">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('overview')}
            className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase border border-black transition-colors ${viewMode === 'overview' ? 'bg-black text-[#00ff41]' : 'bg-white hover:bg-black/5'}`}
          >
            <LayoutDashboard size={12} /> Overview
          </button>
          <button
            onClick={() => setViewMode('pipeline')}
            className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase border border-black transition-colors ${viewMode === 'pipeline' ? 'bg-black text-[#00ff41]' : 'bg-white hover:bg-black/5'}`}
          >
            <Columns3 size={12} /> Pipeline
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="px-4 py-2 bg-black text-[#00ff41] flex items-center justify-between border-b border-black text-xs font-mono">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} />
            <span>{allRequestsFailed ? 'DATA UNAVAILABLE:' : 'PARTIAL ERROR:'} {errors.join(' · ')}</span>
          </div>
          <button onClick={() => void loadWorkspace()} className="flex items-center gap-1 uppercase font-bold hover:text-white">
            <RefreshCw size={12} /> RETRY
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center gap-2 text-black/50">
            <RefreshCw size={24} className="animate-spin" />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden border-r border-black bg-white">
            {viewMode === 'pipeline' ? (
              <div className="flex-1 overflow-x-auto bg-black/5 p-4 flex gap-4">
                {PIPELINE_STAGES.map(stage => {
                  const stageDeals = filteredDeals.filter(d => stringValue(d.stage, 'Lead') === stage);
                  return (
                    <div key={stage} className="flex-none w-72 flex flex-col h-full bg-white border border-black">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-black bg-black text-white text-[10px] font-bold uppercase tracking-widest">
                        <span>{stage}</span>
                        <span className="text-[#00ff41]">{stageDeals.length}</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {stageDeals.map(deal => (
                          <button
                            key={deal.id}
                            onClick={() => setSelected({ kind: 'deal', id: deal.id })}
                            className={`w-full text-left p-3 text-xs border border-black transition-colors ${selectedRecord?.kind === 'deal' && selectedRecord.id === deal.id ? 'bg-black text-[#00ff41]' : 'bg-white hover:bg-black/5'}`}
                          >
                            <div className="font-bold truncate text-[11px] uppercase">{stringValue(deal.title, `Deal #${deal.id}`)}</div>
                            <div className="mt-1 font-mono text-[10px]">{formatCurrency(deal.value)}</div>
                            <div className={`mt-1 truncate text-[10px] ${selectedRecord?.kind === 'deal' && selectedRecord.id === deal.id ? 'text-white/70' : 'text-black/60'}`}>
                              {stringValue(deal.contactName, 'No contact')}
                            </div>
                          </button>
                        ))}
                        {stageDeals.length === 0 && <div className="text-[9px] text-center uppercase p-4 text-black/30 font-bold tracking-widest">Empty</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex flex-col bg-white">
                <div className="grid grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)_120px] gap-4 px-4 py-2 border-b border-black bg-black/5 text-[9px] font-bold uppercase tracking-widest text-black/50">
                  <span>Type</span>
                  <span>Name</span>
                  <span>Context</span>
                  <span className="text-right">Meta</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredRecords.length === 0 ? (
                    <div className="p-4 text-[10px] uppercase tracking-widest text-black/40 text-center font-bold">No records found.</div>
                  ) : (
                    <>
                      {filteredRecords.slice(0, 100).map(record => (
                        <button
                          key={`${record.kind}-${record.id}`}
                          onClick={() => setSelected({ kind: record.kind, id: record.id })}
                          className={`w-full text-left grid grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)_120px] gap-4 px-4 py-3 border-b border-black/10 text-xs items-center transition-colors ${selectedRecord?.kind === record.kind && selectedRecord.id === record.id ? 'bg-black text-[#00ff41]' : 'hover:bg-black/5'}`}
                        >
                          <div className="uppercase font-bold text-[9px] tracking-widest flex items-center gap-1.5 opacity-80">
                            {record.kind === 'lead' ? <UserRound size={10} /> : record.kind === 'contact' ? <Building2 size={10} /> : <CircleDollarSign size={10} />}
                            {record.kind}
                          </div>
                          <div className="font-bold truncate text-[11px] uppercase">{record.name}</div>
                          <div className={`truncate text-[10px] ${selectedRecord?.kind === record.kind && selectedRecord.id === record.id ? 'text-[#00ff41]/70' : 'text-black/60'}`}>{record.subtitle}</div>
                          <div className="text-right font-mono text-[10px]">
                            {record.kind === 'deal' && formatCurrency((record.raw as DealRecord).value)}
                            {record.kind === 'lead' && <span className="bg-black/10 px-1 py-0.5">{stringValue((record.raw as LeadRecord).status, 'NEW').toUpperCase()}</span>}
                          </div>
                        </button>
                      ))}
                      {filteredRecords.length > 100 && (
                        <div className="p-3 text-center text-[9px] uppercase font-bold tracking-widest text-black/40 bg-black/5">
                          Showing first 100 matches
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="w-[360px] flex flex-col bg-[#FAFAF7] shrink-0 overflow-hidden">
            {selectedRecord && (
              <ContextPanel
                record={selectedRecord}
                onClose={() => setSelected(null)}
                onCall={callRecord}
                calling={callingRecordKey === `${selectedRecord.kind}-${selectedRecord.id}`}
                onPabloCall={callWithPablo}
                pabloCalling={pabloCallingRecordKey === `${selectedRecord.kind}-${selectedRecord.id}`}
                pabloNotice={pabloNotice?.recordKey === `${selectedRecord.kind}-${selectedRecord.id}` ? pabloNotice.message : ''}
                callError={callError}
              />
            )}
            <ActivityFeed activities={activities} loading={false} error={errors.find(e => e.includes('activity')) ?? null} />
          </div>
        </div>
      )}
    </div>
  );
}

function ContextPanel({
  record,
  onClose,
  onCall,
  calling,
  onPabloCall,
  pabloCalling,
  pabloNotice,
  callError,
}: {
  record: WorkspaceRecord;
  onClose: () => void;
  onCall: (record: WorkspaceRecord) => Promise<void>;
  calling: boolean;
  onPabloCall: (record: WorkspaceRecord) => Promise<void>;
  pabloCalling: boolean;
  pabloNotice: string;
  callError: string;
}) {
  const fields: Array<[string, string]> = [];
  let note = '';
  let destination = '/business/deals';

  if (record.kind === 'lead') {
    const lead = record.raw as LeadRecord;
    fields.push(
      ['Company', stringValue(lead.company, '-')],
      ['Role', stringValue(lead.jobTitle, '-')],
      ['Email', stringValue(lead.email, '-')],
      ['Phone', stringValue(lead.phone, '-')],
      ['Status', stringValue(lead.status, 'New')],
      ['Source', stringValue(lead.source, 'Unknown')],
    );
    note = lead.callCount ? `${lead.callCount} call(s) logged.` : 'No calls logged.';
    destination = '/marketing/leads';
  } else if (record.kind === 'contact') {
    const contact = record.raw as ContactRecord;
    fields.push(
      ['Company', stringValue(contact.company, '-')],
      ['Role', stringValue(contact.role || contact.title, '-')],
      ['Email', stringValue(contact.email, '-')],
      ['Phone', stringValue(contact.phone, '-')],
    );
    note = 'Use this relationship as context.';
  } else {
    const deal = record.raw as DealRecord;
    fields.push(
      ['Stage', stringValue(deal.stage, 'Lead')],
      ['Value', formatCurrency(deal.value)],
      ['Contact', stringValue(deal.contactName, 'Not linked')],
      ['Expected close', stringValue(deal.expectedCloseDate, 'Not set')],
    );
    note = stringValue(deal.notes, 'No deal notes.');
  }

  return (
    <div className="flex flex-col border-b border-black bg-white shrink-0">
      <div className="flex items-center justify-between p-3 border-b border-black bg-black text-[#00ff41]">
        <div className="min-w-0">
          <div className="text-[8px] uppercase font-bold tracking-widest opacity-80 mb-0.5">{record.kind} CONTEXT</div>
          <div className="font-bold text-xs truncate uppercase text-white">{record.name}</div>
        </div>
        <button onClick={onClose} className="hover:text-white transition-colors p-1"><X size={16}/></button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
          {fields.map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">{label}</span>
              <span className="text-[11px] font-bold truncate mt-0.5">{value}</span>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-black/10">
          <span className="text-[9px] font-bold uppercase tracking-widest text-black/40 block mb-1">Notes / Detail</span>
          <p className="text-black/80 text-[10px] leading-tight font-mono">{note}</p>
        </div>

        {callError && <div className="text-[#00ff41] bg-black text-[9px] font-bold font-mono uppercase p-2 border border-black">{callError}</div>}
        {pabloNotice && <div role="status" className="text-[#00ff41] bg-black text-[9px] font-bold font-mono p-2 border border-black">{pabloNotice}</div>}

        <div className="flex items-center gap-2 pt-1">
          {record.kind !== 'deal' && (
            <>
              <button
                onClick={() => onCall(record)}
                disabled={calling || pabloCalling}
                data-testid="crm-human-call-button"
                className="flex-1 flex items-center justify-center gap-1 bg-black text-white border border-black px-2 py-2 font-bold uppercase text-[9px] hover:text-[#00ff41] disabled:opacity-50 transition-colors"
              >
                <Phone size={12} /> {calling ? 'CALLING...' : 'CALL HUMAN'}
              </button>
              <button
                onClick={() => onPabloCall(record)}
                disabled={calling || pabloCalling || !Boolean((record.raw as LeadRecord | ContactRecord).phone?.trim())}
                data-testid="crm-pablo-call-button"
                aria-label={`Call ${record.name} with Pablo`}
                title="Requires recorded phone-call permission for the saved contact."
                className="flex-1 flex items-center justify-center gap-1 bg-white text-black border border-black px-2 py-2 font-bold uppercase text-[9px] hover:bg-black hover:text-[#00ff41] disabled:opacity-50 transition-colors"
              >
                <Phone size={12} /> {pabloCalling ? 'CALLING...' : 'CALL PABLO'}
              </button>
            </>
          )}
          <Link href={destination} className="flex-1 flex items-center justify-center gap-1.5 border border-black text-black bg-black/5 px-3 py-2 font-bold uppercase text-[10px] hover:bg-black hover:text-white transition-colors">
            OPEN FULL <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ActivityFeed({ activities, loading, error }: {
  activities: ActivityRecord[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#FAFAF7]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-black bg-black/5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-black/60">Activity Feed</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">{activities.length ? `${activities.length} updates` : ''}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="text-[9px] font-bold uppercase tracking-widest text-black/40 text-center animate-pulse">Loading feed...</div>
        ) : error ? (
          <div className="text-[9px] font-bold uppercase tracking-widest text-[#00ff41] bg-black text-center p-3 border border-black">{error}</div>
        ) : activities.length === 0 ? (
          <div className="text-[9px] font-bold uppercase tracking-widest text-black/30 text-center p-4">No recent activity.</div>
        ) : (
          activities.map(activity => {
            const channel = stringValue(activity.channel, 'comms').toLowerCase();
            const subject = stringValue(activity.contactName, activity.phone || 'Workspace activity');
            const body = stringValue(activity.summary, stringValue(activity.body, 'No detail available.'));
            const durationSeconds = numberValue(activity.durationSeconds);
            return (
              <div key={activity.id} className="flex gap-3 text-xs border-b border-black/10 pb-4 last:border-0 last:pb-0">
                <div className="mt-1 text-black/30 shrink-0">
                  {activityIcon(channel)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold uppercase text-[9px] tracking-widest text-black/70 break-words">{channel} · {subject}</span>
                    <time className="text-[9px] text-black/40 whitespace-nowrap shrink-0">{formatRelative(activity.occurredAt ?? activity.createdAt)}</time>
                  </div>
                  <p className="mt-1.5 leading-tight text-[10px] font-mono text-black/80">{body}</p>
                  {(activity.status || (channel === 'call' && durationSeconds !== null) ) && (
                    <div className="mt-1.5 flex items-center gap-2 text-[8px] font-bold uppercase tracking-widest text-black/50">
                      {activity.status && <span className="border border-black/20 px-1 py-0.5">Outcome: {activity.status}</span>}
                      {channel === 'call' && durationSeconds !== null && <span>{durationSeconds}s</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
