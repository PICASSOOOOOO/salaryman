/** /office — the playable, contract-driven Shadow Tower floor. */
import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { type OfficeStation } from '@/components/office/office-types';
import { IsoOffice, type OfficeOccupant } from '@/components/IsoOffice';
import { OfficeMinimap } from '@/components/OfficeMinimap';
import { useToast } from '@/hooks/use-toast';
import { playClick, playNav, playSuccess } from '@/lib/ui-sound';
import { stopOfficeAmbient } from '@/soundEngine';
import { getAudioSettings, getMusicEnabled, setAudioSettings } from '@/lib/audio-settings';
import { floorPlacementForAssignments, type MonitorBot } from '@/lib/office-monitor';
import { apiFetch } from '@/lib/api-client';
import { NetWorthHUD } from '@/components/NetWorthHUD';
import { useUnemploymentSalary } from '@/hooks/useUnemploymentSalary';
import { useVerifiedSalary } from '@/hooks/useVerifiedSalary';
import { getSalarymanOfficeTier, type SalarymanOfficeTier } from '@/lib/tutorial-progress';
import { isEmbedMode } from '@/lib/embed-mode';
import { clearStoryBeginIntent, currentSlot } from '@/lib/story-gate';
import {
  loadDiscovery, saveDiscovery, withMoved, withInteracted,
  currentDiscoveryStep, discoveryCue, type DiscoveryState,
} from '@/lib/office-discovery';
import { MissionMenu } from '@/components/office/MissionMenu';
import { getRealQuarter } from '@/gameSystems';
import { type AssignmentStorySnapshot, type StoryAssignmentDef } from '@/lib/story-assignments';
import { getOwnedOffice, getOwnedHome, getOwnedOfficeCustomization, syncOwnedPropertiesLocal, type OwnedProperty } from '@/lib/owned-office';
import { getActiveCityName, getActiveCityId, hydrateActiveCityFromSave } from '@/lib/city-defs';
import { useCityClock } from '@/components/CityClock';
import { type Appearance, defaultAppearance, sanitizeAppearance, toWorkAttire } from '@/lib/character-identity';
import { getOfficeCameraScale } from '@/lib/office-camera';
import { setMapContext } from '@/lib/map-context';
import { startPendingHousingAssessmentRetry } from '@/lib/onboarding-housing';
import {
  getOfficeHudMode,
  getOfficeObjectDestination,
  defaultShadowTowerOfficeName,
  getShadowTowerOfficeLayout,
  officePropertyLayoutFromPlan,
  loadOfficePose,
  saveOfficePose,
  type OfficePose,
} from '@/lib/office-property-layouts';
import type { ShadowTowerPlan } from '@workspace/api-zod/shadow-tower';
import { Settings2, Loader2, Bot, Activity, Check, X } from 'lucide-react';
import { getTowerSpaceArtUrl } from '@/lib/tower-space-art';

// Reuse the real, playable arcade component as a full-screen overlay (lazy so it
// only loads when a cabinet is actually used).
import { useAuth } from '@/hooks/use-auth';
const ArcadeGame = lazy(() => import('@/pages/ArcadeGames'));

