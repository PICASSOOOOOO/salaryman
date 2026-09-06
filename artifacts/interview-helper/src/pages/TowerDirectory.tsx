import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock3,
  Coins,
  DoorOpen,
  Footprints,
  KeyRound,
  LockKeyhole,
  Mail,
  MapPinned,
  Shield,
  Sparkles,
  UserRound,
} from "lucide-react";
import { startTowerAmbient, stopTowerAmbient } from "@/soundEngine";
import {
  getShadowTowerCommercialTenants,
  quoteShadowTowerArea,
  SHADOW_TOWER_FLOOR_ENVELOPE,
} from "@workspace/api-zod/shadow-tower";
import {
  completeReceptionTask,
  getBuildingOnboardingStage,
  resetBuildingOnboarding,
  startBuildingOnboarding,
  subscribeBuildingOnboarding,
  type BuildingOnboardingStage,
} from "@/lib/building-onboarding";
import { apiFetch } from "@/lib/api-client";
import { getActiveCityId, getActiveCityName } from "@/lib/city-defs";
import { useAuth } from "@/hooks/use-auth";
import {
  getSalarymanName,
  markTutorialDone,
  setSalarymanEmail,
  setSalarymanName,
} from "@/lib/tutorial-progress";
import { IsoOffice } from "@/components/IsoOffice";
import type { IsoOfficeProps } from "@/components/IsoOffice";
import { getLobbyOfficeLayout } from "@/lib/office-property-layouts";
import { getTowerAmbientOccupants } from "@/lib/tower-life";
import { getTowerSpaceArtUrl } from "@/lib/tower-space-art";

const occupiedFloors = new Map([
  [
    67,
    {
      name: "SHADOW CORP",
      kind: "RESTRICTED",
      detail:
        "The roofline suite. No public access. The elevator stops listening.",
      tone: "shadow",
      icon: LockKeyhole,
    },
  ],
  [
    66,
    {
      name: "PICASSO ORG",
      kind: "YOUR ORGANIZATION",
      detail: "Executive floor · live office · private operations",
      href: "/office",
      tone: "pablo",
      icon: Building2,
    },
  ],
  [
    65,
    {
      name: "UNLISTED FLOOR",
      kind: "SEALED",
      detail: "No public registration. The lift passes it without a number.",
      tone: "secret",
      icon: LockKeyhole,
    },
  ],
  [
    52,
    {
      name: "UNLISTED FLOOR",
      kind: "SEALED",
      detail: "Municipal records stop here. Something keeps the lights on.",
      tone: "secret",
      icon: LockKeyhole,
    },
  ],
  [
    40,
    {
      name: "UNLISTED FLOOR",
      kind: "SEALED",
      detail: "The construction plans are incomplete. Access is not.",
      tone: "secret",
      icon: LockKeyhole,
    },
  ],
  [
    4,
    {
      name: "SECURITY & CUSTODY",
      kind: "PUBLIC / GUARDED",
      detail: "Guards, debt collection, evidence, and holding.",
      href: "/tower/security",
      tone: "security",
      icon: Shield,
    },
  ],
  [
    3,
    {
      name: "INFIRMARY / HOTELS",
      kind: "PUBLIC",
      detail: "Free observation and operator-run beds by the hour.",
      href: "/tower/rest",
      tone: "rest",
      icon: Building2,
    },
  ],
  [
    2,
    {
      name: "COMPUTER CAFE",
      kind: "PUBLIC",
      detail: "Work board, terminals, and elevator music.",
      href: "/tower/mezzanine?focus=classifieds",
      tone: "cafe",
      icon: Building2,
    },
  ],
  [
    1,
    {
      name: "RECREATION",
      kind: "PUBLIC",
      detail: "Games, food, conversation, and a place to begin.",
      href: "/recreation",
      tone: "rec",
      icon: Sparkles,
    },
  ],
]);

for (const floorNumber of Array.from({ length: 60 }, (_, index) => index + 5)) {
  const tenants = getShadowTowerCommercialTenants(floorNumber);
  if (!tenants.length) continue;
  occupiedFloors.set(floorNumber, {
    name: tenants.map((tenant) => tenant.business.name).join(" + "),
    kind: "TENANT OPERATING",
    detail: tenants.map((tenant) => tenant.fitout.label).join(" · "),
    href: `/tower/floor/${floorNumber}`,
    tone: "tenant",
    icon: Building2,
  });
}

