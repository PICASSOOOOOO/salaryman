import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUp, Building2, DoorOpen, LockKeyhole, Map, Volume2 } from "lucide-react";
import { useLocation } from "wouter";
import { playClick, playNav } from "@/lib/ui-sound";
import { resumeAudioContext, sfxDoorSlide, sfxElevatorChime, startElevatorAmbient, stopElevatorAmbient } from "@/soundEngine";
import { getActiveCityName } from "@/lib/city-defs";

type FloorInfo = { label: string; detail: string; destination?: string; tone: string };

const FLOOR_INFO: Record<number, FloorInfo> = {
  1: { label: "RECREATION", detail: "Games, food, conversation", destination: "/recreation", tone: "emerald" },
  2: { label: "COMPUTER CAFE", detail: "Free computers and work board", destination: "/tower/mezzanine", tone: "cyan" },
  3: { label: "INFIRMARY / HOTELS", detail: "Medical observation and beds", destination: "/tower/rest", tone: "cyan" },
  4: { label: "SECURITY / CUSTODY", detail: "Guards, evidence, holding", destination: "/tower/security", tone: "red" },
  66: { label: "PICASSO ORG", detail: "Private organization operations", destination: "/office", tone: "amber" },
  67: { label: "SHADOW CORP", detail: "Executive floor · restricted", tone: "violet" },
};

const SEALED_FLOORS = new Set([40, 52, 65]);
const isPublicFloor = (floor: number) => Boolean(FLOOR_INFO[floor]?.destination);

function floorInfo(floor: number): FloorInfo {
  return FLOOR_INFO[floor] ?? (
    SEALED_FLOORS.has(floor)
      ? { label: "SEALED FLOOR", detail: "No public access", tone: "zinc" }
      : { label: "COMMERCIAL FLOOR", detail: "Use the registry to lease or purchase", tone: "zinc" }
  );
}

