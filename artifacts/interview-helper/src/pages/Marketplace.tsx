import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Archive, ArrowRight, Building2, Car, Check, CircleDollarSign,
  Loader2, MapPin, Package, Plus, Store, Trash2, X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { getCityDef } from "@/lib/city-defs";
import { formatFromUsd, getCityCurrencyCode } from "@/lib/currency";
import { FIAT_PER_USD } from "@/gameSystems";

type Category = "all" | "businesses" | "properties" | "vehicles" | "items";
type Listing = {
  id: string;
  category: Exclude<Category, "all">;
  title: string;
  description: string;
  priceFiat: number;
  cityId: string;
  sourceCityId: string;
  sellerId: string;
  sellerName: string;
  art: string | null;
  listingType: string;
  createdAt: string;
  mine: boolean;
  quantity?: number;
  itemId?: string;
};
type CatalogItem = { id: string; name: string; blurb: string; icon: string; consumable?: boolean };

const ACCENT = "#38bdf8";
const CATEGORIES: Array<{ id: Category; label: string; icon: typeof Store }> = [
  { id: "all", label: "ALL", icon: Store },
  { id: "businesses", label: "BUSINESSES", icon: Building2 },
  { id: "properties", label: "PROPERTIES", icon: Building2 },
  { id: "vehicles", label: "VEHICLES", icon: Car },
  { id: "items", label: "ITEMS", icon: Package },
];

function fiat(n: number) {
  return `ƒ${Math.round(n).toLocaleString()}`;
}

function cityLabel(id: string) {
  return getCityDef(id).name;
}

function localMoney(priceFiat: number, cityId: string) {
  return formatFromUsd(priceFiat / FIAT_PER_USD, { code: getCityCurrencyCode(cityId), maximumFractionDigits: 0 });
}

function categoryRoute(listing: Listing): string {
  if (listing.category === "businesses") return "/business/marketplace";
  if (listing.category === "properties") return "/store/realty";
  if (listing.category === "vehicles") return "/business/services";
  return "/armory/inventory";
}

