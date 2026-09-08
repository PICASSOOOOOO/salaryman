import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Check, FileUp, Loader2, X, DoorOpen } from "lucide-react";
import { useLocation } from "wouter";
import {
  SHADOW_TOWER_CITIES, SHADOW_TOWER_LISTINGS, getShadowTowerPlan, quoteShadowTowerFloor,
  type ShadowTowerArchetype, type ShadowTowerCity, type ShadowTowerListing,
} from "@workspace/api-zod/shadow-tower";
import { apiFetch } from "@/lib/api-client";
import { getActiveCityId } from "@/lib/city-defs";

type Tenure = "lease" | "own";
interface Target { listing: ShadowTowerListing; tenure: Tenure; }
interface OwnedFloor {
  id: number;
  city: ShadowTowerCity;
  floorNumber: number;
  tenure: Tenure;
  officeCount: number;
  ownerUserId?: string | null;
}
interface MarketUnit {
  unitNumber: number;
  status: string;
  tenure?: Tenure | null;
}
interface ReceptionListing {
  floorId: number;
  floorNumber: number;
  city: ShadowTowerCity;
  archetype: string;
  unitNumber: number;
  listingType: "sale" | "rent_or_sublet";
  tenure: Tenure;
  priceFiat: number;
}

const fiat = (value: number) => `ƒ${value.toLocaleString("en-US")}`;
const cityLabel = (city: ShadowTowerCity) => city === "minx_city" ? "MINX CITY" : "HUDA CITY";
const cityCode = (city: ShadowTowerCity) => city === "minx_city" ? "MX" : "HU";
const unitId = (city: ShadowTowerCity, floorNumber: number, unitNumber: number) =>
  `${cityCode(city)}-${String(floorNumber).padStart(3, "0")}-U${String(unitNumber).padStart(2, "0")}`;
const kit = ["Hallway elevator", "Executive room + desk + terminal", "ATM", "Vending"];

/** A deterministic, contract-derived preview; every rectangle is a plan object. */
export function ShadowTowerPlanPreview({ archetype, city, floorNumber }: { archetype: ShadowTowerArchetype; city: ShadowTowerCity; floorNumber: number }) {
  const plan = useMemo(() => getShadowTowerPlan(city, floorNumber, archetype), [city, floorNumber, archetype]);
  const color = (kind: string) => kind === "workstation" ? "#38bdf8" : kind === "terminal" ? "#c084fc" : kind === "elevator" ? "#fbbf24" : kind === "atm" ? "#34d399" : kind === "vending_machine" ? "#fb7185" : "#64748b";
  const suites = plan.objects.filter((object) => object.kind === "office_unit");
  return <div className="flex h-full w-full flex-col bg-slate-950" role="img" aria-label={`${archetype} floor plan with one furnished executive suite and optional additional suites`}>
    <svg viewBox={`0 0 ${plan.cols} ${plan.rows}`} className="min-h-0 flex-1 w-full" aria-hidden="true">
      <rect width={plan.cols} height={plan.rows} fill="#090b16" />
      {plan.objects.map(object => <g key={object.id}>
        <rect x={object.footprint.x} y={object.footprint.y} width={object.footprint.cols} height={object.footprint.rows} rx=".15" fill={color(object.kind)} opacity=".82" />
        <rect x={object.footprint.x + .12} y={object.footprint.y + .12} width={Math.max(.1, object.footprint.cols - .24)} height={Math.max(.1, object.footprint.rows - .24)} fill="none" stroke="#e0f2fe" strokeWidth=".08" opacity=".7" />
      </g>)}
      <circle cx={plan.spawn.x + .5} cy={plan.spawn.y + .5} r=".28" fill="#f8fafc" />
    </svg>
    <div className="shrink-0 border-t border-amber-300/30 bg-amber-300/[.06] px-2 py-1.5">
      <div className="mb-1 flex items-center gap-1 text-[8px] font-bold tracking-[.18em] text-amber-200"><DoorOpen className="h-3 w-3" /> SHARED HALLWAY · COMMON ACCESS</div>
      <div className="grid grid-cols-4 gap-1">
        {suites.map((suite, index) => <div key={suite.id} className="border border-cyan-300/25 bg-cyan-300/[.05] px-1 py-1 text-center text-[7px] font-bold tracking-wider text-cyan-100">{index === 0 ? "EXECUTIVE SUITE" : `SUITE ${String(index + 1).padStart(2, "0")}`}</div>)}
      </div>
    </div>
  </div>;
}