interface CitySave {
  salary: number;
  governmentBaseSalary?: number;
  goldBalance: number;
  level: number;
  hp: number;
  maxHp: number;
  savings: number;
  stamina: number;
  taxDebt: number;
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
  const { clock: cityClock, syncError: cityClockSyncError } = useCityClock(getActiveCityId());
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
  // Server story snapshot (which scenes are done / which is active) for the
  // MISSION MENU. Distinct from the gate which only carries active/eligible.
  const [storySnap, setStorySnap] = useState<AssignmentStorySnapshot | null>(null);
  // Legacy owned-property state remains for onboarding compatibility and
  // cosmetic customization only; Shadow Tower tenure comes from the server.
  const [owned, setOwned] = useState<OwnedProperty | null>(() => getOwnedOffice());
  const [ownedHome, setOwnedHome] = useState<OwnedProperty | null>(() => getOwnedHome());
  // The ƒ renovation (theme color / signage / lighting) applied to the office.
  // Main keys customization by building id in data.propertyCustomization; the
  // office maps to the player's workstation building. Read-only mirror so the
  // live /office reflects the same accent the home interior already applies.
  const [officeCustomization] = useState(() => getOwnedOfficeCustomization());
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
  // Compatibility wallet read; unemployed players receive no passive FIAT.
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
  // Full-screen office chrome: help/tutorial overlays.
  const [showHelp, setShowHelp] = useState(false);
  const [showMissions, setShowMissions] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showRadioControls, setShowRadioControls] = useState(false);
  const [isSavingHallway, setIsSavingHallway] = useState(false);
  // Discovery onboarding — the story is no longer started by a BEGIN STORY
  // button or a front-loaded WELCOME modal. Instead the office surfaces ONE
  // contextual cue at a time that teaches a mechanic by doing (move → use an
  // object → take the elevator), and stepping into the elevator naturally
  // begins the run. Progress persists per slot.
  const slot = currentSlot();
  const [towerFloor, setTowerFloor] = useState<{ canManage?: boolean; floor: { id: string; city: string; floorNumber: number; tenure: string; orgId?: number | null; ownerUserId?: string | null; leaseExpiresAt?: string | null; archetype: string; settings?: { hallway?: { style: "central" | "gallery" | "executive"; lighting: "dim" | "normal" | "bright" | "warm" | "cool"; signage?: string } } }; plan: ShadowTowerPlan; assignments: Array<{ workstationKey: string; assigneeType: "human" | "bot"; assigneeUserId?: string | null; botId?: number | null }>; botGroups: Array<{ purpose: string; permissionSignature: string; canonicalBotId: number; botIds: number[] }> } | null>(null);
  const officeLayout = useMemo(() => towerFloor ? officePropertyLayoutFromPlan(towerFloor.plan) : getShadowTowerOfficeLayout("minx_city", 1, "founder_team"), [towerFloor]);
  const officeName = towerFloor?.floor.settings?.hallway?.signage?.trim()
    || (towerFloor
      ? defaultShadowTowerOfficeName(towerFloor.plan.city, towerFloor.floor.floorNumber)
      : defaultShadowTowerOfficeName("minx_city", 1));
  const officeAddress = towerFloor
    ? `SHADOW TOWER · ${towerFloor.floor.city.replace("_", " ").toUpperCase()} · FLOOR ${towerFloor.floor.floorNumber}`
    : "SHADOW TOWER · OFFICE LOCATION PENDING";
  const initialOfficePose = useMemo(() => loadOfficePose(slot, officeLayout), [slot, officeLayout]);
  const officePoseRef = useRef<OfficePose>(initialOfficePose);
  useEffect(() => {
    officePoseRef.current = initialOfficePose;
  }, [officeLayout.propertyKey, initialOfficePose]);
  const rememberOfficePose = useCallback(() => {
    saveOfficePose(slot, officeLayout, officePoseRef.current);
  }, [slot, officeLayout]);
  useEffect(() => {
    const persist = () => rememberOfficePose();
    window.addEventListener('pagehide', persist);
    return () => {
      persist();
      window.removeEventListener('pagehide', persist);
    };
  }, [rememberOfficePose]);
  const handleOfficePoseChange = useCallback((pose: OfficePose) => {
    officePoseRef.current = pose;
    saveOfficePose(slot, officeLayout, pose);
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
      apiFetch('/api/world/server-status')
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

  // Exterior story scenes are paused in building-only mode. Keep the mission
  // data visible for continuity, but route play back into the tower.
  const beginStory = () => {
    playNav();
    toast({
      title: 'OUTSIDE WORLD LOCKED',
      description: 'Current operations are focused on the office and occupied tower floors.',
    });
    navigateFromOffice('/tower');
  };

  // MISSION MENU "PLAY". Once the story is running, every playable scene is tracked
  // in the city, so PLAY drops back in there. Before the story starts, only the
  // reserved opening scene is playable: if you're eligible it begins the run, and
  // if not it routes you to find work so you can become eligible.
  const handlePlayScene = (def: StoryAssignmentDef) => {
    setShowMissions(false);
    if (storyGate?.active) { beginStory(); return; }
    if (def.reserved) {
      if (storyGate?.eligible) beginStory();
      else { playNav(); navigate('/bots/jobs'); }
      return;
    }
    beginStory();
  };

  const handleSaveHallway = async (style: "central" | "gallery" | "executive", lighting: "dim" | "normal" | "bright" | "warm" | "cool", signage: string) => {
    if (!towerFloor) return;
    setIsSavingHallway(true);
    try {
      const res = await apiFetch(`/api/shadow-tower/floors/${towerFloor.floor.id}/hallway`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style, lighting, signage: signage.trim() || undefined }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error("Failed to save hallway");
      const updated = await res.json();
      setTowerFloor(prev => prev ? { ...prev, floor: updated.floor } : prev);
      playSuccess();
      toast({ description: "Hallway settings applied" });
      setShowCustomizer(false);
    } catch {
      toast({ description: "Could not apply hallway settings", variant: "destructive" });
    } finally {
      setIsSavingHallway(false);
    }
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
      stamina: Number((s.rec && typeof s.rec === 'object' ? (s.rec as { stamina?: unknown }).stamina : undefined) ?? s.energy ?? 100),
      taxDebt: Number(s.taxDebt ?? s.inGameDebt ?? 0),
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
      apiFetch('/api/salaryman/saves', { credentials: 'include' })
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
      setVh(window.visualViewport?.height ?? window.innerHeight);
      setVw(window.visualViewport?.width ?? window.innerWidth);
    };
    onResize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
    };
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

  // The office never starts a background bed on its own. Audio is a physical
  // radio interaction only; this cleanup protects the office from a bed left
  // alive by a previous route or an older hot-reloaded module.
  useEffect(() => {
    if (!embed) stopOfficeAmbient();
    return () => stopOfficeAmbient();
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

  // The floor endpoint is the authority for geometry, ownership and placements.
  // A 404 deliberately retains the shared founder-team demo plan without implying
  // the player owns it.
  useEffect(() => {
    if (!isAuthenticated) { setTowerFloor(null); return; }
    let cancelled = false;
    const refreshFloor = () => {
      apiFetch("/api/shadow-tower/floors/current", { credentials: "include" })
        .then(async (response) => {
          if (response.status === 404) return null;
          if (!response.ok) throw new Error("Unable to load Shadow Tower floor");
          return response.json();
        })
        .then((payload) => { if (!cancelled) setTowerFloor(payload); })
        .catch(() => { if (!cancelled) setTowerFloor(null); });
    };
    refreshFloor();
    const interval = window.setInterval(refreshFloor, 10_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isAuthenticated]);

  // Property-keyed capacity and footprint: the deed, renderer, collision map,
  // stations and surveillance camera all consume this same specification.
  const tierFloor = {
    deskCols: officeLayout.deskCols,
    deskRows: officeLayout.deskRows,
    capsules: officeLayout.capsules,
  };
  const floorRows = officeLayout.rows;

  // Build the human roster from actual team feeds only.  The tower assignment
  // is applied below; no narrator, dummy coworker, or tier cap is fabricated.
  // The stage shows a finite set of portrait cards, so cap the head count
  // to keep the composition readable.
  const agents = useMemo(() => {
    const list: { id: number; label: string; palette?: number; hueShift?: number }[] = [];
    // Pre-seed `seen` with the always-on principals so a duplicate Jean
    // Claw or Pablo from the staff/employees feeds doesn't double-spawn.
    const seen = new Set<string>();
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
    return list;
  }, [staff, employees]);

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

  const placedBots = useMemo(() => {
    const assignments = towerFloor?.assignments ?? [];
    const assignedBotIds = new Set(assignments.filter((a) => a.assigneeType === "bot" && typeof a.botId === "number").map((a) => a.botId as number));
    return floorPlacementForAssignments(bots, [...assignedBotIds]);
  }, [towerFloor, bots]);

  const activeFloorOccupants = useMemo(() => {
    // Activated bots take the first bullpen seats so a large staff roster can
    // never hide bots the user explicitly switched on. Human staff then fill
    // the remaining desks; de-dupe by name when an employee also has a bot row.
    const assignments = towerFloor?.assignments ?? [];
    const assignedHumans = assignments.filter((a) => a.assigneeType === "human").length;
    const seen = new Set(placedBots.map((bot) => bot.name.trim().toLowerCase()));
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
    return [...placedBots, ...staffBots.slice(0, assignedHumans)];
  }, [placedBots, agents, towerFloor]);

  const activeAutomationCount = useMemo(() => {
    const inProgressAssignees = new Set(
      tasks
        .filter((t) => t.status === 'in_progress' || t.status === 'doing')
        .map((t) => (t.assignee ?? '').trim().toLowerCase())
        .filter(Boolean)
    );
    return placedBots.filter((bot) => inProgressAssignees.has(bot.name.trim().toLowerCase())).length;
  }, [placedBots, tasks]);

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
    return getOfficeCameraScale({
      surveillance,
      viewportWidth: viewportW,
      viewportHeight: viewportH,
      floorWidthTiles: FLOOR_W_TILES,
      floorHeightTiles: FLOOR_H_TILES,
    });
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
        playNav();
        navigateFromOffice(`/tower/elevator?from=${encodeURIComponent('/office')}&floor=${towerFloor?.floor.floorNumber ?? 66}`);
      },
      stairs: () => {
        playClick();
        setElevatorLocked(true);
      },
      atm: () => { playNav(); navigateFromOffice(`${getOfficeObjectDestination('atm')}?returnTo=${encodeURIComponent('/office')}&returnFloor=${towerFloor?.floor.floorNumber ?? 66}`); },
      vending: () => { playNav(); navigateFromOffice(getOfficeObjectDestination('vending')); },
      payphone: () => { playNav(); navigateFromOffice('/phone'); },
      radio: () => {
        playClick();
        setShowRadioControls(true);
      },
      terminal: () => { playNav(); navigateFromOffice(getOfficeObjectDestination('terminal')); },
      "operations-terminal": () => { playNav(); navigateFromOffice(getOfficeObjectDestination('terminal')); },
    };
    const base: OfficeStation[] = officeLayout.stations.map((station) => ({
      ...station,
       onInteract: actions[station.id] ?? (station.id.includes("terminal") ? actions.terminal : () => {
        playClick();
        toast({
          title: `${station.label} · UNAVAILABLE`,
          description: 'This station is not connected yet.',
          variant: 'destructive',
        });
       }),
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
      <style>{`@keyframes blink{50%{opacity:.15}}@keyframes floorGlow{0%,100%{box-shadow:0 0 0 rgba(56,189,248,0)}50%{box-shadow:0 0 12px rgba(56,189,248,.22)}}@keyframes salaryFloat{0%{transform:translate(-50%,0) scale(.7);opacity:0}15%{transform:translate(-50%,-6px) scale(1.05);opacity:1}80%{opacity:1}100%{transform:translate(-50%,-58px) scale(1);opacity:0}}@keyframes salaryPulse{0%,100%{box-shadow:0 0 0 1px rgba(180,255,100,.35)}50%{box-shadow:0 0 14px 1px rgba(180,255,100,.55)}}`}</style>

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
            <span style={{ display: 'inline-grid', placeItems: 'center', minWidth: 34, height: 24, border: '1px solid rgba(56,189,248,.48)', background: 'rgba(56,189,248,.12)', color: '#bae6fd', animation: 'floorGlow 2.8s ease-in-out infinite' }}>
              F{towerFloor?.floor.floorNumber ?? '—'}
            </span>
            THE OFFICE
          </h1>
          {!compactHud && <span style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.5)', letterSpacing: '.12em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {getActiveCityName()}{serverOnline !== null ? ` · ${serverOnline}/${serverMax} ONLINE` : ''}
            &nbsp;· {officeName.toUpperCase()} · {officeAddress}
            &nbsp;· CAPACITY <span style={{ color: '#38bdf8' }}>{towerFloor?.assignments.length ?? 0}/{officeLayout.teamDesks.length}</span>
            &nbsp;· ACTIVE <span style={{ color: '#22c55e' }}>{activeCount}</span>
          </span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: 0 }}>
           {!compactHud && <span style={{ fontSize: '.55rem', letterSpacing: '.1em', color: cityClockSyncError ? '#fb7185' : '#bae6fd', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
             {cityClock ? `${cityClock.label} · ${cityClock.timezone}` : cityClockSyncError ? 'CLOCK OFFLINE' : 'SYNCING CLOCK'}
           </span>}
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
          {!compactHud && <Link href="/recreation" data-testid="link-office-rec" onClick={() => playNav()} style={{ color: '#fbbf24', fontSize: '.6rem', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>REC »</Link>}
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
              viewportWidth={viewportW}
              viewportHeight={viewportH}
              playable={!surveillance}
              followCam={followCam}
              activeBots={activeFloorOccupants}
              idleBots={[]}
              premium
              lighting={towerFloor?.floor?.settings?.hallway?.lighting || officeCustomization?.lighting || 'normal'}
              hallwayStyle={towerFloor?.floor?.settings?.hallway?.style}
              hallwaySignage={officeName}
              backdropSrc={getTowerSpaceArtUrl(
                towerFloor?.floor?.floorNumber === 66
                  ? 'picasso'
                  : towerFloor?.floor?.floorNumber === 67
                    ? 'shadow_corp'
                    : 'company',
              )}
              doorTopRow={11}
              doorBotRow={floorRows}
              rooms={officeLayout.rooms}
              deskColCount={tierFloor.deskCols}
              deskRowCount={tierFloor.deskRows}
              capsuleCount={tierFloor.capsules}
              initialPose={initialOfficePose}
              onPoseChange={handleOfficePoseChange}
              appearance={toWorkAttire(appearance)}
              playerName={playerName}
              onOccupants={handleOccupants}
              onEnterTerminal={() => { markInteracted(); navigateFromOffice(getOfficeObjectDestination('terminal')); }}
              onMove={markMoved}
              stations={stations}
              frozen={!!arcadeGameId}
              accentColor={officeCustomization?.themeColor}
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
            {towerFloor && !surveillance && !compactHud && (
              <div style={{ position: 'absolute', top: 10, left: 12, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none', zIndex: 5 }}>
                <span style={{
                  padding: '.14rem .45rem', borderRadius: 4,
                  background: towerFloor.floor.tenure === 'own' ? 'rgba(52,211,153,.9)' : 'rgba(56,189,248,.85)',
                  color: '#04121a', fontSize: '.5rem', fontWeight: 700, letterSpacing: '.18em',
                }}>{towerFloor.floor.tenure === 'own' ? 'OWNED' : 'LEASED'}</span>
                <span style={{ fontSize: '.6rem', color: '#e0f2fe', letterSpacing: '.06em', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>{officeName.slice(0, 40)}</span>
                <span style={{ fontSize: '.44rem', color: 'rgba(186,230,253,.62)', letterSpacing: '.08em' }}>{officeAddress}</span>
                <span style={{ fontSize: '.42rem', color: 'rgba(186,230,253,.62)', letterSpacing: '.08em' }}>{officeLayout.representation}</span>
              </div>
            )}

            {/* ── OCCUPANCY MINIMAP (top-left) ──────────────────────────────────
                See-through neon wireframe of the floor with live occupant dots
                (player = gold, active bots = green, idle bots = blue). Sits below
                the deed badge; hidden in surveillance mode (CCTV owns the view). */}
            {!surveillance && !compactHud && (
              <div style={{ position: 'absolute', top: towerFloor ? 38 : 10, left: 12, zIndex: 6, pointerEvents: 'none' }}>
                <OfficeMinimap occupantsRef={occupantsRef} layout={officeLayout} />

                {/* ── AUTOMATION INDICATOR ── */}
                <div style={{ pointerEvents: 'auto', marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'rgba(4,10,6,0.85)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 4 }}>
                  <Activity size={12} className={activeAutomationCount > 0 ? "text-emerald-400 animate-pulse" : "text-zinc-500"} />
                  <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.15em', color: activeAutomationCount > 0 ? '#34d399' : '#71717a' }}>
                    {activeAutomationCount > 0 ? `${activeAutomationCount} BOTS LIVE` : placedBots.length > 0 ? 'ASSIGNED/IDLE' : 'AUTOMATION IDLE'}
                  </span>
                </div>

                {/* ── CUSTOMIZATION BUTTON ── */}
                {towerFloor?.canManage && (
                  <div style={{ marginTop: 6, pointerEvents: 'auto' }}>
                    <button
                      onClick={() => setShowCustomizer(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,189,248,0.2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(56,189,248,0.1)'}
                    >
                      <Settings2 size={12} className="text-cyan-400" />
                      <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: '#38bdf8' }}>CONFIGURE HALLWAY</span>
                    </button>
                  </div>
                )}
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
                    netWorth={(salary?.spendable ?? 0) + (citySave?.savings ?? 0) + (citySave?.goldBalance ?? 0) * 1_000 - (citySave?.taxDebt ?? 0)}
                    cash={salary?.spendable ?? 0}
                    bankBalance={citySave?.savings ?? 0}
                    savings={citySave?.savings ?? 0}
                    gold={citySave?.goldBalance ?? 0}
                    fiatPerGold={1_000}
                    stamina={citySave?.stamina ?? 100}
                    showStamina
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
                {towerFloor ? (
                  <div style={{ fontSize: '.46rem', letterSpacing: '.12em', color: 'rgba(52,211,153,.78)', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>
                    {towerFloor.canManage ? "OFFICE OWNER / OPERATOR" : "ORGANIZATION MEMBER"} · ACTIVE FLOOR
                  </div>
                ) : !verifiedSalary?.verified && (
                  <div style={{ fontSize: '.46rem', letterSpacing: '.12em', color: 'rgba(251,191,36,.68)', textShadow: '0 0 6px rgba(0,0,0,.9)' }}>
                    NO ACTIVE OFFICE OR EMPLOYMENT ON FILE
                  </div>
                )}
                {!towerFloor && verifiedSalary?.awaitingVerification && (
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
                   <div style={{ fontVariantNumeric: 'tabular-nums' }}>{cityClock?.localDate ?? (cityClockSyncError ? 'CLOCK OFFLINE' : 'SYNCING')}</div>
                   <div style={{ fontVariantNumeric: 'tabular-nums' }}>{cityClock?.label ?? '—'}</div>
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

      {/* One Economy system: the office only links to the canonical page. */}
      {!embed && (
        <button
          type="button"
          onClick={() => { playNav(); navigateFromOffice('/game/economy'); }}
          style={{
            flex: '0 0 auto',
            height: 36,
            boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%',
            border: 0,
            borderTop: '1px solid rgba(56,189,248,.25)',
            background: 'rgba(5,8,10,.9)',
            color: 'rgba(56,189,248,.7)',
            font: 'inherit', fontSize: '.6rem', letterSpacing: '.2em', padding: '0 .9rem',
            cursor: 'pointer',
          }}
        >
          <span>ECONOMY · ONE FIAT/GOLD SYSTEM</span>
          <span style={{ color: 'rgba(56,189,248,.5)' }}>OPEN ECONOMY →</span>
        </button>
      )}

      {/* ── HALLWAY CUSTOMIZATION OVERLAY ── */}
      {showCustomizer && towerFloor && (
        <div
          onClick={() => setShowCustomizer(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 650, background: 'rgba(2,4,10,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420,
              background: '#0a0d14', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 8,
              padding: '1.5rem', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.5), 0 0 20px rgba(56,189,248,0.1) inset'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(56,189,248,0.15)', paddingBottom: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', letterSpacing: '0.1em', color: '#f8fafc', fontWeight: 600 }}>FLOOR HALLWAY</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>Configure public-facing lobby aesthetics.</p>
              </div>
              <button onClick={() => setShowCustomizer(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleSaveHallway(
                fd.get('style') as any,
                fd.get('lighting') as any,
                fd.get('signage') as string
              );
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#94a3b8', marginBottom: '0.5rem' }}>STYLE</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {['central', 'gallery', 'executive'].map(s => (
                      <label key={s} style={{ display: 'block', cursor: 'pointer' }}>
                        <input type="radio" name="style" value={s} defaultChecked={s === (towerFloor.floor.settings?.hallway?.style || 'central')} style={{ display: 'none' }} />
                        <div style={{
                          padding: '0.75rem 0.5rem', textAlign: 'center', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(255,255,255,0.02)', color: '#cbd5e1', fontSize: '0.75rem', letterSpacing: '0.05em', transition: 'all 0.2s'
                        }} className="[input:checked+&]:border-cyan-400 [input:checked+&]:bg-cyan-950/30 [input:checked+&]:text-cyan-300">
                          {s.toUpperCase()}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#94a3b8', marginBottom: '0.5rem' }}>LIGHTING</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {['cool', 'normal', 'warm'].map(l => (
                      <label key={l} style={{ display: 'block', cursor: 'pointer' }}>
                        <input type="radio" name="lighting" value={l} defaultChecked={l === (towerFloor.floor.settings?.hallway?.lighting || 'normal')} style={{ display: 'none' }} />
                        <div style={{
                          padding: '0.75rem 0.5rem', textAlign: 'center', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(255,255,255,0.02)', color: '#cbd5e1', fontSize: '0.75rem', letterSpacing: '0.05em', transition: 'all 0.2s'
                        }} className="[input:checked+&]:border-cyan-400 [input:checked+&]:bg-cyan-950/30 [input:checked+&]:text-cyan-300">
                          {l.toUpperCase()}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#94a3b8', marginBottom: '0.5rem' }}>NEON SIGNAGE (MAX 28 CHARS)</label>
                  <input
                    type="text"
                    name="signage"
                    maxLength={28}
                    defaultValue={towerFloor.floor.settings?.hallway?.signage || ''}
                    placeholder="e.g. WELCOME TO HQ"
                    style={{
                      width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6, color: '#f8fafc', fontSize: '0.9rem', outline: 'none', fontFamily: 'monospace'
                    }}
                    onFocus={e => e.target.style.borderColor = 'rgba(56,189,248,0.5)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button type="button" onClick={() => setShowCustomizer(false)} style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em', cursor: 'pointer' }}>CANCEL</button>
                  <button type="submit" disabled={isSavingHallway} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.75rem 1.5rem', background: '#38bdf8', border: 'none', borderRadius: 6, color: '#020617', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', cursor: isSavingHallway ? 'not-allowed' : 'pointer', opacity: isSavingHallway ? 0.7 : 1 }}>
                    {isSavingHallway ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    APPLY
                  </button>
                </div>

              </div>
            </form>
          </div>
        </div>
      )}

      {showRadioControls && (
        <div
          onClick={() => setShowRadioControls(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(2,4,10,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 360, border: '1px solid rgba(251,191,36,.4)', borderRadius: 10, background: '#09070d', padding: '1.2rem', boxShadow: '0 20px 60px rgba(0,0,0,.7)' }}
          >
            <img
              src={`${import.meta.env.BASE_URL}tower-art/object-shadow-radio.png`}
              alt="Shadow Radio 107.3"
              style={{ display: 'block', width: 180, height: 120, objectFit: 'contain', margin: '-.3rem auto .5rem' }}
            />
            <div style={{ color: '#fde68a', fontSize: '.85rem', fontWeight: 800, letterSpacing: '.16em' }}>SHADOW RADIO · 107.3</div>
            <div style={{ marginTop: 5, color: 'rgba(253,230,138,.55)', fontSize: '.62rem', letterSpacing: '.12em' }}>SOURCE CONTROLS</div>
            <button
              type="button"
              onClick={() => {
                const enabled = !getMusicEnabled();
                setAudioSettings({ musicEnabled: enabled });
                if (enabled) playSuccess(); else playClick();
                setShowRadioControls(false);
              }}
              style={{ marginTop: 18, width: '100%', border: '1px solid rgba(251,191,36,.45)', borderRadius: 6, background: getMusicEnabled() ? 'rgba(251,191,36,.16)' : 'transparent', color: '#fde68a', padding: '.65rem', font: 'inherit', fontSize: '.7rem', letterSpacing: '.14em', cursor: 'pointer' }}
            >
              {getMusicEnabled() ? 'ON AIR · TURN OFF' : 'OFF AIR · TURN ON'}
            </button>
            <label style={{ display: 'block', marginTop: 18 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', color: '#d4d4d8', fontSize: '.65rem', letterSpacing: '.12em' }}>
                <span>RADIO VOLUME</span>
                <span>{Math.round(getAudioSettings().soundtrack * 100)}%</span>
              </span>
              <input
                aria-label="Radio source volume"
                type="range"
                min={0}
                max={0.5}
                step={0.02}
                defaultValue={getAudioSettings().soundtrack}
                onChange={(event) => setAudioSettings({ soundtrack: Number(event.target.value) })}
                style={{ width: '100%', marginTop: 9, accentColor: '#fbbf24' }}
              />
            </label>
            <button type="button" onClick={() => setShowRadioControls(false)} style={{ marginTop: 18, width: '100%', border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, background: 'transparent', color: '#a1a1aa', padding: '.55rem', font: 'inherit', fontSize: '.65rem', letterSpacing: '.14em', cursor: 'pointer' }}>CLOSE</button>
          </div>
        </div>
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
                <img
                  src={`${import.meta.env.BASE_URL}tower-art/object-elevator.png`}
                  alt=""
                  style={{ width: 150, height: 150, objectFit: 'contain', filter: 'drop-shadow(0 10px 18px rgba(0,0,0,.8))' }}
                />
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
