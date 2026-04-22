/**
 * /store/realty — the downtown real-estate office showroom. Big front-of-house
 * gallery for the property template art (cutaway views, fully baked Pro art),
 * tappable cards that route into the existing real-estate marketplace
 * (rendered inside WorldPlay) for the actual listings/buy flow.
 *
 * Standalone page so the player can browse templates without entering the
 * world map first. Also used as a target from cutscenes and the HUD.
 */

import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useArtAsset } from "@/lib/art";

interface PropertyTemplate {
  artKey: string;
  name: string;
  blurb: string;
  startingPrice: number; // florins
  badge: string;
}

const TEMPLATES: PropertyTemplate[] = [
  {
    artKey: "property_loft",
    name: "STARTER LOFT",
    blurb: "One room, one window, no commute. Where every founding story actually starts.",
    startingPrice: 25,
    badge: "ENTRY",
  },
  {
    artKey: "property_kiosk",
    name: "STREET KIOSK",
    blurb: "A single stool, a pink-screen terminal, and the entire downtown sidewalk as your foot traffic.",
    startingPrice: 40,
    badge: "RETAIL",
  },
  {
    artKey: "property_corner_office",
    name: "CORNER OFFICE",
    blurb: "Floor-to-ceiling glass on two walls. Not subtle. Not supposed to be.",
    startingPrice: 280,
    badge: "EXEC",
  },
  {
    artKey: "property_warehouse",
    name: "OPERATIONS WAREHOUSE",
    blurb: "High ceilings, roll-up door, room for forklifts and ambition. Run real ops out of this one.",
    startingPrice: 420,
    badge: "OPS",
  },
  {
    artKey: "property_penthouse",
    name: "EXECUTIVE PENTHOUSE",
    blurb: "Marble floor, helipad-adjacent. The kind of address you don't print on a business card — they already know.",
    startingPrice: 1200,
    badge: "ELITE",
  },
];

export default function RealtyStore() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-black text-zinc-200 relative">
      <header className="px-6 pt-4 pb-3 flex items-center justify-between border-b border-pink-500/20">
        <button
          type="button"
          onClick={() => navigate("/world/play")}
          className="text-pink-200 text-[10px] tracking-[0.4em] hover:text-white flex items-center gap-2"
        >
          <ArrowLeft className="w-3 h-3" /> WORLD
        </button>
        <div className="text-pink-300 text-sm tracking-[0.5em]" style={{ fontFamily: "'VT323', monospace" }}>
          ▌ DOWNTOWN REALTY OFFICE ▌
        </div>
        <div className="text-cyan-200/70 text-[10px] tracking-[0.4em]">
          5 TEMPLATES ON SHOWROOM FLOOR
        </div>
      </header>

      <div className="px-6 sm:px-12 py-8 max-w-7xl mx-auto">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <div className="text-pink-100 text-2xl tracking-[0.2em] mb-1" style={{ fontFamily: "'VT323', monospace" }}>
              PROPERTY TEMPLATES
            </div>
            <div className="text-zinc-400 text-sm max-w-xl leading-snug">
              Pick a template to anchor your operation. The realty desk inside the world map handles the actual paperwork — these are just the floor plans.
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/world/play?focus=realty")}
            className="px-4 py-2 rounded border border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 text-xs tracking-[0.3em]"
            data-testid="realty-open-listings"
          >
            VIEW LIVE LISTINGS ▸
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.map(t => (
            <PropertyCard key={t.artKey} t={t} onPick={() => navigate("/world/play?focus=realty")} />
          ))}
        </div>

        <div className="mt-8 px-4 py-3 rounded border border-pink-400/30 bg-black/60 text-pink-200/80 text-sm leading-snug max-w-3xl">
          <span className="text-pink-400 mr-2">PABLO:</span>
          "The address sets the ceiling. Pick small, you stay nimble. Pick big, you grow into it. Pick wrong, you sublet."
        </div>
      </div>
    </div>
  );
}

function PropertyCard({ t, onPick }: { t: PropertyTemplate; onPick: () => void }) {
  const url = useArtAsset(t.artKey);
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={`property-${t.artKey}`}
      className="text-left rounded-xl border-2 border-pink-500/40 bg-gradient-to-b from-pink-950/30 to-black overflow-hidden hover:border-pink-400/80 hover:scale-[1.01] transition-all"
      style={{ boxShadow: "0 0 18px rgba(236,72,153,0.18)" }}
    >
      <div className="aspect-video w-full overflow-hidden bg-black/80 relative">
        {url ? (
          <img src={url} alt={t.name} className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-pink-500/50 text-[10px] tracking-[0.4em]">
            ▌ COMPOSING ▌
          </div>
        )}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-cyan-400/50 text-cyan-200 text-[9px] tracking-[0.3em]">
          {t.badge}
        </div>
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/80 border border-pink-400/50 text-pink-200 text-[10px] tracking-[0.2em]">
          FROM {t.startingPrice}F
        </div>
      </div>
      <div className="p-3">
        <div className="text-pink-100 font-bold tracking-[0.2em] text-sm" style={{ fontFamily: "'VT323', monospace" }}>{t.name}</div>
        <div className="text-zinc-400 text-xs leading-snug mt-1">{t.blurb}</div>
      </div>
    </button>
  );
}