export default function ElevatorCabin() {
  const [, navigate] = useLocation();
  const [selectedFloor, setSelectedFloor] = useState(() => {
    if (typeof window === "undefined") return 2;
    const requested = Number(new URLSearchParams(window.location.search).get("floor"));
    return Number.isInteger(requested) && requested >= 1 && requested <= 67 ? requested : 2;
  });
  const [doorsOpen, setDoorsOpen] = useState(true);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const returnPath = useMemo(() => {
    if (typeof window === "undefined") return "/tower";
    const candidate = new URLSearchParams(window.location.search).get("from");
    return candidate && candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/tower";
  }, []);

  useEffect(() => {
    resumeAudioContext();
    startElevatorAmbient();
    sfxDoorSlide();
    const timer = window.setTimeout(() => setDoorsOpen(false), 1350);
    return () => {
      window.clearTimeout(timer);
      stopElevatorAmbient();
    };
  }, []);

  const current = floorInfo(selectedFloor);
  const chooseFloor = (floor: number) => {
    setSelectedFloor(floor);
    setDoorsOpen(false);
    setDirectoryOpen(false);
    playClick();
  };
  const travel = () => {
    if (!current.destination) {
      playClick();
      return;
    }
    resumeAudioContext();
    setDoorsOpen(true);
    sfxDoorSlide();
    sfxElevatorChime();
    playNav();
    window.setTimeout(() => navigate(current.destination!), 700);
  };
  const toggleDoors = () => {
    resumeAudioContext();
    setDoorsOpen((open) => {
      if (open) sfxDoorSlide();
      return !open;
    });
    playClick();
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#030509] text-zinc-100" data-testid="elevator-cabin">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-3 py-3 sm:px-6 sm:py-5">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <button type="button" onClick={() => { playClick(); navigate(returnPath); }} className="flex items-center gap-2 text-[10px] font-bold tracking-[.2em] text-zinc-500 transition hover:text-cyan-200">
            <ArrowLeft className="h-4 w-4" /> EXIT ELEVATOR
          </button>
          <div className="text-right">
            <div className="text-[10px] tracking-[.28em] text-cyan-300">SHADOW TOWER · {getActiveCityName().toUpperCase()}</div>
            <div className="text-[9px] tracking-[.2em] text-zinc-600">PASSENGER LIFT A · LOBBY ACCESS</div>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_310px]">
          <div className="relative mx-auto flex h-[min(74vh,680px)] w-full max-w-3xl items-stretch justify-center overflow-hidden border border-zinc-700/60 bg-[#11151b] shadow-[0_30px_100px_rgba(0,0,0,.7)]">
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#090c11]/90 px-5 py-4">
              <div className="flex items-center gap-2 text-[10px] tracking-[.25em] text-zinc-500"><Building2 className="h-4 w-4 text-cyan-300/70" /> ELEVATOR A</div>
              <div className="flex items-center gap-2 text-[10px] tracking-[.15em] text-zinc-500"><Volume2 className="h-3.5 w-3.5 text-emerald-300" /> LIFT AUDIO ON</div>
            </div>
            <div className="absolute inset-x-[10%] top-[19%] bottom-[13%] border-x border-zinc-500/50 bg-[linear-gradient(90deg,rgba(255,255,255,.035),transparent_14%,transparent_86%,rgba(255,255,255,.035))]">
              <div className="absolute inset-x-[8%] top-[8%] h-3 border border-cyan-200/25 bg-cyan-200/10 shadow-[0_0_18px_rgba(34,211,238,.16)]" />
              <div className="absolute left-1/2 top-[10%] -translate-x-1/2 text-4xl font-black tracking-[.18em] text-cyan-200">{selectedFloor}</div>
              <div className="absolute left-1/2 top-[17%] -translate-x-1/2 whitespace-nowrap text-[9px] tracking-[.28em] text-zinc-500">{current.label}</div>
              <div className={`absolute inset-y-[27%] left-0 w-1/2 border-r border-zinc-800 bg-[linear-gradient(105deg,#242932,#0d1117)] transition-transform duration-700 ${doorsOpen ? "-translate-x-[92%]" : "translate-x-0"}`} />
              <div className={`absolute inset-y-[27%] right-0 w-1/2 border-l border-zinc-800 bg-[linear-gradient(255deg,#242932,#0d1117)] transition-transform duration-700 ${doorsOpen ? "translate-x-[92%]" : "translate-x-0"}`} />
              <div className="absolute inset-x-[12%] bottom-[8%] h-[32%] border border-white/10 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,.12),transparent_60%),#0b0e13]">
                <div className="absolute inset-x-8 bottom-5 h-px bg-cyan-200/20" />
              </div>
            </div>
            <div className="absolute inset-x-[8%] bottom-[4%] h-2 border border-zinc-600/60 bg-zinc-900" />
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[9px] tracking-[.22em] text-zinc-600">DESTINATION SELECTED · PRESS GO</div>
          </div>

          <aside className="border border-white/10 bg-[#090c11] p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div><div className="text-[10px] tracking-[.25em] text-cyan-300">FLOOR CONTROL</div><div className="mt-1 text-xs text-zinc-500">Where are you going?</div></div>
              <div className="flex h-12 w-12 items-center justify-center border border-cyan-300/40 bg-cyan-300/5 text-xl font-black text-cyan-200">{selectedFloor}</div>
            </div>
            <button type="button" onClick={() => { playClick(); setDirectoryOpen((open) => !open); }} className="mb-3 flex w-full items-center justify-center gap-2 border border-cyan-300/40 bg-cyan-300/10 px-3 py-3 text-[11px] font-black tracking-[.18em] text-cyan-100 transition hover:bg-cyan-300/20">
              <Map className="h-4 w-4" /> {directoryOpen ? "HIDE DIRECTORY" : "OPEN FLOOR DIRECTORY"}
            </button>
            {directoryOpen && (
              <div className="mb-3 max-h-[46vh] space-y-1 overflow-y-auto pr-1" aria-label="Floor directory">
                {Array.from({ length: 67 }, (_, i) => 67 - i).map((floor) => {
                  const info = floorInfo(floor);
                  const active = floor === selectedFloor;
                  const enabled = isPublicFloor(floor);
                  return (
                    <button key={floor} type="button" disabled={!enabled} onClick={() => chooseFloor(floor)} className={`flex w-full items-center gap-3 border px-3 py-2 text-left transition ${active ? "border-cyan-200/70 bg-cyan-300/15" : enabled ? "border-white/10 hover:border-cyan-300/50" : "border-white/5 opacity-45"}`}>
                      <span className={`w-7 text-right text-xs font-black ${active ? "text-cyan-200" : "text-zinc-500"}`}>{floor}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold tracking-[.1em]">{info.label}</span><span className="block truncate text-[9px] text-zinc-600">{info.detail}</span></span>
                      {!enabled && (SEALED_FLOORS.has(floor) ? <LockKeyhole className="h-3 w-3 text-zinc-600" /> : <span className="text-[8px] text-zinc-700">REGISTRY</span>)}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 66, 67].map((floor) => (
                <button key={floor} type="button" disabled={!isPublicFloor(floor)} onClick={() => chooseFloor(floor)} className={`border py-2 text-sm font-black transition ${floor === selectedFloor ? "border-cyan-200 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-zinc-400 hover:border-cyan-300/50"} disabled:cursor-not-allowed disabled:opacity-30`}>{floor}</button>
              ))}
            </div>
            <button type="button" onClick={toggleDoors} className="mt-3 flex w-full items-center justify-center gap-2 border border-white/15 px-3 py-2 text-[10px] font-bold tracking-[.15em] text-zinc-400 transition hover:border-white/35 hover:text-white"><DoorOpen className="h-3.5 w-3.5" /> {doorsOpen ? "CLOSE DOORS" : "OPEN DOORS"}</button>
            <button type="button" onClick={travel} disabled={!current.destination} className="mt-2 flex w-full items-center justify-center gap-2 bg-cyan-300 px-3 py-3 text-[11px] font-black tracking-[.2em] text-black transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600">
              <ArrowUp className="h-4 w-4" /> {current.destination ? `GO TO FLOOR ${selectedFloor}` : "ACCESS RESTRICTED"}
            </button>
            <p className="mt-3 text-center text-[9px] leading-4 tracking-[.08em] text-zinc-600">The directory shows public stops. Commercial floors are managed through the Realty Registry.</p>
          </aside>
        </section>
      </div>
    </main>
  );
}