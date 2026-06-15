import { useEffect, useState } from "react";
import { Link } from "wouter";
import { BurnedPaperMap, type MapWaypoint } from "@/components/BurnedPaperMap";
import { CORE_ANCHORS } from "@/lib/city-config";

/**
 * Full-screen Surveyor's Chart. Players come here from the GAME hub.
 * The same SVG component is also reusable as an in-world minimap.
 */
export default function GameMap() {
  const [exploredTiles, setExploredTiles] = useState<string[]>([]);
  const [waypoint, setWaypoint] = useState<MapWaypoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/exploration", { credentials: "include" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (cancelled) return;
        setExploredTiles(Array.isArray(j.exploredTiles) ? j.exploredTiles : []);
        setWaypoint(j.waypoint ?? null);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function placeWaypoint(x: number, y: number) {
    setWaypoint({ x, y, label: null });
    try {
      await fetch("/api/exploration/waypoint", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ x, y }),
      });
    } catch { /* best-effort */ }
  }

  async function clearWaypoint() {
    setWaypoint(null);
    try {
      await fetch("/api/exploration/clear-waypoint", { method: "POST", credentials: "include" });
    } catch { /* best-effort */ }
  }

  return (
    <div className="min-h-screen w-full" style={{
      background: "radial-gradient(circle at 50% 0%, rgba(40,40,60,0.45) 0%, transparent 70%), #050507",
      paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
      paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
    }}>
      <div className="max-w-5xl mx-auto px-3 sm:px-6">
        <header className="mb-4 flex items-baseline justify-between">
          <div>
            <p className="text-[10px] font-mono tracking-[0.5em] text-zinc-500">SALARYMAN</p>
            <h1 className="text-2xl sm:text-3xl font-mono tracking-[0.18em] text-zinc-100 mt-1">VISITOR MAP</h1>
          </div>
          <Link href="/game" className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 tracking-widest">
            ← TERMINAL
          </Link>
        </header>

        <div className="aspect-[4/3] w-full rounded border border-amber-900/40 overflow-hidden bg-black">
          {loading ? (
            <div className="w-full h-full grid place-items-center text-amber-700/70 font-mono text-xs tracking-widest">UNROLLING CHART…</div>
          ) : err ? (
            <div className="w-full h-full grid place-items-center text-red-500/80 font-mono text-xs">{err}</div>
          ) : (
            <BurnedPaperMap
              exploredTiles={exploredTiles}
              waypoint={waypoint}
              onWaypointSet={placeWaypoint}
            />
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-mono tracking-widest text-zinc-400">
          <span>CLICK TO MARK A WAYPOINT</span>
          {waypoint && (
            <button onClick={clearWaypoint} className="px-2 py-1 border border-amber-700/50 text-amber-400 hover:bg-amber-900/20">
              CLEAR WAYPOINT
            </button>
          )}
          <span className="ml-auto">EXPLORED TILES: {exploredTiles.length}</span>
        </div>

        <section className="mt-6">
          <h2 className="text-[10px] font-mono tracking-[0.4em] text-zinc-500 mb-2">KNOWN POINTS OF INTEREST</h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
            {CORE_ANCHORS.map((a) => (
              <li key={a.id} className="border border-amber-900/30 bg-amber-950/10 p-2 rounded">
                <p className="tracking-widest text-amber-200">{a.short}</p>
                <p className="text-zinc-500 text-[10px] mt-1">{a.desc}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
