/**
 * /office — Pablo's cinematic office. Full-bleed Nano Banana scene_office
 * background rendered through OfficeStage, with the crew (Pablo, Jean Claw,
 * and each real team member) shown as moody character portrait cards.
 *
 * Wrapped in GameLock by the router so it inherits the same game-state
 * gating as /world/play, /game, etc.
 */
import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { PixelOffice, type OfficeStation, type OfficeRoom } from '@/components/PixelOffice';
import { useToast } from '@/hooks/use-toast';
import { playClick, playNav, playSuccess } from '@/lib/ui-sound';
import { startOfficeAmbient, stopOfficeAmbient, resumeAudioContext } from '@/soundEngine';
import { getAmbianceEnabled, subscribeAudioSettings } from '@/lib/audio-settings';
import { floorPlacement, type MonitorBot } from '@/lib/office-monitor';
import { useAuth } from '@workspace/replit-auth-web';
import { apiFetch } from '@/lib/api-client';
import { useUnemploymentSalary } from '@/hooks/useUnemploymentSalary';
import { getSalarymanOfficeTier } from '@/lib/tutorial-progress';
import { getOwnedOffice, type OwnedProperty } from '@/lib/owned-office';
import { useArtAsset } from '@/lib/art';
import { CITY_NAME } from '@/gameSystems';
import { type Appearance, defaultAppearance, sanitizeAppearance, toWorkAttire } from '@/lib/character-identity';

