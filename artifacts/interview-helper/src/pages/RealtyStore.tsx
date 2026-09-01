import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Check, Loader2, X } from "lucide-react";
import { useLocation } from "wouter";
import {
  SHADOW_TOWER_CITIES, SHADOW_TOWER_LISTINGS, getShadowTowerPlan,
  type ShadowTowerArchetype, type ShadowTowerCity, type ShadowTowerListing,
} from "@workspace/api-zod/shadow-tower";
import { apiFetch } from "@/lib/api-client";

type Tenure = "lease" | "own";
interface Target { listing: ShadowTowerListing; tenure: Tenure; }

const fiat = (value: number) => `ƒ${value.toLocaleString("en-US")}`;
const cityLabel = (city: ShadowTowerCity) => city === "minx_city" ? "MINX CITY" : "HUDA CITY";
const kit = ["Elevator", "Executive room + desk", "Workstations", "Terminal", "ATM", "Vending"];

/** A deterministic, contract-derived preview; every rectangle is a plan object. */
export function ShadowTowerPlanPreview({ archetype, city, floorNumber }: { archetype: ShadowTowerArchetype; city: ShadowTowerCity; floorNumber: number }) {
  const plan = useMemo(() => getShadowTowerPlan(city, floorNumber, archetype), [city, floorNumber, archetype]);
  const color = (kind: string) => kind === "workstation" ? "#38bdf8" : kind === "terminal" ? "#c084fc" : kind === "elevator" ? "#fbbf24" : kind === "atm" ? "#34d399" : kind === "vending_machine" ? "#fb7185" : "#64748b";
  return <svg viewBox={`0 0 ${plan.cols} ${plan.rows}`} className="h-full w-full bg-slate-950" role="img" aria-label={`${archetype} floor plan`}>
    <rect width={plan.cols} height={plan.rows} fill="#090b16" />
    {plan.objects.map(object => <g key={object.id}>
      <rect x={object.footprint.x} y={object.footprint.y} width={object.footprint.cols} height={object.footprint.rows} rx=".15" fill={color(object.kind)} opacity=".82" />
      <rect x={object.footprint.x + .12} y={object.footprint.y + .12} width={Math.max(.1, object.footprint.cols - .24)} height={Math.max(.1, object.footprint.rows - .24)} fill="none" stroke="#e0f2fe" strokeWidth=".08" opacity=".7" />
    </g>)}
    <circle cx={plan.spawn.x + .5} cy={plan.spawn.y + .5} r=".28" fill="#f8fafc" />
  </svg>;
}

