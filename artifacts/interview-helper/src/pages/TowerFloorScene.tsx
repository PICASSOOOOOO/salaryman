import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Building2, DoorClosed, KeyRound, LockKeyhole, MapPin, Radio, ShieldAlert, Sparkles } from "lucide-react";
import { Link, useLocation } from "wouter";
import { IsoOffice } from "@/components/IsoOffice";
import {
  getPublicFloorOfficeLayout,
  getRecreationOfficeLayout,
  officePropertyLayoutFromPlan,
  type OfficePropertyLayout,
} from "@/lib/office-property-layouts";
import { getActiveCityId, getActiveCityName } from "@/lib/city-defs";
import { CityClock } from "@/components/CityClock";
import { getTowerAmbientOccupants, getTowerOperatorDialogue, type TowerOperatorDialogue } from "@/lib/tower-life";
import { getTowerSpaceArtKind, getTowerSpaceArtUrl, type TowerSpaceArtKind } from "@/lib/tower-space-art";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api-client";
import {
  getShadowTowerCommercialTenants,
  getShadowTowerPlan,
  type ShadowTowerArchetype,
  type ShadowTowerCity,
  type ShadowTowerCommercialTenant,
} from "@workspace/api-zod/shadow-tower";

export type TowerFloorStatus = "service" | "public" | "available" | "occupied" | "sealed" | "restricted";

export interface TowerFloorIdentity {
  floor: number;
  shortLabel: string;
  label: string;
  status: TowerFloorStatus;
  statusLabel: string;
  detail: string;
  accessLabel: string;
  tenantKey?: string;
  tenantName?: string;
  tenantService?: string;
}

/**
 * The floor chrome is deliberately derived from the physical floor number.
 * This keeps a directory label from accidentally making a sealed floor look
 * enterable, while still allowing every floor to render its real shell.
 */
