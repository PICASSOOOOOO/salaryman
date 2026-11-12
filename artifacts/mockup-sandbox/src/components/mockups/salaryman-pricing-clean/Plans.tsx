import { useState, type ReactNode } from "react";
import { Check, Crown, Loader2, Phone, ShoppingBag, Sparkles } from "lucide-react";
import "./_group.css";

type FeatureKey = "phone_system" | "claw_bot" | "live_listen" | "screen_scan" | "say_this";

interface MembershipItem {
  id: string;
  name: string;
  blurb: string;
  effect: string;
  priceUsd: number;
  subscriptionFeature: FeatureKey;
}

const ITEMS: MembershipItem[] = [
  {
    id: "membership_calll_home",
    name: "CALLL HOME",
    blurb: "Business calling and messaging for your organization.",
    effect: "Twilio-connected calling, two-way SMS, campaigns, recordings, and the AI secretary — billed $50/month.",
    priceUsd: 50,
    subscriptionFeature: "phone_system",
  },
  {
    id: "membership_pablo_prime",
    name: "PABLO PRIME",
    blurb: "The whole platform in one subscription.",
    effect: "Unlocks the full Pablo AI workforce, Live Listen, Screen Scan, and Say This — billed $100/month. CALLL HOME is separate.",
    priceUsd: 100,
    subscriptionFeature: "claw_bot",
  },
];

const PLAN_COPY: Record<FeatureKey, { summary: string; bullets: string[] }> = {
  phone_system: {
    summary: "CALLL HOME calling and messaging, connected to your CRM.",
    bullets: ["Business calling and two-way SMS", "Calls and messages connect to CRM contacts", "Default platform number included"],
  },
  claw_bot: {
    summary: "Pablo AI brings chat and business automation together.",
    bullets: ["Pablo chat with nine specialist agents", "Business workflows and bot chaining", "Live Listen, Screen Scan, and Say This"],
  },
  live_listen: { summary: "", bullets: [] },
  screen_scan: { summary: "", bullets: [] },
  say_this: { summary: "", bullets: [] },
};

export function Plans() {
  const [notice, setNotice] = useState("");
  const features = new Set<FeatureKey>();
  const calllHome = ITEMS.find((item) => item.subscriptionFeature === "phone_system");
  const pabloAi = ITEMS.find((item) => item.subscriptionFeature === "claw_bot");
  const legacyPrimeView = new URLSearchParams(window.location.search).get("view") === "prime";

  const startCheckout = () => {
    setNotice("Checkout is disabled in this preview.");
  };

  return (
    <main className="min-h-screen bg-[#fffdf8] px-4 py-6 text-black sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        {notice && (
          <div role="status" className="mb-5 border border-black px-4 py-3 text-sm">
            {notice}
          </div>
        )}

        <header className="mb-8 max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-black/55">
            <ShoppingBag className="h-4 w-4" /> SALARYMAN services
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Choose your plan</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-black/65">
            Monthly services are billed in USD. In-game items remain available through the game economy.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Membership plans">
          <article className="flex flex-col border border-black bg-white p-5">
            <div className="mb-5 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center border border-black">
                <Check className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-black">FREE</h2>
            </div>
            <p className="text-3xl font-black">$0</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-black/50">Always free</p>
            <p className="mt-5 text-sm leading-relaxed text-black/70">Core SALARYMAN access with no paid subscription.</p>
            <div className="mt-auto pt-6">
              <span className="block border border-black/20 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-black/55">
                Included
              </span>
            </div>
          </article>

          {calllHome && (
            <MembershipCard
              item={calllHome}
              icon={<Phone className="h-4 w-4" />}
              price={calllHome.priceUsd}
              active={features.has("phone_system")}
              loading={false}
              highlighted={false}
              onSubscribe={startCheckout}
            />
          )}

          {pabloAi && (
            <MembershipCard
              item={pabloAi}
              icon={<Crown className="h-4 w-4" />}
              price={pabloAi.priceUsd}
              active={features.has("claw_bot")}
              loading={false}
              highlighted={legacyPrimeView}
              onSubscribe={startCheckout}
            />
          )}

          <article className="flex flex-col border border-black bg-white p-5">
            <div className="mb-5 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center border border-black">
                <Sparkles className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-black">CUSTOM</h2>
            </div>
            <p className="text-2xl font-black">Client-specific</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-black/50">Terms set for each client</p>
            <p className="mt-5 text-sm leading-relaxed text-black/70">A tailored plan for organizations with specific needs. Contact SALARYMAN for details.</p>
            <div className="mt-auto pt-6">
              <span className="block border border-black/20 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-black/55">
                Custom terms
              </span>
            </div>
          </article>
        </section>

        <p className="mt-6 text-xs leading-relaxed text-black/55">
          Subscriptions renew monthly. Existing subscriptions and completed purchases are unchanged.
        </p>
      </div>
    </main>
  );
}

function MembershipCard({
  item,
  icon,
  price,
  active,
  loading,
  highlighted,
  onSubscribe,
}: {
  item: MembershipItem;
  icon: ReactNode;
  price: number;
  active: boolean;
  loading: boolean;
  highlighted: boolean;
  onSubscribe: () => void;
}) {
  const copy = PLAN_COPY[item.subscriptionFeature];
  const displayName = item.subscriptionFeature === "claw_bot" ? "PABLO AI" : item.name;

  return (
    <article className={`flex flex-col border border-black bg-white p-5 ${highlighted ? "ring-2 ring-black ring-offset-2" : ""}`}>
      <div className="mb-5 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center border border-black">{icon}</span>
        <h2 className="text-lg font-black">{displayName}</h2>
      </div>
      <p className="text-3xl font-black">${price}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-black/50">Per month</p>
      <p className="mt-5 text-sm leading-relaxed text-black/70">{copy.summary || item.blurb}</p>
      <ul className="mt-4 space-y-2 text-xs leading-relaxed text-black/75">
        {copy.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {bullet}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-6">
        {active ? (
          <span className="block border border-black bg-black px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-white">
            Active
          </span>
        ) : (
          <button
            type="button"
            onClick={onSubscribe}
            disabled={loading}
            className="flex min-h-11 w-full items-center justify-center gap-2 border border-black bg-black px-4 py-3 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-white hover:text-black disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Opening checkout" : "Subscribe monthly"}
          </button>
        )}
      </div>
    </article>
  );
}
