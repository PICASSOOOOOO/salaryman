import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch, apiUrl } from "@/lib/api-client";
import { PabloNebula3D } from "@/components/PabloNebula3D";
import Upgrade from "@/pages/Upgrade";
import { usePlan, type FeatureKey } from "@/hooks/use-plan";
import {
  ChevronLeft, Loader2, Check, Sparkles, Crown,
  ShoppingBag, Radio, Ruler, X, Building2, Layers,
} from "lucide-react";

interface BuildingSpec {
  floors: number;
  heightM: number;
  sqft: number;
  footprint: string;
  style: string;
  architect: string;
  materials: string[];
  prestige: number;
  rooms: string[];
  summary: string;
}
interface PledgeItem {
  id: string;
  category: string;
  name: string;
  blurb: string;
  effect: string;
  priceUsd: number;
  icon: string;
  spec?: BuildingSpec;
  limited?: boolean;
  stockTotal?: number;
  stockRemaining?: number;
  soldOut?: boolean;
  subscriptionFeature?: FeatureKey;
  storeAction?: "phone_number_picker";
}
const CATEGORY_LABEL: Record<string, string> = {
  property: "Property",
  bots: "Pixel Agents",
  weapons: "Gear",
  gear: "Armory Gear",
  furniture: "Furniture",
  technology: "Technology",
  office_supplies: "Supplies",
  decor: "Decor",
  skins: "Skins",
  terminals: "Terminals",
  bundles: "Bundles",
  membership: "Membership",
};

