/**
 * /business/marketplace — the BIZ EXCHANGE.
 *
 * Buy, sell, and lease in-game DIGITAL businesses, modelled on the downtown
 * realty showroom (digital property). A business is valued off the monthly
 * income it throws off:
 *   • SALE price  = monthly income × 24  (≈ two years of income)
 *   • LEASE / mo  = monthly income × 0.45 (operating rights)
 *
 * Three surfaces:
 *   1. SHOWROOM   — NPC-stocked catalog you can buy or lease outright.
 *   2. EXCHANGE   — live player-to-player listings (buy).
 *   3. PORTFOLIO  — businesses you own + your own active listings, plus a
 *                   "list a business" form.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, Building2, Store, TrendingUp, Check, Loader2, X, Tag, Briefcase,
  ShoppingCart, Plus, Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";

type Tenure = "own" | "lease";

interface CatalogItem {
  key: string;
  name: string;
  kana: string;
  category: string;
  blurb: string;
  monthlyIncome: number;
  badge: string;
  salePrice: number;
  leasePrice: number;
  saleMultiple: number;
  leaseRate: number;
}

interface Listing {
  id: number;
  sellerName: string;
  title: string;
  description: string;
  listingType: "sale" | "lease";
  category: string;
  priceFiat: number;
  monthlyLeaseFiat: number;
  monthlyIncomeFiat: number;
  status: string;
  artUrl: string | null;
  artStatus: string;
}

interface OwnedBusiness {
  id: string;
  key: string;
  name: string;
  category: string;
  tenure: Tenure;
  monthly: number;
  price: number;
  source: "catalog" | "market";
  acquiredAt: string;
}

function formatFiat(n: number): string {
  return `ƒ${Math.round(n || 0).toLocaleString("en-US")}`;
}

function currentSlot(): number {
  return parseInt(localStorage.getItem("sm_slot") ?? "0", 10) || 0;
}

const CATEGORY_GRADIENTS: Record<string, string> = {
  saas: "from-cyan-900/50 to-black",
  ecommerce: "from-emerald-900/50 to-black",
  content: "from-pink-900/50 to-black",
  agency: "from-amber-900/50 to-black",
  marketplace: "from-violet-900/50 to-black",
  retail: "from-orange-900/50 to-black",
  fintech: "from-teal-900/50 to-black",
  media: "from-rose-900/50 to-black",
  service: "from-blue-900/50 to-black",
};

function gradientFor(cat: string): string {
  return CATEGORY_GRADIENTS[cat] || "from-zinc-800/50 to-black";
}

export default function BusinessMarketplace() {
  const [, navigate] = useLocation();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [owned, setOwned] = useState<OwnedBusiness[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [target, setTarget] = useState<{ item: CatalogItem; tenure: Tenure } | null>(null);
  const [buyTarget, setBuyTarget] = useState<{ listing: Listing; mode: "buy" | "lease" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showList, setShowList] = useState(false);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await apiFetch("api/business-market/catalog");
      if (res.ok) setCatalog((await res.json()).catalog ?? []);
    } catch { /* keep */ }
  }, []);

  const loadListings = useCallback(async () => {
    try {
      const res = await apiFetch("api/business-market/listings");
      if (res.ok) setListings((await res.json()).listings ?? []);
    } catch { /* keep */ }
  }, []);

  const loadMine = useCallback(async () => {
    try {
      const res = await apiFetch(`api/business-market/mine?slot=${currentSlot()}`, { credentials: "include" });
      if (res.ok) {
        const j = await res.json();
        setOwned(j.owned ?? []);
        setMyListings(j.listings ?? []);
      }
    } catch { /* keep */ }
  }, []);

  useEffect(() => {
    void loadCatalog();
    void loadListings();
    void loadMine();
  }, [loadCatalog, loadListings, loadMine]);

  async function doAcquire() {
    if (!target || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch("api/business-market/acquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key: target.item.key, tenure: target.tenure, slot: currentSlot() }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) { setResult({ ok: false, msg: "Sign in to buy or lease — redirecting…" }); setTimeout(() => navigate("/menu"), 1200); return; }
      if (res.status === 402) { setResult({ ok: false, msg: `Not enough ƒ — need ${formatFiat(j.required ?? 0)}, you have ${formatFiat(j.balance ?? 0)}.` }); return; }
      if (res.status === 404) { setResult({ ok: false, msg: "No save yet — enter the world and save once, then come back." }); return; }
      if (!res.ok || !j?.ok) { setResult({ ok: false, msg: j?.error || "Transaction failed." }); return; }
      const verb = target.tenure === "own" ? "Bought" : "Leased";
      setResult({ ok: true, msg: `${verb} ${target.item.name} for ${formatFiat(j.price ?? 0)}.` });
      void loadMine();
    } catch {
      setResult({ ok: false, msg: "Network error — try again." });
    } finally {
      setBusy(false);
    }
  }

  async function doBuyListing() {
    if (!buyTarget || busy) return;
    const { listing, mode } = buyTarget;
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch(`api/business-market/listings/${listing.id}/${mode === "buy" ? "buy" : "lease"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slot: currentSlot() }),
      });
      const j = await res.json().catch(() => ({}));
      const verb = mode === "buy" ? "buy" : "lease";
      if (res.status === 401) { setResult({ ok: false, msg: `Sign in to ${verb} — redirecting…` }); setTimeout(() => navigate("/menu"), 1200); return; }
      if (res.status === 402) { setResult({ ok: false, msg: `Not enough ƒ — need ${formatFiat(j.required ?? 0)}, you have ${formatFiat(j.balance ?? 0)}.` }); return; }
      if (res.status === 404) { setResult({ ok: false, msg: "No save yet — enter the world and save once, then come back." }); return; }
      if (!res.ok || !j?.ok) { setResult({ ok: false, msg: j?.error || "Transaction failed." }); return; }
      setResult({ ok: true, msg: `${mode === "buy" ? "Bought" : "Leased"} ${listing.title} for ${formatFiat(j.price ?? 0)}.` });
      void loadListings();
      void loadMine();
    } catch {
      setResult({ ok: false, msg: "Network error — try again." });
    } finally {
      setBusy(false);
    }
  }

  async function cancelListing(id: number) {
    try {
      await apiFetch(`api/business-market/listings/${id}/cancel`, { method: "POST", credentials: "include" });
      void loadMine();
      void loadListings();
    } catch { /* ignore */ }
  }

  return (
    <div className="min-h-screen bg-black text-zinc-200 relative">
      <header className="px-4 sm:px-6 pt-4 pb-3 flex items-center justify-between border-b border-cyan-500/20 gap-3">
        <button
          type="button"
          onClick={() => navigate("/business")}
          className="text-cyan-200 text-[10px] tracking-[0.4em] hover:text-white flex items-center gap-2 shrink-0"
          data-testid="biz-market-back"
        >
          <ArrowLeft className="w-3 h-3" /> BUSINESS
        </button>
        <div className="text-cyan-300 text-xs sm:text-sm tracking-[0.3em] sm:tracking-[0.5em] text-center" style={{ fontFamily: "var(--font-sans)" }}>
          ▌ BIZ EXCHANGE <span className="text-pink-400">事業取引</span> ▌
        </div>
        <button
          type="button"
          onClick={() => { setResult(null); setShowList(true); }}
          className="px-3 py-1.5 rounded border border-pink-400/50 bg-pink-500/10 hover:bg-pink-500/20 text-pink-100 text-[10px] tracking-[0.3em] shrink-0 flex items-center gap-1.5"
          data-testid="biz-list-open"
        >
          <Plus className="w-3 h-3" /> LIST A BUSINESS
        </button>
      </header>

      <div className="px-4 sm:px-12 py-6 sm:py-8 max-w-7xl mx-auto">
        <div className="mb-5 text-zinc-400 text-sm max-w-2xl leading-snug">
          Buy, sell, and lease digital businesses — valued like digital property.
          A business is priced on the income it throws off:
          <span className="text-cyan-300"> sale = 24× monthly income</span>,
          <span className="text-pink-300"> lease = 45% of monthly income / mo</span>.
        </div>

        {/* SHOWROOM */}
        <SectionHeader icon={Store} title="SHOWROOM" kana="ショールーム" subtitle={`${catalog.length} businesses · buy or lease`} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-8">
          {catalog.map((c) => (
            <div key={c.key} className={`rounded-xl border border-cyan-500/20 bg-gradient-to-b ${gradientFor(c.category)} overflow-hidden flex flex-col`} data-testid={`biz-catalog-${c.key}`}>
              <div className="aspect-video w-full flex items-center justify-center relative">
                <Building2 className="w-12 h-12 text-cyan-300/40" />
                <span className="absolute top-2 left-2 text-[9px] tracking-[0.3em] text-cyan-200/70 px-1.5 py-0.5 rounded bg-black/50 border border-cyan-400/30">{c.badge}</span>
                <span className="absolute top-2 right-2 text-[9px] tracking-[0.2em] text-pink-200/70 uppercase">{c.category}</span>
              </div>
              <div className="p-3 flex flex-col flex-1">
                <div className="text-cyan-100 font-bold tracking-[0.15em] text-sm" style={{ fontFamily: "var(--font-sans)" }}>{c.name}</div>
                <div className="text-[10px] text-zinc-500 mb-1">{c.kana}</div>
                <div className="text-zinc-400 text-[11px] leading-snug mb-2 flex-1">{c.blurb}</div>
                <div className="text-[10px] text-emerald-300 tracking-wide mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> {formatFiat(c.monthlyIncome)} / mo income
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setResult(null); setTarget({ item: c, tenure: "own" }); }}
                    className="flex-1 px-2 py-1.5 rounded border border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 text-[10px] tracking-[0.2em]"
                    data-testid={`biz-buy-${c.key}`}
                  >
                    BUY {formatFiat(c.salePrice)}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setResult(null); setTarget({ item: c, tenure: "lease" }); }}
                    className="flex-1 px-2 py-1.5 rounded border border-pink-400/50 bg-pink-500/10 hover:bg-pink-500/20 text-pink-100 text-[10px] tracking-[0.2em]"
                    data-testid={`biz-lease-${c.key}`}
                  >
                    LEASE {formatFiat(c.leasePrice)}/mo
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* EXCHANGE — player listings */}
        <SectionHeader icon={Tag} title="EXCHANGE" kana="取引所" subtitle={`${listings.length} live player listings`} />
        {listings.length === 0 ? (
          <div className="text-zinc-600 text-xs tracking-wide mb-8 px-3 py-6 border border-dashed border-zinc-700/50 rounded text-center">
            No player listings yet. Be the first — list a business above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-8">
            {listings.map((l) => (
              <div key={l.id} className={`rounded-xl border border-pink-500/20 bg-gradient-to-b ${gradientFor(l.category)} overflow-hidden flex flex-col`} data-testid={`biz-listing-${l.id}`}>
                <div className="aspect-video w-full overflow-hidden bg-black/70 relative flex items-center justify-center">
                  {l.artUrl ? (
                    <img src={l.artUrl} alt={l.title} className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} draggable={false} />
                  ) : (
                    <Building2 className="w-12 h-12 text-pink-300/40" />
                  )}
                  <span className="absolute top-2 right-2 text-[9px] tracking-[0.2em] text-pink-200/70 uppercase">{l.category}</span>
                </div>
                <div className="p-3 flex flex-col flex-1">
                  <div className="text-pink-100 font-bold tracking-[0.15em] text-sm" style={{ fontFamily: "var(--font-sans)" }}>{l.title}</div>
                  <div className="text-[10px] text-zinc-500 mb-1">by {l.sellerName}</div>
                  <div className="text-zinc-400 text-[11px] leading-snug mb-2 flex-1 line-clamp-3">{l.description || "—"}</div>
                  {l.monthlyIncomeFiat > 0 && (
                    <div className="text-[10px] text-emerald-300 tracking-wide mb-2 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> {formatFiat(l.monthlyIncomeFiat)} / mo income
                    </div>
                  )}
                  {l.listingType === "sale" ? (
                    <button
                      type="button"
                      onClick={() => { setResult(null); setBuyTarget({ listing: l, mode: "buy" }); }}
                      className="px-2 py-1.5 rounded border border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 text-[10px] tracking-[0.2em] flex items-center justify-center gap-1.5"
                      data-testid={`biz-listing-buy-${l.id}`}
                    >
                      <ShoppingCart className="w-3 h-3" /> BUY {formatFiat(l.priceFiat)}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setResult(null); setBuyTarget({ listing: l, mode: "lease" }); }}
                      className="px-2 py-1.5 rounded border border-pink-400/50 bg-pink-500/10 hover:bg-pink-500/20 text-pink-100 text-[10px] tracking-[0.2em] flex items-center justify-center gap-1.5"
                      data-testid={`biz-listing-lease-${l.id}`}
                    >
                      <ShoppingCart className="w-3 h-3" /> LEASE {formatFiat(l.monthlyLeaseFiat)}/mo
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PORTFOLIO */}
        <SectionHeader icon={Briefcase} title="MY PORTFOLIO" kana="ポートフォリオ" subtitle={`${owned.length} owned · ${myListings.length} listed`} />
        <Link href="/business/floor-plans" className="mb-3 flex items-center justify-between border border-cyan-400/30 bg-cyan-400/5 px-4 py-3 text-xs text-cyan-200">
          <span>BUSINESS FLOOR PLANNER · RESTAURANT · MECHANIC · CAFE · CLINIC · MORE</span>
          <span>CUSTOMIZE →</span>
        </Link>
        {owned.length === 0 && myListings.length === 0 ? (
          <div className="text-zinc-600 text-xs tracking-wide px-3 py-6 border border-dashed border-zinc-700/50 rounded text-center">
            You don't own any businesses yet. Buy one from the showroom to start your portfolio.
          </div>
        ) : (
          <div className="space-y-2">
            {owned.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded border border-zinc-700/40 bg-black/40" data-testid={`biz-owned-${b.id}`}>
                <div className="min-w-0">
                  <div className="text-zinc-100 text-sm tracking-wide truncate">{b.name}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
                    {b.tenure === "own" ? "OWNED" : "LEASED"} · {b.category} · {formatFiat(b.monthly)}/mo income
                  </div>
                </div>
                <div className="text-cyan-200 text-xs tracking-wide shrink-0">{formatFiat(b.price)}</div>
              </div>
            ))}
            {myListings.map((l) => (
              <div key={`l${l.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded border border-pink-700/40 bg-pink-950/10" data-testid={`biz-mylisting-${l.id}`}>
                <div className="min-w-0">
                  <div className="text-pink-100 text-sm tracking-wide truncate">{l.title}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
                    LISTED · {l.listingType === "sale" ? `${formatFiat(l.priceFiat)} sale` : `${formatFiat(l.monthlyLeaseFiat)}/mo lease`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => cancelListing(l.id)}
                  className="px-2 py-1.5 rounded border border-red-400/40 bg-red-500/5 hover:bg-red-500/15 text-red-200 text-[10px] tracking-[0.2em] flex items-center gap-1.5 shrink-0"
                  data-testid={`biz-cancel-${l.id}`}
                >
                  <Trash2 className="w-3 h-3" /> DELIST
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {target && (
        <AcquireModal
          item={target.item}
          tenure={target.tenure}
          busy={busy}
          result={result}
          onConfirm={doAcquire}
          onClose={() => { setTarget(null); setResult(null); }}
        />
      )}

      {buyTarget && (
        <BuyModal
          listing={buyTarget.listing}
          mode={buyTarget.mode}
          busy={busy}
          result={result}
          onConfirm={doBuyListing}
          onClose={() => { setBuyTarget(null); setResult(null); }}
        />
      )}

      {showList && (
        <ListModal
          onClose={() => { setShowList(false); setResult(null); }}
          onCreated={() => { setShowList(false); void loadListings(); void loadMine(); }}
        />
      )}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, kana, subtitle }: {
  icon: React.ComponentType<{ className?: string }>; title: string; kana: string; subtitle: string;
}) {
  return (
    <div className="flex items-end gap-3 mb-3 border-b border-zinc-800 pb-2">
      <Icon className="w-5 h-5 text-cyan-300" />
      <div className="text-cyan-100 text-lg tracking-[0.2em]" style={{ fontFamily: "var(--font-sans)" }}>
        {title} <span className="text-pink-400 text-sm">{kana}</span>
      </div>
      <div className="text-zinc-500 text-[11px] tracking-wide ml-auto">{subtitle}</div>
    </div>
  );
}

function AcquireModal({ item, tenure, busy, result, onConfirm, onClose }: {
  item: CatalogItem; tenure: Tenure; busy: boolean;
  result: { ok: boolean; msg: string } | null; onConfirm: () => void; onClose: () => void;
}) {
  const price = tenure === "own" ? item.salePrice : item.leasePrice;
  const verb = tenure === "own" ? "BUY OUTRIGHT" : "LEASE MONTHLY";
  return (
    <ModalShell onClose={onClose}>
      <div className={`aspect-video w-full flex items-center justify-center bg-gradient-to-b ${gradientFor(item.category)}`}>
        <Building2 className="w-16 h-16 text-cyan-300/40" />
      </div>
      <div className="p-4">
        <div className="text-cyan-100 font-bold tracking-[0.2em] text-base mb-0.5" style={{ fontFamily: "var(--font-sans)" }}>{item.name}</div>
        <div className="text-zinc-400 text-xs leading-snug mb-3">{item.blurb}</div>
        <div className="rounded border border-cyan-400/40 bg-cyan-500/5 px-3 py-2 mb-3">
          <div className="text-[9px] tracking-[0.3em] text-cyan-400/70">{verb}</div>
          <div className="text-2xl font-bold text-cyan-100 leading-tight">
            {formatFiat(price)}{tenure === "lease" ? <span className="text-sm text-cyan-300/70"> / mo</span> : null}
          </div>
          <div className="text-[10px] text-emerald-300 tracking-wide mt-0.5">{formatFiat(item.monthlyIncome)} / mo income</div>
        </div>
        <ResultRow result={result} />
        <ModalButtons busy={busy} result={result} onClose={onClose} onConfirm={onConfirm}
          confirmLabel={tenure === "own" ? "CONFIRM BUY" : "CONFIRM LEASE"} />
      </div>
    </ModalShell>
  );
}

function BuyModal({ listing, mode, busy, result, onConfirm, onClose }: {
  listing: Listing; mode: "buy" | "lease"; busy: boolean;
  result: { ok: boolean; msg: string } | null; onConfirm: () => void; onClose: () => void;
}) {
  const isLease = mode === "lease";
  const price = isLease ? listing.monthlyLeaseFiat : listing.priceFiat;
  return (
    <ModalShell onClose={onClose}>
      <div className="aspect-video w-full overflow-hidden bg-black/70 flex items-center justify-center">
        {listing.artUrl ? (
          <img src={listing.artUrl} alt={listing.title} className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} draggable={false} />
        ) : (
          <Building2 className="w-16 h-16 text-pink-300/40" />
        )}
      </div>
      <div className="p-4">
        <div className="text-pink-100 font-bold tracking-[0.2em] text-base mb-0.5" style={{ fontFamily: "var(--font-sans)" }}>{listing.title}</div>
        <div className="text-zinc-500 text-[11px] mb-1">by {listing.sellerName} · {listing.category}</div>
        <div className="text-zinc-400 text-xs leading-snug mb-3">{listing.description || "—"}</div>
        <div className="rounded border border-cyan-400/40 bg-cyan-500/5 px-3 py-2 mb-3">
          <div className="text-[9px] tracking-[0.3em] text-cyan-400/70">{isLease ? "LEASE MONTHLY" : "BUY OUTRIGHT"}</div>
          <div className="text-2xl font-bold text-cyan-100 leading-tight">
            {formatFiat(price)}{isLease ? <span className="text-sm text-cyan-300/70"> / mo</span> : null}
          </div>
          {listing.monthlyIncomeFiat > 0 && (
            <div className="text-[10px] text-emerald-300 tracking-wide mt-0.5">{formatFiat(listing.monthlyIncomeFiat)} / mo income</div>
          )}
        </div>
        <ResultRow result={result} />
        <ModalButtons busy={busy} result={result} onClose={onClose} onConfirm={onConfirm} confirmLabel={isLease ? "CONFIRM LEASE" : "CONFIRM BUY"} />
      </div>
    </ModalShell>
  );
}

const LIST_CATEGORIES = ["saas", "ecommerce", "content", "agency", "marketplace", "retail", "fintech", "media", "service"];

function ListModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listingType, setListingType] = useState<"sale" | "lease">("sale");
  const [category, setCategory] = useState("saas");
  const [priceFiat, setPriceFiat] = useState("");
  const [monthlyLeaseFiat, setMonthlyLeaseFiat] = useState("");
  const [monthlyIncomeFiat, setMonthlyIncomeFiat] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = useMemo(() => {
    if (title.trim().length < 2) return false;
    if (listingType === "sale") return (parseInt(priceFiat, 10) || 0) > 0;
    return (parseInt(monthlyLeaseFiat, 10) || 0) > 0;
  }, [title, listingType, priceFiat, monthlyLeaseFiat]);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch("api/business-market/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title, description, listingType, category,
          priceFiat: parseInt(priceFiat, 10) || 0,
          monthlyLeaseFiat: parseInt(monthlyLeaseFiat, 10) || 0,
          monthlyIncomeFiat: parseInt(monthlyIncomeFiat, 10) || 0,
          slot: currentSlot(),
        }),
      });
      if (res.status === 401) { setErr("Sign in to list a business."); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j?.error || "Failed to list."); return; }
      onCreated();
    } catch {
      setErr("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full bg-black/60 border border-zinc-700/60 rounded px-2 py-1.5 text-sm text-zinc-100 focus:border-cyan-400/60 outline-none";

  return (
    <ModalShell onClose={onClose}>
      <div className="p-4 max-h-[80vh] overflow-y-auto">
        <div className="text-cyan-100 font-bold tracking-[0.2em] text-base mb-3" style={{ fontFamily: "var(--font-sans)" }}>LIST A BUSINESS</div>

        <div className="space-y-2.5">
          <div>
            <label className="text-[10px] tracking-[0.2em] text-zinc-400">TITLE</label>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. CAFFEINE TRACKER SAAS" data-testid="biz-list-title" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] text-zinc-400">DESCRIPTION</label>
            <textarea className={`${inputCls} h-16 resize-none`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} placeholder="What does it do? Why is it worth it?" data-testid="biz-list-desc" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] tracking-[0.2em] text-zinc-400">TYPE</label>
              <select className={inputCls} value={listingType} onChange={(e) => setListingType(e.target.value as "sale" | "lease")} data-testid="biz-list-type">
                <option value="sale">FOR SALE</option>
                <option value="lease">FOR LEASE</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] tracking-[0.2em] text-zinc-400">CATEGORY</label>
              <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} data-testid="biz-list-category">
                {LIST_CATEGORIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          {listingType === "sale" ? (
            <div>
              <label className="text-[10px] tracking-[0.2em] text-zinc-400">SALE PRICE (ƒ)</label>
              <input className={inputCls} type="number" min={0} value={priceFiat} onChange={(e) => setPriceFiat(e.target.value)} placeholder="500000" data-testid="biz-list-price" />
            </div>
          ) : (
            <div>
              <label className="text-[10px] tracking-[0.2em] text-zinc-400">MONTHLY LEASE (ƒ / mo)</label>
              <input className={inputCls} type="number" min={0} value={monthlyLeaseFiat} onChange={(e) => setMonthlyLeaseFiat(e.target.value)} placeholder="20000" data-testid="biz-list-lease" />
            </div>
          )}
          <div>
            <label className="text-[10px] tracking-[0.2em] text-zinc-400">MONTHLY INCOME (ƒ / mo, optional)</label>
            <input className={inputCls} type="number" min={0} value={monthlyIncomeFiat} onChange={(e) => setMonthlyIncomeFiat(e.target.value)} placeholder="42000" data-testid="biz-list-income" />
          </div>
        </div>

        {err && <div className="mt-3 px-2 py-1.5 rounded text-[11px] border border-red-400/40 bg-red-500/5 text-red-200">{err}</div>}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onClose} className="flex-1 px-3 py-2 rounded border border-zinc-600/50 bg-black/40 text-zinc-300 text-xs tracking-[0.2em] hover:border-zinc-400" data-testid="biz-list-cancel">CANCEL</button>
          <button type="button" onClick={submit} disabled={!valid || busy}
            className="flex-1 px-3 py-2 rounded border border-pink-400/60 bg-pink-500/15 text-pink-100 text-xs tracking-[0.2em] hover:bg-pink-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="biz-list-submit">
            {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> LISTING</> : "PUBLISH LISTING"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border-2 border-cyan-500/50 bg-gradient-to-b from-cyan-950/40 to-black overflow-hidden relative"
        style={{ boxShadow: "0 0 40px rgba(34,211,238,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute top-2 right-2 z-10 p-1 rounded bg-black/70 border border-cyan-400/40 text-cyan-200 hover:text-white" data-testid="biz-modal-close">
          <X className="w-4 h-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

function ResultRow({ result }: { result: { ok: boolean; msg: string } | null }) {
  if (!result) return null;
  return (
    <div className={`mb-3 px-2 py-1.5 rounded text-[11px] leading-snug border ${result.ok ? "border-emerald-400/40 bg-emerald-500/5 text-emerald-200" : "border-red-400/40 bg-red-500/5 text-red-200"}`}>
      {result.msg}
    </div>
  );
}

function ModalButtons({ busy, result, onClose, onConfirm, confirmLabel }: {
  busy: boolean; result: { ok: boolean; msg: string } | null;
  onClose: () => void; onConfirm: () => void; confirmLabel: string;
}) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onClose} className="flex-1 px-3 py-2 rounded border border-zinc-600/50 bg-black/40 text-zinc-300 text-xs tracking-[0.2em] hover:border-zinc-400" data-testid="biz-acquire-cancel">CANCEL</button>
      <button type="button" onClick={onConfirm} disabled={busy || result?.ok}
        className="flex-1 px-3 py-2 rounded border border-cyan-400/60 bg-cyan-500/15 text-cyan-100 text-xs tracking-[0.2em] hover:bg-cyan-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
        data-testid="biz-acquire-confirm">
        {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> PROCESSING</> : result?.ok ? <><Check className="w-3.5 h-3.5" /> DONE</> : confirmLabel}
      </button>
    </div>
  );
}
