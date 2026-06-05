/**
 * /office — Pablo's cinematic office. Full-bleed Nano Banana scene_office
 * background rendered through OfficeStage, with the crew (Pablo, Jean Claw,
 * and each real team member) shown as moody character portrait cards.
 *
 * Wrapped in GameLock by the router so it inherits the same game-state
 * gating as /world/play, /game, etc.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { PixelOffice } from '@/components/PixelOffice';
import { floorPlacement, type MonitorBot } from '@/lib/office-monitor';
import { useAuth } from '@workspace/replit-auth-web';
import { apiFetch } from '@/lib/api-client';
import { getSalarymanOfficeTier } from '@/lib/tutorial-progress';
import { getOwnedOffice, type OwnedProperty } from '@/lib/owned-office';
import { useArtAsset } from '@/lib/art';
import { CITY_NAME } from '@/gameSystems';
import { type Appearance, defaultAppearance, sanitizeAppearance } from '@/lib/character-identity';

/** Government salary decays ~1%/week from the player's start date. Mirrors Home. */
function computeDecayedSalary(governmentBaseSalary: number, createdAt?: string): number {
  if (!createdAt || !governmentBaseSalary) return governmentBaseSalary;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const weeksElapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / WEEK_MS);
  if (weeksElapsed <= 0) return governmentBaseSalary;
  return Math.round(governmentBaseSalary * Math.pow(0.99, weeksElapsed));
}

interface CitySave {
  salary: number;
  governmentBaseSalary?: number;
  goldBalance: number;
  level: number;
  hp: number;
  maxHp: number;
  savings: number;
  createdAt?: string;
}

interface StaffRow {
  id: number;
  name: string;
  role?: string | null;
}
interface EmployeeRow {
  id: number;
  name: string;
  role?: string | null;
}

interface BusinessTask {
  id: number;
  title?: string | null;
  status?: string | null;
  assignee?: string | null;
  tags?: string | null;
}

// Always include Pablo at the top of the roster; he's the building's
// proprietor and the user's narrator. Palette 0 + golden hue shift makes
// him visually distinct from everyone else.
const PABLO_AGENT = { id: 9001, label: 'Pablo', palette: 0, hueShift: 50 };
// Jean Claw is the floor manager — always second in the roster right after
// Pablo. Distinct emerald-tinted palette so the user can spot the underboss
// at a glance.
const JEAN_CLAW_AGENT = { id: 9002, label: 'Jean Claw', palette: 2, hueShift: 140 };

/**
 * Map an in-progress task to a "tool" name the engine understands.
 * The engine swaps the typing animation for a reading animation when
 * the tool is in its READING_TOOLS set (Read, Grep, Glob, WebFetch,
 * WebSearch). Everything else triggers the typing animation.
 */
function taskToTool(t: BusinessTask): string {
  const haystack = `${t.title ?? ''} ${t.tags ?? ''}`.toLowerCase();
  if (/(research|read|review|audit|investigat)/.test(haystack)) return 'Read';
  if (/(search|find|lookup)/.test(haystack)) return 'Grep';
  if (/(meet|call|interview)/.test(haystack)) return 'WebFetch';
  return 'Edit';
}

