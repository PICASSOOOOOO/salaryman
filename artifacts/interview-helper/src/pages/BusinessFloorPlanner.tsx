import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, BriefcaseBusiness, Hammer, HardHat, Users } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { BusinessFloorKind, BusinessFloorLaborMode, BusinessFloorTemplate } from "@workspace/api-zod/shadow-tower";

type CurrentFloor = { id: number; floorNumber: number; city: string; settings?: Record<string, unknown> };
type Option = { id: string; label: string };

export default function BusinessFloorPlanner() {
  const [templates, setTemplates] = useState<BusinessFloorTemplate[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [floor, setFloor] = useState<CurrentFloor | null>(null);
  const [kind, setKind] = useState<BusinessFloorKind>("office");
  const [laborMode, setLaborMode] = useState<BusinessFloorLaborMode>("self");
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState("SELECT A STOCK PLAN");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      apiFetch("/api/shadow-tower/business-templates").then((r) => r.json()),
      apiFetch("/api/shadow-tower/floors/current", { credentials: "include" }).then(async (r) => r.ok ? r.json() : null),
    ]).then(([catalog, current]) => {
      setTemplates(catalog.templates ?? []);
      setOptions(catalog.customizationOptions ?? []);
      setFloor(current?.floor ?? null);
    }).catch(() => setStatus("FLOOR PLANNER OFFLINE"));
  }, []);

  const template = useMemo(() => templates.find((item) => item.kind === kind), [templates, kind]);
  const customizationFiat = selected.length * 2_500;
  const total = template ? template.baseMaterialsFiat + customizationFiat + (laborMode === "hire" ? template.hiredLaborFiat : 0) : 0;

  const submit = async () => {
    if (!floor || !template || busy) return;
    setBusy(true);
    try {
      const response = await apiFetch(`/api/shadow-tower/floors/${floor.id}/business-fitout`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, laborMode, options: selected, requestId: crypto.randomUUID() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error === "Insufficient funds" ? `NEED ƒ${data.required?.toLocaleString()}` : data.error ?? "FIT-OUT REJECTED");
      setStatus(laborMode === "self"
        ? `MATERIALS PAID · ${data.fitout.laborUnits} LABOR UNITS REMAIN · COMPLETE WORK TO FINISH`
        : "MATERIALS + CREW PAID · FIT-OUT SCHEDULED");
    } catch (error) {
      setStatus(error instanceof Error ? error.message.toUpperCase() : "FIT-OUT FAILED");
    } finally { setBusy(false); }
  };

  return <div className="min-h-screen bg-[#060912] text-zinc-100 p-4 sm:p-7">
    <div className="max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-4 border-b border-cyan-400/20 pb-4">
        <div><h1 className="font-black tracking-[.2em] text-cyan-200 flex items-center gap-2"><BriefcaseBusiness className="w-5 h-5" /> BUSINESS FLOOR PLANNER</h1><p className="text-xs text-zinc-500 mt-1">CONSISTENT STOCK BONES · CUSTOM FINISHES · NO FREE BUILD</p></div>
        <Link href="/business/marketplace" className="text-xs border border-white/15 px-3 py-2 flex items-center gap-2"><ArrowLeft className="w-3 h-3" /> EXCHANGE</Link>
      </header>

      {!floor && <div className="my-6 border border-amber-400/25 bg-amber-400/5 p-5 text-sm text-amber-200">Acquire or lease a Shadow Tower business floor before commissioning a fit-out. <Link href="/realty" className="underline">VIEW FLOORS</Link></div>}
      <div className="grid md:grid-cols-[1.4fr_.9fr] gap-5 mt-6">
        <section>
          <h2 className="text-xs tracking-[.2em] text-zinc-400 mb-3">1 · CHOOSE BUSINESS BONES</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {templates.map((item) => <button key={item.kind} onClick={() => setKind(item.kind)} className={`text-left border p-4 ${kind === item.kind ? "border-cyan-300 bg-cyan-300/10" : "border-white/10 bg-white/[.02]"}`}>
              <strong className="text-cyan-100">{item.label.toUpperCase()}</strong>
              <p className="text-xs text-zinc-500 mt-1">{item.description}</p>
              <div className="flex flex-wrap gap-1 mt-3">{item.zones.map((zone) => <span key={zone.id} className="text-[9px] border border-white/10 px-1.5 py-1">{zone.label.toUpperCase()}</span>)}</div>
              <p className="text-[10px] text-zinc-500 mt-3">MATERIALS ƒ{item.baseMaterialsFiat.toLocaleString()} · {item.laborUnits} LABOR UNITS</p>
            </button>)}
          </div>
        </section>

        <aside className="border border-white/10 bg-[#0a0f1a] p-4 h-fit space-y-5">
          <div><h2 className="text-xs tracking-[.2em] text-zinc-400 mb-2">2 · CUSTOMIZE</h2>
            <div className="grid grid-cols-2 gap-2">{options.map((option) => <button key={option.id} onClick={() => setSelected((old) => old.includes(option.id) ? old.filter((id) => id !== option.id) : [...old, option.id])} className={`text-[10px] p-2 border ${selected.includes(option.id) ? "border-pink-400 text-pink-200" : "border-white/10 text-zinc-400"}`}>{option.label.toUpperCase()} · ƒ2,500</button>)}</div>
          </div>
          <div><h2 className="text-xs tracking-[.2em] text-zinc-400 mb-2">3 · CHOOSE LABOR</h2>
            <button onClick={() => setLaborMode("self")} className={`w-full text-left p-3 border mb-2 ${laborMode === "self" ? "border-lime-400 bg-lime-400/5" : "border-white/10"}`}><Hammer className="inline w-4 h-4 mr-2" /><strong>DO THE LABOR</strong><p className="text-[10px] text-zinc-500 mt-1">Pay materials now. Finish verified labor units yourself. The benefit is saved crew cost—not free Fiat.</p></button>
            <button onClick={() => setLaborMode("hire")} className={`w-full text-left p-3 border ${laborMode === "hire" ? "border-amber-400 bg-amber-400/5" : "border-white/10"}`}><Users className="inline w-4 h-4 mr-2" /><strong>HIRE A CREW</strong><p className="text-[10px] text-zinc-500 mt-1">Pay the full server-priced crew charge now. Public labor contracts remain real paid jobs.</p></button>
          </div>
          <div className="border-t border-white/10 pt-4"><div className="flex justify-between text-sm"><span>TOTAL DUE</span><strong className="text-lime-300">ƒ{total.toLocaleString()}</strong></div><p className="text-[10px] text-zinc-500 mt-1">No passive income. No free assets. Geometry and prices are server-owned.</p></div>
          <button disabled={!floor || !template || busy} onClick={() => void submit()} className="w-full bg-cyan-300 text-black font-black py-3 disabled:bg-zinc-700">{busy ? "SETTLING…" : laborMode === "self" ? "PAY MATERIALS + START WORK" : "PAY MATERIALS + HIRE CREW"}</button>
          <p className="text-[10px] text-center text-cyan-200">{status}</p>
          {laborMode === "self" && <Link href="/tower/mezzanine" className="block text-center text-[10px] border border-lime-400/30 p-2 text-lime-300"><HardHat className="inline w-3 h-3 mr-1" /> OPEN WORLD WORK BOARD</Link>}
        </aside>
      </div>
    </div>
  </div>;
}