import { useEffect, useMemo, useState } from 'react';
import { Eye, Image as ImageIcon, Loader2, Map, Package, UserRound } from 'lucide-react';

type GalleryFamily = 'characters' | 'tiles' | 'walls' | 'objects';

interface FurnitureItem {
  id: string;
  label: string;
  category: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  furniturePath: string;
}

const CHARACTER_ASSETS = Array.from({ length: 6 }, (_, index) => ({
  id: `char_${index}`,
  label: `Office character ${index + 1}`,
  src: `pixel-agents/assets/characters/char_${index}.png`,
  detail: '112×96 · 7 frames × 3 directions',
}));

const TILE_ASSETS = Array.from({ length: 9 }, (_, index) => ({
  id: `floor_${index}`,
  label: `Floor tile ${index}`,
  src: `pixel-agents/assets/floors/floor_${index}.png`,
  detail: '16×16 repeatable tile',
}));

const WALL_ASSETS = [{
  id: 'wall_0',
  label: 'Wall bitmask atlas',
  src: 'pixel-agents/assets/walls/wall_0.png',
  detail: '64×128 · 16 occlusion pieces',
}];

const FAMILY_META: Record<GalleryFamily, { label: string; icon: typeof UserRound; color: string }> = {
  characters: { label: 'Characters', icon: UserRound, color: 'text-cyan-300' },
  tiles: { label: 'Landscape tiles', icon: Map, color: 'text-emerald-300' },
  walls: { label: 'Walls', icon: Package, color: 'text-amber-300' },
  objects: { label: 'Spatial objects', icon: Package, color: 'text-fuchsia-300' },
};

const assetUrl = (relativePath: string) => `${import.meta.env.BASE_URL}${relativePath}`;

export default function GameAssetGallery() {
  const [family, setFamily] = useState<GalleryFamily>('characters');
  const [objects, setObjects] = useState<FurnitureItem[]>([]);
  const [loadingObjects, setLoadingObjects] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(assetUrl('pixel-agents/assets/furniture-catalog.json'))
      .then(res => res.ok ? res.json() as Promise<FurnitureItem[]> : [])
      .then(items => {
        if (!cancelled) setObjects(items.slice(0, 18));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingObjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const objectCards = useMemo(() => objects.map(item => ({
    id: item.id,
    label: item.label,
    src: `pixel-agents/assets/${item.furniturePath}`,
    detail: `${item.width}×${item.height} · ${item.footprintW}×${item.footprintH} footprint`,
  })), [objects]);

  const familyInfo = FAMILY_META[family];
  const Icon = familyInfo.icon;
  const cards = family === 'characters'
    ? CHARACTER_ASSETS
    : family === 'tiles'
      ? TILE_ASSETS
      : family === 'walls'
        ? WALL_ASSETS
        : objectCards;

  return (
    <section className="mb-5 rounded-lg border border-emerald-500/20 bg-[#07130f] overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/[0.08]">
        <Eye className="w-4 h-4 text-emerald-300" />
        <div>
          <div className="font-mono text-[12px] tracking-widest uppercase text-zinc-200">Game asset review</div>
          <div className="font-mono text-[9px] tracking-widest uppercase text-zinc-600">current runtime library · replacement candidates</div>
        </div>
        <span className="ml-auto flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-emerald-300">
          <ImageIcon className="w-3 h-3" /> live reference
        </span>
      </div>
      <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-white/[0.06]">
        {(Object.keys(FAMILY_META) as GalleryFamily[]).map(key => {
          const meta = FAMILY_META[key];
          const TabIcon = meta.icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFamily(key)}
              className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                family === key
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                  : 'border-white/[0.08] text-zinc-500 hover:border-white/[0.18] hover:text-zinc-300'
              }`}
            >
              <TabIcon className="w-3 h-3" />
              {meta.label}
            </button>
          );
        })}
      </div>
      <div className="px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <Icon className={`w-3.5 h-3.5 ${familyInfo.color}`} />
          <span className={`font-mono text-[10px] uppercase tracking-widest ${familyInfo.color}`}>{familyInfo.label}</span>
          <span className="font-mono text-[9px] text-zinc-600">
            {family === 'objects' && loadingObjects ? 'loading catalog…' : `${cards.length} references`}
          </span>
        </div>
        {family === 'objects' && loadingObjects ? (
          <div className="flex items-center gap-2 py-10 font-mono text-[10px] text-zinc-600">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> loading furniture catalog
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {cards.map(card => (
              <figure key={card.id} className="min-w-0 rounded border border-white/[0.08] bg-black/20 p-2">
                <div className="flex h-24 items-center justify-center rounded bg-[#05080a] p-2">
                  <img
                    src={assetUrl(card.src)}
                    alt={card.label}
                    className="max-h-full max-w-full object-contain [image-rendering:pixelated]"
                  />
                </div>
                <figcaption className="mt-2 truncate font-mono text-[10px] text-zinc-300">{card.label}</figcaption>
                <div className="mt-0.5 truncate font-mono text-[8px] text-zinc-600">{card.detail}</div>
              </figure>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-white/[0.06] px-4 py-2 font-mono text-[9px] text-zinc-600">
        These are the real current web-runtime references. New Godot/Unreal replacements should preserve the labeled contracts before promotion.
      </div>
    </section>
  );
}