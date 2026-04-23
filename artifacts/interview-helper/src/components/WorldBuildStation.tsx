import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

/**
 * WORLD BUILDER STATION — CF labor activity.
 *
 * Inmates see a list of active admin-authored plans. They pick one, see
 * every pending task with a quick preview of where it goes in the world,
 * and click BUILD on any unclaimed task. Each completion pays the plan's
 * rewardPerTask off their debt (capped at remaining debt) and records a
 * contribution so inmates get credit for rebuilding the world.
 *
 * Mirrors the other CF stations in structure — shares toast callbacks
 * and onComplete triggers the parent to refresh debt state.
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
};

export function WorldBuildStation({
  onComplete,
  onToast,
}: {
  onComplete: (payoff: number, debt: number, freed: boolean) => void;
  onToast: (msg: string) => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [buildingTaskId, setBuildingTaskId] = useState<string | null>(null);
  const [myTotal, setMyTotal] = useState<{ count: number; totalPayoff: number } | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      const r = await apiFetch('/api/world-build/plans', { credentials: 'include' });
      if (!r.ok) return;
      const j = await r.json();
      setPlans((j.plans ?? []).filter((p: Plan) => p.status === 'active'));
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

  useEffect(() => { fetchPlans(); fetchMyStats(); }, [fetchPlans, fetchMyStats]);

  const selected = useMemo(() => plans.find(p => p.id === selectedId) ?? null, [plans, selectedId]);

  const buildTask = async (planId: number, taskId: string) => {
    if (busy) return;
    setBusy(true);
    setBuildingTaskId(taskId);
    try {
      // Small animated delay so the BUILD action feels like real labor
      // instead of an instant click. 1.4s matches the shortest CF cooldown.
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
      onToast(`✓ BUILT · -ƒ${(j.payoff ?? 0).toLocaleString()} OFF DEBT`);
      onComplete(j.payoff ?? 0, j.debt ?? 0, !!j.freed);
      await Promise.all([fetchPlans(), fetchMyStats()]);
    } finally {
      setBusy(false);
      setBuildingTaskId(null);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '1rem', width: '100%', height: '100%', padding: '1rem 1.5rem', boxSizing: 'border-box' }}>
      {/* LEFT: plan list */}
      <div style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.4rem', color: '#f472b6', letterSpacing: '.18em', marginBottom: '.3rem' }}>
          WORLD BUILDER
        </div>
        <div style={{ fontSize: '.55rem', color: 'rgba(244,114,182,.5)', letterSpacing: '.12em', marginBottom: '.6rem' }}>
          PICASSO BLUEPRINTS · YOU BUILD · DEBT DROPS
        </div>
        {myTotal && (
          <div style={{ border: '1px solid rgba(244,114,182,.2)', padding: '.4rem .5rem', marginBottom: '.6rem', background: 'rgba(244,114,182,.04)' }}>
            <div style={{ fontSize: '.5rem', color: 'rgba(244,114,182,.55)', letterSpacing: '.14em' }}>YOUR RECORD</div>
            <div style={{ fontSize: '.8rem', color: '#f472b6', fontFamily: "'Share Tech Mono',monospace" }}>
              {myTotal.count} TASKS · ƒ{myTotal.totalPayoff.toLocaleString()}
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {plans.length === 0 && (
            <div style={{ color: 'rgba(244,114,182,.5)', fontSize: '.7rem', padding: '.6rem', border: '1px dashed rgba(244,114,182,.2)', lineHeight: 1.5 }}>
              NO ACTIVE BLUEPRINTS.<br/>
              The Picasso admins haven't published any build orders yet.
            </div>
          )}
          {plans.map(p => {
            const done = p.tasks.filter(t => t.completed).length;
            const total = p.tasks.length;
            const isSel = p.id === selectedId;
            return (
              <div key={p.id} onClick={() => setSelectedId(p.id)}
                style={{ padding: '.55rem', marginBottom: '.4rem', cursor: 'pointer', border: `1px solid ${isSel ? '#f472b6' : 'rgba(244,114,182,.2)'}`, background: isSel ? 'rgba(244,114,182,.08)' : 'rgba(0,0,0,.4)' }}>
                <div style={{ color: isSel ? '#f472b6' : 'rgba(244,114,182,.85)', fontSize: '.72rem', fontFamily: "'Share Tech Mono',monospace", letterSpacing: '.08em', marginBottom: 3 }}>{p.title}</div>
                <div style={{ fontSize: '.52rem', color: 'rgba(244,114,182,.55)', letterSpacing: '.12em', fontFamily: "'Share Tech Mono',monospace" }}>
                  {p.region.toUpperCase()} · {done}/{total} BUILT · ƒ{p.rewardPerTask} / TASK
                </div>
                <div style={{ marginTop: 4, height: 3, background: 'rgba(244,114,182,.1)', overflow: 'hidden' }}>
                  <div style={{ width: `${total === 0 ? 0 : Math.floor((done / total) * 100)}%`, height: '100%', background: '#f472b6' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: plan detail */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, border: '1px solid rgba(244,114,182,.15)', background: 'rgba(0,0,0,.35)' }}>
        {!selected ? (
          <div style={{ margin: 'auto', color: 'rgba(244,114,182,.5)', fontSize: '.8rem', letterSpacing: '.2em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'center', padding: '2rem' }}>
            &lt; SELECT A BLUEPRINT &gt;<br/>
            <span style={{ fontSize: '.6rem', opacity: 0.6 }}>Every task you finish pulls ƒ off your debt.</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* TASK LIST */}
            <div style={{ display: 'flex', flexDirection: 'column', padding: '.7rem .9rem', minHeight: 0, overflow: 'hidden' }}>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.3rem', color: '#f472b6', letterSpacing: '.14em' }}>{selected.title}</div>
              <div style={{ fontSize: '.55rem', color: 'rgba(244,114,182,.5)', letterSpacing: '.12em', marginBottom: '.3rem' }}>
                {selected.region.toUpperCase()} · DRAFTED BY {selected.createdByName ?? 'UNKNOWN'} · ƒ{selected.rewardPerTask} PER TASK
              </div>
              {selected.description && (
                <div style={{ fontSize: '.65rem', color: 'rgba(244,114,182,.75)', fontFamily: "'Share Tech Mono',monospace", padding: '.4rem .5rem', border: '1px solid rgba(244,114,182,.15)', background: 'rgba(244,114,182,.04)', marginBottom: '.5rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {selected.description}
                </div>
              )}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {selected.tasks.length === 0 && (
                  <div style={{ color: 'rgba(244,114,182,.5)', fontSize: '.7rem', padding: '.6rem' }}>This plan has no tasks yet.</div>
                )}
                {selected.tasks.map(t => {
                  const isBuilding = buildingTaskId === t.id;
                  return (
                    <div key={t.id} style={{ border: `1px solid ${t.completed ? 'rgba(34,211,238,.3)' : isBuilding ? '#f472b6' : 'rgba(244,114,182,.2)'}`, padding: '.5rem .6rem', marginBottom: '.4rem', background: t.completed ? 'rgba(34,211,238,.05)' : isBuilding ? 'rgba(244,114,182,.1)' : 'rgba(0,0,0,.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: t.completed ? '#22d3ee' : '#f472b6', fontSize: '.7rem', fontFamily: "'Share Tech Mono',monospace", letterSpacing: '.06em' }}>
                          <span style={{ opacity: 0.6, marginRight: 8 }}>[{t.kind.toUpperCase()}]</span>{t.label}
                        </div>
                        <div style={{ fontSize: '.5rem', color: 'rgba(244,114,182,.4)', letterSpacing: '.1em', marginTop: 2 }}>
                          @ ({t.x}, {t.y}){t.w && t.h ? ` · ${t.w}×${t.h}` : ''}
                          {t.completed && t.completedByName && <span style={{ color: '#22d3ee', marginLeft: 8 }}>· BUILT BY {t.completedByName}</span>}
                        </div>
                      </div>
                      {t.completed ? (
                        <div style={{ color: '#22d3ee', fontSize: '.6rem', letterSpacing: '.2em', fontFamily: "'Share Tech Mono',monospace" }}>✓ DONE</div>
                      ) : isBuilding ? (
                        <div style={{ color: '#f472b6', fontSize: '.6rem', letterSpacing: '.2em', fontFamily: "'Share Tech Mono',monospace", animation: 'cfShame .7s steps(2) infinite' }}>▒▒ BUILDING ▒▒</div>
                      ) : (
                        <button
                          onClick={() => buildTask(selected.id, t.id)}
                          disabled={busy}
                          style={{ padding: '.35rem .9rem', background: 'rgba(244,114,182,.15)', border: '1px solid #f472b6', color: '#f472b6', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.7rem', letterSpacing: '.16em', opacity: busy ? 0.5 : 1 }}>
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
                style={{ width: '100%', flex: 1, minHeight: 220, border: '1px solid rgba(244,114,182,.15)', background: '#00020a' }}
                preserveAspectRatio="xMidYMid meet">
                <rect x={selected.areaX} y={selected.areaY} width={selected.areaW} height={selected.areaH} fill="rgba(244,114,182,.03)" stroke="rgba(244,114,182,.25)" strokeDasharray="6 4" />
                {selected.tasks.map(t => {
                  const w = t.w && t.w > 0 ? t.w : 20;
                  const h = t.h && t.h > 0 ? t.h : 20;
                  const col = t.completed ? '#22d3ee' : buildingTaskId === t.id ? '#ffbb33' : '#f472b6';
                  return (
                    <g key={t.id}>
                      <rect x={t.x - w / 2} y={t.y - h / 2} width={w} height={h}
                        fill={t.completed ? 'rgba(34,211,238,.15)' : 'rgba(244,114,182,.08)'}
                        stroke={col} strokeWidth={1.2} />
                      <text x={t.x} y={t.y + 3} textAnchor="middle" fill={col} fontSize={Math.max(6, selected.areaW / 60)} fontFamily="Share Tech Mono">{t.label.substring(0, 14)}</text>
                    </g>
                  );
                })}
              </svg>
              <div style={{ fontSize: '.5rem', color: 'rgba(244,114,182,.4)', marginTop: '.3rem', letterSpacing: '.1em' }}>
                MAGENTA · TO BUILD · CYAN · COMPLETED · AMBER · BUILDING NOW
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
