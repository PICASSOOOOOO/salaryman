import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

/**
 * FOR HIRE / ORG LABOR STATION
 *
 * Shows org/player-directed resources open to debtor labor, in three sub-tabs:
 *   GIGS         — open service listings from the marketplace (player-to-player
 *                  and org-to-player gigs, Task #737). Debtors claim via the
 *                  normal /services/:id/claim endpoint; when the poster marks
 *                  complete the escrow routes to debt reduction instead of bank.
 *   BLUEPRINTS   — org-owned world-build plans (task-based, openToDebtorLabor=true).
 *   CONSTRUCTION — org-owned construction projects (shift-based, 12s cooldown).
 *
 * For EACH item the debtor sees: who benefits, reward amount, remaining work.
 *
 * Completing any action:
 *   (a) reduces the debtor's own debt by the payoff
 *   (b) advances the org's/poster's project
 *   (c) records benefitingOrgId in the audit log
 *
 * Fallback: if all three lists are empty, shows a clear "no requests yet" message.
 */

type ServiceListing = {
  id: number;
  title: string;
  description: string;
  category: string;
  payFiat: number;
  payType: string;
  posterName: string;
  posterOrgId: number | null;
  posterOrgName: string | null;
  location: string;
  deadline: string | null;
  createdAt: string;
};

type OrgConstructionProject = {
  id: number;
  label: string;
  buildingType: string;
  laborRequired: number;
  laborApplied: number;
  progress: number;
  owningOrgId: string | null;
  owningOrgName: string | null;
  rewardOverride: number | null;
  rewardPerShift: number;
};

type OrgTask = {
  id: string;
  kind: string;
  x: number; y: number;
  label: string;
  completed?: boolean;
  completedByName?: string | null;
};

type OrgPlan = {
  id: number;
  title: string;
  description: string | null;
  region: string;
  status: string;
  areaX: number; areaY: number; areaW: number; areaH: number;
  tasks: OrgTask[];
  rewardPerTask: number;
  owningOrgId: string | null;
  owningOrgName: string | null;
};

const SHIFT_REWARD_DEFAULT = 200;

