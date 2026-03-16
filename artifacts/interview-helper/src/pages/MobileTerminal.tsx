import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { usePlan } from '../hooks/use-plan';

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
  data: SaveData;
  lastSavedAt: string;
}

interface PabloMsg {
  role: 'user' | 'pablo';
  text: string;
}

const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };
const ST: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };

const CLASS_COLOR: Record<string, string> = {
  corporate: '#00ff41',
  outlaw: '#88ff44',
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

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ marginBottom: '.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.2rem' }}>
        <span style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.1em', ...ST }}>{label}</span>
        <span style={{ ...VT, fontSize: '.85rem', color, letterSpacing: '.05em' }}>{Math.floor(value)}/{max}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(0,255,65,.08)', width: '100%' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct > 40 ? color : '#ff4444', transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function StatRow({ label, val, col }: { label: string; val: string | number; col?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.35rem 0', borderBottom: '1px solid rgba(0,255,65,.06)' }}>
      <span style={{ fontSize: '.6rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.1em', ...ST }}>{label}</span>
      <span style={{ ...VT, fontSize: '.85rem', color: col ?? '#00ff41', letterSpacing: '.05em' }}>{val}</span>
    </div>
  );
}

type TabId = 'chat' | 'stats' | 'overview';

export default function MobileTerminal() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { isPro, isTrial, trialDaysLeft } = usePlan();
  const [saves, setSaves] = useState<CloudSave[]>([]);
  const [activeSave, setActiveSave] = useState<CloudSave | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<TabId>('chat');

  const [pabloMsgs, setPabloMsgs] = useState<PabloMsg[]>([]);
  const [pabloIn, setPabloIn] = useState('');
  const [pabloLoad, setPabloLoad] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const r = await fetch('/api/salaryman/saves', { credentials: 'include' });
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
- FIAT: ƒ${activeSave.salary.toLocaleString()}
- Zone: ${activeSave.lastZone}
- HP: ${sd.hp ?? '?'}/${sd.maxHp ?? '?'}
- Hunger: ${Math.floor(sd.hunger ?? 0)}% | Thirst: ${Math.floor(sd.thirst ?? 0)}% | Energy: ${Math.floor(sd.energy ?? 0)}%

