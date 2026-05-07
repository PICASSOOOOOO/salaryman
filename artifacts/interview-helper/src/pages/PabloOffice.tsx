/**
 * /office — Pablo's live pixel office. Full-page view of the ported
 * pixel-agents engine, with one pixel character per real team member
 * (staff + payroll employees), plus Pablo himself.
 *
 * Wrapped in GameLock by the router so it inherits the same game-state
 * gating as /world/play, /game, etc.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { LiveOffice } from '@/pixel-office/LiveOffice';
import { useAuth } from '@workspace/replit-auth-web';
import { apiFetch } from '@/lib/api-client';

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

// Always include Pablo at the top of the roster; he's the building's
// proprietor and the user's narrator.
const PABLO_AGENT = { id: 9001, label: 'Pablo' };

export default function PabloOffice() {
  const { isAuthenticated } = useAuth();
  const [vh, setVh] = useState(typeof window !== 'undefined' ? window.innerHeight : 720);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [rosterReady, setRosterReady] = useState(false);

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
    (async () => {
      try {
        const [s, e] = await Promise.all([
          apiFetch('/api/tools/hiring/staff'),
          apiFetch('/api/enterprise/employees'),
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
      } catch {
        /* fall back to defaults below */
      } finally {
        if (!cancelled) setRosterReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Build the agent roster: Pablo first, then deduped staff + employees.
  // Engine seats are limited (currently ~8 in default-layout-1), so cap
  // the head count — extras spawn as wanderers without seats.
  const agents = useMemo(() => {
    const list: { id: number; label: string }[] = [PABLO_AGENT];
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
    // Fall back to a small dummy crew if the user has no real team yet,
    // so the office has some life on first visit.
    if (list.length === 1) {
      const fallback = ['Quinn', 'Mira', 'Reyes', 'Hatch'];
      fallback.forEach((name, i) => list.push({ id: 3000 + i, label: name }));
    }
    return list.slice(0, 12);
  }, [staff, employees]);

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
          </div>
          <nav style={{ display: 'flex', gap: '1rem', fontSize: '.7rem', letterSpacing: '.1em' }}>
            <Link href="/game" style={{ color: 'rgba(56,189,248,.7)' }}>« BACK TO HUB</Link>
            <Link href="/team" style={{ color: 'rgba(56,189,248,.7)' }}>TEAM</Link>
          </nav>
        </div>
      </header>

      {rosterReady ? (
        <LiveOffice agents={agents} height={canvasHeight} />
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
