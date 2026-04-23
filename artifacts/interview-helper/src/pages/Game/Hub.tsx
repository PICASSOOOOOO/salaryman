import { Link, useLocation } from "wouter";
import { Settings as SettingsIcon, Coins, User, Briefcase, ChevronRight, Building2 } from "lucide-react";

/**
 * Game hub — the user lands here when they tap GO TO WORK in the nav. They
 * choose what they're doing today instead of being thrown straight into the
 * world. Mirrors a real game's main menu.
 */
export default function GameHub() {
  const [, navigate] = useLocation();
  const tiles = [
    {
      to: "/world",
      icon: Briefcase,
      kicker: "ENTER",
      title: "GO TO WORK",
      sub: "Today is the same as yesterday. Clock in.",
      tone: "from-zinc-700 to-zinc-900 border-zinc-600 text-zinc-200",
      heavy: true,
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
    <div className="min-h-screen w-full" style={{
      background: "radial-gradient(circle at 50% 0%, rgba(40,40,60,0.45) 0%, transparent 70%), #050507",
      paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
      paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
    }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <header className="mb-8 text-center">
          <p className="text-[10px] font-mono tracking-[0.5em] text-zinc-500 mb-2">SALARYMAN</p>
          <h1 className="text-3xl sm:text-4xl font-mono tracking-[0.2em] text-zinc-100">GAME</h1>
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
          <Link href="/" className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 tracking-widest uppercase">
            ← Back to Pablo
          </Link>
        </div>
      </div>
    </div>
  );
}
