import { useEffect, useState } from 'react';
import { Layers3, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface ArtFamily {
  id: string;
  label: string;
  description: string;
  artDevTool: string;
  productionRenderer: string;
  jobType: string;
  sourceContract: string;
  reviewChecklist: string[];
}

export default function ArtFamilyMatrix() {
  const [families, setFamilies] = useState<ArtFamily[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/art/families')
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json() as { families?: ArtFamily[] };
        if (!cancelled) setFamilies(data.families ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mb-5 rounded-lg border border-fuchsia-500/20 bg-[#100b18] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08]">
        <Layers3 className="w-4 h-4 text-fuchsia-300" />
        <span className="font-mono text-[12px] tracking-widest uppercase text-zinc-200">Asset family matrix</span>
        <span className="font-mono text-[9px] tracking-widest uppercase text-zinc-600">Godot + Unreal production plan</span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 p-4 font-mono text-[10px] text-zinc-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> loading family contracts…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-white/[0.06]">
          {families.map((family) => (
            <div key={family.id} className="bg-[#100b18] p-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-fuchsia-200">{family.label}</span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-cyan-300">{family.artDevTool}</span>
                <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-zinc-500">{family.productionRenderer}</span>
              </div>
              <p className="font-mono text-[10px] text-zinc-500">{family.description}</p>
              <p className="font-mono text-[9px] text-zinc-600">{family.sourceContract}</p>
              <p className="font-mono text-[9px] text-zinc-700">review: {family.reviewChecklist.join(' · ')}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}