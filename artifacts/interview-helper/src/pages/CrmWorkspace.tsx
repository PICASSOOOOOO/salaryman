import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import {
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  Building2,
  CircleDollarSign,
  Clock3,
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
import { Link } from 'wouter';
import './crm-workspace.css';

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
  if (channel === 'sms') return <MessageSquare size={14} aria-hidden="true" />;
  if (channel === 'email' || channel === 'comms') return <Mail size={14} aria-hidden="true" />;
  return <Phone size={14} aria-hidden="true" />;
}

function activityTone(channel: string) {
  if (channel === 'sms') return 'sms';
  if (channel === 'voicemail') return 'voicemail';
  return '';
}

function SkeletonPage() {
  return (
    <div className="crm-workspace" aria-busy="true" aria-label="Loading CRM workspace">
      <div className="crm-shell">
        <div className="crm-skeleton" style={{ marginBottom: 22 }}>
          <div className="crm-skeleton-line short" />
          <div className="crm-skeleton-line tall" />
          <div className="crm-skeleton-line medium" />
        </div>
        <div className="crm-summary-strip">
          {[1, 2, 3, 4].map(item => <div className="crm-stat" key={item}><div className="crm-skeleton-line short" /></div>)}
        </div>
        <div className="crm-main-grid">
          <div className="crm-skeleton">
            {[1, 2, 3, 4].map(item => <div className="crm-skeleton-line" key={item} />)}
          </div>
          <div className="crm-skeleton">
            {[1, 2, 3].map(item => <div className="crm-skeleton-line" key={item} />)}
          </div>
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
    <section className="crm-panel crm-feed" aria-labelledby="crm-activity-heading">
      <div className="crm-feed-heading">
        <h2 id="crm-activity-heading">Recent activity</h2>
        <span>{activities.length ? `${activities.length} updates` : 'Last 25'}</span>
      </div>
      {loading ? (
        <div className="crm-feed-list" aria-label="Loading recent activity">
          {[1, 2, 3].map(item => (
            <div className="crm-feed-item" key={item}>
              <div className="crm-skeleton-line" style={{ width: 28, height: 28, margin: 0 }} />
              <div><div className="crm-skeleton-line short" style={{ margin: '3px 0 11px' }} /><div className="crm-skeleton-line" style={{ margin: 0 }} /></div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="crm-empty" style={{ minHeight: 210 }}>
          <div className="crm-empty-icon"><AlertTriangle size={19} aria-hidden="true" /></div>
          <p>{error}. Activity will appear when the feed is available.</p>
        </div>
      ) : activities.length === 0 ? (
        <div className="crm-empty" style={{ minHeight: 210 }}>
          <div className="crm-empty-icon"><Clock3 size={19} aria-hidden="true" /></div>
          <p>No recent activity has been recorded yet.</p>
        </div>
      ) : (
        <div className="crm-feed-list">
          {activities.map(activity => {
            const channel = stringValue(activity.channel, 'comms').toLowerCase();
            const subject = stringValue(activity.contactName, activity.phone || 'Workspace activity');
            const body = stringValue(activity.summary, stringValue(activity.body, 'No message detail available.'));
            return (
              <article className="crm-feed-item" key={activity.id}>
                <div className={`crm-feed-icon ${activityTone(channel)}`}>{activityIcon(channel)}</div>
                <div>
                  <div className="crm-feed-topline">
                    <span className="crm-feed-kind">{channel}</span>
                    <time className="crm-feed-time" dateTime={activity.occurredAt ?? activity.createdAt ?? undefined}>
                      {formatRelative(activity.occurredAt ?? activity.createdAt)}
                    </time>
                  </div>
                  <p>{body}</p>
                  <div className="crm-feed-person">{subject}</div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function CrmWorkspace() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
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
    <div className="crm-workspace">
      <main className="crm-shell">
        <header className="crm-header">
          <div>
            <p className="crm-eyebrow">SALARYMAN / BUSINESS / CRM</p>
            <h1>The calm command center for <span>accountable work.</span></h1>
            <p className="crm-header-copy">
              Move from a person, company, or conversation to its next action without losing the thread.
              This is the shared view across your customer records.
            </p>
          </div>
          <div className="crm-header-actions">
            <div className="crm-link-row">
              <Link href="/marketing/leads" className="crm-nav-link">
                <Users size={14} aria-hidden="true" /> Full lead database <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
              <Link href="/business/deals" className="crm-nav-link">
                <Briefcase size={14} aria-hidden="true" /> Full deal pipeline <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </header>

        <section className="crm-summary-strip" aria-label="CRM summary">
          <div className="crm-stat">
            <span className="crm-stat-label">People in motion</span>
            <strong className="crm-stat-value">{metric(['leads', 'leadCount', 'totalLeads'], leads.length)}</strong>
            <span className="crm-stat-note">Leads in the workspace</span>
          </div>
          <div className="crm-stat">
            <span className="crm-stat-label">Contacts</span>
            <strong className="crm-stat-value">{metric(['contacts', 'contactCount', 'totalContacts'], contacts.length)}</strong>
            <span className="crm-stat-note">Known relationships</span>
          </div>
          <div className="crm-stat">
            <span className="crm-stat-label">Open pipeline</span>
            <strong className="crm-stat-value">{formatCurrency(pipelineValue)}</strong>
            <span className="crm-stat-note">{activeDeals.length} active deals</span>
          </div>
          <div className="crm-stat">
            <span className="crm-stat-label">Won to date</span>
            <strong className="crm-stat-value">{formatCurrency(wonValue)}</strong>
            <span className="crm-stat-note">{deals.filter(deal => stringValue(deal.stage) === 'Won').length} closed wins</span>
          </div>
        </section>

        <div className="crm-toolbar">
          <div className="crm-search-wrap">
            <Search className="crm-search-icon" size={17} aria-hidden="true" />
            <label className="sr-only" htmlFor="crm-search">Search leads, contacts, and deals</label>
            <input
              id="crm-search"
              className="crm-search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search people, companies, conversations, or deals"
              type="search"
            />
            {search && (
              <button className="crm-search-clear" type="button" onClick={() => setSearch('')} aria-label="Clear search">
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="crm-view-toggle" role="tablist" aria-label="CRM view">
            <button
              className={`crm-view-button ${viewMode === 'overview' ? 'is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={viewMode === 'overview'}
              onClick={() => setViewMode('overview')}
            >
              <LayoutDashboard size={14} aria-hidden="true" /> Overview
            </button>
            <button
              className={`crm-view-button ${viewMode === 'pipeline' ? 'is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={viewMode === 'pipeline'}
              onClick={() => setViewMode('pipeline')}
            >
              <Columns3 size={14} aria-hidden="true" /> Pipeline
            </button>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="crm-alert" role="status">
            <AlertTriangle size={16} aria-hidden="true" />
            <div>
              <strong>{allRequestsFailed ? 'CRM data is unavailable.' : 'Some CRM data is unavailable.'}</strong>{' '}
              {errors.join(' · ')}.
            </div>
            <button className="crm-button subtle" type="button" onClick={() => void loadWorkspace()}>
              <RefreshCw size={13} aria-hidden="true" /> Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="crm-main-grid">
            <div className="crm-skeleton">{[1, 2, 3, 4].map(item => <div className="crm-skeleton-line" key={item} />)}</div>
            <div className="crm-skeleton">{[1, 2, 3].map(item => <div className="crm-skeleton-line" key={item} />)}</div>
          </div>
        ) : viewMode === 'pipeline' ? (
          <div className={`crm-main-grid ${selectedRecord ? 'has-context' : ''}`}>
            <section className="crm-panel crm-pipeline" aria-labelledby="crm-pipeline-heading">
              <div className="crm-pipeline-heading">
                <div>
                  <h2 id="crm-pipeline-heading">Deal pipeline</h2>
                  <p>{search ? `${filteredDeals.length} deals match “${search}”.` : 'A focused view of active and closed opportunities.'}</p>
                </div>
                <Link href="/business/deals" className="crm-button">
                  Manage deals <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
              </div>
              <div className="crm-pipeline-board">
                {PIPELINE_STAGES.map(stage => {
                  const stageDeals = filteredDeals.filter(deal => stringValue(deal.stage, 'Lead') === stage);
                  return (
                    <div className="crm-pipeline-column" key={stage}>
                      <div className="crm-record-heading">
                        <span className="crm-pipeline-title">{stage}</span>
                        <span className="crm-pipeline-count">{stageDeals.length}</span>
                      </div>
                      {stageDeals.map(deal => (
                        <button
                          className={`crm-pipeline-card ${selectedRecord?.kind === 'deal' && selectedRecord.id === deal.id ? 'is-selected' : ''}`}
                          type="button"
                          key={deal.id}
                          onClick={() => setSelected({ kind: 'deal', id: deal.id })}
                        >
                          <strong>{stringValue(deal.title, `Deal #${deal.id}`)}</strong>
                          <p className="crm-deal-value">{formatCurrency(deal.value)}</p>
                          <p>{stringValue(deal.contactName, 'No linked contact')}</p>
                        </button>
                      ))}
                      {stageDeals.length === 0 && <div className="crm-empty" style={{ minHeight: 90, padding: 12 }}><p>No deals here</p></div>}
                    </div>
                  );
                })}
              </div>
            </section>
            {selectedRecord && selectedRecord.kind === 'deal' && selectedRecord.raw && (
              <ContextPanel record={selectedRecord} onClose={() => setSelected(null)} />
            )}
            <ActivityFeed activities={activities} loading={false} error={errors.find(error => error.includes('activity')) ?? null} />
          </div>
        ) : (
          <div className={`crm-main-grid ${selectedRecord ? 'has-context' : ''}`}>
            <section className="crm-panel" aria-labelledby="crm-records-heading">
              <div className="crm-panel-heading">
                <h2 id="crm-records-heading">Your working set</h2>
                <p>{search ? `${filteredRecords.length} matches` : `${records.length} records loaded`}</p>
              </div>
              <div className="crm-record-list">
                {filteredRecords.length === 0 ? (
                  <div className="crm-empty">
                    <div className="crm-empty-icon"><Search size={19} aria-hidden="true" /></div>
                    <p>{search ? 'No lead, contact, or deal matches that search.' : 'No CRM records are available yet.'}</p>
                  </div>
                ) : filteredRecords.slice(0, 100).map(record => (
                  <button
                    className={`crm-record-button ${selectedRecord?.kind === record.kind && selectedRecord.id === record.id ? 'is-selected' : ''}`}
                    type="button"
                    key={`${record.kind}-${record.id}`}
                    onClick={() => setSelected({ kind: record.kind, id: record.id })}
                  >
                    <div className="crm-record-heading">
                      <span className="crm-record-name">{record.name}</span>
                      <span className={`crm-record-type ${record.kind}`}>{record.kind}</span>
                    </div>
                    <div className="crm-record-meta">
                      <span>
                        {record.kind === 'lead' ? <UserRound size={12} aria-hidden="true" /> : record.kind === 'contact' ? <Building2 size={12} aria-hidden="true" /> : <CircleDollarSign size={12} aria-hidden="true" />}
                        {record.subtitle}
                      </span>
                      {record.kind === 'deal' && <span>{formatCurrency((record.raw as DealRecord).value)}</span>}
                      {record.kind === 'lead' && <span>{stringValue((record.raw as LeadRecord).status, 'New')}</span>}
                    </div>
                  </button>
                ))}
                {filteredRecords.length > 100 && <p style={{ margin: 0, padding: '12px 19px', color: 'var(--crm-muted)', fontSize: 11 }}>Showing the first 100 matches. Refine your search to see more.</p>}
              </div>
            </section>
            {selectedRecord && <ContextPanel record={selectedRecord} onClose={() => setSelected(null)} />}
            <ActivityFeed activities={activities} loading={false} error={errors.find(error => error.includes('activity')) ?? null} />
          </div>
        )}
      </main>
    </div>
  );
}

function ContextPanel({ record, onClose }: { record: WorkspaceRecord; onClose: () => void }) {
  const fields: Array<[string, string]> = [];
  let note = '';
  let destination = '/business/deals';

  if (record.kind === 'lead') {
    const lead = record.raw as LeadRecord;
    fields.push(
      ['Company', stringValue(lead.company, 'Not listed')],
      ['Role', stringValue(lead.jobTitle, 'Not listed')],
      ['Email', stringValue(lead.email, 'Not listed')],
      ['Phone', stringValue(lead.phone, 'Not listed')],
      ['Status', stringValue(lead.status, 'New')],
      ['Source', stringValue(lead.source, 'Unknown')],
    );
    note = lead.callCount ? `${lead.callCount} call${lead.callCount === 1 ? '' : 's'} logged for this lead.` : 'No calls logged for this lead yet.';
    destination = '/marketing/leads';
  } else if (record.kind === 'contact') {
    const contact = record.raw as ContactRecord;
    fields.push(
      ['Company', stringValue(contact.company, 'Not listed')],
      ['Role', stringValue(contact.role || contact.title, 'Not listed')],
      ['Email', stringValue(contact.email, 'Not listed')],
      ['Phone', stringValue(contact.phone, 'Not listed')],
    );
    note = 'Use this relationship as context when moving an opportunity forward.';
  } else {
    const deal = record.raw as DealRecord;
    fields.push(
      ['Stage', stringValue(deal.stage, 'Lead')],
      ['Value', formatCurrency(deal.value)],
      ['Contact', stringValue(deal.contactName, 'Not linked')],
      ['Expected close', stringValue(deal.expectedCloseDate, 'Not set')],
    );
    note = stringValue(deal.notes, 'No deal notes have been added.');
  }

  return (
    <aside className="crm-panel crm-context" aria-labelledby="crm-context-heading">
      <div className="crm-context-heading">
        <div>
          <p className="crm-context-kind">{record.kind} context</p>
          <h2 id="crm-context-heading">{record.name}</h2>
        </div>
        <button className="crm-close-button" type="button" onClick={onClose} aria-label="Close record context">
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="crm-context-body">
        <div className="crm-context-grid">
          {fields.map(([label, value]) => (
            <div key={label}>
              <span className="crm-context-label">{label}</span>
              <span className={`crm-context-value ${value === 'Not listed' || value === 'Not set' || value === 'Not linked' ? 'muted' : ''}`}>{value}</span>
            </div>
          ))}
        </div>
        <p className="crm-context-note">{note}</p>
        <div className="crm-context-actions">
          <Link href={destination} className="crm-button">
            Open full record <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </aside>
  );
}