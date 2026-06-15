import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import {
  Bot, Loader2, RefreshCw, Power, AlertCircle, Clock,
  Briefcase, Megaphone, PhoneCall, Calculator, ShieldCheck,
} from 'lucide-react';

type AutopilotDomain = 'business_ops' | 'marketing' | 'crm_calls' | 'accounting';

interface MarketingPrefs {
  platforms: string[];
  tone: string;
  topics: string[];
}

interface BusinessOpsPrefs {
  staffTarget: number;
  tasksPerTick: number;
  closeStaleTimeEntries: boolean;
  postAnnouncements: boolean;
  announcementIntervalHours: number;
}

interface CrmPrefs {
  leadStatuses: string[];
  followUpIntervalHours: number;
  maxFollowUpsPerTick: number;
}

interface AccountingPrefs {
  collections: boolean;
  billPayments: boolean;
  payroll: boolean;
  reminderCooldownDays: number;
  payrollPeriodDays: number;
}

interface DomainConfig {
  orgId: number;
  domain: AutopilotDomain;
  enabled: boolean;
  botId: number | null;
  cadenceMinutes: number | null;
  maxActionsPerTick: number | null;
  budgetCapCents: number | null;
  prefs: Record<string, unknown>;
  lastRunAt: string | null;
  exists: boolean;
  updatedBy: string | null;
}

interface OrgBot {
  id: number;
  name: string;
  status: string;
  department: string | null;
}

interface ActivityRow {
  id: number;
  domain: AutopilotDomain;
  botId: number | null;
  action: string;
  summary: string;
  outcome: string;
  createdAt: string;
}

interface AutopilotPayload {
  orgId: number;
  meta: Record<AutopilotDomain, { label: string; description: string }>;
  defaults: { cadenceMinutes: number; maxActionsPerTick: number };
  marketing: { tones: string[]; platforms: { id: string; label: string }[] };
  crm: { leadStatuses: { id: string; label: string }[] };
  domains: DomainConfig[];
  bots: OrgBot[];
  activity: ActivityRow[];
}