The operative is accessing PABLO remotely via mobile terminal. Reply in 1–3 short lines. Be useful. Be lore-accurate. Stay in character.`;

      const r = await fetch('/api/advisor/chat', {
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
    return (
      <div style={{ minHeight: '100dvh', background: '#000800', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', ...ST }}>
        <div style={{ ...VT, fontSize: '2rem', color: '#00ff41', letterSpacing: '.2em', marginBottom: '.5rem', textShadow: '0 0 20px rgba(0,255,65,.3)' }}>TERMINAL</div>
        <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.1em', marginBottom: '1.5rem' }}>MOBILE ACCESS POINT</div>
        <div style={{ fontSize: '.7rem', color: 'rgba(0,255,65,.5)', lineHeight: 1.8, textAlign: 'center', maxWidth: 300 }}>
          Authentication required. Sign in to access your operative's terminal remotely.
        </div>
        <button
          onClick={() => navigate('/profile')}
          style={{ marginTop: '1.2rem', padding: '.6rem 1.5rem', background: 'rgba(0,255,65,.08)', border: '1px solid rgba(0,255,65,.5)', color: '#00ff41', ...VT, fontSize: '1.1rem', letterSpacing: '.15em', cursor: 'pointer' }}
        >
          SIGN IN
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#000800', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...ST }}>
        <div style={{ ...VT, fontSize: '1.5rem', color: '#00ff41', letterSpacing: '.2em', animation: 'pulse 1.5s infinite' }}>CONNECTING...</div>
        <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.25)', marginTop: '.5rem', letterSpacing: '.1em' }}>TERMINAL HUB · MOBILE</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100dvh', background: '#000800', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', ...ST }}>
        <div style={{ ...VT, fontSize: '2rem', color: '#ff4444', letterSpacing: '.2em', marginBottom: '.5rem', textShadow: '0 0 20px rgba(255,68,68,.3)' }}>SIGNAL LOST</div>
        <div style={{ fontSize: '.65rem', color: 'rgba(255,68,68,.4)', letterSpacing: '.1em', marginBottom: '1.2rem', textAlign: 'center' }}>
          Failed to connect to PABLO CORP servers. Check your network connection and try again.
        </div>
        <button
          onClick={() => { setLoadError(false); setLoading(true); window.location.reload(); }}
          style={{ padding: '.6rem 1.5rem', background: 'rgba(255,68,68,.08)', border: '1px solid rgba(255,68,68,.5)', color: '#ff6666', ...VT, fontSize: '1.1rem', letterSpacing: '.15em', cursor: 'pointer' }}
        >
          RETRY
        </button>
      </div>
    );
  }

  if (!activeSave) {
    return (
      <div style={{ minHeight: '100dvh', background: '#000800', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', ...ST }}>
        <div style={{ ...VT, fontSize: '2rem', color: '#00ff41', letterSpacing: '.2em', marginBottom: '.5rem', textShadow: '0 0 20px rgba(0,255,65,.3)' }}>NO SAVE DATA</div>
        <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.1em', marginBottom: '1.2rem', textAlign: 'center' }}>
          No operative record found. Start the game on desktop to create your character.
        </div>
        <button
          onClick={() => navigate('/world')}
          style={{ padding: '.6rem 1.5rem', background: 'rgba(0,255,65,.08)', border: '1px solid rgba(0,255,65,.5)', color: '#00ff41', ...VT, fontSize: '1.1rem', letterSpacing: '.15em', cursor: 'pointer' }}
        >
          GO TO GAME
        </button>
      </div>
    );
  }

  const sd = activeSave.data;
  const charColor = CLASS_COLOR[activeSave.charClass] ?? '#00ff41';

  return (
    <div style={{ minHeight: '100dvh', background: '#000800', display: 'flex', flexDirection: 'column', ...ST, WebkitTapHighlightColor: 'transparent' }}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
        @keyframes scanline { 0% { transform:translateY(-100%) } 100% { transform:translateY(100vh) } }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input:focus { outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: rgba(0,255,65,.03); }
        ::-webkit-scrollbar-thumb { background: rgba(0,255,65,.15); }
      `}</style>

      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,.015) 2px, rgba(0,255,65,.015) 4px)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 480, width: '100%', margin: '0 auto' }}>
        <div style={{ padding: '.75rem 1rem', borderBottom: '1px solid rgba(0,255,65,.2)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ ...VT, fontSize: '1.3rem', color: '#00ff41', letterSpacing: '.18em', textShadow: '0 0 12px rgba(0,255,65,.3)' }}>TERMINAL HUB</div>
              <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginTop: '.1rem' }}>MOBILE ACCESS · v2.0</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...VT, fontSize: '.75rem', color: '#00ff41', letterSpacing: '.08em' }}>● ONLINE</div>
              <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.08em' }}>REMOTE LINK</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginTop: '.5rem', padding: '.4rem .55rem', border: '1px solid rgba(0,255,65,.12)', background: 'rgba(0,255,65,.03)' }}>
            <div style={{ width: 8, height: 8, background: charColor, boxShadow: `0 0 6px ${charColor}` }} />
            <div>
              <div style={{ ...VT, fontSize: '1rem', color: charColor, letterSpacing: '.1em' }}>{activeSave.charName}</div>
              <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.1em' }}>
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
                style={{ marginLeft: 'auto', background: 'rgba(0,255,65,.06)', border: '1px solid rgba(0,255,65,.2)', color: '#00ff41', ...ST, fontSize: '.55rem', padding: '.15rem .3rem', cursor: 'pointer' }}
              >
                {saves.map(s => (
                  <option key={s.slotIndex} value={s.slotIndex} style={{ background: '#001a00', color: '#00ff41' }}>
                    SLOT {s.slotIndex + 1}: {s.charName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,255,65,.12)', flexShrink: 0 }}>
          {([
            { id: 'chat' as TabId, label: '🤖 PABLO AI', locked: false },
            { id: 'stats' as TabId, label: `📊 STATS ${!isPro ? '🔒' : ''}`, locked: false },
            { id: 'overview' as TabId, label: `🏙 OVERVIEW ${!isPro ? '🔒' : ''}`, locked: false },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '.5rem .3rem', border: 'none', borderBottom: tab === t.id ? '2px solid #00ff41' : '2px solid transparent',
                background: tab === t.id ? 'rgba(0,255,65,.06)' : 'transparent',
                color: tab === t.id ? '#00ff41' : 'rgba(0,255,65,.3)', cursor: 'pointer',
                ...VT, fontSize: '.9rem', letterSpacing: '.1em',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {tab === 'stats' && !isPro && (
            <div style={{ padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '.8rem' }}>
              <div style={{ fontSize: '2rem' }}>🔒</div>
              <div style={{ ...VT, fontSize: '1.2rem', color: '#ffcc44', letterSpacing: '.12em' }}>SUBSCRIPTION REQUIRED</div>
              <div style={{ fontSize: '.7rem', color: 'rgba(0,255,65,.45)', textAlign: 'center', lineHeight: 1.8, maxWidth: 280 }}>
                Stats and management features require a Terminal subscription. Start your 7-day free trial to unlock everything.
              </div>
              <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.25)', marginTop: '.3rem' }}>PABLO AI chat remains free — forever.</div>
            </div>
          )}
          {tab === 'stats' && isPro && (
            <div style={{ padding: '1rem' }}>
              {isTrial && (
                <div style={{ border: '1px solid rgba(255,165,0,.35)', background: 'rgba(255,165,0,.06)', padding: '.3rem .5rem', fontSize: '.55rem', color: 'rgba(255,165,0,.7)', letterSpacing: '.08em', marginBottom: '.5rem' }}>
                  ⏳ TRIAL · {trialDaysLeft}d REMAINING
                </div>
              )}
              <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.6rem' }}>OPERATIVE STATUS REPORT</div>

              <StatBar label="HP" value={sd.hp ?? 100} max={sd.maxHp ?? 100} color="#00ff41" />
              <StatBar label="HUNGER" value={sd.hunger ?? 100} max={100} color="#00ff41" />
              <StatBar label="THIRST" value={sd.thirst ?? 100} max={100} color="#33aaff" />
              <StatBar label="ENERGY" value={sd.energy ?? 100} max={100} color="#ffcc00" />

              <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>FINANCIAL STATUS</div>
                <StatRow label="FIAT (ƒ)" val={`ƒ${(activeSave.salary ?? 0).toLocaleString()}`} col="#ffcc00" />
                <StatRow label="SAVINGS" val={`ƒ${(sd.savings ?? 0).toLocaleString()}`} col="#ffcc00" />
                {(sd.goldBalance ?? 0) > 0 && <StatRow label="GOLD" val={`${sd.goldBalance} oz`} col="#ffaa00" />}
              </div>

              <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>COMBAT PROFILE</div>
                <StatRow label="LEVEL" val={activeSave.level} col={charColor} />
                <StatRow label="ATK" val={sd.atk ?? '?'} />
                <StatRow label="EXP" val={`${sd.exp ?? 0}`} />
                <StatRow label="KILLS" val={sd.kills ?? 0} col="#ff4444" />
                {sd.poisoned && <StatRow label="STATUS" val="POISONED" col="#ff4444" />}
              </div>

              <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>LOCATION & TIME</div>
                <StatRow label="ZONE" val={activeSave.lastZone} col={activeSave.lastZone === 'MINX CITY' ? '#00ff41' : '#88ff44'} />
                <StatRow label="PLAYTIME" val={fmtPlaytime(activeSave.playtime)} />
                <StatRow label="LAST SAVE" val={fmtTime(activeSave.lastSavedAt)} />
                {sd.passport && <StatRow label="PASSPORT" val="ACTIVE" col="#33ffaa" />}
              </div>

              <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>EQUIPMENT</div>
                <StatRow label="DEVICE" val={sd.hasDevice ? (sd.deviceBroken ? 'DAMAGED' : 'ACTIVE') : 'NONE'} col={sd.hasDevice ? (sd.deviceBroken ? '#ff4444' : '#00ff41') : '#ff4444'} />
                {sd.deviceDurability !== undefined && <StatRow label="DURABILITY" val={`${sd.deviceDurability}%`} />}
              </div>
            </div>
          )}

          {tab === 'chat' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {pabloMsgs.length === 0 && (
                  <div style={{ fontSize: '.6rem', color: 'rgba(0,255,65,.22)', lineHeight: 1.8, padding: '.5rem 0' }}>
                    &gt; PABLO AI ONLINE — MOBILE LINK<br />
                    &gt; Remote terminal access active.<br />
                    &gt; Ask anything. I know Minx City.
                  </div>
                )}
                {pabloMsgs.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: '.7rem', lineHeight: 1.7,
                      color: m.role === 'user' ? 'rgba(0,255,65,.5)' : '#00ff41',
                      paddingLeft: m.role === 'pablo' ? '.55rem' : 0,
                      borderLeft: m.role === 'pablo' ? '2px solid rgba(0,255,65,.25)' : 'none',
                      padding: m.role === 'pablo' ? '.4rem .55rem' : '.2rem 0',
                      background: m.role === 'pablo' ? 'rgba(0,255,65,.03)' : 'transparent',
                    }}
                  >
                    <span style={{ ...VT, fontSize: '.8rem', color: 'rgba(0,255,65,.3)', marginRight: '.3rem' }}>
                      {m.role === 'user' ? `[${activeSave.charName.slice(0, 10)}]` : '[PABLO]'}
                    </span>
                    {m.text}
                  </div>
                ))}
                {pabloLoad && (
                  <div style={{ ...VT, fontSize: '.95rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.1em', animation: 'pulse 1s infinite' }}>PABLO . . .</div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div style={{ borderTop: '1px solid rgba(0,255,65,.12)', padding: '.5rem .75rem', display: 'flex', gap: '.35rem', flexShrink: 0, background: 'rgba(0,5,0,.95)' }}>
                <input
                  value={pabloIn}
                  onChange={e => setPabloIn(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendPablo(); }}
                  placeholder="Ask PABLO anything..."
                  style={{ flex: 1, background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.2)', color: '#00ff41', ...ST, fontSize: '.7rem', padding: '.45rem .6rem', caretColor: '#00ff41' }}
                />
                <button
                  onClick={sendPablo}
                  disabled={pabloLoad}
                  style={{ background: 'rgba(0,255,65,.07)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', cursor: 'pointer', padding: '0 .75rem', ...VT, fontSize: '1.2rem' }}
                >
                  ↵
                </button>
              </div>
            </div>
          )}

          {tab === 'overview' && !isPro && (
            <div style={{ padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '.8rem' }}>
              <div style={{ fontSize: '2rem' }}>🔒</div>
              <div style={{ ...VT, fontSize: '1.2rem', color: '#ffcc44', letterSpacing: '.12em' }}>SUBSCRIPTION REQUIRED</div>
              <div style={{ fontSize: '.7rem', color: 'rgba(0,255,65,.45)', textAlign: 'center', lineHeight: 1.8, maxWidth: 280 }}>
                Business overview and management features require a Terminal subscription. Start your 7-day free trial to unlock everything.
              </div>
              <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.25)', marginTop: '.3rem' }}>PABLO AI chat remains free — forever.</div>
            </div>
          )}
          {tab === 'overview' && isPro && (
            <div style={{ padding: '1rem' }}>
              {isTrial && (
                <div style={{ border: '1px solid rgba(255,165,0,.35)', background: 'rgba(255,165,0,.06)', padding: '.3rem .5rem', fontSize: '.55rem', color: 'rgba(255,165,0,.7)', letterSpacing: '.08em', marginBottom: '.5rem' }}>
                  ⏳ TRIAL · {trialDaysLeft}d REMAINING
                </div>
              )}
              <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.6rem' }}>BUSINESS OVERVIEW</div>

              {sd.hasBusiness || sd.companyName ? (
                <>
                  <div style={{ border: '1px solid rgba(0,255,65,.2)', padding: '.75rem', marginBottom: '.6rem', background: 'rgba(0,255,65,.03)' }}>
                    <div style={{ ...VT, fontSize: '1.1rem', color: '#00ff41', letterSpacing: '.1em', marginBottom: '.3rem' }}>
                      {sd.companyName ?? 'UNREGISTERED'}
                    </div>
                    {sd.industry && <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.08em' }}>{sd.industry}</div>}
                    {sd.companySize && <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', marginTop: '.2rem' }}>{sd.companySize}</div>}
                  </div>

                  <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>FINANCIAL OVERVIEW</div>
                  <StatRow label="BALANCE" val={`ƒ${(activeSave.salary ?? 0).toLocaleString()}`} col="#ffcc00" />
                  <StatRow label="SAVINGS" val={`ƒ${(sd.savings ?? 0).toLocaleString()}`} col="#ffcc00" />
                  {sd.loan && (
                    <StatRow label="LOAN" val={`ƒ${(sd.loan.amount ?? 0).toLocaleString()} + ƒ${(sd.loan.interest ?? 0).toLocaleString()} INT`} col="#ff4444" />
                  )}

                  {sd.cargo && Array.isArray(sd.cargo) && sd.cargo.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                      <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>CARGO HOLD</div>
                      {sd.cargo.map((c, i) => (
                        <StatRow key={i} label={c.name ?? c.id} val={`${c.qty ?? 1}x`} col={c.illegal ? '#ff4444' : '#00ff41'} />
                      ))}
                    </div>
                  )}

                  {sd.ownedBuildings && Array.isArray(sd.ownedBuildings) && sd.ownedBuildings.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                      <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>OWNED PROPERTIES</div>
                      {sd.ownedBuildings.map((b: string, i: number) => (
                        <div key={i} style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.5)', lineHeight: 1.8, ...ST }}>▸ {b.toUpperCase()}</div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ border: '1px solid rgba(0,255,65,.1)', padding: '1rem', textAlign: 'center' }}>
                  <div style={{ ...VT, fontSize: '1rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.1em', marginBottom: '.5rem' }}>NO BUSINESS REGISTERED</div>
                  <div style={{ fontSize: '.6rem', color: 'rgba(0,255,65,.2)', lineHeight: 1.8 }}>
                    Register a business in Minx City to access business management features. Visit the game on desktop to get started.
                  </div>
                </div>
              )}

              <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', marginTop: '.8rem', paddingTop: '.6rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>NETWORK STATUS</div>
                <StatRow label="SERVER" val="MINX CITY · PST" col="#00ff41" />
                <StatRow label="FACTION" val="SUITS" col="#b400ff" />
                <StatRow label="ECONOMY" val="ƒ FIAT STANDARD" col="#ffcc00" />
              </div>

              <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', marginTop: '.8rem', paddingTop: '.6rem' }}>
                <div style={{ border: '1px solid rgba(0,180,255,.15)', padding: '.6rem', background: 'rgba(0,180,255,.03)' }}>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,180,255,.5)', lineHeight: 1.8, ...ST }}>
                    Trading, building purchases, and cargo runs require physical terminal access in Minx City. Use the PABLO AI tab to get business advice remotely.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '.5rem 1rem', borderTop: '1px solid rgba(0,255,65,.1)', flexShrink: 0, background: 'rgba(0,5,0,.95)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.12)', letterSpacing: '.07em' }}>
              TERMINAL HUB v2.0 · MOBILE · ALL TRANSMISSIONS LOGGED
            </div>
            <button
              onClick={() => navigate('/world')}
              style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', background: 'transparent', border: '1px solid rgba(0,255,65,.15)', padding: '.2rem .5rem', cursor: 'pointer', ...ST }}
            >
              DESKTOP
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