function TowerEntry() {
  return (
    <main
      className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[#071017] px-4 py-8 text-zinc-100 sm:px-8"
      data-testid="tower-entry"
    >
      <img
        src={`${import.meta.env.BASE_URL}game-art-review/salaryman-solarpunk-landscape-v2.png`}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center opacity-60"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,12,18,.96),rgba(5,12,18,.7)_55%,rgba(5,12,18,.4)),linear-gradient(0deg,rgba(5,12,18,.82),transparent)]" />
      <section className="relative w-full max-w-3xl overflow-hidden border border-[#d9b77a]/55 bg-[#13231d]/95 p-5 shadow-[0_30px_100px_rgba(0,0,0,.55)] backdrop-blur-[2px] sm:p-8">
        <div className="pointer-events-none absolute -right-8 -top-8 hidden h-[calc(100%+2rem)] w-64 overflow-hidden border-l border-[#d9b77a]/35 bg-[#d9ccb5] md:block">
          <img
            src={`${import.meta.env.BASE_URL}game-art-review/salaryman-solarpunk-character-v2.png`}
            alt=""
            className="h-full w-full object-cover object-[52%_42%] opacity-95"
          />
        </div>
        <div className="relative z-10 max-w-lg">
          <p className="font-mono text-[10px] font-bold tracking-[.35em] text-[#d9b77a]">
            SHADOW TOWER · MAIN ENTRY
          </p>
          <h1 className="mt-3 font-display text-3xl font-extrabold uppercase tracking-[.08em] text-[#f1ead7] sm:text-4xl">
            Enter the tower<span className="text-[#d9b77a]">.</span>
          </h1>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[.18em] text-[#b8c9b7]">
            Lobby · elevator · offices
          </p>
          <Link
            href="/sign-in?returnTo=%2Ftower"
            className="mt-6 flex min-h-12 items-center justify-center border border-[#d9b77a]/70 bg-[#d9b77a]/10 px-5 py-3 text-center font-mono text-xs font-bold tracking-[.16em] text-[#fff5dc] transition hover:border-[#fff0bd] hover:bg-[#d9b77a]/20"
          >
            CHECK IN AT THE LOBBY
          </Link>
        </div>
      </section>
    </main>
  );
}

function TowerReceptionScene({
  locked,
  frozen,
  onReception,
  onResidentInteract,
  onElevator,
  onDirectory,
  onLockedExit,
  dialogue,
}: {
  locked: boolean;
  frozen: boolean;
  onReception: () => void;
  onResidentInteract: (occupant: { id: number; name: string }) => void;
  onElevator: () => void;
  onDirectory: () => void;
  onLockedExit: (label: string) => void;
  dialogue: NonNullable<IsoOfficeProps["dialogue"]> | null;
}) {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1100 : window.innerWidth,
    height:
      typeof window === "undefined"
        ? 620
        : Math.max(480, Math.min(760, window.innerHeight - 110)),
  }));
  useEffect(() => {
    const resize = () =>
      setViewport({
        width: window.innerWidth,
        height: Math.max(480, Math.min(760, window.innerHeight - 110)),
      });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const city = getActiveCityId() === "huda_city" ? "huda_city" : "minx_city";
  const layout = useMemo(() => {
    const base = getLobbyOfficeLayout(city);
    return {
      ...base,
      stations: base.stations.filter(
        (station) => station.id !== "lobby-elevator",
      ),
      propertyKey: `${city}:lobby`,
      label: "SHADOW TOWER · MAIN LOBBY",
      representation: "ARRIVAL HALL · ELEVATOR CORE",
      spawn: { x: 3.5 * 16, y: 9.5 * 16, facing: "right" as const },
    };
  }, [city]);
  const stations = useMemo(
    () => [
      {
        id: "lobby-elevator",
        label: locked ? "ELEVATOR · RECEPTION REQUIRED" : "ELEVATOR DIRECTORY",
        col: 0,
        row: 0,
        radius: 42,
        footprint: { w: 2, d: 2 },
        glyph: "elevator" as const,
        onInteract: () => (locked ? onLockedExit("ELEVATOR") : onElevator()),
      },
      {
        ...(layout.stations.find((station) => station.id === "lobby-directory") ?? {
          id: "lobby-directory",
          label: "BUSINESS DIRECTORY",
          col: 5,
          row: 4,
          radius: 42,
          footprint: { w: 4, d: 1 },
          glyph: "comms" as const,
        }),
        label: locked ? "DIRECTORY · RECEPTION REQUIRED" : "BUSINESS DIRECTORY",
        onInteract: () => (locked ? onLockedExit("DIRECTORY") : onDirectory()),
      },
    ],
    [layout.stations, locked, onDirectory, onElevator, onLockedExit],
  );
  return (
    <section
      className="relative overflow-hidden border border-[#5cd5d0]/25 bg-[#070f16] shadow-[0_22px_80px_rgba(0,0,0,.34)]"
      data-testid="lobby-map"
    >
      <span className="sr-only" data-testid="reception-desk">
        Physical reception desk
      </span>
      <button
        type="button"
        className="sr-only"
        data-testid="speak-receptionist"
        onClick={onReception}
      >
        Speak to receptionist
      </button>
      <IsoOffice
        layout={layout}
        viewportWidth={viewport.width}
        viewportHeight={viewport.height}
        playable
        followCam
        scale={viewport.width < 760 ? 4.7 : 4.15}
        stations={stations}
        rooms={layout.rooms}
        backdropSrc={getTowerSpaceArtUrl("lobby")}
        initialPose={layout.spawn}
        frozen={frozen}
        suppressLabels={viewport.width < 680}
        playerName="YOU"
        hallwaySignage="MAIN LOBBY · ELEVATOR CORE"
        ambientOccupants={getTowerAmbientOccupants("lobby")}
        onAmbientInteract={onResidentInteract}
        dialogue={dialogue}
        lighting="cool"
      />
    </section>
  );
}

// Every commercial row links to the real registry flow. The directory does not
// render fake claim buttons or imply that a non-existent office is enterable.
const floors = Array.from({ length: 67 }, (_, index) => {
  const floor = 67 - index;
  const existing = occupiedFloors.get(floor);
  if (existing) {
    return {
      floor,
      quote: null,
      href: "href" in existing ? existing.href : undefined,
      ...existing,
    };
  }

  const quote =
    floor >= 5 && floor <= 64
      ? quoteShadowTowerArea(
          "founder_team",
          floor,
          "lease",
          SHADOW_TOWER_FLOOR_ENVELOPE.squareMeters,
        )
      : null;

  return {
    floor,
    name: quote ? "COMMERCIAL FLOOR" : "UNAVAILABLE",
    kind: quote ? "LIVE REGISTRY" : "RESTRICTED",
    detail: quote
      ? "Open the registry to price, lease, or purchase this floor"
      : "This floor is not available through the commercial registry",
    href: quote ? `/store/realty?floor=${floor}` : undefined,
    quote,
    tone: "future" as const,
    icon: quote ? Building2 : KeyRound,
  };
});

export default function TowerDirectory() {
  const { user, isAuthenticated } = useAuth();
  const [stage, setStage] = useState<BuildingOnboardingStage>(() =>
    getBuildingOnboardingStage(),
  );
  const [now, setNow] = useState(() => new Date());
  const [notice, setNotice] = useState("");
  const [reconcilingServerState, setReconcilingServerState] =
    useState(isAuthenticated);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [dialogueStep, setDialogueStep] = useState("name");
  const [dialogue, setDialogue] =
    useState<NonNullable<IsoOfficeProps["dialogue"]> | null>(null);
  const onboardingLocked = reconcilingServerState;
  const workTaskActive = stage === "work";

  useEffect(() => {
    startTowerAmbient("lobby");
    return () => stopTowerAmbient();
  }, []);

  useEffect(() => subscribeBuildingOnboarding(setStage), []);
  useEffect(() => {
    if (!isAuthenticated) {
      setReconcilingServerState(false);
      return;
    }
    let cancelled = false;
    apiFetch("/api/salaryman/saves", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (Array.isArray(body?.saves)) {
          if (body.saves.length === 0) {
            resetBuildingOnboarding();
            setStage("not_started");
          }
          setReconcilingServerState(false);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const explainLock = (label: string) => {
    setNotice(`${label} LOCKED · REPORT TO RECEPTION`);
    window.setTimeout(() => setNotice(""), 2400);
  };

  const finishReception = () => {
    completeReceptionTask();
    markTutorialDone();
    setStage((current) => (current === "reception" ? "work" : current));
    setDialogue(null);
    setNotice("RECEPTION COMPLETE · WALK TO THE ELEVATOR OR DIRECTORY");
  };

  const setReceptionDialogue = (
    text: string,
    options: readonly { id: string; label: string }[],
  ) => {
    setDialogue({ occupantId: 501, text, options, onOption: handleDialogueOption });
  };

  const beginReception = () => {
    if (stage === "not_started") {
      startBuildingOnboarding();
      setStage("reception");
    }
    const authProfile = user as
      | {
          fullName?: string | null;
          username?: string | null;
          primaryEmailAddress?: { emailAddress?: string | null } | null;
        }
      | null;
    const knownName =
      getSalarymanName() ||
      authProfile?.fullName ||
      authProfile?.username ||
      "new arrival";
    const knownEmail = authProfile?.primaryEmailAddress?.emailAddress || "";
    setDialogueStep("name");
    setReceptionDialogue(`What's your name? Is it ${knownName}?`, [
      { id: "name-confirm", label: "YES, THAT'S ME" },
      { id: "name-new", label: "I'M NEW HERE" },
    ]);
    if (knownEmail) setSalarymanEmail(knownEmail);
  };

  const handleDialogueOption = (option: string) => {
    if (dialogueStep === "name") {
      if (option === "name-new") {
        setDialogueStep("profile");
        setReceptionDialogue("Pablo will learn your name when you check in.", [
          { id: "profile", label: "CHECK IN WITH PABLO" },
        ]);
        return;
      }
      const authProfile = user as
        | { fullName?: string | null; username?: string | null }
        | null;
      const name =
        getSalarymanName() ||
        authProfile?.fullName ||
        authProfile?.username ||
        "new arrival";
      setSalarymanName(name);
      setDialogueStep("email");
      setReceptionDialogue("What contact should we use to log you in?", [
        { id: "email-confirm", label: "USE MY SIGN-IN EMAIL" },
        { id: "email-later", label: "I'LL DO THAT LATER" },
      ]);
      return;
    }
    if (dialogueStep === "profile") {
      finishReception();
      return;
    }
    if (dialogueStep === "email") {
      if (option === "email-confirm") {
        const authProfile = user as
          | { primaryEmailAddress?: { emailAddress?: string | null } | null }
          | null;
        const email = authProfile?.primaryEmailAddress?.emailAddress;
        if (email) setSalarymanEmail(email);
      }
      setDialogueStep("work");
      setReceptionDialogue("Are you here for work?", [
        { id: "work-yes", label: "YES" },
        { id: "work-no", label: "NO" },
      ]);
      return;
    }
    if (dialogueStep === "work") {
      if (option === "work-no") {
        setDialogueStep("unemployed");
        setReceptionDialogue("Then you're unemployed?", [
          { id: "unemployed-yes", label: "YES" },
          { id: "unemployed-no", label: "NO" },
        ]);
      } else {
        setDialogueStep("path");
        setReceptionDialogue("Do you have a business or do you need a job?", [
          { id: "business", label: "I HAVE A BUSINESS" },
          { id: "job", label: "I NEED A JOB" },
        ]);
      }
      return;
    }
    if (dialogueStep === "unemployed") {
      setDialogueStep("path");
      setReceptionDialogue("Do you have a business or do you need a job?", [
        { id: "business", label: "I HAVE A BUSINESS" },
        { id: "job", label: "I NEED A JOB" },
      ]);
      return;
    }
    if (dialogueStep === "path") {
      if (option === "business") {
        setDialogueStep("business-name");
        setReceptionDialogue("Tell me about the business when you check in with Pablo.", [
          { id: "business-name", label: "CONTINUE TO CHECK-IN" },
        ]);
      } else {
        setDialogueStep("property");
        setReceptionDialogue("Interested in buying property or renting?", [
          { id: "property-yes", label: "SHOW ME" },
          { id: "property-no", label: "NOT YET" },
        ]);
      }
      return;
    }
    if (dialogueStep === "business-name") {
      setDialogueStep("property");
      setReceptionDialogue("Interested in buying property or renting?", [
        { id: "property-yes", label: "SHOW ME" },
        { id: "property-no", label: "NOT YET" },
      ]);
      return;
    }
    if (dialogueStep === "property") {
      if (option === "property-yes") setDirectoryOpen(true);
      finishReception();
    }
  };

  const handleResidentInteract = (occupant: { id: number; name: string }) => {
    if (occupant.id === 501) {
      beginReception();
      return;
    }
    const lines: Record<string, string> = {
      "FINANCE TRACKER":
        "I track balances and payments. Banco Ombra is where money starts.",
      "ADA BLOM":
        "I help businesses find a floor, a lease, and their first useful tools.",
      "RIO LIFT":
        "The elevator reaches the public floors. Reception can open the directory.",
    };
    setDialogue({
      occupantId: occupant.id,
      text: lines[occupant.name] ?? "I can point you to someone who can help.",
      options: [{ id: "close", label: "THANKS" }],
      onOption: () => setDialogue(null),
    });
  };

  if (!isAuthenticated) return <TowerEntry />;

  return (
    <main
      className={`min-h-screen overflow-x-hidden bg-[#0d1d17] text-zinc-100 ${onboardingLocked ? "p-0" : "px-3 py-5 sm:px-8"}`}
    >
      <style>{`@keyframes lobbyLight{0%,100%{opacity:.48;filter:brightness(.9)}50%{opacity:.9;filter:brightness(1.2)}}@keyframes lobbyPlant{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(3deg)}}@keyframes lobbyStatus{0%,100%{box-shadow:0 0 0 rgba(34,211,238,0)}50%{box-shadow:0 0 14px rgba(34,211,238,.2)}}`}</style>
      <div className={onboardingLocked ? "w-full" : "mx-auto max-w-6xl"}>
        {!onboardingLocked && (
          <header className="hidden">
            <div>
              <p className="font-mono text-[10px] font-bold tracking-[.35em] text-[#8de1dc]">
                SHADOW TOWER · {getActiveCityName().toUpperCase()} · LOBBY FLOOR
              </p>
              <h1 className="mt-2 font-display text-3xl font-extrabold uppercase tracking-[.08em] text-[#eee4d0] sm:text-5xl">
                Lobby<span className="text-[#c47e3f]">.</span>
              </h1>
              <p className="mt-2 font-mono text-[10px] font-bold tracking-[.2em] text-[#789091]">
                RECEPTION · FLOOR L
              </p>
            </div>
            <div className="hidden border-l border-[#c47e3f]/40 pl-4 text-right font-mono text-[9px] uppercase tracking-[.16em] text-[#789091] sm:block">
              <div>
                {now.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                LOCAL
              </div>
              <div className="mt-1 text-[#c47e3f]">ACCESS / ACTIVE</div>
            </div>
          </header>
        )}

        <section
          className="hidden"
          data-testid="tower-art-plate"
        >
          <img
            src={`${import.meta.env.BASE_URL}tower-art/lobby-reception.png`}
            alt="Shadow Tower reception hall with illuminated elevators and a city view"
            className="absolute inset-0 h-full w-full object-cover object-[57%_48%] opacity-75"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,12,18,.96)_0%,rgba(5,12,18,.62)_42%,rgba(5,12,18,.12)_100%),linear-gradient(0deg,rgba(5,12,18,.82),transparent_55%)]" />
          <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-4 sm:inset-x-6 sm:bottom-6">
            <div>
              <p className="font-mono text-[9px] font-bold tracking-[.3em] text-[#e0a36b]">
                ARRIVAL HALL / 01
              </p>
              <h2 className="mt-2 max-w-md font-display text-2xl font-extrabold uppercase leading-[.94] tracking-[.04em] text-[#f1e9d7] sm:text-4xl">
                The building keeps score.
              </h2>
            </div>
            <div className="hidden border-l border-white/25 pl-3 font-mono text-[9px] uppercase leading-5 tracking-[.16em] text-white/55 sm:block">
              <div>HOME CITY</div>
              <div className="text-[#8de1dc]">{getActiveCityName()}</div>
            </div>
          </div>
        </section>

        {notice && (
          <div
            className="fixed left-1/2 top-20 z-[900] -translate-x-1/2 border border-amber-300/50 bg-[#160f05]/95 px-4 py-2 text-center text-[10px] font-bold tracking-[.2em] text-amber-200 shadow-xl"
            role="status"
          >
            {notice}
          </div>
        )}

        <TowerReceptionScene
          locked={onboardingLocked}
          frozen={Boolean(dialogue)}
          onReception={beginReception}
          onResidentInteract={(occupant) => {
            handleResidentInteract(occupant);
          }}
          onElevator={() => setNotice("ELEVATOR DIRECTORY OPEN")}
          onDirectory={() => setDirectoryOpen((open) => !open)}
          onLockedExit={explainLock}
          dialogue={dialogue}
        />
        {directoryOpen && !onboardingLocked && (
          <section
            className="mt-4 border border-cyan-300/30 bg-[#07131a]/95 p-4 shadow-[0_18px_60px_rgba(0,0,0,.3)] sm:p-5"
            data-testid="lobby-business-directory"
            aria-label="Business directory"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-bold tracking-[.25em] text-cyan-200">
                  LOBBY OBJECT · BUSINESS DIRECTORY
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Select a floor from the directory kiosk.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDirectoryOpen(false)}
                className="border border-white/15 px-3 py-2 font-mono text-[10px] font-bold tracking-[.16em] text-zinc-400 hover:border-cyan-200/60 hover:text-cyan-100"
              >
                CLOSE
              </button>
            </div>
            <div className="grid gap-2">
              {floors.map(({ floor, name, detail, href, kind }) => (
                href ? (
                  <Link
                    key={floor}
                    href={href}
                    className="flex items-center gap-3 border border-white/10 bg-white/[.025] px-3 py-3 transition hover:border-cyan-300/50 hover:bg-cyan-300/[.06]"
                  >
                    <span className="w-8 font-mono text-sm text-zinc-500">{String(floor).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-xs tracking-[.12em] text-zinc-100">{name}</strong>
                      <span className="mt-1 block truncate text-[10px] text-zinc-500">{detail}</span>
                    </span>
                    <span className="font-mono text-[9px] tracking-[.12em] text-cyan-200">{kind}</span>
                  </Link>
                ) : (
                  <div key={floor} className="flex items-center gap-3 border border-white/5 px-3 py-3 opacity-60">
                    <span className="w-8 font-mono text-sm text-zinc-600">{String(floor).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-xs tracking-[.12em] text-zinc-400">{name}</strong>
                      <span className="mt-1 block truncate text-[10px] text-zinc-600">{detail}</span>
                    </span>
                    <span className="font-mono text-[9px] tracking-[.12em] text-zinc-600">{kind}</span>
                  </div>
                )
              ))}
            </div>
          </section>
        )}
        <section
          className="hidden"
          aria-hidden="true"
          data-testid="legacy-lobby-map"
        >
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
            <div className="hidden text-[9px] tracking-[.18em] text-zinc-500 sm:block">
              HOME CITY · {getActiveCityName()}
            </div>
            <div
              className={`flex items-center gap-2 text-[9px] tracking-[.18em] ${onboardingLocked ? "text-amber-300" : "text-emerald-300"}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${onboardingLocked ? "animate-pulse bg-amber-300" : "bg-emerald-300"}`}
              />
              {onboardingLocked
                ? "RECEPTION REQUIRED"
                : workTaskActive
                  ? "WORK ROUTE ACTIVE"
                  : "ACCESS READY"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-b border-white/10 bg-[#080d14]/85 p-3 sm:grid-cols-4 sm:gap-3 sm:p-4">
            <div className="flex items-center gap-3 border border-cyan-300/20 bg-cyan-300/[.04] px-3 py-2.5">
              <Clock3 className="h-5 w-5 shrink-0 text-cyan-200" />
              <div>
                <div className="font-mono text-lg font-black tracking-[.08em] text-cyan-100">
                  {now.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="text-[8px] font-bold tracking-[.18em] text-zinc-600">
                  LOCAL TOWER TIME
                </div>
              </div>
            </div>
            <Link
              href="/business/calendar"
              className="flex items-center gap-3 border border-violet-300/20 bg-violet-300/[.04] px-3 py-2.5 transition hover:border-violet-200/60"
            >
              <CalendarDays className="h-5 w-5 shrink-0 text-violet-200" />
              <div>
                <div className="font-mono text-lg font-black tracking-[.08em] text-violet-100">
                  {now.getDate()}
                </div>
                <div className="text-[8px] font-bold tracking-[.18em] text-zinc-600">
                  {now.toLocaleDateString([], { month: "short" }).toUpperCase()}{" "}
                  · CALENDAR
                </div>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setNotice("MAIL DROP · NO NEW MAIL")}
              className="flex items-center gap-3 border border-amber-300/20 bg-amber-300/[.04] px-3 py-2.5 text-left transition hover:border-amber-200/60"
            >
              <Mail className="h-5 w-5 shrink-0 text-amber-200" />
              <div>
                <div className="font-mono text-lg font-black tracking-[.08em] text-amber-100">
                  0
                </div>
                <div className="text-[8px] font-bold tracking-[.18em] text-zinc-600">
                  MAIL DROP · INBOX
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setNotice("TOWER NOTICE BOARD · ALL CLEAR")}
              className="flex items-center gap-3 border border-emerald-300/20 bg-emerald-300/[.04] px-3 py-2.5 text-left transition hover:border-emerald-200/60"
            >
              <Bell className="h-5 w-5 shrink-0 text-emerald-200" />
              <div>
                <div className="font-mono text-lg font-black tracking-[.08em] text-emerald-100">
                  OK
                </div>
                <div className="text-[8px] font-bold tracking-[.18em] text-zinc-600">
                  NOTICE BOARD
                </div>
              </div>
            </button>
          </div>

          <div className="relative min-h-[430px] overflow-hidden bg-[radial-gradient(ellipse_at_50%_4%,rgba(226,232,240,.12),transparent_26%),linear-gradient(150deg,#172331,#070b11_72%)] p-4 sm:min-h-[520px] sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[8%] top-0 h-24 bg-[linear-gradient(180deg,rgba(226,232,240,.12),transparent)] opacity-70"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-[18%] top-5 h-1 w-20 bg-white/45 shadow-[0_0_18px_rgba(255,255,255,.7)] sm:w-28"
              style={{ animation: "lobbyLight 3.6s ease-in-out infinite" }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-[18%] top-5 h-1 w-20 bg-white/45 shadow-[0_0_18px_rgba(255,255,255,.7)] sm:w-28"
              style={{ animation: "lobbyLight 3.6s ease-in-out 1.2s infinite" }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[43%] bg-[linear-gradient(155deg,transparent_48%,rgba(148,163,184,.12)_49%,transparent_51%),linear-gradient(25deg,transparent_48%,rgba(148,163,184,.08)_49%,transparent_51%)] [background-size:90px_90px] opacity-60"
            />

            <div className="relative mx-auto grid h-full max-w-5xl grid-cols-[minmax(72px,.8fr)_minmax(170px,2.2fr)_minmax(82px,1fr)] grid-rows-[120px_1fr_105px] gap-3 rounded-sm border border-white/15 bg-[#0b121b]/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_24px_60px_rgba(0,0,0,.4)] sm:grid-cols-[1fr_2.4fr_1.1fr] sm:grid-rows-[145px_1fr_125px] sm:gap-5 sm:p-5">
              <button
                type="button"
                onClick={() =>
                  onboardingLocked
                    ? explainLock("STAIRS")
                    : setNotice("STAIRS OPEN · USE THE FLOOR DIRECTORY BELOW")
                }
                className={`relative row-span-2 flex flex-col items-center justify-center border p-2 transition ${onboardingLocked ? "border-red-400/25 bg-red-950/10 text-red-300/55" : "border-zinc-500/35 bg-zinc-900/50 text-zinc-300 hover:border-cyan-300/60"}`}
                data-testid="lobby-stairs"
              >
                <Footprints className="mb-2 h-5 w-5" />
                <span className="[writing-mode:vertical-rl] text-[9px] font-bold tracking-[.18em] sm:[writing-mode:initial]">
                  STAIRWELL
                </span>
                {onboardingLocked && (
                  <LockKeyhole className="absolute right-2 top-2 h-4 w-4" />
                )}
              </button>

              <div className="relative flex items-center justify-center border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.01))]">
                <div className="text-center">
                  <p className="text-[9px] font-bold tracking-[.28em] text-zinc-400">
                    ARRIVAL HALL
                  </p>
                  <p className="mt-1 text-[9px] tracking-[.12em] text-zinc-600">
                    SHADOW TOWER · {getActiveCityName().toUpperCase()}
                  </p>
                  <div className="mt-4 flex justify-center gap-4">
                    <span className="h-9 w-2 rounded-full border border-emerald-200/25 bg-emerald-300/15" />
                    <span className="h-9 w-2 rounded-full border border-emerald-200/25 bg-emerald-300/15" />
                    <span className="h-9 w-2 rounded-full border border-emerald-200/25 bg-emerald-300/15" />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onboardingLocked
                    ? explainLock("ELEVATOR")
                    : setNotice("ELEVATOR OPEN · SELECT A FLOOR BELOW")
                }
                className={`relative row-span-2 flex flex-col items-center justify-center border p-2 transition ${onboardingLocked ? "border-red-400/25 bg-red-950/10 text-red-300/55" : "border-zinc-500/35 bg-zinc-900/50 text-zinc-300 hover:border-cyan-300/60"}`}
                data-testid="lobby-elevator"
              >
                <DoorOpen className="mb-2 h-6 w-6 text-cyan-200" />
                <span className="text-[9px] font-bold tracking-[.18em]">
                  ELEVATOR A
                </span>
                <span className="mt-2 h-1 w-8 bg-emerald-300/70 shadow-[0_0_10px_rgba(110,231,183,.6)]" />
                {onboardingLocked && (
                  <LockKeyhole className="absolute right-2 top-2 h-4 w-4" />
                )}
              </button>

              <div
                id="reception"
                className={`relative flex items-center justify-center border p-3 transition-all ${onboardingLocked ? "border-cyan-200/70 bg-cyan-300/10 shadow-[0_0_45px_rgba(34,211,238,.18)]" : "border-cyan-300/30 bg-cyan-300/5"}`}
              >
                {onboardingLocked && (
                  <div className="absolute -top-11 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap border border-amber-300/45 bg-[#151006] px-3 py-2 text-[9px] font-black tracking-[.18em] text-amber-200 shadow-lg">
                    SPEAK HERE{" "}
                    <span className="ml-2 animate-pulse">&gt;&gt;</span>
                    <div className="absolute left-1/2 top-full h-3 w-px bg-amber-300/60" />
                  </div>
                )}
                <div className="absolute bottom-2 left-2 text-[8px] tracking-[.18em] text-cyan-200/45">
                  RECEPTION · FLOOR L
                </div>
                <button
                  type="button"
                   onClick={beginReception}
                  className="group relative flex w-full max-w-sm flex-col items-center overflow-hidden border border-cyan-200/35 bg-[#081722] p-4 text-center transition hover:-translate-y-0.5 hover:border-cyan-100"
                  data-testid="speak-receptionist"
                >
                  <span className="relative mb-3 flex h-24 w-24 items-end justify-center overflow-hidden rounded-full border border-cyan-200/40 bg-[radial-gradient(circle,#16445a,#07121d)]">
                    <img
                      src={`${import.meta.env.BASE_URL}tower-art/character-claw-prime.png`}
                      alt="Reception assistant"
                      className="h-28 w-28 object-contain object-bottom"
                    />
                    <span className="absolute -right-1 top-0 h-3 w-3 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_10px_#6ee7b7]" />
                  </span>
                  <span className="text-[9px] font-bold tracking-[.28em] text-cyan-300">
                    RECEPTION
                  </span>
                  <span className="mt-1 text-sm font-black tracking-[.12em] text-white">
                    {onboardingLocked ? "TALK" : "FRONT DESK"}
                  </span>
                  <span className="mt-2 text-[10px] text-zinc-500 group-hover:text-zinc-300">
                    PRESS OR TAP TO SPEAK
                  </span>
                </button>
              </div>

              <div className="flex items-center justify-center border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.01))] text-center text-[9px] tracking-[.2em] text-zinc-500">
                <span className="flex flex-col items-center gap-1">
                  <img
                    src={`${import.meta.env.BASE_URL}pixel-agents/shadow-tower/directory.png`}
                    alt=""
                    className="h-12 w-16 object-contain opacity-75"
                  />{" "}
                  WAITING LOUNGE
                </span>
              </div>

              <div className="flex items-center justify-center border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.01))]">
                <img
                  src={`${import.meta.env.BASE_URL}pixel-agents/shadow-tower/vending.png`}
                  alt="Lobby vending machine"
                  className="h-16 w-20 object-contain opacity-75"
                />
              </div>

              <div className="col-span-3 grid grid-cols-[1fr_1.8fr_1fr] gap-3 sm:gap-5">
                <div className="flex items-center justify-center gap-2 border border-white/10 bg-[#080d13]/75 text-[9px] tracking-[.15em] text-zinc-500">
                  <img
                    src={`${import.meta.env.BASE_URL}pixel-agents/shadow-tower/desk-terminal.png`}
                    alt=""
                    className="h-11 w-11 object-contain opacity-75"
                  />{" "}
                  SECURITY DESK
                </div>
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
                        GO TO WORK{" "}
                        <span className="ml-2 animate-pulse">&gt;&gt;</span>
                      </span>
                    )}
                    <DoorOpen className="h-4 w-4" /> WORK ACCESS{" "}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
                <div className="flex items-center justify-center border border-white/10 bg-[#080d13]/75 text-[9px] tracking-[.15em] text-zinc-500">
                  LOBBY SERVICES
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="hidden"
          data-testid="reception-desk"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-cyan-300/40 bg-cyan-300/10">
                <ClipboardList className="h-5 w-5 text-cyan-200" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[.3em] text-cyan-200">
                  RECEPTION
                </p>
                <h2 className="mt-1 text-xl font-black tracking-[.12em] text-white">
                  {onboardingLocked ? "CHECK IN" : "FRONT DESK"}
                </h2>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 border border-emerald-300/20 bg-emerald-300/5 px-3 py-2 text-[10px] tracking-[.18em] text-emerald-200">
              <DoorOpen className="h-3.5 w-3.5" /> DESK ACTIVE
            </div>
          </div>
          {onboardingLocked ? (
            <button
              type="button"
               onClick={beginReception}
              className="mt-4 flex w-full items-center justify-center gap-2 border border-cyan-200/50 bg-cyan-300/10 px-4 py-3 text-xs font-black tracking-[.16em] text-cyan-100 transition hover:bg-cyan-300/15"
            >
              <UserRound className="h-4 w-4" /> SPEAK WITH RECEPTIONIST
            </button>
          ) : (
            <div className="mt-4 border border-cyan-300/20 bg-cyan-300/[.04] p-4 text-xs leading-6 text-zinc-300">
              <p className="font-black tracking-[.14em] text-cyan-100">
                FRONT DESK ACTIVE
              </p>
              <p className="mt-2">Use the building.</p>
            </div>
          )}
          {!onboardingLocked && (
            <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-bold tracking-[.14em] text-zinc-600">
              <span className="border border-white/10 px-2 py-1">RENTALS</span>
              <span className="border border-white/10 px-2 py-1">
                EMPLOYMENT DESK
              </span>
              <span className="border border-white/10 px-2 py-1">
                CITY ACCESS
              </span>
            </div>
          )}
        </section>

        <details
          className={`border border-white/10 bg-white/[.015] ${onboardingLocked ? "hidden" : ""}`}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-[10px] font-bold tracking-[.2em] text-zinc-400 hover:text-cyan-200">
            <span>FULL 67-FLOOR DIRECTORY</span>
            <span>{onboardingLocked ? "LOCKED UNTIL CHECK-IN" : "OPEN"}</span>
          </summary>
          <div className="grid gap-2 border-t border-white/10 p-3">
            {floors.map(
              ({
                floor,
                name,
                kind,
                detail,
                href,
                tone,
                icon: Icon,
                quote,
              }) => {
                const content = (
                  <div
                    className={`group relative flex items-center gap-4 overflow-hidden border p-4 transition duration-500 hover:-translate-y-0.5 hover:pl-6 ${
                      tone === "shadow"
                        ? "border-violet-500/50 bg-[radial-gradient(circle_at_80%,#301044,#0b0714)] hover:border-violet-300"
                        : tone === "pablo"
                          ? "border-amber-300/40 bg-[radial-gradient(circle_at_80%,#46331a,#101018)] hover:border-amber-200"
                          : tone === "security"
                            ? "border-red-400/30 bg-red-950/10 hover:border-red-300"
                            : tone === "secret"
                              ? "border-violet-400/25 bg-violet-950/10 hover:border-violet-300"
                              : "border-white/10 bg-white/[.025] hover:border-cyan-300/50"
                    }`}
                  >
                    <div className="w-12 text-center font-mono text-xl text-zinc-500 group-hover:text-cyan-300 transition-colors">
                      {String(floor).padStart(2, "0")}
                    </div>
                    <Icon
                      className={`h-5 w-5 shrink-0 ${tone === "shadow" || tone === "secret" ? "text-violet-300 animate-pulse" : tone === "pablo" ? "text-amber-300" : "text-cyan-300"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="tracking-[.15em]">{name}</strong>
                        <span className="text-[9px] tracking-[.2em] text-zinc-500">
                          {kind}
                        </span>
                      </div>
                      {quote ? (
                        <div className="mt-2 flex flex-col gap-2">
                          <div className="text-xs text-cyan-400/80 font-mono flex flex-wrap gap-x-4 gap-y-1">
                            <span>ƒ{quote.totalFiat.toLocaleString()}/mo</span>
                            <span className="text-zinc-500">·</span>
                            <span className="text-zinc-400">
                              {quote.squareMeters.toLocaleString()}m²
                            </span>
                            <span className="text-zinc-500">·</span>
                            <span className="text-zinc-400">
                              ƒ{quote.fiatPerSquareMeter.toFixed(1)}/m²
                            </span>
                            <span className="text-zinc-500">·</span>
                            <span className="text-zinc-400">
                              2-4 OFFICE CAPABILITY
                            </span>
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
                    {href && !onboardingLocked ? (
                      <span className="text-xs text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity">
                        OPEN →
                      </span>
                    ) : (
                      <span className="text-[9px] tracking-widest text-zinc-600">
                        {onboardingLocked && href
                          ? "CHECK IN FIRST"
                          : tone === "shadow" || tone === "secret"
                            ? "SEALED"
                            : "UNAVAILABLE"}
                      </span>
                    )}
                    <div className="absolute inset-y-0 left-0 w-0.5 bg-cyan-300/0 group-hover:bg-cyan-300/70 transition-colors" />
                  </div>
                );
                return href && !onboardingLocked ? (
                  <Link key={floor} href={href}>
                    {content}
                  </Link>
                ) : (
                  <div key={floor}>{content}</div>
                );
              },
            )}
          </div>
        </details>
        <footer
          className={`mt-5 flex items-center gap-2 text-[10px] tracking-[.2em] text-zinc-600 ${onboardingLocked ? "hidden" : ""}`}
        >
          <KeyRound className="h-3 w-3" /> HIGHER FLOORS COST MORE · ACCESS IS
          DECIDED AT THE DOOR · PIN OR ROLE REQUIRED FOR PRIVATE SPACE
        </footer>
      </div>

    </main>
  );
}
