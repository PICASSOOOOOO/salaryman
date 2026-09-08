import { useMemo, useState } from 'react';
import { DoorOpen, Info, MoveDown, ScanLine } from 'lucide-react';
import type { InteriorDef, InteriorObject } from '@/pages/worldInteriorData';

const TYPE_COLOR: Record<InteriorObject['type'], string> = {
  bed: '#a78bfa', desk: '#34d399', chair: '#6ee7b7', nightstand: '#c4b5fd',
  window: '#38bdf8', medical_bed: '#67e8f9', reception: '#fbbf24', equipment: '#22d3ee',
  shelf: '#f59e0b', counter: '#fbbf24', table: '#fb7185', crate: '#f97316',
  locker: '#818cf8', terminal: '#38bdf8', plant: '#4ade80', couch: '#f472b6',
  vending_machine: '#f472b6', filing_cabinet: '#94a3b8', water_cooler: '#67e8f9',
  whiteboard: '#e2e8f0', photocopier: '#cbd5e1', bookshelf: '#f59e0b',
  tv_screen: '#c084fc', security_gate: '#fb7185', flag: '#fbbf24', portrait: '#f0abfc',
  arcade_machine: '#e879f9', newspaper: '#fbbf24', elevator: '#a3e635',
  conference_table: '#fb7185', door_lock: '#fb7185', server: '#22d3ee',
  storage_locker: '#818cf8', stove: '#fb923c',
};

function objectColor(object: InteriorObject): string {
  return object.color?.match(/rgba?\(([^)]+)\)/)?.[0] ?? TYPE_COLOR[object.type] ?? '#94a3b8';
}

function shortLabel(label: string | undefined, type: InteriorObject['type']): string {
  return (label || type.replaceAll('_', ' ')).replace(/^(YOUR |THE )/i, '').slice(0, 20).toUpperCase();
}

