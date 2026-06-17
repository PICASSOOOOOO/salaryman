import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ArrowRight, Receipt, Building2, Banknote } from "lucide-react";
import { CurrencyTicker } from "@/components/CurrencyTicker";
import { apiFetch } from "@/lib/api-client";
import { ECONOMY_RAILS } from "@/lib/economy-key";

type EconomyStats = {
  totalCirculation: number;
  accountCount: number;
  userCount: number;
  richest: { name: string; total: number }[];
  poorest: { name: string; total: number }[];
  bountiedCount: number;
  asOf: number;
};

function fmtFiat(n: number): string {
  if (!isFinite(n)) return "—";
  return "ƒ" + n.toLocaleString();
}

// Per-rail Tailwind accent classes for the CONVERSION card. Keyed by the shared
// ECONOMY_RAILS code so the legend's source of truth stays in one place.
const RAIL_ACCENT: Record<string, { border: string; bg: string; label: string; value: string }> = {
  USD: { border: "border-emerald-700/40", bg: "bg-emerald-900/20", label: "text-emerald-300", value: "text-emerald-200" },
  FIAT: { border: "border-fuchsia-700/40", bg: "bg-fuchsia-900/20", label: "text-fuchsia-300", value: "text-fuchsia-200" },
  GOLD: { border: "border-amber-700/40", bg: "bg-amber-900/20", label: "text-amber-300", value: "text-amber-200" },
};

/**
 * Economy page — bridges the real-world economy with the in-game one. Single
 * source of truth for the player on what money means in Salaryman:
 *   • Same rails. Anything you earn in game is real money you can withdraw.
 *   • Conversion is fixed: $20 = ƒ20,000 = 0.1 oz GOLD.
 *   • Wanted bounty → tax collectors hunt you.
 *   • Death → hospital invoice, then back to work.
 */
