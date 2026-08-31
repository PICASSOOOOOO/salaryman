/**
 * /office — Pablo's cinematic office. Full-bleed Nano Banana scene_office
 * background rendered through OfficeStage, with the crew (Pablo, Jean Claw,
 * and each real team member) shown as moody character portrait cards.
 *
 * Wrapped in GameLock by the router so it inherits the same game-state
 * gating as /world/play, /game, etc.
 */
import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { type OfficeStation } from '@/components/office/office-types';
import { IsoOffice, type OfficeOccupant } from '@/components/IsoOffice';
import { OfficeMinimap } from '@/components/OfficeMinimap';
import { useToast } from '@/hooks/use-toast';
import { playClick, playNav, playSuccess } from '@/lib/ui-sound';
import { startOfficeAmbient, stopOfficeAmbient, resumeAudioContext } from '@/soundEngine';
import { getAmbianceEnabled, getMusicEnabled, subscribeAudioSettings } from '@/lib/audio-settings';
import { floorPlacement, type MonitorBot } from '@/lib/office-monitor';
import { useAuth } from '@workspace/replit-auth-web';
import { apiFetch, FIAT_CHANGED_EVENT } from '@/lib/api-client';
import { setLiveRates, getCityCurrency, getCityCurrencyCode, getCityCostMultipliers } from '@/lib/currency';
import { NetWorthHUD } from '@/components/NetWorthHUD';
import { useUnemploymentSalary } from '@/hooks/useUnemploymentSalary';
import { useVerifiedSalary } from '@/hooks/useVerifiedSalary';
import { getSalarymanOfficeTier, type SalarymanOfficeTier } from '@/lib/tutorial-progress';
import { isEmbedMode } from '@/lib/embed-mode';
import { clearStoryBeginIntent, setStoryBeginIntent, currentSlot } from '@/lib/story-gate';
import {
  loadDiscovery, saveDiscovery, withMoved, withInteracted,
  currentDiscoveryStep, discoveryCue, type DiscoveryState,
} from '@/lib/office-discovery';
import { MissionMenu } from '@/components/office/MissionMenu';
import { getRealQuarter } from '@/gameSystems';
import { type AssignmentStorySnapshot, type StoryAssignmentDef } from '@/lib/story-assignments';
import { getOwnedOffice, getOwnedHome, getOwnedOfficeCustomization, syncOwnedPropertiesLocal, type OwnedProperty } from '@/lib/owned-office';
import { useArtAsset } from '@/lib/art';
import { getActiveCityName, getActiveCityId, hydrateActiveCityFromSave } from '@/lib/city-defs';
import { type Appearance, defaultAppearance, sanitizeAppearance, toWorkAttire } from '@/lib/character-identity';
import { setMapContext } from '@/lib/map-context';
import { startPendingHousingAssessmentRetry } from '@/lib/onboarding-housing';
import {
  getOfficeHudMode,
  getOfficeObjectDestination,
  getOfficePropertyLayout,
  loadOfficePose,
  saveOfficePose,
  type OfficePose,
} from '@/lib/office-property-layouts';

