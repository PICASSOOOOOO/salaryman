/**
 * /store/realty — the downtown real-estate office showroom.
 *
 * Two floors of templates: HOMES (where you live) and OFFICES (where your
 * crew works). Every dwelling ships with at least one terminal — that's what
 * you're really paying for.
 *
 * Pricing model (set by product):
 *   • Each property has a monthly RENT in ƒ (FIAT — never ¥).
 *   • PURCHASE price = rent × 100 × 1.20  (the +20% is the "skip 8.3 years
 *     of rent" buyer's premium).
 *   • Both numbers are scaled live by /api/real-estate/market-index (BTC).
 *   • A 1 Hz client-side wave on top of the server multiplier makes every
 *     price visibly tick every second — so the showroom looks like a live
 *     trading floor. The wave anchors back to the next server sample.
 *
 * Office tour: instead of static stills, each card slow-pans the cover art
 * (Ken Burns) so the player can see the layout while zoomed in. The art is
 * still a Nano Banana frame, but the camera moves through it.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Cpu, Users, Briefcase, Home, TrendingUp, TrendingDown, Check, Loader2, X, Paintbrush } from "lucide-react";
import { useArtAsset } from "@/lib/art";
import { apiFetch } from "@/lib/api-client";
import {
  getOwnedOffice, getOwnedHome, setOwnedPropertyLocal, setFiatBalanceLocal,
  tierForArtKey, type OwnedProperty,
} from "@/lib/owned-office";
import {
  RENOVATION_SWATCHES, LIGHTING_OPTIONS, MAX_SIGNAGE_LEN,
  renovationLaborCost, renovationCrewDays, type LightingMood,
} from "@/lib/property-catalog";

type Kind = "home" | "office";

const PURCHASE_MULTIPLE = 100;     // 100 months of rent
const PURCHASE_MARKUP   = 1.20;    // +20% buyer's premium

interface PropertyTemplate {
  artKey: string;
  kind: Kind;
  name: string;
  kana: string;                  // small katakana label for the Akira flavour
  blurb: string;
  monthlyRent: number;           // ƒ / month before market multiplier
  badge: string;
  desks?: number;
  userLimit: number;
  terminals: number;
  perks: string[];
  sqft: number;
}

// HOMES — entry tier starts at ƒ10,000/mo per product spec.
const HOMES: PropertyTemplate[] = [
  {
    artKey: "property_loft",
    kind: "home",
    name: "STARTER LOFT",
    kana: "スターター",
    blurb: "One room, one window, no commute. Where every founding story actually starts.",
    monthlyRent: 10_000,
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
    kana: "ミッドタウン",
    blurb: "Real bedroom, real shower, decent view of the noodle cart on 7th. Quiet enough to think.",
    monthlyRent: 22_000,
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
    kana: "タウンハウス",
    blurb: "Three floors, your own door. The neighbours nod and mind their business.",
    monthlyRent: 55_000,
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
    kana: "ペントハウス",
    blurb: "Marble floor, helipad-adjacent. The kind of address you don't print on a business card — they already know.",
    monthlyRent: 180_000,
    badge: "ELITE",
    userLimit: 6,
    terminals: 3,
    perks: ["3 terminals + war room", "Concierge", "Helipad access", "Sky garden"],
    sqft: 3200,
  },
  {
    artKey: "property_sky_villa",
    kind: "home",
    name: "SKY VILLA",
    kana: "スカイ・ヴィラ",
    blurb: "Above the cloud layer. The whole city is just a lighting effect from up here.",
    monthlyRent: 450_000,
    badge: "ULTRA",
    userLimit: 12,
    terminals: 6,
    perks: ["6 terminals + screening room", "Private elevator", "Onsen deck", "Drone bay"],
    sqft: 7400,
  },
];

// OFFICES — entry tier is an APARTMENT in a different building (per product:
// "the entry-level office should be an apartment in another building, not
// Shadow"). Then we scale up to a multi-tower campus for big orgs.
const OFFICES: PropertyTemplate[] = [
  {
    artKey: "property_apartment_office",
    kind: "office",
    name: "APARTMENT OFFICE",
    kana: "アパートメント",
    blurb: "A 2-bedroom on the 14th floor of a residential block — desks against the windows, kettle always on.",
    monthlyRent: 10_000,
    badge: "ENTRY",
    desks: 3,
    userLimit: 4,
    terminals: 2,
    perks: ["3 desks · 2 terminals", "Residential building", "Kitchenette", "Discreet door"],
    sqft: 720,
  },
  {
    artKey: "property_coworking_suite",
    kind: "office",
    name: "CO-WORKING SUITE",
    kana: "コワーキング",
    blurb: "Glass-walled suite inside a co-working tower. Reception & wifi included; meetings on the hour.",
    monthlyRent: 28_000,
    badge: "STARTUP",
    desks: 8,
    userLimit: 10,
    terminals: 4,
    perks: ["8 desks · 4 terminals", "Reception included", "Phone booths", "Roof terrace"],
    sqft: 1300,
  },
  {
    artKey: "property_corner_office",
    kind: "office",
    name: "CORNER OFFICE",
    kana: "コーナー",
    blurb: "Floor-to-ceiling glass on two walls. Not subtle. Not supposed to be.",
    monthlyRent: 80_000,
    badge: "EXEC",
    desks: 18,
    userLimit: 22,
    terminals: 8,
    perks: ["18 desks · 8 terminals", "Glass on two walls", "Espresso bar", "Door that locks"],
    sqft: 2200,
  },
  {
    artKey: "property_warehouse",
    kind: "office",
    name: "OPERATIONS WAREHOUSE",
    kana: "ウェアハウス",
    blurb: "High ceilings, roll-up door, room for forklifts and ambition. Run real ops out of this one.",
    monthlyRent: 160_000,
    badge: "OPS",
    desks: 40,
    userLimit: 48,
    terminals: 16,
    perks: ["40 desks · 16 terminals", "Loading dock", "Bot-tube hookups", "Heavy-amp power"],
    sqft: 6800,
  },
  {
    artKey: "property_hq_floor",
    kind: "office",
    name: "HEADQUARTERS FLOOR",
    kana: "ヘッドクォーター",
    blurb: "A whole floor of a glass tower. Reception, war rooms, server closets, the works.",
    monthlyRent: 400_000,
    badge: "HQ",
    desks: 120,
    userLimit: 140,
    terminals: 40,
    perks: ["120 desks · 40 terminals", "Reception + lobby", "8 war rooms", "On-site server closet"],
    sqft: 18_500,
  },
  {
    artKey: "property_tower",
    kind: "office",
    name: "PRIVATE TOWER",
    kana: "プライベート・タワー",
    blurb: "Your name on the lobby. Twelve floors, a cafeteria, helipad on top. The org takes the whole stack.",
    monthlyRent: 1_200_000,
    badge: "TOWER",
    desks: 480,
    userLimit: 600,
    terminals: 160,
    perks: ["480 desks · 160 terminals", "12 floors", "Cafeteria + gym", "Helipad"],
    sqft: 120_000,
  },
  {
    artKey: "property_campus",
    kind: "office",
    name: "CORPORATE CAMPUS",
    kana: "コーポレート・キャンパス",
    blurb: "Three towers around a koi pond. Self-driving shuttles between buildings. A small sovereign nation.",
    monthlyRent: 4_000_000,
    badge: "CAMPUS",
    desks: 1800,
    userLimit: 2400,
    terminals: 600,
    perks: ["1,800 desks · 600 terminals", "3 towers", "Shuttles + koi pond", "Sub-orbital pad"],
    sqft: 540_000,
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
    // 30s server poll keeps us anchored to real BTC; the per-second wave
    // below is just visual breathing in between.
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const pct = idx ? (idx.multiplier - 1) * 100 : 0;
  return { idx, pct };
}

/** 1 Hz tick — drives the per-second price flicker. */
function useTick(intervalMs = 1000): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return t;
}