export default function RealtyStore() {
  const [, navigate] = useLocation();
  const [city, setCity] = useState<ShadowTowerCity>("minx_city");
  const [floorText, setFloorText] = useState(() => {
    const requested = Number.parseInt(new URLSearchParams(window.location.search).get("floor") || "", 10);
    return requested >= 5 && requested <= 64 ? String(requested) : "5";
  });
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const requestId = useRef<string | null>(null);
  const floorNumber = Math.max(5, Math.min(64, Number.parseInt(floorText, 10) || 5));

  async function acquire() {
    if (!target || busy) return;
    setBusy(true); setResult(null);
    try {
      const response = await apiFetch("/api/shadow-tower/floors", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, floorNumber, archetype: target.listing.archetype, tenure: target.tenure, requestId: requestId.current ??= crypto.randomUUID() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult({ ok: false, msg: body.error || (response.status === 401 ? "Sign in to acquire a floor." : "Floor acquisition failed.") });
        return;
      }
      requestId.current = null;
      setResult({ ok: true, msg: `${target.tenure === "own" ? "Purchased" : "Leased"} ${cityLabel(city)} floor ${floorNumber} for ${fiat(Number(body.price))}. Opening your office…` });
      window.setTimeout(() => navigate("/office"), 800);
    } catch { setResult({ ok: false, msg: "Network error — try again." }); }
    finally { setBusy(false); }
  }

  return <div className="min-h-screen bg-black text-zinc-200">
    <header className="px-4 sm:px-6 pt-4 pb-3 flex items-center justify-between border-b border-pink-500/20">
      <button type="button" onClick={() => navigate("/tower")} className="text-pink-200 text-[10px] tracking-[.35em] hover:text-white flex gap-2 items-center"><ArrowLeft className="w-3 h-3" /> TOWER</button>
      <div className="text-pink-300 text-xs sm:text-sm tracking-[.3em]">SHADOW TOWER REALTY</div><span className="text-[10px] text-zinc-500">FIAT SETTLEMENT</span>
    </header>
    <main className="max-w-6xl mx-auto px-4 sm:px-8 py-7">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div><h1 className="text-2xl text-pink-100 tracking-[.16em]">SHADOW TOWER FLOORS</h1><p className="text-sm text-zinc-400 mt-2">Two playable architectures. Price, ownership, and availability are confirmed by the tower registry.</p></div>
        <div className="flex gap-2 flex-wrap">
          <label className="text-[10px] text-cyan-300 tracking-widest">CITY<select value={city} onChange={e => setCity(e.target.value as ShadowTowerCity)} className="block mt-1 bg-zinc-950 border border-cyan-400/40 rounded px-2 py-1 text-zinc-100">{SHADOW_TOWER_CITIES.map(c => <option key={c} value={c}>{cityLabel(c)}</option>)}</select></label>
          <label className="text-[10px] text-cyan-300 tracking-widest">FLOOR #<input data-testid="shadow-floor-number" type="number" min="5" max="64" value={floorText} onChange={e => setFloorText(e.target.value)} className="block mt-1 w-24 bg-zinc-950 border border-cyan-400/40 rounded px-2 py-1 text-zinc-100" /></label>
        </div>
      </div>
      <div className="mb-7 rounded border border-zinc-700 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-400"><b className="text-zinc-100">Homes are not for sale yet.</b> Home interiors must be playable before Realty can charge for them.</div>
      <div className="grid md:grid-cols-2 gap-5">
        {(Object.values(SHADOW_TOWER_LISTINGS) as ShadowTowerListing[]).map(listing => <article key={listing.archetype} data-testid={`shadow-listing-${listing.archetype}`} className="border border-pink-400/30 bg-gradient-to-b from-pink-950/20 to-zinc-950 rounded-xl overflow-hidden">
          <div className="h-52 border-b border-cyan-400/20"><ShadowTowerPlanPreview archetype={listing.archetype} city={city} floorNumber={floorNumber} /></div>
          <div className="p-4"><div className="flex justify-between gap-3"><div><h2 className="text-pink-100 tracking-widest">{listing.title}</h2><p className="text-xs text-zinc-400 mt-1">{listing.subtitle}</p></div><Building2 className="text-cyan-300 w-5 h-5 shrink-0" /></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="border border-cyan-400/20 p-2"><span className="text-zinc-500">CAPACITY</span><b className="block text-cyan-100">{listing.capacity} occupants</b></div><div className="border border-cyan-400/20 p-2"><span className="text-zinc-500">IDENTITY</span><b className="block text-cyan-100">{cityLabel(city)} · {floorNumber}</b></div></div>
            <p className="mt-3 text-[11px] text-zinc-400"><span className="text-cyan-300">STANDARD KIT:</span> {kit.join(" · ")}</p>
            <div className="flex gap-2 mt-4"><button onClick={() => { setResult(null); setTarget({ listing, tenure: "lease" }); }} className="flex-1 border border-cyan-400/50 text-cyan-100 py-2 text-xs tracking-widest hover:bg-cyan-500/10">LEASE {fiat(listing.leaseFiat)}/MO</button><button onClick={() => { setResult(null); setTarget({ listing, tenure: "own" }); }} className="flex-1 border border-pink-400/50 text-pink-100 py-2 text-xs tracking-widest hover:bg-pink-500/10">BUY {fiat(listing.purchaseFiat)}</button></div>
          </div>
        </article>)}
      </div>
    </main>
    {target && <div className="fixed inset-0 z-50 bg-black/85 p-4 flex items-center justify-center" onClick={() => !busy && setTarget(null)}><div className="max-w-md w-full border border-pink-400/50 bg-zinc-950 p-5 rounded-xl" onClick={e => e.stopPropagation()}><button onClick={() => setTarget(null)} className="float-right text-zinc-400"><X /></button><h2 className="text-pink-100 tracking-widest">{target.tenure === "own" ? "PURCHASE" : "LEASE"} {target.listing.title}</h2><p className="mt-3 text-zinc-400 text-sm">{cityLabel(city)}, numbered floor {floorNumber}. Server confirms the exact settlement price.</p><div className="my-4 text-2xl text-cyan-100">{fiat(target.tenure === "own" ? target.listing.purchaseFiat : target.listing.leaseFiat)}{target.tenure === "lease" && <span className="text-sm"> / month</span>}</div>{result && <p className={`text-sm mb-3 ${result.ok ? "text-emerald-300" : "text-red-300"}`}>{result.msg}</p>}<button disabled={busy || result?.ok} onClick={acquire} className="w-full py-2 bg-pink-500/20 border border-pink-400/60 text-pink-100 tracking-widest text-xs disabled:opacity-50">{busy ? <Loader2 className="inline w-4 h-4 animate-spin" /> : result?.ok ? <Check className="inline w-4 h-4" /> : "CONFIRM WITH REGISTRY"}</button></div></div>}
  </div>;
}