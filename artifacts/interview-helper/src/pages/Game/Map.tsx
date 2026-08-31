import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Building2, ChevronLeft, Compass, Map as MapIcon, RotateCcw } from 'lucide-react';
import { BurnedPaperMap, type MapWaypoint, type WorldEventMarker } from '@/components/BurnedPaperMap';
import { BuildingFloorPlan } from '@/components/BuildingFloorPlan';
import { CORE_ANCHORS } from '@/lib/city-config';
import { BUILDING_INTERIOR_MAP, INTERIOR_DEFS } from '@/pages/worldInteriorData';
import { getMapContext, type MapContext } from '@/lib/map-context';
import { getOfficeFloorPlan } from '@/lib/office-floor-plan';
import {
  UNDERGROUND_BOUNDS,
  UNDERGROUND_POIS,
  isUndergroundTile,
  parseLayerTile,
  type WorldLayer,
} from '@/lib/vertical-world';

type MapView = WorldLayer | 'building';

function readCurrentPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem('sm_save');
    if (!raw) return null;
    const save = JSON.parse(raw) as Record<string, unknown>;
    const x = Number(save.x ?? save.px ?? (save.position as { x?: number } | undefined)?.x);
    const y = Number(save.y ?? save.py ?? (save.position as { y?: number } | undefined)?.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch {
    return null;
  }
}

function readWorldLayer(): WorldLayer {
  try {
    const save = JSON.parse(localStorage.getItem('sm_save') || '{}') as { worldLayer?: WorldLayer };
    return save.worldLayer === 'underground' ? 'underground' : 'surface';
  } catch {
    return 'surface';
  }
}

function UndergroundMap({ exploredTiles, currentPosition }: {
  exploredTiles: string[];
  currentPosition: { x: number; y: number } | null;
}) {
  const discovered = new Set(exploredTiles.filter(isUndergroundTile));
  const spanX = UNDERGROUND_BOUNDS.right - UNDERGROUND_BOUNDS.left;
  const spanY = UNDERGROUND_BOUNDS.bottom - UNDERGROUND_BOUNDS.top;
  const px = (x: number) => ((x - UNDERGROUND_BOUNDS.left) / spanX) * 100;
  const py = (y: number) => ((y - UNDERGROUND_BOUNDS.top) / spanY) * 100;
  const isPoiKnown = (x: number, y: number) => {
    const qx = Math.floor(x / 256), qy = Math.floor(y / 256);
    return [...discovered].some(tile => {
      const parsed = parseLayerTile(tile);
      return parsed?.layer === 'underground' && Math.abs(parsed.x - qx) <= 1 && Math.abs(parsed.y - qy) <= 1;
    });
  };
  return (
    <div className="relative h-full min-h-[420px] overflow-hidden bg-[#03040b]">
      <div className="absolute inset-5 border border-fuchsia-300/25 bg-[linear-gradient(rgba(56,189,248,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,.05)_1px,transparent_1px)] bg-[size:28px_28px] shadow-[inset_0_0_90px_rgba(124,58,237,.18)]">
        <div className="absolute left-[50%] top-[20%] h-[58%] w-3 -translate-x-1/2 bg-fuchsia-300/15 shadow-[0_0_18px_rgba(217,70,239,.45)]" />
        <div className="absolute left-[15%] top-[52%] h-3 w-[70%] bg-cyan-300/15 shadow-[0_0_18px_rgba(34,211,238,.35)]" />
        {UNDERGROUND_POIS.map(poi => {
          const known = isPoiKnown(poi.x, poi.y);
          return (
            <div key={poi.id} className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
              style={{ left: `${px(poi.x)}%`, top: `${py(poi.y)}%`, opacity: known ? 1 : .22 }}>
              <div className="mx-auto h-3 w-3 rotate-45 border" style={{ borderColor: poi.color, boxShadow: known ? `0 0 14px ${poi.color}` : undefined }} />
              <p className="mt-2 whitespace-nowrap font-mono text-[9px] tracking-widest" style={{ color: poi.color }}>
                {known ? poi.title : 'UNKNOWN SIGNAL'}
              </p>
            </div>
          );
        })}
        {currentPosition && (
          <div data-testid="marker-underground-player" className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_16px_#fff]"
            style={{ left: `${px(currentPosition.x)}%`, top: `${py(currentPosition.y)}%` }} />
        )}
      </div>
      <div className="absolute bottom-3 left-4 font-mono text-[9px] tracking-[.25em] text-fuchsia-200/70">
        MINX UNDERCITY · LEVEL B1 · SIGNAL-REVEALED
      </div>
    </div>
  );
}

function readOfficeTier(): string {
  try {
    return localStorage.getItem('salaryman_office_tier') || 'capsule';
  } catch {
    return 'capsule';
  }
}

