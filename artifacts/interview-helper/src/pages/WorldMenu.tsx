import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';

type CharClass = 'corporate' | 'outcast' | 'replicant';

const CLASSES = [
  {
    id: 'corporate' as CharClass,
    label: 'CORPORATE',
    tagline: 'City. Salary. Connections.',
    desc: 'Born in the neon towers. You know the right people — for now. High starting salary. The wasteland will eat you alive.',
    start: 'CITY SECTOR',
    salary: '$500',
    hp: '100',
    color: '#00ff41',
  },
  {
    id: 'outcast' as CharClass,
    label: 'OUTCAST',
    tagline: 'Wasteland. Broke. Alive.',
    desc: 'Exiled. Nothing to your name. You survive by instinct. Zero salary. The city will chew you up. The wasteland is your home.',
    start: 'WASTELAND',
    salary: '$0',
    hp: '100',
    color: '#88ff44',
  },
  {
    id: 'replicant' as CharClass,
    label: 'REPLICANT',
    tagline: 'Android. Balanced. Alone.',
    desc: 'Neither human nor machine. Neither city nor wasteland. You walk both sides. Trusted by nobody. Useful to everyone.',
    start: 'CITY SECTOR',
    salary: '$200',
    hp: '100',
    color: '#33ffaa',
  },
];

const FLAVOR = [
  'The collapse happened three years ago.',
  'PABLO Corp. still runs the city.',
  'The wasteland is everything south of the wall.',
  'Your PABLO device is your only edge.',
  'Credits don\'t grow on ruins.',
];