// Reuse the real, playable arcade component as a full-screen overlay (lazy so it
// only loads when a cabinet is actually used).
const ArcadeGame = lazy(() => import('@/pages/ArcadeGames'));

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
  hydrateActiveCityFromSave();
  const { isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  // Which arcade cabinet game is open on top of the office (null = none). Reuses
  // the existing playable <ArcadeGame> component; freezes the office underneath.
  const [arcadeGameId, setArcadeGameId] = useState<string | null>(null);
  const [elevatorLocked, setElevatorLocked] = useState(false);
  const [vh, setVh] = useState(typeof window !== 'undefined' ? window.innerHeight : 720);
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  // Measured size of the actual office pane (the gradient container that holds
  // the canvas). Driving the camera viewport off the REAL box — instead of a
  // vh-minus-chrome estimate — means the floor always fills the available space
  // with no black bars, and it auto-accounts for device safe-area insets.
  const officeViewRef = useRef<HTMLDivElement>(null);
  const occupantsRef = useRef<OfficeOccupant[]>([]);
  const handleOccupants = useCallback((o: OfficeOccupant[]) => { occupantsRef.current = o; }, []);
  const [paneW, setPaneW] = useState(0);
  const [paneH, setPaneH] = useState(0);
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
  const [tier, setTier] = useState<SalarymanOfficeTier>(() => getSalarymanOfficeTier() ?? 'capsule');
  useEffect(() => startPendingHousingAssessmentRetry(), []);
  useEffect(() => {
    setMapContext({
      kind: 'office',
      buildingId: 'salaryman_office',
      buildingLabel: 'PABLO CORP — OPERATIONS FLOOR',
      officeTier: tier,
    });
  }, [tier]);
  // Story gate — pre-story players are confined to the office (see StoryCityLock
  // in App.tsx). The office is the ONLY place that can begin the story, so the
  // city gate never soft-locks. `null` while the server result is in flight.
  const [storyGate, setStoryGate] = useState<{ active: boolean; eligible: boolean; reason?: string } | null>(null);
  // Mirror of the gate for stable station closures (the elevator's onInteract is
  // built once in a useMemo but must read the freshest story state).
  const storyGateRef = useRef(storyGate);
  useEffect(() => { storyGateRef.current = storyGate; }, [storyGate]);
  // Server story snapshot (which scenes are done / which is active) for the
  // MISSION MENU. Distinct from the gate which only carries active/eligible.
  const [storySnap, setStorySnap] = useState<AssignmentStorySnapshot | null>(null);
  // The property you rented/bought from the realty showroom. Drives the
  // establishing image (SAME useArtAsset(artKey) as the realty card) and the
  // tenure badge so the office you own looks like the deed you hold.
  const [owned, setOwned] = useState<OwnedProperty | null>(() => getOwnedOffice());
  // The rented home / starter base shares ONE space with the office, so when no
  // office has been bought we fall back to the home deed, then to the entry-tier
  // apartment art. This makes the office, the rented apartment and the starter
  // base all render from the SAME realty illustration.
  const [ownedHome, setOwnedHome] = useState<OwnedProperty | null>(() => getOwnedHome());
  // The ƒ renovation (theme color / signage / lighting) applied to the office.
  // Main keys customization by building id in data.propertyCustomization; the
  // office maps to the player's workstation building. Read-only mirror so the
  // live /office reflects the same accent the home interior already applies.
  const [officeCustomization] = useState(() => getOwnedOfficeCustomization());
  // The realty art that backs the room: owned office → rented home → entry-tier
  // apartment. The apartment key is a real realty asset (lazily generated by the
  // same pipeline the showroom uses — NOT new art), so even a starter base reads
  // as the realty illustration. Poll fast while it generates; once cached the
  // asset hook serves it instantly.
  const backdropArtKey = owned?.artKey || ownedHome?.artKey || 'property_apartment_office';
  const ownedArt = useArtAsset(backdropArtKey, 6000);
  const [serverOnline, setServerOnline] = useState<number | null>(null);
  const [serverMax, setServerMax] = useState(50);
  const [citySave, setCitySave] = useState<CitySave | null>(null);
  const [playerName, setPlayerName] = useState<string>('');
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
  // EMBED — chrome-free monitor mode for the /my-office split-view iframe
  // (?embed=1). Hides the header, economy drawer, hint bar, help/tutorial and
  // keyboard shortcuts so the pane reads as one clean CCTV feed instead of a
  // miniature copy of the whole /office page. Derived from the live query each
  // render (keyed on wouter `location`) so it stays correct whether the page is
  // loaded fresh in the iframe or reached via client-side navigation.
  // isEmbedMode() latches on first detection, so it survives the in-page
  // redirects/replaceState calls that rebuild /office and drop the query.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const embed = useMemo(() => isEmbedMode(), [location]);
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
    // Preserve any other query params (notably embed=1) when toggling the mode.
    const q = new URLSearchParams(window.location.search);
    if (m === 'surveillance') q.set('mode', 'surveillance'); else q.delete('mode');
    const qs = q.toString();
    window.history.replaceState(null, '', `${import.meta.env.BASE_URL}office${qs ? `?${qs}` : ''}`);
  };
  // There are only two views: LIVE (walk around, follow camera locked on the
  // player) and SURVEILLANCE (read-only CCTV, fixed full-floor overview). No
  // separate camera-zoom toggle — the view follows directly from the mode.
  // Pablo Corp unemployment stipend — live wallet + floating "+ƒ" payouts.
  // Server credits 500ƒ per in-game hour for the first 30 game days; the hook
  // polls + emits a pay event each time a whole game-hour lands.
  const { state: salary, payEvents: salaryPays } = useUnemploymentSalary(true);
  // Verified real-salary wage — credits monthlySalary/720 ƒ per REAL hour to
  // players whose income is verified (payroll provider or admin approval). The
  // hook polls + emits a pay event each whole real-hour credited.
  const { state: verifiedSalary, payEvents: verifiedPays } = useVerifiedSalary(true);
  // Credit score for the office HUD display — fetched once on mount.
  const [officeCreditInfo, setOfficeCreditInfo] = useState<{ score: number; tier: string } | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await apiFetch('/api/credit/score', { credentials: 'include' });
        if (r.ok && mounted) { const j = await r.json(); setOfficeCreditInfo({ score: j.score, tier: j.tier }); }
      } catch { /* offline */ }
    })();
    return () => { mounted = false; };
  }, []);
  // Full-screen office chrome: collapsible economy drawer, help/tutorial overlays.
  const [economyOpen, setEconomyOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showMissions, setShowMissions] = useState(false);
  // Discovery onboarding — the story is no longer started by a BEGIN STORY
  // button or a front-loaded WELCOME modal. Instead the office surfaces ONE
  // contextual cue at a time that teaches a mechanic by doing (move → use an
  // object → take the elevator), and stepping into the elevator naturally
  // begins the run. Progress persists per slot.
  const slot = currentSlot();
  const officeLayout = useMemo(
    () => getOfficePropertyLayout(owned?.propertyKey || owned?.artKey),
    [owned],
  );
  const initialOfficePose = useMemo(() => loadOfficePose(slot, officeLayout), [slot, officeLayout]);
  const officePoseRef = useRef<OfficePose>(initialOfficePose);
  const rememberOfficePose = useCallback(() => {
    saveOfficePose(slot, officeLayout, officePoseRef.current);
  }, [slot, officeLayout]);
  const navigateFromOffice = useCallback((path: string) => {
    rememberOfficePose();
    navigate(path);
  }, [navigate, rememberOfficePose]);
  const [discovery, setDiscovery] = useState<DiscoveryState>(() => loadDiscovery(slot));
  const markMoved = () => setDiscovery((d) => {
    if (d.moved) return d;
    const next = withMoved(d); saveDiscovery(slot, next); return next;
  });
  const markInteracted = () => setDiscovery((d) => {
    if (d.interacted) return d;
    const next = withInteracted(d); saveDiscovery(slot, next); return next;
  });
  const [isTouch] = useState(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
  // Ticking clock for the CCTV timestamp overlay (only runs in surveillance).
  const [camClock, setCamClock] = useState(() => new Date());
  useEffect(() => {
    if (!surveillance) return;
    const iv = setInterval(() => setCamClock(new Date()), 1000);
    return () => clearInterval(iv);
  }, [surveillance]);

  // ECONOMY BAR live data. The bar reads the AUTHORITATIVE bank ledger (sum of
  // FIAT accounts) — not the legacy client `citySave.salary` — plus the live
  // market index (BTC price, USD→ƒ/Gold conversions, FX). This keeps the office
  // economy bar consistent with Banco Ombra and the nav ticker.
  const [bankFiat, setBankFiat] = useState<number | null>(null);
  const [goldOz, setGoldOz] = useState<number>(0);
  const [market, setMarket] = useState<{
    btcUsd: number;
    multiplier: number;
    conversion: { usdToFiat: number; usdToGoldOz: number; btcToFiat: number; btcToGoldOz: number };
    fx?: Record<string, number>;
    cityMultipliers?: Record<string, { labor: number; property: number }>;
  } | null>(null);

  // Live FIAT + GOLD balances from the bank ledger.
  useEffect(() => {
    if (embed) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await apiFetch('/api/economy/bank/accounts');
        if (!r.ok) { if (alive) setBankFiat(null); return; }
        const j = (await r.json()) as { accounts?: { balance?: number; currency?: string }[] };
        if (!alive) return;
        const accts = j.accounts ?? [];
        setBankFiat(accts.filter((a) => (a.currency ?? 'FIAT') === 'FIAT').reduce((s, a) => s + (a.balance ?? 0), 0));
        setGoldOz(accts.filter((a) => a.currency === 'GOLD').reduce((s, a) => s + (a.balance ?? 0), 0));
      } catch { if (alive) setBankFiat(null); }
    };
    load();
    const id = setInterval(load, 30_000);
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onFiatChanged = () => { if (debounce) clearTimeout(debounce); debounce = setTimeout(load, 400); };
    window.addEventListener(FIAT_CHANGED_EVENT, onFiatChanged);
    return () => {
      alive = false;
      clearInterval(id);
      if (debounce) clearTimeout(debounce);
      window.removeEventListener(FIAT_CHANGED_EVENT, onFiatChanged);
    };
  }, [embed]);

  // Live market index (BTC / FX / conversions). Feeds the display-currency layer.
  useEffect(() => {
    if (embed) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await apiFetch('/api/real-estate/market-index');
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        setLiveRates(j.fx);
        setMarket(j);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [embed]);

  // Quick keys (desktop): Z cycle camera, C toggle CCTV/live, H/? help, Esc → hub.
  // WASD/E are owned by PixelOffice and never overlap these. Suspended while the
  // arcade overlay is open so it can own the keyboard.
  useEffect(() => {
    if (embed) return; // chrome-free monitor: no shortcuts, never navigate the iframe
    const onKey = (e: KeyboardEvent) => {
      if (arcadeGameId) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'c') { playClick(); selectMode(surveillance ? 'live' : 'surveillance'); }
      else if (k === 'h' || k === '?') { playClick(); setShowHelp(s => !s); }
      else if (k === 'escape') {
        if (showHelp) setShowHelp(false);
        else if (showMissions) setShowMissions(false);
        else { playNav(); navigateFromOffice('/pablo'); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcadeGameId, surveillance, showHelp, showMissions, navigate, embed]);

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

  // Story gate status. We always clear any stale begin-intent the moment the
  // office mounts (a fresh visit means the begin-story hop has landed or was
  // abandoned), then fetch the server-authoritative story state + eligibility
  // that drives the office's BEGIN STORY / FIND WORK call-to-action.
  useEffect(() => {
    if (embed) return;
    clearStoryBeginIntent();
    if (!isAuthenticated) { setStoryGate(null); return; }
    let cancelled = false;
    apiFetch(`/api/salaryman/story/${currentSlot()}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { story?: { active?: boolean; assignmentsCompleted?: string[]; missionIndex?: number }; eligible?: boolean; reason?: string } | null) => {
        if (cancelled || !body) return;
        setStoryGate({ active: !!body.story?.active, eligible: !!body.eligible, reason: body.reason });
        setStorySnap({ assignmentsCompleted: body.story?.assignmentsCompleted, missionIndex: body.story?.missionIndex });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated, embed]);

  // BEGIN STORY — flip the optimistic gate flag, then send the player to the
  // city. StoryCityLock opens optimistically on the intent flag so the hop never
  // flashes a lock; the city's own begin flow performs the server commitment.
  const beginStory = () => {
    setStoryBeginIntent();
    playNav();
    navigateFromOffice('/world/play');
  };

  // MISSION MENU "PLAY". Once the story is running, every playable scene is tracked
  // in the city, so PLAY drops back in there. Before the story starts, only the
  // reserved opening scene is playable: if you're eligible it begins the run, and
  // if not it routes you to find work so you can become eligible.
  const handlePlayScene = (def: StoryAssignmentDef) => {
    setShowMissions(false);
    if (storyGate?.active) { playNav(); navigateFromOffice('/world/play'); return; }
    if (def.reserved) {
      if (storyGate?.eligible) beginStory();
      else { playNav(); navigate('/bots/jobs'); }
      return;
    }
    playNav();
    navigateFromOffice('/world/play');
  };

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
        if (typeof parsed.name === 'string' && parsed.name.trim()) setPlayerName(parsed.name.trim());
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
          const selected = res.saves.find((save: { slotIndex?: number }) => Number(save.slotIndex) === slot);
          const selectedData = (selected?.data ?? {}) as {
            office?: OwnedProperty;
            home?: OwnedProperty;
            officeTier?: SalarymanOfficeTier;
          };
          const cloudOffice = selectedData.office ?? null;
          const cloudHome = selectedData.home ?? null;
          setOwned(cloudOffice);
          setOwnedHome(cloudHome);
          syncOwnedPropertiesLocal(cloudOffice, cloudHome);
          const cloudTier = cloudOffice?.tier ?? selectedData.officeTier;
          setTier(cloudTier === 'studio' || cloudTier === 'coworking' || cloudTier === 'suite' ? cloudTier : 'capsule');
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
            if (typeof dataObj.name === 'string' && dataObj.name.trim()) setPlayerName(dataObj.name.trim());
            if (dataObj.appearance) {
              const cls = (newest.charClass ?? dataObj.class) as string | undefined;
              setAppearance(sanitizeAppearance(dataObj.appearance, cls));
            }
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, slot]);

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
    if (embed) return; // embedded monitor stays silent — the host page owns audio
    const start = () => {
      resumeAudioContext();
      if (getAmbianceEnabled() && !getMusicEnabled()) startOfficeAmbient();
    };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    // Honor the AMBIANCE toggle mid-session (e.g. from the global audio panel).
    const unsub = subscribeAudioSettings(() => {
      if (getAmbianceEnabled() && !getMusicEnabled()) startOfficeAmbient();
      else stopOfficeAmbient();
    });
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      unsub();
      stopOfficeAmbient();
    };
  }, [embed]);

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

  // Property-keyed capacity and footprint: the deed, renderer, collision map,
  // stations and surveillance camera all consume this same specification.
  const tierFloor = {
    deskCols: officeLayout.deskCols,
    deskRows: officeLayout.deskRows,
    capsules: officeLayout.capsules,
  };
  const floorRows = officeLayout.rows;

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
  const activeFloorOccupants = useMemo(() => {
    // Activated bots take the first bullpen seats so a large staff roster can
    // never hide bots the user explicitly switched on. Human staff then fill
    // the remaining desks; de-dupe by name when an employee also has a bot row.
    const seen = new Set(deskBots.map((bot) => bot.name.trim().toLowerCase()));
    const staffBots = agents.flatMap((agent) => {
      const key = agent.label.trim().toLowerCase();
      if (!key || seen.has(key)) return [];
      seen.add(key);
      return [{
        id: agent.id,
        name: agent.label,
        status: 'active',
        teamColor: agent.id === PABLO_AGENT.id ? '#fbbf24' : agent.id === JEAN_CLAW_AGENT.id ? '#34d399' : '#38bdf8',
        teamLabel: 'Office Staff',
      }];
    });
    return [...deskBots, ...staffBots];
  }, [deskBots, agents]);

  const activeCount = useMemo(
    () => Object.values(activity).filter((a) => a.active).length,
    [activity],
  );

  // Full-screen chrome heights. The office fills everything between the compact
  // header and the collapsible economy drawer, so the page itself never scrolls.
  const compactHud = getOfficeHudMode(vw) === 'compact';
  const HEADER_H = compactHud ? 44 : 50;
  const economyH = compactHud ? 44 : 36;
  const officeAreaH = Math.max(240, vh - HEADER_H - economyH);

  // ─── ECONOMY BAR derived readouts (BTC-pegged, real balances) ───
  // Local currency is auto-derived from the realm/city the player is in
  // (Huda → VND, Minx → USD). All money math goes through the live market
  // index so the bar stays consistent with Banco Ombra & the nav ticker.
  const localCcyCode = getCityCurrencyCode(getActiveCityId());
  const localCcy = getCityCurrency(getActiveCityId());
  const GOLD_CASHOUT_FEE = 0.2; // mirrors server GOLD_CASHOUT_FEE_RATE
  const walletFiat = bankFiat;
  const usdPerOz = market && market.conversion.usdToGoldOz > 0 ? 1 / market.conversion.usdToGoldOz : 0;
  const fiatPerOz = market ? usdPerOz * market.conversion.usdToFiat : 0;
  const netWorthFiat = walletFiat != null ? walletFiat + goldOz * fiatPerOz : null;
  const withdrawUsd = goldOz * usdPerOz * (1 - GOLD_CASHOUT_FEE);
  const btcInLocal = market ? market.btcUsd * localCcy.ratePerUsd : 0;
  const fiatPerLocal = market ? market.conversion.usdToFiat / localCcy.ratePerUsd : 0;
  const fallbackCityRates = getCityCostMultipliers(getActiveCityId(), market?.multiplier ?? 1);
  const activeCityRates = market?.cityMultipliers?.[getActiveCityId()] ?? fallbackCityRates;
  const minxCityRates = market?.cityMultipliers?.minx_city ?? getCityCostMultipliers('minx_city', market?.multiplier ?? 1);
  const hudaCityRates = market?.cityMultipliers?.huda_city ?? getCityCostMultipliers('huda_city', market?.multiplier ?? 1);
  const cheapestCity = hudaCityRates.property <= minxCityRates.property ? 'HUDA' : 'MINX';
  const cheapestProperty = Math.min(hudaCityRates.property, minxCityRates.property);
  const activeCityLabel = getActiveCityId() === 'huda_city' ? 'HUDA' : 'MINX';
  const citySpreadPct = cheapestProperty > 0 ? Math.max(0, (activeCityRates.property / cheapestProperty - 1) * 100) : 0;
  const spreadSummary = activeCityLabel === cheapestCity
    ? `${activeCityLabel} LOWEST`
    : `${activeCityLabel} +${Math.round(citySpreadPct)}% vs ${cheapestCity}`;
  // Salary readout: verified hourly wage once a work visa clears, else the flat
  // unemployment stipend per game-day.
  const salaryReadout = verifiedSalary?.verified
    ? `ƒ${verifiedSalary.hourlyRate.toLocaleString()}/HR`
    : `ƒ${(salary?.perGameDay ?? 500).toLocaleString()}/DAY`;
  const salaryLabel = verifiedSalary?.verified ? 'SALARY' : 'STIPEND';
  const econFmt = (n: number, max = 0) =>
    isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: max }) : '—';
  const economyCells: [string, string, string][] = [
    [salaryLabel, salaryReadout, 'rgba(56,189,248,.85)'],
    ['WALLET', walletFiat != null ? `ƒ${walletFiat.toLocaleString()}` : '—', 'rgba(180,255,100,.9)'],
    ['NET WORTH', netWorthFiat != null ? `ƒ${Math.round(netWorthFiat).toLocaleString()}` : '—', 'rgba(120,200,255,.9)'],
    ['GOLD', `${econFmt(goldOz, 3)} oz`, 'rgba(255,204,0,.9)'],
    ['BTC', market ? `${localCcy.symbol}${econFmt(btcInLocal)}` : '—', 'rgba(251,146,60,.9)'],
    ['EXCHANGE', market ? `1 ${localCcyCode} → ƒ${econFmt(fiatPerLocal, 2)}` : '—', 'rgba(217,140,255,.9)'],
    ['LOCAL', `${localCcyCode} ${localCcy.symbol}`, 'rgba(120,255,190,.9)'],
    ['WITHDRAW', market ? `$${econFmt(withdrawUsd, 2)}` : '—', 'rgba(120,255,190,.9)'],
    ['SPREAD', market ? spreadSummary : '—', 'rgba(255,190,100,.95)'],
  ];
  // Collapsed-strip summary: live wallet + BTC so the headline reads true even
  // before the drawer is opened.
  const economyStrip = walletFiat != null
    ? `ƒ${walletFiat.toLocaleString()} WALLET${market ? ` · BTC ${localCcy.symbol}${econFmt(btcInLocal)} · SPREAD ${spreadSummary}` : ''}`
    : 'LOADING…';
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
  const FLOOR_W_TILES = officeLayout.cols;
  const FLOOR_H_TILES = floorRows;            // tier minimum, grown by the exec wing
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
    const actions: Record<string, () => void> = {
      elevator: () => {
        playClick();
        rememberOfficePose();
        const g = storyGateRef.current;
        if (g?.active) { playNav(); navigateFromOffice('/world/play'); }
        else if (g?.eligible) { beginStory(); }
        else { setElevatorLocked(true); }
      },
      atm: () => { playNav(); navigateFromOffice(getOfficeObjectDestination('atm')); },
      payphone: () => { playNav(); navigateFromOffice(getOfficeObjectDestination('payphone')); },
      vending: () => { playNav(); navigateFromOffice(getOfficeObjectDestination('vending')); },
    };
    const base: OfficeStation[] = officeLayout.stations.map((station) => ({
      ...station,
      onInteract: actions[station.id],
    }));
    // Using ANY object counts toward the discovery "interact" step — wrap every
    // station so the contextual cue advances no matter what the player tries.
    return base.map((s) => ({ ...s, onInteract: () => { markInteracted(); s.onInteract(); } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateFromOffice, officeLayout]);

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
        font: '13px "var(--font-sans)", monospace',
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

      {/* COMPACT HEADER — single fixed-height bar so the floor gets the rest.
          Hidden in embed mode so the /my-office monitor pane is chrome-free. */}
      {!embed && (
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
          {!compactHud && <span style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.5)', letterSpacing: '.12em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {getActiveCityName()}{serverOnline !== null ? ` · ${serverOnline}/${serverMax} ONLINE` : ''}
            &nbsp;· HEAD <span style={{ color: '#38bdf8' }}>{agents.length}</span>
            &nbsp;· ACTIVE <span style={{ color: '#22c55e' }}>{activeCount}</span>
          </span>}
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
          {!compactHud && hkBtn(() => { playClick(); setShowMissions(true); }, '◇ MISSIONS', showMissions)}
          {hkBtn(() => { playClick(); setShowHelp(s => !s); }, compactHud ? '?' : '? HELP · H', showHelp)}
          {!compactHud && <Link href="/game/map" data-testid="link-office-map" onClick={() => playNav()} style={{ color: '#c7f36b', fontSize: '.6rem', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>MAP »</Link>}
          {!compactHud && <Link href="/pablo" onClick={() => playNav()} style={{ color: 'rgba(56,189,248,.7)', fontSize: '.6rem', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>PABLO »</Link>}
        </div>
      </header>
      )}

      {/* OFFICE — fills all space between header + economy drawer. On small
          screens (and in the embedded monitor) the padding/rounding drop to
          zero so the floor bleeds to the screen edges. */}
      <div style={{ flex: '1 1 auto', minHeight: 0, padding: (fullBleed || embed) ? 0 : 8, boxSizing: 'border-box' }}>
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
              borderRadius: (fullBleed || embed) ? 0 : 14,
              boxShadow:
                '0 0 0 1px rgba(150,120,255,.30), 0 30px 80px -30px rgba(90,45,170,.55), inset 0 0 140px rgba(8,4,28,.7)',
              overflow: 'hidden',
            }}
          >
            {/* Walkable pixel office. Desktop: WASD/arrows move, E interacts.
                Mobile/pointer: TAP the floor to walk, tap a station to use it.
                `premium` renders the high-end, fully-lit grade; `followCam`
                keeps the camera locked on the player while LIVE. */}
            <IsoOffice
              key={`${slot}:${officeLayout.propertyKey}`}
              layout={officeLayout}
              scale={officeScale}
              roomCols={officeLayout.cols}
              roomRows={floorRows}
              viewportWidth={viewportW}
              viewportHeight={viewportH}
              playable={!surveillance}
              followCam={followCam}
              activeBots={activeFloorOccupants}
              idleBots={capsuleBots}
              premium
              doorTopRow={11}
              doorBotRow={floorRows}
              rooms={officeLayout.rooms}
              deskColCount={tierFloor.deskCols}
              deskRowCount={tierFloor.deskRows}
              capsuleCount={tierFloor.capsules}
              initialPose={initialOfficePose}
              onPoseChange={(pose) => { officePoseRef.current = pose; }}
              appearance={toWorkAttire(appearance)}
              playerName={playerName}
              onOccupants={handleOccupants}
              onEnterTerminal={() => { markInteracted(); navigateFromOffice(getOfficeObjectDestination('terminal')); }}
              onMove={markMoved}
              stations={stations}
              backdropSrc={ownedArt}
              frozen={!!arcadeGameId}
              accentColor={officeCustomization?.themeColor}
              lighting={officeCustomization?.lighting}
              suppressLabels={isTouch}
            />

            {/* ── BEGIN STORY gate ──────────────────────────────────────────
                Pre-story players are confined to the office (StoryCityLock).
                The office is the ONE place that begins the story, so the city
                gate can never soft-lock. There is no BEGIN STORY button: the
                player learns by doing (move → use an object → take the elevator),
                and one contextual cue at a time nudges the next mechanic. When
                they're ready, stepping into the ELEVATOR begins the run. If they
                still need work, the cue offers a FIND WORK path. */}
            {(() => {
              if (surveillance || embed) return null;
              const step = currentDiscoveryStep(discovery, storyGate);
              const cue = discoveryCue(step, { isTouch, reason: storyGate?.reason });
              if (!cue) return null;
              const col = cue.tone === 'ready' ? '#d9f99d' : cue.tone === 'blocked' ? '#fcd34d' : '#bfe3ff';
              return (
                <div
                  data-testid="office-discovery-cue"
                  data-step={cue.step}
                  style={{
                    position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)',
                    zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    maxWidth: 'min(92%, 380px)', textAlign: 'center', pointerEvents: 'auto',
                  }}
                >
                  <div style={{
                    fontSize: '.62rem', color: col, letterSpacing: '.08em', lineHeight: 1.6,
                    textShadow: '0 0 8px rgba(0,0,0,.95)', background: 'rgba(4,6,12,.6)',
                    border: `1px solid ${cue.tone === 'ready' ? 'rgba(180,255,100,.35)' : cue.tone === 'blocked' ? 'rgba(252,211,77,.3)' : 'rgba(120,200,255,.25)'}`,
                    borderRadius: 8, padding: '.45rem .8rem',
                  }}>
                    {cue.text}
                  </div>
                  {cue.showFindWork && (
                    <button
                      type="button"
                      data-testid="office-find-work"
                      onClick={() => { playNav(); navigate('/business/job-command'); }}
                      style={{
                        padding: '.5rem 1rem',
                        background: 'rgba(4,10,6,.82)',
                        border: '1px solid rgba(180,255,100,.5)', borderRadius: 7, color: '#d9f99d',
                        font: 'bold .68rem "var(--font-sans)", monospace', letterSpacing: '.14em',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      ▸ FIND WORK
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Compact property deed badge (top-left) — keeps the deed context
                without eating a 96px banner of vertical space. Hidden under the
                CCTV feed, whose camera HUD owns that corner. */}
            {owned && !surveillance && !compactHud && (
              <div style={{ position: 'absolute', top: 10, left: 12, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none', zIndex: 5 }}>
                <span style={{
                  padding: '.14rem .45rem', borderRadius: 4,
                  background: owned.tenure === 'own' ? 'rgba(52,211,153,.9)' : 'rgba(56,189,248,.85)',
                  color: '#04121a', fontSize: '.5rem', fontWeight: 700, letterSpacing: '.18em',
                }}>{owned.tenure === 'own' ? 'OWNED' : 'LEASED'}</span>
                <span style={{ fontSize: '.6rem', color: '#e0f2fe', letterSpacing: '.06em', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>{(officeCustomization?.signage && officeCustomization.signage.trim().length > 0) ? officeCustomization.signage.trim().slice(0, 28) : owned.name}</span>
                <span style={{ fontSize: '.42rem', color: 'rgba(186,230,253,.62)', letterSpacing: '.08em' }}>{officeLayout.representation}</span>
              </div>
            )}

            {/* ── OCCUPANCY MINIMAP (top-left) ──────────────────────────────────
                See-through neon wireframe of the floor with live occupant dots
                (player = gold, active bots = green, idle bots = blue). Sits below
                the deed badge; hidden in surveillance mode (CCTV owns the view). */}
            {!surveillance && !compactHud && (
              <div style={{ position: 'absolute', top: owned ? 38 : 10, left: 12, zIndex: 6, pointerEvents: 'none' }}>
                <OfficeMinimap occupantsRef={occupantsRef} layout={officeLayout} />
              </div>
            )}

            {/* ── MONEY GROUP (top-right) ───────────────────────────────────────
                Every money readout is grouped in one top-right cluster: net worth
                + credit score (NetWorthHUD) on top, then the live WALLET / salary
                lines. The top-left corner is reserved for the office minimap. */}
            {!surveillance && !compactHud && (
              <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 6, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div style={{ pointerEvents: 'auto', background: 'rgba(4,10,6,.72)', border: '1px solid rgba(255,215,0,.18)', borderRadius: 5, padding: '.3rem .55rem' }}>
                  <NetWorthHUD
                    netWorth={salary?.spendable ?? 0}
                    cash={salary?.spendable ?? 0}
                    savings={citySave?.savings ?? 0}
                    gold={citySave?.goldBalance ?? 0}
                    showStamina={false}
                    creditScore={officeCreditInfo?.score}
                    creditTier={officeCreditInfo?.tier}
                    compact
                  />
                </div>
                {salary && (
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
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
                    SALARY ƒ{salary.perGameDay?.toLocaleString()}/DAY · ƒ{salary.perGameDay?.toLocaleString()} IN {Math.max(1, Math.ceil(salary.nextDayInMs / 60_000))}M
                  </div>
                )}
                {verifiedSalary?.awaitingVerification && (
                  <div style={{ fontSize: '.44rem', letterSpacing: '.1em', color: 'rgba(251,191,36,.7)', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>
                    LEGALLY UNEMPLOYED · WORK VISA PENDING
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
                {/* VERIFIED SALARY — once a player's real-world monthly salary is
                    verified, they earn ƒ/hr (monthly÷720) credited per REAL hour.
                    Shows the hourly rate + countdown to the next credit, and floats
                    its own "+ƒ" on each payout. Hidden until verified. */}
                {verifiedSalary?.verified && (
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, marginTop: 2 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '.2rem .5rem', borderRadius: 5,
                      background: 'rgba(4,8,14,.78)',
                      border: '1px solid rgba(120,200,255,.35)',
                      animation: verifiedPays.length ? 'salaryPulse 1.1s ease-in-out' : undefined,
                    }}>
                      <span style={{ fontSize: '.46rem', letterSpacing: '.16em', color: 'rgba(120,200,255,.7)' }}>SALARY</span>
                      <span style={{ fontSize: '.64rem', letterSpacing: '.04em', color: '#78c8ff', fontWeight: 700 }}>
                        ƒ{verifiedSalary.hourlyRate.toLocaleString()}/HR
                      </span>
                    </div>
                    <div style={{ fontSize: '.42rem', letterSpacing: '.1em', color: 'rgba(120,200,255,.55)', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>
                      NEXT ƒ IN {Math.ceil(verifiedSalary.nextHourInMs / 60_000)}M
                    </div>
                    <div style={{ position: 'absolute', top: 2, right: 26, width: 0, height: 0 }}>
                      {verifiedPays.map((p) => (
                        <span
                          key={p.id}
                          style={{
                            position: 'absolute', right: 0, top: 0,
                            whiteSpace: 'nowrap',
                            fontSize: '.85rem', fontWeight: 700, color: '#78c8ff',
                            textShadow: '0 0 8px rgba(60,160,255,.7), 0 1px 2px rgba(0,0,0,.9)',
                            animation: 'salaryFloat 2.2s ease-out forwards',
                          }}
                        >
                          +ƒ{p.amount.toLocaleString()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                  </div>
                )}
              </div>
            )}

            {arcadeGameId && (
              <Suspense fallback={<div style={{ position: 'absolute', inset: 0, zIndex: 600, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', fontFamily: "var(--font-sans)", letterSpacing: '.2em' }}>LOADING…</div>}>
                <ArcadeGame
                  gameId={arcadeGameId}
                  salary={citySave?.salary ?? 0}
                  onExit={() => setArcadeGameId(null)}
                  onDeductFiat={() => true}
                />
              </Suspense>
            )}

            {surveillance && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 8, fontFamily: "var(--font-sans)" }}>
                {/* Frame markers keep the surveillance state identifiable. */}
                <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 2px rgba(244,63,94,.32)' }} />
                {/* Camera framing brackets in each corner. */}
                {([['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']] as const).map(([v, h]) => (
                  <div
                    key={`${v}-${h}`}
                    style={{
                      position: 'absolute', [v]: 12, [h]: 12, width: 16, height: 16,
                      [`border${v === 'top' ? 'Top' : 'Bottom'}`]: '2px solid rgba(244,63,94,.7)',
                      [`border${h === 'left' ? 'Left' : 'Right'}`]: '2px solid rgba(244,63,94,.7)',
                    } as CSSProperties}
                  />
                ))}
                {/* REC — top-left. */}
                <div style={{ position: 'absolute', top: 15, left: 20, display: 'flex', alignItems: 'center', gap: 6, fontSize: '.6rem', letterSpacing: '.2em', color: '#fb7185', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,.9)', animation: 'blink 1s steps(2) infinite', display: 'inline-block' }} />
                  REC
                </div>
                {/* Camera id + timestamp — top-right. */}
                <div style={{ position: 'absolute', top: 15, right: 20, textAlign: 'right', fontSize: '.56rem', letterSpacing: '.16em', color: 'rgba(190,230,255,.85)', textShadow: '0 0 6px rgba(0,0,0,.9)', lineHeight: 1.4 }}>
                  <div style={{ color: '#fb7185' }}>CAM 01</div>
                  <div style={{ fontVariantNumeric: 'tabular-nums' }}>{camClock.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' })}</div>
                  <div style={{ fontVariantNumeric: 'tabular-nums' }}>{camClock.toLocaleTimeString([], { hour12: false })}</div>
                </div>
                {/* In the full /office view the corners also carry the location
                    label + signal meter. In embed mode the host /my-office pane
                    supplies the bottom chrome, so they're suppressed there. */}
                {!embed && (
                  <>
                    <div style={{ position: 'absolute', bottom: 30, left: 20, fontSize: '.5rem', letterSpacing: '.18em', color: 'rgba(244,63,94,.72)', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>
                      PABLO CORP · BULLPEN
                    </div>
                    <div style={{ position: 'absolute', bottom: 30, right: 20, display: 'flex', alignItems: 'flex-end', gap: 6, fontSize: '.5rem', letterSpacing: '.16em', color: 'rgba(190,230,255,.8)', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>
                      <span>LIVE</span>
                      <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 1.5, height: 9 }}>
                        {[3, 5, 7, 9].map((bh, i) => (
                          <span key={i} style={{ width: 2, height: bh, background: i < 3 ? '#34d399' : 'rgba(150,200,170,.35)' }} />
                        ))}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* SURVEILLANCE HINT — only the read-only CCTV banner remains. Live
                controls are taught contextually by the discovery cue, not by a
                static control-hint bar. Suppressed in the embedded monitor. */}
            {!embed && surveillance && (
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
                color: 'rgba(244,63,94,.7)',
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
              SURVEILLANCE · READ-ONLY · PRESS C TO TAKE CONTROL
            </div>
            )}
          </div>
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(56,189,248,.7)',
              font: '12px "var(--font-sans)", monospace',
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
          floor stays full-bleed. Hidden in the embedded monitor. */}
      {!embed && (
      <section
         onClick={() => { playNav(); navigateFromOffice('/game/bank?tab=finance'); }}
        title="Open Banco Ombra"
        style={{
          flex: '0 0 auto',
          height: economyH,
          boxSizing: 'border-box',
          borderTop: '1px solid rgba(56,189,248,.25)',
          background: 'rgba(5,8,10,.9)',
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            height: 36, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%',
            color: 'rgba(56,189,248,.7)',
            font: 'inherit', fontSize: '.6rem', letterSpacing: '.2em', padding: '0 .9rem',
          }}
        >
          <span>ECONOMY · {economyStrip}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
            <span style={{ color: 'rgba(56,189,248,.5)' }}>BANCO OMBRA →</span>
            <button
              onClick={(e) => { e.stopPropagation(); playClick(); setEconomyOpen(o => !o); }}
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                font: 'inherit', fontSize: '.6rem', letterSpacing: '.2em', color: 'rgba(56,189,248,.7)', padding: 0,
              }}
            >
              {economyOpen ? '▾ HIDE' : '▴ SHOW'}
            </button>
          </span>
        </div>
        {economyOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              right: 0,
              background: 'rgba(5,8,10,.96)',
              borderTop: '1px solid rgba(56,189,248,.25)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '.4rem 1.1rem',
              padding: '.6rem .9rem',
              zIndex: 20,
            }}
          >
            {economyCells.map(([label, value, color]) => (
              <div
                key={label}
                 onClick={() => { playNav(); navigateFromOffice('/game/bank?tab=finance'); }}
                style={{ display: 'flex', flexDirection: 'column', gap: '1px', cursor: 'pointer' }}
              >
                <span style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.08em' }}>{label}</span>
                <span style={{ fontSize: '.85rem', color }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {/* HELP overlay (key: H / ?) — quick-key cheat sheet. */}
      {!embed && showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(2,4,10,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 420, width: '100%', border: '1px solid rgba(56,189,248,.35)', borderRadius: 12, background: '#06090f', padding: '1.1rem 1.2rem', boxShadow: '0 20px 60px -20px rgba(0,0,0,.8)' }}
          >
            <div style={{ fontSize: '.95rem', letterSpacing: '.12em', color: '#38bdf8', marginBottom: '.7rem' }}>OFFICE CONTROLS</div>
            <p style={{ margin: '0 0 .8rem', color: 'rgba(200,230,255,.76)', fontSize: '.72rem', lineHeight: 1.55 }}>
              SALARYMAN turns work into a playable company: get supplies, choose a working property, hire agents, and run business operations.
            </p>
            <div data-testid="office-commerce-destinations" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.45rem', marginBottom: '.9rem' }}>
              {([
                ['SUPPLIES', '/vending?from=office'],
                ['PROPERTY', '/store/realty?from=office'],
                ['AGENTS', '/bots'],
                ['BUSINESS OPS', '/business'],
              ] as const).map(([label, path]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setShowHelp(false); playNav(); navigateFromOffice(path); }}
                  style={{ padding: '.55rem .45rem', borderRadius: 6, border: '1px solid rgba(56,189,248,.32)', background: 'rgba(56,189,248,.08)', color: '#bae6fd', font: 'inherit', fontSize: '.62rem', letterSpacing: '.09em', cursor: 'pointer' }}
                >
                  {label}
                </button>
              ))}
            </div>
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

      {/* ELEVATOR LOCKED modal — shown when player walks up and interacts with the lift. */}
      {elevatorLocked && (
        <div
          onClick={() => setElevatorLocked(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 700,
            background: 'rgba(0,4,12,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "var(--font-sans)",
          }}
        >
          <style>{`
            @keyframes elev-door-shake {
              0%,100% { transform: translateX(0); }
              12% { transform: translateX(-4px); }
              24% { transform: translateX(4px); }
              36% { transform: translateX(-2px); }
              48% { transform: translateX(2px); }
              60% { transform: translateX(0); }
            }
            @keyframes elev-blink {
              0%,49% { opacity: 1; }
              50%,100% { opacity: 0.08; }
            }
            @keyframes elev-btn-pulse {
              0%,100% { box-shadow: 0 0 4px rgba(56,189,248,0.25); }
              50% { box-shadow: 0 0 12px rgba(56,189,248,0.75); border-color: rgba(56,189,248,0.8); color: rgba(56,189,248,0.9); }
            }
          `}</style>

          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 260, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            {/* Floor indicator panel */}
            <div style={{
              width: '100%', background: '#06121f',
              border: '1px solid rgba(56,189,248,0.25)', borderBottom: 'none',
              borderRadius: '4px 4px 0 0', padding: '6px 0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 13, letterSpacing: '0.25em', color: '#ffd23f',
            }}>
              <span style={{ animation: 'elev-blink 0.9s step-start infinite' }}>▲</span>
              <span style={{ animation: 'elev-blink 0.9s step-start infinite 0.45s', opacity: 0.08 }}>▲</span>
              <span style={{ fontSize: 10, color: 'rgba(255,210,63,0.5)', letterSpacing: '0.3em' }}>B2</span>
            </div>

            {/* Twin doors + call button panel */}
            <div style={{ width: '100%', display: 'flex', position: 'relative' }}>
              {/* Doors */}
              <div style={{
                flex: 1, height: 190, display: 'flex', overflow: 'hidden',
                border: '1px solid rgba(56,189,248,0.2)',
                animation: 'elev-door-shake 3.5s ease-in-out infinite',
              }}>
                {/* Left door */}
                <div style={{
                  flex: 1, height: '100%',
                  background: 'linear-gradient(180deg,#1c2838 0%,#111b26 100%)',
                  borderRight: '1px solid rgba(4,8,16,0.9)',
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  paddingRight: 10,
                }}>
                  <div style={{ width: 2, height: '55%', background: 'rgba(56,189,248,0.1)', borderRadius: 1 }} />
                </div>
                {/* Right door */}
                <div style={{
                  flex: 1, height: '100%',
                  background: 'linear-gradient(180deg,#1c2838 0%,#111b26 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                  paddingLeft: 10,
                }}>
                  <div style={{ width: 2, height: '55%', background: 'rgba(56,189,248,0.1)', borderRadius: 1 }} />
                </div>
              </div>

              {/* Call button panel */}
              <div style={{
                position: 'absolute', right: -28, top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{
                  width: 18, height: 18,
                  border: '1px solid rgba(56,189,248,0.45)',
                  borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, color: 'rgba(56,189,248,0.55)',
                  animation: 'elev-btn-pulse 1.8s ease-in-out infinite',
                }}>▲</div>
                <div style={{
                  width: 18, height: 18,
                  border: '1px solid rgba(56,189,248,0.15)',
                  borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, color: 'rgba(56,189,248,0.2)',
                }}>▼</div>
              </div>

              {/* Lock overlay on doors */}
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 8, pointerEvents: 'none',
              }}>
                <div style={{ fontSize: 30 }}>🔒</div>
                <div style={{
                  fontSize: 9, letterSpacing: '0.35em', color: '#f43f5e',
                  textShadow: '0 0 10px rgba(244,63,94,0.55)',
                }}>RESTRICTED</div>
              </div>
            </div>

            {/* Footer label */}
            <div style={{
              width: '100%', background: '#06121f',
              border: '1px solid rgba(56,189,248,0.2)', borderTop: 'none',
              borderRadius: '0 0 4px 4px', padding: '10px 14px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, letterSpacing: '0.22em', color: '#38bdf8', marginBottom: 4 }}>
                ELEVATOR · LOCKED
              </div>
              <div style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(56,189,248,0.45)', lineHeight: 1.5 }}>
                {storyGate?.reason || 'The city is sealed until you land work. Take a job or register a business, then step back in.'}
              </div>
              <button
                onClick={() => { setElevatorLocked(false); playNav(); navigate('/bots/jobs'); }}
                style={{
                  marginTop: 10,
                  background: 'rgba(180,255,100,.14)',
                  border: '1px solid rgba(180,255,100,0.5)',
                  color: '#d9f99d', borderRadius: 3,
                  padding: '6px 18px', fontSize: 9, letterSpacing: '0.22em',
                  cursor: 'pointer', fontFamily: 'inherit', width: '100%', fontWeight: 700,
                }}
              >
                ▸ FIND WORK
              </button>
              <button
                onClick={() => setElevatorLocked(false)}
                style={{
                  marginTop: 6, background: 'transparent',
                  border: '1px solid rgba(56,189,248,0.3)',
                  color: 'rgba(56,189,248,0.65)', borderRadius: 3,
                  padding: '5px 18px', fontSize: 9, letterSpacing: '0.22em',
                  cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                }}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MISSION MENU — the office scene picker, wired into the story/assignment
          system. Selecting the reserved opening scene begins the run. */}
      {!embed && showMissions && (
        <MissionMenu
          quarter={getRealQuarter()}
          story={storySnap}
          storyActive={!!storyGate?.active}
          eligible={!!storyGate?.eligible}
          onPlay={handlePlayScene}
          onClose={() => setShowMissions(false)}
        />
      )}
    </div>
  );
}
