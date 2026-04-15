import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { usePlan } from '../hooks/use-plan';
import { CITY_NAME } from '../gameSystems';
import { getDefaultBoomerMode } from '../hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface CargoItem {
  id: string;
  name: string;
  qty: number;
  illegal: boolean;
}

interface LoanData {
  amount: number;
  interest: number;
  dueAt?: number;
}

interface SaveData {
  hp?: number;
  maxHp?: number;
  hunger?: number;
  thirst?: number;
  energy?: number;
  savings?: number;
  goldBalance?: number;
  atk?: number;
  exp?: number;
  kills?: number;
  poisoned?: boolean;
  passport?: boolean;
  hasDevice?: boolean;
  deviceBroken?: boolean;
  deviceDurability?: number;
  hasBusiness?: boolean;
  companyName?: string;
  industry?: string;
  companySize?: string;
  cargo?: CargoItem[];
  ownedBuildings?: string[];
  loan?: LoanData;
}

interface CloudSave {
  id: number;
  slotIndex: number;
  charName: string;
  charClass: string;
  level: number;
  salary: number;
  lastZone: string;
  playtime: number;
  data: SaveData & { governmentBaseSalary?: number; createdAt?: string };
  createdAt?: string;
  lastSavedAt: string;
}

interface PabloMsg {
  role: 'user' | 'pablo';
  text: string;
}

function vtFont(boomer: boolean): React.CSSProperties {
  return boomer ? {} : { fontFamily: "'VT323',monospace" };
}
function stFont(boomer: boolean): React.CSSProperties {
  return boomer ? {} : { fontFamily: "'Share Tech Mono',monospace" };
}

function computeDecayedSalary(governmentBaseSalary: number, createdAt?: string): number {
  if (!createdAt || !governmentBaseSalary) return governmentBaseSalary;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const weeksElapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / WEEK_MS);
  if (weeksElapsed <= 0) return governmentBaseSalary;
  return Math.round(governmentBaseSalary * Math.pow(0.99, weeksElapsed));
}

const CLASS_COLOR: Record<string, string> = {
  corporate: '#38bdf8',
  outlaw: '#7dd3fc',
  replicant: '#33ffaa',
};

function fmtTime(iso: string): string {
  const d = new Date(iso), now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return 'JUST NOW';
  if (diff < 3600) return `${Math.floor(diff / 60)} MIN AGO`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} HR AGO`;
  return `${Math.floor(diff / 86400)} DAYS AGO`;
}

function fmtPlaytime(frames: number): string {
  const secs = Math.floor(frames / 60);
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}H ${m}M` : `${m}M`;
}

function StatBar({ label, value, max, color, boomer }: { label: string; value: number; max: number; color: string; boomer: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ marginBottom: '.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.2rem' }}>
        <span style={{ fontSize: '.65rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.1em', ...stFont(boomer) }}>{label}</span>
        <span style={{ ...vtFont(boomer), fontSize: '.85rem', color, letterSpacing: '.05em' }}>{Math.floor(value)}/{max}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(56,189,248,.08)', width: '100%' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct > 40 ? color : '#ff4444', transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function StatRow({ label, val, col, boomer }: { label: string; val: string | number; col?: string; boomer: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.35rem 0', borderBottom: '1px solid rgba(56,189,248,.06)' }}>
      <span style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.1em', ...stFont(boomer) }}>{label}</span>
      <span style={{ ...vtFont(boomer), fontSize: '.85rem', color: col ?? '#38bdf8', letterSpacing: '.05em' }}>{val}</span>
    </div>
  );
}

type TabId = 'chat' | 'stats' | 'overview';