export function getTowerFloorIdentity(floor: number, tenant?: ShadowTowerCommercialTenant): TowerFloorIdentity {
  const normalized = Number.isFinite(floor) ? Math.trunc(floor) : 1;
  const catalogTenants = getShadowTowerCommercialTenants(normalized);
  const catalogTenant = tenant ?? catalogTenants[0];
  if (normalized === -1) {
    return {
      floor: normalized,
      shortLabel: "B1",
      label: "UNDERGROUND SERVICE LEVEL",
      status: "service",
      statusLabel: "SERVICE INTAKE",
      detail: "Loading, maintenance, and building systems beneath the public stack.",
      accessLabel: "OPERATIONS ACCESS",
    };
  }
  if (normalized === 1) {
    return {
      floor: normalized,
      shortLabel: "F1",
      label: "RECREATION FLOOR",
      status: "public",
      statusLabel: "PUBLIC",
      detail: "Food, games, and the first place a new operator learns the Tower.",
      accessLabel: "PUBLIC ACCESS",
    };
  }
  if (normalized === 2) {
    return {
      floor: normalized,
      shortLabel: "F2",
      label: "PUBLIC COMPUTER CAFE",
      status: "public",
      statusLabel: "PUBLIC",
      detail: "Free terminals, a work board, and a live service route through the mezzanine.",
      accessLabel: "PUBLIC ACCESS",
    };
  }
  if (normalized === 3) {
    return {
      floor: normalized,
      shortLabel: "F3",
      label: "INFIRMARY AND REST WARD",
      status: "public",
      statusLabel: "PUBLIC",
      detail: "Observation beds and practical care for people who are still on shift.",
      accessLabel: "PUBLIC ACCESS",
    };
  }
  if (normalized === 4) {
    return {
      floor: normalized,
      shortLabel: "F4",
      label: "SECURITY AND CUSTODY",
      status: "public",
      statusLabel: "GUARDED PUBLIC",
      detail: "Access control, evidence, custody, and the floor that keeps the others moving.",
      accessLabel: "GUARDED ACCESS",
    };
  }
  if ([40, 52, 65].includes(normalized)) {
    return {
      floor: normalized,
      shortLabel: `F${normalized}`,
      label: `SEALED FLOOR ${normalized}`,
      status: "sealed",
      statusLabel: "SEALED",
      detail: "The structure is present. The registry is not. Doors remain under municipal restriction.",
      accessLabel: "RESTRICTED ACCESS",
    };
  }
  if (normalized === 66) {
    return {
      floor: normalized,
      shortLabel: "F66",
      label: "PICASSO EXECUTIVE FLOOR",
      status: "occupied",
      statusLabel: "OCCUPIED",
      detail: "Private operations, executive rooms, and the organization that keeps a key to this level.",
      accessLabel: "ORGANIZATION ACCESS",
    };
  }
  if (normalized === 67) {
    return {
      floor: normalized,
      shortLabel: "F67",
      label: "SHADOW CORP ROOFLINE",
      status: "restricted",
      statusLabel: "RESTRICTED",
      detail: "A physically finished floor with no public tenant record and no ordinary lift permission.",
      accessLabel: "SHADOW CORP ONLY",
    };
  }
  if (normalized >= 5 && normalized <= 64) {
    if (catalogTenant) {
      return {
        floor: normalized,
        shortLabel: `F${normalized}`,
        label: catalogTenants.length > 1
          ? catalogTenants.map((candidate) => candidate.business.name).join(" + ")
          : catalogTenant.business.name,
        status: "occupied",
        statusLabel: "OCCUPIED",
        detail: `${catalogTenants.map((candidate) => candidate.fitout.label).join(" · ")} · ${catalogTenants.length} resident operator${catalogTenants.length === 1 ? "" : "s"} on route.`,
        accessLabel: "TENANT SERVICE ACCESS",
        tenantKey: catalogTenant.businessKey,
        tenantName: catalogTenant.business.name,
        tenantService: catalogTenant.service.label,
      };
    }
    return {
      floor: normalized,
      shortLabel: `F${normalized}`,
      label: `COMMERCIAL FLOOR ${normalized}`,
      status: "available",
      statusLabel: "AVAILABLE",
      detail: "A real floor shell awaiting a tenant fit-out. Walk the empty address before you make an offer.",
      accessLabel: "REGISTRY ACCESS",
    };
  }
  if (normalized > 67) {
    return {
      floor: normalized,
      shortLabel: `F${normalized}`,
      label: `UPPER TOWER FLOOR ${normalized}`,
      status: "restricted",
      statusLabel: "UNDER CONSTRUCTION",
      detail: "The upper stack exists in the building plan, but construction access remains controlled.",
      accessLabel: "CONSTRUCTION ACCESS",
    };
  }
  return {
    floor: normalized,
    shortLabel: `F${normalized}`,
    label: `TOWER FLOOR ${normalized}`,
    status: "restricted",
    statusLabel: "RESTRICTED",
    detail: "This floor has a physical address but no public operating program.",
    accessLabel: "RESTRICTED ACCESS",
  };
}

export interface TowerFloorSceneProps {
  /** Physical floor number. B1 is represented by -1. */
  floor: number;
  city?: ShadowTowerCity;
  archetype?: ShadowTowerArchetype;
  upgrades?: readonly string[];
  /** Optional label for the player's paper-doll. */
  playerName?: string;
}

const statusClasses: Record<TowerFloorStatus, string> = {
  service: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  public: "border-cyan-300/40 bg-cyan-300/10 text-cyan-100",
  available: "border-lime-300/40 bg-lime-300/10 text-lime-100",
  occupied: "border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-100",
  sealed: "border-red-300/40 bg-red-300/10 text-red-100",
  restricted: "border-violet-300/40 bg-violet-300/10 text-violet-100",
};

const floorIcon: Record<TowerFloorStatus, typeof Building2> = {
  service: Radio,
  public: Sparkles,
  available: Building2,
  occupied: Building2,
  sealed: LockKeyhole,
  restricted: ShieldAlert,
};

