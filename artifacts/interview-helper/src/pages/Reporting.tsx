import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import {
  BarChart2, Users, Briefcase, FolderOpen, UserCheck, Loader2,
  Zap, CheckCircle, AlertCircle, RefreshCw, Trash2, Send, DollarSign, TrendingUp,
  MessageSquare, Wallet, Target, Megaphone, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { useCurrency } from '@/hooks/use-currency';
import { formatFromUsd } from '@/lib/currency';

const ACCENT = '#38bdf8';
const ACCENT_DIM = 'rgba(56,189,248,0.5)';

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

interface WalletSnapshot {
  bank: { fiatTotal: number; earnedFiat: number; quarantineFiat: number };
  debt: number;
  creditScore: number;
}

interface AdCreative {
  id: number;
  platform: string;
  status: string;
  createdAt: string;
}

interface WebhookConfig {
  webhookUrl: string;
  eventNewHire: boolean;
  eventNewContact: boolean;
  eventWeeklySummary: boolean;
  eventNewApplicant: boolean;
  eventApplicantStageChanged?: boolean;
  eventDealStageChanged?: boolean;
}

const STAGE_ORDER = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
const STAGE_COLORS: Record<string, string> = {
  applied: 'rgba(56,189,248,0.7)',
  screening: 'rgba(56,189,248,0.7)',
  interview: 'rgba(56,189,248,0.7)',
  offer: 'rgba(56,189,248,0.7)',
  hired: '#38bdf8',
  rejected: 'rgba(239,68,68,0.5)',
};

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: number | string; icon: React.FC<any>; sub?: string }) {
  return (
    <div className="bg-white/[0.025] border border-white/8 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-2xl font-bold text-zinc-100 leading-none">{value}</div>
      {sub && <div className="text-[10px] font-mono text-zinc-700 tracking-wide mt-1">{sub}</div>}
    </div>
  );
}

const fmtNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  linkedin: { label: 'LinkedIn', color: '#38bdf8' },
  instagram: { label: 'Instagram', color: '#f472b6' },
  facebook: { label: 'Facebook', color: '#60a5fa' },
  tiktok: { label: 'TikTok', color: '#2dd4bf' },
};

