import { Link } from "wouter";
import { ChevronLeft, ArrowRight, Skull, Receipt, Building2, Banknote } from "lucide-react";
import { CurrencyTicker } from "@/components/CurrencyTicker";

/**
 * Economy page — bridges the real-world economy with the in-game one. Single
 * source of truth for the player on what money means in Salaryman:
 *   • Same rails. Anything you earn in game is real money you can withdraw.
 *   • Conversion is fixed: $20 = ƒ20,000 = 0.1 oz GOLD.
 *   • Wanted bounty → tax collectors hunt you.
 *   • Death → hospital invoice, then back to work.
 */
export default function GameEconomy() {
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
        <Link href="/game" className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs font-mono tracking-wider mb-4">
          <ChevronLeft className="w-4 h-4" /> GAME
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

        {/* Conversion table */}
        <Card title="CONVERSION · ONE RAIL" accent="amber">
          <div className="grid grid-cols-3 gap-2 text-center font-mono">
            <div className="rounded border border-emerald-700/40 bg-emerald-900/20 py-3">
              <div className="text-[9px] tracking-widest text-emerald-300">USD</div>
              <div className="text-lg text-emerald-200 mt-1">$20</div>
            </div>
            <div className="rounded border border-fuchsia-700/40 bg-fuchsia-900/20 py-3">
              <div className="text-[9px] tracking-widest text-fuchsia-300">FIAT</div>
              <div className="text-lg text-fuchsia-200 mt-1">ƒ20,000</div>
            </div>
            <div className="rounded border border-amber-700/40 bg-amber-900/20 py-3">
              <div className="text-[9px] tracking-widest text-amber-300">GOLD</div>
              <div className="text-lg text-amber-200 mt-1">0.1 oz</div>
            </div>
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

        {/* Stats placeholder — wires up to /api/economy/stats once it ships. */}
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 className="text-[10px] font-mono tracking-[0.3em] text-zinc-400 mb-3">CIRCULATION · LIVE</h2>
          <div className="grid sm:grid-cols-3 gap-3 text-center font-mono">
            <Stat label="MONEY IN CIRCULATION" value="ƒ —" />
            <Stat label="RICHEST SALARYMAN" value="—" sub="ƒ —" />
            <Stat label="POOREST SALARYMAN" value="—" sub="ƒ —" />
          </div>
          <p className="mt-3 text-[10px] text-zinc-600 tracking-widest uppercase flex items-center gap-2">
            <Receipt className="w-3 h-3" />
            Live ledger ships in next pass.
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
