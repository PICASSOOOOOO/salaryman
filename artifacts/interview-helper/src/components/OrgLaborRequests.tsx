import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HardHat, Map, Loader2, RefreshCw, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp, AlertCircle, Plus, X, FileText,
  Users, ChevronLeft, ChevronRight, Zap, TrendingUp,
  Search, ChevronsUpDown,
} from 'lucide-react';

/**
 * ORG LABOR REQUESTS — admin management panel
 *
 * Lets an org admin discover, enable, or cancel their "open to debtor labor"
 * requests without direct API calls. Shows two sections:
 *
 *   CONSTRUCTION PROJECTS — the admin's own building projects. They can
 *     associate each with their org and flip openToDebtorLabor on/off.
 *
 *   WORLD-BUILD PLANS — org-owned blueprint plans. The admin can toggle
 *     openToDebtorLabor on any plan their org owns.
 *
 * Status badge: "OPEN TO CF LABOR" (cyan) or "PRIVATE" (muted).
 */

type ConstructionProject = {
  id: number;
  label: string;
  buildingType: string;
  status: string;
  progress: number;
  laborRequired: number;
  laborApplied: number;
  owningOrgId: string | null;
  owningOrgName: string | null;
  openToDebtorLabor: boolean;
  debtorShifts: number;
};

type LaborerRow = {
  laborerId: string;
  displayName: string;
  shifts: number;
  totalUnits: number;
  totalReward: number;
  lastShiftAt: string;
};

type LaborSummary = {
  totalShifts: number;
  debtorShifts: number;
  totalUnits: number;
  totalDebtForgiven: number;
  laborers: LaborerRow[];
  page: number;
  totalPages: number;
  totalDebtorLaborers: number;
  matchedLaborers: number;
};

type LaborSort = 'recent' | 'shifts' | 'debt';
type LaborDir = 'asc' | 'desc';

type SummaryState = {
  loading: boolean;
  data: LaborSummary | null;
  error: string | null;
  page: number;
  q: string;
  sort: LaborSort;
  dir: LaborDir;
};

type PlanLaborerRow = {
  laborerId: string;
  displayName: string;
  shifts: number;
  totalReward: number;
  lastShiftAt: string;
};

type PlanLaborSummary = {
  debtorShifts: number;
  totalDebtForgiven: number;
  totalDebtorLaborers: number;
  matchedLaborers: number;
  laborers: PlanLaborerRow[];
  page: number;
  totalPages: number;
};

type PlanSummaryState = {
  loading: boolean;
  data: PlanLaborSummary | null;
  error: string | null;
  page: number;
  cachedAt?: number; // epoch ms of the most recent successful (foreground or background) fetch
  q: string;
  sort: LaborSort;
  dir: LaborDir;
};

type LaborStatWindow = { shifts: number; debtForgiven: number; uniqueLaborers: number };
type OrgLaborSummary = {
  orgId: number;
  orgName: string;
  allTime: LaborStatWindow;
  week: LaborStatWindow;
  cachedAt?: number; // epoch ms when the server cached this result
};

type WorldBuildPlan = {
  id: number;
  title: string;
  region: string;
  status: string;
  tasks: { id: string; completed?: boolean }[];
  rewardPerTask: number;
  owningOrgId: string | null;
  owningOrgName: string | null;
  openToDebtorLabor: boolean;
  contributorCount: number;
};

// Compact "time since last refresh" label, e.g. JUST NOW / 12S AGO / 3M AGO.
function formatUpdatedAgo(cachedAt: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - cachedAt) / 1000));
  if (secs < 5) return 'JUST NOW';
  if (secs < 60) return `${secs}S AGO`;
  return `${Math.floor(secs / 60)}M AGO`;
}

const STATUS_LABEL: Record<string, string> = {
  designing: 'DESIGNING',
  queued: 'QUEUED',
  in_progress: 'IN PROGRESS',
  complete: 'COMPLETE',
  cancelled: 'CANCELLED',
};

const STATUS_COLOR: Record<string, string> = {
  designing: 'text-amber-400',
  queued: 'text-sky-400',
  in_progress: 'text-emerald-400',
  complete: 'text-muted-foreground',
  cancelled: 'text-red-400',
};

const PLAN_STATUS_COLOR: Record<string, string> = {
  draft: 'text-amber-400',
  active: 'text-emerald-400',
  completed: 'text-muted-foreground',
  archived: 'text-red-400',
};

function LaborBadge({ open }: { open: boolean }) {
  return open ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
      OPEN TO CF LABOR
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-muted/20 border border-border/30 text-muted-foreground">
      PRIVATE
    </span>
  );
}

