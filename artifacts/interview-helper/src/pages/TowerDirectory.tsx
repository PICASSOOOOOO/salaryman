import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, BriefcaseBusiness, Building2, Check, ClipboardList, DoorOpen, Footprints, KeyRound, LockKeyhole, MapPinned, Shield, Sparkles, UserRound } from "lucide-react";
import { startTowerAmbient, stopTowerAmbient } from "@/soundEngine";
import { quoteShadowTowerArea, SHADOW_TOWER_FLOOR_ENVELOPE } from "@workspace/api-zod/shadow-tower";
import {
  completeReceptionTask,
  getBuildingOnboardingStage,
  subscribeBuildingOnboarding,
  type BuildingOnboardingStage,
} from "@/lib/building-onboarding";
import { apiFetch } from "@/lib/api-client";
import { getActiveCityName } from "@/lib/city-defs";
import { TowerLifeHub } from "@/components/TowerLifeHub";

const occupiedFloors = new Map([
  [67, { name: "SHADOW CORP", kind: "RESTRICTED", detail: "The roofline suite. No public access. The elevator stops listening.", tone: "shadow", icon: LockKeyhole }],
  [66, { name: "PICASSO ORG", kind: "YOUR ORGANIZATION", detail: "Executive floor · live office · private operations", href: "/office", tone: "pablo", icon: Building2 }],
  [65, { name: "UNLISTED FLOOR", kind: "SEALED", detail: "No public registration. The lift passes it without a number.", tone: "secret", icon: LockKeyhole }],
  [52, { name: "UNLISTED FLOOR", kind: "SEALED", detail: "Municipal records stop here. Something keeps the lights on.", tone: "secret", icon: LockKeyhole }],
  [40, { name: "UNLISTED FLOOR", kind: "SEALED", detail: "The construction plans are incomplete. Access is not.", tone: "secret", icon: LockKeyhole }],
  [4, { name: "SECURITY & CUSTODY", kind: "PUBLIC / GUARDED", detail: "Guards, debt collection, evidence, and holding.", href: "/tower/security", tone: "security", icon: Shield }],
  [3, { name: "INFIRMARY / HOTELS", kind: "PUBLIC", detail: "Free observation and operator-run beds by the hour.", href: "/tower/rest", tone: "rest", icon: Building2 }],
  [2, { name: "COMPUTER CAFE", kind: "PUBLIC", detail: "Work board, terminals, and elevator music.", href: "/tower/mezzanine", tone: "cafe", icon: Building2 }],
  [1, { name: "RECREATION", kind: "PUBLIC", detail: "Games, food, conversation, and a place to begin.", href: "/recreation", tone: "rec", icon: Sparkles }],
]);

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
  const [stage, setStage] = useState<BuildingOnboardingStage>(() => getBuildingOnboardingStage());
  const [talking, setTalking] = useState(false);
  const [notice, setNotice] = useState("");
  const [filing, setFiling] = useState(false);
  const [filingResult, setFilingResult] = useState("");
  const onboardingLocked = stage === "reception";
  const workTaskActive = stage === "work";

  useEffect(() => {
    startTowerAmbient("lobby");
    return () => stopTowerAmbient();
  }, []);

  useEffect(() => subscribeBuildingOnboarding(setStage), []);

  const explainLock = (label: string) => {
    setNotice(`${label} LOCKED · REPORT TO RECEPTION`);
    window.setTimeout(() => setNotice(""), 2400);
  };

  const finishReception = () => {
    completeReceptionTask();
    setTalking(false);
    setNotice("WORK ACCESS GRANTED · FOLLOW THE AMBER MARKER");
    window.setTimeout(() => setNotice(""), 3000);
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

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050711] px-3 py-5 text-zinc-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex items-end justify-between gap-4 border-b border-cyan-300/20 pb-4">
          <div>
            <p className="animate-pulse text-[10px] tracking-[.35em] text-cyan-300">SHADOW TOWER · ARRIVAL LOBBY</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">START HERE.</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">Reception will give you one clear next step. Work first. Explore when you are ready.</p>
          </div>
          <Link href="/pablo" className="hidden sm:block text-xs text-zinc-500 hover:text-cyan-300">BACK TO PABLO</Link>
        </header>

        {notice && (
          <div className="fixed left-1/2 top-20 z-[900] -translate-x-1/2 border border-amber-300/50 bg-[#160f05]/95 px-4 py-2 text-center text-[10px] font-bold tracking-[.2em] text-amber-200 shadow-xl" role="status">
            {notice}
          </div>
        )}

        <section className="relative mb-5 overflow-hidden border border-cyan-300/25 bg-[#07101a] shadow-[0_30px_90px_rgba(0,0,0,.45)]" data-testid="lobby-map">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[.025] px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[.22em] text-cyan-200">
              <MapPinned className="h-4 w-4" /> LOBBY MAP · INTERACTIVE
            </div>
            <div className="hidden text-[9px] tracking-[.18em] text-zinc-500 sm:block">HOME CITY · {getActiveCityName()}</div>
            <div className={`flex items-center gap-2 text-[9px] tracking-[.18em] ${onboardingLocked ? "text-amber-300" : "text-emerald-300"}`}>
              <span className={`h-2 w-2 rounded-full ${onboardingLocked ? "animate-pulse bg-amber-300" : "bg-emerald-300"}`} />
              {onboardingLocked ? "RECEPTION REQUIRED" : workTaskActive ? "WORK ROUTE ACTIVE" : "ACCESS READY"}
            </div>
          </div>

          <div className="relative min-h-[430px] bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,.08),transparent_35%),linear-gradient(135deg,#0a1420,#050910)] p-4 sm:min-h-[520px] sm:p-8">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(125,211,252,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(125,211,252,.12)_1px,transparent_1px)] [background-size:34px_34px]" />

            <div className="relative mx-auto grid h-full max-w-5xl grid-cols-[minmax(72px,.8fr)_minmax(170px,2.2fr)_minmax(82px,1fr)] grid-rows-[120px_1fr_105px] gap-3 sm:grid-cols-[1fr_2.4fr_1.1fr] sm:grid-rows-[145px_1fr_125px] sm:gap-5">
              <button
                type="button"
                onClick={() => onboardingLocked ? explainLock("STAIRS") : setNotice("STAIRS OPEN · USE THE FLOOR DIRECTORY BELOW")}
                className={`relative row-span-2 flex flex-col items-center justify-center border p-2 transition ${onboardingLocked ? "border-red-400/25 bg-red-950/10 text-red-300/55" : "border-zinc-500/35 bg-zinc-900/50 text-zinc-300 hover:border-cyan-300/60"}`}
                data-testid="lobby-stairs"
              >
                <Footprints className="mb-2 h-5 w-5" />
                <span className="[writing-mode:vertical-rl] text-[9px] font-bold tracking-[.18em] sm:[writing-mode:initial]">STAIRS</span>
                {onboardingLocked && <LockKeyhole className="absolute right-2 top-2 h-4 w-4" />}
              </button>

              <div className="relative flex items-center justify-center border border-white/10 bg-white/[.025]">
                <div className="text-center">
                  <p className="text-[9px] tracking-[.2em] text-zinc-600">ARRIVAL ZONE</p>
                  <div className="mt-2 flex justify-center gap-2">
                    <span className="h-10 w-2 border border-cyan-300/20 bg-cyan-300/5" />
                    <span className="h-10 w-2 border border-cyan-300/20 bg-cyan-300/5" />
                    <span className="h-10 w-2 border border-cyan-300/20 bg-cyan-300/5" />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onboardingLocked ? explainLock("ELEVATOR") : setNotice("ELEVATOR OPEN · SELECT A FLOOR BELOW")}
                className={`relative row-span-2 flex flex-col items-center justify-center border p-2 transition ${onboardingLocked ? "border-red-400/25 bg-red-950/10 text-red-300/55" : "border-zinc-500/35 bg-zinc-900/50 text-zinc-300 hover:border-cyan-300/60"}`}
                data-testid="lobby-elevator"
              >
                <DoorOpen className="mb-2 h-6 w-6" />
                <span className="text-[9px] font-bold tracking-[.18em]">ELEVATOR</span>
                {onboardingLocked && <LockKeyhole className="absolute right-2 top-2 h-4 w-4" />}
              </button>

              <div id="reception" className={`relative flex items-center justify-center border p-3 transition-all ${onboardingLocked ? "border-cyan-200/70 bg-cyan-300/10 shadow-[0_0_45px_rgba(34,211,238,.18)]" : "border-cyan-300/30 bg-cyan-300/5"}`}>
                {onboardingLocked && (
                  <div className="absolute -top-11 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap border border-amber-300/45 bg-[#151006] px-3 py-2 text-[9px] font-black tracking-[.18em] text-amber-200 shadow-lg">
                    SPEAK HERE <span className="ml-2 animate-pulse">&gt;&gt;</span>
                    <div className="absolute left-1/2 top-full h-3 w-px bg-amber-300/60" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setTalking(true)}
                  className="group flex w-full max-w-sm flex-col items-center border border-cyan-200/35 bg-[#081722] p-4 text-center transition hover:-translate-y-0.5 hover:border-cyan-100"
                  data-testid="speak-receptionist"
                >
                  <span className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-cyan-200/40 bg-[radial-gradient(circle,#16445a,#07121d)]">
                    <UserRound className="h-8 w-8 text-cyan-100" />
                    <span className="absolute -right-1 top-0 h-3 w-3 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_10px_#6ee7b7]" />
                  </span>
                  <span className="text-[9px] font-bold tracking-[.28em] text-cyan-300">CLAW PRIME · RECEPTION LEAD</span>
                  <span className="mt-1 text-sm font-black tracking-[.12em] text-white">{onboardingLocked ? "TALK" : "FRONT DESK"}</span>
                  <span className="mt-2 text-[10px] text-zinc-500 group-hover:text-zinc-300">PRESS OR TAP TO SPEAK</span>
                </button>
              </div>

              <div className="flex items-center justify-center border border-white/10 bg-white/[.02] text-center text-[9px] tracking-[.2em] text-zinc-600">
                WAITING AREA
              </div>

              <div className="border border-white/10 bg-white/[.02]" />

              <div className="col-span-3 grid grid-cols-[1fr_1.8fr_1fr] gap-3 sm:gap-5">
                <div className="flex items-center justify-center border border-white/10 bg-white/[.02] text-[9px] tracking-[.15em] text-zinc-600">SECURITY</div>
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
                    href="/tower/mezzanine"
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
                <div className="flex items-center justify-center border border-white/10 bg-white/[.02] text-[9px] tracking-[.15em] text-zinc-600">SERVICES</div>
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
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  {onboardingLocked
                    ? "The elevator, stairs, and work door stay locked until the reception team records your work status."
                    : "Organization setup, employment status, unemployment filings, work access, and building business begin here."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-bold tracking-[.13em]">
                  <span className="border border-violet-300/20 bg-violet-300/5 px-2 py-1 text-violet-200">MILA · SHADOW LIAISON</span>
                  <span className="border border-emerald-300/20 bg-emerald-300/5 px-2 py-1 text-emerald-200">FINANCE TRACKER · FILINGS</span>
                </div>
              </div>
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
              <Link href="/tower/mezzanine" className="flex items-center gap-2 border border-cyan-300/25 bg-cyan-300/5 px-3 py-3 text-xs font-bold tracking-[.12em] text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/10">
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
            <p className="mt-3 text-[10px] leading-5 text-zinc-500">
              Reception handles rental and acquisition intake in both cities. Once a floor is owned, its owner can broker units directly through the Realty Registry.
            </p>
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
                  I run building operations while Mila assists Mr. Shadow upstairs. Before you move through the tower, reception records your organization and employment status. Your first stop is the public work floor.
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
                  I&apos;M READY FOR WORK <ArrowRight className="h-4 w-4" />
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