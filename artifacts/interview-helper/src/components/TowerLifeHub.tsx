import { useEffect, useState } from "react";
import { CalendarClock, Megaphone, Radio, Wrench } from "lucide-react";
import { TOWER_BUSINESSES, TOWER_GOSSIP, TOWER_RESIDENTS, getTowerGossip } from "@/lib/tower-life";

export function TowerLifeHub({ compact = false, cityLabel = "SHADOW TOWER", floorLabel = "ALL FLOORS" }: {
  compact?: boolean;
  cityLabel?: string;
  floorLabel?: string;
}) {
  const [tab, setTab] = useState<"classifieds" | "residents" | "sheets">("classifieds");
  const [gossipIndex, setGossipIndex] = useState(0);
  const [broadcast, setBroadcast] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setGossipIndex((current) => (current + 1) % TOWER_GOSSIP.length), 9000);
    return () => window.clearInterval(timer);
  }, []);

  const [speaker, line] = getTowerGossip(gossipIndex);
  const announce = (text: string) => {
    setBroadcast(text);
  };

  return (
    <section className={`border border-violet-300/25 bg-[#090d18] ${compact ? "p-3" : "p-5"}`} data-testid="tower-life-hub">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-[10px] font-bold tracking-[.24em] text-violet-300">TOWER LIFE NETWORK · {cityLabel}</p>
          <h2 className="mt-1 text-lg font-black tracking-[.12em] text-white">TOWER LIFE</h2>
          <p className="mt-1 text-[10px] font-bold tracking-[.16em] text-zinc-500">{floorLabel} · LIVE BUILDING SIGNALS</p>
        </div>
        <Radio className="h-5 w-5 text-violet-300" />
      </div>

      <div className="mt-4 border border-violet-300/20 bg-violet-300/5 px-3 py-2">
        <div className="flex items-center gap-2 text-[9px] font-bold tracking-[.18em] text-violet-300">
          <Radio className="h-3 w-3" /> LIVE NPC CHATTER · AMBIENT
        </div>
        <p className="mt-1 text-xs text-zinc-300">&quot;{line}&quot; <span className="text-[10px] text-zinc-600">— {speaker}</span></p>
        {broadcast && <p className="mt-1 text-[10px] text-amber-200">FLOOR NOTICE · {broadcast}</p>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {([
          ["classifieds", "CLASSIFIEDS"],
          ["residents", "PEOPLE"],
          ["sheets", "WALL SHEETS"],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`border px-3 py-2 text-[10px] font-bold tracking-[.16em] transition ${tab === value ? "border-violet-300/70 bg-violet-300/10 text-violet-100" : "border-white/10 text-zinc-500 hover:border-violet-300/35 hover:text-zinc-200"}`}>{label}</button>
        ))}
      </div>

      {tab === "classifieds" && (
          <div className="mt-4 grid max-h-[min(62vh,760px)] gap-3 overflow-y-auto pr-1 md:grid-cols-3">
          {TOWER_BUSINESSES.map((business) => (
            <button key={business.code} type="button" onClick={() => announce(`${business.name}: ${business.appointment}`)} className="text-left border border-white/10 bg-white/[.025] p-3 transition hover:-translate-y-0.5 hover:border-white/30">
              <div className="flex items-center gap-2" style={{ color: business.color }}>
                  <span className="grid h-12 w-12 place-items-center border border-current/40 bg-current/10 text-2xl">{business.logo}</span>
                  <div><strong className="block text-xs tracking-[.12em]">{business.name}</strong><span className="text-[9px] tracking-widest opacity-75">{business.category}</span></div>
              </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                  <span className="text-[10px] font-bold tracking-wider text-zinc-500">{business.floor}</span>
                  <span className="text-[9px] font-bold tracking-widest text-violet-300">VIEW</span>
                </div>
            </button>
          ))}
        </div>
      )}

      {tab === "residents" && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {TOWER_RESIDENTS.map((resident) => {
            const business = TOWER_BUSINESSES.find((candidate) => candidate.code === resident.businessCode);
            return (
              <article key={resident.id} className="border border-white/10 bg-white/[.025] p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center border text-xl" style={{ color: resident.color, borderColor: `${resident.color}66`, background: `${resident.color}14` }}>{resident.logo}</span>
                  <div className="min-w-0">
                    <strong className="block text-xs tracking-[.14em]" style={{ color: resident.color }}>{resident.name}</strong>
                    <span className="text-[9px] tracking-[.12em] text-zinc-500">{resident.role}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-zinc-300">{resident.caresFor}.</p>
                <div className="mt-3 border-t border-white/10 pt-2 text-[9px] leading-5 tracking-[.1em] text-zinc-500">
                  <div>ROUTE · {resident.route}</div>
                  <div>SERVICE · {business?.name ?? resident.businessCode}</div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === "sheets" && (
          <div className="mt-4 grid max-h-[min(62vh,760px)] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
          {TOWER_BUSINESSES.map((business) => (
            <article key={business.code} className="border border-white/10 bg-white/[.025] p-4">
                <div className="flex items-center justify-between gap-2"><strong style={{ color: business.color }} className="text-xs tracking-[.15em]">{business.logo} {business.name}</strong><span className="text-[9px] text-zinc-600">{business.floor}</span></div>
                <p className="mt-3 border-l-2 pl-3 text-xs leading-5 text-zinc-300" style={{ borderColor: business.color }}>{business.appointment}</p>
                <button type="button" onClick={() => announce(`${business.name} sheet read aloud. ${business.appointment}`)} className="mt-3 inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-[9px] font-bold tracking-widest text-zinc-300 hover:border-violet-300/50"><Megaphone className="h-3 w-3" /> ANNOUNCE</button>
            </article>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-[10px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-cyan-300" /> APPOINTMENTS ARE FICTIONALIZED BUILDING COMMERCE</span>
        <span className="inline-flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-amber-300" /> RESIDENTS WORK ROUTES · PLAYERS USE THEIR SERVICES</span>
      </div>
    </section>
  );
}