import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import {
  BarChart2, Users, Briefcase, FolderOpen, UserCheck, Loader2,
  Zap, CheckCircle, AlertCircle, RefreshCw, Trash2, Send, DollarSign, TrendingUp,
} from 'lucide-react';
import { ProGate } from '@/components/ProGate';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';

const GREEN = '#00ff41';
const GREEN_DIM = 'rgba(0,255,65,0.5)';
const GREEN_MID = 'rgba(0,255,65,0.3)';
const BG = 'rgba(0,10,0,0.97)';

function crt(opacity = 1) {
  return { color: `rgba(0,255,65,${opacity})`, fontFamily: "'Share Tech Mono', monospace" };
}

interface Summary {
  openPositions: number;
  totalApplicants: number;
  activeStaff: number;
  hiresThisMonth: number;
  totalContacts: number;
  activeProjects: number;
}

interface BillingSummary {
  totalProSubscribers: number;
  totalFreeUsers: number;
  estimatedMRR: number;
  proUpgradesThisMonth: number;
  pricePerMonth: number;
}

interface StageCount { stage: string; count: number; }
interface MonthCount { month: string; count: number; }

interface ReportingStats {
  summary: Summary;
  billing: BillingSummary;
  applicantsByStage: StageCount[];
  hiresPerMonth: MonthCount[];
  applicantsPerMonth: MonthCount[];
}

interface WebhookConfig {
  webhookUrl: string;
  eventNewHire: boolean;
  eventNewContact: boolean;
  eventWeeklySummary: boolean;
  eventNewApplicant: boolean;
}

