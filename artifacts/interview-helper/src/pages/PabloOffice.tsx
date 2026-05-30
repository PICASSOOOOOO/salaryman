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
import { useAuth } from '@workspace/replit-auth-web';
import { apiFetch } from '@/lib/api-client';
import { getSalarymanOfficeTier } from '@/lib/tutorial-progress';

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
  const [rosterReady, setRosterReady] = useState(false);
  // Read the user's onboarding office tier once on mount. localStorage
  // is the source of truth here — Immigration writes it after the user
  // makes their pick, and the value is stable for the session.
  const [tier] = useState(() => getSalarymanOfficeTier() ?? 'capsule');

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
        const [s, e, t] = await Promise.all([
          apiFetch('/api/tools/hiring/staff'),
          apiFetch('/api/enterprise/employees'),
          apiFetch('/api/business/tasks'),
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
    const byW = Math.floor(availW / (16 * 16));
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
            YOUR OFFICE · FACILITY 01
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
          <nav style={{ display: 'flex', gap: '1rem', fontSize: '.7rem', letterSpacing: '.1em' }}>
            <Link href="/game" style={{ color: 'rgba(56,189,248,.7)' }}>« BACK TO HUB</Link>
            <Link href="/team" style={{ color: 'rgba(56,189,248,.7)' }}>TEAM</Link>
          </nav>
        </div>
      </header>

      {rosterReady ? (
        <div
          style={{
            position: 'relative',
            height: canvasHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#05080a',
            boxShadow: '0 0 0 1px rgba(56,189,248,.3)',
            overflow: 'hidden',
          }}
        >
          {/* Walkable pixel office — WASD / arrows (or the on-screen D-pad on
              touch) move your character around the floor. Walk up to the desk
              computer and press E (or tap the prompt) to clock into Pablo's
              terminal. Replaces the old static portrait stage. */}
          <PixelOffice
            scale={officeScale}
            playable
            onEnterTerminal={() => navigate('/pablo')}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 6,
              textAlign: 'center',
              fontSize: '.55rem',
              letterSpacing: '.18em',
              color: 'rgba(56,189,248,.55)',
              pointerEvents: 'none',
            }}
          >
            WASD / ARROW KEYS TO MOVE · WALK TO THE COMPUTER + PRESS E TO CLOCK IN
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
          &gt; YOUR OFFICE · FACILITY 01 · LIVE FEED · WALK TO YOUR DESK TO CLOCK IN
        </div>
      </footer>
    </div>
  );
}
