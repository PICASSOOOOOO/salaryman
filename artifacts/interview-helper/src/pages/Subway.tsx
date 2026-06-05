import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { listCityDefs, getActiveCityId, getCityDef } from "@/lib/city-defs";

type Station = {
  id: number;
  slug: string;
  name: string;
  district: string;
  worldX: number;
  worldY: number;
  description: string;
  discovered: boolean;
};

type CutscenePhase = "boarding" | "travel" | "arriving" | null;

// Flat cross-city toll, in whole ƒ. MUST match INTERCITY_FARE_FIAT in the
// server (artifacts/api-server/src/routes/subway.ts) — shown here for the
// confirm dialog; the server is the source of truth and actually charges it.
const INTERCITY_FARE_FIAT = 2500;

export default function Subway() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [phase, setPhase] = useState<CutscenePhase>(null);
  const [arriveStation, setArriveStation] = useState<Station | null>(null);
  const [destCityName, setDestCityName] = useState<string | null>(null);
  const [confirmCity, setConfirmCity] = useState<{ id: string; name: string } | null>(null);
  const [paying, setPaying] = useState(false);

  const currentCityId = getActiveCityId();
  const otherCities = listCityDefs().filter(c => c.id !== currentCityId && c.live);

  // Inter-city transit: charge the server-authoritative fare FIRST, then reuse
  // the train cutscene and hand the destination city off to WorldPlay via
  // localStorage so it re-skins on arrival. Feels like crossing into a whole
  // different part of the world.
  async function travelCity(cityId: string) {
    if (phase !== null || paying) return;
    const def = getCityDef(cityId);
    setPaying(true);
    try {
      const r = await fetch("/api/subway/travel-intercity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ toCityId: cityId }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        if (r.status === 402) {
          toast({
            title: "FARE DENIED",
            description: `Not enough earned ƒ for the crossing — the toll is ƒ${INTERCITY_FARE_FIAT.toLocaleString()}. Earn ƒ in-game first.`,
            variant: "destructive",
          });
        } else {
          toast({ title: "TRIP DENIED", description: j.error ?? "Could not travel.", variant: "destructive" });
        }
        setConfirmCity(null);
        return;
      }
    } catch {
      toast({ title: "TRIP FAILED", description: "Network error — try again.", variant: "destructive" });
      setConfirmCity(null);
      return;
    } finally {
      setPaying(false);
    }

    // Paid — run the crossing cutscene, then hand off the destination city.
    setConfirmCity(null);
    setDestCityName(def.name);
    setPhase("boarding");
    setTimeout(() => setPhase("travel"), 1400);
    setTimeout(() => setPhase("arriving"), 4200);
    setTimeout(() => {
      localStorage.setItem("city_travel", JSON.stringify({
        cityId, x: def.arrival.x, y: def.arrival.y, at: Date.now(),
      }));
      setPhase(null);
      setLocation("/world/play");
    }, 6000);
  }

  useEffect(() => {
    fetch("/api/subway/stations", { credentials: "include" })
      .then(r => r.json())
      .then((j) => { setStations(j.stations ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Persist current station so the UI can default the next trip's "from".
  useEffect(() => {
    const last = localStorage.getItem("subway_current_station_id");
    if (last) setFrom(Number(last));
  }, []);

  function distanceFiat(a: Station, b: Station) {
    const d = Math.hypot(a.worldX - b.worldX, a.worldY - b.worldY);
    return Math.max(1000, Math.min(10000, Math.round(d)));
  }

  async function travel() {
    if (!from || !to || from === to) return;
    const fromS = stations.find(s => s.id === from);
    const toS = stations.find(s => s.id === to);
    if (!fromS || !toS) return;

    setPhase("boarding");
    try {
      const r = await fetch("/api/subway/travel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fromStationId: from, toStationId: to }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast({ title: "TRIP DENIED", description: j.error ?? "Could not travel.", variant: "destructive" });
        setPhase(null);
        return;
      }
      const j = await r.json();
      // Cutscene timing: boarding (1.2s) → travel (2.2s) → arriving (1.4s) → land
      setTimeout(() => setPhase("travel"), 1200);
      setTimeout(() => setPhase("arriving"), 3400);
      setTimeout(() => {
        setArriveStation(toS);
        // Hand off destination to WorldPlay via localStorage so it spawns there.
        localStorage.setItem("subway_current_station_id", String(toS.id));
        localStorage.setItem("subway_destination", JSON.stringify({
          x: j.destination.x, y: j.destination.y, stationId: toS.id, at: Date.now(),
        }));
        setPhase(null);
        toast({
          title: "ARRIVED",
          description: `${toS.name} — fare ƒ${(j.fareCents / 100).toLocaleString()}.`,
        });
      }, 4800);
    } catch {
      setPhase(null);
      toast({ title: "TRIP FAILED", description: "Network error.", variant: "destructive" });
    }
  }

  const fromS = from ? stations.find(s => s.id === from) ?? null : null;
  const toS = to ? stations.find(s => s.id === to) ?? null : null;
  const fare = fromS && toS ? distanceFiat(fromS, toS) : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      {/* Cutscene overlay */}
      {phase && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-fuchsia-400 text-sm uppercase tracking-[0.4em] mb-4">
              {phase === "boarding" && (destCityName ? "▼ DEPARTING ▼" : "▼ BOARDING ▼")}
              {phase === "travel" && (destCityName ? "→ → → CROSSING THE WASTES → → →" : "→ → → IN TRANSIT → → →")}
              {phase === "arriving" && (destCityName ? `▲ APPROACHING ${destCityName} ▲` : "▲ APPROACHING PLATFORM ▲")}
            </div>
            <div className="relative w-[420px] h-[120px] mx-auto overflow-hidden border-2 border-cyan-400/40">
              <div
                className={`absolute top-1/2 -translate-y-1/2 h-12 w-24 bg-gradient-to-r from-fuchsia-500 to-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.8)] ${
                  phase === "boarding" ? "animate-pulse left-2" :
                  phase === "travel" ? "left-full" :
                  "left-2"
                }`}
                style={{
                  transition: phase === "travel" ? "left 2.0s linear" : phase === "arriving" ? "left 1.2s ease-out" : "none",
                  left: phase === "boarding" ? "8px" : phase === "travel" ? "calc(100% - 100px)" : "8px",
                }}
              />
              {/* tracks */}
              <div className="absolute inset-x-0 top-1/2 h-[2px] bg-cyan-500/40" />
              <div className="absolute inset-x-0 top-1/2 mt-3 h-[2px] bg-cyan-500/20" />
            </div>
            <div className="text-cyan-300/80 text-xs mt-4 uppercase tracking-widest">
              Fare deducted from EARNED ƒ
            </div>
          </div>
        </div>
      )}

      {/* Intercity fare confirm — every pay window must offer a decline path */}
      {confirmCity && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm border-2 border-amber-500/50 bg-zinc-950 p-5">
            <div className="text-amber-300 text-xs uppercase tracking-[0.3em] mb-2">Long-haul Crossing</div>
            <p className="text-amber-100 text-sm mb-1">
              Board the long-haul to <span className="font-bold">{confirmCity.name}</span>?
            </p>
            <p className="text-amber-200/60 text-[11px] mb-4">
              Crossing the wastes costs a flat toll, drawn from your EARNED ƒ only.
            </p>
            <div className="flex items-center justify-between mb-4 p-3 bg-zinc-900 border border-zinc-800">
              <span className="text-zinc-400 uppercase text-xs">Toll</span>
              <span className="text-cyan-300 font-bold">ƒ{INTERCITY_FARE_FIAT.toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={paying}
                onClick={() => setConfirmCity(null)}
                className="py-2 border border-zinc-600 text-zinc-300 text-xs uppercase tracking-wider hover:bg-zinc-800 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                disabled={paying}
                onClick={() => travelCity(confirmCity.id)}
                className="py-2 bg-amber-500/20 border border-amber-400 text-amber-100 text-xs uppercase tracking-wider hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {paying ? "Charging…" : `Pay ƒ${INTERCITY_FARE_FIAT.toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-fuchsia-400 tracking-wider">SALARYMAN METRO</h1>
            <p className="text-zinc-400 text-sm mt-1">Discovered stations only. Fares ƒ1,000–10,000 by distance.</p>
          </div>
          <button
            onClick={() => setLocation("/world/play")}
            className="px-4 py-2 border border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/10 text-xs uppercase tracking-wider"
          >
            ← Back to World
          </button>
        </div>

        {arriveStation && (
          <div className="mb-6 border border-emerald-500/40 bg-emerald-950/30 p-4">
            <div className="text-emerald-300 text-xs uppercase tracking-wider">ARRIVED</div>
            <div className="text-emerald-100 text-lg mt-1">{arriveStation.name}</div>
            <div className="text-emerald-200/70 text-xs mt-1">{arriveStation.description}</div>
            <button
              onClick={() => setLocation("/world/play")}
              className="mt-3 px-3 py-1.5 bg-emerald-500/20 border border-emerald-400 text-emerald-200 text-xs uppercase hover:bg-emerald-500/30"
            >
              Step onto the platform →
            </button>
          </div>
        )}

        {otherCities.length > 0 && (
          <div className="mb-6 border border-amber-500/40 bg-amber-950/20 p-4">
            <div className="text-amber-300 text-xs uppercase tracking-wider mb-1">INTERCITY TRANSIT</div>
            <p className="text-amber-200/60 text-[11px] mb-3">
              Long-haul lines beyond {getCityDef(currentCityId).name}. Cross the wastes into another walled city.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {otherCities.map(c => (
                <button
                  key={c.id}
                  disabled={phase !== null || paying}
                  onClick={() => setConfirmCity({ id: c.id, name: c.name })}
                  className="text-left p-3 border border-amber-500/40 bg-zinc-900/60 hover:bg-amber-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-amber-100 font-semibold text-sm">{c.name}</span>
                    <span className="text-amber-300/70 text-[10px] uppercase tracking-wider">{c.region}</span>
                  </div>
                  <div className="text-amber-200/50 text-[10px] mt-1 uppercase tracking-wider">
                    {c.walled ? "WALLED ENCLAVE" : "OPEN CITY"} · Board long-haul →
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-zinc-500 text-sm">Loading lines…</div>
        ) : stations.length === 0 ? (
          <div className="text-zinc-500 text-sm">No stations on file.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {/* From / To selector */}
            <div className="border border-fuchsia-500/30 bg-zinc-900/60 p-4">
              <div className="text-fuchsia-300 text-xs uppercase tracking-wider mb-3">PLAN A TRIP</div>

              <label className="block text-xs text-zinc-400 uppercase mt-2 mb-1">From</label>
              <select
                value={from ?? ""}
                onChange={(e) => setFrom(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              >
                <option value="">— Select origin —</option>
                {stations.filter(s => s.discovered).map(s => (
                  <option key={s.id} value={s.id}>{s.name} · {s.district}</option>
                ))}
              </select>

              <label className="block text-xs text-zinc-400 uppercase mt-3 mb-1">To</label>
              <select
                value={to ?? ""}
                onChange={(e) => setTo(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              >
                <option value="">— Select destination —</option>
                {stations.filter(s => s.discovered && s.id !== from).map(s => (
                  <option key={s.id} value={s.id}>{s.name} · {s.district}</option>
                ))}
              </select>

              <div className="mt-4 p-3 bg-zinc-950 border border-zinc-800">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400 uppercase text-xs">Fare</span>
                  <span className="text-cyan-300 font-bold">{fare ? `ƒ${fare.toLocaleString()}` : "—"}</span>
                </div>
                <button
                  disabled={!from || !to || from === to || phase !== null}
                  onClick={travel}
                  className="w-full mt-3 py-2 bg-fuchsia-500/20 border border-fuchsia-400 text-fuchsia-200 text-sm uppercase tracking-wider hover:bg-fuchsia-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ▼ Board Train ▼
                </button>
              </div>
            </div>

            {/* Stations list */}
            <div className="border border-cyan-500/30 bg-zinc-900/60 p-4">
              <div className="text-cyan-300 text-xs uppercase tracking-wider mb-3">
                NETWORK · {stations.filter(s => s.discovered).length}/{stations.length} discovered
              </div>
              <div className="space-y-2">
                {stations.map(s => (
                  <div
                    key={s.id}
                    className={`p-2 border text-xs ${s.discovered
                      ? "border-cyan-700/50 bg-cyan-950/20"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-500"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={s.discovered ? "text-cyan-200 font-semibold" : ""}>
                        {s.discovered ? "●" : "○"} {s.discovered ? s.name : "??? STATION"}
                      </span>
                      <span className="uppercase tracking-wider opacity-70">{s.discovered ? s.district : "LOCKED"}</span>
                    </div>
                    {s.discovered && (
                      <div className="text-zinc-400 text-[10px] mt-1">{s.description}</div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-zinc-500 text-[10px] mt-3 leading-relaxed">
                Walk near a station in the world to discover it. Locked stations don't appear on the trip planner.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
