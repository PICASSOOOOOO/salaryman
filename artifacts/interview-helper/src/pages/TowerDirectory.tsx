import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, Armchair, Bell, BriefcaseBusiness, Building2, CalendarDays, Check, ClipboardList, Clock3, DoorOpen, Footprints, KeyRound, Leaf, LockKeyhole, Mail, MapPinned, Shield, Sparkles, UserRound } from "lucide-react";
import { sfxFinalNotice, startTowerAmbient, stopTowerAmbient } from "@/soundEngine";
import { quoteShadowTowerArea, SHADOW_TOWER_FLOOR_ENVELOPE } from "@workspace/api-zod/shadow-tower";
import {
  completeReceptionTask,
  getBuildingOnboardingStage,
  startBuildingOnboarding,
  subscribeBuildingOnboarding,
  type BuildingOnboardingStage,
} from "@/lib/building-onboarding";
import { apiFetch } from "@/lib/api-client";
import { getActiveCityName } from "@/lib/city-defs";
import { TowerLifeHub } from "@/components/TowerLifeHub";
import { useAuth } from "@/hooks/use-auth";
import { getSalarymanName, markTutorialDone } from "@/lib/tutorial-progress";
import { PabloOnboarding, type OnboardingAnswers } from "@/components/PabloOnboarding";
import { defaultAppearance, drawPlayerSprite, type Appearance } from "@/lib/character-identity";
import { persistTowerOnboardingState, type TowerOnboardingState } from "@/lib/tower-onboarding";

const occupiedFloors = new Map([
  [67, { name: "SHADOW CORP", kind: "RESTRICTED", detail: "The roofline suite. No public access. The elevator stops listening.", tone: "shadow", icon: LockKeyhole }],
  [66, { name: "PICASSO ORG", kind: "YOUR ORGANIZATION", detail: "Executive floor · live office · private operations", href: "/office", tone: "pablo", icon: Building2 }],
  [65, { name: "UNLISTED FLOOR", kind: "SEALED", detail: "No public registration. The lift passes it without a number.", tone: "secret", icon: LockKeyhole }],
  [52, { name: "UNLISTED FLOOR", kind: "SEALED", detail: "Municipal records stop here. Something keeps the lights on.", tone: "secret", icon: LockKeyhole }],
  [40, { name: "UNLISTED FLOOR", kind: "SEALED", detail: "The construction plans are incomplete. Access is not.", tone: "secret", icon: LockKeyhole }],
  [4, { name: "SECURITY & CUSTODY", kind: "PUBLIC / GUARDED", detail: "Guards, debt collection, evidence, and holding.", href: "/tower/security", tone: "security", icon: Shield }],
  [3, { name: "INFIRMARY / HOTELS", kind: "PUBLIC", detail: "Free observation and operator-run beds by the hour.", href: "/tower/rest", tone: "rest", icon: Building2 }],
  [2, { name: "COMPUTER CAFE", kind: "PUBLIC", detail: "Work board, terminals, and elevator music.", href: "/tower/mezzanine?focus=classifieds", tone: "cafe", icon: Building2 }],
  [1, { name: "RECREATION", kind: "PUBLIC", detail: "Games, food, conversation, and a place to begin.", href: "/recreation", tone: "rec", icon: Sparkles }],
]);

const RECEPTION_BRIEFING = [
  "Shadow Tower was built as a vertical city: work below, private power above. Sixty-seven floors, and every floor has rules.",
  "Your hostel bed is free. The Computer Cafe on Floor 2 is also open to you, including one public terminal. That is where you can find work and use COMMS.",
  "If you need work, lodging, organization records, or help understanding the building, come back to this desk.",
];

function LobbyPlayerArt() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let appearance: Appearance = defaultAppearance("salaryman");
    try {
      const raw = window.localStorage.getItem("sm_save");
      const saved = raw ? JSON.parse(raw) : {};
      if (saved?.appearance && typeof saved.appearance === "object") {
        appearance = { ...appearance, ...saved.appearance };
      }
    } catch {}
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height - 10);
    ctx.scale(3.2, 3.2);
    drawPlayerSprite(ctx, appearance, { pCls: "salaryman" });
    ctx.restore();
  }, []);
  return <canvas ref={canvasRef} width={72} height={150} aria-label="Your character waiting in the lobby" className="h-32 w-20" />;
}

function TowerQueueLobby() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b12] text-zinc-100" data-testid="tower-queue-lobby">
      <img src={`${import.meta.env.BASE_URL}tower-art/lobby-reception.png`} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-45" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,7,14,.42),rgba(3,7,14,.9)_78%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-7 sm:px-10">
        <header className="flex items-start justify-between border-b border-cyan-200/20 pb-5">
          <div>
            <p className="text-[10px] font-black tracking-[.35em] text-cyan-200">SHADOW TOWER · LOBBY</p>
            <h1 className="mt-3 text-2xl font-black tracking-[.16em] text-white sm:text-5xl">CHECK-IN QUEUE</h1>
            <p className="mt-2 max-w-xl text-xs leading-6 tracking-[.1em] text-zinc-400">The lobby is busy. Wait behind the next visitor and the reception desk will call you forward.</p>
          </div>
          <div className="border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-right text-[9px] font-bold tracking-[.18em] text-emerald-200">
            DESK ACTIVE
            <span className="mt-1 block text-zinc-500">QUEUE 04</span>
          </div>
        </header>
        <section className="relative mt-8 flex-1 overflow-hidden border border-white/15 bg-[#09121b]/75 p-5 shadow-[0_30px_100px_rgba(0,0,0,.55)] sm:p-10">
          <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[linear-gradient(150deg,transparent_48%,rgba(125,211,252,.1)_49%,transparent_51%),linear-gradient(30deg,transparent_48%,rgba(236,72,153,.08)_49%,transparent_51%)] [background-size:110px_110px]" />
          <div className="relative grid min-h-[480px] grid-cols-2 items-end gap-3 sm:grid-cols-4 sm:gap-8">
            <figure className="relative flex flex-col items-center justify-end border-b border-amber-200/25 pb-3">
              <img src={`${import.meta.env.BASE_URL}tower-art/character-claw-prime.png`} alt="Visitor waiting ahead" className="h-40 w-full object-contain object-bottom opacity-75 sm:h-56" />
              <figcaption className="mt-2 text-[9px] font-bold tracking-[.2em] text-amber-200/70">AHEAD · 03</figcaption>
            </figure>
            <figure className="relative flex flex-col items-center justify-end border-b border-violet-200/25 pb-3">
              <img src={`${import.meta.env.BASE_URL}tower-art/character-receptionist.png`} alt="Visitor waiting in the lobby" className="h-44 w-full object-contain object-bottom opacity-65 sm:h-60" />
              <figcaption className="mt-2 text-[9px] font-bold tracking-[.2em] text-violet-200/70">AHEAD · 02</figcaption>
            </figure>
            <figure className="relative flex flex-col items-center justify-end border border-cyan-200/45 bg-cyan-300/[.06] pb-3 shadow-[0_0_30px_rgba(34,211,238,.12)]">
              <span className="absolute left-2 top-2 text-[8px] font-black tracking-[.2em] text-cyan-200">YOU</span>
              <LobbyPlayerArt />
              <figcaption className="mt-2 text-[9px] font-bold tracking-[.2em] text-cyan-200">WAITING · 01</figcaption>
            </figure>
            <figure className="relative flex flex-col items-center justify-end border-b border-emerald-200/25 pb-3">
              <img src={`${import.meta.env.BASE_URL}tower-art/character-claw-prime.png`} alt="Another visitor waiting in the lobby" className="h-36 w-full scale-x-[-1] object-contain object-bottom opacity-45 sm:h-52" />
              <figcaption className="mt-2 text-[9px] font-bold tracking-[.2em] text-emerald-200/60">BEHIND · 00</figcaption>
            </figure>
          </div>
          <div className="relative mt-6 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-5 sm:flex-row">
            <p className="text-center text-[10px] font-bold tracking-[.22em] text-zinc-500 sm:text-left">PLEASE WAIT · RECEPTION IS PROCESSING THE LINE</p>
            <Link href="/sign-in?returnTo=%2Ftower" className="border border-cyan-200/55 bg-cyan-300/10 px-5 py-3 text-center text-xs font-black tracking-[.16em] text-cyan-100 transition hover:bg-cyan-300/20">CHECK IN AT RECEPTION</Link>
          </div>
        </section>
        <footer className="pt-5 text-[9px] font-bold tracking-[.24em] text-zinc-600">FLOOR ACCESS · HOSTEL BED · COMPUTER CAFE · RECEPTION REGISTRY</footer>
      </div>
    </main>
  );
}

