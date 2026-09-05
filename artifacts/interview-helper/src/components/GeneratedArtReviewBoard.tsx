import { ArrowUpRight, Compass, Image as ImageIcon, Sparkles } from 'lucide-react';

const REFERENCES = [
  {
    label: 'Character design',
    description: 'Unreal-ready hero character direction',
    file: 'salaryman-character-pablo-review.png',
    ratio: 'aspect-[3/4]',
  },
  {
    label: 'Landscape',
    description: 'Shadow Tower spatial environment direction',
    file: 'salaryman-shadow-tower-landscape-review.png',
    ratio: 'aspect-[16/9]',
  },
  {
    label: 'Object kit',
    description: 'Production prop and interactable direction',
    file: 'salaryman-office-object-kit-review.png',
    ratio: 'aspect-[16/9]',
  },
  {
    label: 'Tile materials',
    description: 'Godot blocking and environment material direction',
    file: 'salaryman-tile-material-review.png',
    ratio: 'aspect-[16/9]',
  },
];

export default function GeneratedArtReviewBoard() {
  return (
    <section className="mb-5 rounded-lg border border-sky-500/20 bg-[#08111d] overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/[0.08]">
        <Compass className="w-4 h-4 text-sky-300" />
        <div>
          <div className="font-mono text-[12px] tracking-widest uppercase text-zinc-200">Replacement direction board</div>
          <div className="font-mono text-[9px] tracking-widest uppercase text-zinc-600">generated references · not promoted to runtime</div>
        </div>
        <span className="ml-auto flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-sky-300">
          <ImageIcon className="w-3 h-3" /> compare before bake
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        {REFERENCES.map(reference => (
          <figure key={reference.file} className="overflow-hidden rounded-md border border-white/[0.08] bg-black/20">
            <div className={`relative flex items-center justify-center overflow-hidden bg-[#05080a] ${reference.ratio}`}>
              <img
                src={`${import.meta.env.BASE_URL}game-art-review/${reference.file}`}
                alt={reference.label}
                className="h-full w-full object-cover"
              />
              <span className="absolute left-2 top-2 flex items-center gap-1 rounded border border-sky-300/30 bg-black/60 px-1.5 py-1 font-mono text-[8px] uppercase tracking-widest text-sky-200">
                <Sparkles className="h-2.5 w-2.5" /> review
              </span>
            </div>
            <figcaption className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-200">{reference.label}</div>
                <div className="mt-1 font-mono text-[9px] text-zinc-600">{reference.description}</div>
              </div>
              <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="border-t border-white/[0.06] px-4 py-2 font-mono text-[9px] text-zinc-600">
        These references establish the direction for the Godot sprite/material pass and the Unreal production pass. They remain review-only until contracts and QA are satisfied.
      </div>
    </section>
  );
}