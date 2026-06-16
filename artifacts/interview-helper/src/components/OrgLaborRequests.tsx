import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HardHat, Map, Loader2, RefreshCw, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp, AlertCircle, Plus, X, FileText, Users, ChevronLeft, ChevronRight,
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
  laborers: LaborerRow[];
  page: number;
  totalPages: number;
  totalDebtorLaborers: number;
};

type SummaryState = {
  loading: boolean;
  data: LaborSummary | null;
  error: string | null;
  page: number;
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

function LaborBreakdown({
  summary,
  onPageChange,
}: {
  summary: SummaryState | undefined;
  onPageChange: (page: number) => void;
}) {
  if (!summary || summary.loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
        <span className="text-[9px] text-muted-foreground/60">LOADING LABOR BREAKDOWN...</span>
      </div>
    );
  }

  if (summary.error) {
    return (
      <div className="flex items-start gap-1.5 py-1">
        <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
        <span className="text-[9px] text-red-400 font-bold">{summary.error}</span>
      </div>
    );
  }

  const { data } = summary;
  if (!data || data.totalDebtorLaborers === 0) {
    return (
      <div className="py-2 flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-muted-foreground/30" />
        <span className="text-[9px] text-muted-foreground/50">NO DEBTOR SHIFTS LOGGED YET</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Users className="w-3 h-3 text-cyan-400" />
        <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest">
          DEBTOR LABOR BREAKDOWN — {data.totalDebtorLaborers} LABORER{data.totalDebtorLaborers !== 1 ? 'S' : ''}
        </span>
      </div>

      <div className="rounded-lg border border-border/30 overflow-hidden bg-background/30">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 py-1.5 border-b border-border/20 bg-muted/10">
          <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-widest">LABORER</span>
          <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-widest text-right">SHIFTS</span>
          <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-widest text-right">UNITS</span>
          <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-widest text-right">DEBT FORGIVEN</span>
        </div>

        {/* Laborer rows */}
        <div className="max-h-48 overflow-y-auto divide-y divide-border/15">
          {data.laborers.map((row) => {
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
          })}
        </div>

        {/* Pagination */}
        {data.totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/20 bg-muted/5">
            <span className="text-[8px] text-muted-foreground/50 tabular-nums uppercase tracking-wider">
              PAGE {data.page} / {data.totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange(data.page - 1)}
                disabled={data.page <= 1}
                className="p-0.5 rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => onPageChange(data.page + 1)}
                disabled={data.page >= data.totalPages}
                className="p-0.5 rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingProject, setTogglingProject] = useState<number | null>(null);
  const [togglingPlan, setTogglingPlan] = useState<number | null>(null);
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<number | null>(null);
  const [summaries, setSummaries] = useState<Record<number, SummaryState>>({});
  const fetchingRef = useRef<Set<string>>(new Set());

  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newPlan, setNewPlan] = useState({ ...EMPTY_NEW_PLAN, tasks: [] as NewPlanTask[] });
  const [submittingPlan, setSubmittingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const fetchLaborSummary = useCallback(async (projectId: number, page: number) => {
    const key = `${projectId}:${page}`;
    if (fetchingRef.current.has(key)) return;
    fetchingRef.current.add(key);
    setSummaries(prev => ({
      ...prev,
      [projectId]: { loading: true, data: prev[projectId]?.data ?? null, error: null, page },
    }));
    try {
      const r = await apiFetch(`/api/construction/${projectId}/labor-summary?page=${page}&limit=20`, { credentials: 'include' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setSummaries(prev => ({
          ...prev,
          [projectId]: { loading: false, data: null, error: j.error ?? 'Failed to load labor breakdown', page },
        }));
        return;
      }
      const j = await r.json();
      setSummaries(prev => ({
        ...prev,
        [projectId]: { loading: false, data: j as LaborSummary, error: null, page },
      }));
    } catch {
      setSummaries(prev => ({
        ...prev,
        [projectId]: { loading: false, data: null, error: 'Failed to load labor breakdown', page },
      }));
    } finally {
      fetchingRef.current.delete(key);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projRes, plansRes] = await Promise.all([
        apiFetch('/api/construction/my-projects', { credentials: 'include' }),
        apiFetch('/api/world-build/plans', { credentials: 'include' }),
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

                            {/* Per-laborer breakdown */}
                            <LaborBreakdown
                              summary={summaries[p.id]}
                              onPageChange={(pg) => fetchLaborSummary(p.id, pg)}
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
