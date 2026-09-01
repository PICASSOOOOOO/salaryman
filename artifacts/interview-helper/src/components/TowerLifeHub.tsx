import { useEffect, useState } from "react";
import { CalendarClock, Megaphone, Radio, Wrench } from "lucide-react";
import { TOWER_BUSINESSES, TOWER_GOSSIP, TOWER_NPCS, getTowerGossip } from "@/lib/tower-life";

export function TowerLifeHub({ compact = false, cityLabel = "SHADOW TOWER", floorLabel = "ALL FLOORS" }: {
  compact?: boolean;
  cityLabel?: string;
  floorLabel?: string;
}) {
  const [tab, setTab] = useState<"classifieds" | "sheets" | "gossip">("classifieds");
  const [gossipIndex, setGossipIndex] = useState(0);
  const [broadcast, setBroadcast] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setGossipIndex((current) => (current + 1) % TOWER_GOSSIP.length), 9000);
    return () => window.clearInterval(timer);
  }, []);

  const [speaker, line] = getTowerGossip(gossipIndex);
  const announce = (text: string) => {
    setBroadcast(text);
    setTab("gossip");
  };

  return (
    <section className={`border border-violet-300/25 bg-[#090d18] ${compact ? "p-3" : "p-5"}`} data-testid="tower-life-hub">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-[10px] font-bold tracking-[.24em] text-violet-300">TOWER LIFE NETWORK · {cityLabel}</p>
          <h2 className="mt-1 text-lg font-black tracking-[.12em] text-white">CLASSIFIEDS · SHEETS · GOSSIP</h2>
          <p className="mt-1 text-xs text-zinc-500">{floorLabel} · shared building notices, appointment traffic, and named Pixel Agent errands.</p>
        </div>
        <Radio className="h-5 w-5 text-violet-300" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {([
          ["classifieds", "CLASSIFIEDS"],
          ["sheets", "WALL SHEETS"],
          ["gossip", "GOSSIP"],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`border px-3 py-2 text-[10px] font-bold tracking-[.16em] transition ${tab === value ? "border-violet-300/70 bg-violet-300/10 text-violet-100" : "border-white/10 text-zinc-500 hover:border-violet-300/35 hover:text-zinc-200"}`}>{label}</button>
        ))}
      </div>

      {tab === "classifieds" && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {TOWER_BUSINESSES.map((business) => (
            <button key={business.code} type="button" onClick={() => announce(`${business.name}: ${business.appointment}`)} className="text-left border border-white/10 bg-white/[.025] p-3 transition hover:-translate-y-0.5 hover:border-white/30">
              <div className="flex items-center gap-2" style={{ color: business.color }}>
                <span className="grid h-8 w-8 place-items-center border border-current/40 text-lg">{business.logo}</span>
                <div><strong className="block text-xs tracking-[.12em]">{business.name}</strong><span className="text-[9px] tracking-widest opacity-75">{business.category}</span></div>
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-300">{business.ad}</p>
              <p className="mt-2 text-[10px] font-bold tracking-wider text-zinc-500">{business.floor}</p>
            </button>
          ))}
        </div>
      )}

      {tab === "sheets" && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {TOWER_BUSINESSES.map((business) => (
            <article key={business.code} className="border border-white/10 bg-white/[.025] p-4">
              <div className="flex items-center justify-between gap-2"><strong style={{ color: business.color }} className="text-xs tracking-[.15em]">{business.logo} {business.name}</strong><span className="text-[9px] text-zinc-600">{business.floor}</span></div>
              <p className="mt-3 border-l-2 pl-3 text-xs leading-5 text-zinc-300" style={{ borderColor: business.color }}>{business.appointment}</p>
              <button type="button" onClick={() => announce(`${business.name} sheet read aloud. ${business.appointment}`)} className="mt-3 inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-[9px] font-bold tracking-widest text-zinc-300 hover:border-violet-300/50"><Megaphone className="h-3 w-3" /> READ ALOUD TO FLOOR</button>
            </article>
          ))}
        </div>
      )}

      {tab === "gossip" && (
        <div className="mt-4 space-y-3">
          {broadcast && <div className="border border-amber-300/30 bg-amber-300/5 px-3 py-2 text-xs text-amber-100" role="status">FLOOR BROADCAST · {broadcast}</div>}
          <div className="border border-violet-300/20 bg-violet-300/5 p-4">
            <p className="text-[10px] font-bold tracking-[.2em] text-violet-300">LIVE BUILDING CHATTER</p>
            <p className="mt-2 text-sm leading-6 text-zinc-200">&quot;{line}&quot;</p>
            <p className="mt-2 text-[10px] font-bold tracking-widest text-zinc-500">— {speaker} · PIXEL AGENT CODED</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {TOWER_NPCS.map((npc) => (
              <div key={npc.code} className="border border-white/10 p-3">
                <div className="flex items-center gap-2" style={{ color: npc.color }}><span className="text-lg">{npc.logo}</span><strong className="text-xs tracking-wider">{npc.name}</strong></div>
                <p className="mt-1 text-[9px] tracking-widest text-zinc-500">{npc.code} · {npc.role}</p>
                <p className="mt-2 text-xs text-zinc-400">{npc.errands[gossipIndex % npc.errands.length]} · {npc.route}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-[10px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-cyan-300" /> APPOINTMENTS ARE FICTIONALIZED BUILDING COMMERCE</span>
        <span className="inline-flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-amber-300" /> ONE CARETAKER CODE PER NPC, EVEN ON ERRANDS</span>
      </div>
    </section>
  );
}