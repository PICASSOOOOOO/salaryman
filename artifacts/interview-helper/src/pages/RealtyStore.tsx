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
import { ArrowLeft, Cpu, Users, Briefcase, Home, TrendingUp, TrendingDown, Check, Loader2, X } from "lucide-react";
import { useArtAsset } from "@/lib/art";
import { apiFetch } from "@/lib/api-client";
import {
  getOwnedOffice, getOwnedHome, setOwnedPropertyLocal, setFiatBalanceLocal,
  setOwnedCustomizationLocal, getFiatBalanceLocal,
  tierForArtKey, type OwnedProperty,
} from "@/lib/owned-office";
import {
  REALTY_HOMES, REALTY_OFFICES, renovationLaborCost, renovationCrewDays,
  type PropertyTemplate, type PropertyTier,
} from "@/lib/property-catalog";
import { THEME_COLOR_PRESETS, type PropertyCustomization } from "@/gameSystems";

type Kind = "home" | "office";

const PURCHASE_MULTIPLE = 100;     // 100 months of rent
const PURCHASE_MARKUP   = 1.20;    // +20% buyer's premium

// Catalogs derive from the canonical property ladder (property-catalog.ts) so the
// showroom, the owned-office tier map, and the pledge store never drift.
const HOMES = REALTY_HOMES;
const OFFICES = REALTY_OFFICES;

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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Renovation (ƒ labor-cost customization) state.
  const [renovating, setRenovating] = useState<Kind | null>(null);
  const [renoBusy, setRenoBusy] = useState(false);
  const [renoResult, setRenoResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [fiat, setFiat] = useState<number>(() => getFiatBalanceLocal());

  const ownedFor = (kind: Kind) => (kind === "office" ? ownedOffice : ownedHome);

  async function doRenovate(kind: Kind, patch: PropertyCustomization) {
    if (renoBusy) return;
    setRenoBusy(true);
    setRenoResult(null);
    try {
      const slot = parseInt(localStorage.getItem("sm_slot") ?? "0", 10) || 0;
      const res = await apiFetch("api/real-estate/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind, slot, ...patch }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setRenoResult({ ok: false, msg: "Sign in to renovate — redirecting…" });
        setTimeout(() => navigate("/menu"), 1200);
        return;
      }
      if (res.status === 402) {
        setRenoResult({ ok: false, msg: `Not enough ƒ for labor — need ${formatFiat(j.required ?? 0)}, you have ${formatFiat(j.balance ?? 0)}.` });
        return;
      }
      if (res.status === 404) {
        setRenoResult({ ok: false, msg: "No save yet — enter the world and save once, then come back." });
        return;
      }
      if (res.status === 400) {
        setRenoResult({ ok: false, msg: j?.error || "Nothing to renovate." });
        return;
      }
      if (!res.ok || !j?.ok) {
        setRenoResult({ ok: false, msg: j?.error || "Renovation failed." });
        return;
      }
      const cust = (j.customization ?? patch) as PropertyCustomization;
      setOwnedCustomizationLocal(kind, cust);
      if (typeof j.newBalance === "number") { setFiatBalanceLocal(j.newBalance); setFiat(j.newBalance); }
      if (kind === "office") setOwnedOffice((o) => (o ? { ...o, customization: cust } : o));
      else setOwnedHome((h) => (h ? { ...h, customization: cust } : h));
      setRenoResult({
        ok: true,
        msg: j.unchanged ? "No changes — no labor charged." : `Renovation complete — ${formatFiat(j.cost ?? 0)} in labor.`,
      });
    } catch {
      setRenoResult({ ok: false, msg: "Network error — try again." });
    } finally {
      setRenoBusy(false);
    }
  }

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

        {/* MY PROPERTY — renovate owned templates with ƒ labor */}
        {(ownedHome || ownedOffice) && (
          <div className="mb-8" data-testid="my-property-panel">
            <SectionHeader icon={Cpu} title="MY PROPERTY" kana="所有物件" subtitle={`renovate with ƒ labor · you hold ${formatFiat(fiat)}`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {([ownedHome, ownedOffice].filter(Boolean) as OwnedProperty[]).map((p) => (
                <OwnedPropertyCard
                  key={p.kind}
                  owned={p}
                  onRenovate={() => { setRenoResult(null); setRenovating(p.kind); }}
                />
              ))}
            </div>
          </div>
        )}

        {/* HOMES */}
        <SectionHeader icon={Home} title="HOMES" kana="住居" subtitle={`${HOMES.length} models · live to BTC ×${baseMult.toFixed(2)}`} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-8">
          {HOMES.map(p => (
            <PropertyCard key={p.artKey} t={p} baseMult={baseMult} now={t}
              owned={ownedFor(p.kind)}
              onRent={() => { setResult(null); setTarget({ t: p, tenure: "rent" }); }}
              onBuy={() => { setResult(null); setTarget({ t: p, tenure: "own" }); }} />
          ))}
        </div>

        {/* OFFICES */}
        <SectionHeader icon={Briefcase} title="OFFICES" kana="事務所" subtitle={`${OFFICES.length} layouts · scale from apartment to campus`} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {OFFICES.map(p => (
            <PropertyCard key={p.artKey} t={p} baseMult={baseMult} now={t}
              owned={ownedFor(p.kind)}
              onRent={() => { setResult(null); setTarget({ t: p, tenure: "rent" }); }}
              onBuy={() => { setResult(null); setTarget({ t: p, tenure: "own" }); }} />
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

      {renovating && ownedFor(renovating) && (
        <RenovateModal
          owned={ownedFor(renovating)!}
          busy={renoBusy}
          result={renoResult}
          onConfirm={(patch) => doRenovate(renovating, patch)}
          onClose={() => { setRenovating(null); setRenoResult(null); }}
        />
      )}
    </div>
  );
}

/** A compact card for a property the player already owns, with a RENOVATE CTA. */
function OwnedPropertyCard({ owned, onRenovate }: { owned: OwnedProperty; onRenovate: () => void }) {
  const url = useArtAsset(owned.artKey);
  const c = owned.customization;
  return (
    <div className="rounded-lg border border-cyan-400/30 bg-gradient-to-b from-cyan-950/20 to-black overflow-hidden flex">
      <div className="w-28 sm:w-36 shrink-0 bg-black/80 relative overflow-hidden">
        {url ? (
          <img src={url} alt={owned.name} className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-cyan-500/40 text-[9px] tracking-[0.3em]">▌</div>
        )}
        {c?.themeColor && (
          <div className="absolute bottom-1 left-1 w-4 h-4 rounded-full border border-white/40" style={{ background: c.themeColor }} title="theme color" />
        )}
      </div>
      <div className="p-3 flex-1 min-w-0">
        <div className="text-[9px] tracking-[0.3em] text-cyan-400/70" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
          {owned.kind === "office" ? "YOUR OFFICE" : "YOUR HOME"} · {owned.tenure === "own" ? "OWNED" : "LEASED"}
        </div>
        <div className="text-cyan-100 font-bold tracking-[0.15em] text-sm truncate" style={{ fontFamily: "'VT323', monospace" }}>{owned.name}</div>
        <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
          {c?.signage ? `“${c.signage}”` : "no signage"} · {c?.lighting ?? "normal"} light
        </div>
        <button
          type="button"
          onClick={onRenovate}
          className="mt-2 px-3 py-1.5 rounded border border-amber-400/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-100 text-[10px] tracking-[0.25em]"
          data-testid={`renovate-${owned.kind}`}
        >
          RENOVATE ▸
        </button>
      </div>
    </div>
  );
}

/** ƒ labor-cost customization modal — theme color, signage, lighting. */
function RenovateModal({
  owned, busy, result, onConfirm, onClose,
}: {
  owned: OwnedProperty;
  busy: boolean;
  result: { ok: boolean; msg: string } | null;
  onConfirm: (patch: PropertyCustomization) => void;
  onClose: () => void;
}) {
  const cur = owned.customization ?? {};
  const [themeColor, setThemeColor] = useState<string | undefined>(cur.themeColor);
  const [signage, setSignage] = useState<string>(cur.signage ?? "");
  const [lighting, setLighting] = useState<"normal" | "dim" | "bright">(cur.lighting ?? "normal");

  const tier = owned.tier as PropertyTier;
  const cost = renovationLaborCost(tier);
  const crew = renovationCrewDays(tier);

  const dirty =
    themeColor !== cur.themeColor ||
    signage.trim().slice(0, 18) !== (cur.signage ?? "") ||
    lighting !== (cur.lighting ?? "normal");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border-2 border-amber-500/50 bg-gradient-to-b from-amber-950/30 to-black overflow-hidden"
        style={{ boxShadow: "0 0 40px rgba(245,158,11,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-amber-400/20">
          <div>
            <div className="text-[9px] tracking-[0.3em] text-amber-400/70" style={{ fontFamily: "'Share Tech Mono', monospace" }}>RENOVATE · {owned.kind === "office" ? "OFFICE" : "HOME"}</div>
            <div className="text-amber-100 font-bold tracking-[0.15em]" style={{ fontFamily: "'VT323', monospace" }}>{owned.name}</div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded bg-black/70 border border-amber-400/40 text-amber-200 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Theme color */}
          <div>
            <div className="text-[10px] tracking-[0.25em] text-zinc-400 mb-1.5">ACCENT COLOR</div>
            <div className="flex flex-wrap gap-2">
              {THEME_COLOR_PRESETS.map((sw) => {
                const hex = `#${sw.rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
                const active = themeColor?.toLowerCase() === hex;
                return (
                  <button
                    key={sw.name}
                    type="button"
                    onClick={() => setThemeColor(active ? undefined : hex)}
                    title={sw.name}
                    data-testid={`swatch-${sw.name}`}
                    className={`w-7 h-7 rounded-full border-2 ${active ? "border-white scale-110" : "border-white/20"} transition-transform`}
                    style={{ background: hex }}
                  />
                );
              })}
            </div>
          </div>

          {/* Signage */}
          <div>
            <div className="text-[10px] tracking-[0.25em] text-zinc-400 mb-1.5">SIGNAGE <span className="text-zinc-600">(max 18)</span></div>
            <input
              type="text"
              value={signage}
              maxLength={18}
              onChange={(e) => setSignage(e.target.value)}
              placeholder="e.g. PABLO CORP HQ"
              data-testid="renovate-signage"
              className="w-full px-3 py-2 rounded border border-zinc-600/50 bg-black/50 text-amber-100 text-sm tracking-[0.1em] focus:border-amber-400 outline-none"
            />
          </div>

          {/* Lighting */}
          <div>
            <div className="text-[10px] tracking-[0.25em] text-zinc-400 mb-1.5">LIGHTING</div>
            <div className="flex gap-2">
              {(["dim", "normal", "bright"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLighting(l)}
                  data-testid={`lighting-${l}`}
                  className={`flex-1 px-2 py-1.5 rounded border text-[10px] tracking-[0.2em] uppercase ${lighting === l ? "border-amber-400 bg-amber-500/15 text-amber-100" : "border-zinc-600/40 bg-black/40 text-zinc-400 hover:border-zinc-500"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="text-[9px] text-zinc-600 mt-1">Bright +25% power bill · Dim −20% power bill.</div>
          </div>

          {/* Labor cost */}
          <div className="rounded border border-amber-400/40 bg-amber-500/5 px-3 py-2">
            <div className="text-[9px] tracking-[0.3em] text-amber-400/70" style={{ fontFamily: "'Share Tech Mono', monospace" }}>RENOVATION LABOR</div>
            <div className="text-xl font-bold text-amber-100 leading-tight" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{formatFiat(cost)}</div>
            <div className="text-[10px] text-zinc-500">≈ {crew} crew-day{crew === 1 ? "" : "s"} · charged once per commit, no-op is free</div>
          </div>

          {result && (
            <div className={`px-2 py-1.5 rounded text-[11px] leading-snug border ${result.ok ? "border-emerald-400/40 bg-emerald-500/5 text-emerald-200" : "border-red-400/40 bg-red-500/5 text-red-200"}`}>
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
              CLOSE
            </button>
            <button
              type="button"
              onClick={() => onConfirm({ themeColor, signage: signage.trim().slice(0, 18), lighting })}
              disabled={busy || result?.ok || !dirty}
              className="flex-1 px-3 py-2 rounded border border-amber-400/60 bg-amber-500/15 text-amber-100 text-xs tracking-[0.2em] hover:bg-amber-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="renovate-confirm"
            >
              {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> WORKING</> : result?.ok ? <><Check className="w-3.5 h-3.5" /> DONE</> : `COMMIT · ${formatFiat(cost)}`}
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
  t, baseMult, now, owned, onRent, onBuy,
}: {
  t: PropertyTemplate; baseMult: number; now: number;
  owned: OwnedProperty | null;
  onRent: () => void; onBuy: () => void;
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

        {t.pledgeSku && (
          <div className="mb-3 px-2 py-1 rounded border border-amber-400/30 bg-amber-500/5 text-amber-200/80 text-[10px] leading-snug" data-testid={`pledge-note-${t.artKey}`}>
            ★ Also a permanent deed in the Pledge Store — same layout template, owned for real, no rent.
          </div>
        )}

        {/* Live two-price action buttons — RENT/MO and BUY, both ticking */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <PriceButton label="RENT / MO" value={liveRent} accent="pink" onClick={onRent} testid={`rent-${t.artKey}`} />
          <PriceButton label="BUY OUTRIGHT" value={livePurchase} accent="cyan" onClick={onBuy} testid={`buy-${t.artKey}`} />
        </div>

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
