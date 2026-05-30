import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import {
  CITY_NAME, MONTHS, FIAT_PER_GOLD, getDayOfYear, getSeasonFromDayOfYear,
} from '@/gameSystems';
import {
  Building2, Users, Radio, Flag, Coins, TrendingUp, TrendingDown, Megaphone,
  Briefcase, Bot, Landmark, Globe, Skull, Calendar, Gem, Zap, ShieldAlert,
  Trophy, CreditCard, AlertTriangle, Activity, RefreshCw,
} from 'lucide-react';

// ── Types mirroring real API shapes (best-effort, all optional) ──────────────
type EconomyStats = {
  totalCirculation: number; accountCount: number; userCount: number;
  richest: { name: string; total: number }[];
  poorest: { name: string; total: number }[];
  bountiedCount: number; asOf: number;
};
type ServerStatus = { online: number; max: number; liberationProgress: number };
type Wallet = {
  bank?: { fiatTotal?: number; earnedFiat?: number; quarantineFiat?: number; accounts?: unknown[] };
  debt?: number; creditScore?: number;
  rates?: { fiatPerUsd?: number; goldOzPerUsd?: number };
};
type Broadcast = { id: string | number; title: string; message: string; type?: string; createdAt?: string };
type FeedItem = { id: string; kind: string; title: string; body: string; severity?: string; createdAt?: string };
type MyOfficeData = {
  buildings: { id: string; name: string; type?: string; label?: string }[];
  bots: { name: string; slug: string; category?: string; tagline?: string }[];
  orgs: { orgId: string; orgName: string; role: string }[];
  isAdmin: boolean; hasOffice: boolean;
};
type Business = { id: string | number; businessName?: string; businessType?: string; faction?: string };

// ── Static world lore (grounded in WorldMenu / gameSystems) ──────────────────
const CITIES = [
  { name: 'MINX CITY', zone: 'PST · PROTOTYPE', note: 'Pablo Corp seat. The first tower. Where the lights flicker first.' },
  { name: 'NEW VERIDIA', zone: 'EST · FINANCE', note: 'Banco Ombra HQ. Money moves before dawn here.' },
  { name: 'KOWLOON-9', zone: 'HKT · NIGHT MARKET', note: 'Static Monks territory. Everything is for sale.' },
  { name: 'IRONHOLM', zone: 'GMT · INDUSTRY', note: 'Eastern Bloc smokestacks. Built on rust and debt.' },
  { name: 'PORT ASHA', zone: 'IST · TRADE', note: 'Smuggler docks. The customs officers stopped asking.' },
  { name: 'CINDERREACH', zone: 'CET · MEDIA', note: 'TTC broadcast spires. The signal never sleeps.' },
];
const FACTIONS = [
  { name: 'IRON RATS', turf: 'WEST', color: 'text-orange-400', note: 'Scrap kings. Run the chop shops and the loan sharks.' },
  { name: 'VOID DOGS', turf: 'CENTRAL', color: 'text-fuchsia-400', note: 'Tower-adjacent muscle. Loyal to whoever pays in gold.' },
  { name: 'STATIC MONKS', turf: 'EAST', color: 'text-cyan-400', note: 'Data cultists. They worship the signal and tax the network.' },
  { name: 'EASTERN BLOC', turf: 'SOUTH', color: 'text-emerald-400', note: 'Old-money industrialists. Patient, ruthless, organized.' },
];
const CLASSES = [
  { name: 'SUIT', note: 'Corporate ladder. Salary, benefits, and a target on your back.' },
  { name: 'OUTLAW', note: 'Off the books. High risk, no payroll, no rules.' },
  { name: 'REPLICANT', note: 'Synthetic labor. Prized by Pablo Corp, owned by no one yet.' },
];

// ── Formatting helpers ───────────────────────────────────────────────────────
const fiat = (n: number | undefined | null) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1_000_000_000) return `ƒ${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `ƒ${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `ƒ${(v / 1_000).toFixed(1)}K`;
  return `ƒ${v.toLocaleString()}`;
};
const num = (n: number | undefined | null) => Number(n || 0).toLocaleString();

function worldDate() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const doy = Math.floor((now.getTime() - start.getTime()) / 86_400_000); // 1..365
  const idx = ((doy - 1) % (MONTHS.length * 28) + MONTHS.length * 28) % (MONTHS.length * 28);
  const month = Math.floor(idx / 28);
  const day = (idx % 28) + 1;
  const season = getSeasonFromDayOfYear(getDayOfYear(month, day));
  return { label: `${MONTHS[month]} ${day}`, season };
}

