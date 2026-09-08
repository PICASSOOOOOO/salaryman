import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle, Building2, CheckCircle2, HardHat, Loader2,
  Lock, MapPin, RefreshCw, ShieldCheck, Unlock,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

export type ConstructionProjectSummary = {
  id: number;
  plotId: number;
  ownerId: string;
  buildingType: string;
  label: string;
  laborRequired: number;
  laborApplied: number;
  progress: number;
  status: string;
  owningOrgId: string | null;
  owningOrgName: string | null;
};

export type ConstructionPlotSummary = {
  id: number;
  name: string;
  cityId: string;
  sector: string;
  zone: string;
  district: string;
  status: string;
  claimedBy: string | null;
  approvedBy: string | null;
  buildingId: string | null;
};

export function filterOrgConstructionProjects(
  projects: ConstructionProjectSummary[],
  orgId: number,
): ConstructionProjectSummary[] {
  return projects.filter((project) => project.owningOrgId === String(orgId));
}

const ACTIVE_STATUSES = new Set(['designing', 'queued', 'in_progress']);

function statusClass(status: string): string {
  if (status === 'complete' || status === 'built') return 'text-violet-300 bg-violet-500/10 border-violet-500/20';
  if (status === 'in_progress' || status === 'building') return 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20';
  if (status === 'queued' || status === 'open') return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20';
  if (status === 'claimed' || status === 'designing') return 'text-amber-300 bg-amber-500/10 border-amber-500/20';
  if (status === 'cancelled') return 'text-red-300 bg-red-500/10 border-red-500/20';
  return 'text-zinc-400 bg-white/[0.03] border-white/10';
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${statusClass(status)}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-label={`${safe}% complete`}>
      <div className="h-full rounded-full bg-cyan-400 transition-[width]" style={{ width: `${safe}%` }} />
    </div>
  );
}

export function AdminConstructionOverview() {
  const [projects, setProjects] = useState<ConstructionProjectSummary[]>([]);
  const [plots, setPlots] = useState<ConstructionPlotSummary[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyPlot, setBusyPlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsRes, plotsRes] = await Promise.all([
        apiFetch('/api/construction/projects'),
        apiFetch('/api/land/plots'),
      ]);
      if (!projectsRes.ok || !plotsRes.ok) throw new Error('Construction data could not be loaded');
      const [projectData, plotData] = await Promise.all([projectsRes.json(), plotsRes.json()]);
      setProjects(projectData.projects ?? []);
      setPlots(plotData.plots ?? []);
      setCanApprove(Boolean(plotData.canApprove));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Construction data could not be loaded');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const plotById = useMemo(() => new Map(plots.map((plot) => [plot.id, plot])), [plots]);
  const pendingPlots = plots.filter((plot) => plot.status === 'claimed' || plot.status === 'open');

  const changeApproval = async (plot: ConstructionPlotSummary, action: 'open' | 'close') => {
    setBusyPlot(plot.id);
    setError(null);
    try {
      const response = await apiFetch(`/api/land/plots/${plot.id}/${action}`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Could not ${action} plot`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Approval update failed');
    } finally {
      setBusyPlot(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-amber-400" /></div>;
  }

  return (
    <div className="space-y-5" data-testid="admin-construction-overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide">
            <HardHat className="h-4 w-4 text-amber-400" /> CONSTRUCTION OVERSIGHT
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Existing land approvals and city construction pipeline. Approval authority remains enforced by the server.
          </p>
        </div>
        <button onClick={() => void load()} className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-[10px] font-mono text-zinc-400 hover:bg-white/[0.04]">
          <RefreshCw className="h-3 w-3" /> REFRESH
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="PROJECTS" value={projects.length} />
        <Metric label="ACTIVE" value={projects.filter((project) => ACTIVE_STATUSES.has(project.status)).length} />
        <Metric label="AWAITING OPEN" value={plots.filter((plot) => plot.status === 'claimed').length} />
        <Metric label="BUILT" value={plots.filter((plot) => plot.status === 'built').length} />
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="flex items-center gap-2 text-xs font-mono tracking-widest text-zinc-300">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> LAND APPROVAL QUEUE
          </h3>
        </div>
        <div className="divide-y divide-border/50">
          {pendingPlots.map((plot) => (
            <div key={plot.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-testid={`admin-construction-plot-${plot.id}`}>
              <MapPin className="hidden h-4 w-4 text-zinc-500 sm:block" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{plot.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">{plot.cityId} · {plot.zone} · claimant {plot.claimedBy ?? '—'}</p>
              </div>
              <StatusBadge status={plot.status} />
              {canApprove && plot.status === 'claimed' && (
                <button
                  data-testid={`admin-construction-open-${plot.id}`}
                  disabled={busyPlot === plot.id}
                  onClick={() => void changeApproval(plot, 'open')}
                  className="flex items-center justify-center gap-1.5 rounded border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[10px] font-bold text-emerald-300 disabled:opacity-40"
                >
                  {busyPlot === plot.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />} OPEN
                </button>
              )}
              {canApprove && plot.status === 'open' && (
                <button
                  data-testid={`admin-construction-close-${plot.id}`}
                  disabled={busyPlot === plot.id}
                  onClick={() => void changeApproval(plot, 'close')}
                  className="flex items-center justify-center gap-1.5 rounded border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10px] font-bold text-amber-300 disabled:opacity-40"
                >
                  {busyPlot === plot.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />} CLOSE
                </button>
              )}
            </div>
          ))}
          {pendingPlots.length === 0 && <p className="p-5 text-center text-xs text-zinc-500">No plots are awaiting an approval decision.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="text-xs font-mono tracking-widest text-zinc-300">ALL CONSTRUCTION PROJECTS</h3>
        </div>
        <div className="divide-y divide-border/50">
          {projects.map((project) => {
            const plot = plotById.get(project.plotId);
            return (
              <div key={project.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_150px_130px] sm:items-center" data-testid={`admin-construction-project-${project.id}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{project.label}</p>
                    <StatusBadge status={project.status} />
                  </div>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
                    {project.buildingType} · owner {project.ownerId} · org {project.owningOrgName ?? 'personal'}
                  </p>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-[10px] text-zinc-500"><span>PROGRESS</span><span>{project.progress}%</span></div>
                  <ProgressBar value={project.progress} />
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">PLOT</p>
                  <p className="truncate text-xs text-zinc-300">{plot?.name ?? `#${project.plotId}`}</p>
                  <StatusBadge status={plot?.status ?? 'unknown'} />
                </div>
              </div>
            );
          })}
          {projects.length === 0 && <p className="p-6 text-center text-xs text-zinc-500">No construction projects registered.</p>}
        </div>
      </section>
    </div>
  );
}

