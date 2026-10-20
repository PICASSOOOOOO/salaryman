import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Check, Crown, Loader2, Phone, ShoppingBag, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePlan, type FeatureKey } from "@/hooks/use-plan";
import { apiFetch } from "@/lib/api-client";

interface MembershipItem {
  id: string;
  name: string;
  blurb: string;
  effect: string;
  priceUsd: number;
  subscriptionFeature: FeatureKey;
}

const PLAN_COPY: Record<FeatureKey, { summary: string; bullets: string[] }> = {
  phone_system: {
    summary: "CALLL HOME's paid Twilio calling service, connected to your CRM.",
    bullets: ["Basic business calling and two-way SMS", "Calls and messages connect to CRM contacts", "Default platform number included; no auto/predictive dialing or SMS marketing"],
  },
  claw_bot: {
    summary: "Pablo AI brings chat and business automation together.",
    bullets: ["Pablo chat with nine specialist agents", "Business workflows and bot chaining", "Live Listen, Screen Scan, and Say This"],
  },
  live_listen: { summary: "", bullets: [] },
  screen_scan: { summary: "", bullets: [] },
  say_this: { summary: "", bullets: [] },
};

export default function PledgeStore() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { features } = usePlan();
  const [items, setItems] = useState<MembershipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [buying, setBuying] = useState<FeatureKey | null>(null);
  const [notice, setNotice] = useState("");
  const legacyPrimeView =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("view") === "prime";

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/pledge/catalog")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load membership plans.");
        const result = await response.json();
        if (!cancelled) {
          setItems((result.items ?? []).filter((item: MembershipItem) => item.subscriptionFeature));
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load plans.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success" || params.get("purchase") === "success") {
      setNotice("Checkout completed. Your purchase is being fulfilled.");
    } else if (params.get("checkout") === "cancel" || params.get("purchase") === "cancel") {
      setNotice("Checkout canceled. No charge was made.");
    }
  }, []);

  const startCheckout = async (feature: FeatureKey) => {
    if (authLoading) {
      setNotice("Restoring your session. Try again in a moment.");
      return;
    }
    if (!isAuthenticated) {
      login(`${window.location.pathname}${window.location.search}`);
      return;
    }
    if (features.has(feature)) {
      setNotice("This monthly plan is already active on your account.");
      return;
    }

    setBuying(feature);
    setNotice("");
    try {
      const response = await apiFetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) {
        throw new Error(result.message || result.error || "Monthly checkout is unavailable.");
      }
      window.location.assign(result.url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Monthly checkout is unavailable.");
      setBuying(null);
    }
  };

  const calllHome = items.find((item) => item.subscriptionFeature === "phone_system");
  const prime = items.find((item) => item.subscriptionFeature === "claw_bot");

  return (
    <main className="min-h-screen bg-[#fffdf8] px-4 py-6 text-black sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        {isAuthenticated && !authLoading && (
          <button
            type="button"
            onClick={() => navigate("/settings")}
            data-testid="button-membership-back-settings"
            className="mb-8 inline-flex min-h-10 items-center gap-2 border border-black px-3 text-xs font-bold uppercase tracking-wider transition-colors hover:bg-black hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Settings
          </button>
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

        {notice && (
          <div role="status" className="mb-5 border border-black px-4 py-3 text-sm">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-44 items-center justify-center" aria-label="Loading plans">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : loadError ? (
          <div role="alert" className="border border-black px-4 py-3 text-sm">{loadError}</div>
        ) : (
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
                loading={buying === "phone_system"}
                highlighted={false}
                onSubscribe={() => startCheckout("phone_system")}
              />
            )}

            {prime && (
              <MembershipCard
                item={prime}
                icon={<Crown className="h-4 w-4" />}
                price={prime.priceUsd}
                active={features.has("claw_bot")}
                loading={buying === "claw_bot"}
                highlighted={legacyPrimeView}
                onSubscribe={() => startCheckout("claw_bot")}
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
              <p className="mt-5 text-sm leading-relaxed text-black/70">A tailored plan for organizations with specific needs, including advanced auto/predictive dialing and SMS marketing. Contact SALARYMAN for terms.</p>
              <div className="mt-auto pt-6">
                <span className="block border border-black/20 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-black/55">
                  Custom terms
                </span>
              </div>
            </article>
          </section>
        )}

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
    <article
      className={`flex flex-col border border-black bg-white p-5 ${highlighted ? "ring-2 ring-black ring-offset-2" : ""}`}
    >
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