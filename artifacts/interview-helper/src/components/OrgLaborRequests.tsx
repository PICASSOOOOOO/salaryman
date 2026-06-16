import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HardHat, Map, Loader2, RefreshCw, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp, AlertCircle,
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
                          <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              <span>PROJECT ID</span><span className="text-foreground">#{p.id}</span>
                              <span>LABOR APPLIED</span><span className="text-foreground">{p.laborApplied} / {p.laborRequired} UNITS</span>
                              <span>ORG ASSOCIATION</span>
                              <span className={p.owningOrgId ? 'text-cyan-400' : 'text-muted-foreground'}>
                                {p.owningOrgName ?? '— NOT SET —'}
                              </span>
                            </div>
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
              {plans.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <Map className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">NO ORG BLUEPRINT PLANS YET</p>
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mt-1">CREATE A WORLD-BUILD PLAN AND IT WILL APPEAR HERE FOR MANAGEMENT</p>
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
