import { useEffect } from "react";
import { Link } from "wouter";
import { Building2, ChevronUp, KeyRound, LockKeyhole, Shield, Sparkles } from "lucide-react";
import { startTowerAmbient, stopTowerAmbient } from "@/soundEngine";

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

// A tall building gives new organizations somewhere to grow into. Until a
// real organization claims a floor, the directory deliberately calls out the
// commercial state instead of pretending the space is already populated.
const floors = Array.from({ length: 67 }, (_, index) => {
  const floor = 67 - index;
  const existing = occupiedFloors.get(floor);
  if (existing) return { floor, ...existing };
  const construction = floor % 3 === 0;
  const price = floor * 2500;
  return {
    floor,
    name: construction ? "UNDER CONSTRUCTION" : "AVAILABLE FLOOR",
    kind: construction ? "BUILDING WORKS" : "FOR SALE / LEASE",
    detail: construction
      ? `New company space being fitted out · vertical premium ƒ${price.toLocaleString()}/mo`
      : `Claim a floor for your crew · vertical premium ƒ${price.toLocaleString()}/mo`,
    tone: "future" as const,
    icon: construction ? KeyRound : Building2,
  };
});

export default function TowerDirectory() {
  useEffect(() => {
    startTowerAmbient("lobby");
    return () => stopTowerAmbient();
  }, []);
  return (
    <main className="min-h-screen bg-[#050711] text-zinc-100 px-4 py-6 sm:px-8 overflow-hidden">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-end justify-between gap-4 border-b border-cyan-300/20 pb-5">
          <div>
            <p className="text-[10px] tracking-[.35em] text-cyan-300 animate-pulse">SHADOW TOWER · LOBBY DIRECTORY</p>
            <h1 className="mt-2 text-3xl sm:text-5xl font-black tracking-tight">GO UP.</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">Sixty-seven floors. New companies below Picasso. One restricted corporate summit above everyone.</p>
          </div>
          <Link href="/pablo" className="hidden sm:block text-xs text-zinc-500 hover:text-cyan-300">BACK TO PABLO</Link>
        </header>
        <div className="grid gap-2">
          {floors.map(({ floor, name, kind, detail, href, tone, icon: Icon }) => {
            const content = <div className={`group relative flex items-center gap-4 overflow-hidden border p-4 transition duration-500 hover:-translate-y-0.5 hover:pl-6 ${
              tone === "shadow" ? "border-violet-500/50 bg-[radial-gradient(circle_at_80%,#301044,#0b0714)] hover:border-violet-300" :
              tone === "pablo" ? "border-amber-300/40 bg-[radial-gradient(circle_at_80%,#46331a,#101018)] hover:border-amber-200" :
              tone === "security" ? "border-red-400/30 bg-red-950/10 hover:border-red-300" :
              tone === "secret" ? "border-violet-400/25 bg-violet-950/10 hover:border-violet-300" :
              "border-white/10 bg-white/[.025] hover:border-cyan-300/50"
            }`}>
              <div className="w-12 text-center font-mono text-xl text-zinc-500 group-hover:text-cyan-300 transition-colors">{String(floor).padStart(2, "0")}</div>
              <Icon className={`h-5 w-5 shrink-0 ${tone === "shadow" || tone === "secret" ? "text-violet-300 animate-pulse" : tone === "pablo" ? "text-amber-300" : "text-cyan-300"}`} />
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="tracking-[.15em]">{name}</strong><span className="text-[9px] tracking-[.2em] text-zinc-500">{kind}</span></div><p className="mt-1 text-xs text-zinc-500">{detail}</p></div>
              {href ? <span className="text-xs text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity">ENTER →</span> : <span className="text-[9px] tracking-widest text-zinc-600">{tone === "shadow" || tone === "secret" ? "SEALED" : "COMING"}</span>}
              <div className="absolute inset-y-0 left-0 w-0.5 bg-cyan-300/0 group-hover:bg-cyan-300/70 transition-colors" />
            </div>;
            return href ? <Link key={floor} href={href}>{content}</Link> : <div key={floor}>{content}</div>;
          })}
        </div>
        <footer className="mt-5 flex items-center gap-2 text-[10px] tracking-[.2em] text-zinc-600"><KeyRound className="h-3 w-3" /> HIGHER FLOORS COST MORE · ACCESS IS DECIDED AT THE DOOR · PIN OR ROLE REQUIRED FOR PRIVATE SPACE</footer>
      </div>
    </main>
  );
}