export default function GameEconomy() {
  const [stats, setStats] = useState<EconomyStats | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await apiFetch("/api/economy/stats");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as EconomyStats;
        if (alive) {
          setStats(j);
          setStatsErr(null); // clear stale error after a successful refresh
        }
      } catch (e: any) {
        if (alive) setStatsErr(e?.message || "stats failed");
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const ACCENT: Record<string, { border: string; title: string }> = {
    zinc:    { border: "border-zinc-700/40",    title: "text-zinc-300" },
    amber:   { border: "border-amber-700/40",   title: "text-amber-300" },
    red:     { border: "border-red-700/40",     title: "text-red-300" },
    cyan:    { border: "border-cyan-700/40",    title: "text-cyan-300" },
    fuchsia: { border: "border-fuchsia-700/40", title: "text-fuchsia-300" },
    emerald: { border: "border-emerald-700/40", title: "text-emerald-300" },
  };
  const Card = ({ title, children, accent = "zinc" }: any) => {
    const a = ACCENT[accent] ?? ACCENT.zinc;
    return (
      <section className={`rounded-xl border bg-zinc-950/70 p-4 ${a.border}`}>
        <h2 className={`text-[10px] font-mono tracking-[0.3em] ${a.title} mb-2`}>{title}</h2>
        <div className="text-[12px] text-zinc-300 leading-relaxed space-y-2">{children}</div>
      </section>
    );
  };

  return (
    <div className="min-h-screen w-full" style={{
      background: "radial-gradient(circle at 50% 0%, rgba(80,60,20,0.35) 0%, transparent 70%), #060607",
      paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
      paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
    }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <Link href="/office" className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs font-mono tracking-wider mb-4">
          <ChevronLeft className="w-4 h-4" /> OFFICE
        </Link>

        <header className="mb-6">
          <h1 className="text-2xl font-mono tracking-[0.2em] text-amber-200">ECONOMY</h1>
          <p className="text-[11px] font-mono text-zinc-500 tracking-wider uppercase mt-1">
            The game is all about capital. Everything else is set dressing.
          </p>
        </header>

        {/* Live ticker */}
        <div className="rounded-lg border border-amber-700/40 bg-amber-500/5 p-3 mb-6 flex items-center gap-3 overflow-x-auto">
          <CurrencyTicker />
        </div>

        {/* Conversion table — rendered from the shared ECONOMY_RAILS source of
            truth, the same legend surfaced on every onboarding step. */}
        <Card title="CONVERSION · ONE RAIL" accent="amber">
          <div className="grid grid-cols-3 gap-2 text-center font-mono">
            {ECONOMY_RAILS.map((r) => {
              const c = RAIL_ACCENT[r.code];
              return (
                <div key={r.code} className={`rounded border ${c.border} ${c.bg} py-3`}>
                  <div className={`text-[9px] tracking-widest ${c.label}`}>{r.label}</div>
                  <div className={`text-lg ${c.value} mt-1`}>{r.value}</div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-zinc-400 mt-3">
            Anything you earn in-game is real money. Withdraw it back to your bank. Because of that, the in-game economy is deliberately stingy — enemies, loot, and treasure pay almost nothing on purpose.
          </p>
        </Card>

        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <Card title="BOUNTY · TAX COLLECTORS" accent="red">
            <p>Owe back-taxes or skip a debt and a bounty appears on your head. Tax collectors will hunt you across the map until it's settled. Higher bounty → tougher collectors.</p>
          </Card>
          <Card title="DEATH · HOSPITAL" accent="cyan">
            <p>When you die, you wake up in a hospital. They invoice you for the visit out of your wallet, then push you back into the day. That's life for the salaryman.</p>
          </Card>
          <Card title="REAL ESTATE" accent="fuchsia">
            <p>Dwellings &amp; offices priced live to BTC. Resell or sublet anything you own.</p>
            <Link href="/store/realty" className="inline-flex items-center gap-1 mt-2 text-[11px] font-mono text-fuchsia-300 hover:text-fuchsia-200">
              <Building2 className="w-3 h-3" /> OPEN STORE <ArrowRight className="w-3 h-3" />
            </Link>
          </Card>
          <Card title="BANKING · PAYROLL" accent="emerald">
            <p>Connect your real-world payroll &amp; bank (Chase, Wells Fargo, Gusto). FIAT in-game and FIAT in your account are the same balance — no second wallet to track.</p>
            <Link href="/profile/platform" className="inline-flex items-center gap-1 mt-2 text-[11px] font-mono text-emerald-300 hover:text-emerald-200">
              <Banknote className="w-3 h-3" /> CONNECT BANK <ArrowRight className="w-3 h-3" />
            </Link>
          </Card>
        </div>

        {/* Live ledger — drawn from /api/economy/stats (cached 30s on the server). */}
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 className="text-[10px] font-mono tracking-[0.3em] text-zinc-400 mb-3">CIRCULATION · LIVE</h2>
          <div className="grid sm:grid-cols-3 gap-3 text-center font-mono">
            <Stat
              label="MONEY IN CIRCULATION"
              value={stats ? fmtFiat(stats.totalCirculation) : "ƒ —"}
              sub={stats ? `${stats.accountCount} accounts · ${stats.userCount} salarymen` : undefined}
            />
            <Stat
              label="RICHEST SALARYMAN"
              value={stats?.richest[0]?.name ?? "—"}
              sub={stats?.richest[0] ? fmtFiat(stats.richest[0].total) : "ƒ —"}
            />
            <Stat
              label="POOREST SALARYMAN"
              value={stats?.poorest[0]?.name ?? "—"}
              sub={stats?.poorest[0] ? fmtFiat(stats.poorest[0].total) : "ƒ —"}
            />
          </div>
          {(stats?.richest?.length ?? 0) > 1 && (
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <div className="rounded border border-emerald-900/40 bg-emerald-950/20 p-3">
                <div className="text-[9px] tracking-widest text-emerald-400 mb-1.5">TOP 5 EARNERS</div>
                <ol className="text-[11px] text-emerald-200 space-y-0.5">
                  {stats!.richest.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate">{i + 1}. {r.name}</span>
                      <span className="text-emerald-400/80">{fmtFiat(r.total)}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="rounded border border-red-900/40 bg-red-950/20 p-3">
                <div className="text-[9px] tracking-widest text-red-400 mb-1.5">DOWN BAD · BOTTOM 5</div>
                <ol className="text-[11px] text-red-200 space-y-0.5">
                  {stats!.poorest.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate">{i + 1}. {r.name}</span>
                      <span className="text-red-400/80">{fmtFiat(r.total)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          <p className="mt-3 text-[10px] text-zinc-600 tracking-widest uppercase flex items-center gap-2">
            <Receipt className="w-3 h-3" />
            {statsErr
              ? `Ledger offline — ${statsErr}`
              : stats
                ? `Updated ${new Date(stats.asOf).toLocaleTimeString()} · bountied: ${stats.bountiedCount}`
                : "Loading ledger…"}
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-black/40 py-3 px-2">
      <div className="text-[9px] text-zinc-500 tracking-widest">{label}</div>
      <div className="text-lg text-zinc-200 mt-1">{value}</div>
      {sub && <div className="text-[10px] text-zinc-500">{sub}</div>}
    </div>
  );
}
