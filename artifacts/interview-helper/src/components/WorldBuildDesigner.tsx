import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

/**
 * WORLD DESIGNER — Picasso admin terminal for drafting world-build plans.
 *
 * Admins draft a plan (title, description, target region, area bounding box,
 * per-task reward), then add tasks — each a "place X at (clickable XY)"
 * instruction. Publishing the plan (status='active') makes it available to
 * Collections Facility inmates, who execute the tasks for ƒ against their
 * debt (see WorldBuildStation.tsx).
 *
 * The layout mirrors the rest of the admin terminals in the game — cyan
 * mono on near-black, Akira-tinged accents, deliberately dry UI.
 */

type Region = 'city' | 'wastes' | 'outlands' | 'subterranean' | 'aerial';
type Status = 'draft' | 'active' | 'completed' | 'archived';
type TaskKind = 'building' | 'road' | 'prop' | 'sign' | 'light' | 'tree' | 'custom';

type Task = {
  id: string;
  kind: TaskKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
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
  region: Region;
  status: Status;
  areaX: number;
  areaY: number;
  areaW: number;
  areaH: number;
  tasks: Task[];
  rewardPerTask: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

const REGIONS: Region[] = ['city', 'wastes', 'outlands', 'subterranean', 'aerial'];
const STATUSES: Status[] = ['draft', 'active', 'completed', 'archived'];
const KINDS: TaskKind[] = ['building', 'road', 'prop', 'sign', 'light', 'tree', 'custom'];

const BOX = { border: '1px solid rgba(56,189,248,.2)', background: 'rgba(0,6,2,.85)', padding: '.6rem', fontFamily: "var(--font-sans)" };
const BTN = (active = false): React.CSSProperties => ({
  padding: '.3rem .6rem', background: active ? 'rgba(56,189,248,.12)' : 'transparent',
  border: `1px solid ${active ? '#38bdf8' : 'rgba(56,189,248,.25)'}`,
  color: active ? '#38bdf8' : 'rgba(56,189,248,.7)',
  cursor: 'pointer', fontFamily: "var(--font-sans)", fontSize: '.65rem', letterSpacing: '.08em',
});
const INP: React.CSSProperties = {
  width: '100%', background: 'rgba(0,0,0,.5)', border: '1px solid rgba(56,189,248,.2)',
  color: '#cfe9ff', padding: '.35rem .5rem', fontFamily: "var(--font-sans)", fontSize: '.7rem',
  boxSizing: 'border-box',
};
const LBL: React.CSSProperties = { fontSize: '.5rem', color: 'rgba(56,189,248,.55)', letterSpacing: '.14em', marginBottom: 2 };

function newId(): string {
  return `t_${Math.random().toString(36).slice(2, 10)}`;
}

export function WorldBuildDesigner({ onClose }: { onClose: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | 'all'>('all');

  const fetchPlans = useCallback(async () => {
    try {
      const r = await apiFetch('/api/world-build/plans', { credentials: 'include' });
      if (!r.ok) return;
      const j = await r.json();
      setPlans(j.plans ?? []);
    } catch {}
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const selected = useMemo(() => plans.find(p => p.id === selectedId) ?? null, [plans, selectedId]);

  useEffect(() => {
    if (selected) setDraft(JSON.parse(JSON.stringify(selected)));
    else setDraft(null);
  }, [selected]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2400); };

  const createPlan = async () => {
    setBusy(true);
    try {
      const r = await apiFetch('/api/world-build/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: `UNTITLED PLAN ${new Date().toISOString().slice(0, 16)}`,
          region: 'city',
          status: 'draft',
          areaX: 6700, areaY: 6300, areaW: 400, areaH: 400,
          rewardPerTask: 2500,
          tasks: [],
        }),
      });
      const j = await r.json();
      if (r.ok && j.plan) {
        await fetchPlans();
        setSelectedId(j.plan.id);
        flash('> NEW PLAN DRAFTED');
      } else {
        flash(`> REJECTED: ${j.error ?? 'unknown'}`);
      }
    } finally { setBusy(false); }
  };

  const savePlan = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/world-build/plans/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          region: draft.region,
          status: draft.status,
          areaX: draft.areaX, areaY: draft.areaY, areaW: draft.areaW, areaH: draft.areaH,
          tasks: draft.tasks,
          rewardPerTask: draft.rewardPerTask,
        }),
      });
      const j = await r.json();
      if (r.ok && j.plan) {
        setPlans(prev => prev.map(p => p.id === j.plan.id ? j.plan : p));
        flash('> PLAN SAVED');
      } else {
        flash(`> REJECTED: ${j.error ?? 'unknown'}`);
      }
    } finally { setBusy(false); }
  };

  const deletePlan = async (id: number) => {
    if (!confirm('Delete this plan? All contribution records will be lost.')) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/world-build/plans/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) {
        setPlans(prev => prev.filter(p => p.id !== id));
        if (selectedId === id) setSelectedId(null);
        flash('> PLAN DELETED');
      }
    } finally { setBusy(false); }
  };

  const addTask = () => {
    if (!draft) return;
    const cx = draft.areaX + draft.areaW / 2;
    const cy = draft.areaY + draft.areaH / 2;
    setDraft({ ...draft, tasks: [...draft.tasks, { id: newId(), kind: 'building', x: cx, y: cy, w: 40, h: 40, label: 'NEW TASK' }] });
  };

  const updateTask = (idx: number, patch: Partial<Task>) => {
    if (!draft) return;
    const next = draft.tasks.slice();
    next[idx] = { ...next[idx], ...patch };
    setDraft({ ...draft, tasks: next });
  };

  const removeTask = (idx: number) => {
    if (!draft) return;
    setDraft({ ...draft, tasks: draft.tasks.filter((_, i) => i !== idx) });
  };

  const filteredPlans = useMemo(() => {
    if (filter === 'all') return plans;
    return plans.filter(p => p.status === filter);
  }, [plans, filter]);

  // Click-to-place on the mini preview
  const previewRef = useRef<SVGSVGElement | null>(null);
  const [placingKind, setPlacingKind] = useState<TaskKind | null>(null);
  const handlePreviewClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draft || !placingKind || !previewRef.current) return;
    const svg = previewRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    const nx = Math.round(p.x);
    const ny = Math.round(p.y);
    setDraft({
      ...draft,
      tasks: [...draft.tasks, { id: newId(), kind: placingKind, x: nx, y: ny, w: 40, h: 40, label: placingKind.toUpperCase() }],
    });
    setPlacingKind(null);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={onClose}>
      <div style={{ position: 'relative', width: '95vw', maxWidth: 1400, height: '90vh', background: 'rgba(0,6,2,.98)', border: '1px solid rgba(56,189,248,.3)', display: 'flex', flexDirection: 'column', fontFamily: "var(--font-sans)" }}
        onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.8rem 1rem', borderBottom: '1px solid rgba(56,189,248,.2)', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: '1.8rem', color: '#38bdf8', letterSpacing: '.2em' }}>WORLD DESIGNER</div>
            <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.12em' }}>PICASSO.AI · BLUEPRINT TERMINAL — DRAFT PLANS FOR INMATE LABOR</div>
          </div>
          <div style={{ display: 'flex', gap: '.4rem' }}>
            <button style={BTN()} onClick={createPlan} disabled={busy}>+ NEW PLAN</button>
            <button style={BTN()} onClick={onClose}>ESC</button>
          </div>
        </div>

        {toast && (
          <div style={{ position: 'absolute', top: 70, right: 20, background: 'rgba(34,211,238,.12)', border: '1px solid rgba(34,211,238,.5)', padding: '6px 14px', color: '#22d3ee', fontSize: '.65rem', letterSpacing: '.15em', zIndex: 5 }}>{toast}</div>
        )}

        {/* BODY — split: list | editor */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr', gap: '.8rem', padding: '.8rem', minHeight: 0 }}>
          {/* LEFT: plan list */}
          <div style={{ ...BOX, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', gap: '.2rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
              <button style={BTN(filter === 'all')} onClick={() => setFilter('all')}>ALL</button>
              {STATUSES.map(s => <button key={s} style={BTN(filter === s)} onClick={() => setFilter(s)}>{s.toUpperCase()}</button>)}
            </div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {filteredPlans.length === 0 && <div style={{ color: 'rgba(56,189,248,.4)', fontSize: '.65rem', padding: '.5rem' }}>NO PLANS. CLICK + NEW PLAN.</div>}
              {filteredPlans.map(p => {
                const done = p.tasks.filter(t => t.completed).length;
                const total = p.tasks.length;
                const isSel = p.id === selectedId;
                return (
                  <div key={p.id} onClick={() => setSelectedId(p.id)}
                    style={{ padding: '.5rem', marginBottom: '.3rem', cursor: 'pointer', border: `1px solid ${isSel ? '#38bdf8' : 'rgba(56,189,248,.15)'}`, background: isSel ? 'rgba(56,189,248,.08)' : 'transparent' }}>
                    <div style={{ color: isSel ? '#38bdf8' : 'rgba(56,189,248,.85)', fontSize: '.7rem', marginBottom: 2 }}>{p.title}</div>
                    <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.45)', letterSpacing: '.1em' }}>
                      {p.region.toUpperCase()} · {p.status.toUpperCase()} · {done}/{total} · ƒ{p.rewardPerTask}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: editor */}
          <div style={{ ...BOX, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            {!draft ? (
              <div style={{ color: 'rgba(56,189,248,.5)', fontSize: '.75rem', alignSelf: 'center', justifySelf: 'center', margin: 'auto', letterSpacing: '.14em' }}>
                &lt; SELECT A PLAN OR CREATE A NEW ONE &gt;
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 440px', gap: '.8rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {/* FORM */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', overflowY: 'auto', minHeight: 0, paddingRight: '.3rem' }}>
                  <div>
                    <div style={LBL}>TITLE</div>
                    <input style={INP} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
                  </div>
                  <div>
                    <div style={LBL}>DESCRIPTION — WHAT SHOULD THE INMATES BUILD AND WHY?</div>
                    <textarea style={{ ...INP, minHeight: 70, resize: 'vertical' }} value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value })} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem' }}>
                    <div>
                      <div style={LBL}>REGION</div>
                      <select style={INP} value={draft.region} onChange={e => setDraft({ ...draft, region: e.target.value as Region })}>
                        {REGIONS.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={LBL}>STATUS</div>
                      <select style={INP} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Status })}>
                        {STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={LBL}>ƒ PER TASK</div>
                      <input style={INP} type="number" min={100} max={10000} value={draft.rewardPerTask} onChange={e => setDraft({ ...draft, rewardPerTask: Math.max(100, Math.min(10000, parseInt(e.target.value) || 0)) })} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.5rem' }}>
                    <div><div style={LBL}>AREA X</div><input style={INP} type="number" value={draft.areaX} onChange={e => setDraft({ ...draft, areaX: parseInt(e.target.value) || 0 })} /></div>
                    <div><div style={LBL}>AREA Y</div><input style={INP} type="number" value={draft.areaY} onChange={e => setDraft({ ...draft, areaY: parseInt(e.target.value) || 0 })} /></div>
                    <div><div style={LBL}>AREA W</div><input style={INP} type="number" value={draft.areaW} onChange={e => setDraft({ ...draft, areaW: parseInt(e.target.value) || 0 })} /></div>
                    <div><div style={LBL}>AREA H</div><input style={INP} type="number" value={draft.areaH} onChange={e => setDraft({ ...draft, areaH: parseInt(e.target.value) || 0 })} /></div>
                  </div>

                  {/* TASK LIST */}
                  <div style={{ borderTop: '1px solid rgba(56,189,248,.12)', paddingTop: '.5rem', marginTop: '.2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                      <div style={{ color: 'rgba(56,189,248,.85)', fontSize: '.7rem', letterSpacing: '.12em' }}>TASKS ({draft.tasks.length})</div>
                      <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
                        <button style={BTN()} onClick={addTask}>+ ADD TASK</button>
                        {KINDS.map(k => (
                          <button key={k} style={BTN(placingKind === k)} onClick={() => setPlacingKind(placingKind === k ? null : k)}>
                            PLACE {k.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    {draft.tasks.length === 0 && (
                      <div style={{ color: 'rgba(56,189,248,.4)', fontSize: '.65rem', padding: '.5rem', border: '1px dashed rgba(56,189,248,.15)' }}>
                        No tasks yet. Click + ADD TASK or select a kind above and click on the preview to place it.
                      </div>
                    )}
                    {draft.tasks.map((t, i) => (
                      <div key={t.id} style={{ border: `1px solid ${t.completed ? 'rgba(34,211,238,.4)' : 'rgba(56,189,248,.15)'}`, padding: '.4rem', marginBottom: '.3rem', background: t.completed ? 'rgba(34,211,238,.05)' : 'transparent' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 60px 60px 60px 24px', gap: '.3rem', alignItems: 'center' }}>
                          <select style={{ ...INP, padding: '.25rem .3rem', fontSize: '.6rem' }} value={t.kind} onChange={e => updateTask(i, { kind: e.target.value as TaskKind })}>
                            {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                          </select>
                          <input style={{ ...INP, padding: '.25rem .3rem', fontSize: '.65rem' }} value={t.label} onChange={e => updateTask(i, { label: e.target.value })} />
                          <input style={{ ...INP, padding: '.25rem .3rem', fontSize: '.6rem' }} type="number" value={t.x} onChange={e => updateTask(i, { x: parseInt(e.target.value) || 0 })} title="x" />
                          <input style={{ ...INP, padding: '.25rem .3rem', fontSize: '.6rem' }} type="number" value={t.y} onChange={e => updateTask(i, { y: parseInt(e.target.value) || 0 })} title="y" />
                          <input style={{ ...INP, padding: '.25rem .3rem', fontSize: '.6rem' }} type="number" value={t.w ?? 0} onChange={e => updateTask(i, { w: parseInt(e.target.value) || 0 })} title="w" />
                          <input style={{ ...INP, padding: '.25rem .3rem', fontSize: '.6rem' }} type="number" value={t.h ?? 0} onChange={e => updateTask(i, { h: parseInt(e.target.value) || 0 })} title="h" />
                          <button style={{ ...BTN(), padding: '.2rem .3rem', color: '#ff6677', borderColor: 'rgba(255,102,119,.4)' }} onClick={() => removeTask(i)} title="Remove">×</button>
                        </div>
                        {t.completed && (
                          <div style={{ fontSize: '.5rem', color: '#22d3ee', marginTop: 3, letterSpacing: '.1em' }}>
                            ✓ BUILT BY {t.completedByName ?? 'unknown'} · {t.completedAt ? new Date(t.completedAt).toLocaleString() : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem' }}>
                    <button style={{ ...BTN(), color: '#22d3ee', borderColor: '#22d3ee' }} onClick={savePlan} disabled={busy}>SAVE PLAN</button>
                    <button style={{ ...BTN(), color: '#ff6677', borderColor: 'rgba(255,102,119,.4)' }} onClick={() => deletePlan(draft.id)} disabled={busy}>DELETE</button>
                  </div>
                </div>

                {/* PREVIEW — click-to-place scratch pad */}
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={LBL}>PREVIEW · CLICK-TO-PLACE {placingKind ? `(${placingKind.toUpperCase()})` : '— pick a kind above to place'}</div>
                  <svg ref={previewRef} viewBox={`${draft.areaX - 20} ${draft.areaY - 20} ${draft.areaW + 40} ${draft.areaH + 40}`}
                    style={{ width: '100%', flex: 1, minHeight: 280, border: '1px solid rgba(56,189,248,.15)', background: '#00020a', cursor: placingKind ? 'crosshair' : 'default' }}
                    onClick={handlePreviewClick}
                    preserveAspectRatio="xMidYMid meet">
                    <rect x={draft.areaX} y={draft.areaY} width={draft.areaW} height={draft.areaH} fill="rgba(56,189,248,.03)" stroke="rgba(56,189,248,.25)" strokeDasharray="6 4" />
                    <text x={draft.areaX + 4} y={draft.areaY - 4} fill="rgba(56,189,248,.5)" fontSize={Math.max(8, draft.areaW / 40)} fontFamily="var(--font-sans)">AREA · {draft.region.toUpperCase()}</text>
                    {draft.tasks.map(t => {
                      const w = t.w && t.w > 0 ? t.w : 20;
                      const h = t.h && t.h > 0 ? t.h : 20;
                      const col = t.completed ? '#22d3ee' : '#f472b6';
                      return (
                        <g key={t.id}>
                          <rect x={t.x - w / 2} y={t.y - h / 2} width={w} height={h} fill={t.completed ? 'rgba(34,211,238,.15)' : 'rgba(244,114,182,.1)'} stroke={col} strokeWidth={1.2} />
                          <text x={t.x} y={t.y + 3} textAnchor="middle" fill={col} fontSize={Math.max(6, draft.areaW / 60)} fontFamily="var(--font-sans)">{t.label.substring(0, 14)}</text>
                        </g>
                      );
                    })}
                  </svg>
                  <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.4)', marginTop: '.3rem', letterSpacing: '.1em' }}>
                    WORLD COORDS · PLAN ID {draft.id} · SLUG {draft.slug}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