// Reuse the real, playable arcade component as a full-screen overlay (lazy so it
// only loads when a cabinet is actually used).
const ArcadeGame = lazy(() => import('@/pages/ArcadeGames'));

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
  const { toast } = useToast();
  // Which arcade cabinet game is open on top of the office (null = none). Reuses
  // the existing playable <ArcadeGame> component; freezes the office underneath.
  const [arcadeGameId, setArcadeGameId] = useState<string | null>(null);
  const [vh, setVh] = useState(typeof window !== 'undefined' ? window.innerHeight : 720);
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  // Measured size of the actual office pane (the gradient container that holds
  // the canvas). Driving the camera viewport off the REAL box — instead of a
  // vh-minus-chrome estimate — means the floor always fills the available space
  // with no black bars, and it auto-accounts for device safe-area insets.
  const officeViewRef = useRef<HTMLDivElement>(null);
  const [paneW, setPaneW] = useState(0);
  const [paneH, setPaneH] = useState(0);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [tasks, setTasks] = useState<BusinessTask[]>([]);
  // The user's AI bots (bot_marketplace). Activated bots stand at bullpen
  // desks; everyone else sleeps in a cryo-capsule along the back wall.
  const [bots, setBots] = useState<MonitorBot[]>([]);
  const [rosterReady, setRosterReady] = useState(false);
  // Org roster → one enclosed executive office per active member, derived from
  // /api/orgs/me (members[] is only populated for managers/owners). Nameplates
  // read by job title / role since the row carries no display name.
  const [orgMembers, setOrgMembers] = useState<
    { userId: string; role: string; status: string; title?: string | null; department?: string | null }[]
  >([]);
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
  // There are only two views: LIVE (walk around, follow camera locked on the
  // player) and SURVEILLANCE (read-only CCTV, fixed full-floor overview). No
  // separate camera-zoom toggle — the view follows directly from the mode.
  // Pablo Corp unemployment stipend — live wallet + floating "+ƒ" payouts.
  // Server credits 500ƒ per in-game hour for the first 30 game days; the hook
  // polls + emits a pay event each time a whole game-hour lands.
  const { state: salary, payEvents: salaryPays } = useUnemploymentSalary(true);
  // Full-screen office chrome: collapsible economy drawer, help/tutorial overlays.
  const [economyOpen, setEconomyOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem('salaryman.office.tut') !== '1'; } catch { return true; }
  });
  const dismissTutorial = () => {
    setShowTutorial(false);
    try { window.localStorage.setItem('salaryman.office.tut', '1'); } catch { /* ignore */ }
  };
  const [isTouch] = useState(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
  // Ticking clock for the CCTV timestamp overlay (only runs in surveillance).
  const [camClock, setCamClock] = useState(() => new Date());
  useEffect(() => {
    if (!surveillance) return;
    const iv = setInterval(() => setCamClock(new Date()), 1000);
    return () => clearInterval(iv);
  }, [surveillance]);

  // Quick keys (desktop): Z cycle camera, C toggle CCTV/live, H/? help, Esc → hub.
  // WASD/E are owned by PixelOffice and never overlap these. Suspended while the
  // arcade overlay is open so it can own the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (arcadeGameId) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'c') { playClick(); selectMode(surveillance ? 'live' : 'surveillance'); }
      else if (k === 'h' || k === '?') { playClick(); setShowHelp(s => !s); }
      else if (k === 'escape') {
        if (showHelp) setShowHelp(false);
        else if (showTutorial) dismissTutorial();
        else { playNav(); navigate('/game'); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcadeGameId, surveillance, showHelp, showTutorial, navigate]);

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

  // Measure the real office pane so the camera viewport == the box on screen.
  // This is what guarantees a true full-screen fill (no black bars) and makes
  // the layout robust to device safe-area insets / chrome height changes.
  useEffect(() => {
    const el = officeViewRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      setPaneW(el.clientWidth);
      setPaneH(el.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rosterReady]);

  // ── Quiet meditative office ambient ─────────────────────────────────────────
  // A calm pad bed (NOT the city's synthwave score) plays while you're in the
  // office. It auto-starts on the first user gesture (WebAudio needs one) when
  // AMBIANCE is enabled, and stops on leave. Loudness is gated centrally by the
  // same AMBIANCE toggle / master mute / voice-ducking, so nothing else to wire.
  useEffect(() => {
    const start = () => {
      resumeAudioContext();
      if (getAmbianceEnabled()) startOfficeAmbient();
    };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    // Honor the AMBIANCE toggle mid-session (e.g. from the global audio panel).
    const unsub = subscribeAudioSettings(() => {
      if (getAmbianceEnabled()) startOfficeAmbient();
      else stopOfficeAmbient();
    });
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      unsub();
      stopOfficeAmbient();
    };
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

  // Org roster → executive offices. Fetched once; members[] is only returned
  // when the viewer is a manager/owner (otherwise the wing shows vacant suites).
  useEffect(() => {
    if (!isAuthenticated) { setOrgMembers([]); return; }
    let cancelled = false;
    apiFetch('/api/orgs/me')
      .then(async (r) => {
        if (!r.ok || cancelled) return;
        const d = await r.json();
        setOrgMembers(Array.isArray(d?.members) ? d.members : []);
      })
      .catch(() => { /* vacant fallback */ });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // One enclosed executive office per active member, laid out across the lower
  // HQ in banks of six (3 left + 3 right of the open divider corridor) that WRAP
  // into additional rows as the org grows, so every active member gets their own
  // walled office (not a fixed 6 cap). The floor height grows to fit. An empty
  // roster shows a couple of VACANT suites (Phase B: claim in-game). A generous
  // safety cap keeps a pathological roster from creating an enormous floor.
  const execLayout = useMemo<{ rooms: OfficeRoom[]; floorRows: number }>(() => {
    const COLS = [1, 8, 15, 24, 31, 38]; // office left-edge cols/row (skip col-22 divider)
    const TOP = 12;       // first exec row starts below the bullpen
    const W = 6, H = 7;
    const ROW_STRIDE = 9; // office (7) + 2-tile walkway between stacked rows
    const MAX = COLS.length * 4; // soft cap: up to 4 rows (24 offices)
    const PALETTE = ['#c4b5fd', '#7dd3fc', '#fca5a5', '#86efac', '#fcd34d', '#f0abfc'];
    const roleAccent: Record<string, string> = {
      owner: '#fcd34d', ceo: '#fca5a5', executive: '#c4b5fd',
      director: '#7dd3fc', manager: '#86efac', specialist: '#cbd5e1',
    };
    const hash = (s: string) => {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return Math.abs(h) + 7;
    };
    // Position helper: index → office cell (col from COLS, row stacks downward).
    const place = (i: number) => ({
      x: COLS[i % COLS.length],
      y: TOP + Math.floor(i / COLS.length) * ROW_STRIDE,
    });
    const active = orgMembers.filter((m) => (m.status ?? 'active') === 'active');
    const entries: OfficeRoom[] = active.length === 0
      ? [0, 1].map((i) => {
          const p = place(i);
          return {
            id: `vacant-${i}`, x: p.x, y: p.y, w: W, h: H,
            doorSide: 'bottom' as const, doorSpan: 2, label: 'VACANT', sub: 'LEASE', accent: '#64748b',
          };
        })
      : active.slice(0, MAX).map((m, i) => {
          const p = place(i);
          return {
            id: `exec-${m.userId}`, x: p.x, y: p.y, w: W, h: H,
            doorSide: 'bottom' as const, doorSpan: 2,
            label: (m.title || m.role || 'EXEC'),
            sub: m.department || (m.title && m.role !== m.title ? m.role : undefined) || undefined,
            accent: roleAccent[m.role] ?? PALETTE[i % PALETTE.length],
            occupantSeed: hash(m.userId),
          };
        });
    const rowCount = Math.max(1, Math.ceil(entries.length / COLS.length));
    const floorRows = TOP + (rowCount - 1) * ROW_STRIDE + (H + 1); // last row + walkway
    return { rooms: entries, floorRows };
  }, [orgMembers]);
  const execRooms = execLayout.rooms;

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

  // Full-screen chrome heights. The office fills everything between the compact
  // header and the collapsible economy drawer, so the page itself never scrolls.
  const HEADER_H = 50;
  const economyH = economyOpen ? 172 : 36;
  const officeAreaH = Math.max(240, vh - HEADER_H - economyH);
  // Camera viewport — full-bleed now that the global NavBar is hidden on /office.
  // Prefer the measured pane (exact fill, safe-area aware); fall back to the
  // vh-minus-chrome estimate for the very first paint before the observer fires.
  const rawW = paneW > 0 ? paneW : Math.max(280, vw - 16);
  const rawH = paneH > 0 ? paneH : Math.max(200, officeAreaH - 16);
  // Small screens get a FULL-BLEED viewport — the office fills the entire pane
  // edge-to-edge instead of being boxed into a tiny letterboxed window (the
  // "needs a lot of bleed to see it on smaller screens" feedback). Larger
  // screens keep a tidy 4:3 (or 3:4 portrait) game window so it never stretches
  // into an ultra-wide letterbox.
  const fullBleed = vw < 760;
  const targetAspect = rawW >= rawH ? 4 / 3 : 3 / 4;
  let viewportW = rawW;
  let viewportH = fullBleed ? rawH : rawW / targetAspect;
  if (!fullBleed && viewportH > rawH) {
    viewportH = rawH;
    viewportW = rawH * targetAspect;
  }

  // Pixel scale-up, driven directly by the office mode.
  //   SURVEILLANCE → shrink-to-fit the ENTIRE floor (fixed CCTV overview).
  //   LIVE         → tight, zoomed-in camera locked on the player.
  const FLOOR_W_TILES = 22 * 2 + 1;          // private + divider + bullpen
  const FLOOR_H_TILES = execLayout.floorRows; // grows with the exec wing (bullpen up top)
  const officeScale = useMemo(() => {
    if (surveillance) {
      // Shrink-to-fit on BOTH axes. Allow sub-1 scale so a narrow viewport
      // (phone) still shows the whole floor instead of overflowing and
      // letting the camera clamp hide the edges. Floor at a tiny positive value.
      const fitW = viewportW / (FLOOR_W_TILES * 16);
      const fitH = viewportH / (FLOOR_H_TILES * 16);
      return Math.max(0.2, Math.min(fitW, fitH));
    }
    // LIVE — zoomed-in "almost first person" camera locked on the player. Scale
    // UP enough that the room fills the viewport height (no letterbox), but keep
    // the minimum modest so small screens still reveal a useful slice of floor.
    const fillH = viewportH / (FLOOR_H_TILES * 16);
    return Math.max(2.4, fillH);
  }, [surveillance, viewportW, viewportH]);
  // LIVE always follows the player (on touch too); surveillance parks on the
  // fixed overview. Tap-to-move still reaches off-screen stations: tap toward an
  // edge, the player walks, and the camera reveals more floor.
  const followCam = !surveillance;

  // ── Interaction stations ───────────────────────────────────────────────
  // Walk-up portals to EXISTING features (no new features invented). Ordered
  // professional → comms → fun, per the owner's priority. Reuses real furniture
  // PNGs where they exist (whiteboard / sofa / bookshelf) and inline-SVG pixel
  // sprites for objects with no art yet (comms phone, vending, sound rig,
  // arcade, water cooler).
  const stations = useMemo<OfficeStation[]>(() => {
    const FURN = `${import.meta.env.BASE_URL}pixel-agents/furniture/`;
    return [
      // PROFESSIONAL
      {
        id: 'conference', label: 'CONFERENCE', col: 2, row: 8,
        art: { src: `${FURN}WHITEBOARD/WHITEBOARD.png`, wTiles: 2, hTiles: 2 },
        radius: 28,
        onInteract: () => { playNav(); navigate('/creative/classroom'); },
      },
      {
        id: 'records', label: 'RECORDS', col: 17, row: 8,
        art: { src: `${FURN}DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png`, wTiles: 2, hTiles: 1 },
        radius: 26,
        onInteract: () => { playNav(); navigate('/business/documents'); },
      },
      // COMMUNICATIONS
      {
        id: 'comms', label: 'COMMS', col: 25, row: 8, glyph: 'comms', radius: 24,
        onInteract: () => { playNav(); navigate('/comms'); },
      },
      // FUN / UTILITY
      {
        id: 'vending', label: 'VENDING', col: 28, row: 8, glyph: 'vending', radius: 26,
        onInteract: () => { playNav(); navigate('/vending'); },
      },
      {
        id: 'soundlab', label: 'SOUND LAB', col: 31, row: 8, glyph: 'music', radius: 26,
        onInteract: () => { playNav(); navigate('/creative/lab'); },
      },
      {
        id: 'lounge', label: 'LOUNGE', col: 35, row: 8,
        art: { src: `${FURN}SOFA/SOFA_FRONT.png`, wTiles: 2, hTiles: 2 },
        radius: 28,
        onInteract: () => { playNav(); navigate('/creative/music'); },
      },
      {
        id: 'arcade', label: 'ARCADE', col: 41, row: 8, glyph: 'arcade', radius: 26,
        onInteract: () => { playClick(); setArcadeGameId('cyber_serpent'); },
      },
      {
        id: 'water', label: 'WATER COOLER', col: 0, row: 6, glyph: 'water_cooler', radius: 24,
        onInteract: () => {
          playSuccess();
          toast({ title: 'GLUG · GLUG', description: 'A cold cup of water. Back to it.' });
        },
      },
    ];
  }, [navigate, toast]);

  const hkBtn = (onClick: () => void, label: string, active: boolean, danger = false, disabled = false): ReactNode => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        font: 'inherit', fontSize: '.58rem', letterSpacing: '.1em',
        cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
        borderRadius: 5, padding: '.3rem .5rem',
        border: `1px solid ${danger ? 'rgba(244,63,94,.4)' : 'rgba(56,189,248,.3)'}`,
        opacity: disabled ? 0.4 : 1,
        background: active ? (danger ? 'rgba(244,63,94,.18)' : 'rgba(56,189,248,.18)') : 'transparent',
        color: active ? (danger ? '#fb7185' : '#38bdf8') : 'rgba(56,189,248,.55)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        height: '100dvh',
        width: '100%',
        background: '#000',
        color: '#38bdf8',
        font: '13px "Share Tech Mono", monospace',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        // Device safe-area insets so the phone status bar / notch never overlaps
        // the header, and the home indicator never covers the economy drawer.
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <style>{`@keyframes blink{50%{opacity:.15}}@keyframes salaryFloat{0%{transform:translate(-50%,0) scale(.7);opacity:0}15%{transform:translate(-50%,-6px) scale(1.05);opacity:1}80%{opacity:1}100%{transform:translate(-50%,-58px) scale(1);opacity:0}}@keyframes salaryPulse{0%,100%{box-shadow:0 0 0 1px rgba(180,255,100,.35)}50%{box-shadow:0 0 14px 1px rgba(180,255,100,.55)}}`}</style>

      {/* COMPACT HEADER — single fixed-height bar so the floor gets the rest. */}
      <header
        style={{
          flex: '0 0 auto',
          height: HEADER_H,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '.6rem',
          padding: '0 .7rem',
          borderBottom: '1px solid rgba(56,189,248,.25)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem', minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: '1rem', letterSpacing: '.12em', color: '#38bdf8', whiteSpace: 'nowrap' }}>
            THE OFFICE
          </h1>
          <span style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.5)', letterSpacing: '.12em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {CITY_NAME}{serverOnline !== null ? ` · ${serverOnline}/${serverMax} ONLINE` : ''}
            &nbsp;· HEAD <span style={{ color: '#38bdf8' }}>{agents.length}</span>
            &nbsp;· ACTIVE <span style={{ color: '#22c55e' }}>{activeCount}</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: 0 }}>
          <div style={{ display: 'inline-flex', border: '1px solid rgba(56,189,248,.3)', borderRadius: 5, overflow: 'hidden' }}>
            {(['live', 'surveillance'] as const).map(m => {
              const on = officeMode === m;
              const danger = m === 'surveillance';
              return (
                <button
                  key={m}
                  onClick={() => { playClick(); selectMode(m); }}
                  title={m === 'surveillance' ? 'CCTV feed (key: C)' : 'Walk around + clock in (key: C)'}
                  style={{
                    font: 'inherit', fontSize: '.58rem', letterSpacing: '.1em', cursor: 'pointer', border: 'none',
                    padding: '.3rem .5rem',
                    background: on ? (danger ? 'rgba(244,63,94,.18)' : 'rgba(56,189,248,.18)') : 'transparent',
                    color: on ? (danger ? '#fb7185' : '#38bdf8') : 'rgba(56,189,248,.5)',
                  }}
                >
                  {m === 'live' ? '▶ LIVE' : '● CCTV'}
                </button>
              );
            })}
          </div>
          {hkBtn(() => { playClick(); setShowHelp(s => !s); }, '? HELP · H', showHelp)}
          <Link href="/game" onClick={() => playNav()} style={{ color: 'rgba(56,189,248,.7)', fontSize: '.6rem', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>TERMINAL »</Link>
        </div>
      </header>

      {/* OFFICE — fills all space between header + economy drawer. On small
          screens the padding/rounding drop to zero so the floor bleeds to the
          screen edges. */}
      <div style={{ flex: '1 1 auto', minHeight: 0, padding: fullBleed ? 0 : 8, boxSizing: 'border-box' }}>
        {rosterReady ? (
          <div
            ref={officeViewRef}
            style={{
              position: 'relative',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'radial-gradient(120% 100% at 50% 0%, #160b32 0%, #0a0712 55%, #05030c 100%)',
              borderRadius: fullBleed ? 0 : 14,
              boxShadow:
                '0 0 0 1px rgba(150,120,255,.30), 0 30px 80px -30px rgba(90,45,170,.55), inset 0 0 140px rgba(8,4,28,.7)',
              overflow: 'hidden',
            }}
          >
            {/* Walkable pixel office. Desktop: WASD/arrows move, E interacts.
                Mobile/pointer: TAP the floor to walk, tap a station to use it.
                `premium` renders the high-end, fully-lit grade; `followCam`
                keeps the camera locked on the player while LIVE. */}
            <PixelOffice
              scale={officeScale}
              roomCols={22}
              roomRows={execLayout.floorRows}
              viewportWidth={viewportW}
              viewportHeight={viewportH}
              playable={!surveillance}
              followCam={followCam}
              premium
              bullpen
              doorTopRow={11}
              doorBotRow={execLayout.floorRows}
              rooms={execRooms}
              activeBots={deskBots}
              idleBots={capsuleBots}
              appearance={toWorkAttire(appearance)}
              onEnterTerminal={() => navigate('/game')}
              stations={stations}
              frozen={!!arcadeGameId}
            />

            {/* Compact property deed badge (top-left) — keeps the deed context
                without eating a 96px banner of vertical space. */}
            {owned && (
              <div style={{ position: 'absolute', top: 10, left: 12, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none', zIndex: 5 }}>
                <span style={{
                  padding: '.14rem .45rem', borderRadius: 4,
                  background: owned.tenure === 'own' ? 'rgba(52,211,153,.9)' : 'rgba(56,189,248,.85)',
                  color: '#04121a', fontSize: '.5rem', fontWeight: 700, letterSpacing: '.18em',
                }}>{owned.tenure === 'own' ? 'OWNED' : 'LEASED'}</span>
                <span style={{ fontSize: '.6rem', color: '#e0f2fe', letterSpacing: '.06em', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>{owned.name}</span>
              </div>
            )}

            {/* LIVE WALLET HUD (top-right) — spendable ƒ that ticks up with the
                Pablo Corp unemployment stipend. Shows the trial countdown while
                active; floating "+ƒ" payouts rise from it on each game-hour. */}
            {salary && !surveillance && (
              <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 6, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '.28rem .6rem', borderRadius: 6,
                  background: 'rgba(4,10,6,.78)',
                  border: '1px solid rgba(180,255,100,.35)',
                  animation: salaryPays.length ? 'salaryPulse 1.1s ease-in-out' : undefined,
                }}>
                  <span style={{ fontSize: '.5rem', letterSpacing: '.18em', color: 'rgba(180,255,100,.7)' }}>WALLET</span>
                  <span style={{ fontSize: '.8rem', letterSpacing: '.04em', color: '#b4ff64', fontWeight: 700 }}>
                    ƒ{(salary.spendable ?? 0).toLocaleString()}
                  </span>
                </div>
                {!salary.expired && (
                  <div style={{ fontSize: '.46rem', letterSpacing: '.12em', color: 'rgba(180,255,100,.6)', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>
                    STIPEND ƒ{salary.perGameHour}/HR · {Math.ceil(salary.remainingMs / 7_200_000)}D LEFT
                  </div>
                )}
                {/* Floating payout numbers — one per game-hour credited. */}
                <div style={{ position: 'absolute', top: 26, right: 28, width: 0, height: 0 }}>
                  {salaryPays.map((p) => (
                    <span
                      key={p.id}
                      style={{
                        position: 'absolute', right: 0, top: 0,
                        whiteSpace: 'nowrap',
                        fontSize: '.95rem', fontWeight: 700, color: '#b4ff64',
                        textShadow: '0 0 8px rgba(120,255,60,.7), 0 1px 2px rgba(0,0,0,.9)',
                        animation: 'salaryFloat 2.2s ease-out forwards',
                      }}
                    >
                      +ƒ{p.amount.toLocaleString()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {arcadeGameId && (
              <Suspense fallback={<div style={{ position: 'absolute', inset: 0, zIndex: 600, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', fontFamily: "'Share Tech Mono',monospace", letterSpacing: '.2em' }}>LOADING…</div>}>
                <ArcadeGame
                  gameId={arcadeGameId}
                  salary={citySave?.salary ?? 0}
                  onExit={() => setArcadeGameId(null)}
                  onDeductFiat={() => true}
                />
              </Suspense>
            )}

            {surveillance && (
              <>
                {/* CCTV chrome over the SAME pixel floor — red frame, REC dot +
                    timestamp. Artwork is identical to LIVE, just framed as a feed. */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 0 2px rgba(244,63,94,.28), inset 0 0 120px rgba(0,0,0,.4)' }} />
                <div style={{ position: 'absolute', top: 10, right: 12, fontSize: '.6rem', letterSpacing: '.18em', color: '#fb7185', pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'blink 1s steps(2) infinite', display: 'inline-block' }} />
                  REC · CAM 01 · {camClock.toLocaleTimeString()}
                </div>
              </>
            )}

            {/* ON-SCREEN HINT BAR — device-aware controls reminder. */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                bottom: 8,
                maxWidth: '94%',
                textAlign: 'center',
                fontSize: '.55rem',
                letterSpacing: '.14em',
                color: surveillance ? 'rgba(244,63,94,.7)' : 'rgba(180,220,255,.7)',
                background: 'rgba(4,6,12,.55)',
                border: '1px solid rgba(56,189,248,.18)',
                borderRadius: 6,
                padding: '.25rem .6rem',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {surveillance
                ? 'SURVEILLANCE · READ-ONLY · PRESS C TO TAKE CONTROL'
                : isTouch
                  ? 'TAP THE FLOOR TO WALK · TAP A STATION TO USE IT'
                  : 'WASD / ARROWS MOVE · E INTERACT · C CCTV · H HELP'}
            </div>
          </div>
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(56,189,248,.7)',
              font: '12px "Share Tech Mono", monospace',
              letterSpacing: '.1em',
              background: '#0a0a0a',
              borderRadius: 14,
              boxShadow: '0 0 0 1px rgba(56,189,248,.3)',
            }}
          >
            ROSTERING TEAM…
          </div>
        )}
      </div>

      {/* ECONOMY — collapsible BOTTOM drawer (the top/bottom split). Click the
          bar to expand the city ledger; collapsed it's just a thin strip so the
          floor stays full-bleed. */}
      <section
        style={{
          flex: '0 0 auto',
          height: economyH,
          boxSizing: 'border-box',
          borderTop: '1px solid rgba(56,189,248,.25)',
          background: 'rgba(5,8,10,.9)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <button
          onClick={() => { playClick(); setEconomyOpen(o => !o); }}
          style={{
            flex: '0 0 auto', height: 36, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'rgba(56,189,248,.7)',
            font: 'inherit', fontSize: '.6rem', letterSpacing: '.2em', padding: '0 .9rem',
          }}
        >
          <span>ECONOMY · {citySave ? `ƒ${citySave.salary.toLocaleString()}` : '—'} BALANCE</span>
          <span>{economyOpen ? '▾ HIDE' : '▴ SHOW'}</span>
        </button>
        {economyOpen && (
          <div
            style={{
              flex: '1 1 auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '.4rem 1.1rem',
              padding: '0 .9rem .6rem',
              overflow: 'auto',
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
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.08em' }}>{label}</span>
                <span style={{ fontSize: '.85rem', color }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* HELP overlay (key: H / ?) — quick-key cheat sheet. */}
      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(2,4,10,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 420, width: '100%', border: '1px solid rgba(56,189,248,.35)', borderRadius: 12, background: '#06090f', padding: '1.1rem 1.2rem', boxShadow: '0 20px 60px -20px rgba(0,0,0,.8)' }}
          >
            <div style={{ fontSize: '.95rem', letterSpacing: '.12em', color: '#38bdf8', marginBottom: '.7rem' }}>OFFICE CONTROLS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '.4rem .8rem', fontSize: '.7rem', color: 'rgba(200,230,255,.85)' }}>
              {([
                [isTouch ? 'TAP FLOOR' : 'WASD / ARROWS', 'Walk around the office'],
                [isTouch ? 'TAP STATION' : 'E', 'Use a station / clock into the terminal'],
                ['C', 'Toggle LIVE ↔ CCTV surveillance'],
                ['H / ?', 'Show or hide this help'],
                ['ESC', 'Close overlays · back to the office'],
              ] as [string, string][]).map(([key, desc]) => (
                <Fragment key={key}>
                  <span style={{ color: '#7dd3fc', whiteSpace: 'nowrap' }}>{key}</span>
                  <span>{desc}</span>
                </Fragment>
              ))}
            </div>
            <button
              onClick={() => setShowHelp(false)}
              style={{ marginTop: '1rem', width: '100%', padding: '.5rem', borderRadius: 6, border: '1px solid rgba(56,189,248,.5)', background: 'rgba(56,189,248,.15)', color: '#38bdf8', font: 'inherit', fontSize: '.7rem', letterSpacing: '.16em', cursor: 'pointer' }}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* FIRST-VISIT TUTORIAL (dismissible, remembered in localStorage). */}
      {showTutorial && !showHelp && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 690, background: 'rgba(2,4,10,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div style={{ maxWidth: 440, width: '100%', border: '1px solid rgba(150,120,255,.4)', borderRadius: 12, background: '#06090f', padding: '1.3rem 1.4rem', boxShadow: '0 24px 70px -20px rgba(90,45,170,.6)' }}>
            <div style={{ fontSize: '1.05rem', letterSpacing: '.1em', color: '#c4b5fd', marginBottom: '.5rem' }}>WELCOME TO YOUR OFFICE</div>
            <p style={{ fontSize: '.72rem', lineHeight: 1.7, color: 'rgba(210,225,255,.85)', margin: '0 0 .9rem' }}>
              {isTouch
                ? 'Tap anywhere on the floor to walk there. Walk up to a station — the conference whiteboard, comms, vending, the arcade — and tap the glowing prompt to use it. Tap your desk computer to clock into Pablo’s terminal.'
                : 'Move with WASD or the arrow keys (or just click the floor to walk). Walk up to a station — conference, comms, vending, the arcade — and press E to use it. The camera stays locked on you; press C for the CCTV surveillance feed, and H any time for the controls.'}
            </p>
            <button
              onClick={dismissTutorial}
              style={{ width: '100%', padding: '.6rem', borderRadius: 6, border: '1px solid rgba(150,120,255,.6)', background: 'rgba(150,120,255,.18)', color: '#ddd6fe', font: 'inherit', fontSize: '.72rem', letterSpacing: '.16em', cursor: 'pointer' }}
            >
              GOT IT ▸
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