// ── Reusable UI ──────────────────────────────────────────────────────────────
function Tile({ icon, label, value, sub, accent = 'sky' }: {
  icon: ReactNode; label: string; value: string; sub?: string;
  accent?: 'sky' | 'emerald' | 'amber' | 'fuchsia' | 'red';
}) {
  const glow: Record<string, string> = {
    sky: 'bg-sky-500/20', emerald: 'bg-emerald-500/20', amber: 'bg-amber-500/20',
    fuchsia: 'bg-fuchsia-500/20', red: 'bg-red-500/20',
  };
  const fg: Record<string, string> = {
    sky: 'text-sky-400', emerald: 'text-emerald-400', amber: 'text-amber-400',
    fuchsia: 'text-fuchsia-400', red: 'text-red-400',
  };
  return (
    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl ${glow[accent]}`} />
      <div className="relative">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          <span className={fg[accent]}>{icon}</span>{label}
        </div>
        <div className="mt-2 font-mono text-2xl font-bold text-zinc-50">{value}</div>
        {sub && <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>}
      </div>
    </div>
  );
}

function Card({ title, icon, right, children }: {
  title: string; icon?: ReactNode; right?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-mono text-sm uppercase tracking-widest text-zinc-300">
          {icon && <span className="text-sky-400">{icon}</span>}{title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const SEV: Record<string, string> = {
  urgent: 'border-red-500/40 bg-red-500/5', warn: 'border-amber-500/40 bg-amber-500/5',
  info: 'border-sky-500/30 bg-sky-500/5',
};

export default function MyOffice() {
  const { isAuthenticated, isLoading } = useAuth();
  const [econ, setEcon] = useState<EconomyStats | null>(null);
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [office, setOffice] = useState<MyOfficeData | null>(null);
  const [biz, setBiz] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(() => new Date());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    setLoading(true);
    const j = async (p: string) => {
      const r = await apiFetch(p);
      if (!r.ok) throw new Error(`${p} ${r.status}`);
      return r.json();
    };
    Promise.allSettled([
      j('/api/economy/stats'), j('/api/world/server-status'), j('/api/wallet/snapshot'),
      j('/api/admin/broadcasts/active'), j('/api/me/pablo-feed'), j('/api/world/my-office'),
      j('/api/world/my-business'),
    ]).then(([e, s, w, b, f, o, mb]) => {
      if (!alive) return;
      if (e.status === 'fulfilled') setEcon(e.value);
      if (s.status === 'fulfilled') setServer(s.value);
      if (w.status === 'fulfilled') setWallet(w.value);
      if (b.status === 'fulfilled') setBroadcasts(b.value?.broadcasts ?? []);
      if (f.status === 'fulfilled') setFeed(f.value?.items ?? []);
      if (o.status === 'fulfilled') setOffice(o.value);
      if (mb.status === 'fulfilled') setBiz(mb.value?.businesses ?? []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [isAuthenticated, reloadKey]);

  if (isLoading) {
    return <div className="flex h-[60vh] items-center justify-center font-mono text-zinc-500">LOADING OFFICE…</div>;
  }
  if (!isAuthenticated) return <SignInPage />;

  const wd = worldDate();
  const clock = tick.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const lib = server?.liberationProgress ?? 0;
  const events = [
    ...broadcasts.map(b => ({
      id: `b-${b.id}`, severity: b.type === 'alert' ? 'urgent' : 'info',
      title: b.title, body: b.message, tag: 'CITY BROADCAST', when: b.createdAt,
    })),
    ...feed.map(f => ({
      id: `f-${f.id}`, severity: f.severity ?? 'info',
      title: f.title, body: f.body, tag: String(f.kind ?? 'info').replace(/_/g, ' ').toUpperCase(), when: f.createdAt,
    })),
  ].sort((a, b) => new Date(b.when ?? 0).getTime() - new Date(a.when ?? 0).getTime());

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <header className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-emerald-400">
              <Building2 size={14} /> Command Desk
            </div>
            <h1 className="mt-1 font-mono text-3xl font-bold tracking-tighter text-zinc-50 md:text-4xl">MY OFFICE</h1>
            <p className="mt-1 max-w-xl text-sm text-zinc-400">
              State of the world from your desk in <span className="text-zinc-200">{CITY_NAME}</span> — the economy,
              the streets, and everyone grinding in it.
            </p>
          </div>
          <div className="text-right font-mono">
            <div className="text-2xl font-bold tabular-nums text-zinc-100">{clock}</div>
            <div className="text-[11px] uppercase tracking-widest text-zinc-500">
              {wd.label} · {wd.season} · Y1
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {server ? `${num(server.online)}/${num(server.max)} ONLINE` : 'SYNCING…'}
            </div>
          </div>
        </div>
      </header>

      {/* World pulse ribbon */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Users size={12} />} label="Citizens" value={num(econ?.userCount)} sub={`${num(econ?.accountCount)} bank accounts`} accent="sky" />
        <Tile icon={<Radio size={12} />} label="Online Now" value={server ? num(server.online) : '—'} sub={server ? `capacity ${num(server.max)}` : undefined} accent="emerald" />
        <Tile icon={<Coins size={12} />} label="FIAT in Circulation" value={fiat(econ?.totalCirculation)} sub="across all wallets" accent="amber" />
        <Tile icon={<Flag size={12} />} label="City Liberation" value={`${lib.toFixed(1)}%`} sub="streets reclaimed" accent="fuchsia" />
      </div>

      {/* Liberation progress */}
      <Card title="City Liberation Front" icon={<Flag size={14} />}
        right={<span className="font-mono text-xs text-fuchsia-400">{lib.toFixed(1)}%</span>}>
        <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-600 to-fuchsia-400 transition-all"
            style={{ width: `${Math.max(0, Math.min(100, lib))}%` }} />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Every building locked and every Pablo Corp enforcer dropped pushes the city toward liberation.
          Hit 100% and the season turns. Pablo is watching the number too.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Current events */}
        <div className="lg:col-span-2">
          <Card title="Current Events" icon={<Activity size={14} />}
            right={<button onClick={() => setReloadKey(k => k + 1)} className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:bg-white/5">
              <RefreshCw size={11} /> Refresh
            </button>}>
            {loading ? (
              <div className="py-8 text-center font-mono text-sm text-zinc-600">SCANNING THE WIRE…</div>
            ) : events.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 py-8 text-center text-sm text-zinc-600">
                The city is quiet. No broadcasts, no offers, no incoming. For now.
              </div>
            ) : (
              <ul className="space-y-2">
                {events.slice(0, 12).map(ev => (
                  <li key={ev.id} className={`rounded-lg border px-3 py-2.5 ${SEV[ev.severity] ?? SEV.info}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">{ev.tag}</span>
                      {ev.severity === 'urgent' && <ShieldAlert size={12} className="text-red-400" />}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-zinc-100">{ev.title}</div>
                    {ev.body && <div className="mt-0.5 text-xs text-zinc-400">{ev.body}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Your holdings */}
        <Card title="Your Holdings" icon={<Briefcase size={14} />}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-zinc-400"><Coins size={13} className="text-amber-400" /> Earned FIAT</span>
              <span className="font-mono text-zinc-100">{fiat(wallet?.bank?.earnedFiat)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-zinc-400"><Landmark size={13} className="text-sky-400" /> Bank Total</span>
              <span className="font-mono text-zinc-100">{fiat(wallet?.bank?.fiatTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-zinc-400"><CreditCard size={13} className="text-emerald-400" /> Credit Score</span>
              <span className="font-mono text-zinc-100">{wallet?.creditScore != null ? num(wallet.creditScore) : '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-zinc-400"><AlertTriangle size={13} className="text-red-400" /> Debt</span>
              <span className="font-mono text-zinc-100">{fiat(wallet?.debt)}</span>
            </div>
            <div className="my-2 h-px bg-white/10" />
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-zinc-400"><Building2 size={13} className="text-fuchsia-400" /> Buildings</span>
              <span className="font-mono text-zinc-100">{num(office?.buildings?.length)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-zinc-400"><Bot size={13} className="text-sky-400" /> Active Bots</span>
              <span className="font-mono text-zinc-100">{num(office?.bots?.length)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-zinc-400"><Briefcase size={13} className="text-emerald-400" /> Businesses</span>
              <span className="font-mono text-zinc-100">{num(biz.length)}</span>
            </div>
            {office?.orgs && office.orgs.length > 0 && (
              <div className="mt-2 space-y-1">
                {office.orgs.slice(0, 4).map(o => (
                  <div key={o.orgId} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-2 py-1">
                    <span className="truncate text-xs text-zinc-300">{o.orgName}</span>
                    <span className="font-mono text-[10px] uppercase text-zinc-500">{o.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Economy */}
      <Card title="The Economy" icon={<Coins size={14} />}
        right={<span className="font-mono text-[10px] text-zinc-600">{econ ? `updated ${new Date(econ.asOf).toLocaleTimeString()}` : ''}</span>}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-emerald-400">
              <Trophy size={13} /> Richest in {CITY_NAME}
            </div>
            <ol className="space-y-1.5">
              {(econ?.richest ?? []).map((p, i) => (
                <li key={`r${i}`} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm">
                  <span className="flex items-center gap-2"><span className="font-mono text-xs text-zinc-600">#{i + 1}</span><span className="text-zinc-200">{p.name}</span></span>
                  <span className="flex items-center gap-1 font-mono text-emerald-400"><TrendingUp size={12} />{fiat(p.total)}</span>
                </li>
              ))}
              {(!econ?.richest || econ.richest.length === 0) && <li className="text-xs text-zinc-600">No data yet.</li>}
            </ol>
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-red-400">
              <TrendingDown size={13} /> Down & Out
            </div>
            <ol className="space-y-1.5">
              {(econ?.poorest ?? []).map((p, i) => (
                <li key={`p${i}`} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm">
                  <span className="text-zinc-200">{p.name}</span>
                  <span className="font-mono text-red-400">{fiat(p.total)}</span>
                </li>
              ))}
              {(!econ?.poorest || econ.poorest.length === 0) && <li className="text-xs text-zinc-600">No data yet.</li>}
            </ol>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile icon={<Coins size={12} />} label="ƒ per USD" value={wallet?.rates?.fiatPerUsd ? num(wallet.rates.fiatPerUsd) : '—'} accent="amber" />
          <Tile icon={<Gem size={12} />} label="Gold oz / USD" value={wallet?.rates?.goldOzPerUsd != null ? String(wallet.rates.goldOzPerUsd) : '—'} accent="amber" />
          <Tile icon={<Gem size={12} />} label="ƒ per Gold Bar" value={num(FIAT_PER_GOLD)} accent="emerald" />
          <Tile icon={<Landmark size={12} />} label="Bank Accounts" value={num(econ?.accountCount)} accent="sky" />
        </div>
      </Card>

      {/* World almanac / lore */}
      <Card title="World Almanac" icon={<Globe size={14} />}>
        <p className="mb-5 text-sm text-zinc-400">
          Eleven cities. Eleven towers. The same story told in every timezone — and you're living one chapter of it
          in {CITY_NAME}, prototype seat of <span className="text-zinc-200">Pablo Corp</span>. The 62-floor Shadow Tower
          stands at the center; floors 40 and up are sealed to all but the board. The Telephone Company (TTC) owns every
          line of comms in the world. Currency is <span className="text-amber-400">FIAT (ƒ)</span> — and {num(FIAT_PER_GOLD)} of
          it buys a single gold bar, if you can find a clean exchange.
        </p>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cities */}
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-sky-400">
              <Globe size={13} /> Cities of the World
            </div>
            <ul className="space-y-2">
              {CITIES.map(c => (
                <li key={c.name} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-zinc-100">{c.name}</span>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{c.zone}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{c.note}</p>
                </li>
              ))}
              <li className="text-center text-[11px] text-zinc-600">…and 5 more towers waiting in their own timezones.</li>
            </ul>
          </div>

          {/* Factions */}
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-fuchsia-400">
              <Skull size={13} /> Factions & Turf
            </div>
            <ul className="space-y-2">
              {FACTIONS.map(f => (
                <li key={f.name} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-sm ${f.color}`}>{f.name}</span>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{f.turf}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{f.note}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Classes + calendar */}
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-emerald-400">
                <Users size={13} /> Who You Can Be
              </div>
              <ul className="space-y-2">
                {CLASSES.map(c => (
                  <li key={c.name} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <span className="font-mono text-sm text-zinc-100">{c.name}</span>
                    <p className="mt-1 text-xs text-zinc-500">{c.note}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-amber-400">
                <Calendar size={13} /> The 13 Months
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {MONTHS.map((m, i) => (
                  <span key={m}
                    className={`rounded px-2 py-1 text-center font-mono text-[10px] tracking-wider ${
                      wd.label.startsWith(m) ? 'bg-amber-500/20 text-amber-300' : 'bg-white/[0.02] text-zinc-500'
                    }`}>
                    {i + 1}. {m}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">28 days each · 4 seasons · 364-day year.</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="pb-6 text-center text-[11px] text-zinc-700">
        <Zap size={11} className="mr-1 inline" /> Pablo Corp logs every desk session. <Megaphone size={11} className="mx-1 inline" /> Stay productive.
      </div>
    </div>
  );
}