export function OrgConstructionOverview({ orgId }: { orgId: number }) {
  const [projects, setProjects] = useState<ConstructionProjectSummary[]>([]);
  const [plots, setPlots] = useState<ConstructionPlotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/construction/org-overview?orgId=${orgId}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not load organization construction');
      setProjects(filterOrgConstructionProjects(body.projects ?? [], orgId));
      setPlots(body.plots ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load organization construction');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const plotById = useMemo(() => new Map(plots.map((plot) => [plot.id, plot])), [plots]);
  const active = projects.filter((project) => ACTIVE_STATUSES.has(project.status));
  const completed = projects.filter((project) => project.status === 'complete');

  return (
    <section className="rounded-xl border border-sky-500/20 bg-sky-500/[0.025] p-4 sm:p-5" aria-label="Organization ownership and build pipeline" data-testid="org-construction-overview">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10">
            <Building2 className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.15em]">Ownership & build pipeline</h2>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Organization-associated properties and approved construction</p>
          </div>
        </div>
        <button onClick={() => void load()} aria-label="Refresh ownership overview" className="rounded p-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-300">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-sky-400" /></div>
      ) : error ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric label="OWNED / BUILT" value={completed.length} />
            <Metric label="ACTIVE" value={active.filter((project) => project.status !== 'queued').length} />
            <Metric label="QUEUED" value={active.filter((project) => project.status === 'queued').length} />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <ProjectGroup
              title="ACTIVE & QUEUED BUILDS"
              icon={<HardHat className="h-3.5 w-3.5 text-cyan-400" />}
              projects={active}
              plotById={plotById}
              empty="No organization builds are active or queued."
            />
            <ProjectGroup
              title="COMPLETED PROPERTIES"
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-violet-400" />}
              projects={completed}
              plotById={plotById}
              empty="No organization-owned properties have been completed."
            />
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/10 p-3">
      <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-zinc-100">{value}</p>
    </div>
  );
}

function ProjectGroup({
  title,
  icon,
  projects,
  plotById,
  empty,
}: {
  title: string;
  icon: ReactNode;
  projects: ConstructionProjectSummary[];
  plotById: Map<number, ConstructionPlotSummary>;
  empty: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-black/10">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5">
        {icon}<h3 className="text-[10px] font-bold tracking-widest text-zinc-400">{title}</h3>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {projects.map((project) => {
          const plot = plotById.get(project.plotId);
          return (
            <div key={project.id} className="p-3" data-testid={`org-construction-project-${project.id}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-zinc-200">{project.label}</p>
                <StatusBadge status={project.status} />
              </div>
              <p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-500">
                {project.buildingType} · {plot?.name ?? `plot #${project.plotId}`} · {plot?.buildingId ?? plot?.status ?? 'registered'}
              </p>
              {ACTIVE_STATUSES.has(project.status) && <div className="mt-2"><ProgressBar value={project.progress} /></div>}
            </div>
          );
        })}
        {projects.length === 0 && <p className="p-4 text-[10px] text-zinc-500">{empty}</p>}
      </div>
    </div>
  );
}