function readMarketingPrefs(prefs: Record<string, unknown>): MarketingPrefs {
  const platforms = Array.isArray(prefs.platforms)
    ? (prefs.platforms.filter((p) => typeof p === 'string') as string[])
    : [];
  const tone = typeof prefs.tone === 'string' ? prefs.tone : '';
  const topics = Array.isArray(prefs.topics)
    ? (prefs.topics.filter((t) => typeof t === 'string') as string[])
    : [];
  return { platforms, tone, topics };
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;

function readBusinessOpsPrefs(prefs: Record<string, unknown>): BusinessOpsPrefs {
  return {
    staffTarget: num(prefs.staffTarget, 5),
    tasksPerTick: num(prefs.tasksPerTick, 2),
    closeStaleTimeEntries: bool(prefs.closeStaleTimeEntries, true),
    postAnnouncements: bool(prefs.postAnnouncements, true),
    announcementIntervalHours: num(prefs.announcementIntervalHours, 6),
  };
}

function readCrmPrefs(prefs: Record<string, unknown>): CrmPrefs {
  const leadStatuses = Array.isArray(prefs.leadStatuses)
    ? (prefs.leadStatuses.filter((s) => typeof s === 'string') as string[])
    : [];
  return {
    leadStatuses,
    followUpIntervalHours: num(prefs.followUpIntervalHours, 24),
    maxFollowUpsPerTick: num(prefs.maxFollowUpsPerTick, 0),
  };
}

function readAccountingPrefs(prefs: Record<string, unknown>): AccountingPrefs {
  return {
    collections: bool(prefs.collections, true),
    billPayments: bool(prefs.billPayments, true),
    payroll: bool(prefs.payroll, true),
    reminderCooldownDays: num(prefs.reminderCooldownDays, 3),
    payrollPeriodDays: num(prefs.payrollPeriodDays, 28),
  };
}

// Shared bits so each editor stays compact and visually consistent.
const PREFS_HEADER_CLS = 'font-mono text-[9px] text-cyan-500/40 tracking-wider mb-3';
const LABEL_CLS = 'font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block';
const INPUT_CLS =
  'w-full px-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono focus:border-cyan-500/40 outline-none';
const SAVE_BTN_CLS =
  'flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-[10px] tracking-wider border bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-colors';

function ToggleRow({
  label,
  hint,
  value,
  busy,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  busy: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onChange(!value)}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded font-mono text-[10px] tracking-wider border transition-colors text-left ${
        value
          ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-200'
          : 'bg-[#080c12] border-cyan-500/15 text-cyan-500/40 hover:border-cyan-500/30'
      } ${busy ? 'opacity-50' : ''}`}
    >
      <span className="min-w-0">
        {label}
        {hint && <span className="block text-cyan-500/25 normal-case tracking-normal mt-0.5">{hint}</span>}
      </span>
      <span className="shrink-0">{value ? 'ON' : 'OFF'}</span>
    </button>
  );
}

function BusinessOpsPrefsEditor({
  cfg,
  busy,
  onSave,
}: {
  cfg: DomainConfig;
  busy: boolean;
  onSave: (prefs: BusinessOpsPrefs) => void;
}) {
  const initial = readBusinessOpsPrefs(cfg.prefs);
  const [staffTarget, setStaffTarget] = useState<number>(initial.staffTarget);
  const [tasksPerTick, setTasksPerTick] = useState<number>(initial.tasksPerTick);
  const [closeStaleTimeEntries, setCloseStale] = useState<boolean>(initial.closeStaleTimeEntries);
  const [postAnnouncements, setPostAnnouncements] = useState<boolean>(initial.postAnnouncements);
  const [announcementIntervalHours, setAnnouncementInterval] = useState<number>(initial.announcementIntervalHours);

  useEffect(() => {
    const next = readBusinessOpsPrefs(cfg.prefs);
    setStaffTarget(next.staffTarget);
    setTasksPerTick(next.tasksPerTick);
    setCloseStale(next.closeStaleTimeEntries);
    setPostAnnouncements(next.postAnnouncements);
    setAnnouncementInterval(next.announcementIntervalHours);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.prefs]);

  return (
    <div className="mt-4 pt-4 border-t border-cyan-500/10">
      <p className={PREFS_HEADER_CLS}>OPERATING PREFERENCES — steer how the office is run.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={LABEL_CLS}>
            TASKS ADVANCED / TICK <span className="text-cyan-500/25">(1–20)</span>
          </label>
          <input
            type="number"
            min={1}
            max={20}
            disabled={busy}
            value={tasksPerTick}
            onChange={(e) => setTasksPerTick(Number(e.target.value))}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>
            STAFFING FLOOR <span className="text-cyan-500/25">(0–100, hire when below)</span>
          </label>
          <input
            type="number"
            min={0}
            max={100}
            disabled={busy}
            value={staffTarget}
            onChange={(e) => setStaffTarget(Number(e.target.value))}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>
            ANNOUNCE EVERY (HRS) <span className="text-cyan-500/25">(1–168)</span>
          </label>
          <input
            type="number"
            min={1}
            max={168}
            disabled={busy}
            value={announcementIntervalHours}
            onChange={(e) => setAnnouncementInterval(Number(e.target.value))}
            className={INPUT_CLS}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ToggleRow
          label="CLOSE STALE TIME ENTRIES"
          hint="auto-close prior-day clock-ins"
          value={closeStaleTimeEntries}
          busy={busy}
          onChange={setCloseStale}
        />
        <ToggleRow
          label="POST ANNOUNCEMENTS"
          hint="routine operational updates"
          value={postAnnouncements}
          busy={busy}
          onChange={setPostAnnouncements}
        />
      </div>

      <div className="flex justify-end mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({ staffTarget, tasksPerTick, closeStaleTimeEntries, postAnnouncements, announcementIntervalHours })}
          className={`${SAVE_BTN_CLS} ${busy ? 'opacity-50' : ''}`}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Briefcase className="w-3 h-3" />}
          SAVE PREFERENCES
        </button>
      </div>
    </div>
  );
}

function CrmPrefsEditor({
  cfg,
  options,
  busy,
  onSave,
}: {
  cfg: DomainConfig;
  options: { leadStatuses: { id: string; label: string }[] };
  busy: boolean;
  onSave: (prefs: CrmPrefs) => void;
}) {
  const initial = readCrmPrefs(cfg.prefs);
  const [leadStatuses, setLeadStatuses] = useState<string[]>(initial.leadStatuses);
  const [followUpIntervalHours, setInterval] = useState<number>(initial.followUpIntervalHours);
  const [maxFollowUpsPerTick, setMaxPerTick] = useState<number>(initial.maxFollowUpsPerTick);

  useEffect(() => {
    const next = readCrmPrefs(cfg.prefs);
    setLeadStatuses(next.leadStatuses);
    setInterval(next.followUpIntervalHours);
    setMaxPerTick(next.maxFollowUpsPerTick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.prefs]);

  const toggleStatus = (id: string) => {
    setLeadStatuses((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  return (
    <div className="mt-4 pt-4 border-t border-cyan-500/10">
      <p className={PREFS_HEADER_CLS}>FOLLOW-UP PREFERENCES — steer which leads the bot works, and how often.</p>

      <div className="mb-3">
        <label className={LABEL_CLS}>
          PIPELINE STAGES <span className="text-cyan-500/25">(none = all in-play stages)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {options.leadStatuses.map((s) => {
            const on = leadStatuses.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => toggleStatus(s.id)}
                className={`px-2.5 py-1 rounded font-mono text-[10px] tracking-wider border transition-colors ${
                  on
                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200'
                    : 'bg-[#080c12] border-cyan-500/15 text-cyan-500/40 hover:border-cyan-500/30'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>
            FOLLOW-UP COOLDOWN (HRS) <span className="text-cyan-500/25">(1–720)</span>
          </label>
          <input
            type="number"
            min={1}
            max={720}
            disabled={busy}
            value={followUpIntervalHours}
            onChange={(e) => setInterval(Number(e.target.value))}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>
            MAX LEADS / TICK <span className="text-cyan-500/25">(0 = action-cap only)</span>
          </label>
          <input
            type="number"
            min={0}
            max={50}
            disabled={busy}
            value={maxFollowUpsPerTick}
            onChange={(e) => setMaxPerTick(Number(e.target.value))}
            className={INPUT_CLS}
          />
        </div>
      </div>

      <div className="flex justify-end mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({ leadStatuses, followUpIntervalHours, maxFollowUpsPerTick })}
          className={`${SAVE_BTN_CLS} ${busy ? 'opacity-50' : ''}`}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <PhoneCall className="w-3 h-3" />}
          SAVE PREFERENCES
        </button>
      </div>
    </div>
  );
}