export default function WorldMenu() {
  const [, navigate] = useLocation();
  const [cls, setCls]   = useState<CharClass>('corporate');
  const [name, setName] = useState('');
  const [tick, setTick] = useState(0);
  const [flavorIdx, setFlavorIdx] = useState(0);
  const [players, setPlayers] = useState<number | null>(null);

  // Blinking cursor + cycling flavor text
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setFlavorIdx(i => (i + 1) % FLAVOR.length), 3200);
    return () => clearInterval(t);
  }, []);

  // Try to get online player count from the WS endpoint (gracefully)
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws?name=_probe&class=corporate&x=0&y=0`);
    let done = false;
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'player_list' && !done) {
          done = true;
          setPlayers(m.players.length);
          ws.close();
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => ws.close();
    const timeout = setTimeout(() => { if (!done) ws.close(); }, 3000);
    return () => { clearTimeout(timeout); ws.close(); };
  }, []);

  const selected = CLASSES.find(c => c.id === cls)!;

  const handleEnter = () => {
    if (!name.trim()) return;
    const char = { name: name.trim().toUpperCase(), class: cls, sx: cls === 'outcast' ? 460 : 560, sy: cls === 'outcast' ? 750 : 320, salary: cls === 'corporate' ? 500 : cls === 'replicant' ? 200 : 0 };
    localStorage.setItem('sm_char', JSON.stringify(char));
    navigate('/world/play');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#030803', fontFamily: "'Share Tech Mono', monospace", position: 'relative', overflow: 'hidden' }}>
      {/* Scanlines */}
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px)', pointerEvents: 'none', zIndex: 99 }} />

      {/* Ambient grid background */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,255,65,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,65,.025) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none', zIndex: 0 }} />

      {/* Top strip */}
      <div style={{ position: 'relative', zIndex: 1, padding: '.4rem 1.5rem', borderBottom: '1px solid rgba(0,255,65,.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.14em' }}>PABLO CORP. / SALARYMAN OS v1.0</span>
        <span style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em' }}>
          {players !== null ? `${players} OPERATIVE${players !== 1 ? 'S' : ''} ONLINE` : 'CONNECTING...'}
          {tick % 2 === 0 ? ' ▮' : ' ▯'}
        </span>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', position: 'relative', zIndex: 1 }}>

        {/* Title block */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 'clamp(3rem, 8vw, 5.5rem)', color: '#00ff41', textShadow: '0 0 30px rgba(0,255,65,.4), 0 0 60px rgba(0,255,65,.15)', letterSpacing: '.18em', lineHeight: 1 }}>
            SALARYMAN
          </div>
          <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.2em', marginTop: '.4rem', fontFamily: "'VT323', monospace", fontSize_: '1rem' }}>
            BY PICASSOO.AI — PABLO CORP. WORLD
          </div>
          <div style={{ marginTop: '.75rem', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,255,65,.3), transparent)' }} />
          <div style={{ marginTop: '.6rem', fontSize: '.6rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.1em', minHeight: '1.2em', transition: 'opacity .3s' }}>
            {FLAVOR[flavorIdx]}
          </div>
        </div>

        {/* Class select + name form */}
        <div style={{ width: '100%', maxWidth: 820, display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>

          {/* Class cards */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em', marginBottom: '.2rem' }}>SELECT OPERATIVE CLASS</div>
            {CLASSES.map(c => (
              <button key={c.id} onClick={() => setCls(c.id)} style={{ padding: '.75rem .9rem', border: cls === c.id ? `1px solid ${c.color}` : '1px solid rgba(0,255,65,.15)', background: cls === c.id ? 'rgba(0,255,65,.07)' : 'rgba(0,255,65,.01)', color: cls === c.id ? c.color : 'rgba(0,255,65,.35)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'all .12s' }}>
                <div style={{ flexShrink: 0, width: 8, height: 8, background: cls === c.id ? c.color : 'rgba(0,255,65,.2)', boxShadow: cls === c.id ? `0 0 8px ${c.color}` : 'none' }} />
                <div>
                  <div style={{ fontFamily: "'VT323', monospace", fontSize: '1.1rem', letterSpacing: '.1em', lineHeight: 1 }}>{c.label}</div>
                  <div style={{ fontSize: '.55rem', color: cls === c.id ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)', marginTop: '.15rem', letterSpacing: '.06em' }}>{c.tagline}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Selected class detail + form */}
          <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
            {/* Class detail card */}
            <div style={{ border: `1px solid ${selected.color}44`, background: 'rgba(0,255,65,.04)', padding: '1rem' }}>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: '1.4rem', color: selected.color, letterSpacing: '.12em', marginBottom: '.5rem' }}>{selected.label}</div>
              <div style={{ fontSize: '.62rem', color: 'rgba(0,255,65,.5)', lineHeight: 1.8, marginBottom: '.75rem' }}>{selected.desc}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.4rem' }}>
                {[['START', selected.start], ['SALARY', selected.salary], ['HP', selected.hp]].map(([k, v]) => (
                  <div key={k} style={{ border: '1px solid rgba(0,255,65,.12)', padding: '.4rem .5rem' }}>
                    <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '.15rem' }}>{k}</div>
                    <div style={{ fontFamily: "'VT323', monospace", fontSize: '.9rem', color: selected.color, letterSpacing: '.08em' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Name input */}
            <div>
              <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em', marginBottom: '.35rem' }}>OPERATIVE DESIGNATION</div>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEnter()}
                maxLength={18}
                placeholder={`NAME YOUR ${selected.label}...`}
                autoFocus
                style={{ width: '100%', padding: '.65rem .8rem', background: 'rgba(0,8,0,.95)', border: `1px solid ${name ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)'}`, color: '#00ff41', fontFamily: "'Share Tech Mono', monospace", fontSize: '1rem', letterSpacing: '.1em', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box', transition: 'border-color .15s' }}
              />
            </div>

            {/* Enter button */}
            <button
              onClick={handleEnter}
              disabled={!name.trim()}
              style={{ width: '100%', padding: '.75rem', background: name.trim() ? 'rgba(0,255,65,.1)' : 'transparent', border: name.trim() ? '1px solid rgba(0,255,65,.7)' : '1px solid rgba(0,255,65,.1)', color: name.trim() ? '#00ff41' : 'rgba(0,255,65,.15)', fontFamily: "'VT323', monospace", fontSize: '1.5rem', letterSpacing: '.2em', cursor: name.trim() ? 'pointer' : 'default', textShadow: name.trim() ? '0 0 12px rgba(0,255,65,.4)' : 'none', transition: 'all .15s' }}
            >
              ENTER THE WORLD {name.trim() ? (tick % 2 === 0 ? '▶' : '▷') : ''}
            </button>

            <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.18)', letterSpacing: '.08em', lineHeight: 1.8 }}>
              WASD — move &nbsp;·&nbsp; E — enter buildings &nbsp;·&nbsp; C — chat &nbsp;·&nbsp; V — voice &nbsp;·&nbsp; P — PABLO device
            </div>
          </div>
        </div>
      </div>

      {/* Bottom strip */}
      <div style={{ position: 'relative', zIndex: 1, padding: '.4rem 1.5rem', borderTop: '1px solid rgba(0,255,65,.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.15)', letterSpacing: '.1em' }}>CITY SECTOR · WASTELAND ZONE · 9 LOCATIONS</span>
        <button onClick={() => navigate('/')} style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.2)', background: 'transparent', border: '1px solid rgba(0,255,65,.1)', padding: '2px 8px', cursor: 'pointer', letterSpacing: '.08em' }}>← BACK TO APP</button>
      </div>
    </div>
  );
}
