import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ChevronLeft,
  ChevronDown,
  Building2,
  MapPin,
  Landmark,
  Users,
  DoorOpen,
} from "lucide-react";
import {
  CITY_NAME,
  CORE_ANCHORS,
  CITY_QUADRANTS,
  DOWNTOWN_BOUNDS,
  type CoreAnchor,
  type CityQuadrant,
} from "@/lib/city-config";
import { INTERIOR_DEFS, type InteriorDef } from "./worldInteriorData";

const ANCHOR_TYPE_LABEL: Record<CoreAnchor["type"], string> = {
  tower: "TOWER",
  civic: "CIVIC",
  commerce: "COMMERCE",
  security: "SECURITY",
  terminal: "TERMINAL",
  realestate: "REAL ESTATE",
};

// Pull the human-meaningful objects out of an interior — the ones with a label
// (beds, desks, terminals, lockers…) — deduped so the readout stays tight.
function notableObjects(def: InteriorDef): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of def.objects) {
    const label = (o.label ?? "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: any;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
      <h2 className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-zinc-300 mb-3">
        <Icon className="w-3.5 h-3.5 text-zinc-500" /> {title}
        {typeof count === "number" && (
          <span className="ml-auto text-zinc-600">{count}</span>
        )}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function CityDirectory() {
  // Featured (named) interiors first, generic "_"-prefixed templates after.
  const interiors = useMemo(() => {
    const all = Object.values(INTERIOR_DEFS);
    const featured = all.filter((d) => !d.id.startsWith("_"));
    const generic = all.filter((d) => d.id.startsWith("_"));
    featured.sort((a, b) => a.label.localeCompare(b.label));
    generic.sort((a, b) => a.label.localeCompare(b.label));
    return [...featured, ...generic];
  }, []);

  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const dtW = DOWNTOWN_BOUNDS.right - DOWNTOWN_BOUNDS.left;
  const dtH = DOWNTOWN_BOUNDS.bottom - DOWNTOWN_BOUNDS.top;

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: "#070809",
        paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
      }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <Link
          href="/game/settings"
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs font-mono tracking-wider mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> SETTINGS
        </Link>

        <h1 className="text-2xl font-mono tracking-[0.2em] text-zinc-100 mb-1">
          CITY DIRECTORY
        </h1>
        <p className="text-[11px] font-mono text-zinc-600 tracking-wider uppercase mb-6">
          {CITY_NAME} · downtown {dtW}×{dtH} · every district, landmark & interior
        </p>

        <div className="space-y-4">
          {/* DISTRICTS ─────────────────────────────────────────────────── */}
          <Section icon={MapPin} title="DISTRICTS" count={CITY_QUADRANTS.length}>
            {CITY_QUADRANTS.map((q: CityQuadrant) => (
              <div
                key={q.id}
                className="grid grid-cols-[auto_1fr] gap-3 items-start"
              >
                <span
                  className="mt-1 w-3 h-3 rounded-sm shrink-0"
                  style={{ background: q.color, boxShadow: `0 0 8px ${q.color}` }}
                  aria-hidden
                />
                <div>
                  <div className="text-sm font-mono text-zinc-200 tracking-wider">
                    {q.label}
                  </div>
                  <div className="text-[12px] text-zinc-500 leading-relaxed mt-0.5">
                    {q.blurb}
                  </div>
                </div>
              </div>
            ))}
          </Section>

          {/* LANDMARKS ─────────────────────────────────────────────────── */}
          <Section icon={Landmark} title="LANDMARKS" count={CORE_ANCHORS.length}>
            {CORE_ANCHORS.map((a: CoreAnchor) => (
              <div key={a.id}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-mono text-zinc-200 tracking-wider">
                    {a.label}
                  </span>
                  <span className="text-[9px] font-mono tracking-[0.25em] text-cyan-300/70 border border-cyan-500/25 rounded px-1.5 py-0.5">
                    {ANCHOR_TYPE_LABEL[a.type]}
                  </span>
                </div>
                <div className="text-[12px] text-zinc-500 leading-relaxed mt-0.5">
                  {a.desc}
                </div>
              </div>
            ))}
          </Section>

          {/* INTERIORS ─────────────────────────────────────────────────── */}
          <Section
            icon={Building2}
            title="INTERIORS"
            count={interiors.length}
          >
            {interiors.map((def) => {
              const isOpen = open.has(def.id);
              const objs = notableObjects(def);
              const workers = def.workers ?? [];
              const generic = def.id.startsWith("_");
              return (
                <div
                  key={def.id}
                  className="rounded border border-zinc-800/80 bg-black/30 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggle(def.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-900/50 transition-colors"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: def.accentColor }}
                      aria-hidden
                    />
                    <span className="text-sm font-mono text-zinc-200 tracking-wider flex-1">
                      {def.label}
                    </span>
                    {generic && (
                      <span className="text-[8px] font-mono tracking-[0.25em] text-zinc-600 border border-zinc-700 rounded px-1.5 py-0.5">
                        TEMPLATE
                      </span>
                    )}
                    <ChevronDown
                      className={`w-4 h-4 text-zinc-500 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 space-y-3 border-t border-zinc-800/60">
                      {def.ambientText && (
                        <p className="text-[12px] text-zinc-400 italic leading-relaxed">
                          “{def.ambientText}”
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-600 tracking-wider">
                        <span>SIZE · {def.width}×{def.height}</span>
                        {def.buildingSize && (
                          <span>CLASS · {def.buildingSize.toUpperCase()}</span>
                        )}
                      </div>

                      {workers.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 text-[9px] font-mono tracking-[0.3em] text-zinc-500 mb-1.5">
                            <Users className="w-3 h-3" /> OCCUPANTS
                          </div>
                          <div className="space-y-1">
                            {workers.map((w, i) => (
                              <div
                                key={`${def.id}-w-${i}`}
                                className="flex items-baseline gap-2 text-[12px]"
                              >
                                <span
                                  className={`font-mono tracking-wider ${
                                    w.hostile ? "text-red-300" : "text-zinc-300"
                                  }`}
                                >
                                  {w.name}
                                </span>
                                <span className="text-zinc-600">·</span>
                                <span className="text-zinc-500">{w.role}</span>
                                {w.hostile && (
                                  <span className="text-[8px] font-mono tracking-[0.2em] text-red-400/80 border border-red-500/30 rounded px-1">
                                    HOSTILE
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {objs.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 text-[9px] font-mono tracking-[0.3em] text-zinc-500 mb-1.5">
                            <DoorOpen className="w-3 h-3" /> FIXTURES
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {objs.map((label) => (
                              <span
                                key={`${def.id}-${label}`}
                                className="text-[10px] font-mono text-zinc-400 bg-zinc-900/70 border border-zinc-800 rounded px-1.5 py-0.5"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </Section>
        </div>
      </div>
    </div>
  );
}