export default function RealtyStore() {
  const [, navigate] = useLocation();
  const [city, setCity] = useState<ShadowTowerCity>(() => getActiveCityId() === "huda_city" ? "huda_city" : "minx_city");
  const [floorText, setFloorText] = useState(() => {
    const requested = Number.parseInt(new URLSearchParams(window.location.search).get("floor") || "", 10);
    return requested >= 5 && requested <= 67 ? String(requested) : "5";
  });
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [ownedFloor, setOwnedFloor] = useState<OwnedFloor | null>(null);
  const [ownedUnits, setOwnedUnits] = useState<MarketUnit[]>([]);
  const [brokerBusy, setBrokerBusy] = useState<number | null>(null);
  const [brokerMessage, setBrokerMessage] = useState("");
  const [marketListings, setMarketListings] = useState<ReceptionListing[]>([]);
  const [marketBusy, setMarketBusy] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const parsedFloorNumber = Number.parseInt(floorText, 10);
  const validFloorNumber = Number.isInteger(parsedFloorNumber) && parsedFloorNumber >= 5 && parsedFloorNumber <= 67;
  const floorNumber = validFloorNumber ? parsedFloorNumber : 5;
  const referredByReception = new URLSearchParams(window.location.search).get("from") === "reception";

  async function loadOwnedBrokerage() {
    const current = await apiFetch("/api/shadow-tower/floors/current", { credentials: "include" });
    if (!current.ok) return;
    const body = await current.json();
    if (!body.canManage || body.floor?.tenure !== "own" || !body.floor?.ownerUserId) return;
    const floor = body.floor as OwnedFloor;
    setOwnedFloor(floor);
    const unitsResponse = await apiFetch(`/api/shadow-tower/floors/${floor.city}/${floor.floorNumber}/units`, { credentials: "include" });
    if (unitsResponse.ok) setOwnedUnits((await unitsResponse.json()).units ?? []);
  }

  useEffect(() => { void loadOwnedBrokerage(); }, []);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/shadow-tower/marketplace?city=${city}`, { credentials: "include" })
      .then(async (response) => response.ok ? response.json() : { listings: [] })
      .then((body) => { if (!cancelled) setMarketListings(body.listings ?? []); })
      .catch(() => { if (!cancelled) setMarketListings([]); });
    return () => { cancelled = true; };
  }, [city]);

  async function acquireMarketListing(listing: ReceptionListing) {
    const key = `${listing.floorId}:${listing.unitNumber}`;
    if (marketBusy) return;
    const action = listing.tenure === "own" ? "buy" : "rent or sublet";
    if (!window.confirm(`Confirm ${action} for ${cityLabel(listing.city)} floor ${listing.floorNumber}, unit ${listing.unitNumber} at ${fiat(listing.priceFiat)}?`)) return;
    setMarketBusy(key);
    setResult(null);
    try {
      const response = await apiFetch(`/api/shadow-tower/floors/${listing.floorId}/units/${listing.unitNumber}/acquire`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Acquisition failed");
      setResult({ ok: true, msg: `${listing.tenure === "own" ? "Purchase" : "Rental"} filed. ${cityLabel(listing.city)} registry updated.` });
      window.setTimeout(() => navigate("/office"), 800);
    } catch (error) {
      setResult({ ok: false, msg: error instanceof Error ? error.message : "Acquisition failed" });
    } finally {
      setMarketBusy(null);
    }
  }

  async function listOwnedUnit(unitNumber: number, listType: "sale" | "lease") {
    if (!ownedFloor || brokerBusy != null) return;
    const confirmed = window.confirm(`List ${cityLabel(ownedFloor.city)} floor ${ownedFloor.floorNumber}, unit ${unitNumber} for ${listType}? This publishes it to the live city registry.`);
    if (!confirmed) return;
    setBrokerBusy(unitNumber);
    setBrokerMessage("");
    try {
      const response = await apiFetch(`/api/shadow-tower/floors/${ownedFloor.id}/units/${unitNumber}/list`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listType }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Listing failed");
      setBrokerMessage(`UNIT ${unitNumber} PUBLISHED FOR ${listType.toUpperCase()} · ${cityLabel(ownedFloor.city)} REGISTRY UPDATED`);
      await loadOwnedBrokerage();
    } catch (error) {
      setBrokerMessage(error instanceof Error ? error.message.toUpperCase() : "LISTING FAILED");
    } finally {
      setBrokerBusy(null);
    }
  }

  async function acquire() {
    if (!target || busy || !validFloorNumber) return;
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
        <div><h1 className="text-2xl text-pink-100 tracking-[.16em]">SHADOW TOWER FLOORS</h1><p className="text-sm text-zinc-400 mt-2">{referredByReception ? "Reception referral active. " : ""}Minx City and Huda City use the same filing practice while keeping names, inventory, and ownership data separate.</p></div>
        <div className="flex gap-2 flex-wrap">
          <label className="text-[10px] text-cyan-300 tracking-widest">CITY<select value={city} onChange={e => setCity(e.target.value as ShadowTowerCity)} className="block mt-1 bg-zinc-950 border border-cyan-400/40 rounded px-2 py-1 text-zinc-100">{SHADOW_TOWER_CITIES.map(c => <option key={c} value={c}>{cityLabel(c)}</option>)}</select></label>
          <label className="text-[10px] text-cyan-300 tracking-widest">FLOOR #<input data-testid="shadow-floor-number" type="number" min="5" max="67" value={floorText} onChange={e => setFloorText(e.target.value)} className="block mt-1 w-24 bg-zinc-950 border border-cyan-400/40 rounded px-2 py-1 text-zinc-100" />{!validFloorNumber && <span className="mt-1 block text-[9px] text-red-300">ENTER 5–67</span>}</label>
        </div>
      </div>
      {ownedFloor && (
        <section className="mb-7 border border-amber-300/30 bg-amber-300/5 p-4" data-testid="owner-brokerage">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-[10px] font-bold tracking-[.22em] text-amber-300">OWNER BROKERAGE · DIRECT FILING</p>
              <h2 className="mt-1 text-lg tracking-[.12em] text-amber-100">{cityLabel(ownedFloor.city)} · FLOOR {ownedFloor.floorNumber}</h2>
              <p className="mt-1 text-xs text-zinc-400">Owned property bypasses reception. Publish eligible units directly to this city&apos;s live registry.</p>
            </div>
            <FileUp className="h-6 w-6 text-amber-300" />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {ownedUnits.filter((unit) => unit.unitNumber >= 2).map((unit) => (
              <div key={unit.unitNumber} className="border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between text-xs"><strong>UNIT {unit.unitNumber}</strong><span className="text-[9px] tracking-widest text-zinc-500">{unit.status.replaceAll("_", " ").toUpperCase()}</span></div>
                {unit.status === "owner_priority" ? (
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={brokerBusy != null} onClick={() => void listOwnedUnit(unit.unitNumber, "lease")} className="flex-1 border border-cyan-300/35 py-2 text-[9px] font-bold tracking-wider text-cyan-200 disabled:opacity-40">LIST RENT / SUBLET</button>
                    <button type="button" disabled={brokerBusy != null} onClick={() => void listOwnedUnit(unit.unitNumber, "sale")} className="flex-1 border border-pink-300/35 py-2 text-[9px] font-bold tracking-wider text-pink-200 disabled:opacity-40">LIST SALE</button>
                  </div>
                ) : (
                  <p className="mt-3 text-[10px] leading-4 text-zinc-600">No owner filing available for this unit&apos;s current state.</p>
                )}
              </div>
            ))}
          </div>
          {brokerMessage && <p className="mt-3 border border-white/10 px-3 py-2 text-[10px] text-zinc-300" role="status">{brokerMessage}</p>}
        </section>
      )}
      <section className="mb-7 border border-cyan-300/25 bg-cyan-300/[.035] p-4" data-testid="reception-marketplace">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-bold tracking-[.22em] text-cyan-300">RECEPTION MARKETPLACE · {cityLabel(city)}</p>
            <h2 className="mt-1 text-lg tracking-[.12em] text-cyan-100">BUY · RENT · SUBLET</h2>
            <p className="mt-1 text-xs text-zinc-400">Seller filings appear here for buyers and renters. Switching cities loads that city&apos;s separate live inventory.</p>
          </div>
          <span className="text-[10px] tracking-widest text-zinc-500">{marketListings.length} ACTIVE LISTING{marketListings.length === 1 ? "" : "S"}</span>
        </div>
        {marketListings.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {marketListings.map((listing) => {
              const key = `${listing.floorId}:${listing.unitNumber}`;
              return (
                <article key={key} className="border border-white/10 bg-black/25 p-3">
                  <div className="flex items-center justify-between"><strong className="text-sm text-zinc-100">FLOOR {listing.floorNumber} · UNIT {listing.unitNumber}</strong><span className={`text-[9px] font-bold tracking-widest ${listing.tenure === "own" ? "text-pink-300" : "text-cyan-300"}`}>{listing.listingType === "sale" ? "FOR SALE" : "RENT / SUBLET"}</span></div>
                  <p className="mt-2 text-xl text-white">{fiat(listing.priceFiat)}{listing.tenure === "lease" && <span className="text-xs text-zinc-500"> / month</span>}</p>
                  <button type="button" disabled={marketBusy != null} onClick={() => void acquireMarketListing(listing)} className="mt-3 w-full border border-cyan-300/35 py-2 text-[10px] font-bold tracking-widest text-cyan-100 disabled:opacity-40">
                    {marketBusy === key ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : listing.tenure === "own" ? "BUY THROUGH RECEPTION" : "RENT THROUGH RECEPTION"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 border border-dashed border-white/10 px-4 py-5 text-center text-xs text-zinc-600">NO OWNER-ADVERTISED UNITS IN {cityLabel(city)} YET</div>
        )}
      </section>
      <div className="grid md:grid-cols-2 gap-5">
        {(Object.values(SHADOW_TOWER_LISTINGS) as ShadowTowerListing[]).map(listing => <article key={listing.archetype} data-testid={`shadow-listing-${listing.archetype}`} className="border border-pink-400/30 bg-gradient-to-b from-pink-950/20 to-zinc-950 rounded-xl overflow-hidden">
          <div className="h-52 border-b border-cyan-400/20"><ShadowTowerPlanPreview archetype={listing.archetype} city={city} floorNumber={floorNumber} /></div>
          <div className="p-4"><div className="flex justify-between gap-3"><div><h2 className="text-pink-100 tracking-widest">{listing.title}</h2><p className="text-xs text-zinc-400 mt-1">{listing.subtitle}</p></div><Building2 className="text-cyan-300 w-5 h-5 shrink-0" /></div>
             <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="border border-cyan-400/20 p-2"><span className="text-zinc-500">STARTING FLOOR</span><b className="block text-cyan-100">1 executive desk + terminal</b><span className="mt-1 block text-[9px] leading-4 text-zinc-500">Additional suites, desks, and terminals are bought separately at VendKing.</span></div><div className="border border-cyan-400/20 p-2"><span className="text-zinc-500">LOCATION / UNIT IDS</span><b className="block text-cyan-100">{cityLabel(city)} · FLOOR {floorNumber}</b><span className="mt-1 block text-[9px] leading-4 text-zinc-500">{unitId(city, floorNumber, 1)} · Suite 1 furnished; later units are optional.</span></div></div>
             <p className="mt-3 text-[11px] text-zinc-400"><span className="text-cyan-300">STANDARD KIT:</span> {kit.join(" · ")}</p>
            <div className="flex gap-2 mt-4"><button disabled={!validFloorNumber} onClick={() => { setResult(null); setTarget({ listing, tenure: "lease" }); }} className="flex-1 border border-cyan-400/50 text-cyan-100 py-2 text-xs tracking-widest hover:bg-cyan-500/10 disabled:opacity-35">LEASE {validFloorNumber ? fiat(quoteShadowTowerFloor(listing.archetype, floorNumber, "lease")) : "—"}/MO</button><button disabled={!validFloorNumber} onClick={() => { setResult(null); setTarget({ listing, tenure: "own" }); }} className="flex-1 border border-pink-400/50 text-pink-100 py-2 text-xs tracking-widest hover:bg-pink-500/10 disabled:opacity-35">BUY {validFloorNumber ? fiat(quoteShadowTowerFloor(listing.archetype, floorNumber, "own")) : "—"}</button></div>
          </div>
        </article>)}
      </div>
    </main>
     {target && <div className="fixed inset-0 z-50 bg-black/85 p-4 flex items-center justify-center" onClick={() => !busy && setTarget(null)}><div className="max-w-md w-full border border-pink-400/50 bg-zinc-950 p-5 rounded-xl" onClick={e => e.stopPropagation()}><button onClick={() => setTarget(null)} className="float-right text-zinc-400"><X /></button><h2 className="text-pink-100 tracking-widest">{target.tenure === "own" ? "PURCHASE" : "LEASE"} {target.listing.title}</h2><p className="mt-3 text-zinc-400 text-sm"><b className="text-cyan-200">{cityLabel(city)} · FLOOR {floorNumber}</b><br />Registry address: {unitId(city, floorNumber, 1)}<br />Suite 1 is furnished; additional suites are unlocked one at a time at VendKing.</p><div className="my-4 text-2xl text-cyan-100">{fiat(target.tenure === "own" ? target.listing.purchaseFiat : target.listing.leaseFiat)}{target.tenure === "lease" && <span className="text-sm"> / month</span>}</div><div className="mb-4 border border-cyan-300/25 bg-cyan-300/5 p-3 text-xs text-zinc-300"><b className="text-cyan-200">{target.listing.capacity} OCCUPANT CAPACITY AFTER FIT-OUT</b><p className="mt-1 text-[10px] leading-4 text-zinc-500">The purchase includes one founder desk and terminal. Every additional suite, desk, and terminal is separately settled and projected into the canonical floor plan.</p></div>{result && <p className={`text-sm mb-3 ${result.ok ? "text-emerald-300" : "text-red-300"}`}>{result.msg}</p>}<button disabled={busy || result?.ok} onClick={acquire} className="w-full py-2 bg-pink-500/20 border border-pink-400/60 text-pink-100 tracking-widest text-xs disabled:opacity-50">{busy ? <Loader2 className="inline w-4 h-4 animate-spin" /> : result?.ok ? <Check className="inline w-4 h-4" /> : "CONFIRM WITH REGISTRY"}</button></div></div>}
  </div>;
}