export default function PabloOffice() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [vh, setVh] = useState(typeof window !== 'undefined' ? window.innerHeight : 720);
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [tasks, setTasks] = useState<BusinessTask[]>([]);
  // The user's AI bots (bot_marketplace). Activated bots stand at bullpen
  // desks; everyone else sleeps in a cryo-capsule along the back wall.
  const [bots, setBots] = useState<MonitorBot[]>([]);
  const [rosterReady, setRosterReady] = useState(false);
  // Read the user's onboarding office tier once on mount. localStorage
  // is the source of truth here — Immigration writes it after the user
  // makes their pick, and the value is stable for the session.
  const [tier] = useState(() => getSalarymanOfficeTier() ?? 'capsule');
  // The property you rented/bought from the realty showroom. Drives the
  // establishing image (SAME useArtAsset(artKey) as the realty card) and the
  // tenure badge so the office you own looks like the deed you hold.
  const [owned] = useState<OwnedProperty | null>(() => getOwnedOffice());
  // Throttle the poll to ~hourly when there's no owned office, so we don't
  // 404 /api/art/asset/ every few seconds for players who never bought one.
  const ownedArt = useArtAsset(owned?.artKey ?? '', owned ? 4000 : 3_600_000);
  const [serverOnline, setServerOnline] = useState<number | null>(null);
  const [serverMax, setServerMax] = useState(50);
  const [citySave, setCitySave] = useState<CitySave | null>(null);
  // Shared character Appearance — drives the owner paper-doll in PixelOffice so
  // the office character matches the WorldPlay city character exactly. Default
  // until the real one loads from local cache / newest cloud save.
  const [appearance, setAppearance] = useState<Appearance>(() => defaultAppearance());
  // LIVE = walk around + clock in. SURVEILLANCE = passive CCTV feed of the
  // SAME pixel floor (no player control), so a supervisor can watch the crew.
  // Initial mode honours ?mode=surveillance so the retired /office/surveillance
  // route can funnel straight in.
  const [officeMode, setOfficeMode] = useState<'live' | 'surveillance'>(() => {
    if (typeof window === 'undefined') return 'live';
    const m = new URLSearchParams(window.location.search).get('mode');
    return m === 'surveillance' ? 'surveillance' : 'live';
  });
  const surveillance = officeMode === 'surveillance';
  // Keep mode in sync if the URL's ?mode= changes while staying on /office
  // (e.g. the surveillance redirect lands on an already-mounted instance, or
  // the user uses back/forward). Toggling the buttons also pushes the query so
  // the state stays shareable + back-button consistent.
  useEffect(() => {
    const sync = () => {
      const q = new URLSearchParams(window.location.search).get('mode');
      setOfficeMode(q === 'surveillance' ? 'surveillance' : 'live');
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const selectMode = (m: 'live' | 'surveillance') => {
    setOfficeMode(m);
    const url = m === 'live' ? `${import.meta.env.BASE_URL}office` : `${import.meta.env.BASE_URL}office?mode=${m}`;
    window.history.replaceState(null, '', url);
  };
  // Ticking clock for the CCTV timestamp overlay (only runs in surveillance).
  const [camClock, setCamClock] = useState(() => new Date());
  useEffect(() => {
    if (!surveillance) return;
    const iv = setInterval(() => setCamClock(new Date()), 1000);
    return () => clearInterval(iv);
  }, [surveillance]);

  // Live server population (same feed Home uses).
  useEffect(() => {
    const fetchStatus = () => {
      fetch(`${import.meta.env.BASE_URL}api/world/server-status`)
        .then(r => r.json())
        .then(d => { setServerOnline(d.online ?? 0); setServerMax(d.max ?? 50); })
        .catch(() => {});
    };
    fetchStatus();
    const iv = setInterval(fetchStatus, 15000);
    return () => clearInterval(iv);
  }, []);

  // Player city stats — local save first, then newest cloud save.
  useEffect(() => {
    const parseFields = (s: Record<string, unknown>, fallbackCreatedAt?: string): CitySave => ({
      salary: Number(s.salary ?? 0),
      governmentBaseSalary: s.governmentBaseSalary !== undefined ? Number(s.governmentBaseSalary) : undefined,
      goldBalance: Number(s.goldBalance ?? 0),
      level: Number(s.level ?? 1),
      hp: Number(s.hp ?? 100),
      maxHp: Number(s.maxHp ?? 100),
      savings: Number(s.savings ?? 0),
      createdAt: (s.createdAt as string | undefined) ?? fallbackCreatedAt,
    });
    let localLevel = 0;
    try {
      const raw = localStorage.getItem('sm_save');
      if (raw) {
        let localCreatedAt: string | undefined;
        let localGovSalary: number | undefined;
        try {
          const ch = localStorage.getItem('sm_char');
          if (ch) {
            const charData = JSON.parse(ch);
            localCreatedAt = charData.createdAt;
            localGovSalary = charData.governmentBaseSalary ?? charData.salary;
          }
        } catch { /* ignore malformed char cache */ }
        const parsed = JSON.parse(raw);
        if (localGovSalary !== undefined && parsed.governmentBaseSalary === undefined) {
          parsed.governmentBaseSalary = localGovSalary;
        }
        const p = parseFields(parsed, localCreatedAt);
        localLevel = p.level;
        setCitySave(p);
        if (parsed.appearance) {
          setAppearance(sanitizeAppearance(parsed.appearance, parsed.class as string | undefined));
        }
      }
    } catch { /* ignore malformed save cache */ }
    if (isAuthenticated) {
      fetch(`${import.meta.env.BASE_URL}api/salaryman/saves`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(res => {
          if (!res?.saves?.length) return;
          const newest = res.saves.reduce((a: { lastSavedAt: string }, b: { lastSavedAt: string }) =>
            new Date(b.lastSavedAt) > new Date(a.lastSavedAt) ? b : a);
          if (newest?.data) {
            const dataObj = newest.data as Record<string, unknown>;
            if (dataObj.governmentBaseSalary === undefined) {
              const cls = (newest.charClass ?? dataObj.class) as string | undefined;
              dataObj.governmentBaseSalary = cls === 'corporate' ? 100 : cls === 'replicant' ? 50 : cls === 'outlaw' ? 25 : undefined;
            }
            const cloud = parseFields(dataObj, newest.createdAt as string | undefined);
            if (cloud.level >= localLevel) setCitySave(cloud);
            if (dataObj.appearance) {
              const cls = (newest.charClass ?? dataObj.class) as string | undefined;
              setAppearance(sanitizeAppearance(dataObj.appearance, cls));
            }
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const onResize = () => {
      setVh(window.innerHeight);
      setVw(window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fetch real team. We ignore failures and fall back to Pablo + a few
  // anonymous agents so the office is never empty.
  useEffect(() => {
    if (!isAuthenticated) {
      setRosterReady(true);
      return;
    }
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const [s, e, t, b] = await Promise.all([
          apiFetch('/api/tools/hiring/staff'),
          apiFetch('/api/enterprise/employees'),
          apiFetch('/api/business/tasks'),
          apiFetch('/api/bots'),
        ]);
        if (cancelled) return;
        if (s.ok) {
          const d = await s.json();
          setStaff(Array.isArray(d.staff) ? d.staff : []);
        }
        if (e.ok) {
          const d = await e.json();
          setEmployees(Array.isArray(d.employees) ? d.employees : []);
        }
        if (t.ok) {
          const d = await t.json();
          setTasks(Array.isArray(d.tasks) ? d.tasks : []);
        }
        if (b.ok) {
          const d = await b.json();
          setBots(Array.isArray(d) ? d : Array.isArray(d?.bots) ? d.bots : []);
        }
      } catch {
        /* fall back to defaults below */
      } finally {
        if (!cancelled) setRosterReady(true);
      }
    };
    void fetchAll();
    // Re-poll tasks every 30s so activity reflects task-board changes
    // without requiring a full page refresh.
    const interval = window.setInterval(() => {
      if (!cancelled) void fetchAll();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isAuthenticated]);

  // Build the crew roster: Pablo first, then deduped staff + employees.
  // The stage shows a finite set of portrait cards, so cap the head count
  // to keep the composition readable.
  const agents = useMemo(() => {
    const list: { id: number; label: string; palette?: number; hueShift?: number }[] = [
      PABLO_AGENT,
      JEAN_CLAW_AGENT,
    ];
    // Pre-seed `seen` with the always-on principals so a duplicate Jean
    // Claw or Pablo from the staff/employees feeds doesn't double-spawn.
    const seen = new Set<string>(['pablo', 'jean claw']);
    for (const s of staff) {
      const key = (s.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push({ id: 1000 + s.id, label: s.name });
    }
    for (const e of employees) {
      const key = (e.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push({ id: 2000 + e.id, label: e.name });
    }
    // Fall back to a small dummy crew if the user has no real team yet,
    // so the office has some life on first visit. Bigger tiers get a
    // bigger fallback crew so the room doesn't feel oversized for a
    // suite holder with no employees.
    if (list.length === 2) {
      const fallbackByTier: Record<string, string[]> = {
        capsule:   ['Quinn'],
        studio:    ['Quinn', 'Mira'],
        coworking: ['Quinn', 'Mira', 'Reyes', 'Hatch'],
        suite:     ['Quinn', 'Mira', 'Reyes', 'Hatch', 'Voss', 'Kade'],
      };
      const fallback = fallbackByTier[tier] ?? fallbackByTier.capsule;
      fallback.forEach((name, i) => list.push({ id: 3000 + i, label: name }));
    }
    // Per-tier headcount cap. Capsule = lonely desk floor; suite = full
    // crew. The engine caps further if there aren't enough seats.
    const capByTier: Record<string, number> = {
      capsule: 4, studio: 6, coworking: 9, suite: 12,
    };
    return list.slice(0, capByTier[tier] ?? 8);
  }, [staff, employees, tier]);

  // Compute live activity per agent: anyone with an in-progress task
  // assigned to them is shown as actively working, with the task type
  // mapped to a tool that drives the typing/reading animation.
  const activity = useMemo(() => {
    const map: Record<number, { active: boolean; tool: string | null }> = {};
    const inProgress = tasks.filter(
      (t) => t.status === 'in_progress' || t.status === 'doing',
    );
    const byAssignee = new Map<string, BusinessTask>();
    for (const t of inProgress) {
      const k = (t.assignee ?? '').trim().toLowerCase();
      if (k) byAssignee.set(k, t);
    }
    for (const a of agents) {
      const key = a.label.toLowerCase();
      const t = byAssignee.get(key);
      // Pablo and Jean Claw are always shown as working — Pablo runs the
      // building, Jean Claw runs the floor.
      if (a.id === PABLO_AGENT.id) {
        map[a.id] = { active: true, tool: 'Edit' };
      } else if (a.id === JEAN_CLAW_AGENT.id) {
        map[a.id] = { active: true, tool: 'Grep' };
      } else if (t) {
        map[a.id] = { active: true, tool: taskToTool(t) };
      } else {
        map[a.id] = { active: false, tool: null };
      }
    }
    return map;
  }, [agents, tasks]);

  // Split the bot roster into the two floor populations — activated bots stand
  // at desks, the rest sleep in capsules — each ordered/clustered by team (and
  // similar skill) and tagged with its team colour for the engine to tint.
  const { deskBots, capsuleBots } = useMemo(() => floorPlacement(bots), [bots]);

  const activeCount = useMemo(
    () => Object.values(activity).filter((a) => a.active).length,
    [activity],
  );

  const canvasHeight = Math.max(360, vh - 180);

  // The walkable pixel office is a 16-tile-wide × 7-tile-tall room (TILE=16px
  // native). Pick the largest integer pixel-scale that fits both the available
  // width and the canvas height so the whole floor is visible without scroll.
  const officeScale = useMemo(() => {
    const availW = Math.min(vw - 80, 1100);
    const availH = canvasHeight - 56;
    // The bullpen is always on, so the floor spans 33 tiles wide (16 private +
    // 1 divider + 16 bullpen). Scale to fit the FULL width or the room clips.
    const byW = Math.floor(availW / (33 * 16));
    const byH = Math.floor(availH / (7 * 16));
    // Floor of 1 (not 2) so the full floor still fits on narrow phones —
    // at scale 2 the room is 512px wide and would clip a ~375–430px viewport.
    return Math.max(1, Math.min(5, Math.min(byW, byH)));
  }, [vw, canvasHeight]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#38bdf8',
        font: '13px "Share Tech Mono", monospace',
        padding: '1rem',
        boxSizing: 'border-box',
      }}
    >
      <style>{`@keyframes blink{50%{opacity:.15}}`}</style>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '.6rem',
          borderBottom: '1px solid rgba(56,189,248,.25)',
          paddingBottom: '.5rem',
        }}
      >
        <div>
          <div style={{ fontSize: '.65rem', color: 'rgba(56,189,248,.55)', letterSpacing: '.18em' }}>
            {CITY_NAME} · SERVER: PST {serverOnline !== null ? `· ${serverOnline}/${serverMax} ONLINE` : ''}
          </div>
          <h1 style={{ margin: '.1rem 0 0 0', fontSize: '1.4rem', letterSpacing: '.1em', color: '#38bdf8' }}>
            THE OFFICE
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.5)', letterSpacing: '.15em' }}>
            HEADCOUNT&nbsp;<span style={{ color: '#38bdf8' }}>{agents.length}</span>
            &nbsp;·&nbsp;ACTIVE&nbsp;<span style={{ color: '#22c55e' }}>{activeCount}</span>
          </div>
          <div style={{ display: 'inline-flex', border: '1px solid rgba(56,189,248,.3)', borderRadius: 6, overflow: 'hidden' }}>
            {(['live', 'surveillance'] as const).map(m => {
              const on = officeMode === m;
              const danger = m === 'surveillance';
              const title = m === 'surveillance'
                ? 'Passive CCTV feed of the same office'
                : 'Walk around and clock in';
              return (
                <button
                  key={m}
                  onClick={() => selectMode(m)}
                  title={title}
                  style={{
                    font: 'inherit', fontSize: '.6rem', letterSpacing: '.12em', cursor: 'pointer', border: 'none',
                    padding: '.32rem .6rem',
                    background: on ? (danger ? 'rgba(244,63,94,.18)' : 'rgba(56,189,248,.18)') : 'transparent',
                    color: on ? (danger ? '#fb7185' : '#38bdf8') : 'rgba(56,189,248,.5)',
                  }}
                >
                  {m === 'live' ? '▶ LIVE' : '● CCTV'}
                </button>
              );
            })}
          </div>
          <nav style={{ display: 'flex', gap: '1rem', fontSize: '.7rem', letterSpacing: '.1em' }}>
            <Link href="/game" style={{ color: 'rgba(56,189,248,.7)' }}>« BACK TO HUB</Link>
            <Link href="/business/team" style={{ color: 'rgba(56,189,248,.7)' }}>TEAM</Link>
          </nav>
        </div>
      </header>

      {owned && (
        <div
          style={{
            position: 'relative',
            marginBottom: '.6rem',
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid rgba(56,189,248,.25)',
            height: 96,
            background: '#06070b',
          }}
        >
          {ownedArt ? (
            <img
              src={ownedArt}
              alt={owned.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated', opacity: 0.9 }}
              draggable={false}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(56,189,248,.4)', fontSize: '.6rem', letterSpacing: '.4em' }}>
              ▌ COMPOSING DEED ▌
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(5,3,12,.85) 0%, rgba(5,3,12,.25) 45%, transparent 100%)' }} />
          <div style={{ position: 'absolute', left: '.7rem', bottom: '.5rem' }}>
            <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.6)', letterSpacing: '.25em' }}>YOUR PROPERTY</div>
            <div style={{ fontSize: '.95rem', color: '#e0f2fe', letterSpacing: '.08em' }}>{owned.name}</div>
          </div>
          <div
            style={{
              position: 'absolute', right: '.6rem', top: '.5rem',
              padding: '.16rem .5rem', borderRadius: 4,
              background: owned.tenure === 'own' ? 'rgba(52,211,153,.9)' : 'rgba(56,189,248,.85)',
              color: '#04121a', fontSize: '.55rem', fontWeight: 700, letterSpacing: '.2em',
            }}
          >
            {owned.tenure === 'own' ? 'OWNED' : 'LEASED'}
          </div>
        </div>
      )}

      {rosterReady ? (
        <div
          style={{
            position: 'relative',
            height: canvasHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(120% 100% at 50% 0%, #160b32 0%, #0a0712 55%, #05030c 100%)',
            borderRadius: 16,
            boxShadow:
              '0 0 0 1px rgba(150,120,255,.30), 0 30px 80px -30px rgba(90,45,170,.55), inset 0 0 140px rgba(8,4,28,.7)',
            overflow: 'hidden',
          }}
        >
          {/* Walkable pixel office — WASD / arrows (or the on-screen D-pad on
              touch) move your character around the floor. Walk up to the desk
              computer and press E (or tap the prompt) to clock into Pablo's
              terminal. `premium` renders the high-end, fully-lit grade. */}
          <PixelOffice
            scale={officeScale}
            playable={!surveillance}
            premium
            bullpen
            activeBots={deskBots}
            idleBots={capsuleBots}
            appearance={appearance}
            onEnterTerminal={() => navigate('/pablo')}
          />
          {surveillance && (
            <>
              {/* CCTV chrome over the SAME pixel floor — red frame, REC dot +
                  timestamp. No duotone reskin: the artwork is identical to LIVE,
                  it's just framed as a passive security feed. */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 0 2px rgba(244,63,94,.28), inset 0 0 120px rgba(0,0,0,.4)' }} />
              <div style={{ position: 'absolute', top: 10, left: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: '.6rem', letterSpacing: '.18em', color: '#fb7185', pointerEvents: 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'blink 1s steps(2) infinite', display: 'inline-block' }} />
                REC · CAM 01
              </div>
              <div style={{ position: 'absolute', top: 10, right: 12, fontSize: '.6rem', letterSpacing: '.1em', color: 'rgba(244,63,94,.85)', pointerEvents: 'none' }}>
                {camClock.toLocaleTimeString()}
              </div>
            </>
          )}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 6,
              textAlign: 'center',
              fontSize: '.55rem',
              letterSpacing: '.18em',
              color: surveillance ? 'rgba(244,63,94,.6)' : 'rgba(56,189,248,.55)',
              pointerEvents: 'none',
            }}
          >
            {surveillance
              ? 'SURVEILLANCE FEED · READ-ONLY · SWITCH TO LIVE TO TAKE CONTROL'
              : 'WASD / ARROW KEYS TO MOVE · WALK TO THE COMPUTER + PRESS E TO CLOCK IN'}
          </div>
        </div>
      ) : (
        <div
          style={{
            height: canvasHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(56,189,248,.7)',
            font: '12px "Share Tech Mono", monospace',
            letterSpacing: '.1em',
            background: '#0a0a0a',
            boxShadow: '0 0 0 1px rgba(56,189,248,.3)',
          }}
        >
          ROSTERING TEAM…
        </div>
      )}

      {/* ECONOMY — a proper office section under the floor, not a floating
          overlay on top of the game. This is the city ledger that used to
          live as a standalone landing header on the terminal. */}
      <section
        style={{
          marginTop: '.6rem',
          border: '1px solid rgba(56,189,248,.25)',
          borderRadius: 8,
          background: 'rgba(5,8,10,.6)',
          padding: '.7rem .9rem',
        }}
      >
        <div
          style={{
            fontSize: '.6rem',
            letterSpacing: '.2em',
            color: 'rgba(56,189,248,.55)',
            marginBottom: '.55rem',
          }}
        >
          ECONOMY
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '.6rem 1.2rem',
          }}
        >
          {([
            ['ƒ GOV SALARY', citySave ? `ƒ${computeDecayedSalary(citySave.governmentBaseSalary ?? 0, citySave.createdAt).toLocaleString()}/min` : '—', 'rgba(56,189,248,.85)'],
            ['BALANCE', citySave ? `ƒ${citySave.salary.toLocaleString()}` : '—', 'rgba(180,255,100,.9)'],
            ['GOLD', citySave ? `${citySave.goldBalance} oz` : '—', 'rgba(255,204,0,.9)'],
            ['♥ HEARTS', citySave ? `LV.${citySave.level} · ${citySave.hp}/${citySave.maxHp}` : '—', 'rgba(255,120,120,.9)'],
            ['NET WORTH', citySave ? `${(((citySave.salary + citySave.savings) / 100000) + citySave.goldBalance).toFixed(2)} oz` : '—', 'rgba(120,200,255,.9)'],
            ['WITHDRAW', citySave ? `ƒ${Math.floor(citySave.savings * 0.97).toLocaleString()}` : '—', 'rgba(120,255,190,.9)'],
          ] as [string, string, string][]).map(([label, value, color]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.08em' }}>{label}</span>
              <span style={{ fontSize: '.95rem', color }}>{value}</span>
            </div>
          ))}
        </div>
      </section>

      <footer
        style={{
          marginTop: '.6rem',
          fontSize: '.55rem',
          color: 'rgba(56,189,248,.4)',
          letterSpacing: '.15em',
          lineHeight: 1.7,
        }}
      >
        <div>
          &gt; YOUR OFFICE · FACILITY 01 · {officeMode === 'surveillance' ? 'CCTV SURVEILLANCE · READ-ONLY MONITOR' : 'LIVE · WALK TO YOUR DESK · BOTS ASLEEP IN CAPSULES UNTIL ACTIVATED'}
        </div>
      </footer>
    </div>
  );
}
