import { Link, useLocation } from "wouter";
import { Settings as SettingsIcon, Coins, User, Briefcase, ChevronRight, Building2, Landmark, Bot, ShoppingBag, Phone, Store } from "lucide-react";

/**
 * The TERMINAL — the office computer's operating system. Players reach it by
 * walking to the terminal station in their office; it's the single hub for
 * every tool, including Pablo (now just one app among many, not a separate
 * front door). Mirrors a real game's main menu / a desktop OS.
 */
export default function GameHub() {
  const [, navigate] = useLocation();
  const tiles = [
    {
      to: "/pablo",
      icon: Bot,
      kicker: "ASSISTANT",
      title: "PABLO",
      sub: "Your AI chief of staff. Ask, delegate, navigate — all by voice or text.",
      tone: "from-violet-900/40 to-zinc-950 border-violet-700/40 text-violet-200",
      heavy: true,
    },
    {
      to: "/office",
      icon: Briefcase,
      kicker: "ENTER",
      title: "GO TO WORK",
      sub: "Today is the same as yesterday. Clock in.",
      tone: "from-zinc-700 to-zinc-900 border-zinc-600 text-zinc-200",
    },
    {
      to: "/game/economy",
      icon: Coins,
      kicker: "MARKETS",
      title: "ECONOMY",
      sub: "Real ↔ in-game money. Circulation. Bounties. Hospital fees.",
      tone: "from-amber-900/40 to-zinc-950 border-amber-700/40 text-amber-200",
    },
    {
      to: "/store/realty",
      icon: Building2,
      kicker: "PROPERTY",
      title: "REAL ESTATE",
      sub: "Dwellings, offices, sublets — priced live to BTC.",
      tone: "from-fuchsia-900/30 to-zinc-950 border-fuchsia-700/40 text-fuchsia-200",
    },
    {
      to: "/marketplace",
      icon: Store,
      kicker: "EXCHANGE",
      title: "MARKETPLACE",
      sub: "Buy and list businesses, property, rentals, and inventory across both cities.",
      tone: "from-sky-900/30 to-zinc-950 border-sky-700/40 text-sky-200",
    },
    {
      to: "/game/bank",
      icon: Landmark,
      kicker: "FINANCE · ATM",
      title: "BANCO OMBRA",
      sub: "Checking, savings, vault, transfers, statements, cards.",
      tone: "from-emerald-900/30 to-zinc-950 border-emerald-700/40 text-emerald-200",
    },
    {
      to: "/vending?from=office",
      icon: ShoppingBag,
      kicker: "SUPPLY",
      title: "VENDING",
      sub: "Cosmetics, homebase goods, power cells — florin-only (ƒ).",
      tone: "from-pink-900/30 to-zinc-950 border-pink-700/40 text-pink-200",
    },
    {
      to: "/comms",
      icon: Phone,
      kicker: "PAYPHONE",
      title: "PAYPHONE",
      sub: "Calls, channels, and messages across the city.",
      tone: "from-sky-900/30 to-zinc-950 border-sky-700/40 text-sky-200",
    },
    {
      to: "/game/character",
      icon: User,
      kicker: "YOU",
      title: "SALARYMAN",
      sub: "Your character — wallet, bounty, hospital record.",
      tone: "from-cyan-900/30 to-zinc-950 border-cyan-700/40 text-cyan-200",
    },
    {
      to: "/game/settings",
      icon: SettingsIcon,
      kicker: "OPTIONS",
      title: "SETTINGS",
      sub: "Display, audio, resolution, controls.",
      tone: "from-zinc-800 to-zinc-950 border-zinc-700 text-zinc-300",
    },
  ];

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{
      background: "linear-gradient(180deg, rgba(5,8,15,.8), rgba(5,8,15,.96)), url('/pixel-agents/shadow-tower/spaces/tower_space_company.jpg') center / cover fixed",
      paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
      paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
    }}>
      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6">
        <header className="mb-8 text-center">
          <p className="text-[10px] font-mono tracking-[0.5em] text-zinc-500 mb-2">SALARYMAN</p>
          <h1 className="text-3xl sm:text-4xl font-mono tracking-[0.2em] text-zinc-100">TERMINAL</h1>
          <p className="text-xs font-mono text-zinc-600 mt-3 tracking-widest uppercase">
            All capital. All consequence. Everything connects to the real economy.
          </p>
        </header>

        <div className="grid sm:grid-cols-2 gap-4">
          {tiles.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.to}
                onClick={() => navigate(t.to)}
                className={`text-left rounded-xl border bg-gradient-to-br ${t.tone} p-5 transition-transform hover:-translate-y-0.5 hover:shadow-lg ${
                  t.heavy ? "sm:col-span-2 grayscale-[20%]" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-md bg-black/40 border border-white/10`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-mono tracking-[0.35em] opacity-70">{t.kicker}</p>
                    <h2 className={`font-mono tracking-widest mt-1 ${t.heavy ? "text-2xl" : "text-lg"}`}>{t.title}</h2>
                    <p className="text-[11px] mt-2 opacity-80 leading-relaxed">{t.sub}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-60 mt-1" />
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-8 text-center text-[10px] font-mono text-zinc-700 tracking-widest">
          PHONE TAKES PRIORITY OVER ALL AUDIO · MUSIC PAUSES DURING CALLS
        </p>

        <div className="mt-4 text-center">
          <Link href="/office" className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 tracking-widest uppercase">
            ← Back to Office
          </Link>
        </div>
      </div>
    </div>
  );
}
