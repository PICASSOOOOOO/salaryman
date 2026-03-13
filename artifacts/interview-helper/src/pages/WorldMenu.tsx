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

const INDUSTRIES = [
  'FINANCE', 'TECH', 'SECURITY', 'LOGISTICS', 'PHARMA',
  'MEDIA', 'ARMS', 'BLACK MARKET', 'SALVAGE', 'ENERGY',
];

const SIZES = ['SOLO OPERATOR', 'SMALL (2-10)', 'MID (11-50)', 'CORP (51-500)', 'MEGACORP (500+)'];

const FLAVOR = [
  'The collapse happened three years ago.',
  'PABLO Corp. still runs the city.',
  'The wasteland is everything south of the wall.',
  'Your PABLO device is your only edge.',
  'Credits don\'t grow on ruins.',
  'Every building in the city has a price.',
  'Gang territory starts where the lights end.',
];

export default function WorldMenu() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<1 | 2>(1);
  const [cls, setCls]   = useState<CharClass>('corporate');
  const [name, setName] = useState('');
  const [tick, setTick] = useState(0);
  const [flavorIdx, setFlavorIdx] = useState(0);
  const [players, setPlayers] = useState<number | null>(null);

  // Business registration
  const [bizType, setBizType] = useState<'fictitious' | 'real'>('fictitious');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('FINANCE');
  const [bizSize, setBizSize] = useState('SOLO OPERATOR');
  const [bizEmail, setBizEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setFlavorIdx(i => (i + 1) % FLAVOR.length), 3200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws?name=_probe&class=corporate&x=0&y=0`);
    let done = false;
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'player_list' && !done) {
          done = true; setPlayers(m.players.length); ws.close();
        }
        if (m.type === 'server_full' && !done) {
          done = true; setPlayers(-1); ws.close();
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => ws.close();
    const timeout = setTimeout(() => { if (!done) ws.close(); }, 3000);
    return () => { clearTimeout(timeout); ws.close(); };
  }, []);

  const selected = CLASSES.find(c => c.id === cls)!;

  const handleProceed = () => {
    if (!name.trim()) return;
    setStep(2);
  };

  const handleEnterWorld = async () => {
    setSubmitting(true);
    const finalCompany = bizType === 'real' && company.trim()
      ? company.trim().toUpperCase()
      : name.trim().toUpperCase() + ' OPS';
    const char = {
      name: name.trim().toUpperCase(),
      class: cls,
      company: finalCompany,
      sx: cls === 'outcast' ? 460 : 560,
      sy: cls === 'outcast' ? 750 : 320,
      salary: cls === 'corporate' ? 500 : cls === 'replicant' ? 200 : 0,
    };
    localStorage.setItem('sm_char', JSON.stringify(char));
    // Register business (non-blocking — fire and forget, graceful fail)
    try {
      await fetch('/api/world/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          playerName: char.name,
          businessType: bizType,
          companyName: finalCompany,
          industry: bizType === 'real' ? industry : null,
          companySize: bizType === 'real' ? bizSize : null,
          contactEmail: bizType === 'real' && bizEmail.trim() ? bizEmail.trim() : null,
          isPaid: false,
        }),
      });
    } catch { /* ignore — game proceeds regardless */ }
    setSubmitting(false);
    navigate('/world/play');
  };

  const S: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
  const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#030803', ...S, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px)', pointerEvents: 'none', zIndex: 99 }} />
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,255,65,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,65,.025) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ position: 'relative', zIndex: 1, padding: '.4rem 1.5rem', borderBottom: '1px solid rgba(0,255,65,.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.14em' }}>PABLO CORP. / SALARYMAN OS v1.0</span>
        <span style={{ fontSize: '.5rem', color: players === -1 ? 'rgba(255,80,80,.6)' : 'rgba(0,255,65,.2)', letterSpacing: '.1em' }}>
          {players === -1 ? 'SERVER FULL — MAX 50' : players !== null ? `${players}/50 OPERATIVES ONLINE` : 'CONNECTING...'}
          {tick % 2 === 0 ? ' ▮' : ' ▯'}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', position: 'relative', zIndex: 1 }}>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ ...VT, fontSize: 'clamp(2.5rem, 7vw, 5rem)', color: '#00ff41', textShadow: '0 0 30px rgba(0,255,65,.4)', letterSpacing: '.18em', lineHeight: 1 }}>SALARYMAN</div>
          <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.2em', marginTop: '.4rem', ...VT }}>BY PICASSOO.AI — PABLO CORP. WORLD</div>
          <div style={{ marginTop: '.6rem', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,255,65,.3), transparent)' }} />
          <div style={{ marginTop: '.5rem', fontSize: '.6rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.1em', minHeight: '1.2em' }}>{FLAVOR[flavorIdx]}</div>
        </div>

        {/* ── STEP 1: Character select ── */}
        {step === 1 && (
          <div style={{ width: '100%', maxWidth: 820, display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em', marginBottom: '.2rem' }}>SELECT OPERATIVE CLASS</div>
              {CLASSES.map(c => (
                <button key={c.id} onClick={() => setCls(c.id)} style={{ padding: '.75rem .9rem', border: cls === c.id ? `1px solid ${c.color}` : '1px solid rgba(0,255,65,.15)', background: cls === c.id ? 'rgba(0,255,65,.07)' : 'rgba(0,255,65,.01)', color: cls === c.id ? c.color : 'rgba(0,255,65,.35)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'all .12s', ...S }}>
                  <div style={{ flexShrink: 0, width: 8, height: 8, background: cls === c.id ? c.color : 'rgba(0,255,65,.2)', boxShadow: cls === c.id ? `0 0 8px ${c.color}` : 'none' }} />
                  <div>
                    <div style={{ ...VT, fontSize: '1.1rem', letterSpacing: '.1em', lineHeight: 1 }}>{c.label}</div>
                    <div style={{ fontSize: '.55rem', color: cls === c.id ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)', marginTop: '.15rem', letterSpacing: '.06em' }}>{c.tagline}</div>
                  </div>
                </button>
              ))}
            </div>

            <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
              <div style={{ border: `1px solid ${selected.color}44`, background: 'rgba(0,255,65,.04)', padding: '1rem' }}>
                <div style={{ ...VT, fontSize: '1.4rem', color: selected.color, letterSpacing: '.12em', marginBottom: '.5rem' }}>{selected.label}</div>
                <div style={{ fontSize: '.62rem', color: 'rgba(0,255,65,.5)', lineHeight: 1.8, marginBottom: '.75rem' }}>{selected.desc}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.4rem' }}>
                  {[['START', selected.start], ['SALARY', selected.salary], ['HP', selected.hp]].map(([k, v]) => (
                    <div key={k} style={{ border: '1px solid rgba(0,255,65,.12)', padding: '.4rem .5rem' }}>
                      <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '.15rem' }}>{k}</div>
                      <div style={{ ...VT, fontSize: '.9rem', color: selected.color, letterSpacing: '.08em' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em', marginBottom: '.35rem' }}>OPERATIVE DESIGNATION</div>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleProceed()}
                  maxLength={18}
                  placeholder={`NAME YOUR ${selected.label}...`}
                  autoFocus
                  style={{ width: '100%', padding: '.65rem .8rem', background: 'rgba(0,8,0,.95)', border: `1px solid ${name ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)'}`, color: '#00ff41', ...S, fontSize: '1rem', letterSpacing: '.1em', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box' }}
                />
              </div>

              <button
                onClick={handleProceed}
                disabled={!name.trim()}
                style={{ width: '100%', padding: '.75rem', background: name.trim() ? 'rgba(0,255,65,.1)' : 'transparent', border: name.trim() ? '1px solid rgba(0,255,65,.7)' : '1px solid rgba(0,255,65,.1)', color: name.trim() ? '#00ff41' : 'rgba(0,255,65,.15)', ...VT, fontSize: '1.5rem', letterSpacing: '.2em', cursor: name.trim() ? 'pointer' : 'default', transition: 'all .15s' }}
              >
                NEXT — REGISTER ENTERPRISE {name.trim() ? (tick % 2 === 0 ? '▶' : '▷') : ''}
              </button>

              <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.18)', letterSpacing: '.08em', lineHeight: 1.8 }}>
                WASD — move &nbsp;·&nbsp; E — enter/talk &nbsp;·&nbsp; C — chat &nbsp;·&nbsp; V — voice &nbsp;·&nbsp; P — PABLO device
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Business registration ── */}
        {step === 2 && (
          <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
            <div style={{ border: '1px solid rgba(0,255,65,.2)', background: 'rgba(0,255,65,.03)', padding: '1rem' }}>
              <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em', marginBottom: '.6rem' }}>ENTERPRISE REGISTRATION — {name.trim().toUpperCase()}</div>
              <div style={{ fontSize: '.58rem', color: 'rgba(0,255,65,.4)', lineHeight: 1.9 }}>
                Every operative in PABLO City is affiliated with an enterprise. A fictitious front protects you. A real business lets you stake your claim and set up permanent offices across the city.
              </div>
            </div>

            {/* Business type */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
              {(['fictitious', 'real'] as const).map(t => (
                <button key={t} onClick={() => setBizType(t)} style={{ padding: '.9rem', border: bizType === t ? '1px solid rgba(0,255,65,.7)' : '1px solid rgba(0,255,65,.15)', background: bizType === t ? 'rgba(0,255,65,.07)' : 'transparent', color: bizType === t ? '#00ff41' : 'rgba(0,255,65,.35)', cursor: 'pointer', textAlign: 'left', ...S, transition: 'all .12s' }}>
                  <div style={{ ...VT, fontSize: '1.1rem', letterSpacing: '.1em', marginBottom: '.25rem' }}>
                    {t === 'fictitious' ? 'FICTITIOUS FRONT' : 'REAL ENTERPRISE'}
                  </div>
                  <div style={{ fontSize: '.52rem', color: bizType === t ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)', lineHeight: 1.7 }}>
                    {t === 'fictitious'
                      ? 'Anonymous. Low profile. No paper trail. Your data stays local.'
                      : 'Real company. Stake territory. Data stored on our servers for paid members. Your brand in-world.'}
                  </div>
                </button>
              ))}
            </div>

            {/* Real enterprise form */}
            {bizType === 'real' && (
              <div style={{ border: '1px solid rgba(0,255,65,.2)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em' }}>COMPANY PEDIGREE</div>

                <div>
                  <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>COMPANY NAME</div>
                  <input value={company} onChange={e => setCompany(e.target.value)} maxLength={60} placeholder="YOUR COMPANY NAME..." style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', ...S, fontSize: '.85rem', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
                  <div>
                    <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>INDUSTRY</div>
                    <select value={industry} onChange={e => setIndustry(e.target.value)} style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', ...S, fontSize: '.82rem', outline: 'none', cursor: 'pointer' }}>
                      {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>COMPANY SIZE</div>
                    <select value={bizSize} onChange={e => setBizSize(e.target.value)} style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', ...S, fontSize: '.82rem', outline: 'none', cursor: 'pointer' }}>
                      {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>CONTACT EMAIL <span style={{ color: 'rgba(0,255,65,.15)' }}>(OPTIONAL — STORED FOR PAID MEMBERS)</span></div>
                  <input value={bizEmail} onChange={e => setBizEmail(e.target.value)} type="email" maxLength={100} placeholder="contact@yourcompany.com" style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', ...S, fontSize: '.85rem', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box' }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '.6rem' }}>
              <button onClick={() => setStep(1)} style={{ padding: '.65rem 1.2rem', background: 'transparent', border: '1px solid rgba(0,255,65,.2)', color: 'rgba(0,255,65,.4)', ...VT, fontSize: '1rem', letterSpacing: '.1em', cursor: 'pointer' }}>← BACK</button>
              <button
                onClick={handleEnterWorld}
                disabled={submitting}
                style={{ flex: 1, padding: '.75rem', background: 'rgba(0,255,65,.1)', border: '1px solid rgba(0,255,65,.7)', color: '#00ff41', ...VT, fontSize: '1.5rem', letterSpacing: '.2em', cursor: 'pointer', textShadow: '0 0 12px rgba(0,255,65,.4)' }}
              >
                {submitting ? 'REGISTERING...' : `ENTER THE WORLD ${tick % 2 === 0 ? '▶' : '▷'}`}
              </button>
            </div>

            <div style={{ fontSize: '.46rem', color: 'rgba(0,255,65,.15)', lineHeight: 1.8 }}>
              Real business data is only stored persistently for paid PABLO subscribers. All other data is session-local. Server capacity: 50 operatives.
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: '.4rem 1.5rem', borderTop: '1px solid rgba(0,255,65,.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.15)', letterSpacing: '.1em' }}>CITY SECTOR · WASTELAND GANG TERRITORY · 9 LOCATIONS</span>
        <button onClick={() => navigate('/')} style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.2)', background: 'transparent', border: '1px solid rgba(0,255,65,.1)', padding: '2px 8px', cursor: 'pointer', letterSpacing: '.08em', ...S }}>← BACK TO APP</button>
      </div>
    </div>
  );
}