/** Debounced name-search box for a laborer breakdown table. */
function LaborSearchBar({
  serverQ,
  onSearchChange,
}: {
  serverQ: string;
  onSearchChange: (q: string) => void;
}) {
  const [text, setText] = useState(serverQ);
  const onSearchRef = useRef(onSearchChange);
  onSearchRef.current = onSearchChange;
  const serverQRef = useRef(serverQ);
  serverQRef.current = serverQ;

  // Debounce: only fire when the trimmed input differs from the server's query.
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== serverQRef.current) onSearchRef.current(text.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <div className="relative">
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50 pointer-events-none" />
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="SEARCH LABORER BY NAME..."
        className="w-full pl-7 pr-7 py-1.5 rounded-md bg-background/50 border border-border/40 text-[9px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/40 uppercase tracking-wider"
      />
      {text && (
        <button
          onClick={() => setText('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

/** A clickable, sortable column header cell (right-aligned). */
function SortHeaderCell({
  label,
  col,
  sort,
  dir,
  onSortChange,
}: {
  label: string;
  col: LaborSort;
  sort: LaborSort;
  dir: LaborDir;
  onSortChange: (col: LaborSort) => void;
}) {
  const active = sort === col;
  return (
    <button
      onClick={() => onSortChange(col)}
      className={`flex items-center gap-0.5 justify-end text-[8px] font-bold uppercase tracking-widest transition-colors ${
        active ? 'text-cyan-400' : 'text-muted-foreground/60 hover:text-muted-foreground'
      }`}
    >
      <span>{label}</span>
      {active ? (
        dir === 'desc' ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronUp className="w-2.5 h-2.5" />
      ) : (
        <ChevronsUpDown className="w-2.5 h-2.5 opacity-40" />
      )}
    </button>
  );
}

/** Prev/next pagination footer. */
function PaginationFooter({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/20 bg-muted/5">
      <span className="text-[8px] text-muted-foreground/50 tabular-nums uppercase tracking-wider">
        PAGE {page} / {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-0.5 rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-0.5 rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function LaborBreakdown({
  summary,
  onPageChange,
  onSearchChange,
  onSortChange,
}: {
  summary: SummaryState | undefined;
  onPageChange: (page: number) => void;
  onSearchChange: (q: string) => void;
  onSortChange: (col: LaborSort) => void;
}) {
  // Only show the full-panel spinner on the very first load (no data yet).
  // While paging to another page the carry-over data (summary.data) is kept,
  // so we keep the previous page's rows visible instead of flashing an empty
  // loading state — the table just shows a small inline "updating" cue.
  if (!summary || (summary.loading && !summary.data)) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
        <span className="text-[9px] text-muted-foreground/60">LOADING LABOR BREAKDOWN...</span>
      </div>
    );
  }

  const { data } = summary;
  const hasQuery = !!summary.q;

  // No labor logged at all and no active search → clean empty state.
  if (!summary.loading && !summary.error && data && data.totalDebtorLaborers === 0 && !hasQuery) {
    return (
      <div className="py-2 flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-muted-foreground/30" />
        <span className="text-[9px] text-muted-foreground/50">NO DEBTOR SHIFTS LOGGED YET</span>
      </div>
    );
  }

  // Hard error with nothing to show.
  if (summary.error && !data) {
    return (
      <div className="flex items-start gap-1.5 py-1">
        <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
        <span className="text-[9px] text-red-400 font-bold">{summary.error}</span>
      </div>
    );
  }

  const matched = data?.matchedLaborers ?? 0;
  const headerCount = hasQuery ? matched : (data?.totalDebtorLaborers ?? 0);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Users className="w-3 h-3 text-cyan-400" />
        <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest">
          DEBTOR LABOR BREAKDOWN — {headerCount} {hasQuery ? 'MATCH' : 'LABORER'}{headerCount !== 1 ? (hasQuery ? 'ES' : 'S') : ''}
        </span>
        {summary.loading && (
          <Loader2 className="w-3 h-3 animate-spin text-cyan-400/70" />
        )}
      </div>

      <LaborSearchBar serverQ={summary.q} onSearchChange={onSearchChange} />

      <div className="rounded-lg border border-border/30 overflow-hidden bg-background/30">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 py-1.5 border-b border-border/20 bg-muted/10">
          <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-widest">LABORER</span>
          <SortHeaderCell label="SHIFTS" col="shifts" sort={summary.sort} dir={summary.dir} onSortChange={onSortChange} />
          <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-widest text-right">UNITS</span>
          <SortHeaderCell label="DEBT FORGIVEN" col="debt" sort={summary.sort} dir={summary.dir} onSortChange={onSortChange} />
        </div>

        {/* Laborer rows */}
        <div className="max-h-48 overflow-y-auto divide-y divide-border/15">
          {summary.loading && !data ? (
            <div className="flex items-center gap-2 px-3 py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              <span className="text-[9px] text-muted-foreground/60">LOADING...</span>
            </div>
          ) : data && data.laborers.length === 0 ? (
            <div className="px-3 py-3 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground/30" />
              <span className="text-[9px] text-muted-foreground/50">
                NO LABORERS MATCH “{summary.q}”
              </span>
            </div>
          ) : (
            (data?.laborers ?? []).map((row) => {
              const lastDate = row.lastShiftAt
                ? new Date(row.lastShiftAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                : '—';
              return (
                <div
                  key={row.laborerId}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 py-2 hover:bg-muted/10 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold text-foreground truncate">{row.displayName}</div>
                    <div className="text-[8px] text-muted-foreground/50 tabular-nums">LAST: {lastDate}</div>
                  </div>
                  <span className="text-[9px] font-bold text-cyan-400 tabular-nums text-right self-center">
                    {row.shifts}
                  </span>
                  <span className="text-[9px] text-foreground tabular-nums text-right self-center">
                    {row.totalUnits}
                  </span>
                  <span className="text-[9px] font-bold text-emerald-400 tabular-nums text-right self-center">
                    ƒ{row.totalReward.toLocaleString()}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {data && <PaginationFooter page={data.page} totalPages={data.totalPages} onPageChange={onPageChange} />}
      </div>
    </div>
  );
}

function PlanLaborBreakdown({
  summary,
  onPageChange,
  onSearchChange,
  onSortChange,
}: {
  summary: PlanSummaryState | undefined;
  onPageChange: (page: number) => void;
  onSearchChange: (q: string) => void;
  onSortChange: (col: LaborSort) => void;
}) {
  if (!summary) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
        <span className="text-[9px] text-muted-foreground/60">LOADING LABOR BREAKDOWN...</span>
      </div>
    );
  }

  const { data } = summary;
  const hasQuery = !!summary.q;

  if (!summary.loading && !summary.error && data && data.totalDebtorLaborers === 0 && !hasQuery) {
    return (
      <div className="py-2 flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-muted-foreground/30" />
        <span className="text-[9px] text-muted-foreground/50">NO DEBTOR SHIFTS LOGGED YET</span>
      </div>
    );
  }

  if (summary.error && !data) {
    return (
      <div className="flex items-start gap-1.5 py-1">
        <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
        <span className="text-[9px] text-red-400 font-bold">{summary.error}</span>
      </div>
    );
  }

  const matched = data?.matchedLaborers ?? 0;
  const headerCount = hasQuery ? matched : (data?.totalDebtorLaborers ?? 0);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Users className="w-3 h-3 text-cyan-400" />
        <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest">
          DEBTOR LABOR BREAKDOWN — {headerCount} {hasQuery ? 'MATCH' : 'LABORER'}{headerCount !== 1 ? (hasQuery ? 'ES' : 'S') : ''}
        </span>
      </div>

      <LaborSearchBar serverQ={summary.q} onSearchChange={onSearchChange} />

      <div className="rounded-lg border border-border/30 overflow-hidden bg-background/30">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1.5 border-b border-border/20 bg-muted/10">
          <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-widest">LABORER</span>
          <SortHeaderCell label="SHIFTS" col="shifts" sort={summary.sort} dir={summary.dir} onSortChange={onSortChange} />
          <SortHeaderCell label="DEBT FORGIVEN" col="debt" sort={summary.sort} dir={summary.dir} onSortChange={onSortChange} />
        </div>

        {/* Laborer rows */}
        <div className="max-h-48 overflow-y-auto divide-y divide-border/15">
          {summary.loading && !data ? (
            <div className="flex items-center gap-2 px-3 py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              <span className="text-[9px] text-muted-foreground/60">LOADING...</span>
            </div>
          ) : data && data.laborers.length === 0 ? (
            <div className="px-3 py-3 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground/30" />
              <span className="text-[9px] text-muted-foreground/50">
                NO LABORERS MATCH “{summary.q}”
              </span>
            </div>
          ) : (
            (data?.laborers ?? []).map((row) => {
              const lastDate = row.lastShiftAt
                ? new Date(row.lastShiftAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                : '—';
              return (
                <div
                  key={row.laborerId}
                  className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-2 hover:bg-muted/10 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold text-foreground truncate">{row.displayName}</div>
                    <div className="text-[8px] text-muted-foreground/50 tabular-nums">LAST: {lastDate}</div>
                  </div>
                  <span className="text-[9px] font-bold text-cyan-400 tabular-nums text-right self-center">
                    {row.shifts}
                  </span>
                  <span className="text-[9px] font-bold text-emerald-400 tabular-nums text-right self-center">
                    ƒ{row.totalReward.toLocaleString()}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {data && <PaginationFooter page={data.page} totalPages={data.totalPages} onPageChange={onPageChange} />}
      </div>
    </div>
  );
}

type NewPlanTask = { id: string; label: string; kind: string };

const EMPTY_NEW_PLAN = {
  title: '',
  region: 'city' as 'city' | 'wastes' | 'outlands',
  rewardPerTask: 2500,
  openToDebtorLabor: false,
  tasks: [] as NewPlanTask[],
};

export function OrgLaborRequests({ orgId, orgName }: { orgId: number; orgName: string }) {
  const [tab, setTab] = useState<'construction' | 'plans'>('construction');
  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [plans, setPlans] = useState<WorldBuildPlan[]>([]);
  const [summary, setSummary] = useState<OrgLaborSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingProject, setTogglingProject] = useState<number | null>(null);
  const [togglingPlan, setTogglingPlan] = useState<number | null>(null);
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<number | null>(null);
  const [summaries, setSummaries] = useState<Record<number, SummaryState>>({});
  const [planSummaries, setPlanSummaries] = useState<Record<number, PlanSummaryState>>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  const fetchingPlanRef = useRef<Set<string>>(new Set());
  // Ticks every 5s so the "live / updated Ns ago" labels stay fresh between
  // the (slower) background data polls without forcing extra network calls.
  const [now, setNow] = useState(() => Date.now());

  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newPlan, setNewPlan] = useState({ ...EMPTY_NEW_PLAN, tasks: [] as NewPlanTask[] });
  const [submittingPlan, setSubmittingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const buildLaborParams = (page: number, q: string, sort: LaborSort, dir: LaborDir) => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (q) params.set('q', q);
    if (sort !== 'recent') params.set('sort', sort);
    if (dir !== 'desc') params.set('dir', dir);
    return params.toString();
  };

  const fetchLaborSummary = useCallback(async (
    projectId: number,
    page: number,
    opts?: { q?: string; sort?: LaborSort; dir?: LaborDir },
  ) => {
    const q = opts?.q ?? '';
    const sort = opts?.sort ?? 'recent';
    const dir = opts?.dir ?? 'desc';
    const key = `${projectId}:${page}:${q}:${sort}:${dir}`;
    if (fetchingRef.current.has(key)) return;
    fetchingRef.current.add(key);
    setSummaries(prev => ({
      ...prev,
      [projectId]: { loading: true, data: prev[projectId]?.data ?? null, error: null, page, q, sort, dir },
    }));
    try {
      const r = await apiFetch(`/api/construction/${projectId}/labor-summary?${buildLaborParams(page, q, sort, dir)}`, { credentials: 'include' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setSummaries(prev => ({
          ...prev,
          [projectId]: { loading: false, data: prev[projectId]?.data ?? null, error: j.error ?? 'Failed to load labor breakdown', page, q, sort, dir },
        }));
        return;
      }
      const j = await r.json();
      setSummaries(prev => ({
        ...prev,
        [projectId]: { loading: false, data: j as LaborSummary, error: null, page, q, sort, dir },
      }));
    } catch {
      setSummaries(prev => ({
        ...prev,
        [projectId]: { loading: false, data: prev[projectId]?.data ?? null, error: 'Failed to load labor breakdown', page, q, sort, dir },
      }));
    } finally {
      fetchingRef.current.delete(key);
    }
  }, []);

  const fetchPlanLaborSummary = useCallback(async (
    planId: number,
    page = 1,
    opts?: { q?: string; sort?: LaborSort; dir?: LaborDir },
    silent = false,
  ) => {
    const q = opts?.q ?? '';
    const sort = opts?.sort ?? 'recent';
    const dir = opts?.dir ?? 'desc';
    const key = `${planId}:${page}:${q}:${sort}:${dir}`;
    if (fetchingPlanRef.current.has(key)) return;
    fetchingPlanRef.current.add(key);
    // Silent (poll) refreshes keep the visible stats in place — no loading
    // spinner, no clearing data — so the panel never flickers.
    if (!silent) {
      setPlanSummaries(prev => ({
        ...prev,
        [planId]: { loading: true, data: prev[planId]?.data ?? null, error: null, page, q, sort, dir },
      }));
    }
    try {
      const r = await apiFetch(`/api/world-build/plans/${planId}/labor-summary?${buildLaborParams(page, q, sort, dir)}`, { credentials: 'include' });
      if (!r.ok) {
        if (silent) return; // keep existing stats on a failed background refresh
        const j = await r.json().catch(() => ({}));
        setPlanSummaries(prev => ({
          ...prev,
          [planId]: { loading: false, data: prev[planId]?.data ?? null, error: j.error ?? 'Failed to load labor stats', page, q, sort, dir },
        }));
        return;
      }
      const j = await r.json();
      setPlanSummaries(prev => ({
        ...prev,
        [planId]: { loading: false, data: j as PlanLaborSummary, error: null, page, cachedAt: Date.now(), q, sort, dir },
      }));
    } catch {
      if (silent) return; // keep existing stats on a failed background refresh
      setPlanSummaries(prev => ({
        ...prev,
        [planId]: { loading: false, data: prev[planId]?.data ?? null, error: 'Failed to load labor stats', page, q, sort, dir },
      }));
    } finally {
      fetchingPlanRef.current.delete(key);
    }
  }, []);

  // Lightweight refresh of just the org-wide labor summary card. Unlike load(),
  // this never toggles the panel's loading state or clears selections/expansions,
  // so polling it leaves the user's current view untouched.
  const refreshOrgSummary = useCallback(async () => {
    try {
      const r = await apiFetch('/api/construction/org-labor-summary', { credentials: 'include' });
      if (!r.ok) return; // keep the existing summary on a failed background refresh
      const j = await r.json();
      setSummary(j as OrgLaborSummary);
    } catch {
      // keep the existing summary on a failed background refresh
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlanSummaries({});
    setSummaries({});
    try {
      const [projRes, plansRes, summaryRes] = await Promise.all([
        apiFetch('/api/construction/my-projects', { credentials: 'include' }),
        apiFetch('/api/world-build/plans', { credentials: 'include' }),
        apiFetch('/api/construction/org-labor-summary', { credentials: 'include' }),
      ]);
      if (projRes.ok) {
        const j = await projRes.json();
        setProjects((j.projects ?? []) as ConstructionProject[]);
      }
      if (plansRes.ok) {
        const j = await plansRes.json();
        const all: WorldBuildPlan[] = j.plans ?? [];
        setPlans(all.filter(p => p.owningOrgId === String(orgId)));
      }
      if (summaryRes.ok) {
        const j = await summaryRes.json();
        setSummary(j as OrgLaborSummary);
      } else {
        setSummary(null);
      }
    } catch {
      setError('Failed to load labor requests. Try refreshing.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (expandedProject !== null) {
      const existing = summaries[expandedProject];
      if (!existing) fetchLaborSummary(expandedProject, 1);
    }
  }, [expandedProject, fetchLaborSummary, summaries]);

  useEffect(() => {
    if (expandedPlan !== null) {
      const existing = planSummaries[expandedPlan];
      if (!existing) fetchPlanLaborSummary(expandedPlan);
    }
  }, [expandedPlan, fetchPlanLaborSummary, planSummaries]);

  // Keep the expanded plan's current page in a ref so the poll can silently
  // refetch the slice the admin is actually viewing without resetting the
  // interval on every background data update.
  const expandedPlanPageRef = useRef(1);
  // Keep the current search/sort in a ref too so silent polls don't clobber the
  // admin's active query with the defaults (which would reset the table).
  const expandedPlanOptsRef = useRef<{ q?: string; sort?: LaborSort; dir?: LaborDir }>({});
  useEffect(() => {
    const s = expandedPlan !== null ? planSummaries[expandedPlan] : undefined;
    expandedPlanPageRef.current = s?.page ?? 1;
    expandedPlanOptsRef.current = { q: s?.q, sort: s?.sort, dir: s?.dir };
  }, [expandedPlan, planSummaries]);

  // Auto-refresh the live stats while the panel is open so an admin watching
  // inmates work sees fresh numbers without reopening the plan or hitting
  // refresh. We silently refetch the org summary and the currently-expanded
  // plan's stats on a short interval. Polling pauses while the tab is hidden
  // (and resumes — with an immediate tick — when it becomes visible again).
  useEffect(() => {
    const POLL_MS = 20000;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshOrgSummary();
      if (expandedPlan !== null) fetchPlanLaborSummary(expandedPlan, expandedPlanPageRef.current, expandedPlanOptsRef.current, true);
    };
    const interval = setInterval(tick, POLL_MS);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [expandedPlan, refreshOrgSummary, fetchPlanLaborSummary]);

  // Keep the relative "updated Ns ago" labels current between data polls.
  useEffect(() => {
    if (expandedPlan === null) return;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [expandedPlan]);

  const toggleProjectLabor = async (project: ConstructionProject) => {
    if (togglingProject !== null) return;
    setTogglingProject(project.id);
    try {
      const newOpen = !project.openToDebtorLabor;
      const r = await apiFetch(`/api/construction/${project.id}/set-org`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ owningOrgId: String(orgId), openToDebtorLabor: newOpen }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? 'Failed to update project');
        return;
      }
      setProjects(prev => prev.map(p =>
        p.id === project.id
          ? { ...p, owningOrgId: String(orgId), owningOrgName: orgName, openToDebtorLabor: newOpen }
          : p,
      ));
    } finally {
      setTogglingProject(null);
    }
  };

  const togglePlanLabor = async (plan: WorldBuildPlan) => {
    if (togglingPlan !== null) return;
    setTogglingPlan(plan.id);
    try {
      const newOpen = !plan.openToDebtorLabor;
      const r = await apiFetch(`/api/world-build/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ openToDebtorLabor: newOpen }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? 'Failed to update plan');
        return;
      }
      setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, openToDebtorLabor: newOpen } : p));
    } finally {
      setTogglingPlan(null);
    }
  };

  const addTask = () => {
    const id = `t_${Math.random().toString(36).slice(2, 10)}`;
    setNewPlan(prev => ({ ...prev, tasks: [...prev.tasks, { id, label: '', kind: 'custom' }] }));
  };

  const removeTask = (id: string) => {
    setNewPlan(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== id) }));
  };

  const updateTask = (id: string, label: string) => {
    setNewPlan(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, label } : t) }));
  };

  const submitNewPlan = async () => {
    setPlanError(null);
    const title = newPlan.title.trim();
    if (!title) { setPlanError('Title is required.'); return; }
    setSubmittingPlan(true);
    try {
      const r = await apiFetch('/api/world-build/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title,
          region: newPlan.region,
          rewardPerTask: newPlan.rewardPerTask,
          openToDebtorLabor: newPlan.openToDebtorLabor,
          tasks: newPlan.tasks
            .filter(t => t.label.trim())
            .map(t => ({ ...t, label: t.label.trim() })),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setPlanError(j.error ?? 'Failed to create plan.');
        return;
      }
      setShowNewPlan(false);
      setNewPlan({ ...EMPTY_NEW_PLAN, tasks: [] });
      await load();
    } finally {
      setSubmittingPlan(false);
    }
  };

  const activeProjectCount = projects.filter(p => p.openToDebtorLabor).length;
  const activePlanCount = plans.filter(p => p.openToDebtorLabor).length;

  return (
    <div className="rounded-xl bg-card/50 border border-border/50 overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <HardHat className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-bold uppercase tracking-[0.15em]">ORG LABOR REQUESTS</h2>
          </div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
            MANAGE WHICH PROJECTS &amp; PLANS ARE OPEN TO COLLECTIONS FACILITY LABOR
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-muted/20 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-4 pb-2 flex gap-2">
        {([
          ['construction', `CONSTRUCTION (${projects.length})`, HardHat],
          ['plans', `BLUEPRINTS (${plans.length})`, Map],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as 'construction' | 'plans')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
              tab === key
                ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400'
                : 'bg-muted/10 border border-border/30 text-muted-foreground hover:text-foreground'
            }`}>
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {/* ── ORG LABOR SUMMARY CARD ── */}
      {summary && (
        <div className="mx-4 mb-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 overflow-hidden">
          <div className="px-3 py-2 border-b border-cyan-500/15 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-400">DEBTOR LABOR OVERVIEW</span>
            </div>
            {summary.cachedAt != null && (
              <span className="text-[8px] uppercase tracking-wider text-muted-foreground/50 tabular-nums">
                UPDATED {Math.floor((Date.now() - summary.cachedAt) / 60000)} MIN AGO
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 divide-x divide-cyan-500/15">
            {/* This week */}
            <div className="px-3 py-2.5 space-y-2">
              <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60">THIS WEEK</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Zap className="w-2.5 h-2.5 text-cyan-400" />
                  </div>
                  <p className="text-sm font-bold tabular-nums text-cyan-400 leading-none">{summary.week.shifts.toLocaleString()}</p>
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">SHIFTS</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <span className="text-[10px] text-emerald-400 font-bold leading-none">ƒ</span>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-emerald-400 leading-none">{summary.week.debtForgiven.toLocaleString()}</p>
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">FORGIVEN</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Users className="w-2.5 h-2.5 text-amber-400" />
                  </div>
                  <p className="text-sm font-bold tabular-nums text-amber-400 leading-none">{summary.week.uniqueLaborers.toLocaleString()}</p>
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">WORKERS</p>
                </div>
              </div>
            </div>
            {/* All time */}
            <div className="px-3 py-2.5 space-y-2">
              <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60">ALL TIME</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Zap className="w-2.5 h-2.5 text-cyan-400/50" />
                  </div>
                  <p className="text-sm font-bold tabular-nums text-foreground/80 leading-none">{summary.allTime.shifts.toLocaleString()}</p>
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">SHIFTS</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <span className="text-[10px] text-foreground/50 font-bold leading-none">ƒ</span>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-foreground/80 leading-none">{summary.allTime.debtForgiven.toLocaleString()}</p>
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">FORGIVEN</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Users className="w-2.5 h-2.5 text-amber-400/50" />
                  </div>
                  <p className="text-sm font-bold tabular-nums text-foreground/80 leading-none">{summary.allTime.uniqueLaborers.toLocaleString()}</p>
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">WORKERS</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-4 mb-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
        </div>
      ) : (
        <>
          {tab === 'construction' && (
            <div className="divide-y divide-border/30">
              {projects.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <HardHat className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">NO CONSTRUCTION PROJECTS YET</p>
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mt-1">CLAIM A PLOT AND START A BUILD TO MANAGE LABOR HERE</p>
                </div>
              )}
              {projects.map(p => {
                const pct = p.laborRequired > 0 ? Math.min(100, Math.round(p.laborApplied / p.laborRequired * 100)) : 0;
                const isExpanded = expandedProject === p.id;
                const isToggling = togglingProject === p.id;
                const isClosed = p.status === 'complete' || p.status === 'cancelled';
                return (
                  <div key={p.id} className={`px-4 py-3 ${isClosed ? 'opacity-50' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold uppercase tracking-wider truncate">{p.label}</span>
                          <span className={`text-[9px] font-bold uppercase tracking-wider ${STATUS_COLOR[p.status] ?? 'text-muted-foreground'}`}>
                            {STATUS_LABEL[p.status] ?? p.status.toUpperCase()}
                          </span>
                          <LaborBadge open={p.openToDebtorLabor} />
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                          {p.buildingType.toUpperCase()}
                          {p.owningOrgName && <> · ORG: {p.owningOrgName}</>}
                        </div>
                        {p.status === 'in_progress' && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-cyan-400 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-muted-foreground tabular-nums">{pct}%</span>
                          </div>
                        )}
                        {p.debtorShifts > 0 && (
                          <div className="mt-1 text-[9px] text-cyan-400/80 uppercase tracking-wider font-bold">
                            {p.debtorShifts} DEBTOR SHIFT{p.debtorShifts !== 1 ? 'S' : ''} WORKED
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!isClosed && (
                          <button
                            onClick={() => toggleProjectLabor(p)}
                            disabled={isToggling || togglingProject !== null}
                            title={p.openToDebtorLabor ? 'Close to CF labor' : 'Open to CF labor'}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 border border-border/30 hover:border-cyan-500/40 bg-muted/10 hover:bg-cyan-500/10 text-muted-foreground hover:text-cyan-400"
                          >
                            {isToggling ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : p.openToDebtorLabor ? (
                              <ToggleRight className="w-3.5 h-3.5 text-cyan-400" />
                            ) : (
                              <ToggleLeft className="w-3.5 h-3.5" />
                            )}
                            {p.openToDebtorLabor ? 'OPEN' : 'CLOSED'}
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedProject(isExpanded ? null : p.id)}
                          className="p-1.5 rounded-lg hover:bg-muted/20 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="mt-3 pt-3 border-t border-border/30 space-y-3 text-[10px] text-muted-foreground uppercase tracking-wider">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              <span>PROJECT ID</span><span className="text-foreground">#{p.id}</span>
                              <span>LABOR APPLIED</span><span className="text-foreground">{p.laborApplied} / {p.laborRequired} UNITS</span>
                              <span>DEBTOR SHIFTS</span>
                              <span className={p.debtorShifts > 0 ? 'text-cyan-400' : 'text-muted-foreground'}>
                                {p.debtorShifts} SHIFT{p.debtorShifts !== 1 ? 'S' : ''}
                              </span>
                              <span>ORG ASSOCIATION</span>
                              <span className={p.owningOrgId ? 'text-cyan-400' : 'text-muted-foreground'}>
                                {p.owningOrgName ?? '— NOT SET —'}
                              </span>
                            </div>

                            {/* Per-project debtor labor stat tiles */}
                            {(() => {
                              const s = summaries[p.id];
                              if (!s || s.loading) return null;
                              if (s.error || !s.data) return null;
                              const d = s.data;
                              return (
                                <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/20 overflow-hidden">
                                  <div className="px-3 py-1.5 border-b border-cyan-500/15 flex items-center gap-1.5">
                                    <Zap className="w-3 h-3 text-cyan-400" />
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-400">PROJECT LABOR STATS</span>
                                  </div>
                                  <div className="grid grid-cols-3 divide-x divide-cyan-500/15">
                                    <div className="px-3 py-2.5 text-center">
                                      <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <Zap className="w-2.5 h-2.5 text-cyan-400" />
                                      </div>
                                      <p className="text-sm font-bold tabular-nums text-cyan-400 leading-none">{d.debtorShifts.toLocaleString()}</p>
                                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">SHIFTS</p>
                                    </div>
                                    <div className="px-3 py-2.5 text-center">
                                      <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <span className="text-[10px] text-emerald-400 font-bold leading-none">ƒ</span>
                                      </div>
                                      <p className="text-sm font-bold tabular-nums text-emerald-400 leading-none">{d.totalDebtForgiven.toLocaleString()}</p>
                                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">FORGIVEN</p>
                                    </div>
                                    <div className="px-3 py-2.5 text-center">
                                      <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <Users className="w-2.5 h-2.5 text-amber-400" />
                                      </div>
                                      <p className="text-sm font-bold tabular-nums text-amber-400 leading-none">{d.totalDebtorLaborers.toLocaleString()}</p>
                                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">WORKERS</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Per-laborer breakdown */}
                            <LaborBreakdown
                              summary={summaries[p.id]}
                              onPageChange={(pg) => {
                                const s = summaries[p.id];
                                fetchLaborSummary(p.id, pg, { q: s?.q, sort: s?.sort, dir: s?.dir });
                              }}
                              onSearchChange={(q) => {
                                const s = summaries[p.id];
                                fetchLaborSummary(p.id, 1, { q, sort: s?.sort, dir: s?.dir });
                              }}
                              onSortChange={(col) => {
                                const s = summaries[p.id];
                                const dir: LaborDir = s?.sort === col ? (s.dir === 'desc' ? 'asc' : 'desc') : 'desc';
                                fetchLaborSummary(p.id, 1, { q: s?.q, sort: col, dir });
                              }}
                            />

                            <p className="text-[9px] text-muted-foreground/50 pt-1">
                              WHEN OPEN, INCARCERATED PLAYERS IN THE COLLECTIONS FACILITY CAN WORK SHIFTS ON THIS BUILD — REDUCING THEIR DEBT WHILE ADVANCING YOUR PROJECT.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'plans' && (
            <div className="divide-y divide-border/30">
              {/* New Plan Button */}
              <div className="px-4 py-2.5 flex items-center justify-between">
                <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">
                  ORG-OWNED BLUEPRINT PLANS
                </p>
                <button
                  onClick={() => { setShowNewPlan(v => !v); setPlanError(null); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border ${
                    showNewPlan
                      ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                      : 'bg-muted/10 border-border/30 text-muted-foreground hover:text-cyan-400 hover:border-cyan-500/40 hover:bg-cyan-500/10'
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  NEW BLUEPRINT PLAN
                </button>
              </div>

              {/* Inline New Plan Form */}
              <AnimatePresence>
                {showNewPlan && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 py-4 bg-cyan-500/5 border-b border-cyan-500/15 space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">NEW BLUEPRINT PLAN</span>
                      </div>

                      {planError && (
                        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                          <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">{planError}</p>
                        </div>
                      )}

                      {/* Title */}
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">PLAN TITLE *</label>
                        <input
                          type="text"
                          value={newPlan.title}
                          onChange={e => setNewPlan(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="E.g. DOWNTOWN EXPANSION PHASE 2"
                          maxLength={200}
                          className="w-full px-3 py-2 rounded-lg bg-background/60 border border-border/50 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50 uppercase tracking-wide"
                        />
                      </div>

                      {/* Region + Reward row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">REGION</label>
                          <select
                            value={newPlan.region}
                            onChange={e => setNewPlan(prev => ({ ...prev, region: e.target.value as 'city' | 'wastes' | 'outlands' }))}
                            className="w-full px-3 py-2 rounded-lg bg-background/60 border border-border/50 text-xs text-foreground focus:outline-none focus:border-cyan-500/50 uppercase tracking-wide"
                          >
                            <option value="city">CITY</option>
                            <option value="wastes">WASTES</option>
                            <option value="outlands">OUTLANDS</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">REWARD / TASK (ƒ)</label>
                          <input
                            type="number"
                            min={100}
                            max={10000}
                            step={100}
                            value={newPlan.rewardPerTask}
                            onChange={e => setNewPlan(prev => ({ ...prev, rewardPerTask: Math.max(100, Math.min(10000, Number(e.target.value) || 2500)) }))}
                            className="w-full px-3 py-2 rounded-lg bg-background/60 border border-border/50 text-xs text-foreground focus:outline-none focus:border-cyan-500/50"
                          />
                        </div>
                      </div>

                      {/* Open to CF Labor toggle */}
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-background/40 border border-border/30">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground">OPEN TO CF LABOR</p>
                          <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">ALLOW INCARCERATED PLAYERS TO WORK THIS PLAN IMMEDIATELY</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNewPlan(prev => ({ ...prev, openToDebtorLabor: !prev.openToDebtorLabor }))}
                          className="flex-shrink-0 ml-3"
                        >
                          {newPlan.openToDebtorLabor
                            ? <ToggleRight className="w-6 h-6 text-cyan-400" />
                            : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
                        </button>
                      </div>

                      {/* Tasks */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">
                            INITIAL TASKS ({newPlan.tasks.length})
                          </label>
                          <button
                            type="button"
                            onClick={addTask}
                            disabled={newPlan.tasks.length >= 20}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider bg-muted/20 border border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-40"
                          >
                            <Plus className="w-2.5 h-2.5" />
                            ADD TASK
                          </button>
                        </div>
                        {newPlan.tasks.length === 0 && (
                          <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider px-1">
                            NO TASKS YET — ADD TASKS OR LEAVE EMPTY TO ADD THEM LATER.
                          </p>
                        )}
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {newPlan.tasks.map((t, i) => (
                            <div key={t.id} className="flex items-center gap-2">
                              <span className="text-[9px] text-muted-foreground/40 font-bold tabular-nums w-4 text-right flex-shrink-0">{i + 1}</span>
                              <input
                                type="text"
                                value={t.label}
                                onChange={e => updateTask(t.id, e.target.value)}
                                placeholder="TASK DESCRIPTION"
                                maxLength={120}
                                className="flex-1 px-2.5 py-1.5 rounded-lg bg-background/60 border border-border/50 text-[10px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-cyan-500/40 uppercase tracking-wide"
                              />
                              <button
                                type="button"
                                onClick={() => removeTask(t.id)}
                                className="flex-shrink-0 p-1 rounded hover:bg-red-500/10 text-muted-foreground/40 hover:text-red-400 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Submit / Cancel */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={submitNewPlan}
                          disabled={submittingPlan || !newPlan.title.trim()}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-40"
                        >
                          {submittingPlan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          {submittingPlan ? 'CREATING...' : 'CREATE PLAN'}
                        </button>
                        <button
                          onClick={() => { setShowNewPlan(false); setPlanError(null); setNewPlan({ ...EMPTY_NEW_PLAN, tasks: [] }); }}
                          disabled={submittingPlan}
                          className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-muted/10 border border-border/30 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                        >
                          CANCEL
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {plans.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <Map className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">NO ORG BLUEPRINT PLANS YET</p>
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mt-1">USE THE BUTTON ABOVE TO CREATE YOUR FIRST PLAN</p>
                </div>
              )}
              {plans.map(p => {
                const total = p.tasks.length;
                const done = p.tasks.filter(t => t.completed).length;
                const pct = total > 0 ? Math.round(done / total * 100) : 0;
                const isExpanded = expandedPlan === p.id;
                const isToggling = togglingPlan === p.id;
                const isClosed = p.status === 'completed' || p.status === 'archived';
                return (
                  <div key={p.id} className={`px-4 py-3 ${isClosed ? 'opacity-50' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold uppercase tracking-wider truncate">{p.title}</span>
                          <span className={`text-[9px] font-bold uppercase tracking-wider ${PLAN_STATUS_COLOR[p.status] ?? 'text-muted-foreground'}`}>
                            {p.status.toUpperCase()}
                          </span>
                          <LaborBadge open={p.openToDebtorLabor} />
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                          {p.region.toUpperCase()} REGION · {done}/{total} TASKS · ƒ{p.rewardPerTask.toLocaleString()}/TASK
                        </div>
                        {total > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-cyan-400 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-muted-foreground tabular-nums">{pct}%</span>
                          </div>
                        )}
                        {p.contributorCount > 0 && (
                          <div className="mt-1 text-[9px] text-cyan-400/80 uppercase tracking-wider font-bold">
                            {p.contributorCount} CONTRIBUTOR{p.contributorCount !== 1 ? 'S' : ''}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!isClosed && (
                          <button
                            onClick={() => togglePlanLabor(p)}
                            disabled={isToggling || togglingPlan !== null}
                            title={p.openToDebtorLabor ? 'Close to CF labor' : 'Open to CF labor'}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 border border-border/30 hover:border-cyan-500/40 bg-muted/10 hover:bg-cyan-500/10 text-muted-foreground hover:text-cyan-400"
                          >
                            {isToggling ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : p.openToDebtorLabor ? (
                              <ToggleRight className="w-3.5 h-3.5 text-cyan-400" />
                            ) : (
                              <ToggleLeft className="w-3.5 h-3.5" />
                            )}
                            {p.openToDebtorLabor ? 'OPEN' : 'CLOSED'}
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedPlan(isExpanded ? null : p.id)}
                          className="p-1.5 rounded-lg hover:bg-muted/20 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              <span>PLAN ID</span><span className="text-foreground">#{p.id}</span>
                              <span>TASKS</span><span className="text-foreground">{done} DONE / {total} TOTAL</span>
                              <span>CONTRIBUTORS</span>
                              <span className={p.contributorCount > 0 ? 'text-cyan-400' : 'text-muted-foreground'}>
                                {p.contributorCount} DEBTOR{p.contributorCount !== 1 ? 'S' : ''}
                              </span>
                              <span>REWARD / TASK</span><span className="text-cyan-400">ƒ{p.rewardPerTask.toLocaleString()}</span>
                            </div>

                            {/* Per-plan debtor labor stat tiles */}
                            {(() => {
                              const s = planSummaries[p.id];
                              if (!s || s.loading) return null;
                              if (s.error || !s.data) return null;
                              const d = s.data;
                              return (
                                <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/20 overflow-hidden">
                                  <div className="px-3 py-1.5 border-b border-cyan-500/15 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <Zap className="w-3 h-3 text-cyan-400" />
                                      <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-400">PLAN LABOR STATS</span>
                                    </div>
                                    {isExpanded && s.cachedAt != null && (
                                      <div className="flex items-center gap-1.5">
                                        <span className="relative flex h-1.5 w-1.5">
                                          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/70 animate-ping" />
                                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                        </span>
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-emerald-400/80">LIVE</span>
                                        <span className="text-[8px] uppercase tracking-wider text-muted-foreground/50 tabular-nums">
                                          {formatUpdatedAgo(s.cachedAt, now)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-3 divide-x divide-cyan-500/15">
                                    <div className="px-3 py-2.5 text-center">
                                      <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <Zap className="w-2.5 h-2.5 text-cyan-400" />
                                      </div>
                                      <p className="text-sm font-bold tabular-nums text-cyan-400 leading-none">{d.debtorShifts.toLocaleString()}</p>
                                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">SHIFTS</p>
                                    </div>
                                    <div className="px-3 py-2.5 text-center">
                                      <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <span className="text-[10px] text-emerald-400 font-bold leading-none">ƒ</span>
                                      </div>
                                      <p className="text-sm font-bold tabular-nums text-emerald-400 leading-none">{d.totalDebtForgiven.toLocaleString()}</p>
                                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">FORGIVEN</p>
                                    </div>
                                    <div className="px-3 py-2.5 text-center">
                                      <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <Users className="w-2.5 h-2.5 text-amber-400" />
                                      </div>
                                      <p className="text-sm font-bold tabular-nums text-amber-400 leading-none">{d.totalDebtorLaborers.toLocaleString()}</p>
                                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">WORKERS</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Per-laborer debtor labor breakdown table */}
                            <div className="pt-1">
                              <PlanLaborBreakdown
                                summary={planSummaries[p.id]}
                                onPageChange={(page) => {
                                  const s = planSummaries[p.id];
                                  fetchPlanLaborSummary(p.id, page, { q: s?.q, sort: s?.sort, dir: s?.dir });
                                }}
                                onSearchChange={(q) => {
                                  const s = planSummaries[p.id];
                                  fetchPlanLaborSummary(p.id, 1, { q, sort: s?.sort, dir: s?.dir });
                                }}
                                onSortChange={(col) => {
                                  const s = planSummaries[p.id];
                                  const dir: LaborDir = s?.sort === col ? (s.dir === 'desc' ? 'asc' : 'desc') : 'desc';
                                  fetchPlanLaborSummary(p.id, 1, { q: s?.q, sort: col, dir });
                                }}
                              />
                            </div>

                            <p className="text-[9px] text-muted-foreground/50 pt-1">
                              WHEN OPEN, INCARCERATED PLAYERS CAN COMPLETE TASKS ON THIS BLUEPRINT — THEIR DEBT DROPS, YOUR PLAN ADVANCES.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

          {(tab === 'construction' ? activeProjectCount : activePlanCount) > 0 && (
            <div className="px-4 py-2.5 bg-cyan-500/5 border-t border-cyan-500/15">
              <p className="text-[9px] text-cyan-400/70 uppercase tracking-wider">
                {tab === 'construction'
                  ? `${activeProjectCount} PROJECT${activeProjectCount !== 1 ? 'S' : ''} CURRENTLY ACCEPTING CF LABOR`
                  : `${activePlanCount} PLAN${activePlanCount !== 1 ? 'S' : ''} CURRENTLY ACCEPTING CF LABOR`}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