function AccountingPrefsEditor({
  cfg,
  busy,
  onSave,
}: {
  cfg: DomainConfig;
  busy: boolean;
  onSave: (prefs: AccountingPrefs) => void;
}) {
  const initial = readAccountingPrefs(cfg.prefs);
  const [collections, setCollections] = useState<boolean>(initial.collections);
  const [billPayments, setBillPayments] = useState<boolean>(initial.billPayments);
  const [payroll, setPayroll] = useState<boolean>(initial.payroll);
  const [reminderCooldownDays, setReminderCooldown] = useState<number>(initial.reminderCooldownDays);
  const [payrollPeriodDays, setPayrollPeriod] = useState<number>(initial.payrollPeriodDays);

  useEffect(() => {
    const next = readAccountingPrefs(cfg.prefs);
    setCollections(next.collections);
    setBillPayments(next.billPayments);
    setPayroll(next.payroll);
    setReminderCooldown(next.reminderCooldownDays);
    setPayrollPeriod(next.payrollPeriodDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.prefs]);

  return (
    <div className="mt-4 pt-4 border-t border-cyan-500/10">
      <p className={PREFS_HEADER_CLS}>CFO PREFERENCES — choose which books duties the bot runs.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <ToggleRow
          label="COLLECTIONS"
          hint="chase overdue invoices"
          value={collections}
          busy={busy}
          onChange={setCollections}
        />
        <ToggleRow
          label="BILL PAYMENTS"
          hint="pay due bills when cash covers"
          value={billPayments}
          busy={busy}
          onChange={setBillPayments}
        />
        <ToggleRow
          label="PAYROLL"
          hint="run payroll each period"
          value={payroll}
          busy={busy}
          onChange={setPayroll}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>
            REMINDER COOLDOWN (DAYS) <span className="text-cyan-500/25">(1–60)</span>
          </label>
          <input
            type="number"
            min={1}
            max={60}
            disabled={busy}
            value={reminderCooldownDays}
            onChange={(e) => setReminderCooldown(Number(e.target.value))}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>
            PAYROLL PERIOD (DAYS) <span className="text-cyan-500/25">(7–90)</span>
          </label>
          <input
            type="number"
            min={7}
            max={90}
            disabled={busy}
            value={payrollPeriodDays}
            onChange={(e) => setPayrollPeriod(Number(e.target.value))}
            className={INPUT_CLS}
          />
        </div>
      </div>

      <div className="flex justify-end mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSave({ collections, billPayments, payroll, reminderCooldownDays, payrollPeriodDays })
          }
          className={`${SAVE_BTN_CLS} ${busy ? 'opacity-50' : ''}`}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calculator className="w-3 h-3" />}
          SAVE PREFERENCES
        </button>
      </div>
    </div>
  );
}

