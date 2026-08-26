import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

/**
 * WORLD BUILDER STATION — CF labor activity.
 *
 * Shows two tabs:
 *   PABLO COMMUNITY — admin-authored plans (default pool, always present)
 *   FOR HIRE        — org-owned plans open to debtor labor (may be empty)
 *
 * Inmates pick a plan, see every pending task, and click BUILD. Each
 * completion pays the plan's rewardPerTask off their debt (capped at
 * remaining debt) and records a contribution. The "FOR HIRE" tasks also
 * advance the benefiting org's project progress.
 */

type TaskKind = 'building' | 'road' | 'prop' | 'sign' | 'light' | 'tree' | 'custom';
type Task = {
  id: string;
  kind: TaskKind;
  x: number; y: number; w?: number; h?: number;
  label: string;
  notes?: string;
  completed?: boolean;
  completedByName?: string | null;
  completedAt?: string | null;
};
type Plan = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  region: string;
  status: string;
  areaX: number; areaY: number; areaW: number; areaH: number;
  tasks: Task[];
  rewardPerTask: number;
  createdByName: string | null;
  owningOrgId: string | null;
  owningOrgName: string | null;
  openToDebtorLabor: boolean;
};

export function WorldBuildStation({
  onComplete,
  onToast,
}: {
  onComplete: (payoff: number, debt: number, freed: boolean) => void;
  onToast: (msg: string) => void;
}) {
  const [pabloPlans, setPabloPlans] = useState<Plan[]>([]);
  const [orgPlans, setOrgPlans] = useState<Plan[]>([]);
  const [tab, setTab] = useState<'pablo' | 'forhire'>('pablo');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [buildingTaskId, setBuildingTaskId] = useState<string | null>(null);
  const [myTotal, setMyTotal] = useState<{ count: number; totalPayoff: number } | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const r = await apiFetch('/api/cf/labor-sources', { credentials: 'include' });
      if (!r.ok) return;
      const j = await r.json();
      // Pablo plans from labor-sources
      const pablo = (j.pabloCommunity ?? j.pabloPlans ?? []) as Plan[];
      setPabloPlans(pablo.filter((p: Plan) => p.status === 'active' || !p.status));
      // Org world-build plans from for-hire
      const orgWb = (j.forHire?.worldBuildPlans ?? []) as Plan[];
      setOrgPlans(orgWb.filter((p: Plan) => p.status === 'active' || !p.status));
    } catch {}
  }, []);

  const fetchMyStats = useCallback(async () => {
    try {
      const r = await apiFetch('/api/world-build/my-contributions', { credentials: 'include' });
      if (!r.ok) return;
      const j = await r.json();
      setMyTotal({ count: j.count ?? 0, totalPayoff: j.totalPayoff ?? 0 });
    } catch {}
  }, []);

  useEffect(() => { fetchSources(); fetchMyStats(); }, [fetchSources, fetchMyStats]);

  const activePlans = tab === 'pablo' ? pabloPlans : orgPlans;
  const selected = useMemo(() => activePlans.find(p => p.id === selectedId) ?? null, [activePlans, selectedId]);

  const buildTask = async (planId: number, taskId: string, orgName: string | null) => {
    if (busy) return;
    setBusy(true);
    setBuildingTaskId(taskId);
    try {
      await new Promise(r => setTimeout(r, 1400));
      const r = await apiFetch(`/api/world-build/plans/${planId}/complete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskId }),
      });
      const j = await r.json();
      if (!r.ok) {
        onToast(`REJECTED: ${j.error ?? 'unknown'}`);
        return;
      }
      const forWho = orgName ? ` → ${orgName}` : ' → PABLO CORP';
      onToast(`✓ BUILT · -ƒ${(j.payoff ?? 0).toLocaleString()} OFF DEBT${forWho}`);
      onComplete(j.payoff ?? 0, j.debt ?? 0, !!j.freed);
      await Promise.all([fetchSources(), fetchMyStats()]);
    } finally {
      setBusy(false);
      setBuildingTaskId(null);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '1rem', width: '100%', height: '100%', padding: '1rem 1.5rem', boxSizing: 'border-box' }}>
      {/* LEFT: plan list + tab switcher */}
      <div style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: '1.4rem', color: '#f472b6', letterSpacing: '.18em', marginBottom: '.3rem' }}>
          WORLD BUILDER
        </div>
        <div style={{ fontSize: '.55rem', color: 'rgba(244,114,182,.5)', letterSpacing: '.12em', marginBottom: '.5rem' }}>
          BLUEPRINTS · YOU BUILD · DEBT DROPS
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, marginBottom: '.5rem' }}>
          <button
            onClick={() => { setTab('pablo'); setSelectedId(null); }}
            style={{ flex: 1, padding: '.3rem', fontFamily: "var(--font-sans)", fontSize: '.55rem', letterSpacing: '.1em', cursor: 'pointer', border: `1px solid ${tab === 'pablo' ? '#f472b6' : 'rgba(244,114,182,.25)'}`, background: tab === 'pablo' ? 'rgba(244,114,182,.12)' : 'rgba(0,0,0,.3)', color: tab === 'pablo' ? '#f472b6' : 'rgba(244,114,182,.55)' }}>
            PABLO COMMUNITY
          </button>
          <button
            onClick={() => { setTab('forhire'); setSelectedId(null); }}
            style={{ flex: 1, padding: '.3rem', fontFamily: "var(--font-sans)", fontSize: '.55rem', letterSpacing: '.1em', cursor: 'pointer', border: `1px solid ${tab === 'forhire' ? '#22d3ee' : 'rgba(34,211,238,.25)'}`, background: tab === 'forhire' ? 'rgba(34,211,238,.12)' : 'rgba(0,0,0,.3)', color: tab === 'forhire' ? '#22d3ee' : 'rgba(34,211,238,.55)', position: 'relative' }}>
            FOR HIRE
            {orgPlans.length > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#22d3ee', color: '#000', fontSize: '.45rem', fontFamily: "var(--font-sans)", padding: '1px 4px', borderRadius: 2 }}>{orgPlans.length}</span>
            )}
          </button>
        </div>

        {myTotal && (
          <div style={{ border: '1px solid rgba(244,114,182,.2)', padding: '.4rem .5rem', marginBottom: '.6rem', background: 'rgba(244,114,182,.04)' }}>
            <div style={{ fontSize: '.5rem', color: 'rgba(244,114,182,.55)', letterSpacing: '.14em' }}>YOUR RECORD</div>
            <div style={{ fontSize: '.8rem', color: '#f472b6', fontFamily: "var(--font-sans)" }}>
              {myTotal.count} TASKS · ƒ{myTotal.totalPayoff.toLocaleString()}
            </div>
          </div>
        )}

        {tab === 'forhire' && orgPlans.length === 0 && (
          <div style={{ color: 'rgba(34,211,238,.5)', fontSize: '.65rem', padding: '.6rem', border: '1px dashed rgba(34,211,238,.2)', lineHeight: 1.6, marginBottom: '.4rem', fontFamily: "var(--font-sans)" }}>
            NO FOR-HIRE REQUESTS.<br/>
            <span style={{ opacity: 0.7 }}>No orgs have posted labor requests yet. Switch to PABLO COMMUNITY to work off your debt.</span>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {tab === 'pablo' && activePlans.length === 0 && (
            <div style={{ color: 'rgba(244,114,182,.5)', fontSize: '.7rem', padding: '.6rem', border: '1px dashed rgba(244,114,182,.2)', lineHeight: 1.5 }}>
              NO ACTIVE BLUEPRINTS.<br/>
              The Picasso admins haven't published any build orders yet.
            </div>
          )}
          {activePlans.map(p => {
            const done = p.tasks.filter(t => t.completed).length;
            const total = p.tasks.length;
            const isSel = p.id === selectedId;
            const accentColor = tab === 'forhire' ? '#22d3ee' : '#f472b6';
            return (
              <div key={p.id} onClick={() => setSelectedId(p.id)}
                style={{ padding: '.55rem', marginBottom: '.4rem', cursor: 'pointer', border: `1px solid ${isSel ? accentColor : `rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.2)`}`, background: isSel ? `rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.08)` : 'rgba(0,0,0,.4)' }}>
                <div style={{ color: isSel ? accentColor : `rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.85)`, fontSize: '.72rem', fontFamily: "var(--font-sans)", letterSpacing: '.08em', marginBottom: 3 }}>{p.title}</div>
                {tab === 'forhire' && p.owningOrgName && (
                  <div style={{ fontSize: '.5rem', color: '#22d3ee', letterSpacing: '.12em', fontFamily: "var(--font-sans)", marginBottom: 2, opacity: 0.85 }}>
                    ORG: {p.owningOrgName}
                  </div>
                )}
                <div style={{ fontSize: '.52rem', color: `rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.55)`, letterSpacing: '.12em', fontFamily: "var(--font-sans)" }}>
                  {p.region.toUpperCase()} · {done}/{total} BUILT · ƒ{p.rewardPerTask} / TASK
                </div>
                <div style={{ marginTop: 4, height: 3, background: `rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.1)`, overflow: 'hidden' }}>
                  <div style={{ width: `${total === 0 ? 0 : Math.floor((done / total) * 100)}%`, height: '100%', background: accentColor }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: plan detail */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, border: `1px solid rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.15)`, background: 'rgba(0,0,0,.35)' }}>
        {!selected ? (
          <div style={{ margin: 'auto', color: `rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.5)`, fontSize: '.8rem', letterSpacing: '.2em', fontFamily: "var(--font-sans)", textAlign: 'center', padding: '2rem' }}>
            &lt; SELECT A BLUEPRINT &gt;<br/>
            <span style={{ fontSize: '.6rem', opacity: 0.6 }}>
              {tab === 'forhire'
                ? 'FOR-HIRE work benefits the posting org. Your debt still drops.'
                : 'Every task you finish pulls ƒ off your debt.'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* TASK LIST */}
            <div style={{ display: 'flex', flexDirection: 'column', padding: '.7rem .9rem', minHeight: 0, overflow: 'hidden' }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: '1.3rem', color: tab === 'forhire' ? '#22d3ee' : '#f472b6', letterSpacing: '.14em' }}>{selected.title}</div>

              {/* Beneficiary banner for org plans */}
              {selected.owningOrgName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '.2rem 0 .3rem', padding: '.25rem .5rem', background: 'rgba(34,211,238,.07)', border: '1px solid rgba(34,211,238,.3)' }}>
                  <span style={{ color: '#22d3ee', fontSize: '.55rem', fontFamily: "var(--font-sans)", letterSpacing: '.12em' }}>
                    BENEFITS: <strong>{selected.owningOrgName}</strong>
                  </span>
                  <span style={{ color: 'rgba(34,211,238,.5)', fontSize: '.5rem', fontFamily: "var(--font-sans)", marginLeft: 'auto' }}>
                    YOUR DEBT STILL DROPS ✓
                  </span>
                </div>
              )}
              {!selected.owningOrgName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '.2rem 0 .3rem', padding: '.25rem .5rem', background: 'rgba(244,114,182,.05)', border: '1px solid rgba(244,114,182,.2)' }}>
                  <span style={{ color: 'rgba(244,114,182,.7)', fontSize: '.55rem', fontFamily: "var(--font-sans)", letterSpacing: '.12em' }}>
                    BENEFITS: <strong>PABLO CORP / COMMUNITY</strong>
                  </span>
                </div>
              )}

              <div style={{ fontSize: '.55rem', color: `rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.5)`, letterSpacing: '.12em', marginBottom: '.3rem' }}>
                {selected.region.toUpperCase()} · DRAFTED BY {selected.createdByName ?? 'UNKNOWN'} · ƒ{selected.rewardPerTask} PER TASK
              </div>
              {selected.description && (
                <div style={{ fontSize: '.65rem', color: `rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.75)`, fontFamily: "var(--font-sans)", padding: '.4rem .5rem', border: `1px solid rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.15)`, background: `rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.04)`, marginBottom: '.5rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {selected.description}
                </div>
              )}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {selected.tasks.length === 0 && (
                  <div style={{ color: 'rgba(244,114,182,.5)', fontSize: '.7rem', padding: '.6rem' }}>This plan has no tasks yet.</div>
                )}
                {selected.tasks.map(t => {
                  const isBuilding = buildingTaskId === t.id;
                  const accentColor = tab === 'forhire' ? '#22d3ee' : '#f472b6';
                  const accentRgb = tab === 'forhire' ? '34,211,238' : '244,114,182';
                  return (
                    <div key={t.id} style={{ border: `1px solid ${t.completed ? 'rgba(34,211,238,.3)' : isBuilding ? accentColor : `rgba(${accentRgb},.2)`}`, padding: '.5rem .6rem', marginBottom: '.4rem', background: t.completed ? 'rgba(34,211,238,.05)' : isBuilding ? `rgba(${accentRgb},.1)` : 'rgba(0,0,0,.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: t.completed ? '#22d3ee' : accentColor, fontSize: '.7rem', fontFamily: "var(--font-sans)", letterSpacing: '.06em' }}>
                          <span style={{ opacity: 0.6, marginRight: 8 }}>[{t.kind.toUpperCase()}]</span>{t.label}
                        </div>
                        <div style={{ fontSize: '.5rem', color: `rgba(${accentRgb},.4)`, letterSpacing: '.1em', marginTop: 2 }}>
                          @ ({t.x}, {t.y}){t.w && t.h ? ` · ${t.w}×${t.h}` : ''}
                          {t.completed && t.completedByName && <span style={{ color: '#22d3ee', marginLeft: 8 }}>· BUILT BY {t.completedByName}</span>}
                        </div>
                      </div>
                      {t.completed ? (
                        <div style={{ color: '#22d3ee', fontSize: '.6rem', letterSpacing: '.2em', fontFamily: "var(--font-sans)" }}>✓ DONE</div>
                      ) : isBuilding ? (
                        <div style={{ color: accentColor, fontSize: '.6rem', letterSpacing: '.2em', fontFamily: "var(--font-sans)", animation: 'cfShame .7s steps(2) infinite' }}>▒▒ BUILDING ▒▒</div>
                      ) : (
                        <button
                          onClick={() => buildTask(selected.id, t.id, selected.owningOrgName ?? null)}
                          disabled={busy}
                          style={{ padding: '.35rem .9rem', background: `rgba(${accentRgb},.15)`, border: `1px solid ${accentColor}`, color: accentColor, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: "var(--font-sans)", fontSize: '.7rem', letterSpacing: '.16em', opacity: busy ? 0.5 : 1 }}>
                          BUILD · +ƒ{selected.rewardPerTask}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PREVIEW */}
            <div style={{ display: 'flex', flexDirection: 'column', padding: '.7rem .8rem .7rem 0', minHeight: 0 }}>
              <div style={{ fontSize: '.5rem', color: 'rgba(244,114,182,.5)', letterSpacing: '.14em', marginBottom: 3 }}>SITE PLAN</div>
              <svg viewBox={`${selected.areaX - 20} ${selected.areaY - 20} ${selected.areaW + 40} ${selected.areaH + 40}`}
                style={{ width: '100%', flex: 1, minHeight: 220, border: `1px solid rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.15)`, background: '#00020a' }}
                preserveAspectRatio="xMidYMid meet">
                <rect x={selected.areaX} y={selected.areaY} width={selected.areaW} height={selected.areaH} fill={`rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.03)`} stroke={`rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.25)`} strokeDasharray="6 4" />
                {selected.tasks.map(t => {
                  const w = t.w && t.w > 0 ? t.w : 20;
                  const h = t.h && t.h > 0 ? t.h : 20;
                  const col = t.completed ? '#22d3ee' : buildingTaskId === t.id ? '#ffbb33' : (tab === 'forhire' ? '#22d3ee' : '#f472b6');
                  return (
                    <g key={t.id}>
                      <rect x={t.x - w / 2} y={t.y - h / 2} width={w} height={h}
                        fill={t.completed ? 'rgba(34,211,238,.15)' : `rgba(${tab === 'forhire' ? '34,211,238' : '244,114,182'},.08)`}
                        stroke={col} strokeWidth={1.2} />
                      <text x={t.x} y={t.y + 3} textAnchor="middle" fill={col} fontSize={Math.max(6, selected.areaW / 60)} fontFamily="var(--font-sans)">{t.label.substring(0, 14)}</text>
                    </g>
                  );
                })}
              </svg>
              <div style={{ fontSize: '.5rem', color: 'rgba(244,114,182,.4)', marginTop: '.3rem', letterSpacing: '.1em' }}>
                {tab === 'forhire' ? 'CYAN' : 'MAGENTA'} · TO BUILD · CYAN · COMPLETED · AMBER · BUILDING NOW
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