export default function Marketplace() {
  const [, navigate] = useLocation();
  const [category, setCategory] = useState<Category>("all");
  const [city, setCity] = useState("all");
  const [mine, setMine] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSell, setShowSell] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [itemId, setItemId] = useState("");
  const [slotIndex, setSlotIndex] = useState("0");
  const [quantity, setQuantity] = useState("1");
  const [priceFiat, setPriceFiat] = useState("");
  const [description, setDescription] = useState("");
  const [sellCity, setSellCity] = useState("minx_prime");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ category, city, limit: "100" });
      if (mine) params.set("mine", "1");
      const response = await apiFetch(`/api/marketplace/feed?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Marketplace unavailable");
      setListings(data.listings || []);
      setTotal(Number(data.total || 0));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Marketplace unavailable");
    } finally {
      setLoading(false);
    }
  }, [category, city, mine]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!showSell || catalog.length > 0) return;
    void apiFetch("/api/items/catalog")
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) setCatalog(data.items || []);
      })
      .catch(() => {});
  }, [showSell, catalog.length]);

  const selectedItem = useMemo(() => catalog.find((item) => item.id === itemId), [catalog, itemId]);

  async function createItemListing() {
    setBusy(true);
    setNotice("");
    try {
      const response = await apiFetch("/api/marketplace/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId, slotIndex: Number(slotIndex), quantity: Number(quantity),
          priceFiat: Number(priceFiat), cityId: sellCity, description,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not list item");
      setShowSell(false);
      setNotice("Item listing posted.");
      setItemId(""); setPriceFiat(""); setDescription(""); setQuantity("1");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not list item");
    } finally {
      setBusy(false);
    }
  }

  async function unlist(listing: Listing) {
    const [kind, rawId] = listing.id.split(":");
    const endpoint = kind === "item"
      ? `/api/marketplace/items/${rawId}`
      : kind === "business"
        ? `/api/business-market/listings/${rawId}/cancel`
        : kind === "property"
          ? `/api/real-estate/listings/${rawId}/cancel`
          : null;
    if (!endpoint) return;
    setBusy(true);
    try {
      const response = await apiFetch(endpoint, { method: kind === "item" ? "DELETE" : "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not unlist");
      setNotice("Listing removed.");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not unlist");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-full bg-[#05070b] px-4 py-6 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.3em]" style={{ color: ACCENT }}>
              <CircleDollarSign className="h-4 w-4" /> CROSS-CITY EXCHANGE
            </div>
            <h1 className="font-mono text-2xl font-bold tracking-[0.18em] text-white sm:text-3xl">MARKETPLACE</h1>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-400">
              Real listings from Minx City and Huda City. Prices settle through the existing business,
              property, and rental systems.
            </p>
          </div>
          <button onClick={() => setShowSell(true)} className="inline-flex items-center justify-center gap-2 rounded border px-4 py-2 font-mono text-xs font-bold tracking-wider text-black" style={{ borderColor: ACCENT, background: ACCENT }}>
            <Plus className="h-4 w-4" /> SELL
          </button>
        </header>

        <div className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setCategory(id)} className="inline-flex items-center gap-1.5 rounded border px-3 py-2 font-mono text-[10px] font-bold tracking-wider transition" style={category === id ? { borderColor: ACCENT, color: "#020617", background: ACCENT } : { borderColor: "#1e293b", color: "#94a3b8" }}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">
              <MapPin className="h-3.5 w-3.5" /> CITY
              <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none">
                <option value="all">ALL CITIES</option><option value="minx">MINX CITY</option><option value="huda">HUDA CITY</option>
              </select>
            </label>
            <button onClick={() => setMine((value) => !value)} className="rounded border px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider" style={mine ? { borderColor: "#fbbf24", color: "#fbbf24", background: "#fbbf2414" } : { borderColor: "#334155", color: "#94a3b8" }}>
              {mine ? "YOUR LISTINGS" : "BROWSE ALL"}
            </button>
          </div>
        </div>

        {notice && <div className="mb-4 flex items-center justify-between rounded border border-sky-900 bg-sky-950/40 px-3 py-2 text-xs text-sky-200"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-3.5 w-3.5" /></button></div>}
        {error && <div className="mb-4 rounded border border-rose-900 bg-rose-950/30 px-3 py-3 text-xs text-rose-200">{error} <button className="ml-2 underline" onClick={() => void load()}>Retry</button></div>}
        <div className="mb-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-500">
          <span>{total} {mine ? "of your listings" : "active listings"}</span><span>LIVE · REFRESHES EVERY 30S</span>
        </div>

        {loading ? <div className="flex justify-center py-24 text-slate-500"><Loader2 className="h-7 w-7 animate-spin" /></div> : listings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 py-24 text-center"><Archive className="mx-auto mb-3 h-8 w-8 text-slate-700" /><p className="font-mono text-sm text-slate-400">NO LISTINGS FOUND</p><p className="mt-2 text-xs text-slate-600">Try another category or city.</p></div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {listings.map((listing) => (
              <article key={listing.id} className="group overflow-hidden rounded-lg border border-slate-800 bg-[#0a0f17] transition hover:border-slate-600">
                <div className="flex h-32 items-center justify-center border-b border-slate-800 bg-gradient-to-br from-slate-900 to-[#0a0f17]">
                  {listing.art?.startsWith("http") ? <img src={listing.art} alt="" className="h-full w-full object-cover opacity-80" /> : <span className="text-5xl opacity-70">{listing.category === "vehicles" ? "🚐" : listing.category === "properties" ? "🏢" : listing.category === "items" ? "📦" : "◈"}</span>}
                </div>
                <div className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-3"><div><div className="mb-1 font-mono text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>{listing.category}</div><h2 className="font-semibold text-white">{listing.title}</h2></div><span className="shrink-0 rounded border border-slate-700 px-2 py-1 font-mono text-[9px] text-slate-400">{listing.listingType === "rent" || listing.listingType === "lease" ? "RENT" : "SALE"}</span></div>
                  <p className="mb-4 min-h-8 text-xs leading-relaxed text-slate-400">{listing.description || "No description provided."}</p>
                  <div className="mb-3 flex items-end justify-between"><div><div className="font-mono text-lg font-bold text-emerald-300">{fiat(listing.priceFiat)}<span className="ml-1 text-[10px] font-normal text-slate-500">{listing.listingType === "rent" || listing.listingType === "lease" ? "/ HR / MO" : ""}</span></div><div className="text-[10px] text-slate-500">≈ {localMoney(listing.priceFiat, listing.cityId)} local</div></div>{listing.quantity != null && <span className="text-[10px] text-slate-500">QTY {listing.quantity}</span>}</div>
                  <div className="mb-3 flex items-center justify-between border-t border-slate-800 pt-3 text-[10px] text-slate-500"><span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {cityLabel(listing.cityId)}</span><span>by {listing.sellerName}</span></div>
                  {listing.mine && listing.category !== "vehicles" ? <button onClick={() => void unlist(listing)} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded border border-rose-900 py-2 text-xs font-bold text-rose-300 hover:bg-rose-950/30 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> UNLIST</button> : <button onClick={() => navigate(categoryRoute(listing))} className="flex w-full items-center justify-center gap-2 rounded border border-slate-700 py-2 text-xs font-bold text-slate-300 hover:border-sky-600 hover:text-sky-300"><ArrowRight className="h-3.5 w-3.5" /> {listing.category === "vehicles" ? "RENTAL DESK" : "OPEN MARKET"}</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showSell && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSell(false); }}>
        <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-[#0a0f17] p-5 shadow-2xl">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="font-mono text-lg font-bold tracking-widest text-white">LIST ON EXCHANGE</h2><p className="mt-1 text-xs text-slate-500">Item references are validated against your inventory.</p></div><button onClick={() => setShowSell(false)} className="text-slate-500 hover:text-white"><X /></button></div>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <button className="rounded border border-sky-500 bg-sky-500/10 p-2 text-[10px] font-bold text-sky-300">ITEM</button>
            <button onClick={() => navigate("/business/marketplace")} className="rounded border border-slate-700 p-2 text-[10px] font-bold text-slate-400">BUSINESS</button>
            <button onClick={() => navigate("/store/realty")} className="rounded border border-slate-700 p-2 text-[10px] font-bold text-slate-400">PROPERTY</button>
          </div>
          <div className="space-y-3">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500">Inventory item<select value={itemId} onChange={(e) => setItemId(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"><option value="">Choose an item…</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}</select></label>
            {selectedItem && <div className="rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-400">{selectedItem.blurb}</div>}
            <div className="grid grid-cols-3 gap-3"><label className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Slot<input type="number" min="0" value={slotIndex} onChange={(e) => setSlotIndex(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm text-white" /></label><label className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Quantity<input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm text-white" /></label><label className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Total ƒ<input type="number" min="1" value={priceFiat} onChange={(e) => setPriceFiat(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm text-white" /></label></div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500">City<select value={sellCity} onChange={(e) => setSellCity(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2.5 text-sm text-white"><option value="minx_prime">MINX CITY</option><option value="huda_prime">HUDA CITY</option></select></label>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={selectedItem?.blurb || "Add a note for buyers"} rows={3} className="mt-1 w-full resize-none rounded border border-slate-700 bg-slate-900 p-2.5 text-sm text-white" /></label>
            <button onClick={() => void createItemListing()} disabled={busy || !itemId || !priceFiat} className="flex w-full items-center justify-center gap-2 rounded py-2.5 text-xs font-bold text-black disabled:opacity-40" style={{ background: ACCENT }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} POST ITEM LISTING</button>
          </div>
        </div>
      </div>}
    </main>
  );
}