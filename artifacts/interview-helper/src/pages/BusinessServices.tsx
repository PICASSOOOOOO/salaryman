/**
 * /business/services — Internal Services Board
 *
 * Tabbed hub for the player-to-player gig economy, debt bounties, vehicle
 * rentals, and escort services:
 *
 *   BROWSE GIGS   — open service listings to claim
 *   MY GIGS       — listings I posted or claimed (with status controls)
 *   BOUNTY BOARD  — active debt-collector bounties
 *   RENTALS       — fleet vehicles available to rent
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Briefcase, Crosshair, Car, Shield, Plus, Star,
  CheckCircle, AlertTriangle, Clock, Loader2, X, MapPin, Zap,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { getCityCurrency, getCityMultiplier } from "@/lib/currency";
import { getActiveCityId, hydrateActiveCityFromSave } from "@/lib/city-defs";

type Tab = "browse" | "mine" | "bounties" | "rentals";

const SERVICE_CATEGORIES = [
  "Repair", "Transport", "Security", "Legal", "Design",
  "Accounting", "Construction", "Cleaning", "Delivery", "Other",
];
const VEHICLE_TYPES: Record<string, string> = {
  cargo_van: "🚐 Cargo Van",
  courier_bike: "🚴 Courier Bike",
  armored_transport: "🛡️ Armored Transport",
  off_road_rover: "🚙 Off-Road Rover",
  boat: "⛵ Boat",
};
const SPEED_LABEL: Record<string, string> = {
  cargo_van: "+20% speed",
  courier_bike: "+40% speed",
  armored_transport: "+10% speed",
  off_road_rover: "+30% speed",
  boat: "+25% speed",
};

function fiat(n: number): string {
  return `ƒ${Math.round(n || 0).toLocaleString("en-US")}`;
}
function relTime(d: string | null): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

interface ServiceListing {
  id: number;
  posterUserId: string;
  posterName: string;
  posterOrgName: string | null;
  category: string;
  title: string;
  description: string;
  payFiat: number;
  payType: "flat" | "hourly";
  cityId: string;
  location: string;
  businessKey: string | null;
  deadline: string | null;
  status: string;
  claimerUserId: string | null;
  claimerName: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  disputedAt: string | null;
  escrowFiat: number;
  posterRated: number;
  claimerRated: number;
  createdAt: string;
}
interface Bounty {
  id: number;
  posterName: string;
  targetName: string;
  rewardFiat: number;
  description: string;
  expiresAt: string;
  status: string;
  acceptedByUserId: string | null;
}
interface FleetVehicle {
  id: number;
  orgId: number;
  orgName: string;
  vehicleType: string;
  name: string;
  rateFiatPerHr: number;
  pickupX: number;
  pickupY: number;
  cityId: string;
  currentRenterUserId: string | null;
  rentalEndsAt: string | null;
  available: boolean;
  speedBonus: number;
}

interface CityMarketDisplay {
  cityId: string;
  cityName: string;
  currencyCode: string;
  currencySymbol: string;
  laborMultiplier: number;
}

export default function BusinessServices() {
  hydrateActiveCityFromSave();
  const [location, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("browse");
  const [listings, setListings] = useState<ServiceListing[]>([]);
  const [mine, setMine] = useState<ServiceListing[]>([]);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [catFilter, setCatFilter] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPostGig, setShowPostGig] = useState(false);
  const [showPostBounty, setShowPostBounty] = useState(false);
  const [ratingTarget, setRatingTarget] = useState<{ listingId: number } | null>(null);
  const [market, setMarket] = useState<{ multiplier: number; cityMultipliers?: Record<string, { labor: number; property: number }> } | null>(null);
  const tenantBusinessKey = useMemo(() => {
    const query = location.split("?")[1] ?? "";
    const value = new URLSearchParams(query).get("tenant")?.trim();
    return value || null;
  }, [location]);
  const [tenantContext, setTenantContext] = useState<{
    businessKey: string;
    name: string;
    service: string;
    description: string;
    floorNumber: number;
    unitNumber: number;
  } | null>(null);
  const [tenantResolved, setTenantResolved] = useState(!tenantBusinessKey);
  const activeCityId = getActiveCityId();
  const localCcy = getCityCurrency(activeCityId);
  const laborMultiplier = market?.cityMultipliers?.[activeCityId]?.labor
    ?? getCityMultiplier(activeCityId, market?.multiplier ?? 1);
  const cityMarket: CityMarketDisplay = {
    cityId: activeCityId,
    cityName: activeCityId === "huda_city" ? "HUDA CITY" : "MINX CITY",
    currencyCode: localCcy.code,
    currencySymbol: localCcy.symbol,
    laborMultiplier,
  };

  useEffect(() => {
    setTenantContext(null);
    setTenantResolved(!tenantBusinessKey);
  }, [tenantBusinessKey]);

  const loadListings = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (catFilter) params.set("category", catFilter);
      if (tenantBusinessKey) params.set("tenant", tenantBusinessKey);
      const r = await apiFetch(`api/services${params.toString() ? `?${params}` : ""}`);
      if (r.ok) {
        const body = await r.json();
        setListings(body.listings ?? []);
        if (tenantBusinessKey) {
          setTenantContext(body.tenant ?? null);
          setTenantResolved(true);
        }
      }
    } catch { /* */ }
  }, [catFilter, tenantBusinessKey]);

  const loadMine = useCallback(async () => {
    try {
      const query = tenantBusinessKey ? `?tenant=${encodeURIComponent(tenantBusinessKey)}` : "";
      const r = await apiFetch(`api/services/mine${query}`, { credentials: "include" });
      if (r.ok) setMine((await r.json()).listings ?? []);
    } catch { /* */ }
  }, [tenantBusinessKey]);

  const loadBounties = useCallback(async () => {
    try {
      const r = await apiFetch("api/bounties");
      if (r.ok) setBounties((await r.json()).bounties ?? []);
    } catch { /* */ }
  }, []);

  const loadVehicles = useCallback(async () => {
    try {
      const r = await apiFetch("api/fleet?city=minx_prime");
      if (r.ok) setVehicles((await r.json()).vehicles ?? []);
    } catch { /* */ }
  }, []);

  useEffect(() => { void loadListings(); void loadMine(); void loadBounties(); void loadVehicles(); },
    [loadListings, loadMine, loadBounties, loadVehicles]);

  async function doAction(path: string, method = "POST", body?: object) {
    setBusy(true); setMsg(null);
    try {
      const r = await apiFetch(path, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, text: j?.error || "Request failed" }); return false; }
      setMsg({ ok: true, text: "Done." });
      return true;
    } catch { setMsg({ ok: false, text: "Network error" }); return false; }
    finally { setBusy(false); }
  }

  async function claimGig(id: number) {
    if (await doAction(`api/services/${id}/claim`)) { await loadListings(); await loadMine(); }
  }
  async function completeGig(id: number) {
    if (await doAction(`api/services/${id}/complete`)) { await loadMine(); setRatingTarget({ listingId: id }); }
  }
  async function disputeGig(id: number) {
    if (await doAction(`api/services/${id}/dispute`)) await loadMine();
  }
  async function cancelGig(id: number) {
    if (await doAction(`api/services/${id}/cancel`)) { await loadListings(); await loadMine(); }
  }
  async function acceptBounty(id: number) {
    if (await doAction(`api/bounties/${id}/accept`)) await loadBounties();
  }
  async function collectBounty(id: number) {
    if (await doAction(`api/bounties/${id}/collect`)) await loadBounties();
  }
  async function cancelBounty(id: number) {
    if (await doAction(`api/bounties/${id}/cancel`)) await loadBounties();
  }
  async function rentVehicle(id: number, hours: number) {
    if (await doAction(`api/fleet/${id}/rent`, "POST", { hours })) await loadVehicles();
  }
  async function returnVehicle(id: number) {
    if (await doAction(`api/fleet/${id}/return`)) await loadVehicles();
  }

  const filtered = useMemo(() =>
    catFilter ? listings.filter((l) => l.category === catFilter) : listings,
    [listings, catFilter]);
  const tenantViewUnavailable = Boolean(tenantBusinessKey && tenantResolved && !tenantContext);

  return (
    <div className="min-h-screen bg-black text-zinc-200">
      <header className="px-4 sm:px-6 pt-4 pb-3 flex items-center justify-between border-b border-cyan-500/20 gap-3 flex-wrap">
        <button type="button" onClick={() => navigate("/business")}
          className="text-cyan-200 text-[10px] tracking-[0.4em] hover:text-white flex items-center gap-2 shrink-0">
          <ArrowLeft className="w-3 h-3" /> BUSINESS
        </button>
        <div className="text-cyan-300 text-xs sm:text-sm tracking-[0.3em] sm:tracking-[0.5em] text-center"
          style={{ fontFamily: "var(--font-sans)" }}>
          ▌ {tenantContext ? `${tenantContext.name} · ${tenantContext.service}` : tenantBusinessKey ? "TENANT SERVICE COUNTER" : "SERVICES BOARD"} <span className="text-pink-400">サービス</span> ▌
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={tenantViewUnavailable} onClick={() => { setMsg(null); setShowPostGig(true); }}
            className="px-3 py-1.5 rounded border border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 text-[10px] tracking-[0.2em] flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="w-3 h-3" /> POST GIG
          </button>
          <button type="button" onClick={() => { setMsg(null); setShowPostBounty(true); }}
            className="px-3 py-1.5 rounded border border-red-400/50 bg-red-500/10 hover:bg-red-500/20 text-red-100 text-[10px] tracking-[0.2em] flex items-center gap-1.5">
            <Crosshair className="w-3 h-3" /> POST BOUNTY
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 overflow-x-auto">
        {([ ["browse","BROWSE GIGS",Briefcase], ["mine","MY GIGS",CheckCircle], ["bounties","BOUNTY BOARD",Crosshair], ["rentals","RENTALS",Car] ] as const).map(([id, label, Icon]) => (
          <button key={id} type="button"
            onClick={() => { setTab(id as Tab); setMsg(null); }}
            className={`flex items-center gap-2 px-4 py-3 text-[10px] tracking-[0.3em] whitespace-nowrap border-b-2 transition-colors ${tab === id ? "border-cyan-400 text-cyan-200" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
            <Icon className="w-3 h-3" />{label}
          </button>
        ))}
      </div>
      <div className="px-4 sm:px-8 py-2 border-b border-amber-500/15 bg-amber-950/10 text-[10px] tracking-[0.2em] text-amber-200/80">
        {tenantContext ? `${tenantContext.name} · FLOOR ${tenantContext.floorNumber} UNIT ${tenantContext.unitNumber}` : tenantBusinessKey ? "TENANT SERVICE SCOPE · VERIFYING COUNTER" : `${cityMarket.cityName} · ${cityMarket.currencyCode} ${cityMarket.currencySymbol} · LABOR DISPLAY RATE ×${cityMarket.laborMultiplier.toFixed(2)}`}
      </div>

      {msg && (
        <div className={`mx-4 mt-3 px-3 py-2 rounded text-xs flex items-center gap-2 ${msg.ok ? "bg-emerald-900/40 border border-emerald-500/30 text-emerald-200" : "bg-red-900/40 border border-red-500/30 text-red-200"}`}>
          {msg.ok ? <CheckCircle className="w-3 h-3 shrink-0" /> : <AlertTriangle className="w-3 h-3 shrink-0" />}
          {msg.text}
          <button type="button" onClick={() => setMsg(null)} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      <div className="px-4 sm:px-8 py-6 max-w-6xl mx-auto">
        {tab === "browse" && (
          <BrowseTab listings={filtered} catFilter={catFilter} setCatFilter={setCatFilter}
            onClaim={claimGig} busy={busy} cityMarket={cityMarket}
            tenantName={tenantContext?.name ?? null} tenantUnavailable={tenantViewUnavailable} />
        )}
        {tab === "mine" && (
          <MyGigsTab listings={mine} onComplete={completeGig} onDispute={disputeGig}
            onCancel={cancelGig} busy={busy} setRatingTarget={setRatingTarget} cityMarket={cityMarket} />
        )}
        {tab === "bounties" && (
          <BountyTab bounties={bounties} onAccept={acceptBounty} onCollect={collectBounty}
            onCancel={cancelBounty} busy={busy} />
        )}
        {tab === "rentals" && (
          <RentalsTab vehicles={vehicles} onRent={rentVehicle} onReturn={returnVehicle} busy={busy} />
        )}
      </div>

      {showPostGig && (
        <PostGigModal onClose={() => setShowPostGig(false)}
          businessKey={tenantContext?.businessKey ?? null}
          onCreated={async () => { setShowPostGig(false); await loadListings(); await loadMine(); }} />
      )}
      {showPostBounty && (
        <PostBountyModal onClose={() => setShowPostBounty(false)}
          onCreated={async () => { setShowPostBounty(false); await loadBounties(); }} />
      )}
      {ratingTarget && (
        <RatingModal listingId={ratingTarget.listingId}
          onClose={() => setRatingTarget(null)}
          onRated={async () => { setRatingTarget(null); await loadMine(); }} />
      )}
    </div>
  );
}

// ── Browse Tab ──────────────────────────────────────────────────────────────
function BrowseTab({ listings, catFilter, setCatFilter, onClaim, busy, cityMarket, tenantName, tenantUnavailable }: {
  listings: ServiceListing[]; catFilter: string; setCatFilter: (c: string) => void;
  onClaim: (id: number) => void; busy: boolean; cityMarket: CityMarketDisplay;
  tenantName: string | null; tenantUnavailable: boolean;
}) {
  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-4">
        <button type="button" onClick={() => setCatFilter("")}
          className={`px-2 py-1 rounded text-[10px] tracking-[0.2em] border ${!catFilter ? "border-cyan-400 bg-cyan-500/20 text-cyan-100" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}>
          ALL
        </button>
        {SERVICE_CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setCatFilter(c)}
            className={`px-2 py-1 rounded text-[10px] tracking-[0.2em] border ${catFilter === c ? "border-cyan-400 bg-cyan-500/20 text-cyan-100" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}>
            {c.toUpperCase()}
          </button>
        ))}
      </div>
      {listings.length === 0 && (
        <div className="text-zinc-600 text-xs text-center py-12 border border-dashed border-zinc-800 rounded">
          {tenantUnavailable
            ? "This Tower counter is unavailable or has no registered service scope."
            : tenantName
              ? `No open gigs published by ${tenantName} yet.`
              : "No open gigs yet — post one above!"}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {listings.map((l) => (
          <ServiceCard key={l.id} listing={l} cityMarket={cityMarket}>
            <button type="button" disabled={busy} onClick={() => onClaim(l.id)}
              className="mt-2 w-full px-2 py-1.5 rounded border border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 text-[10px] tracking-[0.2em] disabled:opacity-50">
              CLAIM GIG
            </button>
          </ServiceCard>
        ))}
      </div>
    </div>
  );
}

// ── My Gigs Tab ──────────────────────────────────────────────────────────────
function MyGigsTab({ listings, onComplete, onDispute, onCancel, busy, setRatingTarget, cityMarket }: {
  listings: ServiceListing[];
  onComplete: (id: number) => void;
  onDispute: (id: number) => void;
  onCancel: (id: number) => void;
  busy: boolean;
  setRatingTarget: (t: { listingId: number } | null) => void;
  cityMarket: CityMarketDisplay;
}) {
  if (listings.length === 0) {
    return (
      <div className="text-zinc-600 text-xs text-center py-12 border border-dashed border-zinc-800 rounded">
        No gigs yet — post one or claim from Browse Gigs.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {listings.map((l) => (
        <div key={l.id} className="rounded-xl border border-zinc-700/40 bg-zinc-900/30 p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <span className={`text-[9px] tracking-[0.3em] px-1.5 py-0.5 rounded mr-2 ${statusColor(l.status)}`}>{l.status.toUpperCase()}</span>
              <span className="text-zinc-100 text-sm">{l.title}</span>
            </div>
             <span className="text-cyan-200 text-xs shrink-0">{cityMarket.currencySymbol}{Math.round(l.payFiat * cityMarket.laborMultiplier).toLocaleString("en-US")}{l.payType === "hourly" ? "/hr" : ""}</span>
          </div>
          <div className="text-[10px] text-zinc-500 mb-2">
            {l.category} · {l.location} · posted {relTime(l.createdAt)}
            {l.claimerName && ` · claimer: ${l.claimerName}`}
          </div>
          <div className="flex gap-2 flex-wrap">
            {l.status === "claimed" && (
              <>
                <button type="button" disabled={busy} onClick={() => onComplete(l.id)}
                  className="px-2 py-1 rounded border border-emerald-400/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-100 text-[9px] tracking-[0.2em] disabled:opacity-50">
                  MARK COMPLETE
                </button>
                <button type="button" disabled={busy} onClick={() => onDispute(l.id)}
                  className="px-2 py-1 rounded border border-amber-400/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-100 text-[9px] tracking-[0.2em] disabled:opacity-50">
                  DISPUTE
                </button>
              </>
            )}
            {(l.status === "open" || l.status === "claimed") && (
              <button type="button" disabled={busy} onClick={() => onCancel(l.id)}
                className="px-2 py-1 rounded border border-red-400/40 bg-red-500/5 hover:bg-red-500/15 text-red-200 text-[9px] tracking-[0.2em] disabled:opacity-50">
                CANCEL
              </button>
            )}
            {l.status === "complete" && l.posterRated === 0 && (
              <button type="button" onClick={() => setRatingTarget({ listingId: l.id })}
                className="px-2 py-1 rounded border border-yellow-400/50 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-100 text-[9px] tracking-[0.2em]">
                ★ RATE
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function statusColor(s: string): string {
  const m: Record<string, string> = {
    open: "bg-cyan-900/50 text-cyan-300",
    claimed: "bg-amber-900/50 text-amber-300",
    complete: "bg-emerald-900/50 text-emerald-300",
    disputed: "bg-red-900/50 text-red-300",
    cancelled: "bg-zinc-800/70 text-zinc-500",
  };
  return m[s] ?? "bg-zinc-800/70 text-zinc-400";
}

// ── Bounty Tab ──────────────────────────────────────────────────────────────
function BountyTab({ bounties, onAccept, onCollect, onCancel, busy }: {
  bounties: Bounty[]; onAccept: (id: number) => void;
  onCollect: (id: number) => void; onCancel: (id: number) => void; busy: boolean;
}) {
  if (bounties.length === 0) {
    return (
      <div className="text-zinc-600 text-xs text-center py-12 border border-dashed border-zinc-800 rounded">
        No active bounties — post one above to start a hunt.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {bounties.map((b) => (
        <div key={b.id} className="rounded-xl border border-red-700/30 bg-red-950/10 p-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <span className="text-red-300 font-bold text-sm tracking-wide" style={{ fontFamily: "var(--font-sans)" }}>
                TARGET: {b.targetName}
              </span>
              {b.acceptedByUserId && (
                <span className="ml-2 text-[9px] tracking-[0.2em] px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300">HUNT IN PROGRESS</span>
              )}
            </div>
            <span className="text-red-200 text-sm font-bold shrink-0">{fiat(b.rewardFiat)}</span>
          </div>
          {b.description && (
            <div className="text-zinc-400 text-[11px] leading-snug mb-2">{b.description}</div>
          )}
          <div className="text-[10px] text-zinc-600 mb-2">
            Expires: {new Date(b.expiresAt).toLocaleString()} · posted by {b.posterName}
          </div>
          <div className="flex gap-2 flex-wrap">
            {!b.acceptedByUserId && (
              <button type="button" disabled={busy} onClick={() => onAccept(b.id)}
                className="px-2 py-1 rounded border border-red-400/50 bg-red-500/10 hover:bg-red-500/20 text-red-100 text-[9px] tracking-[0.2em] disabled:opacity-50">
                <Crosshair className="inline w-3 h-3 mr-1" />ACCEPT HUNT
              </button>
            )}
            {b.acceptedByUserId === "***" && (
              <button type="button" disabled={busy} onClick={() => onCollect(b.id)}
                className="px-2 py-1 rounded border border-emerald-400/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-100 text-[9px] tracking-[0.2em] disabled:opacity-50">
                TAG TARGET → COLLECT
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => onCancel(b.id)}
              className="px-2 py-1 rounded border border-zinc-700/50 bg-zinc-800/20 hover:bg-zinc-700/30 text-zinc-400 text-[9px] tracking-[0.2em] disabled:opacity-50">
              CANCEL
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Rentals Tab ──────────────────────────────────────────────────────────────
function RentalsTab({ vehicles, onRent, onReturn, busy }: {
  vehicles: FleetVehicle[]; onRent: (id: number, hours: number) => void;
  onReturn: (id: number) => void; busy: boolean;
}) {
  const [hours, setHours] = useState<Record<number, number>>({});

  function getHours(id: number) { return hours[id] ?? 1; }
  function setH(id: number, h: number) { setHours((prev) => ({ ...prev, [id]: h })); }

  if (vehicles.length === 0) {
    return (
      <div className="text-zinc-600 text-xs text-center py-12 border border-dashed border-zinc-800 rounded">
        No vehicles available in this city. Fleet operators can register via the org dashboard.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {vehicles.map((v) => (
        <div key={v.id} className={`rounded-xl border p-3 ${v.available ? "border-cyan-500/20 bg-cyan-900/5" : "border-zinc-700/30 bg-zinc-900/30 opacity-60"}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{VEHICLE_TYPES[v.vehicleType]?.split(" ")[0]}</span>
            <div>
              <div className="text-zinc-100 font-bold tracking-wide text-sm">{v.name}</div>
              <div className="text-[10px] text-zinc-500">{VEHICLE_TYPES[v.vehicleType]} · {v.orgName}</div>
            </div>
            <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded tracking-[0.2em] ${v.available ? "bg-emerald-900/50 text-emerald-300" : "bg-zinc-800 text-zinc-500"}`}>
              {v.available ? "AVAILABLE" : "RENTED"}
            </span>
          </div>
          <div className="text-xs text-cyan-300 mb-1">{fiat(v.rateFiatPerHr)}/hr</div>
          <div className="flex items-center gap-1 text-[10px] text-amber-300 mb-2">
            <Zap className="w-3 h-3" /> {SPEED_LABEL[v.vehicleType] ?? "+speed"}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-zinc-500 mb-3">
            <MapPin className="w-3 h-3" /> Pickup: ({v.pickupX.toFixed(0)}, {v.pickupY.toFixed(0)}) · {v.cityId}
          </div>
          {!v.available && v.rentalEndsAt && (
            <div className="text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Available: {new Date(v.rentalEndsAt).toLocaleString()}
            </div>
          )}
          {v.available ? (
            <div className="flex items-center gap-2">
              <select value={getHours(v.id)} onChange={(e) => setH(v.id, parseInt(e.target.value))}
                className="bg-black border border-zinc-700 rounded text-zinc-200 text-xs px-2 py-1 w-20">
                {[1, 2, 3, 4].map((h) => <option key={h} value={h}>{h}h — {fiat(h * v.rateFiatPerHr)}</option>)}
              </select>
              <button type="button" disabled={busy} onClick={() => onRent(v.id, getHours(v.id))}
                className="flex-1 px-2 py-1.5 rounded border border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 text-[9px] tracking-[0.2em] disabled:opacity-50">
                RENT NOW
              </button>
            </div>
          ) : (
            <button type="button" disabled={busy} onClick={() => onReturn(v.id)}
              className="w-full px-2 py-1.5 rounded border border-amber-400/40 bg-amber-500/5 hover:bg-amber-500/15 text-amber-200 text-[9px] tracking-[0.2em] disabled:opacity-50">
              RETURN EARLY (PRO-RATED REFUND)
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Service Card ──────────────────────────────────────────────────────────────
function ServiceCard({ listing, cityMarket, children }: { listing: ServiceListing; cityMarket: CityMarketDisplay; children?: React.ReactNode }) {
  const displayedPay = Math.round(listing.payFiat * cityMarket.laborMultiplier);
  return (
    <div className="rounded-xl border border-zinc-700/40 bg-zinc-900/30 p-3 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-zinc-100 text-sm font-medium">{listing.title}</span>
        <span className="text-cyan-200 text-xs shrink-0 font-bold">{cityMarket.currencySymbol}{displayedPay.toLocaleString("en-US")}{listing.payType === "hourly" ? "/hr" : ""}</span>
      </div>
      <div className="text-[10px] text-zinc-500 mb-1">
        {listing.category} · {listing.location} · by {listing.posterName}
        {listing.posterOrgName ? ` (${listing.posterOrgName})` : ""}
      </div>
      {listing.description && (
        <div className="text-zinc-400 text-[11px] leading-snug mb-2 line-clamp-2">{listing.description}</div>
      )}
      <div className="text-[10px] text-zinc-600">{relTime(listing.createdAt)}</div>
      <div className="mt-2 flex items-center gap-2 text-[9px] tracking-[0.2em] text-amber-200/70">
        <span className="rounded border border-amber-400/30 bg-amber-500/5 px-1.5 py-0.5">{cityMarket.cityId === "huda_city" ? "HUDA RATE" : "MINX RATE"}</span>
        <span>LOCAL {cityMarket.currencyCode} · DISPLAY ×{cityMarket.laborMultiplier.toFixed(2)}</span>
      </div>
      {children}
    </div>
  );
}

// ── Post Gig Modal ──────────────────────────────────────────────────────────
function PostGigModal({ onClose, onCreated, businessKey }: {
  onClose: () => void;
  onCreated: () => void;
  businessKey: string | null;
}) {
  const [form, setForm] = useState({
    title: "", description: "", category: "Other", payFiat: "", payType: "flat", cityId: "minx_prime", location: "city", deadline: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = form.title.trim().length >= 2 && (parseInt(form.payFiat) || 0) > 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch("api/services", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          payFiat: parseInt(form.payFiat) || 0,
          ...(businessKey ? { businessKey } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error || "Failed"); return; }
      onCreated();
    } catch { setErr("Network error"); }
    finally { setBusy(false); }
  }

  function f(k: string) { return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value })); }

  return (
    <ModalShell title="POST A GIG" onClose={onClose}>
      <div className="space-y-3">
        <input placeholder="Title *" value={form.title} onChange={f("title")}
          className="w-full bg-black border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600" />
        <textarea placeholder="Description" value={form.description} onChange={f("description")} rows={3}
          className="w-full bg-black border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 resize-none" />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.category} onChange={f("category")}
            className="bg-black border border-zinc-700 rounded px-2 py-2 text-sm text-zinc-200">
            {SERVICE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={form.payType} onChange={f("payType")}
            className="bg-black border border-zinc-700 rounded px-2 py-2 text-sm text-zinc-200">
            <option value="flat">Flat ƒ</option>
            <option value="hourly">Hourly ƒ</option>
          </select>
        </div>
        <input placeholder="Pay amount ƒ *" type="number" value={form.payFiat} onChange={f("payFiat")}
          className="w-full bg-black border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600" />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.location} onChange={f("location")}
            className="bg-black border border-zinc-700 rounded px-2 py-2 text-sm text-zinc-200">
            <option value="city">In-city</option>
            <option value="remote">Remote/async</option>
          </select>
          <input placeholder="City ID" value={form.cityId} onChange={f("cityId")}
            className="bg-black border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600" />
        </div>
        {err && <div className="text-red-300 text-xs">{err}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-3 py-2 rounded border border-zinc-700 text-zinc-400 text-xs">CANCEL</button>
          <button type="button" disabled={!valid || busy} onClick={submit}
            className="flex-1 px-3 py-2 rounded border border-cyan-400/50 bg-cyan-500/10 text-cyan-100 text-xs tracking-[0.2em] disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-3 h-3 animate-spin" />} POST GIG
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Post Bounty Modal ──────────────────────────────────────────────────────────
function PostBountyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    targetUserId: "", targetName: "", rewardFiat: "500", description: "", expiryHours: "24",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = form.targetUserId.trim().length > 0 && form.targetName.trim().length > 0 && (parseInt(form.rewardFiat) || 0) >= 500;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch("api/bounties", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, rewardFiat: parseInt(form.rewardFiat), expiryHours: parseInt(form.expiryHours) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error || "Failed"); return; }
      onCreated();
    } catch { setErr("Network error"); }
    finally { setBusy(false); }
  }

  function f(k: string) { return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value })); }

  return (
    <ModalShell title="POST A BOUNTY" onClose={onClose}>
      <div className="space-y-3">
        <div className="text-[10px] text-zinc-500 leading-snug">
          Requires <span className="text-amber-300">Cartel Boss</span> skill or active debt balance. Min ƒ500 reward.
        </div>
        <input placeholder="Target user ID *" value={form.targetUserId} onChange={f("targetUserId")}
          className="w-full bg-black border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600" />
        <input placeholder="Target display name *" value={form.targetName} onChange={f("targetName")}
          className="w-full bg-black border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600" />
        <input placeholder="Reward ƒ (min 500)" type="number" value={form.rewardFiat} onChange={f("rewardFiat")}
          className="w-full bg-black border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600" />
        <textarea placeholder="Description (e.g. owes ƒ10k — bring to Banco Ombra)" value={form.description} onChange={f("description")} rows={2}
          className="w-full bg-black border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 resize-none" />
        <select value={form.expiryHours} onChange={f("expiryHours")}
          className="w-full bg-black border border-zinc-700 rounded px-2 py-2 text-sm text-zinc-200">
          <option value="24">Expires in 24h</option>
          <option value="48">Expires in 48h</option>
          <option value="72">Expires in 3 days</option>
          <option value="168">Expires in 7 days</option>
        </select>
        {err && <div className="text-red-300 text-xs">{err}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-3 py-2 rounded border border-zinc-700 text-zinc-400 text-xs">CANCEL</button>
          <button type="button" disabled={!valid || busy} onClick={submit}
            className="flex-1 px-3 py-2 rounded border border-red-400/50 bg-red-500/10 text-red-100 text-xs tracking-[0.2em] disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-3 h-3 animate-spin" />} POST BOUNTY
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Rating Modal ──────────────────────────────────────────────────────────────
function RatingModal({ listingId, onClose, onRated }: { listingId: number; onClose: () => void; onRated: () => void }) {
  const [stars, setStars] = useState(5);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch(`api/services/${listingId}/rate`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars, note }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error || "Failed"); return; }
      onRated();
    } catch { setErr("Network error"); }
    finally { setBusy(false); }
  }

  return (
    <ModalShell title="RATE THIS GIG" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-2 justify-center">
          {[1,2,3,4,5].map((n) => (
            <button key={n} type="button" onClick={() => setStars(n)}
              className={`text-2xl transition-transform ${n <= stars ? "text-yellow-400 scale-110" : "text-zinc-700"}`}>
              ★
            </button>
          ))}
        </div>
        <textarea placeholder="Leave a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          className="w-full bg-black border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 resize-none" />
        {err && <div className="text-red-300 text-xs">{err}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-3 py-2 rounded border border-zinc-700 text-zinc-400 text-xs">SKIP</button>
          <button type="button" disabled={busy} onClick={submit}
            className="flex-1 px-3 py-2 rounded border border-yellow-400/50 bg-yellow-500/10 text-yellow-100 text-xs tracking-[0.2em] disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}<Star className="w-3 h-3" /> SUBMIT RATING
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Shared Modal Shell ──────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-700 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="text-cyan-300 text-sm tracking-[0.3em]" style={{ fontFamily: "var(--font-sans)" }}>{title}</div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
