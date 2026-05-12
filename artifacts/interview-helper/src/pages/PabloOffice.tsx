/**
 * /office — Pablo's live pixel office. Full-page view of the ported
 * pixel-agents engine, with one pixel character per real team member
 * (staff + payroll employees), plus Pablo himself.
 *
 * Wrapped in GameLock by the router so it inherits the same game-state
 * gating as /world/play, /game, etc.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { LiveOffice } from '@/pixel-office/LiveOffice';
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
// Jean Claw is the Pixel Agents floor manager — always sits second in the
// roster right after Pablo. Distinct emerald-tinted palette so the user
// can spot the underboss at a glance.
const JEAN_CLAW_AGENT = { id: 9002, label: 'Jean Claw', palette: 2, hueShift: 140 };

// Player avatar id — negative so it can never collide with any real
// teammate id, since staff/employee ids are derived as `1000 + s.id`
// and `2000 + e.id` (both unbounded above) and the principals live at
// 9001/9002. Negative id space is unused everywhere else.
const PLAYER_AGENT_ID = -1;

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
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [tasks, setTasks] = useState<BusinessTask[]>([]);
  const [rosterReady, setRosterReady] = useState(false);
  // Read the user's onboarding office tier once on mount. localStorage
  // is the source of truth here — Immigration writes it after the user
  // makes their pick, and the value is stable for the session.
  const [tier] = useState(() => getSalarymanOfficeTier() ?? 'capsule');

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
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

  // Build the agent roster: Pablo first, then deduped staff + employees.
  // Engine seats are limited (currently ~8 in default-layout-1), so cap
  // the head count — extras spawn as wanderers without seats.
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
            PABLO CORP / FACILITY 01
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
        <div style={{ position: 'relative' }}>
          <LiveOffice
            agents={agents}
            activity={activity}
            height={canvasHeight}
            playerId={PLAYER_AGENT_ID}
            playerLabel="YOU"
            tier={tier}
          />
          {/* Terminal computer — two-step interaction so reaching the rest of
              the app feels like sitting down at your desk instead of clicking
              a free-floating HUD button. First click powers the machine on,
              second click boots into Pablo's terminal. Engine doesn't expose
              sprite hit-tests, so the "computer" is a positioned HUD badge. */}
          <ComputerToggle onEnter={() => navigate('/pablo')} />
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
          &gt; PIXEL ART BY PABLO DE LUCCA · MIT LICENSE ·{' '}
          <a
            href="https://github.com/pablodelucca/pixel-agents"
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: 'rgba(56,189,248,.7)' }}
          >
            github.com/pablodelucca/pixel-agents
          </a>
        </div>
      </footer>
    </div>
  );
}

/**
 * ComputerToggle — a tiny in-office "computer" the player must boot before
 * the terminal opens. Two states:
 *   1. OFF  → click "POWER ON COMPUTER" to flip the switch (CRT warms up).
 *   2. ON   → click "ENTER TERMINAL" to navigate into Pablo's terminal.
 * Local state only; nothing to persist (every visit, the machine is asleep
 * — that's the whole "you just got to your desk" beat we're going for).
 */
function ComputerToggle({ onEnter }: { onEnter: () => void }) {
  const [on, setOn] = useState(false);
  const baseStyle = {
    position: 'absolute' as const,
    top: 14,
    right: 14,
    padding: '.55rem .85rem',
    color: '#cffafe',
    font: 'bold .65rem "Share Tech Mono", monospace',
    letterSpacing: '.22em',
    cursor: 'pointer',
    borderRadius: 4,
  };
  if (!on) {
    return (
      <button
        type="button"
        onClick={() => setOn(true)}
        title="Power on your office computer"
        data-testid="office-computer-power"
        style={{
          ...baseStyle,
          background: 'linear-gradient(135deg, rgba(120,120,140,.18), rgba(40,40,55,.18))',
          border: '1px solid rgba(120,120,140,.45)',
          boxShadow: '0 0 6px rgba(0,0,0,.35), inset 0 0 6px rgba(0,0,0,.5)',
        }}
      >
        <span style={{ marginRight: 6, color: '#71717a' }}>▢</span>
        COMPUTER&nbsp;·&nbsp;OFF
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onEnter}
      title="Boot into Pablo's terminal"
      data-testid="office-computer-enter"
      style={{
        ...baseStyle,
        background: 'linear-gradient(135deg, rgba(6,182,212,.15), rgba(34,197,94,.10))',
        border: '1px solid rgba(56,189,248,.55)',
        boxShadow: '0 0 14px rgba(56,189,248,.35), inset 0 0 8px rgba(56,189,248,.18)',
        animation: 'pablo-terminal-throb 2.2s ease-in-out infinite',
      }}
    >
      <span style={{ marginRight: 6, color: '#22c55e' }}>▸</span>
      ENTER TERMINAL
      <style>{`@keyframes pablo-terminal-throb { 0%,100% { box-shadow: 0 0 10px rgba(56,189,248,.30), inset 0 0 6px rgba(56,189,248,.12); } 50% { box-shadow: 0 0 22px rgba(56,189,248,.55), inset 0 0 12px rgba(56,189,248,.28); } }`}</style>
    </button>
  );
}
