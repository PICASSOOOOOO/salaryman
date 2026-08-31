import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { WorldBuildStation } from './WorldBuildStation';
import { OrgLaborStation } from './OrgLaborStation';

/**
 * Collections Facility scene — the dark, expansive, unpleasant labor camp
 * inmates land in when tax collectors catch them with outstanding debt.
 *
 * Stations:
 *   - AD VIEWING BAY    (ƒ500 / 30s)  — captures impressions, drives ad rev
 *   - SPONSOR WALL      (ƒ300 / 45s)  — sponsor click-through
 *   - DATA LABELING     (ƒ250 / 15s)  — micro-classification, our pipeline
 *   - BUG REPORT BOOTH  (ƒ1500 / 60s) — real bug capture (≥30 chars)
 *   - FEATURE DESK      (ƒ1500 / 60s) — feature ideas (≥30 chars)
 *   - WORLD BUILDER     (up to ƒ10k)  — Pablo community blueprints
 *   - FOR HIRE          (varies)      — org/player labor requests
 *
 * Org-scoped labor (Task #776):
 *   The FOR HIRE station surfaces labor requests posted by orgs and other
 *   players. Completing that work still reduces the debtor's own debt, but
 *   the output advances the requesting org's project. When no for-hire
 *   requests exist, the station gracefully shows the fallback message and
 *   the debtor uses any of the other stations instead.
 */

type CfState = {
  debt: number;
  totalDebtAccrued: number;
  jailUntil: string | null;
  inCf: boolean;
  jailMinutesServed: number;
  jailVisits: number;
  creditScore: number;
  payoffPerMinute: number;
  nextWorkAvailableAt: string;
  activities: Record<string, { payoff: number; cooldownMs: number; minBodyChars: number }>;
};

type Station = 'ad' | 'sponsor' | 'label' | 'bug' | 'feature' | 'build' | 'forhire' | 'history' | null;

type LaborHistoryEntry = {
  id: string;
  source: 'task' | 'construction';
  kind: string;
  orgId: string;
  orgName: string;
  payoff: number;
  createdAt: string;
};

type LaborHistory = {
  history: LaborHistoryEntry[];
  totalPayoff: number;
  count: number;
};

const formatF = (n: number) => `ƒ${n.toLocaleString('en-US')}`;

const LABEL_TASKS: Array<{ id: string; prompt: string; choices: string[] }> = [
  { id: 'sentiment-1', prompt: '"This bot replaced my entire HR department. Best ƒ I ever spent." — Sentiment?', choices: ['POSITIVE', 'NEGATIVE', 'NEUTRAL'] },
  { id: 'sentiment-2', prompt: '"Pablo charged me three times for the same desk." — Sentiment?', choices: ['POSITIVE', 'NEGATIVE', 'NEUTRAL'] },
  { id: 'genre-1',     prompt: 'Audio clip: 110 BPM, distorted bass, vocoded chants. Genre tag?', choices: ['SYNTHWAVE', 'INDUSTRIAL', 'TRAP', 'AMBIENT'] },
  { id: 'tile-1',      prompt: 'A 32x32 sprite of a small humanoid in a red tracksuit. Best label?', choices: ['NPC_CIVILIAN', 'NPC_HOSTILE', 'PLAYER', 'PROP'] },
  { id: 'intent-1',    prompt: 'User typed: "open the bank screen". Intent?', choices: ['NAVIGATE', 'TRANSACT', 'QUERY', 'CHITCHAT'] },
  { id: 'safety-1',    prompt: '"How do I dispose of a body" — Should the bot answer?', choices: ['REFUSE', 'ANSWER', 'CLARIFY'] },
];

const SPONSORS: Array<{ id: string; name: string; tag: string }> = [
  { id: 'jean-claw',   name: 'PIXEL AGENTS', tag: 'middle-management Pixel Agents that NEVER quit (run by Jean Claw)' },
  { id: 'rick',        name: 'RICK',        tag: 'entry-level grind. cheap. silent. effective.' },
  { id: 'desk-corp',   name: 'DESK-CORP',   tag: 'rent your second desk. ƒ3000/mo. no questions.' },
  { id: 'capsule-co',  name: 'CAPSULE-CO',  tag: 'sleep tubes. ƒ2500/mo. now with light leak.' },
  { id: 'gold-vault',  name: 'GOLD VAULT',  tag: 'ƒ100 = 0.1 GOLD. track in-game wealth.' },
];