// Baked-in product art — one PNG per catalog id (SALARYMAN neon-noir style),
// resolved by item id. Eager glob so the URLs are in the bundle; falls back to
// the emoji icon for any item that has no image yet.
const PLEDGE_IMAGES = import.meta.glob("../assets/pledge/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

// Build an O(1) id -> url map once at module load.
const PLEDGE_IMAGE_BY_ID: Record<string, string> = Object.fromEntries(
  Object.entries(PLEDGE_IMAGES).map(([p, urlStr]) => [
    p.split("/").pop()!.replace(/\.png$/, ""),
    urlStr,
  ]),
);

function pledgeImage(id: string): string | null {
  return PLEDGE_IMAGE_BY_ID[id] ?? null;
}

export default function PledgeStore() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { features } = usePlan();
  const [items, setItems] = useState<PledgeItem[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [schematic, setSchematic] = useState<PledgeItem | null>(null);
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"store" | "prime">(
    typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("view") === "prime"
      ? "prime"
      : "store",
  );

  const switchView = useCallback((next: "store" | "prime") => {
    setView(next);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (next === "prime") params.set("view", "prime");
    else params.delete("view");
    const qs = params.toString();
    window.history.replaceState(null, "", `/pledge${qs ? `?${qs}` : ""}`);
  }, []);

  const load = useCallback(async () => {
    if (authLoading) return;
    try {
      const reqs: Promise<Response>[] = [apiFetch("/api/pledge/catalog")];
      if (isAuthenticated) reqs.push(apiFetch("/api/pledge/owned"));
      const [catRes, ownedRes] = await Promise.all(reqs);
      const cat = await catRes.json();
      setItems(cat.items ?? []);
      if (ownedRes && ownedRes.ok) {
        const o = await ownedRes.json();
        setOwned(new Set<string>(o.itemIds ?? []));
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("purchase") === "success") {
      setNotice("Pledge secured. Your advantage is being unlocked.");
      load();
    } else if (params.get("purchase") === "cancel") {
      setNotice("Checkout canceled — no charge made.");
    }
  }, [load]);

  const buy = async (item: PledgeItem) => {
    if (authLoading) {
      setNotice("Restoring your session — try again in a moment.");
      return;
    }
    if (!isAuthenticated) {
      login(`/pledge${window.location.search}`);
      return;
    }
    if (item.storeAction === "phone_number_picker") {
      navigate("/phone?tab=numbers");
      return;
    }
    setBuying(item.id);
    setNotice("");
    try {
      // Membership listings (PABLO PRIME) are recurring subscriptions — route
      // them to the subscription checkout so billing recurs and the plan
      // feature is granted, rather than the one-time pledge checkout.
      if (item.subscriptionFeature) {
        if (features.has(item.subscriptionFeature)) {
          setNotice(`${item.name} is already active on your account.`);
          return;
        }
        const subRes = await apiFetch("/api/stripe/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feature: item.subscriptionFeature }),
        });
        const subData = await subRes.json();
        if (subData.url) {
          window.location.href = subData.url;
          return;
        }
        setNotice(subData.error || "Could not start checkout — try again.");
        return;
      }
      const res = await apiFetch("/api/pledge/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.granted) {
        setNotice(`${item.name} granted — owner privileges.`);
        setOwned((prev) => new Set(prev).add(item.id));
      } else if (data.error === "sold_out") {
        setNotice(`${item.name} just sold out — this was a limited drop.`);
        load();
      } else {
        setNotice(data.error ?? "Checkout is unavailable right now.");
      }
    } catch {
      setNotice("Network error — try again.");
    } finally {
      setBuying(null);
    }
  };

  const visible = items;

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#03060c] text-zinc-100">
      {/* Pablo nebula energy */}
      <div aria-hidden className="fixed inset-0 z-0 opacity-50 pointer-events-none">
        <PabloNebula3D status="idle" size={typeof window !== "undefined" ? Math.max(window.innerWidth, window.innerHeight) : 1200} />
      </div>
      <div aria-hidden className="fixed inset-0 z-[1] pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(3,6,12,.35) 0%, rgba(3,6,12,.82) 80%)" }} />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate("/office")} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
            <ChevronLeft className="w-4 h-4" /> World
          </button>
          <button onClick={() => navigate("/pablo/deck")} className="flex items-center gap-1.5 text-xs text-emerald-300/80 hover:text-emerald-200 transition-colors">
            <Radio className="w-3.5 h-3.5" /> Command Deck
          </button>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] font-mono uppercase tracking-widest mb-3">
            <ShoppingBag className="w-3 h-3" /> Pledge Store
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Equip your empire.</h1>
          <p className="text-zinc-400 text-sm max-w-xl mx-auto leading-relaxed">
          Buy the services that power your SALARYMAN operation: Phone System access, a custom phone number, or PABLO PRIME. In-world advantages are earned or purchased with FIAT (ƒ) from the game economy.
          </p>
        </div>

        {/* Commerce views only. Agent operations live in /bots. */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
            <button
              onClick={() => switchView("store")}
              className={`px-4 py-1.5 rounded-full text-xs font-mono uppercase tracking-wide transition-colors ${view === "store" ? "bg-amber-500/20 text-amber-200" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <span className="inline-flex items-center gap-1.5"><ShoppingBag className="w-3 h-3" /> Store</span>
            </button>
            <button
              onClick={() => switchView("prime")}
              className={`px-4 py-1.5 rounded-full text-xs font-mono uppercase tracking-wide transition-colors ${view === "prime" ? "bg-emerald-500/20 text-emerald-200" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <span className="inline-flex items-center gap-1.5"><Crown className="w-3 h-3" /> PABLO PRIME</span>
            </button>
          </div>
        </div>

        {notice && (
          <div className="mb-6 px-4 py-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-200 text-sm text-center">
            {notice}
          </div>
        )}

        {view === "store" ? (
        <>
        {/* Catalog grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((item) => {
              const isOwned = owned.has(item.id) ||
                (item.subscriptionFeature ? features.has(item.subscriptionFeature) : false);
              const img = imgFailed[item.id] ? null : pledgeImage(item.id);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col"
                >
                  <div className="relative -mx-4 -mt-4 mb-3 aspect-[4/3] overflow-hidden rounded-t-2xl bg-gradient-to-br from-[#11141b] to-[#06070b]">
                    {img ? (
                      <img
                        src={img}
                        alt={item.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                        onError={() => setImgFailed((m) => ({ ...m, [item.id]: true }))}
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center">
                        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-600">{CATEGORY_LABEL[item.category] ?? item.category}</span>
                        <span className="text-sm font-semibold text-zinc-400">{item.name}</span>
                      </div>
                    )}
                    {isOwned && (
                      <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-black">
                        <Check className="h-3 w-3" /> Owned
                      </span>
                    )}
                    {item.limited && !isOwned && (
                      <span className={`absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${item.soldOut ? "bg-zinc-700/90 text-zinc-300" : "bg-fuchsia-500/90 text-black"}`}>
                        {item.soldOut ? "Sold Out" : "Limited"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{CATEGORY_LABEL[item.category] ?? item.category}</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed mb-1">{item.blurb}</p>
                  <p className="text-[11px] text-emerald-300/70 leading-relaxed mb-3 flex items-start gap-1">
                    <Sparkles className="w-3 h-3 mt-0.5 shrink-0" /> {item.effect}
                  </p>
                  {item.spec && (
                    <button
                      onClick={() => setSchematic(item)}
                      className="mb-3 inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-md border border-sky-400/30 bg-sky-500/10 text-sky-200 text-[10px] font-mono uppercase tracking-widest hover:bg-sky-500/20 transition-colors"
                    >
                      <Ruler className="w-3 h-3" /> View schematics
                    </button>
                  )}
                  {item.limited && !isOwned && (
                    <p className={`text-[11px] font-mono mb-2 ${item.soldOut ? "text-zinc-500" : "text-fuchsia-300/80"}`}>
                      {item.soldOut
                        ? `Sold out — all ${item.stockTotal ?? 0} claimed`
                        : `Only ${item.stockRemaining ?? 0} of ${item.stockTotal ?? 0} left`}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-3">
                    <span className="font-mono text-sm text-zinc-200">${item.priceUsd}</span>
                    {isOwned ? (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold"><Check className="w-3.5 h-3.5" /> Owned</span>
                    ) : item.soldOut ? (
                      <span className="px-4 py-1.5 rounded-lg bg-zinc-800 text-zinc-500 font-semibold text-xs">Sold Out</span>
                    ) : (
                      <button
                        onClick={() => buy(item)}
                        disabled={buying === item.id}
                        className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-semibold text-xs transition-colors flex items-center gap-1.5"
                      >
                        {buying === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : item.storeAction === "phone_number_picker" ? "Choose a number" : item.subscriptionFeature ? "Start membership" : "Get access"}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        </>
        ) : (
          <Upgrade
            embedded
            onPrimeCheckout={() => {
              if (features.has("claw_bot")) {
                setNotice("PABLO PRIME is already active on your account.");
                return;
              }
              const primeItem = items.find((item) => item.id === "membership_pablo_prime");
              if (primeItem) {
                buy(primeItem);
              } else {
                setNotice("PABLO PRIME is still loading — try again in a moment.");
              }
            }}
            primeCheckoutLoading={buying === "membership_pablo_prime"}
          />
        )}

        <p className="text-center text-[10px] text-zinc-600 mt-8 font-mono">
          Purchases are processed securely by PICASSO AI LLC. Phone numbers are provisioned after successful payment.
        </p>
      </div>

      <AnimatePresence>
        {schematic?.spec && (
          <BlueprintModal item={schematic} onClose={() => setSchematic(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Architectural schematic modal ───────────────────────────────────────────
function BlueprintModal({ item, onClose }: { item: PledgeItem; onClose: () => void }) {
  const spec = item.spec!;
  const [heroFailed, setHeroFailed] = useState(false);
  const hero = heroFailed ? null : pledgeImage(item.id);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-sky-400/25 bg-[#060b14] shadow-[0_0_80px_rgba(56,189,248,0.15)]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.05) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 sm:px-7 py-4 border-b border-sky-400/15 bg-[#060b14]/92 backdrop-blur">
          <div>
            <div className="flex items-center gap-2 text-sky-300/80 text-[10px] font-mono uppercase tracking-[0.25em] mb-1">
              <Building2 className="w-3 h-3" /> Architectural Dossier
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-50">{item.name}</h2>
            <p className="text-[11px] text-sky-200/60 font-mono mt-0.5">{spec.architect}</p>
          </div>
          <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-100 hover:border-white/25 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-7">
          {hero ? (
            <div className="mb-6 aspect-[16/9] overflow-hidden rounded-xl border border-sky-400/15 bg-gradient-to-br from-[#11141b] to-[#06070b]">
              <img
                src={hero}
                alt={item.name}
                className="h-full w-full object-cover"
                onError={() => setHeroFailed(true)}
              />
            </div>
          ) : (
            <div className="mb-6 aspect-[16/9] flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-sky-400/15 bg-gradient-to-br from-[#11141b] to-[#06070b] px-4 text-center">
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-sky-300/60">{spec.architect}</span>
              <span className="text-base font-semibold text-zinc-400">{item.name}</span>
            </div>
          )}
          <p className="text-sm text-zinc-300 leading-relaxed mb-6 italic">{spec.summary}</p>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-7">
            <Stat label="Floors" value={spec.floors.toString()} accent />
            <Stat label="Height" value={`${spec.heightM} m`} />
            <Stat label="Floor Area" value={`${spec.sqft.toLocaleString()} ft²`} />
            <Stat label="Footprint" value={spec.footprint} />
          </div>

          {/* Drawings */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5 mb-7">
            <Drawing title="Elevation" icon={<Layers className="w-3 h-3" />}>
              <Elevation floors={spec.floors} />
            </Drawing>
            <Drawing title="Typical Floor Plan" icon={<Ruler className="w-3 h-3" />}>
              <FloorPlan rooms={spec.rooms} />
            </Drawing>
          </div>

          {/* Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-sky-300/70 mb-2">Architecture</h3>
              <p className="text-sm text-zinc-300 mb-3">{spec.style}</p>
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-sky-300/70 mb-2">Materials</h3>
              <ul className="space-y-1">
                {spec.materials.map((m) => (
                  <li key={m} className="text-xs text-zinc-400 flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-sky-400/60" /> {m}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-sky-300/70 mb-2">Prestige Rating</h3>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-amber-300" style={{ width: `${spec.prestige}%` }} />
                </div>
                <span className="font-mono text-sm text-amber-300 tabular-nums">{spec.prestige}</span>
              </div>
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-sky-300/70 mb-2">Spaces</h3>
              <div className="flex flex-wrap gap-1.5">
                {spec.rooms.map((r) => (
                  <span key={r} className="px-2 py-0.5 rounded border border-white/10 bg-white/[0.03] text-[11px] text-zinc-300">{r}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-7 flex items-center justify-between gap-3 pt-4 border-t border-sky-400/15">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Drawing №{item.id.toUpperCase()} · SALARYMAN</span>
            <span className="font-mono text-lg text-amber-300">${item.priceUsd}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${accent ? "border-amber-400/30 bg-amber-500/[0.07]" : "border-white/10 bg-white/[0.03]"}`}>
      <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-0.5">{label}</div>
      <div className={`font-mono text-lg tabular-nums ${accent ? "text-amber-300" : "text-zinc-100"}`}>{value}</div>
    </div>
  );
}

function Drawing({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-sky-400/15 bg-black/30 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-sky-300/70 mb-2">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

// Side elevation — stacked floors, taller buildings literally draw taller.
function Elevation({ floors }: { floors: number }) {
  const W = 200;
  const H = 260;
  const cap = Math.min(floors, 120);
  const drawnFloors = Math.max(1, cap);
  const towerW = floors >= 60 ? 70 : floors >= 3 ? 120 : 150;
  const x = (W - towerW) / 2;
  const groundY = H - 16;
  const topY = 18;
  const usableH = groundY - topY;
  const floorH = usableH / drawnFloors;
  const lines = [];
  const step = drawnFloors > 40 ? Math.ceil(drawnFloors / 40) : 1;
  for (let i = step; i < drawnFloors; i += step) {
    const y = groundY - i * floorH;
    lines.push(<line key={i} x1={x} y1={y} x2={x + towerW} y2={y} stroke="rgba(56,189,248,0.25)" strokeWidth={0.5} />);
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[260px]" role="img" aria-label="Building elevation">
      <line x1={10} y1={groundY} x2={W - 10} y2={groundY} stroke="rgba(56,189,248,0.4)" strokeWidth={1} />
      <rect x={x} y={topY} width={towerW} height={usableH} fill="rgba(56,189,248,0.06)" stroke="rgba(56,189,248,0.55)" strokeWidth={1.2} />
      {lines}
      {/* crown / antenna for supertalls */}
      {floors >= 60 && (
        <line x1={W / 2} y1={topY} x2={W / 2} y2={topY - 10} stroke="rgba(251,191,36,0.8)" strokeWidth={1.5} />
      )}
      <text x={W / 2} y={groundY + 12} textAnchor="middle" className="fill-sky-300/60" style={{ fontSize: 8, fontFamily: "monospace" }}>
        {floors} {floors === 1 ? "FLOOR" : "FLOORS"} · {Math.round((groundY - topY))}u
      </text>
    </svg>
  );
}
// Top-down floor plan — rooms laid out on a grid.
function FloorPlan({ rooms }: { rooms: string[] }) {
  const W = 320;
  const H = 260;
  const pad = 14;
  const cols = rooms.length <= 4 ? 2 : 3;
  const list = rooms.slice(0, cols * 3);
  const total = list.length;
  const rowsCount = Math.ceil(total / cols);
  const cellW = (W - pad * 2) / cols;
  const cellH = (H - pad * 2) / Math.max(rowsCount, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[260px]" role="img" aria-label="Floor plan">
      <rect x={pad - 4} y={pad - 4} width={W - (pad - 4) * 2} height={H - (pad - 4) * 2} fill="none" stroke="rgba(56,189,248,0.5)" strokeWidth={1.4} />
      {list.map((room, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const rx = pad + c * cellW;
        const ry = pad + r * cellH;
        return (
          <g key={room + i}>
            <rect x={rx} y={ry} width={cellW - 4} height={cellH - 4} fill="rgba(56,189,248,0.05)" stroke="rgba(56,189,248,0.3)" strokeWidth={0.8} />
            <text x={rx + (cellW - 4) / 2} y={ry + (cellH - 4) / 2} textAnchor="middle" dominantBaseline="middle" className="fill-zinc-300" style={{ fontSize: 8, fontFamily: "monospace" }}>
              {room}
            </text>
          </g>
        );
      })}
      {/* entry marker */}
      <line x1={W / 2 - 12} y1={H - pad + 2} x2={W / 2 + 12} y2={H - pad + 2} stroke="rgba(251,191,36,0.8)" strokeWidth={2} />
    </svg>
  );
}

