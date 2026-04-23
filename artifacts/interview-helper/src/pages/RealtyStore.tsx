/**
 * /store/realty — the downtown real-estate office showroom.
 *
 * Two floors of templates: HOMES (where you live) and OFFICES (where your
 * crew works). Every dwelling ships with at least one terminal — that's what
 * you're really paying for. Office tiers scale by desk count + user limit so
 * the layout decision happens AFTER you have the cash and the deed.
 *
 * Prices are live: the showroom polls /api/real-estate/market-index and
 * multiplies the base sticker by the BTC index. BTC up → real estate up.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Cpu, Users, Briefcase, Home, TrendingUp, TrendingDown } from "lucide-react";
import { useArtAsset } from "@/lib/art";
import { apiFetch } from "@/lib/api-client";

type Kind = "home" | "office";

interface PropertyTemplate {
  artKey: string;
  kind: Kind;
  name: string;
  blurb: string;
  basePrice: number;            // sticker price in ƒ before market multiplier
  badge: string;
  desks?: number;               // offices: workstations included
  userLimit: number;            // max workers (offices) or residents (homes)
  terminals: number;            // every dwelling has ≥1
  perks: string[];              // 3–5 short bullet perks
  sqft: number;
}

const HOMES: PropertyTemplate[] = [
  {
    artKey: "property_loft",
    kind: "home",
    name: "STARTER LOFT",
    blurb: "One room, one window, no commute. Where every founding story actually starts.",
    basePrice: 25,
    badge: "ENTRY",
    userLimit: 1,
    terminals: 1,
    perks: ["Solo terminal", "Murphy bed", "Hot plate", "Ground-floor mail slot"],
    sqft: 320,
  },
  {
    artKey: "property_studio",
    kind: "home",
    name: "MIDTOWN STUDIO",
    blurb: "Real bedroom, real shower, decent view of the noodle cart on 7th. Quiet enough to think.",
    basePrice: 95,
    badge: "STANDARD",
    userLimit: 2,
    terminals: 1,
    perks: ["Private terminal nook", "Full bath", "Quiet floor", "Roof access"],
    sqft: 540,
  },
  {
    artKey: "property_townhouse",
    kind: "home",
    name: "FAMILY TOWNHOUSE",
    blurb: "Three floors, your own door. The neighbours nod and mind their business.",
    basePrice: 320,
    badge: "FAMILY",
    userLimit: 4,
    terminals: 2,
    perks: ["2 networked terminals", "Garage", "Backyard plot", "School zone"],
    sqft: 1450,
  },
  {
    artKey: "property_penthouse",
    kind: "home",
    name: "EXECUTIVE PENTHOUSE",
    blurb: "Marble floor, helipad-adjacent. The kind of address you don't print on a business card — they already know.",
    basePrice: 1200,
    badge: "ELITE",
    userLimit: 6,
    terminals: 3,
    perks: ["3 terminals + private war room", "Concierge", "Helipad access", "Sky garden"],
    sqft: 3200,
  },
];

const OFFICES: PropertyTemplate[] = [
  {
    artKey: "property_kiosk",
    kind: "office",
    name: "STREET KIOSK",
    blurb: "A single stool, a pink-screen terminal, and the entire downtown sidewalk as your foot traffic.",
    basePrice: 40,
    badge: "SOLO",
    desks: 1,
    userLimit: 1,
    terminals: 1,
    perks: ["1 desk", "Curb-side foot traffic", "Cash drawer", "Awning lights"],
    sqft: 80,
  },
  {
    artKey: "property_corner_office",
    kind: "office",
    name: "CORNER OFFICE",
    blurb: "Floor-to-ceiling glass on two walls. Not subtle. Not supposed to be.",
    basePrice: 280,
    badge: "EXEC",
    desks: 6,
    userLimit: 6,
    terminals: 4,
    perks: ["6 desks · 4 terminals", "Glass on two walls", "Espresso bar", "Door that locks"],
    sqft: 850,
  },
  {
    artKey: "property_warehouse",
    kind: "office",
    name: "OPERATIONS WAREHOUSE",
    blurb: "High ceilings, roll-up door, room for forklifts and ambition. Run real ops out of this one.",
    basePrice: 420,
    badge: "OPS",
    desks: 24,
    userLimit: 24,
    terminals: 12,
    perks: ["24 desks · 12 terminals", "Loading dock", "Bot-tube hookups", "Heavy-amp power"],
    sqft: 4200,
  },
  {
    artKey: "property_hq_tower",
    kind: "office",
    name: "HEADQUARTERS TOWER",
    blurb: "A whole floor of a glass tower. Reception, war rooms, server closets, the works.",
    basePrice: 2400,
    badge: "HQ",
    desks: 80,
    userLimit: 80,
    terminals: 32,
    perks: ["80 desks · 32 terminals", "Reception + lobby", "5 war rooms", "On-site server closet"],
    sqft: 14_500,
  },
];

interface MarketIndex {
  btcUsd: number;
  multiplier: number;
  asOf: number;
  source: string;
}

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
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const pct = idx ? (idx.multiplier - 1) * 100 : 0;
  return { idx, pct };
}

function formatFiat(n: number): string {
  // ƒ-prefixed, comma-grouped, no decimals.
  return `ƒ${Math.round(n).toLocaleString("en-US")}`;
}

export default function RealtyStore() {
  const [, navigate] = useLocation();
  const { idx, pct } = useMarketIndex();
  const mult = idx?.multiplier ?? 1;

  const trend = pct >= 0;
  const TrendIcon = trend ? TrendingUp : TrendingDown;
  const trendClr = trend ? "text-emerald-300" : "text-red-300";

  return (
    <div className="min-h-screen bg-black text-zinc-200 relative">
      <header className="px-4 sm:px-6 pt-4 pb-3 flex items-center justify-between border-b border-pink-500/20 gap-3">
        <button
          type="button"
          onClick={() => navigate("/world/play")}
          className="text-pink-200 text-[10px] tracking-[0.4em] hover:text-white flex items-center gap-2 shrink-0"
        >
          <ArrowLeft className="w-3 h-3" /> WORLD
        </button>
        <div className="text-pink-300 text-xs sm:text-sm tracking-[0.3em] sm:tracking-[0.5em] text-center" style={{ fontFamily: "'VT323', monospace" }}>
          ▌ DOWNTOWN REALTY OFFICE ▌
        </div>
        <div className={`flex items-center gap-1 text-[10px] tracking-[0.3em] shrink-0 ${trendClr}`} title={idx ? `BTC ≈ $${idx.btcUsd.toLocaleString("en-US")} • ${idx.source}` : "loading market…"}>
          <TrendIcon className="w-3 h-3" />
          BTC {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
        </div>
      </header>

      <div className="px-4 sm:px-12 py-6 sm:py-8 max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="text-pink-100 text-2xl tracking-[0.2em] mb-1" style={{ fontFamily: "'VT323', monospace" }}>
              PROPERTY TEMPLATES
            </div>
            <div className="text-zinc-400 text-sm max-w-xl leading-snug">
              Every dwelling ships with a working terminal — that's what you're really paying for. Layouts (desk
              positions, perks, hires) get arranged after you take the keys. Prices track BTC live.
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/world/play?focus=realty")}
            className="px-4 py-2 rounded border border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 text-xs tracking-[0.3em] shrink-0"
            data-testid="realty-open-listings"
          >
            VIEW LIVE LISTINGS ▸
          </button>
        </div>

        {/* HOMES */}
        <SectionHeader icon={Home} title="HOMES" subtitle={`${HOMES.length} models · live to BTC index ×${mult.toFixed(2)}`} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-8">
          {HOMES.map(t => (
            <PropertyCard key={t.artKey} t={t} mult={mult} onPick={() => navigate("/world/play?focus=realty")} />
          ))}
        </div>

        {/* OFFICES */}
        <SectionHeader icon={Briefcase} title="OFFICES" subtitle={`${OFFICES.length} layouts · scale by desk count`} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {OFFICES.map(t => (
            <PropertyCard key={t.artKey} t={t} mult={mult} onPick={() => navigate("/world/play?focus=realty")} />
          ))}
        </div>

        <div className="mt-8 px-4 py-3 rounded border border-pink-400/30 bg-black/60 text-pink-200/80 text-sm leading-snug max-w-3xl">
          <span className="text-pink-400 mr-2">PABLO:</span>
          "The address sets the ceiling. Pick small, you stay nimble. Pick big, you grow into it. Pick wrong, you
          sublet — every owned property can be relisted or rented out from your portfolio."
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: typeof Home; title: string; subtitle: string }) {
  return (
    <div className="flex items-end justify-between mb-3 border-b border-pink-500/15 pb-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-pink-300" />
        <span className="text-pink-200 text-sm tracking-[0.3em]" style={{ fontFamily: "'VT323', monospace" }}>{title}</span>
      </div>
      <span className="text-zinc-500 text-[10px] tracking-[0.3em]">{subtitle}</span>
    </div>
  );
}