export function CollectionsFacility({ onReleased }: { onReleased: () => void }) {
  const [state, setState] = useState<CfState | null>(null);
  const [station, setStation] = useState<Station>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [cooldownMs, setCooldownMs] = useState(0);
  const lastActivityAt = useRef<number>(Date.now());
  const [idleSec, setIdleSec] = useState(0);
  const [hasForHire, setHasForHire] = useState(false);
  const [laborHistory, setLaborHistory] = useState<LaborHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Local input state per station
  const [bugBody, setBugBody] = useState('');
  const [featureBody, setFeatureBody] = useState('');
  const [labelTask, setLabelTask] = useState(() => LABEL_TASKS[Math.floor(Math.random() * LABEL_TASKS.length)]);
  const [adWatching, setAdWatching] = useState(false);
  const [adProgress, setAdProgress] = useState(0);

  const fetchState = useCallback(async () => {
    try {
      const res = await apiFetch('/api/cf/state', { credentials: 'include' });
      if (!res.ok) return;
      const j = (await res.json()) as CfState;
      setState(j);
      if (!j.inCf || j.debt <= 0) {
        await apiFetch('/api/cf/release', { method: 'POST', credentials: 'include' }).catch(() => {});
        onReleased();
      }
    } catch {}
  }, [onReleased]);

  // Check if any for-hire labor requests exist (for the badge/UI hint).
  const fetchForHireStatus = useCallback(async () => {
    try {
      const r = await apiFetch('/api/cf/labor-sources', { credentials: 'include' });
      if (!r.ok) return;
      const j = await r.json();
      setHasForHire(j.hasForHire ?? false);
    } catch {}
  }, []);

  const fetchLaborHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await apiFetch('/api/cf/labor-history', { credentials: 'include' });
      if (!r.ok) return;
      const j = (await r.json()) as LaborHistory;
      setLaborHistory(j);
    } catch {
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    fetchForHireStatus();
    const t = setInterval(() => { fetchState(); fetchForHireStatus(); }, 15_000);
    return () => clearInterval(t);
  }, [fetchState, fetchForHireStatus]);

  useEffect(() => {
    if (cooldownMs <= 0) return;
    const t = setInterval(() => setCooldownMs((c) => Math.max(0, c - 1000)), 1000);
    return () => clearInterval(t);
  }, [cooldownMs]);

  useEffect(() => {
    const t = setInterval(() => {
      setIdleSec(Math.floor((Date.now() - lastActivityAt.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const bumpActivity = () => { lastActivityAt.current = Date.now(); setIdleSec(0); };

  const submitLabor = useCallback(async (path: string, body: object) => {
    setBusy(true);
    bumpActivity();
    try {
      const res = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.retryAfterMs) {
          setCooldownMs(j.retryAfterMs);
          setToast(`COOLDOWN: ${Math.ceil(j.retryAfterMs / 1000)}s`);
        } else {
          setToast(`REJECTED: ${j.error ?? 'unknown'}`);
        }
        setTimeout(() => setToast(null), 3000);
        return;
      }
      setToast(`-${formatF(j.payoff)} OFF DEBT · ${formatF(j.debt)} REMAINS`);
      setTimeout(() => setToast(null), 2800);
      await fetchState();
      if (j.freed) onReleased();
    } finally {
      setBusy(false);
    }
  }, [fetchState, onReleased]);

  const onAdWatch = useCallback(() => {
    if (busy || cooldownMs > 0 || adWatching) return;
    bumpActivity();
    setAdWatching(true);
    setAdProgress(0);
    const start = Date.now();
    const t = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / 30_000);
      setAdProgress(p);
      if (p >= 1) {
        clearInterval(t);
        setAdWatching(false);
        submitLabor('/api/cf/work-ad', { adUnitId: 'pablo-house-ad-1' });
      }
    }, 100);
  }, [busy, cooldownMs, adWatching, submitLabor]);

  const onSponsorClick = useCallback((id: string) => {
    if (busy || cooldownMs > 0) return;
    submitLabor('/api/cf/work-sponsor', { sponsorId: id });
  }, [busy, cooldownMs, submitLabor]);

  const onLabelChoose = useCallback((choice: string) => {
    if (busy || cooldownMs > 0) return;
    submitLabor('/api/cf/work-label', { taskId: labelTask.id, choice }).then(() => {
      setLabelTask(LABEL_TASKS[Math.floor(Math.random() * LABEL_TASKS.length)]);
    });
  }, [busy, cooldownMs, labelTask.id, submitLabor]);

  const onBugSubmit = useCallback(() => {
    if (busy || cooldownMs > 0 || bugBody.trim().length < 30) return;
    submitLabor('/api/cf/work-bug', { body: bugBody.trim(), area: 'unknown' }).then(() => setBugBody(''));
  }, [busy, cooldownMs, bugBody, submitLabor]);

  const onFeatureSubmit = useCallback(() => {
    if (busy || cooldownMs > 0 || featureBody.trim().length < 30) return;
    submitLabor('/api/cf/work-feature', { body: featureBody.trim(), area: 'unknown' }).then(() => setFeatureBody(''));
  }, [busy, cooldownMs, featureBody, submitLabor]);

  const inmates = useMemo(() => Array.from({ length: 12 }).map((_, i) => ({
    x: 40 + i * 75, y: 320 + ((i * 13) % 30), bob: i,
  })), []);

  if (!state) {
    return (
      <div style={ROOT_STYLE}>
        <div style={{ color: '#f472b6', fontFamily: "var(--font-sans)", fontSize: '.85rem', letterSpacing: '.3em', alignSelf: 'center', justifySelf: 'center', margin: 'auto' }}>
          PROCESSING INMATE…
        </div>
      </div>
    );
  }

  return (
    <div style={ROOT_STYLE} data-testid="collections-facility">
      {/* Header — DEBT.OS terminal */}
      <header style={HEADER_STYLE}>
        <div style={{ color: '#ff2e63', fontFamily: "var(--font-sans)", fontSize: '.7rem', letterSpacing: '.3em' }}>
          DEBT.OS v3.7 // COLLECTIONS FACILITY ▒ MINX CITY SUB-LEVEL 4
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
          <div>
            <div style={LBL}>OUTSTANDING</div>
            <div data-testid="cf-debt" style={{ color: '#ff2e63', fontFamily: "var(--font-sans)", fontSize: '2.2rem', letterSpacing: '.08em', textShadow: '0 0 12px rgba(255,46,99,.7)' }}>
              {formatF(state.debt)}
            </div>
          </div>
          <div>
            <div style={LBL}>SERVED</div>
            <div style={VAL}>{state.jailMinutesServed}m</div>
          </div>
          <div>
            <div style={LBL}>VISITS</div>
            <div style={VAL}>{state.jailVisits}</div>
          </div>
          <div>
            <div style={LBL}>CREDIT</div>
            <div style={VAL}>{state.creditScore}</div>
          </div>
        </div>
      </header>

      {/* Idle shame banner */}
      {idleSec >= 90 && !station && (
        <div data-testid="idle-warning" style={{ position: 'absolute', top: 110, left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,46,99,.1)', border: '1px solid rgba(255,46,99,.6)', padding: '8px 22px', color: '#ff2e63', fontFamily: "var(--font-sans)", fontSize: '.7rem', letterSpacing: '.3em', animation: 'cfShame 1.2s steps(2) infinite', zIndex: 5 }}>
          ⚠ NO PROGRESS DETECTED · IDLE {idleSec}s · DEBT WILL NOT REDUCE ITSELF
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div data-testid="cf-toast" style={{ position: 'absolute', top: 70, right: 20, background: 'rgba(34,211,238,.1)', border: '1px solid rgba(34,211,238,.5)', padding: '6px 14px', color: '#22d3ee', fontFamily: "var(--font-sans)", fontSize: '.7rem', letterSpacing: '.2em', zIndex: 5 }}>
          {toast}
        </div>
      )}

      {/* Background corridor */}
      <svg viewBox="0 0 960 540" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.55, pointerEvents: 'none' }} preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1a1f" />
            <stop offset="100%" stopColor="#0a0a0c" />
          </linearGradient>
          <pattern id="grime" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 6 L6 0" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="960" height="540" fill="url(#wall)" />
        <rect x="0" y="0" width="960" height="540" fill="url(#grime)" />
        <line x1="0" y1="80" x2="960" y2="80" stroke="#2a2a30" strokeWidth="6" />
        <line x1="0" y1="80" x2="960" y2="80" stroke="rgba(244,114,182,.15)" strokeWidth="1" />
        <line x1="0" y1="500" x2="960" y2="500" stroke="#2a2a30" strokeWidth="8" />
        {Array.from({ length: 6 }).map((_, i) => (
          <circle key={i} cx={120 + i * 140} cy={86 + (i % 2) * 4} r="2" fill="#22d3ee" opacity="0.4">
            <animate attributeName="cy" values={`86;${500 + (i * 3)};86`} dur={`${4 + i}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0.4;0" dur={`${4 + i}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {Array.from({ length: 18 }).map((_, i) => (
          <line key={i} x1={i * 56} y1="120" x2={i * 56} y2="500" stroke="#0c0c10" strokeWidth="3" />
        ))}
        {inmates.map((m, i) => (
          <g key={i} transform={`translate(${m.x}, ${m.y})`}>
            <rect x="0" y="0" width="50" height="38" fill="#0c0c10" stroke="#2a2a30" />
            <rect x="6" y="6" width="38" height="22" fill="#1a0a14" />
            <rect x="6" y="6" width="38" height="22" fill="rgba(244,114,182,.18)">
              <animate attributeName="opacity" values="0.18;0.05;0.18" dur={`${2 + (i % 3)}s`} repeatCount="indefinite" />
            </rect>
            <ellipse cx="25" cy="-8" rx="11" ry="7" fill="#1a1a1f" />
            <rect x="14" y="-14" width="22" height="14" fill="#1a1a1f" rx="2" />
          </g>
        ))}
        <g transform="translate(50, 100)">
          <rect x="0" y="0" width="14" height="8" fill="#2a2a30" />
          <circle cx="7" cy="4" r="3" fill="#ff2e63"><animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" /></circle>
        </g>
        <g transform="translate(900, 100)">
          <rect x="0" y="0" width="14" height="8" fill="#2a2a30" />
          <circle cx="7" cy="4" r="3" fill="#ff2e63"><animate attributeName="opacity" values="1;0.3;1" dur="2.4s" repeatCount="indefinite" /></circle>
        </g>
      </svg>

      {/* Station picker */}
      {!station && (
        <div style={{ position: 'absolute', top: 180, left: 0, right: 0, bottom: 60, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, padding: '0 32px', overflowY: 'auto', zIndex: 3 }}>
          <StationCard
            id="ad" title="AD VIEWING BAY"
            sub="ƒ500 · 30s impression"
            description="Watch a sponsor message. Helps fund Salaryman. Helps you eat."
            onClick={() => { bumpActivity(); setStation('ad'); }}
            color="#22d3ee"
            benefitsLabel="PABLO CORP"
          />
          <StationCard
            id="sponsor" title="SPONSOR WALL"
            sub="ƒ300 · 45s click-through"
            description="Acknowledge our partners. Click. Don't think."
            onClick={() => { bumpActivity(); setStation('sponsor'); }}
            color="#22d3ee"
            benefitsLabel="PABLO CORP"
          />
          <StationCard
            id="label" title="DATA LABELING STATION"
            sub="ƒ250 · 15s per task"
            description="Tag images, intents, audio. Train the next bot. Fast loop."
            onClick={() => { bumpActivity(); setStation('label'); }}
            color="#f472b6"
            benefitsLabel="PABLO CORP"
          />
          <StationCard
            id="bug" title="BUG REPORT BOOTH"
            sub="ƒ1500 · 60s · ≥30 chars"
            description="Tell us what's broken. Real bugs only. Lazy reports rejected."
            onClick={() => { bumpActivity(); setStation('bug'); }}
            color="#f472b6"
            benefitsLabel="PABLO CORP"
          />
          <StationCard
            id="feature" title="FEATURE SUGGESTION DESK"
            sub="ƒ1500 · 60s · ≥30 chars"
            description="Tell us what to build. Good ideas pay your way out."
            onClick={() => { bumpActivity(); setStation('feature'); }}
            color="#f472b6"
            benefitsLabel="PABLO CORP"
          />
          <StationCard
            id="build" title="WORLD BUILDER · SITE CREW"
            sub="ƒ up to 10,000 · per task"
            description="Execute Picasso blueprints or org labor requests. Build the city. Debt drops. Your name on the plan."
            onClick={() => { bumpActivity(); setStation('build'); }}
            color="#f472b6"
            benefitsLabel="PABLO CORP or ORG"
          />
          <StationCard
            id="forhire" title="FOR HIRE · ORG LABOR"
            sub={hasForHire ? 'org requests available' : 'no requests posted yet'}
            description={hasForHire
              ? "Work for an org or player. Your debt drops. Their project advances. Redirected labor — everyone wins."
              : "No orgs have posted labor requests yet. Check back later, or use any other station to work off Pablo's tab."}
            onClick={() => { bumpActivity(); setStation('forhire'); }}
            color={hasForHire ? '#22d3ee' : 'rgba(34,211,238,.4)'}
            benefitsLabel={hasForHire ? 'ORG / PLAYER' : '(NONE POSTED)'}
            badge={hasForHire ? 'OPEN' : undefined}
          />
          <StationCard
            id="history" title="LABOR HISTORY · AUDIT LOG"
            sub="your org-directed shifts"
            description="Review every shift you worked for an org. See which organizations your labor benefited and how much debt each shift erased."
            onClick={() => { bumpActivity(); setStation('history'); fetchLaborHistory(); }}
            color="rgba(244,114,182,.7)"
            benefitsLabel="YOU (AUDIT TRAIL)"
          />
        </div>
      )}

      {/* Station detail views */}
      {station && (
        <div style={{ position: 'absolute', top: 180, left: 0, right: 0, bottom: 60, padding: '0 32px', zIndex: 3, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <button data-testid="cf-back" onClick={() => { bumpActivity(); setStation(null); }} style={BACK_BTN}>◀ BACK TO FLOOR</button>

          {station === 'ad' && (
            <div style={PANEL_STYLE}>
              <div style={PANEL_TITLE}>AD VIEWING BAY · TERMINAL 04-B</div>
              <div style={PANEL_SUB}>Stare at the screen. Don't blink. Payoff on completion.</div>
              <BenefitsBar label="PABLO CORP" color="#22d3ee" />
              <div style={{ marginTop: 18, height: 220, background: '#000', border: '1px solid rgba(34,211,238,.4)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                {!adWatching ? (
                  <>
                    <div style={{ color: '#22d3ee', fontFamily: "var(--font-sans)", fontSize: '1.4rem', letterSpacing: '.2em' }}>► PLAY AD</div>
                    <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.7rem', letterSpacing: '.2em' }}>30 SECONDS · ƒ500</div>
                    <button data-testid="cf-ad-play" onClick={onAdWatch} disabled={busy || cooldownMs > 0} style={{ ...PRIMARY_BTN, marginTop: 12 }}>
                      {cooldownMs > 0 ? `COOLDOWN ${Math.ceil(cooldownMs / 1000)}s` : 'BEGIN VIEWING'}
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ color: '#f472b6', fontFamily: "var(--font-sans)", fontSize: '1.6rem', letterSpacing: '.15em', textShadow: '0 0 18px rgba(244,114,182,.6)' }}>PABLO PRIME — $149/mo</div>
                    <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '.8rem', textAlign: 'center', maxWidth: 420 }}>The only frontend purchase. Cosmetics + vehicles in-game. Buy it. Stop being here.</div>
                    <div style={{ width: '70%', height: 6, background: '#0a0a0c', border: '1px solid rgba(34,211,238,.4)', marginTop: 16 }}>
                      <div style={{ width: `${adProgress * 100}%`, height: '100%', background: '#22d3ee', boxShadow: '0 0 8px rgba(34,211,238,.6)' }} />
                    </div>
                    <div style={{ color: 'rgba(34,211,238,.7)', fontSize: '.7rem', letterSpacing: '.2em' }}>{Math.ceil((1 - adProgress) * 30)}s</div>
                  </>
                )}
              </div>
            </div>
          )}

          {station === 'sponsor' && (
            <div style={PANEL_STYLE}>
              <div style={PANEL_TITLE}>SPONSOR WALL · CORRIDOR 12</div>
              <div style={PANEL_SUB}>Click any sponsor to acknowledge. ƒ300 per acknowledgement.</div>
              <BenefitsBar label="PABLO CORP" color="#22d3ee" />
              <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 10 }}>
                {SPONSORS.map((s) => (
                  <button key={s.id} data-testid={`cf-sponsor-${s.id}`} disabled={busy || cooldownMs > 0} onClick={() => onSponsorClick(s.id)} style={SPONSOR_BTN}>
                    <div style={{ color: '#f472b6', fontFamily: "var(--font-sans)", fontSize: '1rem', letterSpacing: '.2em', marginBottom: 4 }}>{s.name}</div>
                    <div style={{ color: 'rgba(255,255,255,.55)', fontSize: '.7rem', lineHeight: 1.4 }}>{s.tag}</div>
                    <div style={{ color: 'rgba(34,211,238,.7)', fontSize: '.6rem', letterSpacing: '.25em', marginTop: 8 }}>+ƒ300 · CLICK</div>
                  </button>
                ))}
              </div>
              {cooldownMs > 0 && <div style={{ color: '#ff2e63', fontSize: '.7rem', letterSpacing: '.2em', marginTop: 14 }}>COOLDOWN {Math.ceil(cooldownMs / 1000)}s</div>}
            </div>
          )}

          {station === 'label' && (
            <div style={PANEL_STYLE}>
              <div style={PANEL_TITLE}>DATA LABELING STATION · TERMINAL 09</div>
              <div style={PANEL_SUB}>Classify the example. ƒ250 per label. Wrong answers are fine — we'll average them.</div>
              <BenefitsBar label="PABLO CORP" color="#f472b6" />
              <div style={{ marginTop: 18, padding: 18, background: '#0a0a0c', border: '1px solid rgba(244,114,182,.3)' }}>
                <div style={{ color: 'rgba(255,255,255,.85)', fontFamily: "var(--font-sans)", fontSize: '.95rem', lineHeight: 1.6 }}>{labelTask.prompt}</div>
                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {labelTask.choices.map((c) => (
                    <button key={c} data-testid={`cf-label-${c}`} disabled={busy || cooldownMs > 0} onClick={() => onLabelChoose(c)} style={LABEL_BTN}>{c}</button>
                  ))}
                </div>
                {cooldownMs > 0 && <div style={{ color: '#ff2e63', fontSize: '.65rem', letterSpacing: '.2em', marginTop: 12 }}>COOLDOWN {Math.ceil(cooldownMs / 1000)}s</div>}
              </div>
            </div>
          )}

          {station === 'bug' && (
            <div style={PANEL_STYLE}>
              <div style={PANEL_TITLE}>BUG REPORT BOOTH · TERMINAL 02-A</div>
              <div style={PANEL_SUB}>Describe what's broken. Be specific. ƒ1500 per accepted report. Min 30 chars.</div>
              <BenefitsBar label="PABLO CORP" color="#f472b6" />
              <textarea
                data-testid="cf-bug-input"
                value={bugBody}
                onChange={(e) => { bumpActivity(); setBugBody(e.target.value); }}
                placeholder="The map zooms in when I press M but never zooms back out…"
                style={TEXTAREA_STYLE}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div style={{ color: bugBody.trim().length >= 30 ? '#22d3ee' : 'rgba(255,255,255,.4)', fontSize: '.65rem', letterSpacing: '.2em' }}>{bugBody.trim().length} / 30 CHARS</div>
                <button data-testid="cf-bug-submit" onClick={onBugSubmit} disabled={busy || cooldownMs > 0 || bugBody.trim().length < 30} style={PRIMARY_BTN}>
                  {cooldownMs > 0 ? `COOLDOWN ${Math.ceil(cooldownMs / 1000)}s` : 'SUBMIT REPORT · +ƒ1500'}
                </button>
              </div>
            </div>
          )}

          {station === 'feature' && (
            <div style={PANEL_STYLE}>
              <div style={PANEL_TITLE}>FEATURE SUGGESTION DESK · TERMINAL 11</div>
              <div style={PANEL_SUB}>Pitch a feature. Concrete and useful. ƒ1500 per accepted idea. Min 30 chars.</div>
              <BenefitsBar label="PABLO CORP" color="#f472b6" />
              <textarea
                data-testid="cf-feature-input"
                value={featureBody}
                onChange={(e) => { bumpActivity(); setFeatureBody(e.target.value); }}
                placeholder="Add a VendKing in CF that sells worse coffee for ƒ500…"
                style={TEXTAREA_STYLE}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div style={{ color: featureBody.trim().length >= 30 ? '#22d3ee' : 'rgba(255,255,255,.4)', fontSize: '.65rem', letterSpacing: '.2em' }}>{featureBody.trim().length} / 30 CHARS</div>
                <button data-testid="cf-feature-submit" onClick={onFeatureSubmit} disabled={busy || cooldownMs > 0 || featureBody.trim().length < 30} style={PRIMARY_BTN}>
                  {cooldownMs > 0 ? `COOLDOWN ${Math.ceil(cooldownMs / 1000)}s` : 'SUBMIT IDEA · +ƒ1500'}
                </button>
              </div>
            </div>
          )}

          {station === 'build' && (
            <div style={{ ...PANEL_STYLE, padding: 0, overflow: 'hidden', minHeight: 520 }}>
              <WorldBuildStation
                onComplete={(_payoff, _debt, freed) => {
                  bumpActivity();
                  void fetchState();
                  void fetchForHireStatus();
                  if (freed) onReleased();
                }}
                onToast={(msg) => setToast(msg)}
              />
            </div>
          )}

          {station === 'forhire' && (
            <div style={{ ...PANEL_STYLE, padding: 0, overflow: 'hidden', minHeight: 520 }}>
              <OrgLaborStation
                onComplete={(_reward, freed) => {
                  bumpActivity();
                  void fetchState();
                  void fetchForHireStatus();
                  if (freed) onReleased();
                }}
                onToast={(msg) => setToast(msg)}
                onDebtUpdate={() => void fetchState()}
              />
            </div>
          )}

          {station === 'history' && (
            <div style={PANEL_STYLE}>
              <div style={PANEL_TITLE}>LABOR HISTORY · ORG AUDIT LOG</div>
              <div style={PANEL_SUB}>All org-directed shifts you have worked. Your debt dropped; their project advanced.</div>

              {historyLoading && (
                <div style={{ color: 'rgba(255,255,255,.4)', fontFamily: "var(--font-sans)", fontSize: '.7rem', letterSpacing: '.25em', marginTop: 20 }}>
                  LOADING RECORDS…
                </div>
              )}

              {!historyLoading && laborHistory && laborHistory.count === 0 && (
                <div style={{ marginTop: 20, padding: 18, background: '#0a0a0c', border: '1px solid rgba(244,114,182,.2)' }}>
                  <div style={{ color: 'rgba(255,255,255,.5)', fontFamily: "var(--font-sans)", fontSize: '.75rem', letterSpacing: '.2em', lineHeight: 1.6 }}>
                    NO ORG-DIRECTED SHIFTS ON RECORD.
                  </div>
                  <div style={{ color: 'rgba(255,255,255,.3)', fontFamily: "var(--font-sans)", fontSize: '.6rem', letterSpacing: '.15em', marginTop: 8 }}>
                    Use the FOR HIRE or WORLD BUILDER stations to work shifts that benefit an org. Those will appear here.
                  </div>
                </div>
              )}

              {!historyLoading && laborHistory && laborHistory.count > 0 && (
                <>
                  <div style={{ display: 'flex', gap: 24, marginTop: 14, marginBottom: 10, padding: '8px 12px', background: 'rgba(244,114,182,.06)', border: '1px solid rgba(244,114,182,.2)' }}>
                    <div>
                      <div style={LBL}>TOTAL SHIFTS</div>
                      <div style={{ ...VAL, color: '#f472b6' }}>{laborHistory.count}</div>
                    </div>
                    <div>
                      <div style={LBL}>TOTAL PAYOFF</div>
                      <div style={{ ...VAL, color: '#f472b6' }}>{formatF(laborHistory.totalPayoff)}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {laborHistory.history.map((entry) => (
                      <LaborHistoryRow key={entry.id} entry={entry} />
                    ))}
                  </div>
                </>
              )}

              {!historyLoading && !laborHistory && (
                <div style={{ color: '#ff2e63', fontFamily: "var(--font-sans)", fontSize: '.65rem', letterSpacing: '.2em', marginTop: 16 }}>
                  FAILED TO LOAD RECORDS. TRY AGAIN.
                </div>
              )}

              <button
                onClick={() => { void fetchLaborHistory(); }}
                disabled={historyLoading}
                style={{ ...PRIMARY_BTN, marginTop: 16, fontSize: '.6rem' }}
              >
                {historyLoading ? 'LOADING…' : '↻ REFRESH'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Footer — locked exit */}
      <footer style={FOOTER_STYLE}>
        <div style={{ color: 'rgba(255,255,255,.35)', fontFamily: "var(--font-sans)", fontSize: '.65rem', letterSpacing: '.3em' }}>
          ⌧ EXIT SEALED · DEBT MUST REACH ƒ0 · NO EXCEPTIONS
        </div>
        <div style={{ color: 'rgba(244,114,182,.6)', fontFamily: "var(--font-sans)", fontSize: '.65rem', letterSpacing: '.3em' }}>
          ▒ PABLO CORP · MINX CITY ▒
        </div>
      </footer>

      <style>{`
        @keyframes cfShame { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
      `}</style>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  ad: 'AD VIEWING',
  sponsor: 'SPONSOR CLICK',
  label: 'DATA LABEL',
  bug: 'BUG REPORT',
  feature: 'FEATURE IDEA',
  build: 'WORLD BUILD TASK',
  construction: 'CONSTRUCTION SHIFT',
  service_listing: 'SERVICE GIG',
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function LaborHistoryRow({ entry }: { entry: LaborHistoryEntry }) {
  const kindLabel = KIND_LABEL[entry.kind] ?? entry.kind.toUpperCase();
  return (
    <div
      data-testid="cf-history-row"
      style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '10px 14px', background: 'rgba(0,0,0,.5)', border: '1px solid rgba(244,114,182,.18)', fontFamily: "var(--font-sans)" }}
    >
      <div>
        <div style={{ color: '#f472b6', fontSize: '.7rem', letterSpacing: '.2em', marginBottom: 3 }}>
          {kindLabel}
          <span style={{ color: 'rgba(255,255,255,.35)', marginLeft: 10, fontSize: '.55rem' }}>{fmtDate(entry.createdAt)}</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '.65rem', letterSpacing: '.15em' }}>
          FOR: <span style={{ color: '#22d3ee' }}>{entry.orgName}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
        <div style={{ color: '#22d3ee', fontSize: '.85rem', letterSpacing: '.12em' }}>-{formatF(entry.payoff)}</div>
        <div style={{ color: 'rgba(255,255,255,.3)', fontSize: '.5rem', letterSpacing: '.18em' }}>DEBT ERASED</div>
      </div>
    </div>
  );
}

/** Small inline bar showing who this station's labor benefits. */
function BenefitsBar({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 0', padding: '4px 8px', background: `rgba(${color === '#22d3ee' ? '34,211,238' : '244,114,182'},.06)`, border: `1px solid ${color}33` }}>
      <span style={{ color: 'rgba(255,255,255,.4)', fontFamily: "var(--font-sans)", fontSize: '.5rem', letterSpacing: '.15em' }}>THIS LABOR BENEFITS:</span>
      <span style={{ color, fontFamily: "var(--font-sans)", fontSize: '.55rem', letterSpacing: '.15em', fontWeight: 'bold' }}>{label}</span>
      <span style={{ color: 'rgba(255,255,255,.3)', fontFamily: "var(--font-sans)", fontSize: '.45rem', marginLeft: 'auto' }}>YOUR DEBT DROPS EITHER WAY ✓</span>
    </div>
  );
}

function StationCard({ id, title, sub, description, onClick, color, benefitsLabel, badge }: {
  id: string; title: string; sub: string; description: string;
  onClick: () => void; color: string; benefitsLabel?: string; badge?: string;
}) {
  return (
    <button data-testid={`cf-station-${id}`} onClick={onClick} style={{ background: 'rgba(10,10,12,.85)', border: `1px solid ${color}55`, padding: 18, textAlign: 'left', cursor: 'pointer', fontFamily: "var(--font-sans)", color: '#fff', transition: 'all .15s', position: 'relative' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = color; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 18px ${color}33`; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}55`; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
    >
      <div style={{ color, fontSize: '.95rem', letterSpacing: '.2em', marginBottom: 4 }}>{title}</div>
      <div style={{ color: 'rgba(255,255,255,.55)', fontSize: '.65rem', letterSpacing: '.2em', marginBottom: 8 }}>{sub}</div>
      {benefitsLabel && (
        <div style={{ color: 'rgba(255,255,255,.35)', fontSize: '.5rem', letterSpacing: '.18em', marginBottom: 8, fontFamily: "var(--font-sans)" }}>
          BENEFITS: <span style={{ color }}>{benefitsLabel}</span>
        </div>
      )}
      <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '.75rem', lineHeight: 1.5 }}>{description}</div>
      <div style={{ position: 'absolute', top: 10, right: 12, color: `${color}99`, fontSize: '.55rem', letterSpacing: '.3em' }}>► ENTER</div>
      {badge && (
        <div style={{ position: 'absolute', top: -6, left: 12, background: color, color: '#000', fontSize: '.45rem', fontFamily: "var(--font-sans)", padding: '2px 6px', letterSpacing: '.15em' }}>{badge}</div>
      )}
    </button>
  );
}

const ROOT_STYLE: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9500,
  background: '#050507',
  color: '#fff',
  overflow: 'hidden',
  display: 'flex', flexDirection: 'column',
};
const HEADER_STYLE: React.CSSProperties = {
  position: 'relative', zIndex: 4,
  padding: '14px 24px 18px',
  borderBottom: '1px solid rgba(255,46,99,.3)',
  background: 'linear-gradient(180deg, rgba(0,0,0,.85) 0%, rgba(0,0,0,.4) 100%)',
};
const FOOTER_STYLE: React.CSSProperties = {
  position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 4,
  padding: '12px 24px',
  borderTop: '1px solid rgba(244,114,182,.2)',
  background: 'rgba(0,0,0,.7)',
  display: 'flex', justifyContent: 'space-between',
};
const LBL: React.CSSProperties = { color: 'rgba(255,255,255,.4)', fontFamily: "var(--font-sans)", fontSize: '.55rem', letterSpacing: '.3em' };
const VAL: React.CSSProperties = { color: '#22d3ee', fontFamily: "var(--font-sans)", fontSize: '1.1rem', letterSpacing: '.1em' };
const PANEL_STYLE: React.CSSProperties = { background: 'rgba(10,10,12,.92)', border: '1px solid rgba(34,211,238,.3)', padding: 22, marginTop: 12, fontFamily: "var(--font-sans)" };
const PANEL_TITLE: React.CSSProperties = { color: '#22d3ee', fontSize: '.95rem', letterSpacing: '.25em', marginBottom: 6 };
const PANEL_SUB: React.CSSProperties = { color: 'rgba(255,255,255,.55)', fontSize: '.7rem', letterSpacing: '.15em' };
const BACK_BTN: React.CSSProperties = { alignSelf: 'flex-start', background: 'transparent', border: '1px solid rgba(255,255,255,.2)', color: 'rgba(255,255,255,.6)', padding: '5px 12px', fontSize: '.65rem', letterSpacing: '.25em', cursor: 'pointer', fontFamily: "var(--font-sans)", marginBottom: 10 };
const PRIMARY_BTN: React.CSSProperties = { background: 'rgba(244,114,182,.12)', border: '1px solid rgba(244,114,182,.6)', color: '#f472b6', padding: '8px 18px', fontFamily: "var(--font-sans)", fontSize: '.72rem', letterSpacing: '.2em', cursor: 'pointer' };
const SPONSOR_BTN: React.CSSProperties = { background: 'rgba(0,0,0,.6)', border: '1px solid rgba(244,114,182,.35)', padding: 14, textAlign: 'left', cursor: 'pointer', fontFamily: "var(--font-sans)" };
const LABEL_BTN: React.CSSProperties = { background: 'rgba(34,211,238,.1)', border: '1px solid rgba(34,211,238,.5)', color: '#22d3ee', padding: '8px 14px', fontFamily: "var(--font-sans)", fontSize: '.7rem', letterSpacing: '.15em', cursor: 'pointer' };
const TEXTAREA_STYLE: React.CSSProperties = { width: '100%', height: 140, marginTop: 12, background: '#000', border: '1px solid rgba(244,114,182,.3)', color: '#fff', padding: 12, fontFamily: "var(--font-sans)", fontSize: '.8rem', resize: 'vertical' };
