import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Banknote, Building2, Gamepad2, Landmark, MapPin } from "lucide-react";
import GameSettings from "@/pages/Game/Settings";
import { SignInPage } from "@/components/SignInPrompt";
import { useAuth } from "@/hooks/use-auth";
import { getOperationalCities } from "@/lib/world-servers";

type OsTopic = "controls" | "locations" | "finance";

const TOPICS: { id: OsTopic; label: string; icon: typeof Gamepad2 }[] = [
  { id: "controls", label: "GAME SETTINGS", icon: Gamepad2 },
  { id: "locations", label: "OFFICE LOCATIONS", icon: MapPin },
  { id: "finance", label: "ECONOMY & FINANCE", icon: Landmark },
];

const LIVE_OFFICE_IDS = new Set(["minx_city", "huda_city"]);
const OFFICE_LOCATIONS = getOperationalCities().filter((city) => LIVE_OFFICE_IDS.has(city.cityId));

function initialTopic(): OsTopic {
  if (typeof window === "undefined") return "controls";
  const requested = new URLSearchParams(window.location.search).get("topic");
  return requested === "locations" || requested === "finance" ? requested : "controls";
}

function localCityTime(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);
}

export default function SalarymanOSSettings() {
  const { isAuthenticated } = useAuth();
  const [topic, setTopic] = useState<OsTopic>(initialTopic);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to manage SALARYMAN OS settings." />;
  }

  return (
    <main className="min-h-[100dvh] bg-[#fffaf0] px-4 py-8 text-black sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="border-b border-[#d8d1c3] pb-5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-black/55">
            SETTINGS / GAME &amp; SERVER
          </p>
          <h1 className="text-2xl font-bold uppercase tracking-tight">SALARYMAN OS</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/65">
            Game controls, the two live city servers, and the economy are grouped here.
          </p>
        </header>

        <nav aria-label="SALARYMAN OS settings" className="flex gap-2 overflow-x-auto pb-1">
          {TOPICS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={topic === id}
              onClick={() => setTopic(id)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 border px-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                topic === id
                  ? "border-black bg-black text-white"
                  : "border-[#d8d1c3] bg-white text-black hover:border-black"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        {topic === "controls" && (
          <section aria-label="Game settings" className="rounded-md border border-[#d8d1c3] bg-white p-3 sm:p-5">
            <GameSettings embedded />
          </section>
        )}

        {topic === "locations" && (
          <section aria-labelledby="office-locations-title" className="space-y-4">
            <div>
              <h2 id="office-locations-title" className="text-lg font-bold">Office locations</h2>
              <p className="mt-1 text-sm text-black/60">These are the two live SALARYMAN city servers.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {OFFICE_LOCATIONS.map((city) => (
                <article key={city.cityId} className="border border-[#d8d1c3] bg-white p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/50">{city.region}</p>
                      <h3 className="mt-1 text-lg font-bold">{city.cityName}</h3>
                    </div>
                    <span className="border border-emerald-700/30 bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-emerald-800">
                      {city.isLive ? "LIVE SERVER" : "OFFLINE"}
                    </span>
                  </div>
                  <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-[#e8e2d7] pt-3 text-xs">
                    <dt className="text-black/55">Time zone</dt>
                    <dd className="font-mono">{city.timezone}</dd>
                    <dt className="text-black/55">Local server time</dt>
                    <dd className="font-mono tabular-nums">{localCityTime(now, city.timezone)}</dd>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        )}

        {topic === "finance" && (
          <section aria-labelledby="economy-finance-title" className="space-y-4">
            <div>
              <h2 id="economy-finance-title" className="text-lg font-bold">Economy, banking &amp; finance</h2>
              <p className="mt-1 text-sm text-black/60">
                Open the working economy and bank tools, or manage your business ledger.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Link
                href="/game/economy"
                className="group flex min-h-32 flex-col justify-between border border-[#d8d1c3] bg-white p-4 transition-colors hover:border-black"
              >
                <span className="flex items-center justify-between">
                  <Banknote className="h-5 w-5" aria-hidden="true" />
                  <ArrowUpRight className="h-4 w-4 text-black/45" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-bold">City economy</span>
                  <span className="mt-1 block text-xs text-black/60">Markets, currency and live economy data.</span>
                </span>
              </Link>
              <Link
                href="/game/bank?returnTo=%2Fsettings%2Fos%3Ftopic%3Dfinance"
                className="group flex min-h-32 flex-col justify-between border border-[#d8d1c3] bg-white p-4 transition-colors hover:border-black"
              >
                <span className="flex items-center justify-between">
                  <Landmark className="h-5 w-5" aria-hidden="true" />
                  <ArrowUpRight className="h-4 w-4 text-black/45" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-bold">Banking &amp; credit</span>
                  <span className="mt-1 block text-xs text-black/60">Accounts, transfers, statements and credit.</span>
                </span>
              </Link>
              <Link
                href="/business/accounting"
                className="group flex min-h-32 flex-col justify-between border border-[#d8d1c3] bg-white p-4 transition-colors hover:border-black"
              >
                <span className="flex items-center justify-between">
                  <Building2 className="h-5 w-5" aria-hidden="true" />
                  <ArrowUpRight className="h-4 w-4 text-black/45" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-bold">Business finance</span>
                  <span className="mt-1 block text-xs text-black/60">Organization accounting and ledgers.</span>
                </span>
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