function MarketingPrefsEditor({
  cfg,
  options,
  busy,
  onSave,
}: {
  cfg: DomainConfig;
  options: { tones: string[]; platforms: { id: string; label: string }[] };
  busy: boolean;
  onSave: (prefs: MarketingPrefs) => void;
}) {
  const initial = readMarketingPrefs(cfg.prefs);
  const [platforms, setPlatforms] = useState<string[]>(initial.platforms);
  const [tone, setTone] = useState<string>(initial.tone || (options.tones[0] ?? 'professional'));
  const [topicsText, setTopicsText] = useState<string>(initial.topics.join('\n'));

  // Re-sync local state if the server view changes (e.g. after a refresh).
  useEffect(() => {
    const next = readMarketingPrefs(cfg.prefs);
    setPlatforms(next.platforms);
    setTone(next.tone || (options.tones[0] ?? 'professional'));
    setTopicsText(next.topics.join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.prefs]);

  const togglePlatform = (id: string) => {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const save = () => {
    const topics = topicsText
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    onSave({ platforms, tone, topics });
  };

  return (
    <div className="mt-4 pt-4 border-t border-cyan-500/10">
      <p className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-3">
        POSTING PREFERENCES — steer what the bot posts and where.
      </p>

      <div className="mb-3">
        <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1.5 block">
          ALLOWED PLATFORMS <span className="text-cyan-500/25">(none = rotate connected accounts)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {options.platforms.map((p) => {
            const on = platforms.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => togglePlatform(p.id)}
                className={`px-2.5 py-1 rounded font-mono text-[10px] tracking-wider border transition-colors ${
                  on
                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200'
                    : 'bg-[#080c12] border-cyan-500/15 text-cyan-500/40 hover:border-cyan-500/30'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">TONE</label>
          <select
            disabled={busy}
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="w-full px-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono focus:border-cyan-500/40 outline-none appearance-none capitalize"
          >
            {options.tones.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">
            TOPICS / THEMES <span className="text-cyan-500/25">(one per line)</span>
          </label>
          <textarea
            disabled={busy}
            value={topicsText}
            onChange={(e) => setTopicsText(e.target.value)}
            rows={3}
            placeholder={'e.g. Summer sale\nNew product launch\nCustomer stories'}
            className="w-full px-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono focus:border-cyan-500/40 outline-none resize-y"
          />
        </div>
      </div>

      <div className="flex justify-end mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-[10px] tracking-wider border bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-colors ${
            busy ? 'opacity-50' : ''
          }`}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Megaphone className="w-3 h-3" />}
          SAVE PREFERENCES
        </button>
      </div>
    </div>
  );
}

const DOMAIN_ICON: Record<AutopilotDomain, typeof Bot> = {
  business_ops: Briefcase,
  marketing: Megaphone,
  crm_calls: PhoneCall,
  accounting: Calculator,
};

const AUTOPILOT_DOMAIN_ORDER: AutopilotDomain[] = ['business_ops', 'marketing', 'crm_calls', 'accounting'];

const OUTCOME_STYLE: Record<string, { text: string; label: string }> = {
  success: { text: 'text-green-400', label: 'SUCCESS' },
  noop: { text: 'text-cyan-500/50', label: 'NO-OP' },
  blocked: { text: 'text-amber-400', label: 'BLOCKED' },
  error: { text: 'text-red-400', label: 'ERROR' },
};

function fmtTime(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Compact "live feed" relative time: 12s, 4m, 3h, 2d, then a date. */
function fmtRelative(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const secs = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtTime(iso);
}

const ACTIVITY_POLL_MS = 15000;
const ACTIVITY_PAGE_SIZE = 50;

export default function Autopilot() {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<AutopilotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingDomain, setSavingDomain] = useState<AutopilotDomain | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityFilter, setActivityFilter] = useState<AutopilotDomain | 'all'>('all');
  const [activityRefreshing, setActivityRefreshing] = useState(false);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);

  // Pause live polling once the user has paged into older history, so a refresh
  // doesn't snap the feed back to the latest page and discard what they loaded.
  const paginatedRef = useRef(false);
  paginatedRef.current = activity.length > ACTIVITY_PAGE_SIZE;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/autopilot');
      if (res.status === 401) {
        setError('Sign in required.');
        setData(null);
        return;
      }
      if (res.status === 403) {
        setError('You need owner or manager access to manage autopilot.');
        setData(null);
        return;
      }
      if (res.status === 404) {
        setError('You are not part of an organization yet.');
        setData(null);
        return;
      }
      if (!res.ok) {
        setError('Failed to load autopilot.');
        setData(null);
        return;
      }
      const payload: AutopilotPayload = await res.json();
      setData(payload);
      const rows = payload.activity ?? [];
      setActivity(rows);
      setActivityHasMore(rows.length >= ACTIVITY_PAGE_SIZE);
      setLastActivityAt(Date.now());
    } catch {
      setError('Network error.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch just the activity feed (filtered), used for live polling and filter
  // changes — keeps the control surface above untouched.
  const loadActivity = useCallback(
    async (filter: AutopilotDomain | 'all') => {
      setActivityRefreshing(true);
      try {
        const params = new URLSearchParams({ limit: String(ACTIVITY_PAGE_SIZE) });
        if (filter !== 'all') params.set('domain', filter);
        const res = await apiFetch(`/autopilot/activity?${params.toString()}`);
        if (!res.ok) return;
        const payload: { activity?: ActivityRow[]; hasMore?: boolean } = await res.json();
        const rows = payload.activity ?? [];
        setActivity(rows);
        setActivityHasMore(payload.hasMore ?? rows.length >= ACTIVITY_PAGE_SIZE);
        setLastActivityAt(Date.now());
      } catch {
        // Silent — polling failures shouldn't surface as page errors.
      } finally {
        setActivityRefreshing(false);
      }
    },
    []
  );

  // Append the next page of older entries past the oldest one currently shown,
  // using its id as a backwards cursor. Respects the active domain filter.
  const loadMoreActivity = useCallback(async () => {
    if (activityLoadingMore) return;
    const oldest = activity[activity.length - 1];
    if (!oldest) return;
    setActivityLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: String(ACTIVITY_PAGE_SIZE),
        before: String(oldest.id),
      });
      if (activityFilter !== 'all') params.set('domain', activityFilter);
      const res = await apiFetch(`/autopilot/activity?${params.toString()}`);
      if (!res.ok) return;
      const payload: { activity?: ActivityRow[]; hasMore?: boolean } = await res.json();
      const rows = payload.activity ?? [];
      setActivity((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      setActivityHasMore(payload.hasMore ?? rows.length >= ACTIVITY_PAGE_SIZE);
    } catch {
      // Silent — failures leave the existing feed intact.
    } finally {
      setActivityLoadingMore(false);
    }
  }, [activity, activityFilter, activityLoadingMore]);

  useEffect(() => {
    if (isAuthenticated) void load();
    else setLoading(false);
  }, [isAuthenticated, load]);

  // Refetch the feed whenever the domain filter changes (after the first load).
  useEffect(() => {
    if (!data) return;
    void loadActivity(activityFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityFilter]);

  // Live polling: keep the activity feed fresh while the page is open and visible.
  useEffect(() => {
    if (!isAuthenticated || !data) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !paginatedRef.current) {
        void loadActivity(activityFilter);
      }
    }, ACTIVITY_POLL_MS);
    return () => window.clearInterval(id);
  }, [isAuthenticated, data, activityFilter, loadActivity]);

  // Tick once a minute so relative timestamps ("4m ago") stay current.
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const patchDomain = useCallback(
    async (domain: AutopilotDomain, body: Record<string, unknown>) => {
      setSavingDomain(domain);
      try {
        const res = await apiFetch(`/autopilot/${domain}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          setError('Could not save that change.');
          return;
        }
        await load();
      } catch {
        setError('Network error while saving.');
      } finally {
        setSavingDomain(null);
      }
    },
    [load]
  );

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to manage autopilot." />;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-cyan-100 px-4 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-mono text-base text-cyan-300 tracking-widest flex items-center gap-2">
            <Bot className="w-5 h-5" /> AGENT AUTOPILOT
          </h1>
          <p className="font-mono text-[10px] text-cyan-500/40 tracking-wider mt-1">
            Assign a Pixel Agent to run a business domain on its own. OFF = fully manual, exactly as today.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400/80 font-mono text-[10px] tracking-wider hover:bg-cyan-500/20 transition-colors rounded"
        >
          <RefreshCw className="w-3 h-3" /> REFRESH
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-amber-500/10 border border-amber-500/20 rounded text-amber-400 text-xs font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {data && (
        <>
          <div className="flex items-start gap-2 px-3 py-2 mb-4 bg-cyan-500/[0.04] border border-cyan-500/15 rounded text-cyan-500/50 text-[10px] font-mono leading-relaxed">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400/60" />
            Autopilot only does what a human in the same seat could do, and respects entitlement, credit, and
            per-tick limits. Automated behavior for each domain is being rolled out — toggling ON now just arms the
            scheduler and logs activity below.
          </div>

          <div className="space-y-3">
            {data.domains.map((cfg) => {
              const Icon = DOMAIN_ICON[cfg.domain];
              const meta = data.meta[cfg.domain];
              const busy = savingDomain === cfg.domain;
              return (
                <div key={cfg.domain} className="bg-[#0c1018] border border-cyan-500/15 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-cyan-400/80" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-mono text-xs text-cyan-300 tracking-wider">{meta?.label ?? cfg.domain}</h3>
                        <p className="font-mono text-[9px] text-cyan-500/40 leading-relaxed mt-0.5">
                          {meta?.description}
                        </p>
                      </div>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() => void patchDomain(cfg.domain, { enabled: !cfg.enabled })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-[10px] tracking-wider border transition-colors shrink-0 ${
                        cfg.enabled
                          ? 'bg-green-500/15 border-green-500/30 text-green-400 hover:bg-green-500/25'
                          : 'bg-[#080c12] border-cyan-500/15 text-cyan-500/40 hover:border-cyan-500/30'
                      } ${busy ? 'opacity-50' : ''}`}
                    >
                      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                      {cfg.enabled ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                    <div>
                      <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">
                        ASSIGNED AGENT
                      </label>
                      <select
                        disabled={busy}
                        value={cfg.botId ?? ''}
                        onChange={(e) =>
                          void patchDomain(cfg.domain, {
                            botId: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono focus:border-cyan-500/40 outline-none appearance-none"
                      >
                        <option value="">— none —</option>
                        {data.bots.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                            {b.department ? ` · ${b.department}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">
                        CADENCE (MIN)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={1440}
                        disabled={busy}
                        defaultValue={cfg.cadenceMinutes ?? data.defaults.cadenceMinutes}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== (cfg.cadenceMinutes ?? data.defaults.cadenceMinutes)) {
                            void patchDomain(cfg.domain, { cadenceMinutes: v });
                          }
                        }}
                        className="w-full px-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono focus:border-cyan-500/40 outline-none"
                      />
                    </div>
                    <div>
                      <label className="font-mono text-[9px] text-cyan-500/40 tracking-wider mb-1 block">
                        MAX ACTIONS / TICK
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        disabled={busy}
                        defaultValue={cfg.maxActionsPerTick ?? data.defaults.maxActionsPerTick}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== (cfg.maxActionsPerTick ?? data.defaults.maxActionsPerTick)) {
                            void patchDomain(cfg.domain, { maxActionsPerTick: v });
                          }
                        }}
                        className="w-full px-3 py-2 bg-[#080c12] border border-cyan-500/15 rounded text-cyan-300/80 text-xs font-mono focus:border-cyan-500/40 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mt-3 font-mono text-[9px] text-cyan-500/35">
                    <Clock className="w-3 h-3" /> last run: {fmtTime(cfg.lastRunAt)}
                  </div>

                  {cfg.domain === 'marketing' && (
                    <MarketingPrefsEditor
                      cfg={cfg}
                      options={data.marketing}
                      busy={busy}
                      onSave={(prefs) => void patchDomain(cfg.domain, { prefs })}
                    />
                  )}
                  {cfg.domain === 'business_ops' && (
                    <BusinessOpsPrefsEditor
                      cfg={cfg}
                      busy={busy}
                      onSave={(prefs) => void patchDomain(cfg.domain, { prefs })}
                    />
                  )}
                  {cfg.domain === 'crm_calls' && (
                    <CrmPrefsEditor
                      cfg={cfg}
                      options={data.crm}
                      busy={busy}
                      onSave={(prefs) => void patchDomain(cfg.domain, { prefs })}
                    />
                  )}
                  {cfg.domain === 'accounting' && (
                    <AccountingPrefsEditor
                      cfg={cfg}
                      busy={busy}
                      onSave={(prefs) => void patchDomain(cfg.domain, { prefs })}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <h2 className="font-mono text-[11px] text-cyan-400/80 tracking-widest flex items-center gap-2">
                ACTIVITY LOG
                <span className="flex items-center gap-1 text-[8px] text-green-400/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400/80 animate-pulse" /> LIVE
                </span>
              </h2>
              <span className="font-mono text-[8px] text-cyan-500/30 flex items-center gap-1">
                {activityRefreshing && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                {lastActivityAt ? `updated ${fmtRelative(new Date(lastActivityAt).toISOString())}` : ''}
              </span>
            </div>

            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {(['all', ...AUTOPILOT_DOMAIN_ORDER] as const).map((f) => {
                const active = activityFilter === f;
                const label = f === 'all' ? 'ALL' : (data.meta[f]?.label ?? f).toUpperCase();
                return (
                  <button
                    key={f}
                    onClick={() => setActivityFilter(f)}
                    className={`px-2.5 py-1 rounded font-mono text-[9px] tracking-wider border transition-colors ${
                      active
                        ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200'
                        : 'bg-[#080c12] border-cyan-500/15 text-cyan-500/40 hover:border-cyan-500/30'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="bg-[#0c1018] border border-cyan-500/15 rounded-lg divide-y divide-cyan-500/10">
              {activity.length === 0 && (
                <div className="px-4 py-6 text-center font-mono text-[10px] text-cyan-500/30">
                  {activityFilter === 'all'
                    ? 'No autopilot activity yet.'
                    : `No ${(data.meta[activityFilter]?.label ?? activityFilter)} activity yet.`}
                </div>
              )}
              {activity.map((row) => {
                const oc = OUTCOME_STYLE[row.outcome] ?? { text: 'text-cyan-500/50', label: row.outcome.toUpperCase() };
                const meta = data.meta[row.domain];
                return (
                  <div key={row.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className={`font-mono text-[9px] tracking-wider w-16 shrink-0 ${oc.text}`}>{oc.label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] text-cyan-200/80 leading-snug">{row.summary}</p>
                      <p className="font-mono text-[9px] text-cyan-500/35 mt-0.5">
                        {meta?.label ?? row.domain} · {row.action} ·{' '}
                        <span title={fmtTime(row.createdAt)}>{fmtRelative(row.createdAt)}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {activityHasMore && activity.length > 0 && (
              <div className="mt-2 flex justify-center">
                <button
                  onClick={() => void loadMoreActivity()}
                  disabled={activityLoadingMore}
                  className="px-3 py-1.5 rounded font-mono text-[9px] tracking-wider border border-cyan-500/20 bg-[#080c12] text-cyan-400/60 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {activityLoadingMore && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  {activityLoadingMore ? 'LOADING…' : 'LOAD OLDER'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
