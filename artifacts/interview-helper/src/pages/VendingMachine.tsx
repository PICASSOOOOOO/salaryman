/**
 * Unified SALARYMAN vending machine.
 *
 * One pixel/cyberpunk machine of FLORIN-only (ƒ) cosmetic + homebase slots.
 * Real-money goods (bots/Pixel Agents, subscriptions, pledges) live exclusively
 * in the Pledge Store (/pledge) — this machine never touches USD/Stripe.
 *
 * Usage:
 *   <Route path="/vending"><VendingMachine /></Route>
 *   <VendingMachine onClose={() => setOverlay(false)} />   // in-world overlay
 */

import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Cpu, Users, Briefcase, Home, TrendingUp, TrendingDown } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { apiFetch } from "@/lib/api-client";
import { useArtAsset } from "@/lib/art";
import { getActiveCityName } from "@/lib/city-defs";
import { PowerGoodsGrid } from "./UtilityStation";

type TabId = "homebase" | "cosmetics" | "power";

interface VendingMachineProps {
  onClose?: () => void;
  /** Optional override of the default landing tab. */
  initialTab?: TabId;
}

const TABS: { id: TabId; label: string; sub: string }[] = [
  { id: "homebase",  label: "HOMEBASE",  sub: "住居" },
  { id: "cosmetics", label: "COSMETICS", sub: "装飾" },
  { id: "power",     label: "POWER",     sub: "電力" },
];