function resolveCity(city?: ShadowTowerCity): ShadowTowerCity {
  if (city) return city;
  return getActiveCityId() === "huda_city" ? "huda_city" : "minx_city";
}

function getLayoutForFloor(
  floor: number,
  city: ShadowTowerCity,
  archetype: ShadowTowerArchetype,
  upgrades: readonly string[],
  tenants: readonly ShadowTowerCommercialTenant[],
  lockOfficeEntrances = true,
): OfficePropertyLayout {
  if (floor === 1) return getRecreationOfficeLayout(city);
  if (floor === 2 || floor === 3 || floor === 4) return getPublicFloorOfficeLayout(city, floor);

  // The server plan schema starts at F1. B1 is the same built shell rendered as
  // a service level, with a distinct property key and identity in the chrome.
  const planFloor = floor === -1 ? 1 : Math.max(1, floor);
  const plan = getShadowTowerPlan(city, planFloor, archetype, upgrades, Math.max(1, tenants.length));
  return officePropertyLayoutFromPlan(plan, `${city}:${floor === -1 ? "b1" : floor}`, tenants, lockOfficeEntrances);
}

function floorPathFor(location: string, floor: number): string {
  if (location) return location;
  return floor === -1 ? "/tower/floor/b1" : `/tower/floor/${floor}`;
}

