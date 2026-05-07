/**
 * /office — Pablo's live pixel office. Full-page view of the ported
 * pixel-agents engine. Each agent walks around, picks a desk, and works.
 *
 * Wrapped in GameLock by the router so it inherits the same game-state
 * gating as /world/play, /game, etc.
 */
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { LiveOffice } from '@/pixel-office/LiveOffice';

export default function PabloOffice() {
  // Window width drives the responsive header and the canvas height.
  const [vh, setVh] = useState(typeof window !== 'undefined' ? window.innerHeight : 720);
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Reserve room for the header/footer strip, then give the rest to the
  // canvas so the office fills as much of the viewport as possible.
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
        <nav style={{ display: 'flex', gap: '1rem', fontSize: '.7rem', letterSpacing: '.1em' }}>
          <Link href="/game" style={{ color: 'rgba(56,189,248,.7)' }}>« BACK TO HUB</Link>
          <Link href="/pablo" style={{ color: 'rgba(56,189,248,.7)' }}>PABLO TERMINAL</Link>
        </nav>
      </header>

      <LiveOffice agentCount={6} height={canvasHeight} />

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