function readActiveEvents(): WorldEventMarker[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem('sm_active_world_events') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function GameMap() {
  const [, navigate] = useLocation();
  const [exploredTiles, setExploredTiles] = useState<string[]>([]);
  const [waypoint, setWaypoint] = useState<MapWaypoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [events, setEvents] = useState<WorldEventMarker[]>(readActiveEvents);
  const [context, setContext] = useState<MapContext | null>(getMapContext);
  const activeWorldLayer = useMemo(readWorldLayer, []);
  const [view, setView] = useState<MapView>(activeWorldLayer);
  const currentPosition = useMemo(readCurrentPosition, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/exploration', { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (cancelled) return;
        setExploredTiles(Array.isArray(body.exploredTiles) ? body.exploredTiles : []);
        setWaypoint(body.waypoint ?? null);
      } catch (error) {
        if (!cancelled) setErr((error as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const refresh = () => {
      setEvents(readActiveEvents());
      setContext(getMapContext());
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const buildingDef = useMemo(() => {
    if (!context) return null;
    if (context.kind === 'office') return getOfficeFloorPlan(context.officeTier || readOfficeTier());
    if (context.floorPlan) return context.floorPlan;
    const mappedKey = BUILDING_INTERIOR_MAP[context.buildingId] || context.interiorKey;
    return INTERIOR_DEFS[context.interiorKey] || INTERIOR_DEFS[mappedKey] || null;
  }, [context]);

  async function placeWaypoint(x: number, y: number) {
    setWaypoint({ x, y, label: null });
    try {
      await fetch('/api/exploration/waypoint', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ x, y }),
      });
    } catch { /* best effort; the local marker remains useful offline */ }
  }

  async function clearWaypoint() {
    setWaypoint(null);
    try {
      await fetch('/api/exploration/clear-waypoint', { method: 'POST', credentials: 'include' });
    } catch { /* best effort */ }
  }

  function handleEventClick(event: WorldEventMarker) {
    try {
      sessionStorage.setItem('sm_event_goto', JSON.stringify({ x: event.locationX, y: event.locationY }));
    } catch { /* best effort */ }
    void placeWaypoint(event.locationX, event.locationY);
    navigate('/world/play');
  }

  const buildingLabel = context?.buildingLabel || buildingDef?.label || 'CURRENT BUILDING';

  return (
    <div className="min-h-screen w-full text-slate-100"
      style={{
        background: 'radial-gradient(circle at 50% -10%, rgba(32,83,112,.35), transparent 52%), #03070d',
        paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 4rem)',
      }}>
      <div className="max-w-6xl mx-auto px-3 sm:px-6">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-mono tracking-[.48em] text-cyan-300/50">SALARYMAN // FIELD SYSTEM</p>
            <h1 className="text-2xl sm:text-3xl font-mono tracking-[.16em] text-cyan-50 mt-1">VISITOR ATLAS</h1>
            <p className="mt-1 text-[10px] font-mono tracking-widest text-slate-500">CITY SIGNALS · STREET GRID · INTERIOR SCHEMATICS</p>
          </div>
          <Link href="/office" data-testid="link-map-office"
            className="flex items-center gap-1 text-[10px] font-mono tracking-widest text-slate-500 hover:text-cyan-200">
            <ChevronLeft className="w-3.5 h-3.5" /> OFFICE
          </Link>
        </header>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-cyan-300/20 bg-slate-950/70 p-1">
            <button type="button" data-testid="button-map-city"
              onClick={() => setView('surface')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[10px] font-mono tracking-widest transition-colors ${view === 'surface' ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-500 hover:text-slate-200'}`}>
              <MapIcon className="w-3.5 h-3.5" /> SURFACE
            </button>
            <button type="button" data-testid="button-map-underground"
              onClick={() => setView('underground')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[10px] font-mono tracking-widest transition-colors ${view === 'underground' ? 'bg-fuchsia-400/15 text-fuchsia-200' : 'text-slate-500 hover:text-slate-200'}`}>
              <MapIcon className="w-3.5 h-3.5" /> UNDERGROUND
            </button>
            <button type="button" data-testid="button-map-building"
              onClick={() => setView('building')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[10px] font-mono tracking-widest transition-colors ${view === 'building' ? 'bg-lime-300/15 text-lime-200' : 'text-slate-500 hover:text-slate-200'}`}>
              <Building2 className="w-3.5 h-3.5" /> BUILDING
            </button>
          </div>
          <span className="text-[10px] font-mono tracking-widest text-slate-600">
            {view === 'building' && buildingDef ? buildingLabel : view === 'underground' ? 'MINX CITY // LEVEL B1' : 'MINX CITY // SAFE CORE'}
          </span>
          {view === 'building' && !buildingDef && (
            <span className="text-[10px] font-mono tracking-widest text-amber-300/70">NO INTERIOR SIGNAL</span>
          )}
        </div>

        {events.length > 0 && view === 'surface' && (
          <div className="mb-3 flex flex-wrap gap-2">
            {events.map((event) => (
              <button key={event.id} type="button" data-testid={`button-event-response-${event.id}`}
                onClick={() => handleEventClick(event)}
                className="px-3 py-1.5 text-[10px] font-mono tracking-widest rounded border border-rose-400/45 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20">
                ! {event.banner?.replace(/^> /, '') ?? event.eventType.replace('evt_', '').toUpperCase()} — SELECT RESPONSE
              </button>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-cyan-300/15 bg-[#050c14] overflow-hidden shadow-[0_20px_80px_rgba(0,0,0,.45)]"
          style={{ minHeight: view === 'building' ? 520 : undefined }}>
          {loading && view !== 'building' ? (
            <div className="aspect-[4/3] grid place-items-center text-cyan-300/60 font-mono text-xs tracking-[.28em]">
              <span data-testid="status-map-loading">SYNCING CITY SIGNALS…</span>
            </div>
          ) : err && view !== 'building' ? (
            <div className="aspect-[4/3] grid place-items-center text-rose-300/80 font-mono text-xs" data-testid="status-map-error">{err}</div>
          ) : view === 'building' && buildingDef ? (
            <BuildingFloorPlan def={buildingDef} buildingLabel={buildingLabel} floor={context?.kind === 'building' ? context.floor : undefined} />
          ) : view === 'building' ? (
            <div className="min-h-[420px] grid place-items-center p-8 text-center">
              <div>
                <Building2 className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-3 text-sm font-mono tracking-widest text-slate-400">BUILDING PLAN UNAVAILABLE</p>
                <p className="mt-2 max-w-sm text-[11px] leading-relaxed text-slate-600">
                  Enter a mapped building or return to the office to load its live floor schematic.
                </p>
                <button type="button" data-testid="button-return-city"
                  onClick={() => setView('surface')}
                  className="mt-4 rounded border border-cyan-300/25 px-3 py-2 text-[10px] font-mono tracking-widest text-cyan-200 hover:bg-cyan-300/10">
                  RETURN TO CITY MAP
                </button>
              </div>
            </div>
          ) : view === 'underground' ? (
            <div className="aspect-[4/3]">
              <UndergroundMap
                exploredTiles={exploredTiles}
                currentPosition={activeWorldLayer === 'underground' ? currentPosition : null}
              />
            </div>
          ) : (
            <div className="aspect-[4/3]">
              <BurnedPaperMap
                exploredTiles={exploredTiles}
                currentPosition={currentPosition}
                waypoint={waypoint}
                onWaypointSet={placeWaypoint}
                events={events}
                onEventClick={handleEventClick}
              />
            </div>
          )}
        </div>

        {view === 'surface' ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-mono tracking-widest text-slate-500">
            <span className="flex items-center gap-1.5"><Compass className="w-3 h-3 text-cyan-300" /> CLICK ATLAS TO MARK WAYPOINT</span>
            {waypoint && (
              <button type="button" data-testid="button-clear-waypoint" onClick={clearWaypoint}
                className="flex items-center gap-1.5 rounded border border-lime-300/35 px-2 py-1 text-lime-200 hover:bg-lime-300/10">
                <RotateCcw className="w-3 h-3" /> CLEAR WAYPOINT
              </button>
            )}
            <span className="ml-auto" data-testid="text-explored-count">DISCOVERED TILES: {exploredTiles.filter(tile => !isUndergroundTile(tile)).length}</span>
          </div>
        ) : view === 'underground' ? (
          <div className="mt-3 flex items-center gap-2 text-[10px] font-mono tracking-widest text-fuchsia-200/60">
            <span>UNDERGROUND VIEW · LANDMARKS REVEAL AS YOU EXPLORE</span>
            <span className="ml-auto" data-testid="text-underground-explored-count">DISCOVERED TILES: {exploredTiles.filter(isUndergroundTile).length}</span>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-[10px] font-mono tracking-widest text-slate-500">
            <span>BUILDING VIEW · READ-ONLY LIVE DEFINITION</span>
            <span className="ml-auto">CITY ACCESS REMAINS UNCHANGED</span>
          </div>
        )}

        <section className="mt-6">
          <h2 className="text-[10px] font-mono tracking-[.35em] text-slate-500 mb-2">KNOWN SIGNALS</h2>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
            {CORE_ANCHORS.map((anchor) => (
              <li key={anchor.id} data-testid={`signal-${anchor.id}`}
                className="rounded border border-cyan-300/10 bg-cyan-300/[.03] p-2">
                <p className="tracking-widest text-cyan-200/80">{anchor.short}</p>
                <p className="text-slate-600 text-[10px] mt-1 leading-relaxed">{anchor.desc}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}