export default function VendingMachine({ onClose, initialTab = "cosmetics" }: VendingMachineProps) {
  const [, navigate] = useLocation();
  const machineUrl = useArtAsset("vending_machine_iso");
  const [tab, setTab] = useState<TabId>(initialTab);

  // Context-aware exit: when the machine is opened from the office floor object
  // (`?from=office`) the single exit returns to the OFFICE; otherwise it returns
  // to the player's active city (named, never the generic "WORLD"). In-world
  // overlay usage (`onClose`) just closes back to wherever it was opened.
  const fromOffice =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("from") === "office";
  const exitLabel = fromOffice ? "OFFICE" : getActiveCityName().toUpperCase();
  const exitTo = fromOffice ? "/office" : "/world/play";
  const exit = () => (onClose ? onClose() : navigate(exitTo));

  return (
    <div className="min-h-screen bg-black text-zinc-200 relative overflow-hidden">
      {/* Pink floor reflection (carry over the BotVendingMachine look) */}
      <div
        className="absolute inset-x-0 bottom-0 h-32 pointer-events-none"
        style={{ background: "linear-gradient(0deg, rgba(236,72,153,0.18) 0%, transparent 100%)" }}
      />

      <header className="relative px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={exit}
          className="text-pink-200 text-[10px] tracking-[0.4em] hover:text-white flex items-center gap-2 shrink-0"
          data-testid="vending-back"
        >
          <ArrowLeft className="w-3 h-3" /> {onClose ? "CLOSE" : exitLabel}
        </button>
        <div className="text-pink-300 text-xs sm:text-sm tracking-[0.3em] sm:tracking-[0.5em] text-center" style={{ fontFamily: "'VT323', monospace" }}>
          ▌ PABLO FRESH — VENDING <span className="text-red-400">自販機</span> ▌
        </div>
        <div className="shrink-0 w-[1px]" aria-hidden />
      </header>

      {/* Tab bar */}
      <div className="relative px-4 sm:px-6 mt-2 flex gap-1.5 border-b border-pink-500/20 overflow-x-auto scrollbar-hide">
        {TABS.map(t => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              data-testid={`vending-tab-${t.id}`}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 -mb-px border-b-2 text-[10px] tracking-[0.3em] transition-colors ${
                active
                  ? "border-pink-400 text-pink-200 bg-pink-500/10"
                  : "border-transparent text-pink-200/40 hover:text-pink-200/80"
              }`}
              style={{ fontFamily: "'VT323', monospace" }}
            >
              {t.label}
              <span className="ml-1 text-red-400/70 text-[8px] tracking-[0.2em]">{t.sub}</span>
            </button>
          );
        })}
      </div>

      <div className="relative px-4 sm:px-8 py-5 grid lg:grid-cols-[360px_1fr] gap-6 items-start">
        {/* The machine itself — the same iso art the bot version uses */}
        <div
          className="relative mx-auto w-full max-w-xs aspect-[3/4] rounded-2xl border-2 border-pink-500/50 overflow-hidden bg-gradient-to-b from-pink-950/40 to-black"
          style={{ boxShadow: "0 0 32px rgba(236,72,153,0.4), inset 0 0 32px rgba(0,0,0,0.6)" }}
        >
          {machineUrl ? (
            <img src={machineUrl} alt="Vending Machine" className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-pink-500/60 text-xs tracking-[0.4em]">
              ▌ COMPOSING ▌
            </div>
          )}
          <div
            className="absolute bottom-0 inset-x-0 px-3 py-2 bg-black/85 border-t-2 border-cyan-400/60 text-cyan-200 text-[10px] text-center tracking-[0.25em]"
            style={{ fontFamily: "'VT323', monospace" }}
          >
            ▾ INSERT FLORINS · CHOOSE A SLOT
          </div>
        </div>

        {/* Active tab pane */}
        <div className="min-w-0">
          {tab === "cosmetics" && <CosmeticsTab />}
          {tab === "homebase"  && <HomebaseTab />}
          {tab === "power"     && <PowerGoodsGrid mode="charge" />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── COSMETICS TAB ──────────────────────────────────
// Ported from pages/CosmeticStore.tsx (catalog + balance + inventory + buy/equip).

interface CosmeticItem {
  id: string;
  name: string;
  category: string;
  description: string;
  priceCrypto: number;
  rarity: string;
  colorHex?: string;
  iconEmoji?: string;
}
interface PlayerCosmetic { cosmeticId: string; equipped: boolean }

const RARITY_COLOR: Record<string, string> = {
  common: "#aaaaaa",
  uncommon: "#55cc44",
  rare: "#4488ff",
  epic: "#cc44ff",
  legendary: "#ffaa00",
};

function CosmeticsTab() {
  const { isAuthenticated } = useAuth();
  const [catalog, setCatalog] = useState<CosmeticItem[]>([]);
  const [inventory, setInventory] = useState<PlayerCosmetic[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, bRes] = await Promise.all([
        apiFetch("/api/cosmetics/catalog"),
        isAuthenticated ? apiFetch("/api/cosmetics/balance", { credentials: "include" }) : Promise.resolve(null),
      ]);
      if (cRes.ok) setCatalog((await cRes.json()).items ?? []);
      if (bRes?.ok) setBalance((await bRes.json()).balance ?? 0);
      if (isAuthenticated) {
        const invRes = await apiFetch("/api/cosmetics/inventory", { credentials: "include" });
        if (invRes.ok) setInventory((await invRes.json()).inventory ?? []);
      }
    } catch { /* swallow — surface via toast on action */ }
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  const ownedSet = new Set(inventory.map(i => i.cosmeticId));
  const equippedSet = new Set(inventory.filter(i => i.equipped).map(i => i.cosmeticId));

  const handleBuy = async (item: CosmeticItem) => {
    if (!isAuthenticated) { showToast("LOGIN REQUIRED", false); return; }
    setBusyId(item.id);
    try {
      const res = await apiFetch("/api/cosmetics/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cosmeticId: item.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        if (typeof j.newBalance === "number") setBalance(j.newBalance);
        setInventory(prev => [...prev, { cosmeticId: item.id, equipped: false }]);
        showToast(`ACQUIRED · ${item.name.toUpperCase()}`);
      } else if (res.status === 402) {
        showToast("INSUFFICIENT FIAT", false);
      } else if (res.status === 409) {
        showToast("ALREADY OWNED", false);
      } else {
        showToast(j.error ?? "TRANSACTION FAILED", false);
      }
    } catch {
      showToast("NETWORK ERROR", false);
    }
    setBusyId(null);
  };

  const handleEquip = async (item: CosmeticItem, currentlyEquipped: boolean) => {
    if (!isAuthenticated) return;
    setBusyId(item.id);
    try {
      const res = await apiFetch("/api/cosmetics/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cosmeticId: item.id, equipped: !currentlyEquipped }),
      });
      if (res.ok) {
        const newEquipped = !currentlyEquipped;
        setInventory(prev => prev.map(i => {
          if (i.cosmeticId === item.id) return { ...i, equipped: newEquipped };
          // Same-category items get auto-unequipped on the server.
          if (newEquipped) {
            const sameCat = catalog.find(c => c.id === i.cosmeticId)?.category === item.category;
            if (sameCat) return { ...i, equipped: false };
          }
          return i;
        }));
        showToast(newEquipped ? "EQUIPPED" : "UNEQUIPPED");
      } else {
        showToast("EQUIP FAILED", false);
      }
    } catch {
      showToast("NETWORK ERROR", false);
    }
    setBusyId(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] tracking-[0.4em] text-pink-300/70" style={{ fontFamily: "'VT323', monospace" }}>
          ▾ COSMETIC EXCHANGE · SPEND FIAT
        </div>
        <div className="text-[10px] tracking-[0.3em] text-amber-300" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          BAL · ƒ{balance.toLocaleString()}
        </div>
      </div>

      {toast && (
        <div
          className={`mb-3 px-3 py-2 rounded border text-[10px] tracking-[0.25em] ${
            toast.ok
              ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200"
              : "border-red-400/50 bg-red-500/10 text-red-200"
          }`}
          style={{ fontFamily: "'VT323', monospace" }}
        >
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-pink-400" /></div>
      ) : catalog.length === 0 ? (
        <div className="text-pink-300/60 text-xs tracking-[0.2em] py-10 text-center">NO COSMETICS IN STOCK</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {catalog.map(item => {
            const owned = ownedSet.has(item.id);
            const equipped = equippedSet.has(item.id);
            const rarityColor = RARITY_COLOR[item.rarity] ?? "#aaaaaa";
            const canAfford = balance >= item.priceCrypto;
            const busy = busyId === item.id;
            return (
              <div
                key={item.id}
                className="relative rounded-lg border-2 p-3 transition-all"
                style={{
                  borderColor: equipped ? rarityColor : owned ? "rgba(56,189,248,.4)" : "rgba(236,72,153,.4)",
                  background: equipped
                    ? `${rarityColor}14`
                    : owned ? "rgba(56,189,248,.06)" : "rgba(236,72,153,.06)",
                  minHeight: 150,
                }}
                data-testid={`cosmetic-${item.id}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-8 h-8 flex items-center justify-center text-lg rounded"
                    style={{ background: item.colorHex ?? "#222", border: `1px solid ${rarityColor}55` }}
                  >
                    {item.iconEmoji ?? "✦"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-pink-100 text-xs font-bold tracking-widest truncate" style={{ color: rarityColor }}>{item.name}</div>
                    <div className="text-[8px] text-pink-300/60 tracking-[0.2em]">{item.category.toUpperCase()} · {item.rarity.toUpperCase()}</div>
                  </div>
                </div>
                <div className="text-[10px] text-pink-200/70 leading-snug mb-2 line-clamp-3">{item.description}</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-amber-300 tracking-[0.15em]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                    ƒ{item.priceCrypto.toLocaleString()}
                  </div>
                  {owned ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleEquip(item, equipped)}
                      className={`px-2 py-1 rounded border text-[9px] tracking-[0.2em] ${
                        equipped
                          ? "border-red-400/50 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                          : "border-cyan-400/50 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                      }`}
                    >
                      {busy ? "…" : equipped ? "UNEQUIP" : "EQUIP"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !canAfford}
                      onClick={() => handleBuy(item)}
                      className={`px-2 py-1 rounded border text-[9px] tracking-[0.2em] ${
                        canAfford
                          ? "border-pink-400/50 bg-pink-500/15 text-pink-100 hover:bg-pink-500/25"
                          : "border-zinc-700 bg-zinc-900/60 text-zinc-500 cursor-not-allowed"
                      }`}
                    >
                      {busy ? "…" : canAfford ? "BUY" : "LOW ƒ"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── HOMEBASE TAB ───────────────────────────────────
// Catalog drawn from RealtyStore.tsx HOMES + OFFICES. V1 does NOT persist
// purchases — onChooseHomebase(id) is a stub that logs. V3 wires the ledger.

type Kind = "home" | "office";
interface PropertyTemplate {
  artKey: string;
  kind: Kind;
  name: string;
  kana: string;
  blurb: string;
  monthlyRent: number;
  badge: string;
  desks?: number;
  userLimit: number;
  terminals: number;
  perks: string[];
  sqft: number;
}

const HOMES: PropertyTemplate[] = [
  { artKey: "property_loft", kind: "home", name: "STARTER LOFT", kana: "スターター",
    blurb: "One room, one window, no commute. Where every founding story actually starts.",
    monthlyRent: 10_000, badge: "ENTRY", userLimit: 1, terminals: 1,
    perks: ["Solo terminal", "Murphy bed", "Hot plate", "Ground-floor mail slot"], sqft: 320 },
  { artKey: "property_studio", kind: "home", name: "MIDTOWN STUDIO", kana: "ミッドタウン",
    blurb: "Real bedroom, real shower, decent view of the noodle cart on 7th. Quiet enough to think.",
    monthlyRent: 22_000, badge: "STANDARD", userLimit: 2, terminals: 1,
    perks: ["Private terminal nook", "Full bath", "Quiet floor", "Roof access"], sqft: 540 },
  { artKey: "property_townhouse", kind: "home", name: "FAMILY TOWNHOUSE", kana: "タウンハウス",
    blurb: "Three floors, your own door. The neighbours nod and mind their business.",
    monthlyRent: 55_000, badge: "FAMILY", userLimit: 4, terminals: 2,
    perks: ["2 networked terminals", "Garage", "Backyard plot", "School zone"], sqft: 1450 },
  { artKey: "property_penthouse", kind: "home", name: "EXECUTIVE PENTHOUSE", kana: "ペントハウス",
    blurb: "Marble floor, helipad-adjacent. The kind of address you don't print on a business card.",
    monthlyRent: 180_000, badge: "ELITE", userLimit: 6, terminals: 3,
    perks: ["3 terminals + war room", "Concierge", "Helipad access", "Sky garden"], sqft: 3200 },
  { artKey: "property_sky_villa", kind: "home", name: "SKY VILLA", kana: "スカイ・ヴィラ",
    blurb: "Above the cloud layer. The whole city is just a lighting effect from up here.",
    monthlyRent: 450_000, badge: "ULTRA", userLimit: 12, terminals: 6,
    perks: ["6 terminals + screening room", "Private elevator", "Onsen deck", "Drone bay"], sqft: 7400 },
];

const OFFICES: PropertyTemplate[] = [
  { artKey: "property_apartment_office", kind: "office", name: "APARTMENT OFFICE", kana: "アパートメント",
    blurb: "A 2-bedroom on the 14th floor of a residential block — desks against the windows, kettle always on.",
    monthlyRent: 10_000, badge: "ENTRY", desks: 3, userLimit: 4, terminals: 2,
    perks: ["3 desks · 2 terminals", "Residential building", "Kitchenette", "Discreet door"], sqft: 720 },
  { artKey: "property_coworking_suite", kind: "office", name: "CO-WORKING SUITE", kana: "コワーキング",
    blurb: "Glass-walled suite inside a co-working tower. Reception & wifi included; meetings on the hour.",
    monthlyRent: 28_000, badge: "STARTUP", desks: 8, userLimit: 10, terminals: 4,
    perks: ["8 desks · 4 terminals", "Reception included", "Phone booths", "Roof terrace"], sqft: 1300 },
  { artKey: "property_corner_office", kind: "office", name: "CORNER OFFICE", kana: "コーナー",
    blurb: "Floor-to-ceiling glass on two walls. Not subtle. Not supposed to be.",
    monthlyRent: 80_000, badge: "EXEC", desks: 18, userLimit: 22, terminals: 8,
    perks: ["18 desks · 8 terminals", "Glass on two walls", "Espresso bar", "Door that locks"], sqft: 2200 },
  { artKey: "property_warehouse", kind: "office", name: "OPERATIONS WAREHOUSE", kana: "ウェアハウス",
    blurb: "High ceilings, roll-up door, room for forklifts and ambition. Run real ops out of this one.",
    monthlyRent: 160_000, badge: "OPS", desks: 40, userLimit: 48, terminals: 16,
    perks: ["40 desks · 16 terminals", "Loading dock", "Bot-tube hookups", "Heavy-amp power"], sqft: 6800 },
  { artKey: "property_hq_floor", kind: "office", name: "HEADQUARTERS FLOOR", kana: "ヘッドクォーター",
    blurb: "A whole floor of a glass tower. Reception, war rooms, server closets, the works.",
    monthlyRent: 400_000, badge: "HQ", desks: 120, userLimit: 140, terminals: 40,
    perks: ["120 desks · 40 terminals", "Reception + lobby", "8 war rooms", "On-site server closet"], sqft: 18_500 },
  { artKey: "property_tower", kind: "office", name: "PRIVATE TOWER", kana: "プライベート・タワー",
    blurb: "Your name on the lobby. Twelve floors, a cafeteria, helipad on top.",
    monthlyRent: 1_200_000, badge: "TOWER", desks: 480, userLimit: 600, terminals: 160,
    perks: ["480 desks · 160 terminals", "12 floors", "Cafeteria + gym", "Helipad"], sqft: 120_000 },
  { artKey: "property_campus", kind: "office", name: "CORPORATE CAMPUS", kana: "コーポレート・キャンパス",
    blurb: "Three towers around a koi pond. Self-driving shuttles between buildings. A small sovereign nation.",
    monthlyRent: 4_000_000, badge: "CAMPUS", desks: 1800, userLimit: 2400, terminals: 600,
    perks: ["1,800 desks · 600 terminals", "3 towers", "Shuttles + koi pond", "Sub-orbital pad"], sqft: 540_000 },
];

interface MarketIndex { btcUsd: number; multiplier: number; asOf: number; source: string }

function useMarketIndex(): { idx: MarketIndex | null; pct: number } {
  const [idx, setIdx] = useState<MarketIndex | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await apiFetch("api/real-estate/market-index");
        if (!res.ok) return;
        const j = (await res.json()) as MarketIndex;
        if (alive) setIdx(j);
      } catch { /* keep last */ }
    };
    void load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const pct = idx ? (idx.multiplier - 1) * 100 : 0;
  return { idx, pct };
}

// TODO(V3): wire HOMEBASE persistence. This stub logs; the real ledger + the
// localStorage + char.workstation/desk plumbing land in V3 per session_plan.md.
function onChooseHomebase(p: PropertyTemplate) {
  // eslint-disable-next-line no-console
  console.log("[VendingMachine TODO V3] homebase chosen:", { artKey: p.artKey, kind: p.kind, name: p.name });
}

function HomebaseTab() {
  const { idx, pct } = useMarketIndex();
  const baseMult = idx?.multiplier ?? 1;
  const trend = pct >= 0;
  const TrendIcon = trend ? TrendingUp : TrendingDown;
  const trendClr = trend ? "text-emerald-300" : "text-red-300";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] tracking-[0.4em] text-pink-300/70" style={{ fontFamily: "'VT323', monospace" }}>
          ▾ HOMEBASE CATALOG · CHOOSE A LOCATION
        </div>
        <div className={`flex items-center gap-1 text-[10px] tracking-[0.3em] ${trendClr}`}
             title={idx ? `BTC ≈ $${idx.btcUsd.toLocaleString("en-US")} • ${idx.source}` : "loading market…"}>
          <TrendIcon className="w-3 h-3" />
          BTC {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
        </div>
      </div>

      <PropertySection icon={Home} title="HOMES" kana="住居" items={HOMES} baseMult={baseMult} />
      <div className="h-4" />
      <PropertySection icon={Briefcase} title="OFFICES" kana="事務所" items={OFFICES} baseMult={baseMult} />

      <div className="mt-5 px-3 py-2 rounded border border-pink-400/30 bg-black/60 text-pink-200/80 text-xs leading-snug">
        <span className="text-pink-400 mr-2">PABLO:</span>
        "Pick where you live. Every dwelling ships with a terminal. The ledger lands in the next build —
        for now, just stake a claim."
      </div>
    </div>
  );
}

function PropertySection({
  icon: Icon, title, kana, items, baseMult,
}: {
  icon: typeof Home; title: string; kana: string; items: PropertyTemplate[]; baseMult: number;
}) {
  return (
    <div>
      <div className="flex items-end justify-between mb-2 border-b border-pink-500/15 pb-1">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-pink-300" />
          <span className="text-pink-200 text-xs tracking-[0.3em]" style={{ fontFamily: "'VT323', monospace" }}>{title}</span>
          <span className="text-red-400/70 text-[9px] tracking-[0.2em]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            {kana}
          </span>
        </div>
        <span className="text-zinc-500 text-[9px] tracking-[0.3em]">{items.length} models · ×{baseMult.toFixed(2)}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map(p => <PropertyCard key={p.artKey} t={p} baseMult={baseMult} />)}
      </div>
    </div>
  );
}

function PropertyCard({ t, baseMult }: { t: PropertyTemplate; baseMult: number }) {
  const url = useArtAsset(t.artKey);
  const liveRent = Math.round(t.monthlyRent * baseMult);
  return (
    <div
      className="rounded-lg border-2 border-pink-500/40 bg-gradient-to-b from-pink-950/30 to-black overflow-hidden"
      style={{ boxShadow: "0 0 16px rgba(236,72,153,0.15)" }}
      data-testid={`homebase-${t.artKey}`}
    >
      <div className="aspect-video w-full overflow-hidden bg-black/80 relative">
        {url ? (
          <img src={url} alt={t.name} className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-pink-500/50 text-[10px] tracking-[0.4em]">
            ▌ COMPOSING ▌
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 border border-cyan-400/50 text-cyan-200 text-[8px] tracking-[0.3em]">
          {t.badge}
        </div>
        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 border border-pink-400/50 text-pink-200 text-[9px] tracking-[0.2em]">
          {t.sqft.toLocaleString()} sqft
        </div>
      </div>

      <div className="p-2.5">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <div className="text-pink-100 font-bold tracking-[0.2em] text-xs" style={{ fontFamily: "'VT323', monospace" }}>{t.name}</div>
          <div className="text-[10px] text-amber-300" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            ƒ{liveRent.toLocaleString()}/mo
          </div>
        </div>
        <div className="text-pink-200/60 text-[10px] leading-snug mb-2 line-clamp-2">{t.blurb}</div>
        <div className="grid grid-cols-3 gap-1 mb-2">
          {t.desks != null ? (
            <Stat icon={Briefcase} label="DESKS" value={t.desks.toLocaleString()} />
          ) : (
            <Stat icon={Home} label="ROOMS" value={String(Math.max(1, Math.round(t.sqft / 400)))} />
          )}
          <Stat icon={Users} label={t.kind === "office" ? "STAFF" : "BEDS"} value={t.userLimit.toLocaleString()} />
          <Stat icon={Cpu} label="TERMS" value={t.terminals.toLocaleString()} />
        </div>
        <button
          type="button"
          onClick={() => onChooseHomebase(t)}
          data-testid={`homebase-choose-${t.artKey}`}
          className="w-full py-1.5 rounded border border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 text-[10px] tracking-[0.25em]"
          style={{ fontFamily: "'VT323', monospace" }}
        >
          ▸ CHOOSE AS HOMEBASE
        </button>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-1 rounded bg-black/60 border border-cyan-500/15">
      <Icon className="w-3 h-3 text-cyan-300/80 shrink-0" />
      <div className="leading-none">
        <div className="text-cyan-100 text-[10px] font-bold leading-none">{value}</div>
        <div className="text-cyan-500/60 text-[7px] tracking-widest leading-none mt-0.5">{label}</div>
      </div>
    </div>
  );
}