/** Deterministic small wave so each card breathes a little differently. */
function liveWave(t: number, phase: number): number {
  // Two superposed sines, max amplitude ~±0.6%. Anchored to wall-clock so
  // every visible price drifts visibly each second without ever running away
  // — the next server sample yanks it back to the truth.
  const a = Math.sin(t / 1750 + phase) * 0.004;
  const b = Math.cos(t / 4200 + phase * 1.7) * 0.002;
  return a + b;
}

function hashPhase(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h % 628) / 100; // 0..2π-ish
}

function formatFiat(n: number): string {
  // ƒ-prefixed, comma-grouped, no decimals. NEVER use ¥ — we use FIAT.
  return `ƒ${Math.round(n).toLocaleString("en-US")}`;
}

interface AcquireTarget { t: PropertyTemplate; tenure: "rent" | "own"; }

export default function RealtyStore() {
  const [, navigate] = useLocation();
  const { idx, pct } = useMarketIndex();
  const t = useTick(1000);
  const baseMult = idx?.multiplier ?? 1;

  const [ownedOffice, setOwnedOffice] = useState<OwnedProperty | null>(() => getOwnedOffice());
  const [ownedHome, setOwnedHome] = useState<OwnedProperty | null>(() => getOwnedHome());
  const [target, setTarget] = useState<AcquireTarget | null>(null);
  const [renovating, setRenovating] = useState<{ t: PropertyTemplate; owned: OwnedProperty } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const ownedFor = (kind: Kind) => (kind === "office" ? ownedOffice : ownedHome);

  async function doAcquire() {
    if (!target || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const slot = parseInt(localStorage.getItem("sm_slot") ?? "0", 10) || 0;
      const res = await apiFetch("api/real-estate/acquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ artKey: target.t.artKey, tenure: target.tenure, slot }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setResult({ ok: false, msg: "Sign in to buy or rent — redirecting…" });
        setTimeout(() => navigate("/menu"), 1200);
        return;
      }
      if (res.status === 402) {
        setResult({ ok: false, msg: `Not enough ƒ — need ${formatFiat(j.required ?? 0)}, you have ${formatFiat(j.balance ?? 0)}.` });
        return;
      }
      if (res.status === 404) {
        setResult({ ok: false, msg: "No save yet — enter the world and save once, then come back." });
        return;
      }
      if (!res.ok || !j?.ok) {
        setResult({ ok: false, msg: j?.error || "Transaction failed." });
        return;
      }
      const owned: OwnedProperty = j.owned ?? {
        artKey: target.t.artKey, propertyKey: target.t.artKey, name: target.t.name,
        kind: target.t.kind, tier: tierForArtKey(target.t.artKey), tenure: target.tenure,
        acquiredAt: new Date().toISOString(),
      };
      setOwnedPropertyLocal(owned);
      if (typeof j.newBalance === "number") setFiatBalanceLocal(j.newBalance);
      if (owned.kind === "office") setOwnedOffice(owned); else setOwnedHome(owned);
      const verb = target.tenure === "own" ? "Bought" : "Leased";
      setResult({ ok: true, msg: `${verb} ${target.t.name} for ${formatFiat(j.price ?? 0)}. ${owned.kind === "office" ? "Opening your office…" : "Keys are yours."}` });
      if (owned.kind === "office") setTimeout(() => navigate("/office"), 1400);
    } catch {
      setResult({ ok: false, msg: "Network error — try again." });
    } finally {
      setBusy(false);
    }
  }

  async function doRenovate(reno: { themeColor?: string; signage?: string; lighting?: LightingMood }) {
    if (!renovating || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const slot = parseInt(localStorage.getItem("sm_slot") ?? "0", 10) || 0;
      const res = await apiFetch("api/real-estate/renovate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ artKey: renovating.t.artKey, slot, ...reno }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setResult({ ok: false, msg: "Sign in to renovate — redirecting…" });
        setTimeout(() => navigate("/menu"), 1200);
        return;
      }
      if (res.status === 402) {
        setResult({ ok: false, msg: `Not enough ƒ — labor costs ${formatFiat(j.required ?? 0)}, you have ${formatFiat(j.balance ?? 0)}.` });
        return;
      }
      if (res.status === 403) {
        setResult({ ok: false, msg: "You don't own this property anymore." });
        return;
      }
      if (res.status === 404) {
        setResult({ ok: false, msg: "No save yet — enter the world and save once, then come back." });
        return;
      }
      if (!res.ok || !j?.ok) {
        setResult({ ok: false, msg: j?.error || "Renovation failed." });
        return;
      }
      const owned: OwnedProperty = j.owned ?? { ...renovating.owned, customization: reno };
      setOwnedPropertyLocal(owned);
      if (typeof j.newBalance === "number") setFiatBalanceLocal(j.newBalance);
      if (owned.kind === "office") setOwnedOffice(owned); else setOwnedHome(owned);
      setResult({ ok: true, msg: `Renovated ${renovating.t.name} — ${j.crewDays ?? renovationCrewDays(renovating.t.kind === "office" ? tierForArtKey(renovating.t.artKey) : "capsule")}-day crew, ƒ${(j.laborCost ?? 0).toLocaleString("en-US")} labor deducted.` });
    } catch {
      setResult({ ok: false, msg: "Network error — try again." });
    } finally {
      setBusy(false);
    }
  }

  const trend = pct >= 0;
  const TrendIcon = trend ? TrendingUp : TrendingDown;
  const trendClr = trend ? "text-emerald-300" : "text-red-300";

  return (
    <div className="min-h-screen bg-black text-zinc-200 relative">
      {/* Akira-flavoured CSS — slow Ken Burns "tour" pan, scanlines, glitch */}
      <style>{`
        @keyframes tour-pan {
          0%   { transform: scale(1.18) translate(-3%, -2%); }
          50%  { transform: scale(1.30) translate(4%,  3%); }
          100% { transform: scale(1.18) translate(-3%, -2%); }
        }
        .tour-pan {
          animation: tour-pan 22s ease-in-out infinite;
          will-change: transform;
        }
        .scanlines::after {
          content: "";
          position: absolute; inset: 0; pointer-events: none;
          background: repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,0.04) 0px,
            rgba(255,255,255,0.04) 1px,
            transparent 1px,
            transparent 3px
          );
          mix-blend-mode: overlay;
        }
        @keyframes tick-flash {
          0%   { color: inherit; }
          50%  { color: #f9a8d4; text-shadow: 0 0 8px rgba(244,114,182,0.8); }
          100% { color: inherit; }
        }
        .tick-flash { animation: tick-flash 0.9s ease-out; }
      `}</style>

      <header className="px-4 sm:px-6 pt-4 pb-3 flex items-center justify-between border-b border-pink-500/20 gap-3">
        <button
          type="button"
          onClick={() => navigate("/world/play")}
          className="text-pink-200 text-[10px] tracking-[0.4em] hover:text-white flex items-center gap-2 shrink-0"
        >
          <ArrowLeft className="w-3 h-3" /> WORLD
        </button>
        <div className="text-pink-300 text-xs sm:text-sm tracking-[0.3em] sm:tracking-[0.5em] text-center" style={{ fontFamily: "'VT323', monospace" }}>
          ▌ DOWNTOWN REALTY <span className="text-red-400">不動産</span> ▌
        </div>
        <div className={`flex items-center gap-1 text-[10px] tracking-[0.3em] shrink-0 ${trendClr}`} title={idx ? `BTC ≈ $${idx.btcUsd.toLocaleString("en-US")} • ${idx.source}` : "loading market…"}>
          <TrendIcon className="w-3 h-3" />
          BTC {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
        </div>
      </header>

      {/* Live ticker bar — Akira-style scrolling status */}
      <div className="px-4 sm:px-6 py-2 border-b border-red-500/20 bg-gradient-to-r from-black via-red-950/20 to-black flex items-center justify-between text-[10px] tracking-[0.3em] gap-3">
        <span className="text-red-400" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          市場 LIVE · UPDATING EVERY SECOND
        </span>
        <span className="text-zinc-500 hidden sm:inline">
          INDEX ×{(baseMult * (1 + liveWave(t, 0))).toFixed(4)} · BTC ${idx ? Math.round(idx.btcUsd * (1 + liveWave(t, 1.3))).toLocaleString("en-US") : "—"}
        </span>
        <span className="text-pink-300" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          ƒ{Math.round(10_000 * baseMult * (1 + liveWave(t, 0.4))).toLocaleString("en-US")} / mo · ENTRY
        </span>
      </div>

      <div className="px-4 sm:px-12 py-6 sm:py-8 max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="text-pink-100 text-2xl tracking-[0.2em] mb-1" style={{ fontFamily: "'VT323', monospace" }}>
              PROPERTY <span className="text-red-400">テンプレート</span>
            </div>
            <div className="text-zinc-400 text-sm max-w-xl leading-snug">
              Every dwelling ships with a working terminal. Rent monthly or buy outright — purchase is
              <span className="text-pink-300"> 100 months of rent + 20% premium</span>. Both numbers tick with the
              live BTC index every second.
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
        <SectionHeader icon={Home} title="HOMES" kana="住居" subtitle={`${HOMES.length} models · live to BTC ×${baseMult.toFixed(2)}`} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-8">
          {HOMES.map(p => (
            <PropertyCard key={p.artKey} t={p} baseMult={baseMult} now={t}
              owned={ownedFor(p.kind)}
              onRent={() => { setResult(null); setTarget({ t: p, tenure: "rent" }); }}
              onBuy={() => { setResult(null); setTarget({ t: p, tenure: "own" }); }}
              onRenovate={(o) => { setResult(null); setRenovating({ t: p, owned: o }); }} />
          ))}
        </div>

        {/* OFFICES */}
        <SectionHeader icon={Briefcase} title="OFFICES" kana="事務所" subtitle={`${OFFICES.length} layouts · scale from apartment to campus`} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {OFFICES.map(p => (
            <PropertyCard key={p.artKey} t={p} baseMult={baseMult} now={t}
              owned={ownedFor(p.kind)}
              onRent={() => { setResult(null); setTarget({ t: p, tenure: "rent" }); }}
              onBuy={() => { setResult(null); setTarget({ t: p, tenure: "own" }); }}
              onRenovate={(o) => { setResult(null); setRenovating({ t: p, owned: o }); }} />
          ))}
        </div>

        <div className="mt-8 px-4 py-3 rounded border border-pink-400/30 bg-black/60 text-pink-200/80 text-sm leading-snug max-w-3xl">
          <span className="text-pink-400 mr-2">PABLO:</span>
          "Rent is leverage. Buy is conviction. The ticker doesn't lie — if BTC moves while you're reading, so does
          the price you'll pay. Every owned property can be relisted or sublet from your portfolio."
        </div>
      </div>

      {target && (
        <AcquireModal
          target={target}
          baseMult={baseMult}
          now={t}
          busy={busy}
          result={result}
          owned={ownedFor(target.t.kind)}
          onConfirm={doAcquire}
          onClose={() => { setTarget(null); setResult(null); }}
        />
      )}

      {renovating && (
        <RenovateModal
          t={renovating.t}
          owned={renovating.owned}
          busy={busy}
          result={result}
          onConfirm={doRenovate}
          onClose={() => { setRenovating(null); setResult(null); }}
        />
      )}
    </div>
  );
}

function RenovateModal({
  t, owned, busy, result, onConfirm, onClose,
}: {
  t: PropertyTemplate;
  owned: OwnedProperty;
  busy: boolean;
  result: { ok: boolean; msg: string } | null;
  onConfirm: (reno: { themeColor?: string; signage?: string; lighting?: LightingMood }) => void;
  onClose: () => void;
}) {
  const cur = owned.customization ?? {};
  const [themeColor, setThemeColor] = useState<string | undefined>(cur.themeColor ?? RENOVATION_SWATCHES[0].hex);
  const [lighting, setLighting] = useState<LightingMood>((cur.lighting as LightingMood) ?? "normal");
  const [signage, setSignage] = useState<string>(cur.signage ?? "");

  const tier = tierForArtKey(t.artKey);
  const crewDays = renovationCrewDays(tier);
  const laborCost = renovationLaborCost(tier);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border-2 border-cyan-500/50 bg-gradient-to-b from-cyan-950/40 to-black overflow-hidden"
        style={{ boxShadow: "0 0 40px rgba(34,211,238,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-cyan-500/20">
          <div className="flex items-center gap-2">
            <Paintbrush className="w-4 h-4 text-cyan-300" />
            <span className="text-cyan-100 text-sm tracking-[0.25em]" style={{ fontFamily: "'VT323', monospace" }}>
              RENOVATE — {t.name}
            </span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded bg-black/70 border border-cyan-400/40 text-cyan-200 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Swatch picker */}
          <div>
            <div className="text-[9px] tracking-[0.3em] text-cyan-400/70 mb-1.5" style={{ fontFamily: "'Share Tech Mono', monospace" }}>ACCENT SWATCH</div>
            <div className="flex flex-wrap gap-2">
              {RENOVATION_SWATCHES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  data-testid={`swatch-${s.id}`}
                  onClick={() => setThemeColor(s.hex)}
                  title={s.name}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${themeColor === s.hex ? "border-white scale-110" : "border-black/40 hover:scale-105"}`}
                  style={{ backgroundColor: s.hex }}
                />
              ))}
            </div>
          </div>

          {/* Lighting picker */}
          <div>
            <div className="text-[9px] tracking-[0.3em] text-cyan-400/70 mb-1.5" style={{ fontFamily: "'Share Tech Mono', monospace" }}>LIGHTING</div>
            <div className="grid grid-cols-3 gap-2">
              {LIGHTING_OPTIONS.map(o => (
                <button
                  key={o.id}
                  type="button"
                  data-testid={`lighting-${o.id}`}
                  onClick={() => setLighting(o.id)}
                  className={`px-2 py-1.5 rounded border text-xs tracking-[0.2em] ${lighting === o.id ? "border-cyan-300 bg-cyan-500/20 text-cyan-100" : "border-zinc-600/50 bg-black/40 text-zinc-300 hover:border-cyan-400/60"}`}
                >
                  {o.name}
                </button>
              ))}
            </div>
          </div>

          {/* Signage */}
          <div>
            <div className="text-[9px] tracking-[0.3em] text-cyan-400/70 mb-1.5" style={{ fontFamily: "'Share Tech Mono', monospace" }}>SIGNAGE (optional)</div>
            <input
              type="text"
              data-testid="renovate-signage"
              value={signage}
              maxLength={MAX_SIGNAGE_LEN}
              onChange={(e) => setSignage(e.target.value)}
              placeholder="Banner label…"
              className="w-full px-2 py-1.5 rounded border border-cyan-400/30 bg-black/50 text-cyan-100 text-sm placeholder-zinc-600 focus:outline-none focus:border-cyan-300"
            />
          </div>

          {/* Labor cost */}
          <div className="rounded border border-cyan-400/40 bg-cyan-500/5 px-3 py-2">
            <div className="text-[9px] tracking-[0.3em] text-cyan-400/70" style={{ fontFamily: "'Share Tech Mono', monospace" }}>LABOR — {crewDays}-DAY CREW</div>
            <div className="text-2xl font-bold text-cyan-100 leading-tight" style={{ fontFamily: "'Share Tech Mono', monospace" }} data-testid="renovate-labor-cost">
              {formatFiat(laborCost)}
            </div>
          </div>

          {result && (
            <div className={`px-2 py-1.5 rounded text-[11px] leading-snug border ${result.ok ? "border-emerald-400/40 bg-emerald-500/5 text-emerald-200" : "border-red-400/40 bg-red-500/5 text-red-200"}`} data-testid="renovate-result">
              {result.msg}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 rounded border border-zinc-600/50 bg-black/40 text-zinc-300 text-xs tracking-[0.2em] hover:border-zinc-400"
              data-testid="renovate-cancel"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={() => onConfirm({ themeColor, signage: signage.trim() || undefined, lighting })}
              disabled={busy || result?.ok}
              className="flex-1 px-3 py-2 rounded border border-cyan-400/60 bg-cyan-500/15 text-cyan-100 text-xs tracking-[0.2em] hover:bg-cyan-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="renovate-confirm"
            >
              {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> WORKING</> : result?.ok ? <><Check className="w-3.5 h-3.5" /> DONE</> : "CONFIRM RENOVATION"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AcquireModal({
  target, baseMult, now, busy, result, owned, onConfirm, onClose,
}: {
  target: AcquireTarget;
  baseMult: number;
  now: number;
  busy: boolean;
  result: { ok: boolean; msg: string } | null;
  owned: OwnedProperty | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t, tenure } = target;
  const url = useArtAsset(t.artKey);
  const phase = useMemo(() => hashPhase(t.artKey), [t.artKey]);
  const liveMult = baseMult * (1 + liveWave(now, phase));
  const price = tenure === "own"
    ? t.monthlyRent * PURCHASE_MULTIPLE * PURCHASE_MARKUP * liveMult
    : t.monthlyRent * liveMult;
  const verb = tenure === "own" ? "BUY OUTRIGHT" : "RENT MONTHLY";
  const replacing = owned && owned.artKey !== t.artKey ? owned : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border-2 border-pink-500/50 bg-gradient-to-b from-pink-950/40 to-black overflow-hidden"
        style={{ boxShadow: "0 0 40px rgba(236,72,153,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aspect-video w-full overflow-hidden bg-black/80 relative scanlines">
          {url ? (
            <img src={url} alt={t.name} className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} draggable={false} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-pink-500/50 text-[10px] tracking-[0.4em]">▌ COMPOSING ▌</div>
          )}
          <button type="button" onClick={onClose} className="absolute top-2 right-2 p-1 rounded bg-black/70 border border-pink-400/40 text-pink-200 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          <div className="text-pink-100 font-bold tracking-[0.2em] text-base mb-0.5" style={{ fontFamily: "'VT323', monospace" }}>{t.name}</div>
          <div className="text-zinc-400 text-xs leading-snug mb-3">{t.blurb}</div>

          <div className="rounded border border-cyan-400/40 bg-cyan-500/5 px-3 py-2 mb-3">
            <div className="text-[9px] tracking-[0.3em] text-cyan-400/70" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{verb}</div>
            <div className="text-2xl font-bold text-cyan-100 leading-tight" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
              {formatFiat(price)}{tenure === "rent" ? <span className="text-sm text-cyan-300/70"> / mo</span> : null}
            </div>
            <div className="text-[10px] text-zinc-500 tracking-wide mt-0.5">live · BTC ×{liveMult.toFixed(3)}</div>
          </div>

          {replacing && (
            <div className="mb-3 px-2 py-1.5 rounded border border-amber-400/30 bg-amber-500/5 text-amber-200/80 text-[11px] leading-snug">
              Replaces your current {replacing.kind}: <span className="text-amber-100">{replacing.name}</span> ({replacing.tenure === "own" ? "owned" : "leased"}).
            </div>
          )}

          {result && (
            <div className={`mb-3 px-2 py-1.5 rounded text-[11px] leading-snug border ${result.ok ? "border-emerald-400/40 bg-emerald-500/5 text-emerald-200" : "border-red-400/40 bg-red-500/5 text-red-200"}`}>
              {result.msg}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 rounded border border-zinc-600/50 bg-black/40 text-zinc-300 text-xs tracking-[0.2em] hover:border-zinc-400"
              data-testid="acquire-cancel"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || result?.ok}
              className="flex-1 px-3 py-2 rounded border border-pink-400/60 bg-pink-500/15 text-pink-100 text-xs tracking-[0.2em] hover:bg-pink-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="acquire-confirm"
            >
              {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> PROCESSING</> : result?.ok ? <><Check className="w-3.5 h-3.5" /> DONE</> : `CONFIRM ${tenure === "own" ? "BUY" : "RENT"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, kana, subtitle }: { icon: typeof Home; title: string; kana: string; subtitle: string }) {
  return (
    <div className="flex items-end justify-between mb-3 border-b border-pink-500/15 pb-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-pink-300" />
        <span className="text-pink-200 text-sm tracking-[0.3em]" style={{ fontFamily: "'VT323', monospace" }}>{title}</span>
        <span className="text-red-400/70 text-[10px] tracking-[0.2em]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          {kana}
        </span>
      </div>
      <span className="text-zinc-500 text-[10px] tracking-[0.3em]">{subtitle}</span>
    </div>
  );
}

function PropertyCard({
  t, baseMult, now, owned, onRent, onBuy, onRenovate,
}: {
  t: PropertyTemplate; baseMult: number; now: number;
  owned: OwnedProperty | null;
  onRent: () => void; onBuy: () => void;
  onRenovate: (owned: OwnedProperty) => void;
}) {
  const url = useArtAsset(t.artKey);
  const phase = useMemo(() => hashPhase(t.artKey), [t.artKey]);
  const liveMult = baseMult * (1 + liveWave(now, phase));
  const liveRent = t.monthlyRent * liveMult;
  const livePurchase = t.monthlyRent * PURCHASE_MULTIPLE * PURCHASE_MARKUP * liveMult;
  const isOwned = owned?.artKey === t.artKey;

  return (
    <div
      data-testid={`property-${t.artKey}`}
      className={`text-left rounded-xl border-2 ${isOwned ? "border-emerald-400/70" : "border-pink-500/40"} bg-gradient-to-b from-pink-950/30 to-black overflow-hidden transition-all group`}
      style={{ boxShadow: isOwned ? "0 0 18px rgba(52,211,153,0.25)" : "0 0 18px rgba(236,72,153,0.18)" }}
    >
      {/* Tour viewport — Ken Burns slow pan + zoom on the cover art so the
          player can see the layout while staying close to the details. */}
      <div className="aspect-video w-full overflow-hidden bg-black/80 relative scanlines">
        {url ? (
          <img
            src={url}
            alt={t.name}
            className="tour-pan w-full h-full object-cover"
            style={{ imageRendering: "pixelated" }}
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-pink-500/50 text-[10px] tracking-[0.4em]">
            ▌ COMPOSING ▌
          </div>
        )}
        {/* Akira accent band */}
        <div className="absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-black via-black/80 to-transparent flex items-center justify-between px-2">
          <span className="text-red-400/80 text-[9px] tracking-[0.3em]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            {t.kana}
          </span>
          <span className="text-cyan-300/80 text-[9px] tracking-[0.3em]" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            ▶ LIVE TOUR
          </span>
        </div>
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-cyan-400/50 text-cyan-200 text-[9px] tracking-[0.3em]">
          {t.badge}
        </div>
        {isOwned ? (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-emerald-500/90 border border-emerald-300 text-black text-[10px] font-bold tracking-[0.2em]">
            {owned?.tenure === "own" ? "OWNED" : "LEASED"}
          </div>
        ) : (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/80 border border-pink-400/50 text-pink-200 text-[10px] tracking-[0.2em]">
            {t.sqft.toLocaleString()} sqft
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <div className="text-pink-100 font-bold tracking-[0.2em] text-sm" style={{ fontFamily: "'VT323', monospace" }}>{t.name}</div>
        </div>
        <div className="text-zinc-400 text-xs leading-snug mb-3">{t.blurb}</div>

        {/* Live two-price action buttons — RENT/MO and BUY, both ticking.
            Once OWNED, the card swaps the buy/rent row for a RENOVATE action. */}
        {isOwned && owned ? (
          <button
            type="button"
            onClick={() => onRenovate(owned)}
            data-testid={`renovate-${t.kind}`}
            className="w-full mb-3 px-3 py-2 rounded border border-cyan-400/50 bg-cyan-500/10 text-cyan-100 text-xs tracking-[0.2em] hover:bg-cyan-500/20 hover:border-cyan-300/70 flex items-center justify-center gap-2"
          >
            <Paintbrush className="w-3.5 h-3.5" /> RENOVATE
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <PriceButton label="RENT / MO" value={liveRent} accent="pink" onClick={onRent} testid={`rent-${t.artKey}`} />
            <PriceButton label="BUY OUTRIGHT" value={livePurchase} accent="cyan" onClick={onBuy} testid={`buy-${t.artKey}`} />
          </div>
        )}

        {/* Stat row — desks (offices), capacity, terminals */}
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {t.desks != null ? (
            <Stat icon={Briefcase} label="DESKS" value={t.desks.toLocaleString()} />
          ) : (
            <Stat icon={Home} label="ROOMS" value={String(Math.max(1, Math.round(t.sqft / 400)))} />
          )}
          <Stat icon={Users} label={t.kind === "office" ? "STAFF" : "BEDS"} value={t.userLimit.toLocaleString()} />
          <Stat icon={Cpu} label="TERMS" value={t.terminals.toLocaleString()} />
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
    </div>
  );
}

function PriceButton({ label, value, accent, onClick, testid }: { label: string; value: number; accent: "pink" | "cyan"; onClick: () => void; testid: string }) {
  // Re-key the inner span on each integer change to retrigger the flash
  // animation — gives the visible "live tick" feel.
  const rounded = Math.round(value);
  const cls = accent === "pink"
    ? "border-pink-400/40 bg-pink-500/5 text-pink-100 hover:bg-pink-500/15 hover:border-pink-300/70"
    : "border-cyan-400/40 bg-cyan-500/5 text-cyan-100 hover:bg-cyan-500/15 hover:border-cyan-300/70";
  const labelCls = accent === "pink" ? "text-pink-400/70" : "text-cyan-400/70";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`text-left rounded border ${cls} px-2 py-1.5 transition-colors active:scale-[0.98]`}
    >
      <div className={`text-[8px] tracking-[0.3em] ${labelCls}`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>
        {label}
      </div>
      <div
        key={rounded}
        className="tick-flash text-base font-bold leading-tight"
        style={{ fontFamily: "'Share Tech Mono', monospace" }}
      >
        ƒ{rounded.toLocaleString("en-US")}
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