export function BuildingFloorPlan({
  def,
  buildingLabel,
  floor,
}: {
  def: InteriorDef;
  buildingLabel?: string;
  floor?: number;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = selectedId == null ? null : def.objects[selectedId] ?? null;
  const padding = 24;
  const viewWidth = def.width + padding * 2;
  const viewHeight = def.height + padding * 2;
  const objects = useMemo(() => def.objects.filter((o) => o.w > 0 && o.h > 0), [def.objects]);

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_230px] gap-3 h-full min-h-[420px]">
      <div className="relative min-h-[420px] rounded-xl border border-cyan-400/20 overflow-hidden"
        style={{ background: 'radial-gradient(circle at 50% 20%, rgba(17,54,75,.45), transparent 65%), #050b14' }}>
        <div className="absolute inset-0 opacity-30 pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(56,189,248,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.08) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          className="relative z-10 w-full h-full p-3"
          preserveAspectRatio="xMidYMid meet"
          aria-label={`${buildingLabel ?? def.label} floor plan`}
          data-testid="building-floor-plan"
        >
          <defs>
            <filter id="floorGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <pattern id="floorGrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#38bdf8" strokeOpacity=".08" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x={padding} y={padding} width={def.width} height={def.height} rx="10" fill={def.floorColor} stroke={def.accentColor} strokeWidth="3" />
          <rect x={padding} y={padding} width={def.width} height={def.height} rx="10" fill="url(#floorGrid)" />
          <text x={padding + 16} y={padding + 24} fill="#bae6fd" fontSize="11" fontFamily="monospace" letterSpacing="2">
            {buildingLabel ?? def.label}
          </text>
          <text x={padding + 16} y={padding + 40} fill="#64748b" fontSize="7" fontFamily="monospace" letterSpacing="1">
            {floor ? `FLOOR ${floor} · ` : ''}SCHEMATIC / LIVE DEFINITIONS
          </text>
          <rect x={padding + 8} y={padding + 54} width={def.width - 16} height={Math.max(40, def.height * .18)}
            fill="rgba(56,189,248,.025)" stroke="rgba(56,189,248,.16)" strokeDasharray="5 7" />
          <text x={padding + def.width / 2} y={padding + 78} fill="rgba(125,211,252,.5)" fontSize="8" textAnchor="middle" fontFamily="monospace" letterSpacing="2">
            MAIN ROOM / WALKABLE AREA
          </text>
          {objects.map((object, index) => {
            const color = objectColor(object);
            const isSelected = selectedId === index;
            return (
              <g key={`${object.type}-${index}`} onClick={(event) => { event.stopPropagation(); setSelectedId(index); }}
                style={{ cursor: 'pointer' }} data-testid={`floor-object-${index}`}>
                <rect x={padding + object.x} y={padding + object.y} width={object.w} height={object.h}
                  rx="3" fill={color} fillOpacity={isSelected ? .38 : .18} stroke={color}
                  strokeOpacity={isSelected ? .95 : .58} strokeWidth={isSelected ? 3 : 1.5}
                  filter={isSelected ? 'url(#floorGlow)' : undefined} />
                {object.w >= 35 && (
                  <text x={padding + object.x + object.w / 2} y={padding + object.y + object.h / 2 + 3}
                    fill={color} fillOpacity=".9" fontSize={Math.max(6, Math.min(9, object.w / 7))}
                    textAnchor="middle" fontFamily="monospace" letterSpacing=".5">
                    {shortLabel(object.label, object.type)}
                  </text>
                )}
              </g>
            );
          })}
          <rect x={padding + def.exitX} y={padding + def.exitY} width={def.exitW} height={def.exitH}
            fill="rgba(163,230,53,.28)" stroke="#a3e635" strokeWidth="2" />
          <text x={padding + def.exitX + def.exitW / 2} y={padding + def.exitY - 7}
            fill="#bef264" fontSize="8" textAnchor="middle" fontFamily="monospace" letterSpacing="1">EXIT</text>
        </svg>
        <div className="absolute left-4 bottom-3 flex items-center gap-2 text-[9px] text-slate-500 font-mono tracking-widest">
          <ScanLine className="w-3 h-3 text-cyan-400" /> TAP A ROOM OBJECT FOR DETAILS
        </div>
      </div>
      <aside className="rounded-xl border border-white/10 bg-slate-950/75 p-4 font-mono">
        <div className="flex items-center gap-2 text-cyan-200 text-[10px] tracking-[.22em]">
          <Info className="w-3.5 h-3.5" /> FLOOR DATA
        </div>
        <h2 className="mt-3 text-sm tracking-wider text-slate-100">{buildingLabel ?? def.label}</h2>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{def.ambientText ?? 'Interior definition loaded.'}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[9px]">
          <div className="border border-white/10 rounded p-2"><span className="text-slate-600 block">FOOTPRINT</span><span className="text-cyan-300">{def.width} × {def.height}</span></div>
          <div className="border border-white/10 rounded p-2"><span className="text-slate-600 block">OBJECTS</span><span className="text-cyan-300">{objects.length}</span></div>
        </div>
        <div className="mt-4 border-t border-white/10 pt-3">
          {selected ? (
            <>
              <div className="text-[9px] tracking-widest text-slate-600">SELECTED OBJECT</div>
              <div className="mt-1 text-xs text-slate-100">{shortLabel(selected.label, selected.type)}</div>
              <div className="mt-1 text-[10px] text-slate-500">{selected.type.replaceAll('_', ' ')} · {selected.w} × {selected.h}</div>
            </>
          ) : (
            <div className="text-[10px] leading-relaxed text-slate-600">Select a marked room object to inspect its live interior label.</div>
          )}
        </div>
        <div className="mt-5 flex items-center gap-2 text-[9px] text-lime-300 tracking-widest">
          <DoorOpen className="w-3 h-3" /> EXIT MARKED
        </div>
        <div className="mt-2 flex items-center gap-2 text-[9px] text-slate-500 tracking-widest">
          <MoveDown className="w-3 h-3" /> NORTH IS UP
        </div>
      </aside>
    </div>
  );
}