export function OrgLaborStation({
  onComplete,
  onToast,
  onDebtUpdate,
}: {
  onComplete: (reward: number, freed: boolean) => void;
  onToast: (msg: string) => void;
  onDebtUpdate: () => void;
}) {
  const [subTab, setSubTab] = useState<'gigs' | 'blueprints' | 'construction'>('gigs');
  const [orgPlans, setOrgPlans] = useState<OrgPlan[]>([]);
  const [orgProjects, setOrgProjects] = useState<OrgConstructionProject[]>([]);
  const [serviceListings, setServiceListings] = useState<ServiceListing[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [busyProject, setBusyProject] = useState<number | null>(null);
  const [busyClaim, setBusyClaim] = useState<number | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<number, number>>({});

  const fetchSources = useCallback(async () => {
    try {
      const r = await apiFetch('/api/cf/labor-sources', { credentials: 'include' });
      if (!r.ok) return;
      const j = await r.json();
      setOrgPlans((j.forHire?.worldBuildPlans ?? []) as OrgPlan[]);
      setOrgProjects((j.forHire?.constructionProjects ?? []) as OrgConstructionProject[]);
      setServiceListings((j.forHire?.serviceListings ?? []) as ServiceListing[]);
    } catch {}
  }, []);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  // Cooldown ticker for construction projects.
  useEffect(() => {
    const ids = Object.keys(cooldowns).map(Number).filter(id => cooldowns[id] > 0);
    if (ids.length === 0) return;
    const t = setInterval(() => {
      setCooldowns(prev => {
        const next = { ...prev };
        for (const id of ids) next[id] = Math.max(0, (next[id] ?? 0) - 1000);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [cooldowns]);

  const claimServiceListing = async (listing: ServiceListing) => {
    if (busyClaim !== null) return;
    setBusyClaim(listing.id);
    try {
      const r = await apiFetch(`/api/services/${listing.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok) {
        onToast(`REJECTED: ${j.error ?? 'unknown'}`);
        return;
      }
      const who = listing.posterOrgName ?? listing.posterName ?? 'POSTER';
      onToast(`✓ GIG CLAIMED · COMPLETE THE WORK → DEBT DROPS → ${who}`);
      await fetchSources();
    } finally {
      setBusyClaim(null);
    }
  };

  const buildPlanTask = async (plan: OrgPlan, taskId: string) => {
    if (busyPlan) return;
    setBusyPlan(taskId);
    try {
      await new Promise(r => setTimeout(r, 1400));
      const r = await apiFetch(`/api/world-build/plans/${plan.id}/complete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskId }),
      });
      const j = await r.json();
      if (!r.ok) { onToast(`REJECTED: ${j.error ?? 'unknown'}`); return; }
      onToast(`✓ BUILT · -ƒ${(j.payoff ?? 0).toLocaleString()} OFF DEBT → ${plan.owningOrgName ?? 'ORG'}`);
      onComplete(j.payoff ?? 0, !!j.freed);
      onDebtUpdate();
      await fetchSources();
    } finally { setBusyPlan(null); }
  };

  const workShift = async (project: OrgConstructionProject) => {
    if (busyProject !== null || (cooldowns[project.id] ?? 0) > 0) return;
    setBusyProject(project.id);
    try {
      const r = await apiFetch(`/api/construction/${project.id}/work`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok) {
        if (j.retryAfterMs) { setCooldowns(prev => ({ ...prev, [project.id]: j.retryAfterMs })); onToast(`COOLDOWN: ${Math.ceil(j.retryAfterMs / 1000)}s`); }
        else onToast(`REJECTED: ${j.error ?? 'unknown'}`);
        return;
      }
      const earned = j.reward ?? project.rewardPerShift ?? SHIFT_REWARD_DEFAULT;
      onToast(`✓ SHIFT DONE · -ƒ${earned.toLocaleString()} OFF DEBT → ${project.owningOrgName ?? 'ORG'}`);
      setCooldowns(prev => ({ ...prev, [project.id]: 12_000 }));
      onComplete(earned, !!j.freed);
      onDebtUpdate();
      await fetchSources();
    } finally { setBusyProject(null); }
  };

  const selectedPlan = orgPlans.find(p => p.id === selectedPlanId) ?? null;
  const hasAny = orgPlans.length > 0 || orgProjects.length > 0 || serviceListings.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '1rem 1.5rem', boxSizing: 'border-box', gap: '.6rem' }}>
      <div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: '1.4rem', color: '#22d3ee', letterSpacing: '.18em' }}>FOR HIRE · ORG LABOR REQUESTS</div>
        <div style={{ fontSize: '.55rem', color: 'rgba(34,211,238,.5)', letterSpacing: '.12em' }}>WORK FOR AN ORG OR PLAYER · YOUR DEBT DROPS · THEIR PROJECT ADVANCES</div>
      </div>

      {!hasAny ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ color: 'rgba(34,211,238,.4)', fontSize: '1.5rem', fontFamily: "var(--font-sans)", letterSpacing: '.2em' }}>NO REQUESTS POSTED</div>
          <div style={{ color: 'rgba(34,211,238,.45)', fontSize: '.7rem', fontFamily: "var(--font-sans)", letterSpacing: '.15em', textAlign: 'center', maxWidth: 400, lineHeight: 1.7 }}>
            No orgs or players have posted labor requests yet.<br/>
            Return to the station floor and use a Pablo community station instead.
          </div>
          <div style={{ fontSize: '.55rem', color: 'rgba(34,211,238,.25)', fontFamily: "var(--font-sans)", letterSpacing: '.15em', marginTop: 8 }}>
            DEBT STILL REDUCED BY PABLO COMMUNITY WORK ✓
          </div>
        </div>
      ) : (
        <>
          {/* Sub-tab switcher */}
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              ['gigs', `GIGS (${serviceListings.length})`],
              ['blueprints', `BLUEPRINTS (${orgPlans.length})`],
              ['construction', `CONSTRUCTION (${orgProjects.length})`],
            ] as const).map(([key, label]) => (
              <button key={key}
                onClick={() => { setSubTab(key); setSelectedPlanId(null); }}
                style={{ flex: 1, padding: '.3rem', fontFamily: "var(--font-sans)", fontSize: '.5rem', letterSpacing: '.1em', cursor: 'pointer', border: `1px solid ${subTab === key ? '#22d3ee' : 'rgba(34,211,238,.25)'}`, background: subTab === key ? 'rgba(34,211,238,.12)' : 'rgba(0,0,0,.3)', color: subTab === key ? '#22d3ee' : 'rgba(34,211,238,.5)' }}>
                {label}
              </button>
            ))}
          </div>

          {/* GIGS sub-tab — service listings */}
          {subTab === 'gigs' && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {serviceListings.length === 0 && (
                <div style={{ color: 'rgba(34,211,238,.4)', fontSize: '.65rem', fontFamily: "var(--font-sans)", padding: '.6rem', border: '1px dashed rgba(34,211,238,.2)', lineHeight: 1.5 }}>
                  No open gigs posted. Check BLUEPRINTS or CONSTRUCTION tabs.
                </div>
              )}
              {serviceListings.map(l => (
                <div key={l.id} style={{ padding: '.65rem', marginBottom: '.4rem', border: '1px solid rgba(34,211,238,.2)', background: 'rgba(0,0,0,.4)', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#22d3ee', fontSize: '.75rem', fontFamily: "var(--font-sans)", letterSpacing: '.08em', marginBottom: 2 }}>{l.title}</div>
                    <div style={{ fontSize: '.5rem', fontFamily: "var(--font-sans)", letterSpacing: '.1em', color: 'rgba(34,211,238,.6)', marginBottom: 3 }}>
                      {l.category.toUpperCase()} · {l.location.toUpperCase()} · POSTED BY {l.posterOrgName ?? l.posterName}
                    </div>
                    <div style={{ fontSize: '.6rem', color: 'rgba(34,211,238,.7)', fontFamily: "var(--font-sans)", lineHeight: 1.4, marginBottom: 4 }}>{l.description?.slice(0, 140)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#22d3ee', fontSize: '.65rem', fontFamily: "var(--font-sans)", fontWeight: 'bold' }}>ƒ{l.payFiat.toLocaleString()} {l.payType === 'hourly' ? '/HR' : 'FLAT'}</span>
                      <span style={{ color: 'rgba(34,211,238,.4)', fontSize: '.45rem', fontFamily: "var(--font-sans)" }}>→ DEBT REDUCTION WHEN POSTER MARKS DONE</span>
                    </div>
                    <div style={{ fontSize: '.45rem', color: 'rgba(34,211,238,.3)', fontFamily: "var(--font-sans)", marginTop: 3, letterSpacing: '.12em' }}>
                      BENEFITS: {l.posterOrgName ?? l.posterName} · YOUR DEBT DROPS WHEN COMPLETE ✓
                    </div>
                  </div>
                  <button
                    disabled={busyClaim !== null}
                    onClick={() => claimServiceListing(l)}
                    style={{ padding: '.4rem .9rem', background: 'rgba(34,211,238,.1)', border: '1px solid #22d3ee', color: '#22d3ee', cursor: busyClaim !== null ? 'not-allowed' : 'pointer', fontFamily: "var(--font-sans)", fontSize: '.6rem', letterSpacing: '.14em', opacity: busyClaim !== null ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                    {busyClaim === l.id ? '▒ CLAIMING ▒' : 'CLAIM GIG'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* BLUEPRINTS sub-tab */}
          {subTab === 'blueprints' && (
            <div style={{ display: 'flex', gap: '.8rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
                {orgPlans.length === 0 && (
                  <div style={{ color: 'rgba(34,211,238,.4)', fontSize: '.65rem', fontFamily: "var(--font-sans)", padding: '.6rem', border: '1px dashed rgba(34,211,238,.2)', lineHeight: 1.5 }}>
                    No org blueprints available. Check GIGS or CONSTRUCTION tab.
                  </div>
                )}
                {orgPlans.map(p => {
                  const done = p.tasks.filter(t => t.completed).length;
                  const total = p.tasks.length;
                  const isSel = p.id === selectedPlanId;
                  return (
                    <div key={p.id} onClick={() => setSelectedPlanId(p.id)}
                      style={{ padding: '.55rem', marginBottom: '.4rem', cursor: 'pointer', border: `1px solid ${isSel ? '#22d3ee' : 'rgba(34,211,238,.2)'}`, background: isSel ? 'rgba(34,211,238,.08)' : 'rgba(0,0,0,.4)' }}>
                      <div style={{ color: isSel ? '#22d3ee' : 'rgba(34,211,238,.85)', fontSize: '.72rem', fontFamily: "var(--font-sans)", letterSpacing: '.08em', marginBottom: 2 }}>{p.title}</div>
                      <div style={{ fontSize: '.5rem', color: '#22d3ee', fontFamily: "var(--font-sans)", letterSpacing: '.1em', marginBottom: 2, opacity: 0.75 }}>ORG: {p.owningOrgName ?? '—'}</div>
                      <div style={{ fontSize: '.5rem', color: 'rgba(34,211,238,.5)', letterSpacing: '.1em', fontFamily: "var(--font-sans)" }}>{done}/{total} DONE · ƒ{p.rewardPerTask}/TASK</div>
                      <div style={{ marginTop: 3, height: 3, background: 'rgba(34,211,238,.1)' }}>
                        <div style={{ width: `${total === 0 ? 0 : Math.floor(done / total * 100)}%`, height: '100%', background: '#22d3ee' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, border: '1px solid rgba(34,211,238,.15)', background: 'rgba(0,0,0,.35)', overflowY: 'auto' }}>
                {!selectedPlan ? (
                  <div style={{ margin: 'auto', color: 'rgba(34,211,238,.4)', fontSize: '.75rem', fontFamily: "var(--font-sans)", textAlign: 'center', padding: '2rem', letterSpacing: '.15em' }}>
                    &lt; SELECT A PLAN &gt;<br/><span style={{ fontSize: '.55rem', opacity: 0.7 }}>Tasks you complete benefit the posting org.</span>
                  </div>
                ) : (
                  <div style={{ padding: '.8rem' }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: '1.2rem', color: '#22d3ee', letterSpacing: '.12em' }}>{selectedPlan.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '.3rem 0', padding: '.25rem .5rem', background: 'rgba(34,211,238,.07)', border: '1px solid rgba(34,211,238,.3)' }}>
                      <span style={{ color: '#22d3ee', fontSize: '.55rem', fontFamily: "var(--font-sans)", letterSpacing: '.12em' }}>BENEFITS: <strong>{selectedPlan.owningOrgName ?? 'ORG'}</strong></span>
                      <span style={{ color: 'rgba(34,211,238,.5)', fontSize: '.5rem', fontFamily: "var(--font-sans)", marginLeft: 'auto' }}>YOUR DEBT DROPS ✓</span>
                    </div>
                    {selectedPlan.tasks.map(t => {
                      const isBuilding = busyPlan === t.id;
                      return (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', padding: '.4rem .5rem', marginBottom: '.3rem', border: `1px solid ${t.completed ? 'rgba(34,211,238,.3)' : isBuilding ? '#22d3ee' : 'rgba(34,211,238,.15)'}`, background: t.completed ? 'rgba(34,211,238,.04)' : 'rgba(0,0,0,.3)' }}>
                          <div>
                            <div style={{ color: t.completed ? '#22d3ee' : 'rgba(34,211,238,.8)', fontSize: '.65rem', fontFamily: "var(--font-sans)" }}>[{t.kind?.toUpperCase() ?? '?'}] {t.label}</div>
                            {t.completed && t.completedByName && <div style={{ fontSize: '.45rem', color: '#22d3ee', opacity: 0.6, fontFamily: "var(--font-sans)" }}>BUILT BY {t.completedByName}</div>}
                          </div>
                          {t.completed ? (
                            <div style={{ color: '#22d3ee', fontSize: '.55rem', fontFamily: "var(--font-sans)" }}>✓</div>
                          ) : isBuilding ? (
                            <div style={{ color: '#22d3ee', fontSize: '.55rem', fontFamily: "var(--font-sans)", animation: 'cfShame .7s steps(2) infinite' }}>▒ BUILDING ▒</div>
                          ) : (
                            <button disabled={!!busyPlan} onClick={() => buildPlanTask(selectedPlan, t.id)}
                              style={{ padding: '.3rem .7rem', background: 'rgba(34,211,238,.1)', border: '1px solid #22d3ee', color: '#22d3ee', cursor: busyPlan ? 'not-allowed' : 'pointer', fontFamily: "var(--font-sans)", fontSize: '.6rem', letterSpacing: '.12em', opacity: busyPlan ? 0.5 : 1 }}>
                              BUILD · +ƒ{selectedPlan.rewardPerTask}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONSTRUCTION sub-tab */}
          {subTab === 'construction' && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {orgProjects.length === 0 && (
                <div style={{ color: 'rgba(34,211,238,.4)', fontSize: '.65rem', fontFamily: "var(--font-sans)", padding: '.6rem', border: '1px dashed rgba(34,211,238,.2)', lineHeight: 1.5 }}>
                  No org construction projects accepting labor right now. Check GIGS or BLUEPRINTS tab.
                </div>
              )}
              {orgProjects.map(p => {
                const cd = cooldowns[p.id] ?? 0;
                const isBusy = busyProject === p.id;
                const pct = p.laborRequired > 0 ? Math.min(100, Math.round(p.laborApplied / p.laborRequired * 100)) : 0;
                const effectiveReward = p.rewardPerShift ?? SHIFT_REWARD_DEFAULT;
                const isBounty = !!p.rewardOverride && p.rewardOverride > SHIFT_REWARD_DEFAULT;
                return (
                  <div key={p.id} style={{ padding: '.7rem', marginBottom: '.5rem', border: `1px solid ${isBounty ? 'rgba(239,68,68,.5)' : isBusy ? '#22d3ee' : 'rgba(34,211,238,.2)'}`, background: isBounty ? 'rgba(239,68,68,.04)' : isBusy ? 'rgba(34,211,238,.06)' : 'rgba(0,0,0,.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <div style={{ color: '#22d3ee', fontSize: '.75rem', fontFamily: "var(--font-sans)", letterSpacing: '.08em' }}>{p.label}</div>
                        {isBounty && (
                          <div style={{ padding: '.1rem .4rem', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.7)', color: '#ef4444', fontSize: '.5rem', fontFamily: "var(--font-sans)", letterSpacing: '.12em', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                            BOUNTY: ƒ{effectiveReward.toLocaleString()}/SHIFT
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '.5rem', color: '#22d3ee', fontFamily: "var(--font-sans)", opacity: 0.75, marginBottom: 4, letterSpacing: '.1em' }}>
                        ORG: {p.owningOrgName ?? '—'} · TYPE: {p.buildingType?.toUpperCase() ?? '?'} · SHIFT: ƒ{effectiveReward.toLocaleString()}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: 'rgba(34,211,238,.1)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: isBounty ? '#ef4444' : '#22d3ee', transition: 'width .4s' }} />
                        </div>
                        <div style={{ fontSize: '.5rem', color: 'rgba(34,211,238,.6)', fontFamily: "var(--font-sans)", whiteSpace: 'nowrap' }}>{p.laborApplied}/{p.laborRequired} · {pct}%</div>
                      </div>
                      <div style={{ fontSize: '.45rem', color: 'rgba(34,211,238,.4)', fontFamily: "var(--font-sans)", marginTop: 3, letterSpacing: '.12em' }}>
                        YOUR DEBT DROPS (IF INCARCERATED) · ORG PROJECT ADVANCES · 12s COOLDOWN PER SHIFT
                      </div>
                    </div>
                    <button disabled={isBusy || busyProject !== null || cd > 0} onClick={() => workShift(p)}
                      style={{ padding: '.4rem 1rem', background: isBounty ? 'rgba(239,68,68,.12)' : 'rgba(34,211,238,.12)', border: `1px solid ${cd > 0 ? 'rgba(34,211,238,.3)' : isBounty ? '#ef4444' : '#22d3ee'}`, color: cd > 0 ? 'rgba(34,211,238,.4)' : isBounty ? '#ef4444' : '#22d3ee', cursor: (isBusy || busyProject !== null || cd > 0) ? 'not-allowed' : 'pointer', fontFamily: "var(--font-sans)", fontSize: '.65rem', letterSpacing: '.14em', opacity: (isBusy || busyProject !== null) ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                      {isBusy ? '▒ WORKING ▒' : cd > 0 ? `COOLDOWN ${Math.ceil(cd / 1000)}s` : `WORK SHIFT · +ƒ${effectiveReward.toLocaleString()}`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