// Every commercial row links to the real registry flow. The directory does not
// render fake claim buttons or imply that a non-existent office is enterable.
const floors = Array.from({ length: 67 }, (_, index) => {
  const floor = 67 - index;
  const existing = occupiedFloors.get(floor);
  if (existing) {
    return { floor, quote: null, href: "href" in existing ? existing.href : undefined, ...existing };
  }

  const quote = floor >= 5 && floor <= 64
    ? quoteShadowTowerArea("founder_team", floor, "lease", SHADOW_TOWER_FLOOR_ENVELOPE.squareMeters)
    : null;

  return {
    floor,
    name: quote ? "COMMERCIAL FLOOR" : "UNAVAILABLE",
    kind: quote ? "LIVE REGISTRY" : "RESTRICTED",
    detail: quote ? "Open the registry to price, lease, or purchase this floor" : "This floor is not available through the commercial registry",
    href: quote ? `/store/realty?floor=${floor}` : undefined,
    quote,
    tone: "future" as const,
    icon: quote ? Building2 : KeyRound,
  };
});

export default function TowerDirectory() {
  const { user, isAuthenticated } = useAuth();
  const [stage, setStage] = useState<BuildingOnboardingStage>(() => getBuildingOnboardingStage());
  const [now, setNow] = useState(() => new Date());
  const [talking, setTalking] = useState(false);
  const [notice, setNotice] = useState("");
  const [filing, setFiling] = useState(false);
  const [filingResult, setFilingResult] = useState("");
  const [arrivalPhase, setArrivalPhase] = useState<"fade" | "waiting" | "ready">("fade");
  const [onboardingStep, setOnboardingStep] = useState<"arrival" | "reception" | "questions" | "hostel" | "briefing" | "alert" | "complete">("arrival");
  const [hostelFloor, setHostelFloor] = useState(3);
  const [briefingLine, setBriefingLine] = useState(0);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const onboardingLocked = stage === "not_started" || stage === "reception";
  const workTaskActive = stage === "work";

  useEffect(() => {
    startTowerAmbient("lobby");
    return () => stopTowerAmbient();
  }, []);

  useEffect(() => subscribeBuildingOnboarding(setStage), []);
  useEffect(() => {
    if (stage !== "not_started") return;
    startBuildingOnboarding();
    setStage("reception");
  }, [stage]);
  useEffect(() => {
    if (!onboardingLocked) {
      setArrivalPhase("ready");
      return;
    }
    setArrivalPhase("fade");
    const waitingTimer = window.setTimeout(() => setArrivalPhase("waiting"), 900);
    const receptionTimer = window.setTimeout(() => {
      setArrivalPhase("ready");
      setOnboardingStep("reception");
      setTalking(true);
    }, 3600);
    return () => {
      window.clearTimeout(waitingTimer);
      window.clearTimeout(receptionTimer);
    };
  }, [onboardingLocked]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const explainLock = (label: string) => {
    setNotice(`${label} LOCKED · REPORT TO RECEPTION`);
    window.setTimeout(() => setNotice(""), 2400);
  };

  const finishReception = () => {
    setTalking(false);
    setOnboardingStep("questions");
  };

  const finishQuestions = async (answers: OnboardingAnswers) => {
    try {
      const raw = window.localStorage.getItem("sm_save");
      const prior = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem("sm_save", JSON.stringify({
        ...(prior && typeof prior === "object" ? prior : {}),
        name: answers.playerName,
        pabloOnboardingDone: true,
        appearance: answers.appearance,
        hasBusiness: answers.bizPath === "business",
        bizType: answers.businessType,
        company: answers.bizPath === "business" ? answers.companyName : null,
        industry: answers.bizPath === "business" ? answers.industry : null,
        officeTier: answers.officeTier,
        homeCityId: answers.homeCityId,
        cityId: answers.homeCityId,
      }));
    } catch {}
    setSavingOnboarding(true);
    try {
      await persistTowerOnboardingState({ status: "housing" });
    } catch (error) {
      setNotice(error instanceof Error ? error.message.toUpperCase() : "TOWER RECORD SYNC FAILED");
    } finally {
      setSavingOnboarding(false);
      setOnboardingStep("hostel");
    }
  };

  const acceptHostelBed = async () => {
    const bed = { floor: hostelFloor, room: `${hostelFloor}H-${String(Date.now()).slice(-3)}`, free: true as const };
    const state: TowerOnboardingState = {
      status: "briefing",
      hostelBed: bed,
      publicTerminalAccess: true,
    };
    setSavingOnboarding(true);
    try {
      const raw = window.localStorage.getItem("sm_save");
      const prior = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem("sm_save", JSON.stringify({
        ...(prior && typeof prior === "object" ? prior : {}),
        hostelBed: bed,
        publicTerminalAccess: true,
      }));
      await persistTowerOnboardingState(state);
      setOnboardingStep("briefing");
    } catch (error) {
      setNotice(error instanceof Error ? error.message.toUpperCase() : "BED ASSIGNMENT FAILED");
    } finally {
      setSavingOnboarding(false);
    }
  };

  const triggerLockdown = () => {
    setOnboardingStep("alert");
    sfxFinalNotice();
    window.setTimeout(() => sfxFinalNotice(), 1100);
    window.setTimeout(() => sfxFinalNotice(), 2200);
  };

  const finishLockdown = async () => {
    setSavingOnboarding(true);
    try {
      await persistTowerOnboardingState({
        status: "complete",
        hostelBed: { floor: hostelFloor, room: `${hostelFloor}H`, free: true },
        publicTerminalAccess: true,
        lockdownActive: true,
        completedAt: new Date().toISOString(),
      });
      markTutorialDone();
      completeReceptionTask();
      setOnboardingStep("complete");
      setNotice("TOWER LOCKDOWN ACTIVE · RECEPTION REMAINS AVAILABLE");
      window.setTimeout(() => setNotice(""), 4000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message.toUpperCase() : "LOCKDOWN RECORD SYNC FAILED");
    } finally {
      setSavingOnboarding(false);
    }
  };

  const fileUnemployment = async () => {
    setFiling(true);
    setFilingResult("");
    try {
      const response = await apiFetch("/api/world/employment/unemployment", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Filing rejected");
      setFilingResult("UNEMPLOYMENT STATUS FILED · FINANCE TRACKER CONFIRMED");
    } catch (error) {
      setFilingResult(error instanceof Error ? error.message.toUpperCase() : "FILING FAILED");
    } finally {
      setFiling(false);
    }
  };

  if (!isAuthenticated) return <TowerQueueLobby />;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050711] px-3 py-5 text-zinc-100 sm:px-8">
      <style>{`@keyframes lobbyLight{0%,100%{opacity:.48;filter:brightness(.9)}50%{opacity:.9;filter:brightness(1.2)}}@keyframes lobbyPlant{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(3deg)}}@keyframes lobbyStatus{0%,100%{box-shadow:0 0 0 rgba(34,211,238,0)}50%{box-shadow:0 0 14px rgba(34,211,238,.2)}}`}</style>
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex items-end justify-between gap-4 border-b border-cyan-300/20 pb-4">
          <div>
            <p className="animate-pulse text-[10px] tracking-[.35em] text-cyan-300">SHADOW TOWER · {getActiveCityName().toUpperCase()} · LOBBY FLOOR</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">START HERE.</h1>
            <p className="mt-2 text-[10px] font-bold tracking-[.2em] text-zinc-500">RECEPTION · WORK · FLOOR ACCESS</p>
          </div>
           <Link href="/office" className="hidden sm:block text-xs text-zinc-500 hover:text-cyan-300">BACK TO OFFICE</Link>
        </header>

        {notice && (
          <div className="fixed left-1/2 top-20 z-[900] -translate-x-1/2 border border-amber-300/50 bg-[#160f05]/95 px-4 py-2 text-center text-[10px] font-bold tracking-[.2em] text-amber-200 shadow-xl" role="status">
            {notice}
          </div>
        )}

        <section className="relative mb-5 overflow-hidden border border-cyan-300/25 bg-[#07101a] shadow-[0_30px_90px_rgba(0,0,0,.45)]" data-testid="lobby-map">
          <img
            src={`${import.meta.env.BASE_URL}tower-art/lobby-reception.png`}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,17,.35),rgba(5,7,17,.9))]" />
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[.025] px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.22em] text-cyan-200">
              <MapPinned className="h-4 w-4" /> SHADOW TOWER · MAIN LOBBY
            </div>
            <div className="hidden text-[9px] tracking-[.18em] text-zinc-500 sm:block">HOME CITY · {getActiveCityName()}</div>
            <div className={`flex items-center gap-2 text-[9px] tracking-[.18em] ${onboardingLocked ? "text-amber-300" : "text-emerald-300"}`}>
              <span className={`h-2 w-2 rounded-full ${onboardingLocked ? "animate-pulse bg-amber-300" : "bg-emerald-300"}`} />
              {onboardingLocked ? "RECEPTION REQUIRED" : workTaskActive ? "WORK ROUTE ACTIVE" : "ACCESS READY"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-b border-white/10 bg-[#080d14]/85 p-3 sm:grid-cols-4 sm:gap-3 sm:p-4">
            <div className="flex items-center gap-3 border border-cyan-300/20 bg-cyan-300/[.04] px-3 py-2.5">
              <Clock3 className="h-5 w-5 shrink-0 text-cyan-200" />
              <div>
                <div className="font-mono text-lg font-black tracking-[.08em] text-cyan-100">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                <div className="text-[8px] font-bold tracking-[.18em] text-zinc-600">LOCAL TOWER TIME</div>
              </div>
            </div>
            <Link href="/business/calendar" className="flex items-center gap-3 border border-violet-300/20 bg-violet-300/[.04] px-3 py-2.5 transition hover:border-violet-200/60">
              <CalendarDays className="h-5 w-5 shrink-0 text-violet-200" />
              <div>
                <div className="font-mono text-lg font-black tracking-[.08em] text-violet-100">{now.getDate()}</div>
                <div className="text-[8px] font-bold tracking-[.18em] text-zinc-600">{now.toLocaleDateString([], { month: "short" }).toUpperCase()} · CALENDAR</div>
              </div>
            </Link>
            <button type="button" onClick={() => setNotice("MAIL DROP · NO NEW MAIL")} className="flex items-center gap-3 border border-amber-300/20 bg-amber-300/[.04] px-3 py-2.5 text-left transition hover:border-amber-200/60">
              <Mail className="h-5 w-5 shrink-0 text-amber-200" />
              <div>
                <div className="font-mono text-lg font-black tracking-[.08em] text-amber-100">0</div>
                <div className="text-[8px] font-bold tracking-[.18em] text-zinc-600">MAIL DROP · INBOX</div>
              </div>
            </button>
            <button type="button" onClick={() => setNotice("TOWER NOTICE BOARD · ALL CLEAR")} className="flex items-center gap-3 border border-emerald-300/20 bg-emerald-300/[.04] px-3 py-2.5 text-left transition hover:border-emerald-200/60">
              <Bell className="h-5 w-5 shrink-0 text-emerald-200" />
              <div>
                <div className="font-mono text-lg font-black tracking-[.08em] text-emerald-100">OK</div>
                <div className="text-[8px] font-bold tracking-[.18em] text-zinc-600">NOTICE BOARD</div>
              </div>
            </button>
          </div>

           <div className="relative min-h-[430px] overflow-hidden bg-[radial-gradient(ellipse_at_50%_4%,rgba(226,232,240,.12),transparent_26%),linear-gradient(150deg,#172331,#070b11_72%)] p-4 sm:min-h-[520px] sm:p-8">
             <div aria-hidden="true" className="pointer-events-none absolute inset-x-[8%] top-0 h-24 bg-[linear-gradient(180deg,rgba(226,232,240,.12),transparent)] opacity-70" />
             <div aria-hidden="true" className="pointer-events-none absolute left-[18%] top-5 h-1 w-20 bg-white/45 shadow-[0_0_18px_rgba(255,255,255,.7)] sm:w-28" style={{ animation: "lobbyLight 3.6s ease-in-out infinite" }} />
             <div aria-hidden="true" className="pointer-events-none absolute right-[18%] top-5 h-1 w-20 bg-white/45 shadow-[0_0_18px_rgba(255,255,255,.7)] sm:w-28" style={{ animation: "lobbyLight 3.6s ease-in-out 1.2s infinite" }} />
             <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[43%] bg-[linear-gradient(155deg,transparent_48%,rgba(148,163,184,.12)_49%,transparent_51%),linear-gradient(25deg,transparent_48%,rgba(148,163,184,.08)_49%,transparent_51%)] [background-size:90px_90px] opacity-60" />

             <div className="relative mx-auto grid h-full max-w-5xl grid-cols-[minmax(72px,.8fr)_minmax(170px,2.2fr)_minmax(82px,1fr)] grid-rows-[120px_1fr_105px] gap-3 rounded-sm border border-white/15 bg-[#0b121b]/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_24px_60px_rgba(0,0,0,.4)] sm:grid-cols-[1fr_2.4fr_1.1fr] sm:grid-rows-[145px_1fr_125px] sm:gap-5 sm:p-5">
              <button
                type="button"
                onClick={() => onboardingLocked ? explainLock("STAIRS") : setNotice("STAIRS OPEN · USE THE FLOOR DIRECTORY BELOW")}
                className={`relative row-span-2 flex flex-col items-center justify-center border p-2 transition ${onboardingLocked ? "border-red-400/25 bg-red-950/10 text-red-300/55" : "border-zinc-500/35 bg-zinc-900/50 text-zinc-300 hover:border-cyan-300/60"}`}
                data-testid="lobby-stairs"
              >
                <Footprints className="mb-2 h-5 w-5" />
                 <span className="[writing-mode:vertical-rl] text-[9px] font-bold tracking-[.18em] sm:[writing-mode:initial]">STAIRWELL</span>
                {onboardingLocked && <LockKeyhole className="absolute right-2 top-2 h-4 w-4" />}
              </button>

               <div className="relative flex items-center justify-center border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.01))]">
                <div className="text-center">
                   <p className="text-[9px] font-bold tracking-[.28em] text-zinc-400">ARRIVAL HALL</p>
                   <p className="mt-1 text-[9px] tracking-[.12em] text-zinc-600">SHADOW TOWER · {getActiveCityName().toUpperCase()}</p>
                   <div className="mt-4 flex justify-center gap-4">
                     <span className="h-9 w-2 rounded-full border border-emerald-200/25 bg-emerald-300/15" />
                     <span className="h-9 w-2 rounded-full border border-emerald-200/25 bg-emerald-300/15" />
                     <span className="h-9 w-2 rounded-full border border-emerald-200/25 bg-emerald-300/15" />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onboardingLocked ? explainLock("ELEVATOR") : setNotice("ELEVATOR OPEN · SELECT A FLOOR BELOW")}
                className={`relative row-span-2 flex flex-col items-center justify-center border p-2 transition ${onboardingLocked ? "border-red-400/25 bg-red-950/10 text-red-300/55" : "border-zinc-500/35 bg-zinc-900/50 text-zinc-300 hover:border-cyan-300/60"}`}
                data-testid="lobby-elevator"
              >
                 <DoorOpen className="mb-2 h-6 w-6 text-cyan-200" />
                 <span className="text-[9px] font-bold tracking-[.18em]">ELEVATOR A</span>
                 <span className="mt-2 h-1 w-8 bg-emerald-300/70 shadow-[0_0_10px_rgba(110,231,183,.6)]" />
                {onboardingLocked && <LockKeyhole className="absolute right-2 top-2 h-4 w-4" />}
              </button>

              <div id="reception" className={`relative flex items-center justify-center border p-3 transition-all ${onboardingLocked ? "border-cyan-200/70 bg-cyan-300/10 shadow-[0_0_45px_rgba(34,211,238,.18)]" : "border-cyan-300/30 bg-cyan-300/5"}`}>
                {onboardingLocked && (
                  <div className="absolute -top-11 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap border border-amber-300/45 bg-[#151006] px-3 py-2 text-[9px] font-black tracking-[.18em] text-amber-200 shadow-lg">
                    SPEAK HERE <span className="ml-2 animate-pulse">&gt;&gt;</span>
                    <div className="absolute left-1/2 top-full h-3 w-px bg-amber-300/60" />
                  </div>
                )}
                 <div className="absolute bottom-2 left-2 text-[8px] tracking-[.18em] text-cyan-200/45">RECEPTION · FLOOR L</div>
                 <button
                  type="button"
                  onClick={() => setTalking(true)}
                   className="group relative flex w-full max-w-sm flex-col items-center overflow-hidden border border-cyan-200/35 bg-[#081722] p-4 text-center transition hover:-translate-y-0.5 hover:border-cyan-100"
                  data-testid="speak-receptionist"
                >
                   <span className="relative mb-3 flex h-24 w-24 items-end justify-center overflow-hidden rounded-full border border-cyan-200/40 bg-[radial-gradient(circle,#16445a,#07121d)]">
                     <img src={`${import.meta.env.BASE_URL}tower-art/character-claw-prime.png`} alt="Claw Prime" className="h-28 w-28 object-contain object-bottom" />
                    <span className="absolute -right-1 top-0 h-3 w-3 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_10px_#6ee7b7]" />
                  </span>
                  <span className="text-[9px] font-bold tracking-[.28em] text-cyan-300">CLAW PRIME · RECEPTION LEAD</span>
                  <span className="mt-1 text-sm font-black tracking-[.12em] text-white">{onboardingLocked ? "TALK" : "FRONT DESK"}</span>
                  <span className="mt-2 text-[10px] text-zinc-500 group-hover:text-zinc-300">PRESS OR TAP TO SPEAK</span>
                </button>
              </div>

               <div className="flex items-center justify-center border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.01))] text-center text-[9px] tracking-[.2em] text-zinc-500">
                 <span className="flex flex-col items-center gap-1"><img src={`${import.meta.env.BASE_URL}pixel-agents/shadow-tower/directory.png`} alt="" className="h-12 w-16 object-contain opacity-75" /> WAITING LOUNGE</span>
              </div>

               <div className="flex items-center justify-center border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.01))]">
                  <img src={`${import.meta.env.BASE_URL}pixel-agents/shadow-tower/vending.png`} alt="Lobby vending machine" className="h-16 w-20 object-contain opacity-75" />
               </div>

              <div className="col-span-3 grid grid-cols-[1fr_1.8fr_1fr] gap-3 sm:gap-5">
                 <div className="flex items-center justify-center gap-2 border border-white/10 bg-[#080d13]/75 text-[9px] tracking-[.15em] text-zinc-500"><img src={`${import.meta.env.BASE_URL}pixel-agents/shadow-tower/desk-terminal.png`} alt="" className="h-11 w-11 object-contain opacity-75" /> SECURITY DESK</div>
                {onboardingLocked ? (
                  <button
                    type="button"
                    onClick={() => explainLock("WORK ACCESS")}
                    className="relative flex items-center justify-center gap-2 border border-red-400/30 bg-red-950/10 text-[10px] font-bold tracking-[.18em] text-red-300/60"
                    data-testid="work-door-locked"
                  >
                    <LockKeyhole className="h-4 w-4" /> WORK ACCESS · LOCKED
                  </button>
                ) : (
                  <Link
                    href="/tower/mezzanine?focus=classifieds"
                    className={`relative flex items-center justify-center gap-2 border text-[10px] font-black tracking-[.18em] transition hover:-translate-y-0.5 ${workTaskActive ? "border-amber-200/70 bg-amber-300/10 text-amber-100 shadow-[0_0_38px_rgba(252,211,77,.15)]" : "border-cyan-300/35 bg-cyan-300/5 text-cyan-100 hover:border-cyan-200"}`}
                    data-testid="work-access-door"
                  >
                    {workTaskActive && (
                      <span className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap border border-amber-300/45 bg-[#151006] px-3 py-2 text-[9px] text-amber-200">
                        GO TO WORK <span className="ml-2 animate-pulse">&gt;&gt;</span>
                      </span>
                    )}
                    <DoorOpen className="h-4 w-4" /> WORK ACCESS <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
                 <div className="flex items-center justify-center border border-white/10 bg-[#080d13]/75 text-[9px] tracking-[.15em] text-zinc-500">LOBBY SERVICES</div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="mb-5 border border-cyan-300/35 bg-[radial-gradient(circle_at_85%,#12364a,#08111b)] p-5 shadow-[0_0_40px_rgba(34,211,238,.08)]"
          data-testid="reception-desk"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-cyan-300/40 bg-cyan-300/10">
                <ClipboardList className="h-5 w-5 text-cyan-200" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[.3em] text-cyan-200">CLAW PRIME · BUILDING OPERATIONS</p>
                <h2 className="mt-1 text-xl font-black tracking-[.12em] text-white">{onboardingLocked ? "CHECK IN REQUIRED" : "FRONT DESK SERVICES"}</h2>
                 <p className="mt-2 text-[10px] font-bold tracking-[.16em] text-zinc-500">
                   {onboardingLocked ? "CHECK IN TO UNLOCK THE BUILDING" : "SELECT A SERVICE TO CONTINUE"}
                 </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-bold tracking-[.13em]">
                  <span className="border border-violet-300/20 bg-violet-300/5 px-2 py-1 text-violet-200">MILA · SHADOW LIAISON</span>
                  <span className="border border-emerald-300/20 bg-emerald-300/5 px-2 py-1 text-emerald-200">FINANCE TRACKER · FILINGS</span>
                </div>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <figure className="w-20 text-center">
                <img src={`${import.meta.env.BASE_URL}tower-art/character-receptionist.png`} alt="Shadow Tower receptionist" className="h-24 w-full object-contain object-bottom" />
                <figcaption className="mt-1 text-[7px] font-bold tracking-[.16em] text-cyan-200/70">RECEPTION</figcaption>
              </figure>
              <figure className="w-20 text-center">
                <img src={`${import.meta.env.BASE_URL}tower-art/character-claw-prime.png`} alt="Claw Prime" className="h-24 w-full object-contain object-bottom" />
                <figcaption className="mt-1 text-[7px] font-bold tracking-[.16em] text-amber-200/70">CLAW PRIME</figcaption>
              </figure>
            </div>
            <div className="flex shrink-0 items-center gap-2 border border-emerald-300/20 bg-emerald-300/5 px-3 py-2 text-[10px] tracking-[.18em] text-emerald-200">
              <DoorOpen className="h-3.5 w-3.5" /> DESK ACTIVE
            </div>
          </div>
          {onboardingLocked ? (
            <button type="button" onClick={() => setTalking(true)} className="mt-4 flex w-full items-center justify-center gap-2 border border-cyan-200/50 bg-cyan-300/10 px-4 py-3 text-xs font-black tracking-[.16em] text-cyan-100 transition hover:bg-cyan-300/15">
              <UserRound className="h-4 w-4" /> SPEAK WITH RECEPTIONIST
            </button>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Link href="/tower/mezzanine?focus=classifieds" className="flex items-center gap-2 border border-cyan-300/25 bg-cyan-300/5 px-3 py-3 text-xs font-bold tracking-[.12em] text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/10">
                <BriefcaseBusiness className="h-4 w-4" /> REQUEST WORK
              </Link>
              <Link href="/tower/rest" className="flex items-center gap-2 border border-cyan-300/25 bg-cyan-300/5 px-3 py-3 text-xs font-bold tracking-[.12em] text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/10">
                <Building2 className="h-4 w-4" /> REQUEST LODGING
              </Link>
              <Link href="/office" className="flex items-center gap-2 border border-amber-300/25 bg-amber-300/5 px-3 py-3 text-xs font-bold tracking-[.12em] text-amber-100 transition hover:border-amber-200 hover:bg-amber-300/10">
                <KeyRound className="h-4 w-4" /> OFFICE APPOINTMENT
              </Link>
              <Link href="/business" className="flex items-center gap-2 border border-violet-300/25 bg-violet-300/5 px-3 py-3 text-xs font-bold tracking-[.12em] text-violet-100 transition hover:border-violet-200 hover:bg-violet-300/10">
                <ClipboardList className="h-4 w-4" /> BUSINESS DESK
              </Link>
              <Link href="/store/realty?from=reception" className="flex items-center gap-2 border border-pink-300/25 bg-pink-300/5 px-3 py-3 text-xs font-bold tracking-[.12em] text-pink-100 transition hover:border-pink-200 hover:bg-pink-300/10">
                <Building2 className="h-4 w-4" /> RENT / BUY A FLOOR
              </Link>
            </div>
          )}
          {!onboardingLocked && (
             <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-bold tracking-[.14em] text-zinc-600">
               <span className="border border-white/10 px-2 py-1">RENTAL REGISTRY</span>
               <span className="border border-white/10 px-2 py-1">EMPLOYMENT DESK</span>
               <span className="border border-white/10 px-2 py-1">CITY ACCESS</span>
             </div>
          )}
        </section>

        <div className="mb-5">
          <TowerLifeHub compact cityLabel={getActiveCityName().toUpperCase()} floorLabel="RECEPTION WALL · ALL TENANTS" />
        </div>

        <details className="border border-white/10 bg-white/[.015]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-[10px] font-bold tracking-[.2em] text-zinc-400 hover:text-cyan-200">
            <span>FULL 67-FLOOR DIRECTORY</span>
            <span>{onboardingLocked ? "LOCKED UNTIL CHECK-IN" : "OPEN"}</span>
          </summary>
          <div className="grid gap-2 border-t border-white/10 p-3">
          {floors.map(({ floor, name, kind, detail, href, tone, icon: Icon, quote }) => {
            const content = <div className={`group relative flex items-center gap-4 overflow-hidden border p-4 transition duration-500 hover:-translate-y-0.5 hover:pl-6 ${
              tone === "shadow" ? "border-violet-500/50 bg-[radial-gradient(circle_at_80%,#301044,#0b0714)] hover:border-violet-300" :
              tone === "pablo" ? "border-amber-300/40 bg-[radial-gradient(circle_at_80%,#46331a,#101018)] hover:border-amber-200" :
              tone === "security" ? "border-red-400/30 bg-red-950/10 hover:border-red-300" :
              tone === "secret" ? "border-violet-400/25 bg-violet-950/10 hover:border-violet-300" :
              "border-white/10 bg-white/[.025] hover:border-cyan-300/50"
            }`}>
              <div className="w-12 text-center font-mono text-xl text-zinc-500 group-hover:text-cyan-300 transition-colors">{String(floor).padStart(2, "0")}</div>
              <Icon className={`h-5 w-5 shrink-0 ${tone === "shadow" || tone === "secret" ? "text-violet-300 animate-pulse" : tone === "pablo" ? "text-amber-300" : "text-cyan-300"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="tracking-[.15em]">{name}</strong>
                  <span className="text-[9px] tracking-[.2em] text-zinc-500">{kind}</span>
                </div>
              {quote ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="text-xs text-cyan-400/80 font-mono flex flex-wrap gap-x-4 gap-y-1">
                      <span>ƒ{quote.totalFiat.toLocaleString()}/mo</span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-400">{quote.squareMeters.toLocaleString()}m²</span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-400">ƒ{quote.fiatPerSquareMeter.toFixed(1)}/m²</span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-400">2-4 OFFICE CAPABILITY</span>
                    </div>

                    {/* Compact schematic hallway + office-bay motif */}
                    <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                      <div className="h-2 w-8 bg-zinc-700/50 border border-zinc-600 rounded-sm"></div>
                      <div className="h-1 w-16 bg-cyan-900/40 rounded-full flex justify-around items-center px-1">
                        <div className="h-0.5 w-0.5 bg-cyan-500/50 rounded-full"></div>
                        <div className="h-0.5 w-0.5 bg-cyan-500/50 rounded-full"></div>
                      </div>
                      <div className="h-2 w-8 bg-zinc-700/50 border border-zinc-600 rounded-sm"></div>
                      <div className="h-2 w-8 bg-zinc-700/50 border border-zinc-600 rounded-sm"></div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">{detail}</p>
                )}
              </div>
              {href && !onboardingLocked ? <span className="text-xs text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity">OPEN →</span> : <span className="text-[9px] tracking-widest text-zinc-600">{onboardingLocked && href ? "CHECK IN FIRST" : tone === "shadow" || tone === "secret" ? "SEALED" : "UNAVAILABLE"}</span>}
              <div className="absolute inset-y-0 left-0 w-0.5 bg-cyan-300/0 group-hover:bg-cyan-300/70 transition-colors" />
            </div>;
            return href && !onboardingLocked ? <Link key={floor} href={href}>{content}</Link> : <div key={floor}>{content}</div>;
          })}
          </div>
        </details>
        <footer className="mt-5 flex items-center gap-2 text-[10px] tracking-[.2em] text-zinc-600"><KeyRound className="h-3 w-3" /> HIGHER FLOORS COST MORE · ACCESS IS DECIDED AT THE DOOR · PIN OR ROLE REQUIRED FOR PRIVATE SPACE</footer>
      </div>

      {onboardingLocked && arrivalPhase !== "ready" && (
        <div
          className="fixed inset-0 z-[850] flex items-center justify-center overflow-hidden bg-[#03050a] px-5 transition-opacity duration-700"
          data-testid="lobby-arrival-intro"
          aria-live="polite"
        >
          <img src={`${import.meta.env.BASE_URL}tower-art/lobby-reception.png`} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,5,10,.55),rgba(3,5,10,.9))]" />
          <div className={`relative w-full max-w-4xl transition-all duration-700 ${arrivalPhase === "fade" ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"}`}>
            <div className="mb-7 text-center">
              <p className="text-[9px] font-bold tracking-[.42em] text-cyan-300/70">SHADOW TOWER · LOBBY</p>
              <h2 className="mt-3 text-2xl font-black tracking-[.18em] text-white sm:text-4xl">PLEASE WAIT</h2>
              <p className="mt-3 text-xs tracking-[.14em] text-zinc-500">RECEPTION WILL SEE YOU SHORTLY</p>
            </div>

            <div className="relative grid grid-cols-5 items-end gap-2 border border-cyan-200/20 bg-[linear-gradient(160deg,rgba(22,42,57,.9),rgba(5,9,16,.96))] px-3 pb-5 pt-8 shadow-[0_25px_90px_rgba(0,0,0,.6)] sm:gap-5 sm:px-8">
              <div className="absolute inset-x-8 bottom-4 h-px bg-cyan-300/20" />
              <figure className="relative z-10 text-center opacity-45">
                <div className="mx-auto flex h-24 items-end justify-center border-b border-emerald-300/30 bg-emerald-300/[.03] sm:h-32">
                  <img src={`${import.meta.env.BASE_URL}tower-art/character-claw-prime.png`} alt="Visitor moving through the busy lobby" className="h-28 w-full scale-x-[-1] object-contain object-bottom sm:h-36" />
                </div>
                <figcaption className="mt-3 text-[7px] font-bold tracking-[.14em] text-emerald-200/70">LOBBY TRAFFIC</figcaption>
              </figure>
              <figure className="relative z-10 text-center">
                <div className="mx-auto flex h-28 items-end justify-center border-b border-cyan-300/30 bg-cyan-300/[.04] sm:h-36">
                  <LobbyPlayerArt />
                </div>
                <figcaption className="mt-3 text-[8px] font-bold tracking-[.2em] text-cyan-200/70">YOU · WAITING</figcaption>
              </figure>
              <figure className="relative z-10 text-center">
                <div className="mx-auto flex h-28 items-end justify-center border-b border-amber-300/30 bg-amber-300/[.04] sm:h-36">
                  <img src={`${import.meta.env.BASE_URL}tower-art/character-receptionist.png`} alt="Another visitor waiting ahead of you" className="h-32 w-full object-contain object-bottom sm:h-40" />
                </div>
                <figcaption className="mt-3 text-[8px] font-bold tracking-[.2em] text-amber-200/80">VISITOR · AHEAD</figcaption>
              </figure>
              <figure className="relative z-10 text-center">
                <div className="mx-auto flex h-24 items-end justify-center border-b border-pink-300/30 bg-pink-300/[.03] sm:h-32">
                  <img src={`${import.meta.env.BASE_URL}tower-art/character-claw-prime.png`} alt="Visitor being processed at reception" className="h-28 w-full object-contain object-bottom opacity-70 sm:h-36" />
                </div>
                <figcaption className="mt-3 text-[7px] font-bold tracking-[.14em] text-pink-200/70">AT THE DESK</figcaption>
              </figure>
              <figure className="relative z-10 text-center">
                <div className="mx-auto flex h-28 items-end justify-center border-b border-violet-300/30 bg-violet-300/[.04] sm:h-36">
                  <img src={`${import.meta.env.BASE_URL}tower-art/character-claw-prime.png`} alt="Claw Prime at the reception desk" className="h-32 w-full object-contain object-bottom sm:h-40" />
                </div>
                <figcaption className="mt-3 text-[8px] font-bold tracking-[.2em] text-violet-200/80">RECEPTION DESK</figcaption>
              </figure>
            </div>

            <p className="mt-6 text-center text-[10px] font-bold tracking-[.22em] text-zinc-600">
              THE VISITOR IN FRONT OF YOU IS FINISHING CHECK-IN
            </p>
          </div>
        </div>
      )}

      {onboardingLocked && onboardingStep === "questions" && (
        <PabloOnboarding
          charName={(getSalarymanName() || user?.firstName || "SALARYMAN").trim()}
          charClass="salaryman"
          venue="lobby"
          onComplete={finishQuestions}
        />
      )}

      {onboardingLocked && onboardingStep === "hostel" && (
        <div className="fixed inset-0 z-[960] grid place-items-center bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Hostel bed assignment">
          <div className="w-full max-w-lg border border-violet-300/45 bg-[#0b0b19] p-5 shadow-[0_30px_100px_rgba(0,0,0,.75)]">
            <div className="flex items-end gap-4 border-b border-violet-300/20 pb-4">
              <img src={`${import.meta.env.BASE_URL}tower-art/character-claw-prime.png`} alt="Receptionist" className="h-24 w-20 object-contain object-bottom" />
              <div>
                <p className="text-[9px] font-bold tracking-[.24em] text-violet-300">RECEPTION · HOUSING</p>
                <h2 className="mt-1 text-xl font-black tracking-[.1em] text-white">YOUR BED IS FREE</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Pick the hostel floor you want. You also have free access to a public terminal in the Computer Cafe on Floor 2.</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[3, 5, 8, 12].map((floor) => (
                <button key={floor} type="button" onClick={() => setHostelFloor(floor)} className={`border px-3 py-4 text-center transition ${hostelFloor === floor ? "border-violet-200 bg-violet-300/15 text-white" : "border-white/10 bg-white/[.03] text-zinc-500 hover:border-violet-300/40"}`}>
                  <span className="block text-2xl font-black">{floor}</span>
                  <span className="mt-1 block text-[8px] font-bold tracking-[.2em]">HOSTEL FLOOR</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void acceptHostelBed()} disabled={savingOnboarding} className="mt-5 flex w-full items-center justify-center gap-2 border border-violet-200/55 bg-violet-300/10 px-4 py-3 text-xs font-black tracking-[.16em] text-violet-100 hover:bg-violet-300/15 disabled:opacity-50">
              {savingOnboarding ? "ASSIGNING BED..." : `ACCEPT BED · FLOOR ${hostelFloor}`} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {onboardingLocked && onboardingStep === "briefing" && (
        <div className="fixed inset-0 z-[970] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Tower history briefing">
          <div className="w-full max-w-lg overflow-hidden border border-cyan-200/40 bg-[#07111b] shadow-[0_30px_100px_rgba(0,0,0,.75)]">
            <div className="relative h-44 border-b border-cyan-300/20">
              <img src={`${import.meta.env.BASE_URL}tower-art/lobby-reception.png`} alt="Shadow Tower lobby" className="h-full w-full object-cover opacity-65" />
              <img src={`${import.meta.env.BASE_URL}tower-art/character-claw-prime.png`} alt="Receptionist" className="absolute bottom-0 left-5 h-40 w-32 object-contain object-bottom" />
            </div>
            <div className="p-5">
              <p className="text-[9px] font-bold tracking-[.24em] text-cyan-300">RECEPTIONIST</p>
              <p className="mt-3 min-h-20 text-sm leading-7 text-zinc-200">{RECEPTION_BRIEFING[briefingLine]}</p>
              <button type="button" onClick={() => briefingLine < RECEPTION_BRIEFING.length - 1 ? setBriefingLine((line) => line + 1) : triggerLockdown()} className="mt-4 flex w-full items-center justify-center gap-2 border border-cyan-200/50 bg-cyan-300/10 px-4 py-3 text-xs font-black tracking-[.16em] text-cyan-100">
                {briefingLine < RECEPTION_BRIEFING.length - 1 ? "CONTINUE" : "UNDERSTOOD"} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {onboardingLocked && onboardingStep === "alert" && (
        <div className="fixed inset-0 z-[990] grid place-items-center overflow-hidden bg-red-950/95 p-4" role="alertdialog" aria-modal="true" aria-label="Tower lockdown alert">
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.08)_0_12px,transparent_12px_24px)]" />
          <div className="relative w-full max-w-xl border-2 border-red-200 bg-black/75 p-6 text-center shadow-[0_0_100px_rgba(239,68,68,.8)]">
            <AlertTriangle className="mx-auto h-16 w-16 animate-pulse text-red-300" />
            <p className="mt-4 text-[11px] font-black tracking-[.4em] text-red-300">RED ALERT</p>
            <h2 className="mt-3 text-3xl font-black tracking-[.15em] text-white sm:text-5xl">LOCKDOWN</h2>
            <p className="mt-5 text-sm font-bold leading-7 text-red-100">
              EXTERIOR DOORS SEALED. You will remain inside Shadow Tower until further notice.
            </p>
            <div className="mt-5 border border-red-300/30 bg-red-500/10 p-4 text-left text-sm leading-6 text-zinc-200">
              <span className="font-bold text-red-200">RECEPTIONIST:</span> That&apos;s it. Your bed and terminal access are active. If you have questions, come back and see me.
            </div>
            <button type="button" onClick={() => void finishLockdown()} disabled={savingOnboarding} className="mt-6 w-full border border-red-100 bg-red-600 px-4 py-3 text-xs font-black tracking-[.2em] text-white hover:bg-red-500 disabled:opacity-50">
              {savingOnboarding ? "SEALING TOWER RECORD..." : "ACKNOWLEDGE LOCKDOWN"}
            </button>
          </div>
        </div>
      )}

      {talking && (
        <div className="fixed inset-0 z-[950] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Receptionist onboarding">
          <div className="w-full max-w-md border border-cyan-200/45 bg-[#07111b] p-5 shadow-[0_30px_100px_rgba(0,0,0,.7)]">
            <div className="flex items-center gap-3 border-b border-cyan-300/20 pb-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-300/35 bg-cyan-300/10"><UserRound className="h-6 w-6 text-cyan-100" /></span>
              <div>
                <p className="text-[9px] font-bold tracking-[.24em] text-cyan-300">SHADOW TOWER RECEPTION</p>
                <h2 className="text-lg font-black tracking-[.08em] text-white">CLAW PRIME · FRONT DESK</h2>
              </div>
            </div>
            {onboardingLocked ? (
              <>
                <p className="mt-5 text-sm leading-6 text-zinc-300">
                  I run the lobby. I just need your name, your work status, and where you want to begin. This is a short check-in before the tower opens.
                </p>
                <div className="mt-3 border border-violet-300/20 bg-violet-300/5 px-3 py-2 text-[10px] leading-5 text-violet-100">
                  MILA · UPPER-FLOOR LIAISON &nbsp;·&nbsp; FINANCE TRACKER · UNEMPLOYMENT &amp; PAYROLL FILINGS
                </div>
                <div className="mt-4 space-y-2 text-xs text-zinc-400">
                  <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" /> Follow the active task marker.</p>
                  <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" /> Use the WORK ACCESS door.</p>
                  <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" /> Learn the rest while you work.</p>
                </div>
                <button type="button" onClick={finishReception} className="mt-6 flex w-full items-center justify-center gap-2 border border-amber-200/55 bg-amber-300/10 px-4 py-3 text-xs font-black tracking-[.16em] text-amber-100 hover:bg-amber-300/15" data-testid="finish-reception-onboarding">
                  ANSWER A FEW QUESTIONS <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <p className="mt-5 text-sm leading-6 text-zinc-300">Your access is active. All organization and employment business is routed through this desk.</p>
                <div className="mt-4 grid gap-2">
                  <Link href="/business" className="flex items-center justify-between border border-cyan-300/30 bg-cyan-300/5 px-3 py-3 text-xs font-bold tracking-[.12em] text-cyan-100">
                    SET UP OR MANAGE AN ORG <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href="/profile" className="flex items-center justify-between border border-emerald-300/30 bg-emerald-300/5 px-3 py-3 text-xs font-bold tracking-[.12em] text-emerald-100">
                    EMPLOYMENT STATUS <ArrowRight className="h-4 w-4" />
                  </Link>
                  <button type="button" onClick={() => void fileUnemployment()} disabled={filing} className="flex items-center justify-between border border-amber-300/30 bg-amber-300/5 px-3 py-3 text-left text-xs font-bold tracking-[.12em] text-amber-100 disabled:opacity-50">
                    {filing ? "FILING..." : "FILE UNEMPLOYMENT"} <ArrowRight className="h-4 w-4" />
                  </button>
                  <Link href="/business/hiring" className="flex items-center justify-between border border-violet-300/30 bg-violet-300/5 px-3 py-3 text-xs font-bold tracking-[.12em] text-violet-100">
                    HIRING &amp; STAFF RECORDS <ArrowRight className="h-4 w-4" />
                  </Link>
                  <button type="button" onClick={() => setNotice("LOCKDOWN ACTIVE · EXTERIOR DOORS SEALED")} className="flex items-center justify-between border border-red-400/35 bg-red-500/10 px-3 py-3 text-left text-xs font-bold tracking-[.12em] text-red-200">
                    EXTERIOR DOORS · LOCKED <LockKeyhole className="h-4 w-4" />
                  </button>
                </div>
                {filingResult && <p className="mt-3 border border-white/10 bg-black/20 px-3 py-2 text-[10px] leading-5 text-zinc-300" role="status">{filingResult}</p>}
                <button type="button" onClick={() => setTalking(false)} className="mt-4 w-full border border-white/15 px-4 py-2.5 text-[10px] font-bold tracking-[.16em] text-zinc-400">CLOSE DESK</button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}