const STAGE_ORDER = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
const STAGE_COLORS: Record<string, string> = {
  applied: 'rgba(0,255,65,0.8)',
  screening: 'rgba(0,200,80,0.8)',
  interview: 'rgba(0,180,120,0.8)',
  offer: 'rgba(0,220,100,0.8)',
  hired: '#00ff41',
  rejected: 'rgba(255,50,50,0.5)',
};

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: number; icon: React.FC<any>; sub?: string }) {
  return (
    <div
      style={{
        background: 'rgba(0,255,65,0.04)',
        border: '1px solid rgba(0,255,65,0.2)',
        padding: '16px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon style={{ width: 14, height: 14, color: GREEN_DIM }} />
        <span style={{ ...crt(0.45), fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ ...crt(1), fontSize: '2rem', letterSpacing: '0.08em', lineHeight: 1, textShadow: `0 0 20px rgba(0,255,65,0.4)` }}>
        {value}
      </div>
      {sub && <div style={{ ...crt(0.3), fontSize: '0.55rem', letterSpacing: '0.1em', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function CRTTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'rgba(0,10,0,0.95)', border: '1px solid rgba(0,255,65,0.35)', padding: '8px 14px' }}>
      <div style={{ ...crt(0.5), fontSize: '0.6rem', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ ...crt(0.9), fontSize: '0.75rem' }}>
          {p.name}: <span style={{ color: GREEN }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${months[parseInt(m, 10) - 1]} ${y?.slice(2)}`;
}

function HiringPipelineChart({ data }: { data: StageCount[] }) {
  const sorted = STAGE_ORDER
    .map(s => ({ stage: s.toUpperCase(), count: data.find(d => d.stage === s)?.count ?? 0 }));

  return (
    <div style={{ border: '1px solid rgba(0,255,65,0.15)', padding: 20, background: 'rgba(0,255,65,0.02)' }}>
      <div style={{ ...crt(0.5), fontSize: '0.6rem', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>
        HIRING PIPELINE · APPLICANTS BY STAGE
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={sorted} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="stage" tick={{ fill: 'rgba(0,255,65,0.4)', fontSize: 9, fontFamily: "'Share Tech Mono', monospace" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: 'rgba(0,255,65,0.4)', fontSize: 9, fontFamily: "'Share Tech Mono', monospace" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<CRTTooltip />} cursor={{ fill: 'rgba(0,255,65,0.04)' }} />
          <Bar dataKey="count" name="Applicants" fill={GREEN} opacity={0.7} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActivityChart({ hiresPerMonth, applicantsPerMonth }: { hiresPerMonth: MonthCount[]; applicantsPerMonth: MonthCount[] }) {
  const months = Array.from(
    new Set([...hiresPerMonth.map(d => d.month), ...applicantsPerMonth.map(d => d.month)])
  ).sort();

  const data = months.map(m => ({
    month: formatMonth(m),
    hires: hiresPerMonth.find(d => d.month === m)?.count ?? 0,
    applicants: applicantsPerMonth.find(d => d.month === m)?.count ?? 0,
  }));

  return (
    <div style={{ border: '1px solid rgba(0,255,65,0.15)', padding: 20, background: 'rgba(0,255,65,0.02)' }}>
      <div style={{ ...crt(0.5), fontSize: '0.6rem', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>
        ACTIVITY TREND · LAST 6 MONTHS
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,65,0.07)" />
          <XAxis dataKey="month" tick={{ fill: 'rgba(0,255,65,0.4)', fontSize: 9, fontFamily: "'Share Tech Mono', monospace" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: 'rgba(0,255,65,0.4)', fontSize: 9, fontFamily: "'Share Tech Mono', monospace" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<CRTTooltip />} />
          <Legend wrapperStyle={{ ...crt(0.4), fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }} />
          <Line type="monotone" dataKey="applicants" stroke="rgba(0,255,65,0.6)" strokeWidth={2} dot={{ fill: GREEN, r: 3 }} activeDot={{ r: 4 }} name="Applicants" />
          <Line type="monotone" dataKey="hires" stroke={GREEN} strokeWidth={2} dot={{ fill: GREEN, r: 3 }} activeDot={{ r: 4 }} name="Hires" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ZapierSection() {
  const [config, setConfig] = useState<WebhookConfig>({
    webhookUrl: '',
    eventNewHire: true,
    eventNewContact: false,
    eventWeeklySummary: false,
    eventNewApplicant: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/reporting/webhook')
      .then(r => r.json())
      .then(d => {
        if (d.webhook) {
          setConfig({
            webhookUrl: d.webhook.webhookUrl ?? '',
            eventNewHire: d.webhook.eventNewHire ?? true,
            eventNewContact: d.webhook.eventNewContact ?? false,
            eventWeeklySummary: d.webhook.eventWeeklySummary ?? false,
            eventNewApplicant: d.webhook.eventNewApplicant ?? false,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/reporting/webhook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const testWebhook = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/reporting/webhook/test', { method: 'POST' });
      const d = await r.json();
      if (r.ok) {
        setTestResult({ ok: true, msg: `SIGNAL DELIVERED · HTTP ${d.status}` });
      } else {
        setTestResult({ ok: false, msg: d.error ?? 'Unknown error' });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  const clearWebhook = async () => {
    await fetch('/api/reporting/webhook', { method: 'DELETE' });
    setConfig({ webhookUrl: '', eventNewHire: true, eventNewContact: false, eventWeeklySummary: false, eventNewApplicant: false });
  };

  const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 32,
          height: 18,
          background: checked ? 'rgba(0,255,65,0.2)' : 'rgba(0,255,65,0.05)',
          border: `1px solid ${checked ? 'rgba(0,255,65,0.6)' : 'rgba(0,255,65,0.2)'}`,
          borderRadius: 2,
          position: 'relative',
          transition: 'all 0.2s',
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 12,
          height: 12,
          background: checked ? GREEN : 'rgba(0,255,65,0.25)',
          position: 'absolute',
          top: 2,
          left: checked ? 16 : 2,
          transition: 'left 0.2s',
          boxShadow: checked ? `0 0 6px rgba(0,255,65,0.5)` : 'none',
        }} />
      </div>
      <span style={{ ...crt(checked ? 0.8 : 0.4), fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
    </label>
  );

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Loader2 style={{ width: 16, height: 16, color: GREEN_DIM, animation: 'spin 1s linear infinite' }} /></div>;
  }

  return (
    <div style={{ border: '1px solid rgba(0,255,65,0.2)', background: 'rgba(0,255,65,0.02)', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Zap style={{ width: 14, height: 14, color: GREEN_DIM }} />
        <span style={{ ...crt(0.9), fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 'bold' }}>
          ZAPIER WEBHOOK
        </span>
      </div>
      <p style={{ ...crt(0.35), fontSize: '0.6rem', letterSpacing: '0.08em', marginBottom: 20, lineHeight: 1.6 }}>
        Paste your Zapier webhook URL to push events from PABLO CORP to Slack, Sheets, email, or any automation.
        Create a Zap with "Webhooks by Zapier" as the trigger to get your URL.
      </p>

      <div style={{ marginBottom: 16 }}>
        <div style={{ ...crt(0.4), fontSize: '0.55rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
          WEBHOOK URL
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={config.webhookUrl}
            onChange={e => setConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
            placeholder="https://hooks.zapier.com/hooks/catch/..."
            style={{
              flex: 1,
              background: 'rgba(0,255,65,0.04)',
              border: '1px solid rgba(0,255,65,0.2)',
              color: GREEN,
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '0.65rem',
              padding: '8px 12px',
              outline: 'none',
              letterSpacing: '0.05em',
            }}
          />
          {config.webhookUrl && (
            <button
              onClick={clearWebhook}
              title="Clear webhook"
              style={{
                background: 'rgba(255,50,50,0.06)',
                border: '1px solid rgba(255,50,50,0.2)',
                color: 'rgba(255,50,50,0.6)',
                padding: '8px 10px',
                cursor: 'pointer',
              }}
            >
              <Trash2 style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>
      </div>

      <div style={{ ...crt(0.4), fontSize: '0.55rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
        TRIGGER EVENTS
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 20 }}>
        <Toggle label="New Hire" checked={config.eventNewHire} onChange={v => setConfig(p => ({ ...p, eventNewHire: v }))} />
        <Toggle label="New Applicant" checked={config.eventNewApplicant} onChange={v => setConfig(p => ({ ...p, eventNewApplicant: v }))} />
        <Toggle label="New Contact Added" checked={config.eventNewContact} onChange={v => setConfig(p => ({ ...p, eventNewContact: v }))} />
        <Toggle label="Weekly Summary" checked={config.eventWeeklySummary} onChange={v => setConfig(p => ({ ...p, eventWeeklySummary: v }))} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(0,255,65,0.1)',
            border: '1px solid rgba(0,255,65,0.4)',
            color: GREEN,
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '0.65rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '8px 16px',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : <CheckCircle style={{ width: 12, height: 12 }} />}
          {saved ? 'SAVED' : 'SAVE CONFIG'}
        </button>

        {config.webhookUrl && (
          <button
            onClick={testWebhook}
            disabled={testing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(0,255,65,0.04)',
              border: '1px solid rgba(0,255,65,0.2)',
              color: GREEN_DIM,
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '0.65rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '8px 16px',
              cursor: testing ? 'not-allowed' : 'pointer',
              opacity: testing ? 0.6 : 1,
            }}
          >
            {testing ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : <Send style={{ width: 12, height: 12 }} />}
            SEND TEST SIGNAL
          </button>
        )}

        {testResult && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {testResult.ok
              ? <CheckCircle style={{ width: 12, height: 12, color: GREEN }} />
              : <AlertCircle style={{ width: 12, height: 12, color: 'rgba(255,80,80,0.8)' }} />
            }
            <span style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '0.6rem',
              letterSpacing: '0.08em',
              color: testResult.ok ? GREEN : 'rgba(255,80,80,0.8)',
            }}>
              {testResult.msg}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportingContent() {
  const [stats, setStats] = useState<ReportingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boomerMode] = useState(() => getDefaultBoomerMode());

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/reporting/stats');
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <BarChart2 style={{ width: 18, height: 18, color: GREEN }} />
          <h1 style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '1.1rem',
            color: GREEN,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            textShadow: '0 0 15px rgba(0,255,65,0.5)',
          }}>
            {boomerMode ? 'REPORTING' : 'INTEL-9 COMMAND BRIEF'}
          </h1>
          <button
            onClick={loadStats}
            disabled={loading}
            title="Refresh"
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: '1px solid rgba(0,255,65,0.2)',
              color: GREEN_DIM,
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: '4px 8px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <RefreshCw style={{ width: 12, height: 12, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.55rem', letterSpacing: '0.1em' }}>REFRESH</span>
          </button>
        </div>
        <p style={{ ...crt(0.3), fontSize: '0.6rem', letterSpacing: '0.1em' }}>
          {boomerMode ? 'Business stats — hiring, contacts, projects' : 'TACTICAL OVERVIEW · BUSINESS INTELLIGENCE FEED'}
        </p>
      </div>

      {error && (
        <div style={{
          border: '1px solid rgba(255,80,80,0.3)',
          background: 'rgba(255,50,50,0.05)',
          padding: '12px 16px',
          marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertCircle style={{ width: 14, height: 14, color: 'rgba(255,80,80,0.7)' }} />
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.65rem', color: 'rgba(255,80,80,0.7)' }}>{error}</span>
        </div>
      )}

      {loading && !stats ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div style={{ textAlign: 'center' }}>
            <Loader2 style={{ width: 24, height: 24, color: GREEN_DIM, animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ ...crt(0.3), fontSize: '0.6rem', letterSpacing: '0.15em' }}>PULLING INTEL...</div>
          </div>
        </div>
      ) : stats ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Hiring & Operations Stat Cards */}
          <div>
            <div style={{ ...crt(0.35), fontSize: '0.55rem', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10 }}>
              HIRING &amp; OPERATIONS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              <StatCard label="Open Positions" value={stats.summary.openPositions} icon={Briefcase} />
              <StatCard label="Total Applicants" value={stats.summary.totalApplicants} icon={Users} sub="ALL TIME" />
              <StatCard label="Active Staff" value={stats.summary.activeStaff} icon={UserCheck} />
              <StatCard label="Hires This Month" value={stats.summary.hiresThisMonth} icon={UserCheck} sub="CURRENT MONTH" />
              <StatCard label="Contacts" value={stats.summary.totalContacts} icon={Users} sub="IN RECALL-6" />
              <StatCard label="Projects" value={stats.summary.activeProjects} icon={FolderOpen} sub="IN CMD DECK" />
            </div>
          </div>

          {/* Revenue / Billing Summary */}
          <div>
            <div style={{ ...crt(0.35), fontSize: '0.55rem', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10 }}>
              REVENUE &amp; SUBSCRIPTIONS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              <StatCard label="Est. MRR" value={stats.billing.estimatedMRR} icon={DollarSign} sub={`$${stats.billing.pricePerMonth}/USER/MO`} />
              <StatCard label="Pro Subscribers" value={stats.billing.totalProSubscribers} icon={TrendingUp} sub="ACTIVE OPERATORS" />
              <StatCard label="Free Users" value={stats.billing.totalFreeUsers} icon={Users} sub="CIVILIAN ACCESS" />
              <StatCard label="Upgrades This Mo." value={stats.billing.proUpgradesThisMonth} icon={TrendingUp} sub="NEW OPERATORS" />
            </div>
          </div>

          {/* Charts */}
          <HiringPipelineChart data={stats.applicantsByStage} />
          <ActivityChart hiresPerMonth={stats.hiresPerMonth} applicantsPerMonth={stats.applicantsPerMonth} />

          {/* Zapier Section */}
          <div>
            <ZapierSection />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function Reporting() {
  return (
    <ProGate feature="INTEL-9 COMMAND BRIEF">
      <ReportingContent />
    </ProGate>
  );
}