function PropertyCard({ t, mult, onPick }: { t: PropertyTemplate; mult: number; onPick: () => void }) {
  const url = useArtAsset(t.artKey);
  const livePrice = t.basePrice * mult;
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={`property-${t.artKey}`}
      className="text-left rounded-xl border-2 border-pink-500/40 bg-gradient-to-b from-pink-950/30 to-black overflow-hidden hover:border-pink-400/80 hover:scale-[1.01] transition-all"
      style={{ boxShadow: "0 0 18px rgba(236,72,153,0.18)" }}
    >
      <div className="aspect-video w-full overflow-hidden bg-black/80 relative">
        {url ? (
          <img src={url} alt={t.name} className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-pink-500/50 text-[10px] tracking-[0.4em]">
            ▌ COMPOSING ▌
          </div>
        )}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-cyan-400/50 text-cyan-200 text-[9px] tracking-[0.3em]">
          {t.badge}
        </div>
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/80 border border-pink-400/50 text-pink-200 text-[10px] tracking-[0.2em]">
          FROM {formatFiat(livePrice)}
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <div className="text-pink-100 font-bold tracking-[0.2em] text-sm" style={{ fontFamily: "'VT323', monospace" }}>{t.name}</div>
          <div className="text-zinc-500 text-[10px] tracking-[0.2em] shrink-0">{t.sqft.toLocaleString()} sqft</div>
        </div>
        <div className="text-zinc-400 text-xs leading-snug mb-2">{t.blurb}</div>

        {/* Stat row — desks (offices), capacity, terminals */}
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {t.desks != null ? (
            <Stat icon={Briefcase} label="DESKS" value={String(t.desks)} />
          ) : (
            <Stat icon={Home} label="ROOMS" value={String(Math.max(1, Math.round(t.sqft / 400)))} />
          )}
          <Stat icon={Users} label={t.kind === "office" ? "STAFF" : "BEDS"} value={String(t.userLimit)} />
          <Stat icon={Cpu} label="TERMS" value={String(t.terminals)} />
        </div>

        {/* Perks chips */}
        <div className="flex flex-wrap gap-1">
          {t.perks.slice(0, 4).map(p => (
            <span
              key={p}
              className="px-1.5 py-0.5 rounded bg-pink-500/8 border border-pink-400/20 text-pink-200/80 text-[9px] tracking-wider"
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-1 rounded bg-black/60 border border-cyan-500/15">
      <Icon className="w-3 h-3 text-cyan-300/80 shrink-0" />
      <div className="leading-none">
        <div className="text-cyan-100 text-xs font-bold leading-none">{value}</div>
        <div className="text-cyan-500/60 text-[8px] tracking-widest leading-none mt-0.5">{label}</div>
      </div>
    </div>
  );
}