export default function TowerFloorScene({
  floor,
  city: cityProp,
  archetype,
  upgrades = [],
  playerName = "OPERATOR",
}: TowerFloorSceneProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, navigate] = useLocation();
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1100 : window.innerWidth,
    height: typeof window === "undefined" ? 680 : Math.max(420, window.innerHeight - 128),
  }));
  const [feedback, setFeedback] = useState("WALK THE FLOOR · APPROACH A STATION · PRESS E");
  const [lastInteraction, setLastInteraction] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<TowerOperatorDialogue | null>(null);
  const [floorRecordState, setFloorRecordState] = useState<"unknown" | "exists" | "missing">("unknown");
  const [unlockedRooms, setUnlockedRooms] = useState<string[]>([]);
  const [doorPrompt, setDoorPrompt] = useState<{ roomId: string; label: string } | null>(null);
  const [doorPassword, setDoorPassword] = useState("");
  const [doorError, setDoorError] = useState("");

  const safeFloor = Number.isFinite(floor) ? Math.trunc(floor) : 1;
  const city = useMemo(() => resolveCity(cityProp), [cityProp]);
  const commercialTenants = useMemo(() => getShadowTowerCommercialTenants(safeFloor), [safeFloor]);
  const identity = useMemo(() => getTowerFloorIdentity(safeFloor, commercialTenants[0]), [commercialTenants, safeFloor]);
  const selectedArchetype: ShadowTowerArchetype = archetype ?? (identity.status === "available" ? "founder_team" : "company");
  const baseLayout = useMemo(
    () => getLayoutForFloor(
      safeFloor,
      city,
      selectedArchetype,
      upgrades,
      commercialTenants,
      identity.status === "occupied" && floorRecordState !== "missing",
    ),
    [city, commercialTenants, floorRecordState, identity.status, safeFloor, selectedArchetype, upgrades],
  );
  const layout = useMemo(
    () => unlockedRooms.length
      ? {
        ...baseLayout,
        rooms: baseLayout.rooms.map((room) => unlockedRooms.includes(room.id) ? { ...room, locked: false } : room),
        stations: baseLayout.stations.filter((station) => !station.id.endsWith("-door") || !unlockedRooms.includes(station.id.slice(0, -"-door".length))),
      }
      : baseLayout,
    [baseLayout, unlockedRooms],
  );
  const artKind: TowerSpaceArtKind | null = useMemo(() => {
    // Available and sealed addresses are real shells, not tenant interiors.
    // Keep them visually empty until a fit-out is purchased or the floor is
    // explicitly occupied.
    if (identity.status === "available" || identity.status === "sealed") return null;
    return getTowerSpaceArtKind(layout);
  }, [identity.status, layout]);
  const floorPath = useMemo(() => floorPathFor(location, safeFloor), [location, safeFloor]);
  const ambientOccupants = useMemo(() => {
    return getTowerAmbientOccupants(safeFloor);
  }, [safeFloor]);

  useEffect(() => {
    const resize = () => setViewport({
      width: window.innerWidth,
      height: Math.max(420, window.innerHeight - 128),
    });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    setFeedback("WALK THE FLOOR · APPROACH A STATION · PRESS E");
    setLastInteraction(null);
    setActiveConversation(null);
  }, [safeFloor]);

  useEffect(() => {
    setUnlockedRooms([]);
    setDoorPrompt(null);
    setDoorPassword("");
    setDoorError("");
    if (!isAuthenticated || identity.status !== "occupied" || safeFloor < 1) {
      setFloorRecordState("missing");
      return;
    }
    let cancelled = false;
    setFloorRecordState("unknown");
    void apiFetch(`/api/shadow-tower/floors/${city}/${safeFloor}`, { credentials: "include" })
      .then((response) => {
        if (!cancelled) setFloorRecordState(response.status === 404 ? "missing" : "exists");
      })
      .catch(() => {
        if (!cancelled) setFloorRecordState("unknown");
      });
    return () => { cancelled = true; };
  }, [city, identity.status, isAuthenticated, safeFloor]);

  const elevatorDestination = useMemo(
    () => `/tower/elevator?from=${encodeURIComponent(floorPath)}&floor=${safeFloor}`,
    [floorPath, safeFloor],
  );

  const interact = useCallback((station: { id: string; label: string; glyph?: string }) => {
    const id = station.id.toLowerCase();
    const label = station.label.toUpperCase();
    if (id.endsWith("-door")) {
      const roomId = station.id.slice(0, -"-door".length);
      if (unlockedRooms.includes(roomId)) {
        setFeedback(`${label} · ACCESS GRANTED`);
        return;
      }
      if (floorRecordState !== "exists") {
        setFeedback(floorRecordState === "missing"
          ? `${label} · NO PRIVATE FLOOR RECORD · ACCESS IS NOT CONFIGURED`
          : `${label} · CHECKING FLOOR ACCESS`);
        return;
      }
      setDoorPrompt({ roomId, label: station.label.replace(/ · LOCKED$/i, "") });
      setDoorPassword("");
      setDoorError("");
      setFeedback(`${label} · PASSWORD REQUIRED`);
      return;
    }
    const tenant = commercialTenants.find((candidate) => id === `tenant-service-${candidate.businessKey}`);
    if (tenant) {
      setFeedback(`${tenant.business.name.toUpperCase()} · ${tenant.service.label.toUpperCase()} · OPENING SERVER SERVICES BOARD`);
      navigate(`${tenant.service.settlementPath}?tenant=${encodeURIComponent(tenant.businessKey)}&floor=${safeFloor}`);
      return;
    }
    if (id.includes("elevator") || station.glyph === "elevator" && !id.includes("stairs")) {
      setFeedback("LIFT STATION READY · OPENING THE TOWER DIRECTORY");
      navigate(elevatorDestination);
      return;
    }
    if (id.includes("stairs") || label.includes("STAIRS")) {
      const direction = safeFloor <= 1 ? "UP TO PUBLIC FLOORS" : `TOWARD F${safeFloor - 1}`;
      setFeedback(`STAIRS CHECKED · ${direction} · ELEVATOR REQUIRED FOR LONG TRANSIT`);
      setLastInteraction("STAIRWELL");
      return;
    }
    if (identity.status === "sealed" || identity.status === "restricted") {
      setFeedback(`${label} · ACCESS DENIED · ${identity.accessLabel}`);
    } else if (identity.status === "available") {
      setFeedback(`${label} · FLOOR ${safeFloor} IS VACANT · REGISTRY FIT-OUT REQUIRED`);
    } else {
      setFeedback(`${label} · INTERACTION LOGGED · ${identity.label}`);
    }
    setLastInteraction(label);
  }, [commercialTenants, elevatorDestination, floorRecordState, identity, navigate, safeFloor, unlockedRooms]);

  const verifyDoorPassword = useCallback(async () => {
    if (!doorPrompt || floorRecordState !== "exists") return;
    setDoorError("");
    const response = await apiFetch(`/api/shadow-tower/floors/${city}/${safeFloor}`, {
      credentials: "include",
      headers: doorPassword.trim() ? { "x-shadow-tower-password": doorPassword } : undefined,
    });
    if (response.ok) {
      setUnlockedRooms((current) => current.includes(doorPrompt.roomId) ? current : [...current, doorPrompt.roomId]);
      setFeedback(`${doorPrompt.label.toUpperCase()} · ACCESS GRANTED`);
      setDoorPrompt(null);
      setDoorPassword("");
      return;
    }
    if (response.status === 404) {
      setFloorRecordState("missing");
      setDoorError("PRIVATE FLOOR RECORD NOT FOUND");
      return;
    }
    setDoorError(response.status === 403 ? "ACCESS DENIED · CHECK THE PASSWORD" : "ACCESS CHECK FAILED");
  }, [city, doorPassword, doorPrompt, floorRecordState, safeFloor]);

  const stations = useMemo(
    () => layout.stations.map((station) => ({
      ...station,
      onInteract: () => interact(station),
    })),
    [interact, layout.stations],
  );

  const Icon = floorIcon[identity.status];
  const isSealed = identity.status === "sealed" || identity.status === "restricted";

  if (isLoading) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#070911] p-6 text-zinc-200">
        <section className="w-full max-w-md space-y-4 border border-cyan-300/20 bg-[#0b1220] p-6">
          <div className="h-3 w-32 animate-pulse bg-cyan-300/20" />
          <div className="h-8 w-3/4 animate-pulse bg-white/10" />
          <div className="h-20 animate-pulse bg-white/5" />
        </section>
      </main>
    );
  }

  return (
    <main
      className="flex min-h-[100dvh] flex-col overflow-hidden bg-[#060812] text-zinc-100"
      data-testid={`tower-floor-scene-${safeFloor}`}
      style={{ minHeight: "100dvh" }}
    >
      <header className="relative z-20 shrink-0 border-b border-cyan-300/20 bg-[#090e19]/95 px-3 py-3 shadow-[0_8px_40px_rgba(0,0,0,.25)] sm:px-6">
        <div className="mx-auto flex max-w-[1500px] items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[.24em] text-cyan-200">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>{getActiveCityName().toUpperCase()}</span>
              <span className="text-zinc-600">/</span>
              <span>SHADOW TOWER</span>
            </div>
            <div className="mt-1"><CityClock cityId={city} compact /></div>
            <div className="mt-2 flex items-center gap-2">
              <span className="grid h-9 min-w-12 place-items-center border border-cyan-200/50 bg-cyan-300/10 px-2 font-mono text-sm font-bold text-cyan-100">
                {identity.shortLabel}
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-black tracking-[.12em] text-white sm:text-base">{identity.label}</h1>
                <p className="truncate text-[10px] tracking-[.08em] text-zinc-500">{identity.detail}</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className={`hidden items-center gap-2 border px-3 py-2 text-[9px] font-black tracking-[.16em] sm:flex ${statusClasses[identity.status]}`}>
              <Icon className="h-3.5 w-3.5" />
              <span>{identity.statusLabel}</span>
            </div>
            <Link href="/tower" className="border border-white/15 px-3 py-2 text-[9px] font-black tracking-[.16em] text-zinc-300 transition hover:border-cyan-200/70 hover:text-cyan-100">
              DIRECTORY
            </Link>
          </div>
        </div>
        <div className="mx-auto mt-3 flex max-w-[1500px] items-center justify-between gap-3 text-[9px] font-mono tracking-[.12em] text-zinc-500">
           <span className="truncate">
             {identity.accessLabel} · {artKind ? `SPACE ART ${artKind.toUpperCase()}` : "UNFITTED SHELL"}
           </span>
          <span className="hidden shrink-0 sm:inline">{feedback}</span>
        </div>
      </header>

      <section className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_50%_5%,rgba(29,78,110,.22),transparent_56%),#050710]">
        <IsoOffice
          layout={layout}
          viewportWidth={viewport.width}
          viewportHeight={viewport.height}
          playable={isAuthenticated && !isSealed}
          followCam={viewport.width < 760}
          scale={viewport.width < 680 ? 3.6 : 4.2}
          stations={stations}
          rooms={layout.rooms}
          initialPose={layout.spawn}
          frozen={false}
          suppressLabels={viewport.width < 680}
          playerName={playerName}
          ambientOccupants={ambientOccupants}
          onAmbientInteract={(occupant) => {
            const tenant = commercialTenants.find((candidate) => candidate.resident.id === occupant.id);
            setLastInteraction(occupant.name);
            const dialogue = getTowerOperatorDialogue(tenant);
            setActiveConversation(dialogue);
            setFeedback(dialogue
              ? `${dialogue.residentName.toUpperCase()} · ${dialogue.service.toUpperCase()} · CONVERSATION OPEN`
              : `${occupant.name.toUpperCase()} · RESIDENT ROUTE · PRESS E TO SPEAK`);
          }}
          towerArt
           backdropSrc={artKind ? getTowerSpaceArtUrl(artKind) : null}
           accentColor={commercialTenants[0]?.business.color ?? null}
          lighting={identity.status === "occupied" ? "warm" : isSealed ? "dim" : "cool"}
          hallwayStyle={identity.status === "occupied" ? "executive" : "central"}
           hallwaySignage={commercialTenants.length
             ? commercialTenants.map((tenant) => tenant.business.name).join(" · ")
             : identity.shortLabel + " · " + identity.statusLabel}
          deskColCount={layout.deskCols}
          deskRowCount={layout.deskRows}
          capsuleCount={layout.capsules}
        />

        {doorPrompt && (
          <section
            className="absolute bottom-20 right-3 z-40 w-[min(24rem,calc(100%-1.5rem))] border border-amber-300/35 bg-[#17120b]/95 p-4 shadow-2xl backdrop-blur-md sm:bottom-24 sm:right-6"
            data-testid="tower-door-password"
            role="dialog"
            aria-label={`Password for ${doorPrompt.label}`}
          >
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black tracking-[.2em] text-amber-200">LOCKED ENTRANCE</p>
                <h2 className="mt-1 truncate text-sm font-black tracking-[.1em] text-white">{doorPrompt.label}</h2>
                <p className="mt-1 text-[10px] text-zinc-400">This executive or business entrance is checked by the Tower access server.</p>
                <input
                  autoFocus
                  type="password"
                  value={doorPassword}
                  onChange={(event) => setDoorPassword(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void verifyDoorPassword(); }}
                  placeholder="TOWER PASSWORD"
                  className="mt-3 w-full border border-amber-200/30 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-amber-200/70"
                />
                {doorError && <p className="mt-2 text-[10px] font-bold tracking-[.08em] text-red-200">{doorError}</p>}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => void verifyDoorPassword()} className="flex-1 border border-amber-200/50 bg-amber-200/10 px-3 py-2 text-[10px] font-black tracking-[.16em] text-amber-100">UNLOCK</button>
                  <button type="button" onClick={() => setDoorPrompt(null)} className="border border-white/15 px-3 py-2 text-[10px] font-black tracking-[.16em] text-zinc-400">CANCEL</button>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-3 sm:inset-x-6">
          <div className="max-w-xl border border-cyan-200/20 bg-[#07101b]/90 px-3 py-2 text-[10px] font-bold tracking-[.12em] text-cyan-100 shadow-xl backdrop-blur-sm">
            <span className="text-cyan-300">LIVE FLOOR</span>
            <span className="mx-2 text-zinc-600">·</span>
            {feedback}
            {lastInteraction && <span className="ml-2 text-zinc-500">[{lastInteraction}]</span>}
          </div>
          <div className="hidden items-center gap-2 border border-white/10 bg-[#07101b]/90 px-3 py-2 text-[9px] font-mono tracking-[.12em] text-zinc-400 shadow-xl backdrop-blur-sm sm:flex">
            <ArrowUp className="h-3 w-3 text-cyan-300" />
            <ArrowDown className="h-3 w-3 text-cyan-300" />
            <span>MOVE</span>
            <span className="text-zinc-700">·</span>
            <DoorClosed className="h-3 w-3 text-cyan-300" />
            <span>STATIONS</span>
          </div>
        </div>

        {activeConversation && (
          <section
            className="absolute bottom-20 left-3 z-40 w-[min(30rem,calc(100%-1.5rem))] border border-fuchsia-300/35 bg-[#0b1020]/95 p-4 shadow-2xl backdrop-blur-md sm:bottom-24 sm:left-6"
            data-testid="tower-operator-conversation"
            role="dialog"
            aria-label={`Conversation with ${activeConversation.residentName}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-black tracking-[.2em] text-fuchsia-200">TENANT CONVERSATION</p>
                <h2 className="mt-1 truncate text-sm font-black tracking-[.1em] text-white">{activeConversation.residentName}</h2>
                <p className="mt-1 text-[10px] font-mono tracking-[.08em] text-fuchsia-200/75">
                  {activeConversation.businessName} · {activeConversation.role}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 border border-white/15 px-2 py-1 text-[9px] font-black tracking-[.14em] text-zinc-400 transition hover:border-white/35 hover:text-white"
                onClick={() => setActiveConversation(null)}
              >
                CLOSE
              </button>
            </div>
            <div className="mt-3 space-y-2 border-l border-fuchsia-300/30 pl-3 text-xs leading-5 text-zinc-200">
              {activeConversation.lines.map((line) => <p key={line}>{line}</p>)}
            </div>
            <p className="mt-3 text-[9px] font-black tracking-[.14em] text-cyan-200/70">
              CURRENT SERVICE · {activeConversation.service.toUpperCase()}
            </p>
          </section>
        )}

        {!isAuthenticated && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-[#04060c]/55 p-4 backdrop-blur-[2px]">
            <section className="w-full max-w-md border border-cyan-300/30 bg-[#09111d]/95 p-6 text-center shadow-2xl">
              <KeyRound className="mx-auto h-8 w-8 text-cyan-200" />
              <h2 className="mt-3 text-sm font-black tracking-[.18em] text-cyan-100">CHECK IN TO WALK THE FLOOR</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">The physical address is here. Sign in to move through it and use the lift station.</p>
              <Link href={`/sign-in?returnTo=${encodeURIComponent(floorPath)}`} className="mt-5 block border border-cyan-200/50 bg-cyan-300/10 px-4 py-3 text-[10px] font-black tracking-[.18em] text-cyan-100 transition hover:bg-cyan-300/20">
                CHECK IN
              </Link>
            </section>
          </div>
        )}

        {isSealed && isAuthenticated && (
          <div className="pointer-events-none absolute right-3 top-3 z-10 max-w-xs border border-red-300/25 bg-[#150b13]/90 px-3 py-2 text-[9px] font-black tracking-[.14em] text-red-100 shadow-xl sm:right-6 sm:top-5">
            <div className="flex items-center gap-2"><LockKeyhole className="h-3.5 w-3.5" /> {identity.statusLabel}</div>
            <p className="mt-1 font-normal leading-4 tracking-normal text-red-100/60">The geometry is visible for building records. Movement is held at the access boundary.</p>
          </div>
        )}
      </section>
    </main>
  );
}