export default function MobileTerminal() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { isTrial, trialDaysLeft } = usePlan();
  const [saves, setSaves] = useState<CloudSave[]>([]);
  const [activeSave, setActiveSave] = useState<CloudSave | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<TabId>('chat');
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const [pabloMsgs, setPabloMsgs] = useState<PabloMsg[]>([]);
  const [pabloIn, setPabloIn] = useState('');
  const [pabloLoad, setPabloLoad] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const r = await apiFetch('/api/salaryman/saves', { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          setSaves(d.saves ?? []);
          if (d.saves?.length > 0) {
            const sorted = [...d.saves].sort((a: CloudSave, b: CloudSave) => new Date(b.lastSavedAt).getTime() - new Date(a.lastSavedAt).getTime());
            setActiveSave(sorted[0]);
          }
        }
      } catch {
        setLoadError(true);
      }
      setLoading(false);
    })();
  }, [isAuthenticated]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pabloMsgs]);

  const sendPablo = useCallback(async () => {
    if (!pabloIn.trim() || pabloLoad || !activeSave) return;
    const txt = pabloIn.trim();
    setPabloIn('');
    setPabloMsgs(m => [...m, { role: 'user', text: txt }]);
    setPabloLoad(true);
    try {
      const sd = activeSave.data;
      const context = `SYSTEM: You are PABLO — the in-world AI field unit issued to all registered Salaryman operatives in Minx City. You speak in the terse, dry voice of a 1980s cyberpunk surveillance AI: sharp, a little ominous, occasionally darkly funny. You are the player's guide and tactical adviser.

WORLD LORE: Minx City is a post-apocalyptic neon metropolis controlled by SENIOR PABLO, a mysterious corporate overlord who lives on Floor 40+ of PABLO TOWER. The wasteland lies south of the city wall. Five gang factions control wasteland territory. Currency is FIAT (ƒ). Banking is handled by BANCO OMBRA.

DO NOT SPOIL: Do not reveal what is on Floor 40+. Do not reveal Senior Pablo's identity.

OPERATIVE STATUS:
- Name: ${activeSave.charName} | Class: ${activeSave.charClass.toUpperCase()} | Level: ${activeSave.level}
- FIAT: ƒ${computeDecayedSalary(sd.governmentBaseSalary ?? (activeSave.charClass === 'corporate' ? 25000 : activeSave.charClass === 'replicant' ? 18000 : activeSave.charClass === 'outlaw' ? 10000 : activeSave.salary), sd.createdAt ?? activeSave.createdAt).toLocaleString()}
- Zone: ${activeSave.lastZone}
- HP: ${sd.hp ?? '?'}/${sd.maxHp ?? '?'}
- Hunger: ${Math.floor(sd.hunger ?? 0)}% | Thirst: ${Math.floor(sd.thirst ?? 0)}% | Energy: ${Math.floor(sd.energy ?? 0)}%

The operative is accessing PABLO remotely via mobile terminal. Reply in 1–3 short lines. Be useful. Be lore-accurate. Stay in character.`;

      const r = await apiFetch('/api/advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: txt, context }),
        credentials: 'include',
      });
      const d = r.ok ? await r.json() : {};
      setPabloMsgs(m => [...m, { role: 'pablo', text: d.response ?? 'Signal lost. Try again.' }]);
    } catch {
      setPabloMsgs(m => [...m, { role: 'pablo', text: 'Network dead. Move to higher ground.' }]);
    }
    setPabloLoad(false);
  }, [pabloIn, pabloLoad, activeSave]);

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to access your mobile terminal.' : 'Operative credentials required. Terminal MX-75 remote access locked.'} />;
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#000800', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...stFont(boomerMode) }}>
        <div style={{ ...vtFont(boomerMode), fontSize: '1.5rem', color: '#38bdf8', letterSpacing: '.2em', animation: 'pulse 1.5s infinite' }}>CONNECTING...</div>
        <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.25)', marginTop: '.5rem', letterSpacing: '.1em' }}>TERMINAL HUB · MOBILE</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100dvh', background: '#000800', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', ...stFont(boomerMode) }}>
        <div style={{ ...vtFont(boomerMode), fontSize: '2rem', color: '#ff4444', letterSpacing: '.2em', marginBottom: '.5rem', textShadow: '0 0 20px rgba(255,68,68,.3)' }}>SIGNAL LOST</div>
        <div style={{ fontSize: '.65rem', color: 'rgba(255,68,68,.4)', letterSpacing: '.1em', marginBottom: '1.2rem', textAlign: 'center' }}>
          Failed to connect to PABLO CORP servers. Check your network connection and try again.
        </div>
        <button
          onClick={() => { setLoadError(false); setLoading(true); window.location.reload(); }}
          style={{ padding: '.6rem 1.5rem', background: 'rgba(255,68,68,.08)', border: '1px solid rgba(255,68,68,.5)', color: '#ff6666', ...vtFont(boomerMode), fontSize: '1.1rem', letterSpacing: '.15em', cursor: 'pointer' }}
        >
          RETRY
        </button>
      </div>
    );
  }

  if (!activeSave) {
    return (
      <div style={{ minHeight: '100dvh', background: '#000800', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', ...stFont(boomerMode) }}>
        <div style={{ ...vtFont(boomerMode), fontSize: '2rem', color: '#38bdf8', letterSpacing: '.2em', marginBottom: '.5rem', textShadow: '0 0 20px rgba(56,189,248,.3)' }}>NO SAVE DATA</div>
        <div style={{ fontSize: '.65rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.1em', marginBottom: '1.2rem', textAlign: 'center' }}>
          No operative record found. Start the game on desktop to create your character.
        </div>
        <button
          onClick={() => navigate('/bots/office')}
          style={{ padding: '.6rem 1.5rem', background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.5)', color: '#34d399', ...vtFont(boomerMode), fontSize: '1.1rem', letterSpacing: '.15em', cursor: 'pointer' }}
        >
          GO TO OFFICE
        </button>
      </div>
    );
  }

  const sd = activeSave.data;
  const charColor = CLASS_COLOR[activeSave.charClass] ?? '#38bdf8';
  const govBaseSalary = sd.governmentBaseSalary ??
    (activeSave.charClass === 'corporate' ? 25000 : activeSave.charClass === 'replicant' ? 18000 : activeSave.charClass === 'outlaw' ? 10000 : activeSave.salary);
  const signupTime = sd.createdAt ?? activeSave.createdAt;

  return (
    <div style={{ minHeight: '100dvh', background: '#000800', display: 'flex', flexDirection: 'column', ...stFont(boomerMode), WebkitTapHighlightColor: 'transparent' }}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input:focus { outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: rgba(56,189,248,.03); }
        ::-webkit-scrollbar-thumb { background: rgba(56,189,248,.15); }
      `}</style>


      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 480, width: '100%', margin: '0 auto' }}>
        <div style={{ padding: '.75rem 1rem', borderBottom: '1px solid rgba(56,189,248,.2)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ ...vtFont(boomerMode), fontSize: '1.3rem', color: '#38bdf8', letterSpacing: '.18em', textShadow: '0 0 12px rgba(56,189,248,.3)' }}>TERMINAL HUB</div>
              <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.12em', marginTop: '.1rem' }}>MOBILE ACCESS · ALPHA {__BUILD_VERSION__}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...vtFont(boomerMode), fontSize: '.75rem', color: '#38bdf8', letterSpacing: '.08em' }}>● ONLINE</div>
              <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.2)', letterSpacing: '.08em' }}>REMOTE LINK</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginTop: '.5rem', padding: '.4rem .55rem', border: '1px solid rgba(56,189,248,.12)', background: 'rgba(56,189,248,.03)' }}>
            <div style={{ width: 8, height: 8, background: charColor, boxShadow: `0 0 6px ${charColor}` }} />
            <div>
              <div style={{ ...vtFont(boomerMode), fontSize: '1rem', color: charColor, letterSpacing: '.1em' }}>{activeSave.charName}</div>
              <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em' }}>
                {activeSave.charClass.toUpperCase()} · LVL {activeSave.level} · {activeSave.lastZone}
              </div>
            </div>
            {saves.length > 1 && (
              <select
                onChange={e => {
                  const s = saves.find(s => s.slotIndex === parseInt(e.target.value));
                  if (s) { setActiveSave(s); setPabloMsgs([]); }
                }}
                value={activeSave.slotIndex}
                style={{ marginLeft: 'auto', background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.2)', color: '#38bdf8', ...stFont(boomerMode), fontSize: '.55rem', padding: '.15rem .3rem', cursor: 'pointer' }}
              >
                {saves.map(s => (
                  <option key={s.slotIndex} value={s.slotIndex} style={{ background: '#001a00', color: '#38bdf8' }}>
                    SLOT {s.slotIndex + 1}: {s.charName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid rgba(56,189,248,.12)', flexShrink: 0 }}>
          {([
            { id: 'chat' as TabId, label: '🤖 PABLO', boomerLabel: '🤖 AI CHAT', locked: false },
            { id: 'stats' as TabId, label: `📊 STATS`, boomerLabel: `📊 MY STATS`, locked: false },
            { id: 'overview' as TabId, label: `🏙 OVERVIEW`, boomerLabel: `🏙 OVERVIEW`, locked: false },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '.5rem .3rem', border: 'none', borderBottom: tab === t.id ? '2px solid #38bdf8' : '2px solid transparent',
                background: tab === t.id ? 'rgba(56,189,248,.06)' : 'transparent',
                color: tab === t.id ? '#38bdf8' : 'rgba(56,189,248,.3)', cursor: 'pointer',
                ...vtFont(boomerMode), fontSize: '.9rem', letterSpacing: '.1em',
              }}
            >
              {boomerMode ? t.boomerLabel : t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {tab === 'stats' && (
            <div style={{ padding: '1rem' }}>
              {isTrial && (
                <div style={{ border: '1px solid rgba(255,165,0,.35)', background: 'rgba(255,165,0,.06)', padding: '.3rem .5rem', fontSize: '.55rem', color: 'rgba(255,165,0,.7)', letterSpacing: '.08em', marginBottom: '.5rem' }}>
                  ⏳ TRIAL · {trialDaysLeft}d REMAINING
                </div>
              )}
              <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.6rem' }}>OPERATIVE STATUS REPORT</div>

              <StatBar boomer={boomerMode} label="HP" value={sd.hp ?? 100} max={sd.maxHp ?? 100} color="#38bdf8" />
              <StatBar boomer={boomerMode} label="HUNGER" value={sd.hunger ?? 100} max={100} color="#38bdf8" />
              <StatBar boomer={boomerMode} label="THIRST" value={sd.thirst ?? 100} max={100} color="#33aaff" />
              <StatBar boomer={boomerMode} label="ENERGY" value={sd.energy ?? 100} max={100} color="#ffcc00" />

              <div style={{ borderTop: '1px solid rgba(56,189,248,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>FINANCIAL STATUS</div>
                <StatRow boomer={boomerMode} label="FIAT (ƒ)" val={`ƒ${computeDecayedSalary(govBaseSalary, signupTime).toLocaleString()}`} col="#ffcc00" />
                <StatRow boomer={boomerMode} label="SAVINGS" val={`ƒ${(sd.savings ?? 0).toLocaleString()}`} col="#ffcc00" />
                {(sd.goldBalance ?? 0) > 0 && <StatRow boomer={boomerMode} label="GOLD" val={`${sd.goldBalance} oz`} col="#ffaa00" />}
              </div>

              <div style={{ borderTop: '1px solid rgba(56,189,248,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>COMBAT PROFILE</div>
                <StatRow boomer={boomerMode} label="LEVEL" val={activeSave.level} col={charColor} />
                <StatRow boomer={boomerMode} label="ATK" val={sd.atk ?? '?'} />
                <StatRow boomer={boomerMode} label="EXP" val={`${sd.exp ?? 0}`} />
                <StatRow boomer={boomerMode} label="KILLS" val={sd.kills ?? 0} col="#ff4444" />
                {sd.poisoned && <StatRow boomer={boomerMode} label="STATUS" val="POISONED" col="#ff4444" />}
              </div>

              <div style={{ borderTop: '1px solid rgba(56,189,248,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>LOCATION & TIME</div>
                <StatRow boomer={boomerMode} label="ZONE" val={activeSave.lastZone} col={activeSave.lastZone === CITY_NAME ? '#38bdf8' : '#7dd3fc'} />
                <StatRow boomer={boomerMode} label="PLAYTIME" val={fmtPlaytime(activeSave.playtime)} />
                <StatRow boomer={boomerMode} label="LAST SAVE" val={fmtTime(activeSave.lastSavedAt)} />
                {sd.passport && <StatRow boomer={boomerMode} label="PASSPORT" val="ACTIVE" col="#33ffaa" />}
              </div>

              <div style={{ borderTop: '1px solid rgba(56,189,248,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>EQUIPMENT</div>
                <StatRow boomer={boomerMode} label="DEVICE" val={sd.hasDevice ? (sd.deviceBroken ? 'DAMAGED' : 'ACTIVE') : 'NONE'} col={sd.hasDevice ? (sd.deviceBroken ? '#ff4444' : '#38bdf8') : '#ff4444'} />
                {sd.deviceDurability !== undefined && <StatRow boomer={boomerMode} label="DURABILITY" val={`${sd.deviceDurability}%`} />}
              </div>
            </div>
          )}

          {tab === 'chat' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {pabloMsgs.length === 0 && (
                  <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.22)', lineHeight: 1.8, padding: '.5rem 0' }}>
                    &gt; PABLO ONLINE — MOBILE LINK<br />
                    &gt; Remote terminal access active.<br />
                    &gt; Ask anything. I know Minx City.
                  </div>
                )}
                {pabloMsgs.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: '.7rem', lineHeight: 1.7,
                      color: m.role === 'user' ? 'rgba(56,189,248,.5)' : '#38bdf8',
                      paddingLeft: m.role === 'pablo' ? '.55rem' : 0,
                      borderLeft: m.role === 'pablo' ? '2px solid rgba(56,189,248,.25)' : 'none',
                      padding: m.role === 'pablo' ? '.4rem .55rem' : '.2rem 0',
                      background: m.role === 'pablo' ? 'rgba(56,189,248,.03)' : 'transparent',
                    }}
                  >
                    <span style={{ ...vtFont(boomerMode), fontSize: '.8rem', color: 'rgba(56,189,248,.3)', marginRight: '.3rem' }}>
                      {m.role === 'user' ? `[${activeSave.charName.slice(0, 10)}]` : '[PABLO]'}
                    </span>
                    {m.text}
                  </div>
                ))}
                {pabloLoad && (
                  <div style={{ ...vtFont(boomerMode), fontSize: '.95rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.1em', animation: 'pulse 1s infinite' }}>PABLO . . .</div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div style={{ borderTop: '1px solid rgba(56,189,248,.12)', padding: '.5rem .75rem', display: 'flex', gap: '.35rem', flexShrink: 0, background: 'rgba(0,5,0,.95)' }}>
                <input
                  value={pabloIn}
                  onChange={e => setPabloIn(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendPablo(); }}
                  placeholder="Ask PABLO anything..."
                  style={{ flex: 1, background: 'rgba(0,8,0,.95)', border: '1px solid rgba(56,189,248,.2)', color: '#38bdf8', ...stFont(boomerMode), fontSize: '.7rem', padding: '.45rem .6rem', caretColor: '#38bdf8' }}
                />
                <button
                  onClick={sendPablo}
                  disabled={pabloLoad}
                  style={{ background: 'rgba(56,189,248,.07)', border: '1px solid rgba(56,189,248,.3)', color: '#38bdf8', cursor: 'pointer', padding: '0 .75rem', ...vtFont(boomerMode), fontSize: '1.2rem' }}
                >
                  ↵
                </button>
              </div>
            </div>
          )}

          {tab === 'overview' && (
            <div style={{ padding: '1rem' }}>
              {isTrial && (
                <div style={{ border: '1px solid rgba(255,165,0,.35)', background: 'rgba(255,165,0,.06)', padding: '.3rem .5rem', fontSize: '.55rem', color: 'rgba(255,165,0,.7)', letterSpacing: '.08em', marginBottom: '.5rem' }}>
                  ⏳ TRIAL · {trialDaysLeft}d REMAINING
                </div>
              )}
              <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.6rem' }}>BUSINESS OVERVIEW</div>

              {sd.hasBusiness || sd.companyName ? (
                <>
                  <div style={{ border: '1px solid rgba(56,189,248,.2)', padding: '.75rem', marginBottom: '.6rem', background: 'rgba(56,189,248,.03)' }}>
                    <div style={{ ...vtFont(boomerMode), fontSize: '1.1rem', color: '#38bdf8', letterSpacing: '.1em', marginBottom: '.3rem' }}>
                      {sd.companyName ?? 'UNREGISTERED'}
                    </div>
                    {sd.industry && <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.08em' }}>{sd.industry}</div>}
                    {sd.companySize && <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.25)', marginTop: '.2rem' }}>{sd.companySize}</div>}
                  </div>

                  <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>FINANCIAL OVERVIEW</div>
                  <StatRow boomer={boomerMode} label="BALANCE" val={`ƒ${(activeSave.salary ?? 0).toLocaleString()}`} col="#ffcc00" />
                  <StatRow boomer={boomerMode} label="SAVINGS" val={`ƒ${(sd.savings ?? 0).toLocaleString()}`} col="#ffcc00" />
                  {sd.loan && (
                    <StatRow boomer={boomerMode} label="LOAN" val={`ƒ${(sd.loan.amount ?? 0).toLocaleString()} + ƒ${(sd.loan.interest ?? 0).toLocaleString()} INT`} col="#ff4444" />
                  )}

                  {sd.cargo && Array.isArray(sd.cargo) && sd.cargo.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(56,189,248,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                      <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>CARGO HOLD</div>
                      {sd.cargo.map((c, i) => (
                        <StatRow key={i} boomer={boomerMode} label={c.name ?? c.id} val={`${c.qty ?? 1}x`} col={c.illegal ? '#ff4444' : '#38bdf8'} />
                      ))}
                    </div>
                  )}

                  {sd.ownedBuildings && Array.isArray(sd.ownedBuildings) && sd.ownedBuildings.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(56,189,248,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                      <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>OWNED PROPERTIES</div>
                      {sd.ownedBuildings.map((b: string, i: number) => (
                        <div key={i} style={{ fontSize: '.65rem', color: 'rgba(56,189,248,.5)', lineHeight: 1.8, ...stFont(boomerMode) }}>▸ {b.toUpperCase()}</div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ border: '1px solid rgba(56,189,248,.1)', padding: '1rem', textAlign: 'center' }}>
                  <div style={{ ...vtFont(boomerMode), fontSize: '1rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.1em', marginBottom: '.5rem' }}>NO BUSINESS REGISTERED</div>
                  <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.2)', lineHeight: 1.8 }}>
                    Register a business in Minx City to access business management features. Visit the game on desktop to get started.
                  </div>
                </div>
              )}

              <div style={{ borderTop: '1px solid rgba(56,189,248,.1)', marginTop: '.8rem', paddingTop: '.6rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>NETWORK STATUS</div>
                <StatRow boomer={boomerMode} label="SERVER" val={`${CITY_NAME} · PST`} col="#38bdf8" />
                <StatRow boomer={boomerMode} label="FACTION" val="PABLO CORP" col="#b400ff" />
                <StatRow boomer={boomerMode} label="ECONOMY" val="ƒ FIAT STANDARD" col="#ffcc00" />
              </div>

              <div style={{ borderTop: '1px solid rgba(56,189,248,.1)', marginTop: '.8rem', paddingTop: '.6rem' }}>
                <div style={{ border: '1px solid rgba(0,180,255,.15)', padding: '.6rem', background: 'rgba(0,180,255,.03)' }}>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,180,255,.5)', lineHeight: 1.8, ...stFont(boomerMode) }}>
                    Trading, building purchases, and cargo runs require physical terminal access in Minx City. Use the PABLO tab to get business advice remotely.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '.5rem 1rem', borderTop: '1px solid rgba(56,189,248,.1)', flexShrink: 0, background: 'rgba(0,5,0,.95)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.12)', letterSpacing: '.07em' }}>
              {`TERMINAL HUB ALPHA ${__BUILD_VERSION__} · MOBILE · ALL TRANSMISSIONS LOGGED`}
            </div>
            <button
              onClick={() => navigate('/')}
              style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.3)', background: 'transparent', border: '1px solid rgba(56,189,248,.15)', padding: '.2rem .5rem', cursor: 'pointer', ...stFont(boomerMode) }}
            >
              HOME
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