type Accent = 'sky' | 'emerald' | 'amber' | 'violet' | 'rose';
const ACCENTS: Record<Accent, { text: string; bg: string; border: string; glow: string }> = {
  sky: { text: 'text-sky-300', bg: 'bg-sky-500/10', border: 'border-sky-500/20', glow: 'rgba(56,189,248,0.14)' },
  emerald: { text: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', glow: 'rgba(16,185,129,0.14)' },
  amber: { text: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/20', glow: 'rgba(245,158,11,0.14)' },
  violet: { text: 'text-violet-300', bg: 'bg-violet-500/10', border: 'border-violet-500/20', glow: 'rgba(139,92,246,0.14)' },
  rose: { text: 'text-rose-300', bg: 'bg-rose-500/10', border: 'border-rose-500/20', glow: 'rgba(244,63,94,0.14)' },
};

function KpiTile({ label, value, sub, icon: Icon, accent = 'sky', trend }: {
  label: string; value: string; sub?: string; icon: React.FC<any>; accent?: Accent;
  trend?: { dir: 'up' | 'down'; text: string };
}) {
  const a = ACCENTS[accent];
  return (
    <div className={`relative overflow-hidden rounded-xl border ${a.border} bg-white/[0.02] p-4`}>
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl" style={{ background: a.glow }} />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-6 h-6 rounded-lg ${a.bg} border ${a.border} flex items-center justify-center`}>
            <Icon className={`w-3 h-3 ${a.text}`} />
          </div>
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{label}</span>
        </div>
        <div className={`text-2xl font-bold ${a.text} leading-none font-mono`}>{value}</div>
        <div className="flex items-center gap-2 mt-2 min-h-[14px]">
          {trend && (
            <span className={`flex items-center gap-0.5 text-[10px] font-mono ${trend.dir === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {trend.dir === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {trend.text}
            </span>
          )}
          {sub && <span className="text-[10px] font-mono text-zinc-600 tracking-wide">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

function ModernTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] font-mono text-zinc-500 mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="text-xs font-mono text-zinc-300">
          {p.name}: <span className="text-sky-400">{p.value}</span>
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
    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-5">
      <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-4">
        Hiring Pipeline · Applicants by Stage
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={sorted} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="stage" tick={{ fill: 'rgba(161,161,170,0.5)', fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: 'rgba(161,161,170,0.5)', fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<ModernTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="count" name="Applicants" fill={ACCENT} opacity={0.7} radius={[3, 3, 0, 0]} />
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
    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-5">
      <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-4">
        Activity Trend · Last 6 Months
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="month" tick={{ fill: 'rgba(161,161,170,0.5)', fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: 'rgba(161,161,170,0.5)', fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<ModernTooltip />} />
          <Legend wrapperStyle={{ fontSize: '0.6rem', fontFamily: 'monospace', textTransform: 'uppercase', color: 'rgba(161,161,170,0.6)' }} />
          <Line type="monotone" dataKey="applicants" stroke="rgba(56,189,248,0.5)" strokeWidth={2} dot={{ fill: ACCENT, r: 3 }} activeDot={{ r: 4 }} name="Applicants" />
          <Line type="monotone" dataKey="hires" stroke={ACCENT} strokeWidth={2} dot={{ fill: ACCENT, r: 3 }} activeDot={{ r: 4 }} name="Hires" />
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
    eventApplicantStageChanged: false,
    eventDealStageChanged: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/api/reporting/webhook')
      .then(r => r.json())
      .then(d => {
        if (d.webhook) {
          setConfig({
            webhookUrl: d.webhook.webhookUrl ?? '',
            eventNewHire: d.webhook.eventNewHire ?? true,
            eventNewContact: d.webhook.eventNewContact ?? false,
            eventWeeklySummary: d.webhook.eventWeeklySummary ?? false,
            eventNewApplicant: d.webhook.eventNewApplicant ?? false,
            eventApplicantStageChanged: d.webhook.eventApplicantStageChanged ?? false,
            eventDealStageChanged: d.webhook.eventDealStageChanged ?? false,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch('/api/reporting/webhook', {
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
      const r = await apiFetch('/api/reporting/webhook/test', { method: 'POST' });
      const d = await r.json();
      if (r.ok) {
        setTestResult({ ok: true, msg: `Delivered · HTTP ${d.status}` });
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
    await apiFetch('/api/reporting/webhook', { method: 'DELETE' });
    setConfig({ webhookUrl: '', eventNewHire: true, eventNewContact: false, eventWeeklySummary: false, eventNewApplicant: false, eventApplicantStageChanged: false, eventDealStageChanged: false });
  };

  const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-[18px] rounded-full border transition-all ${checked ? 'bg-sky-500/20 border-sky-500/50' : 'bg-white/4 border-white/10'}`}
      >
        <div className={`absolute top-[2px] w-3 h-3 rounded-full transition-all ${checked ? 'left-[16px] bg-sky-400' : 'left-[2px] bg-zinc-600'}`} />
      </div>
      <span className={`text-xs font-mono uppercase tracking-wide ${checked ? 'text-zinc-300' : 'text-zinc-600'}`}>{label}</span>
    </label>
  );

  if (loading) {
    return <div className="flex justify-center p-6"><Loader2 className="w-4 h-4 animate-spin text-zinc-500" /></div>;
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-6">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-sm font-semibold text-zinc-200 uppercase tracking-widest font-mono">Zapier Webhook</span>
      </div>
      <p className="text-xs text-zinc-600 mb-5 leading-relaxed">
        Paste your Zapier webhook URL to push events to Slack, Sheets, email, or any automation.
      </p>

      <div className="mb-4">
        <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-2">Webhook URL</div>
        <div className="flex gap-2">
          <input
            value={config.webhookUrl}
            onChange={e => setConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
            placeholder="https://hooks.zapier.com/hooks/catch/..."
            className="flex-1 bg-white/4 border border-white/8 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-sky-500/30 font-mono transition-colors"
          />
          {config.webhookUrl && (
            <button
              onClick={clearWebhook}
              title="Clear webhook"
              className="px-3 py-2 rounded-lg bg-red-500/6 border border-red-500/15 text-red-400/60 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3">Trigger Events</div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Toggle label="New Hire" checked={config.eventNewHire} onChange={v => setConfig(p => ({ ...p, eventNewHire: v }))} />
        <Toggle label="New Applicant" checked={config.eventNewApplicant} onChange={v => setConfig(p => ({ ...p, eventNewApplicant: v }))} />
        <Toggle label="New Contact Added" checked={config.eventNewContact} onChange={v => setConfig(p => ({ ...p, eventNewContact: v }))} />
        <Toggle label="Weekly Summary" checked={config.eventWeeklySummary} onChange={v => setConfig(p => ({ ...p, eventWeeklySummary: v }))} />
        <Toggle label="Applicant Stage Changed" checked={!!config.eventApplicantStageChanged} onChange={v => setConfig(p => ({ ...p, eventApplicantStageChanged: v }))} />
        <Toggle label="Deal Stage Changed" checked={!!config.eventDealStageChanged} onChange={v => setConfig(p => ({ ...p, eventDealStageChanged: v }))} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-400 text-xs font-mono uppercase tracking-wide hover:bg-sky-500/20 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
          {saved ? 'Saved' : 'Save Config'}
        </button>

        {config.webhookUrl && (
          <button
            onClick={testWebhook}
            disabled={testing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/4 border border-white/8 text-zinc-400 text-xs font-mono uppercase tracking-wide hover:bg-white/8 transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Send Test
          </button>
        )}

        {testResult && (
          <div className="flex items-center gap-2">
            {testResult.ok
              ? <CheckCircle className="w-3 h-3 text-sky-400" />
              : <AlertCircle className="w-3 h-3 text-red-400/70" />
            }
            <span className={`text-xs font-mono ${testResult.ok ? 'text-sky-400' : 'text-red-400/70'}`}>
              {testResult.msg}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function DiscordSection() {
  const [config, setConfig] = useState<WebhookConfig>({
    webhookUrl: '',
    eventNewHire: true,
    eventNewContact: false,
    eventWeeklySummary: false,
    eventNewApplicant: false,
    eventApplicantStageChanged: false,
    eventDealStageChanged: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/api/reporting/discord')
      .then(r => r.json())
      .then(d => {
        if (d.webhook) {
          setConfig({
            webhookUrl: d.webhook.webhookUrl ?? '',
            eventNewHire: d.webhook.eventNewHire ?? true,
            eventNewContact: d.webhook.eventNewContact ?? false,
            eventWeeklySummary: d.webhook.eventWeeklySummary ?? false,
            eventNewApplicant: d.webhook.eventNewApplicant ?? false,
            eventApplicantStageChanged: d.webhook.eventApplicantStageChanged ?? false,
            eventDealStageChanged: d.webhook.eventDealStageChanged ?? false,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch('/api/reporting/discord', {
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
      const r = await apiFetch('/api/reporting/discord/test', { method: 'POST' });
      const d = await r.json();
      if (r.ok) {
        const n = typeof d.previewCount === 'number' ? d.previewCount : 0;
        setTestResult({
          ok: true,
          msg: n > 0 ? `Sent ${n} sample ${n === 1 ? 'preview' : 'previews'}` : 'Connection verified · no events enabled',
        });
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
    await apiFetch('/api/reporting/discord', { method: 'DELETE' });
    setConfig({ webhookUrl: '', eventNewHire: true, eventNewContact: false, eventWeeklySummary: false, eventNewApplicant: false, eventApplicantStageChanged: false, eventDealStageChanged: false });
  };

  const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-[18px] rounded-full border transition-all ${checked ? 'bg-indigo-500/20 border-indigo-500/50' : 'bg-white/4 border-white/10'}`}
      >
        <div className={`absolute top-[2px] w-3 h-3 rounded-full transition-all ${checked ? 'left-[16px] bg-indigo-400' : 'left-[2px] bg-zinc-600'}`} />
      </div>
      <span className={`text-xs font-mono uppercase tracking-wide ${checked ? 'text-zinc-300' : 'text-zinc-600'}`}>{label}</span>
    </label>
  );

  if (loading) {
    return <div className="flex justify-center p-6"><Loader2 className="w-4 h-4 animate-spin text-zinc-500" /></div>;
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-6">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-3.5 h-3.5 text-indigo-400/70" />
        <span className="text-sm font-semibold text-zinc-200 uppercase tracking-widest font-mono">Discord Notifications</span>
      </div>
      <p className="text-xs text-zinc-600 mb-5 leading-relaxed">
        In Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy URL. Paste it here to push events straight to your channel.
      </p>

      <div className="mb-4">
        <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-2">Webhook URL</div>
        <div className="flex gap-2">
          <input
            value={config.webhookUrl}
            onChange={e => setConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
            placeholder="https://discord.com/api/webhooks/..."
            className="flex-1 bg-white/4 border border-white/8 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-indigo-500/30 font-mono transition-colors"
          />
          {config.webhookUrl && (
            <button
              onClick={clearWebhook}
              title="Clear webhook"
              className="px-3 py-2 rounded-lg bg-red-500/6 border border-red-500/15 text-red-400/60 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Trigger Events</div>
        <div className="text-[10px] font-mono text-zinc-700">Send Test previews every enabled event</div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Toggle label="New Hire" checked={config.eventNewHire} onChange={v => setConfig(p => ({ ...p, eventNewHire: v }))} />
        <Toggle label="New Applicant" checked={config.eventNewApplicant} onChange={v => setConfig(p => ({ ...p, eventNewApplicant: v }))} />
        <Toggle label="New Contact Added" checked={config.eventNewContact} onChange={v => setConfig(p => ({ ...p, eventNewContact: v }))} />
        <Toggle label="Weekly Summary" checked={config.eventWeeklySummary} onChange={v => setConfig(p => ({ ...p, eventWeeklySummary: v }))} />
        <Toggle label="Applicant Stage Changed" checked={!!config.eventApplicantStageChanged} onChange={v => setConfig(p => ({ ...p, eventApplicantStageChanged: v }))} />
        <Toggle label="Deal Stage Changed" checked={!!config.eventDealStageChanged} onChange={v => setConfig(p => ({ ...p, eventDealStageChanged: v }))} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-xs font-mono uppercase tracking-wide hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
          {saved ? 'Saved' : 'Save Config'}
        </button>

        {config.webhookUrl && (
          <button
            onClick={testWebhook}
            disabled={testing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/4 border border-white/8 text-zinc-400 text-xs font-mono uppercase tracking-wide hover:bg-white/8 transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Send Test
          </button>
        )}

        {testResult && (
          <div className="flex items-center gap-2">
            {testResult.ok
              ? <CheckCircle className="w-3 h-3 text-indigo-400" />
              : <AlertCircle className="w-3 h-3 text-red-400/70" />
            }
            <span className={`text-xs font-mono ${testResult.ok ? 'text-indigo-400' : 'text-red-400/70'}`}>
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
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [ads, setAds] = useState<AdCreative[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const { code: currencyCode } = useCurrency();

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Pull the core report plus live game-economy intel in parallel. The
    // wallet/ads feeds are best-effort — if either fails the page still
    // renders the report rather than erroring out.
    const [statsRes, walletRes, adsRes] = await Promise.allSettled([
      apiFetch('/api/reporting/stats').then(r => (r.ok ? r.json() : Promise.reject(new Error('stats')))),
      apiFetch('/api/wallet/snapshot').then(r => (r.ok ? r.json() : null)),
      apiFetch('/api/marketing/ads').then(r => (r.ok ? r.json() : null)),
    ]);
    if (statsRes.status === 'fulfilled') setStats(statsRes.value);
    else setError('Failed to load stats');
    // Reset best-effort feeds so stale values don't linger after a failed refresh.
    setWallet(walletRes.status === 'fulfilled' && walletRes.value ? walletRes.value : null);
    setAds(adsRes.status === 'fulfilled' && adsRes.value ? (adsRes.value.ads ?? []) : null);
    setLoading(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ----- Derived intel (computed from the live feeds, no extra backend) -----
  const pro = stats?.billing.totalProSubscribers ?? 0;
  const free = stats?.billing.totalFreeUsers ?? 0;
  const proConversion = pro + free > 0 ? (pro / (pro + free)) * 100 : 0;
  const hired = stats?.applicantsByStage.find(s => s.stage === 'hired')?.count ?? 0;
  const totalApp = stats?.summary.totalApplicants ?? 0;
  const hireRate = totalApp > 0 ? (hired / totalApp) * 100 : 0;
  const adsList = ads ?? [];
  const adsTotal = adsList.length;
  const nowMonth = new Date().toISOString().slice(0, 7);
  const adsThisMonth = adsList.filter(a => (a.createdAt ?? '').slice(0, 7) === nowMonth).length;
  const platformCounts = adsList.reduce<Record<string, number>>((acc, a) => {
    acc[a.platform] = (acc[a.platform] ?? 0) + 1;
    return acc;
  }, {});
  const earned = wallet?.bank?.earnedFiat ?? 0;
  const creditScore = wallet?.creditScore ?? 0;

  return (
    <div className="min-h-screen bg-[#09090b] px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-sky-400" />
          </div>
          <h1 className="font-['Share_Tech_Mono',monospace] text-base text-zinc-100 tracking-widest uppercase">
            {boomerMode ? 'Reporting' : 'Intel-9 Command Brief'}
          </h1>
          <button
            onClick={loadStats}
            disabled={loading}
            title="Refresh"
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/8 text-zinc-500 hover:text-zinc-300 text-xs font-mono transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <p className="text-xs text-zinc-600 font-mono ml-11">
          {boomerMode ? 'Business stats — hiring, contacts, projects' : 'Tactical overview · business intelligence feed'}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 mb-6 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-400/70" />
          <span className="text-xs font-mono text-red-400/70">{error}</span>
        </div>
      )}

      {loading && !stats ? (
        <div className="flex justify-center py-16">
          <div className="text-center">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-600 mx-auto mb-3" />
            <div className="text-xs font-mono text-zinc-700 uppercase tracking-widest">Loading...</div>
          </div>
        </div>
      ) : stats ? (
        <div className="flex flex-col gap-6">
          {/* Command ribbon — computed intel at a glance */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile
              label={boomerMode ? 'Treasury' : 'Earned Treasury'}
              value={`ƒ${fmtNum(earned)}`}
              icon={Wallet}
              accent="amber"
              sub={creditScore ? `${creditScore} credit` : undefined}
            />
            <KpiTile
              label="Pro Conversion"
              value={`${proConversion.toFixed(1)}%`}
              icon={TrendingUp}
              accent="emerald"
              sub={`${pro}/${pro + free} users`}
            />
            <KpiTile
              label="Hire Rate"
              value={`${hireRate.toFixed(0)}%`}
              icon={Target}
              accent="sky"
              sub={`${hired}/${totalApp} applicants`}
            />
            <KpiTile
              label={boomerMode ? 'Ads Created' : 'Ad Output'}
              value={fmtNum(adsTotal)}
              icon={Megaphone}
              accent="violet"
              trend={adsThisMonth > 0 ? { dir: 'up', text: `+${adsThisMonth} this mo` } : undefined}
              sub={adsThisMonth === 0 ? 'this month: 0' : undefined}
            />
          </div>

          {/* Hiring & Operations Stat Cards */}
          <div>
            <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3">Hiring & Operations</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Open Positions" value={stats.summary.openPositions} icon={Briefcase} />
              <StatCard label="Total Applicants" value={stats.summary.totalApplicants} icon={Users} sub="All time" />
              <StatCard label="Active Staff" value={stats.summary.activeStaff} icon={UserCheck} />
              <StatCard label="Hires This Month" value={stats.summary.hiresThisMonth} icon={UserCheck} sub="Current month" />
              <StatCard label="Contacts" value={stats.summary.totalContacts} icon={Users} />
              <StatCard label="Projects" value={stats.summary.activeProjects} icon={FolderOpen} />
            </div>
          </div>

          {/* Revenue / Billing Summary */}
          <div>
            <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3">Revenue & Subscriptions</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Est. MRR" value={formatFromUsd(stats.billing.estimatedMRR, { code: currencyCode })} icon={DollarSign} sub={`${formatFromUsd(stats.billing.pricePerMonth, { code: currencyCode })}/user/mo`} />
              <StatCard label="Pro Subscribers" value={stats.billing.totalProSubscribers} icon={TrendingUp} />
              <StatCard label="Free Users" value={stats.billing.totalFreeUsers} icon={Users} />
              <StatCard label="Upgrades This Mo." value={stats.billing.proUpgradesThisMonth} icon={TrendingUp} />
            </div>
          </div>

          <HiringPipelineChart data={stats.applicantsByStage} />
          <ActivityChart hiresPerMonth={stats.hiresPerMonth} applicantsPerMonth={stats.applicantsPerMonth} />

          {/* Marketing Output — live ad creatives generated by the marketing bots, by platform */}
          {adsTotal > 0 && (
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                  Marketing Output · Ad Creatives by Platform
                </div>
                <div className="text-[10px] font-mono text-violet-400/70 uppercase tracking-widest">
                  {adsTotal} total
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {Object.entries(platformCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([plat, count]) => {
                    const meta = PLATFORM_META[plat] ?? { label: plat, color: '#a1a1aa' };
                    const max = Math.max(...Object.values(platformCounts), 1);
                    const pct = (count / max) * 100;
                    return (
                      <div key={plat} className="flex items-center gap-3">
                        <div className="w-20 shrink-0 text-[10px] font-mono uppercase tracking-wide text-zinc-400">
                          {meta.label}
                        </div>
                        <div className="flex-1 h-5 rounded-md bg-white/[0.03] overflow-hidden">
                          <div
                            className="h-full rounded-md transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: meta.color, opacity: 0.7 }}
                          />
                        </div>
                        <div className="w-8 text-right text-xs font-mono text-zinc-300">{count}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          <ZapierSection />
          <DiscordSection />
        </div>
      ) : null}
    </div>
  );
}

export default function Reporting() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to access reporting and analytics." />;
  }

  return <ReportingContent />;
}
