import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { BedDouble, BriefcaseBusiness, Building2, KeyRound, Laptop, Shield, Stethoscope, X } from "lucide-react";
import { IsoOffice } from "@/components/IsoOffice";
import { WorldBuildStation } from "@/components/WorldBuildStation";
import { apiFetch } from "@/lib/api-client";
import { getActiveCityId, getActiveCityName } from "@/lib/city-defs";
import { getPublicFloorOfficeLayout } from "@/lib/office-property-layouts";
import { startTowerAmbient, stopTowerAmbient } from "@/soundEngine";
import { completeWorkArrivalTask, getBuildingOnboardingStage } from "@/lib/building-onboarding";
import { TowerLifeHub } from "@/components/TowerLifeHub";
import { useAuth } from "@/hooks/use-auth";
import { getAmbianceEnabled, getAudioSettings, subscribeAudioSettings } from "@/lib/audio-settings";
import { getTowerAmbientOccupants, TOWER_BUSINESSES, TOWER_RESIDENTS } from "@/lib/tower-life";
import { getTowerSpaceArtUrl, type TowerSpaceArtKind } from "@/lib/tower-space-art";

type FloorNumber = 2 | 3 | 4;
type PublicPayload = {
  rec: { stamina: number };
  wallet: { balance: number; spendable: number };
};

