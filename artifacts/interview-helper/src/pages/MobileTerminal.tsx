import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { usePlan } from '../hooks/use-plan';
import { getActiveCityName, hydrateActiveCityFromSave } from '@/lib/city-defs';
import { getDefaultBoomerMode } from '../hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';
import { getSalarymanGender, salarymanTerm } from '../lib/tutorial-progress';
import GameSettings from './Game/Settings';
import { TowerLifeHub } from '@/components/TowerLifeHub';
import { useAuth } from '@/hooks/use-auth';
import { useAlpha } from '@/hooks/use-alpha';

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

interface WalletSnapshot {
  faction: { totalSalary: number };
  property: { netWorth: number };
  bank: {
    accounts: { id: string; kind: string; label: string; balance: number; currency: string }[];
    earnedFiat: number;
  };
  debt: number;
  creditScore: number;
  pabloTax: { owedCents: number };
  pendingInvoices: { id: number; source: string; amountCents: number; createdAt: string }[];
  rates: { fiatPerUsd: number };
}

function vtFont(boomer: boolean): React.CSSProperties {
  return boomer ? {} : { fontFamily: "var(--font-sans)" };
}
function stFont(boomer: boolean): React.CSSProperties {
  return boomer ? {} : { fontFamily: "var(--font-sans)" };
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

function LiveFinances({ snapshot, error, boomer, onNavigate }: {
  snapshot: WalletSnapshot | null;
  error: string | null;
  boomer: boolean;
  onNavigate: (path: string) => void;
}) {
  const f = (value: number) => `ƒ${Math.round(value).toLocaleString()}`;
  if (!snapshot) {
    return (
      <div style={{ padding: '1rem' }}>
        <div style={{ borderRadius: 12, border: '1px solid #1e3a4a', background: '#0d141c', padding: '1rem', color: error ? '#fb7185' : '#94a3b8', fontSize: '.75rem', lineHeight: 1.6 }}>
          {error ?? 'Loading your live financial snapshot…'}
        </div>
      </div>
    );
  }

  const { bank, property, faction, debt, creditScore, pabloTax, pendingInvoices, rates } = snapshot;
  const fiatAccounts = bank.accounts.filter(account => account.currency === 'FIAT');
  const sumAccounts = (pattern: RegExp) => fiatAccounts
    .filter(account => pattern.test(`${account.kind} ${account.label}`))
    .reduce((sum, account) => sum + account.balance, 0);
  const checking = sumAccounts(/checking|current/i);
  const savings = sumAccounts(/saving/i);
  const toFiat = (cents: number) => Math.round((cents / 100) * rates.fiatPerUsd);
  const netWorth = property.netWorth;
  const income = faction.totalSalary * rates.fiatPerUsd;
  const invoiceTotal = pendingInvoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const cards: { label: string; value: string; tone?: string; detail?: string }[] = [
    { label: 'SPENDABLE FIAT', value: f(bank.earnedFiat), tone: '#38bdf8', detail: 'Available now' },
    { label: 'CHECKING', value: checking ? f(checking) : '—', detail: checking ? 'Linked checking' : 'No checking account' },
    { label: 'SAVINGS', value: savings ? f(savings) : '—', tone: '#a78bfa', detail: savings ? 'Linked savings' : 'No savings account' },
    { label: 'NET WORTH', value: f(netWorth), tone: '#c4b5fd', detail: 'Assets and property' },
    { label: 'DEBT', value: debt > 0 ? f(debt) : '—', tone: debt > 0 ? '#fb7185' : '#94a3b8', detail: debt > 0 ? 'Outstanding balance' : 'No debt reported' },
    { label: 'SALARY / INCOME', value: f(income), tone: '#34d399', detail: 'Current total salary' },
    { label: 'TAX DUE', value: pabloTax.owedCents > 0 ? f(toFiat(pabloTax.owedCents)) : '—', tone: pabloTax.owedCents > 0 ? '#fbbf24' : '#94a3b8', detail: 'PABLO tax owed now' },
    { label: 'CREDIT SCORE', value: String(creditScore), tone: creditScore < 600 ? '#fb7185' : '#38bdf8', detail: creditScore < 600 ? 'Needs attention' : 'In good standing' },
  ];
  return (
    <div style={{ padding: '1rem', background: '#090d12', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.75rem', marginBottom: '1rem' }}>
        <div>
          <div style={{ color: '#e2e8f0', fontSize: '1rem', fontWeight: 700, letterSpacing: '.04em', ...stFont(boomer) }}>LIVE FINANCES</div>
          <div style={{ color: '#64748b', fontSize: '.62rem', marginTop: '.25rem' }}>AUTHORITATIVE ACCOUNT SNAPSHOT · REFRESHES EVERY 30S</div>
        </div>
        <span style={{ flexShrink: 0, color: '#34d399', fontSize: '.62rem', fontWeight: 700 }}>● LIVE</span>
      </div>
      {error && <div style={{ marginBottom: '.75rem', color: '#fbbf24', fontSize: '.65rem' }}>Last refresh failed: {error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '.6rem' }}>
        {cards.map(card => (
          <div key={card.label} style={{ borderRadius: 10, border: '1px solid #1e293b', background: '#111827', padding: '.75rem' }}>
            <div style={{ color: '#94a3b8', fontSize: '.53rem', fontWeight: 700, letterSpacing: '.08em' }}>{card.label}</div>
            <div style={{ color: card.tone ?? '#e2e8f0', fontSize: '1.05rem', fontWeight: 700, marginTop: '.35rem', overflowWrap: 'anywhere' }}>{card.value}</div>
            <div style={{ color: '#64748b', fontSize: '.55rem', marginTop: '.25rem' }}>{card.detail}</div>
          </div>
        ))}
      </div>
      {pendingInvoices.length > 0 && (
        <div style={{ marginTop: '.85rem', borderRadius: 10, border: '1px solid rgba(251,113,133,.35)', background: 'rgba(127,29,29,.18)', padding: '.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', color: '#fda4af', fontSize: '.65rem', fontWeight: 700 }}>
            <span>PENDING USD BILLS / INVOICES ({pendingInvoices.length})</span>
            <span>{f(toFiat(invoiceTotal))}</span>
          </div>
          {pendingInvoices.slice(0, 3).map(invoice => (
            <div key={invoice.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', marginTop: '.5rem', color: '#cbd5e1', fontSize: '.65rem' }}>
              <span>{invoice.source.toUpperCase()}</span><span>{f(toFiat(invoice.amountCents))}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.55rem', marginTop: '1rem' }}>
        <button onClick={() => onNavigate('/game/bank')} style={financeButtonStyle}>OPEN BANCO OMBRA</button>
        <button onClick={() => onNavigate('/wallet')} style={{ ...financeButtonStyle, color: '#c4b5fd', borderColor: 'rgba(196,181,253,.45)' }}>VIEW NET WORTH</button>
      </div>
    </div>
  );
}

const financeButtonStyle: React.CSSProperties = {
  borderRadius: 8, border: '1px solid rgba(56,189,248,.45)', background: '#111827', color: '#67e8f9',
  padding: '.6rem .7rem', cursor: 'pointer', fontSize: '.62rem', fontWeight: 700, letterSpacing: '.05em',
};

type TabId = 'chat' | 'stats' | 'finances' | 'overview' | 'settings' | 'tower';

export default function MobileTerminal({ physicalTerminal = false }: { physicalTerminal?: boolean }) {
  // Reflect the realm stored on the save even when this terminal is opened
  // without first loading WorldPlay (which is what sets the active city).
  hydrateActiveCityFromSave();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const alpha = useAlpha();
  const canUseMobileTerminal = physicalTerminal || alpha.isAdmin || alpha.isApprovedDev || alpha.isApprovedTester;
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
  const [walletSnapshot, setWalletSnapshot] = useState<WalletSnapshot | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let mounted = true;
    const loadWallet = async () => {
      try {
        const response = await apiFetch('/api/wallet/snapshot', { credentials: 'include' });
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in required.' : `Finance service unavailable (${response.status}).`);
        const snapshot: WalletSnapshot = await response.json();
        if (mounted) {
          setWalletSnapshot(snapshot);
          setWalletError(null);
        }
      } catch (error) {
        if (mounted) setWalletError(error instanceof Error ? error.message : 'Finance service unavailable.');
      }
    };
    void loadWallet();
    const interval = window.setInterval(loadWallet, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || alpha.loading || !canUseMobileTerminal) return;
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
  }, [isAuthenticated, alpha.loading, canUseMobileTerminal]);

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
      const playerGender = getSalarymanGender();
      const playerTermUpper = salarymanTerm(playerGender, 'upper');
      const playerTermLower = salarymanTerm(playerGender);
      const context = `SYSTEM: You are PABLO — the in-world AI field unit issued to all registered salarymen in Minx City. You are the player's guide and tactical adviser.

WORLD LORE: Minx City is a post-apocalyptic neon metropolis controlled by SENIOR PABLO, a mysterious corporate overlord who lives on Floor 40+ of PABLO TOWER. The wasteland lies south of the city wall. Five gang factions control wasteland territory. Currency is FIAT (ƒ). Banking is handled by BANCO OMBRA.

DO NOT SPOIL: Do not reveal what is on Floor 40+. Do not reveal Senior Pablo's identity.

${playerTermUpper} STATUS:
- Name: ${activeSave.charName} | Class: ${activeSave.charClass.toUpperCase()} | Level: ${activeSave.level}
- FIAT: ƒ${computeDecayedSalary(sd.governmentBaseSalary ?? (activeSave.charClass === 'corporate' ? 25000 : activeSave.charClass === 'replicant' ? 18000 : activeSave.charClass === 'outlaw' ? 10000 : activeSave.salary), sd.createdAt ?? activeSave.createdAt).toLocaleString()}
- Zone: ${activeSave.lastZone}
- HP: ${sd.hp ?? '?'}/${sd.maxHp ?? '?'}
- Hunger: ${Math.floor(sd.hunger ?? 0)}% | Thirst: ${Math.floor(sd.thirst ?? 0)}% | Energy: ${Math.floor(sd.energy ?? 0)}%

The ${playerTermLower} is accessing PABLO through the ${physicalTerminal ? 'main terminal' : 'staff mobile terminal'}. Reply in 1–3 short lines. Be useful. Be lore-accurate. Stay in character.`;

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

  if (authLoading) {
    return <div style={{ minHeight: '100dvh', background: '#000800', display: 'grid', placeItems: 'center', color: '#38bdf8', letterSpacing: '.15em' }}>RESTORING SESSION...</div>;
  }
  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to access your mobile terminal.' : 'Salaryman credentials required. Terminal MX-75 remote access locked.'} />;
  }

  if (alpha.loading) {
    return <div style={{ minHeight: '100dvh', background: '#000800', display: 'grid', placeItems: 'center', color: '#38bdf8', letterSpacing: '.15em' }}>VERIFYING MOBILE TERMINAL...</div>;
  }

  if (!canUseMobileTerminal) {
    return (
      <div style={{ minHeight: '100dvh', background: '#000800', display: 'grid', placeItems: 'center', padding: '1.5rem', color: '#38bdf8', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: '1.25rem', letterSpacing: '.16em', marginBottom: '.75rem' }}>MOBILE TERMINAL NOT ISSUED</div>
          <div style={{ fontSize: '.7rem', color: 'rgba(56,189,248,.55)', lineHeight: 1.7 }}>Remote terminal access is issued only to ADMIN and MOD staff. Use a public terminal inside Shadow Tower.</div>
          <button onClick={() => navigate('/tower/mezzanine?focus=phone')} style={{ marginTop: '1rem', padding: '.65rem 1rem', border: '1px solid rgba(56,189,248,.5)', background: 'rgba(56,189,248,.08)', color: '#38bdf8', cursor: 'pointer' }}>GO TO PUBLIC TERMINAL</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#000800', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...stFont(boomerMode) }}>
        <div style={{ ...vtFont(boomerMode), fontSize: '1.5rem', color: '#38bdf8', letterSpacing: '.2em', animation: 'pulse 1.5s infinite' }}>CONNECTING...</div>
        <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.25)', marginTop: '.5rem', letterSpacing: '.1em' }}>TERMINAL · MOBILE</div>
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
          No {salarymanTerm(getSalarymanGender())} record found. Start the game on desktop to create your character.
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
              <div style={{ ...vtFont(boomerMode), fontSize: '1.3rem', color: '#38bdf8', letterSpacing: '.18em', textShadow: '0 0 12px rgba(56,189,248,.3)' }}>TERMINAL</div>
              <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.12em', marginTop: '.1rem' }}>MOBILE ACCESS · ALPHA {__BUILD_VERSION__}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => navigate('/phone?tab=chat&from=mobile-terminal')}
                style={{ ...vtFont(boomerMode), fontSize: '.75rem', color: '#38bdf8', letterSpacing: '.08em', border: 0, background: 'transparent', cursor: 'pointer' }}
              >
                ● COMMS
              </button>
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

        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid rgba(56,189,248,.12)', flexShrink: 0 }}>
          {([
            { id: 'chat' as TabId, label: '🤖 PABLO', boomerLabel: '🤖 AI CHAT', locked: false },
            { id: 'stats' as TabId, label: `📊 STATS`, boomerLabel: `📊 MY STATS`, locked: false },
            { id: 'finances' as TabId, label: '● LIVE FINANCES', boomerLabel: '● FINANCES', locked: false },
            { id: 'overview' as TabId, label: `🏙 OVERVIEW`, boomerLabel: `🏙 OVERVIEW`, locked: false },
            { id: 'settings' as TabId, label: `⚙ SETUP`, boomerLabel: `⚙ SETTINGS`, locked: false },
            { id: 'tower' as TabId, label: `▣ TOWER`, boomerLabel: `▣ TOWER`, locked: false },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: '1 0 auto', padding: '.5rem .45rem', border: 'none', borderBottom: tab === t.id ? '2px solid #38bdf8' : '2px solid transparent',
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
              <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.6rem' }}>{salarymanTerm(getSalarymanGender(), 'upper')} STATUS REPORT</div>

              <StatBar boomer={boomerMode} label="HP" value={sd.hp ?? 100} max={sd.maxHp ?? 100} color="#38bdf8" />
              <StatBar boomer={boomerMode} label="HUNGER" value={sd.hunger ?? 100} max={100} color="#38bdf8" />
              <StatBar boomer={boomerMode} label="THIRST" value={sd.thirst ?? 100} max={100} color="#33aaff" />
              <StatBar boomer={boomerMode} label="ENERGY" value={sd.energy ?? 100} max={100} color="#ffcc00" />

              <div style={{ borderTop: '1px solid rgba(56,189,248,.1)', marginTop: '.6rem', paddingTop: '.6rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>FINANCIAL STATUS</div>
                <StatRow boomer={boomerMode} label="FIAT (ƒ)" val={`ƒ${Math.round(walletSnapshot?.bank.earnedFiat ?? computeDecayedSalary(govBaseSalary, signupTime)).toLocaleString()}`} col="#ffcc00" />
                <StatRow boomer={boomerMode} label="SAVINGS" val={`ƒ${Math.round(walletSnapshot ? walletSnapshot.bank.accounts.filter(account => account.currency === 'FIAT' && /savings/i.test(account.kind)).reduce((sum, account) => sum + account.balance, 0) : (sd.savings ?? 0)).toLocaleString()}`} col="#ffcc00" />
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
                <StatRow boomer={boomerMode} label="ZONE" val={activeSave.lastZone} col={activeSave.lastZone === getActiveCityName() ? '#38bdf8' : '#7dd3fc'} />
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

          {tab === 'finances' && (
            <LiveFinances
              snapshot={walletSnapshot}
              error={walletError}
              boomer={boomerMode}
              onNavigate={navigate}
            />
          )}

          {tab === 'chat' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {pabloMsgs.length === 0 && (
                  <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.22)', lineHeight: 1.8, padding: '.5rem 0' }}>
                    &gt; PABLO ONLINE — MOBILE LINK<br />
                    &gt; Remote terminal access active.<br />
                    &gt; Ask anything. I know {getActiveCityName()}.
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
                    Register a business in {getActiveCityName()} to access business management features. Visit the game on desktop to get started.
                  </div>
                </div>
              )}

              <div style={{ borderTop: '1px solid rgba(56,189,248,.1)', marginTop: '.8rem', paddingTop: '.6rem' }}>
                <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.14em', marginBottom: '.3rem' }}>NETWORK STATUS</div>
                <StatRow boomer={boomerMode} label="SERVER" val={getActiveCityName()} col="#38bdf8" />
                <StatRow boomer={boomerMode} label="FACTION" val="PABLO CORP" col="#b400ff" />
                <StatRow boomer={boomerMode} label="ECONOMY" val="ƒ FIAT STANDARD" col="#ffcc00" />
              </div>

              <div style={{ borderTop: '1px solid rgba(56,189,248,.1)', marginTop: '.8rem', paddingTop: '.6rem' }}>
                <div style={{ border: '1px solid rgba(0,180,255,.15)', padding: '.6rem', background: 'rgba(0,180,255,.03)' }}>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,180,255,.5)', lineHeight: 1.8, ...stFont(boomerMode) }}>
                    Trading, building purchases, and cargo runs require physical terminal access in {getActiveCityName()}. Use the PABLO tab to get business advice remotely.
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div style={{ padding: '1rem' }}>
              <GameSettings embedded />
            </div>
          )}

          {tab === 'tower' && (
            <div style={{ padding: '1rem' }}>
              <TowerLifeHub compact cityLabel={getActiveCityName().toUpperCase()} floorLabel="MOBILE TERMINAL · ALL TENANTS" />
            </div>
          )}
        </div>

        <div style={{ padding: '.5rem 1rem', borderTop: '1px solid rgba(56,189,248,.1)', flexShrink: 0, background: 'rgba(0,5,0,.95)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.12)', letterSpacing: '.07em' }}>
              {`TERMINAL ALPHA ${__BUILD_VERSION__} · MOBILE · ALL TRANSMISSIONS LOGGED`}
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