const requestId = () => crypto.randomUUID();
type BedListing = {
  id: number; name: string; roomType: string; description?: string | null;
  hourlyRateFiat: number; staminaPerHour: number; rechargeConsumables: boolean;
  occupiedUntil?: string | null;
};
export default function PublicTowerFloor({ floor }: { floor: FloorNumber }) {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [panel, setPanel] = useState<"terminal" | "work" | "elevator" | "rest" | "beds" | "security" | null>(() => {
    if (typeof window === "undefined") return null;
    const focus = new URLSearchParams(window.location.search).get("focus");
    return focus === "classifieds" || focus === "phone" ? "terminal" : null;
  });
  const [message, setMessage] = useState("WALK TO A STATION · PRESS E OR TAP");
  const [busy, setBusy] = useState(false);
  const [residentNotice, setResidentNotice] = useState("");
  const [beds, setBeds] = useState<BedListing[]>([]);
  const layout = useMemo(
    () => getPublicFloorOfficeLayout(getActiveCityId() === "huda_city" ? "huda_city" : "minx_city", floor),
    [floor],
  );
  const floorPath = floor === 2 ? "/tower/mezzanine" : floor === 3 ? "/tower/rest" : "/tower/security";
  const spaceArt: TowerSpaceArtKind = floor === 2 ? "mezzanine" : floor === 3 ? "rest" : "security";

  const load = useCallback(async () => {
    const savesResponse = await apiFetch("/api/salaryman/saves", { credentials: "include" });
    if (!savesResponse.ok) return;
    let saves = (await savesResponse.json()).saves ?? [];
    if (!saves.length) {
      const ensureResponse = await apiFetch("/api/salaryman/saves/ensure", {
        method: "POST",
        credentials: "include",
      });
      if (!ensureResponse.ok) {
        setMessage("COMPLETE ONBOARDING BEFORE ENTERING SHADOW TOWER");
        return;
      }
      const ensured = await ensureResponse.json();
      saves = ensured.save ? [ensured.save] : [];
    }
    if (!saves.length) { setMessage("OPERATOR RECORD UNAVAILABLE"); return; }
    const slot = saves.sort((a: { lastSavedAt?: string }, b: { lastSavedAt?: string }) =>
      new Date(b.lastSavedAt ?? 0).getTime() - new Date(a.lastSavedAt ?? 0).getTime())[0].slotIndex;
    setSlotIndex(slot);
    const stateResponse = await apiFetch(`/api/recreation/state?slot=${slot}`, { credentials: "include" });
    if (stateResponse.ok) setPayload(await stateResponse.json());
    if (floor === 3) {
      const bedResponse = await apiFetch(`/api/public-floor/beds?city=${getActiveCityId()}`, { credentials: "include" });
      if (bedResponse.ok) setBeds((await bedResponse.json()).beds ?? []);
    }
  }, [floor]);

  useEffect(() => { if (isAuthenticated) void load(); }, [isAuthenticated, load]);
  useEffect(() => {
    const stage = getBuildingOnboardingStage();
    if (stage === "reception") {
      navigate("/tower", { replace: true });
      return;
    }
    if (floor === 2 && stage === "work") completeWorkArrivalTask();
  }, [floor, navigate]);
  useEffect(() => {
    const canPlayAmbient = () => {
      const settings = getAudioSettings();
      return document.visibilityState === "visible" && getAmbianceEnabled() && !settings.muted && settings.master > 0 && settings.music > 0;
    };
    const syncAudio = () => {
      if (!canPlayAmbient()) {
        stopTowerAmbient();
      } else {
        startTowerAmbient(floor === 4 ? "shadow" : "lobby");
      }
    };
    syncAudio();
    document.addEventListener("visibilitychange", syncAudio);
    const unsubscribe = subscribeAudioSettings(syncAudio);
    return () => {
      document.removeEventListener("visibilitychange", syncAudio);
      unsubscribe();
      stopTowerAmbient();
    };
  }, [floor]);

  const post = async (path: string) => {
    if (slotIndex == null) return null;
    setBusy(true);
    try {
      const response = await apiFetch(path, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotIndex, requestId: requestId() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error === "insufficient_fiat"
        ? `INSUFFICIENT FIAT · ƒ${data.required} REQUIRED`
        : data.error ?? "ACTION REJECTED");
      return data;
    } finally { setBusy(false); }
  };

  const rest = async () => {
    try {
      const data = await post("/api/public-floor/rest");
      if (!data) return;
      setPayload((prior) => prior ? { ...prior, rec: data.rec } : prior);
      setMessage(`${data.attendedBy} ATTENDING · OBSERVATION ${data.observationSeconds}S · STAMINA ${data.rec.stamina}%`);
      setPanel("rest");
    } catch (error) { setMessage(error instanceof Error ? error.message : "REST REQUEST FAILED"); }
  };

  const bookBed = async (bed: BedListing) => {
    try {
      const data = await post(`/api/public-floor/beds/${bed.id}/book`);
      if (!data) return;
      setPayload((prior) => prior ? { ...prior, rec: data.rec } : prior);
      setMessage(`${bed.name.toUpperCase()} RESERVED · STAMINA ${data.rec.stamina}%${data.recharged?.length ? " · CONSUMABLES RECHARGED" : ""}`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "BED BOOKING FAILED"); }
  };

  const talkToResident = async (occupant: { id: number; name: string }) => {
    const resident = TOWER_RESIDENTS.find((candidate) => candidate.id === occupant.id);
    const business = resident ? TOWER_BUSINESSES.find((candidate) => candidate.code === resident.businessCode) : undefined;
    if (!resident) return;
    if (resident.id !== 509) {
      setResidentNotice(`${resident.name} · ${business?.playerService ?? "SERVICE DESK"} · ${business?.playerJob ?? "WORK ORDER AVAILABLE"}`);
      setMessage(`${resident.name} IS ON ROUTE · PRESS E TO SPEAK AGAIN`);
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch("/api/tower/resident-task", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: slotIndex, residentId: "mender-9", taskId: "terminal-recovery", requestId: requestId() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "WORK ORDER REJECTED");
      setResidentNotice(data.alreadyCompleted
        ? "MENDER-9 REMEMBERS THIS REPAIR · RELATIONSHIP +1 ALREADY RECORDED"
        : `MENDER-9 PAID THE REPAIR ORDER · ƒ${data.rewardFiat} · RELATIONSHIP +1`);
      setMessage(`MENDER-9 · TERMINAL RECOVERY COMPLETE · BANK ƒ${Number(data.spendable ?? data.balance).toLocaleString()}`);
      await load();
    } catch (error) {
      setResidentNotice(error instanceof Error ? error.message : "RESIDENT WORK ORDER FAILED");
    } finally {
      setBusy(false);
    }
  };

  const mezzanine = floor === 2;
  const security = floor === 4;
  const stations = useMemo(() => [
    ...layout.stations.map((station) => ({
      ...station,
      onInteract: () => {
        if (station.id.includes("stairs")) {
          navigate(floor === 2 ? "/recreation" : floor === 3 ? "/tower/mezzanine" : "/tower/rest");
          return;
        }
        if (station.id.includes("elevator") || station.id.startsWith("office-wing-door-")) navigate(`/tower/elevator?from=${encodeURIComponent(floorPath)}&floor=${floor}`);
        else if (station.id === "world-work-board") setPanel("work");
        else if (station.id.startsWith("rest-bed")) setPanel("beds");
        else if (station.id === "doctor" || station.id.includes("nurse")) void rest();
        else if (security) setPanel("security");
        else if (station.id === "public-atm") navigate(`/game/bank?returnTo=${encodeURIComponent(floorPath)}&returnFloor=${floor}`);
        else if (station.id.includes("payphone")) navigate("/phone?from=public-floor");
        else if (station.id.includes("vending")) navigate("/vending?from=public-floor");
        else setMessage(`${station.label} · PUBLIC SERVICE · NO ACCESS FEE`);
      },
    })),
    ...(mezzanine ? layout.teamDesks.map((desk, index) => ({
      id: desk.id,
      label: `PUBLIC COMPUTER ${index + 1} · FREE`,
      col: desk.col,
      row: desk.row,
      radius: 34,
      footprint: { w: desk.w, d: desk.d },
      glyph: "comms" as const,
      onInteract: () => setPanel("terminal"),
    })) : []),
  ], [floorPath, floor, layout, mezzanine, navigate, security]);

  if (!isAuthenticated) return <div className="min-h-screen grid place-items-center bg-[#070912] text-white"><Link href="/pablo" className="border border-cyan-400 px-5 py-3">START WORK</Link></div>;
  if (slotIndex == null) return (
    <div className="min-h-screen grid place-items-center bg-[#060912] text-zinc-100 p-6">
      <section className="max-w-lg w-full border border-cyan-400/25 bg-[#0a0f1a] p-7 text-center space-y-4">
        <Building2 className="w-10 h-10 mx-auto text-cyan-300" />
        <h1 className="font-black tracking-[.16em] text-cyan-200">RECEPTION CHECK-IN REQUIRED</h1>
        <p className="text-sm text-zinc-400">Shadow Tower access is free, but your bed, terminal access, stamina, and work record must be issued at the lobby desk.</p>
        <Link href="/tower" className="inline-block bg-cyan-300 text-black font-black px-5 py-3">REPORT TO RECEPTION</Link>
      </section>
    </div>
  );
  return (
    <div className="h-[100dvh] bg-[#060912] text-zinc-100 flex flex-col overflow-hidden" data-testid={`public-floor-${floor}`}>
      <header className="h-14 shrink-0 border-b border-cyan-400/20 bg-[#090d17]/95 px-3 sm:px-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-black tracking-[.2em] text-cyan-300 flex items-center gap-2">
            {mezzanine ? <Laptop className="w-4 h-4" /> : security ? <Shield className="w-4 h-4" /> : <BedDouble className="w-4 h-4" />}
            <span className="grid h-7 min-w-9 place-items-center border border-cyan-300/50 bg-cyan-300/10 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,.15)] animate-pulse">F{floor}</span>
            {mezzanine ? "PUBLIC COMPUTER CAFE" : security ? "SECURITY & CUSTODY" : "INFIRMARY · HOTELS"}
          </div>
          <div className="text-[9px] text-zinc-500 truncate">{getActiveCityName().toUpperCase()} · ACCESS FREE · {message}</div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <div><span className="text-zinc-500">BANK </span><span className="text-lime-300">ƒ{payload?.wallet.spendable?.toLocaleString() ?? "—"}</span></div>
          <div><span className="text-zinc-500">STAMINA </span><span className={Number(payload?.rec.stamina ?? 100) <= 20 ? "text-red-400" : "text-cyan-300"}>{payload?.rec.stamina ?? "—"}%</span></div>
             <button onClick={() => setPanel("elevator")} className="border border-white/15 px-2 py-1 hover:border-cyan-300 transition-colors">DIRECTORY</button>
        </div>
      </header>
      <main className="flex-1 min-h-0 relative">
        <IsoOffice
          layout={layout} viewportWidth={window.innerWidth} viewportHeight={window.innerHeight - 56}
          playable followCam premium scale={4.6} stations={stations} rooms={layout.rooms}
          deskColCount={layout.deskCols} deskRowCount={layout.deskRows} capsuleCount={0}
           backdropSrc={getTowerSpaceArtUrl(spaceArt)}
           lighting={floor === 4 ? "dim" : "warm"}
           hallwayStyle={floor === 2 ? "gallery" : "central"}
           hallwaySignage={floor === 2 ? "PUBLIC TERMINALS · CLASSIFIEDS" : floor === 3 ? "REST WARD · OBSERVATION" : "SECURITY · CUSTODY"}
          suppressLabels={window.innerWidth < 680} frozen={!!panel}
          playerName={mezzanine ? "CAFE GUEST" : "PATIENT"}
           ambientOccupants={getTowerAmbientOccupants(floor)}
           onAmbientInteract={(occupant) => void talkToResident(occupant)}
        />
      </main>

       {residentNotice && <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 w-[min(92vw,760px)] -translate-x-1/2 border border-amber-300/35 bg-[#0b0e18]/95 px-4 py-3 text-center text-[10px] font-bold tracking-[.12em] text-amber-100 shadow-2xl">{residentNotice}</div>}

      {panel && <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-3 animate-in fade-in duration-300">
        <section className="w-full max-w-3xl max-h-[88dvh] overflow-y-auto border border-cyan-400/30 bg-[#0a0f1a] shadow-2xl rounded-xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
          <div className="sticky top-0 z-10 bg-[#0a0f1a]/95 border-b border-white/10 px-4 py-3 flex items-center justify-between">
            <h2 className="font-black tracking-[.16em] text-cyan-200 flex items-center gap-2">
              {panel === "terminal" ? <><Laptop className="w-4 h-4" /> PUBLIC COMPUTER · FREE</>
                : panel === "work" ? <><BriefcaseBusiness className="w-4 h-4" /> WORLD WORK BOARD</>
                  : panel === "rest" ? <><Stethoscope className="w-4 h-4" /> MEDICAL OBSERVATION</>
                    : panel === "beds" ? <><BedDouble className="w-4 h-4" /> BED MARKET</>
                    : panel === "security" ? <><Shield className="w-4 h-4" /> SECURITY FLOOR</>
                    : <><Building2 className="w-4 h-4" /> SHADOW TOWER FLOORS</>}
            </h2>
            <button onClick={() => setPanel(null)} aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
          {panel === "terminal" && <div className="p-6 space-y-4">
             <img src={`${import.meta.env.BASE_URL}pixel-agents/shadow-tower/public-terminal.png`} alt="Shadow Tower public terminal" className="mx-auto h-36 w-full max-w-sm object-contain [image-rendering:pixelated]" />
             <p className="text-[10px] font-bold tracking-[.18em] text-zinc-500">PUBLIC CLASSIFIEDS · PHONE SYSTEMS · OPEN ACCESS</p>
            <div className="border border-emerald-400/25 bg-emerald-400/5 p-4">
              <strong className="text-emerald-300">FREE PUBLIC COMPUTER ACCESS</strong>
             <p className="text-xs text-zinc-500 mt-1">Browse Tower Life, use the work board, or open the phone system from any public terminal.</p>
            </div>
             <div className="grid gap-2 sm:grid-cols-2">
               <Link href="/console" className="block w-full bg-cyan-300 text-black text-center font-black py-3 transition hover:bg-cyan-200 active:scale-[.99]">ALL SYSTEMS TERMINAL</Link>
               <Link href="/phone?from=public-terminal" className="block w-full border border-emerald-300/50 bg-emerald-300/10 text-center font-black py-3 text-emerald-100 transition hover:bg-emerald-300/20 active:scale-[.99]">PHONE SYSTEM</Link>
             </div>
             <TowerLifeHub compact cityLabel={getActiveCityName().toUpperCase()} floorLabel="PUBLIC TERMINAL · CLASSIFIEDS" />
          </div>}
          {panel === "work" && <div className="p-4">
            <p className="mb-4 text-xs text-zinc-400">Public work access is free. Debtor labor pays Banco Ombra first; the remainder of eligible paid work reaches checking only after debt settlement.</p>
            <WorldBuildStation
              onComplete={(payoff, debt, freed) => setMessage(`BANCO OMBRA RECEIVED ƒ${payoff} · DEBT ƒ${debt}${freed ? " · RELEASED" : ""}`)}
              onToast={(text) => setMessage(text.toUpperCase())}
            />
          </div>}
          {panel === "rest" && <div className="p-6 text-center space-y-3">
            <Stethoscope className="w-12 h-12 mx-auto text-cyan-300" />
            <p className="text-lg font-black">OBSERVATION IN PROGRESS</p>
            <p className="text-sm text-zinc-400">Rest and medical attendance are free. Stamina recovery is settled by the server.</p>
            <p className="text-cyan-300">STAMINA {payload?.rec.stamina ?? "—"}%</p>
          </div>}
          {panel === "beds" && <div className="p-5 space-y-3">
            <p className="text-sm text-zinc-400">Floor access is free. Independent infirmaries, hotels, hostels, and capsule operators charge only when you reserve a bed. Each hour restores stamina and recharges owned reusable consumables.</p>
            {beds.length === 0 && <div className="border border-white/10 p-5 text-center text-zinc-500">NO OPERATOR BEDS LISTED · FREE MEDICAL OBSERVATION REMAINS AVAILABLE</div>}
            {beds.map((bed) => {
              const occupied = !!bed.occupiedUntil && new Date(bed.occupiedUntil).getTime() > Date.now();
              return <article key={bed.id} className="border border-white/10 bg-white/[.03] p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/60">
                <div className="flex items-start justify-between gap-4">
                  <div><strong>{bed.name}</strong><p className="text-[10px] tracking-widest text-cyan-300">{bed.roomType.toUpperCase()}</p></div>
                  <strong className="text-lime-300">ƒ{bed.hourlyRateFiat}/HR</strong>
                </div>
                <p className="text-xs text-zinc-500 my-2">{bed.description || `Restores ${bed.staminaPerHour}% stamina per hour${bed.rechargeConsumables ? " and recharges reusable consumables" : ""}.`}</p>
                <button disabled={busy || occupied} onClick={() => void bookBed(bed)} className="w-full bg-cyan-300 text-black font-black py-2 disabled:bg-zinc-700 transition active:scale-[.98]">
                  {occupied ? `OCCUPIED UNTIL ${new Date(bed.occupiedUntil!).toLocaleTimeString()}` : `RESERVE ONE HOUR · ƒ${bed.hourlyRateFiat}`}
                </button>
              </article>;
            })}
          </div>}
          {panel === "security" && <div className="p-6 space-y-4">
            <div className="flex items-center gap-3"><Shield className="w-10 h-10 text-red-300 animate-pulse" /><div><strong>SHADOW TOWER AUTHORITY</strong><p className="text-xs text-zinc-500">GUARDS · CUSTODY · DEBTOR DUTIES · EVIDENCE</p></div></div>
            <p className="text-sm text-zinc-300">Violence, theft, robbery, pickpocketing, melee, and ranged incidents are possible inside this building, but guard response is severe. Captured debtors and criminals may be held and assigned lawful duties.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="border border-red-400/20 p-4"><strong>HOLDING CELLS</strong><p className="text-xs text-zinc-500 mt-1">Server-authoritative custody and timed release.</p></div>
              <div className="border border-amber-400/20 p-4"><strong>DEBT COLLECTION</strong><p className="text-xs text-zinc-500 mt-1">Duties settle Banco Ombra obligations first.</p></div>
              <div className="border border-violet-400/20 p-4"><strong>BLACK MARKET</strong><p className="text-xs text-zinc-500 mt-1">Hidden inventory; access must be discovered.</p></div>
              <div className="border border-cyan-400/20 p-4"><strong>UNDERGROUND</strong><p className="text-xs text-zinc-500 mt-1">Secret doors and personal story branches.</p></div>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500"><KeyRound className="w-4 h-4" /> Private offices, restricted floors, and executive suites require role access or a valid PIN.</div>
          </div>}
          {panel === "elevator" && <div className="grid sm:grid-cols-4 gap-3 p-5 animate-in fade-in duration-500">
            <Link href="/tower" className="border border-cyan-300/30 p-4 hover:border-cyan-300 sm:col-span-4"><strong>TOWER DIRECTORY</strong><p className="text-xs text-zinc-500">See every floor, access class, and destination.</p></Link>
            <Link href="/office" className="border border-white/15 p-4 hover:border-cyan-300"><strong>OFFICE WING</strong><p className="text-xs text-zinc-500">Your organization office</p></Link>
            <Link href="/recreation" className="border border-white/15 p-4 hover:border-cyan-300"><strong>REC</strong><p className="text-xs text-zinc-500">Public recreation</p></Link>
            <Link href="/tower/mezzanine" className="border border-white/15 p-4 hover:border-cyan-300"><strong>FLOOR 2</strong><p className="text-xs text-zinc-500">Computer cafe + work</p></Link>
            <Link href="/tower/rest" className="border border-white/15 p-4 hover:border-cyan-300"><strong>FLOOR 3</strong><p className="text-xs text-zinc-500">Rest ward + clinic</p></Link>
            <Link href="/tower/security" className="border border-white/15 p-4 hover:border-red-300"><strong>FLOOR 4</strong><p className="text-xs text-zinc-500">Security + custody</p></Link>
            <div className="border border-amber-300/30 p-4"><strong>FLOOR 66</strong><p className="text-xs text-zinc-500">PICASSO ORG · private operations</p></div>
            <div className="border border-violet-300/30 bg-violet-950/10 p-4"><strong className="text-violet-200">FLOOR 67 · SHADOW CORP</strong><p className="text-xs text-zinc-500">RESTRICTED · access withheld</p></div>
          </div>}
        </section>
      </div>}
    </div>
  );
}
