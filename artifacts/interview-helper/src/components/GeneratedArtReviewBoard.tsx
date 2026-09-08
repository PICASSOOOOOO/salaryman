import { Compass, Image as ImageIcon, Sparkles } from "lucide-react";

const REFERENCES = [
  {
    label: "Character design",
    description: "A working silhouette for the salaryman.",
    file: "salaryman-solarpunk-character-v2.png",
    ratio: "aspect-[3/4]",
    className: "md:row-span-2",
  },
  {
    label: "Animation poses",
    description: "Readable key poses for a physical world.",
    file: "salaryman-solarpunk-animation-v2.png",
    ratio: "aspect-[16/9]",
    className: "",
  },
  {
    label: "Landscape",
    description: "The city outside the tower window.",
    file: "salaryman-solarpunk-landscape-v2.png",
    ratio: "aspect-[16/9]",
    className: "",
  },
  {
    label: "Object kit",
    description: "Props with a legible, tactile profile.",
    file: "salaryman-solarpunk-object-kit-v2.png",
    ratio: "aspect-[16/9]",
    className: "",
  },
  {
    label: "Tile materials",
    description: "Material language for floors and walls.",
    file: "salaryman-solarpunk-tiles-v2.png",
    ratio: "aspect-[16/9]",
    className: "",
  },
];

export default function GeneratedArtReviewBoard() {
  return (
    <section className="review-direction-board mb-5 overflow-hidden border border-[#5cd5d0]/20 bg-[#0b1720]">
      <div className="flex flex-wrap items-center gap-4 border-b border-white/[0.08] px-4 py-4 sm:px-5">
        <div className="flex h-9 w-9 items-center justify-center border border-[#c47e3f]/50 bg-[#c47e3f]/10">
          <Compass className="h-4 w-4 text-[#e0a36b]" />
        </div>
        <div>
          <div className="font-display text-sm font-bold uppercase tracking-[.14em] text-[#eee4d0]">
            World direction
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[.18em] text-[#7d9696]">
            physical light · noir pressure · reference only
          </div>
        </div>
        <span className="ml-auto flex items-center gap-2 border border-[#5cd5d0]/20 bg-[#5cd5d0]/[.06] px-2.5 py-2 font-mono text-[9px] uppercase tracking-[.16em] text-[#8de1dc]">
          <ImageIcon className="h-3 w-3" /> art room / 05 plates
        </span>
      </div>
      <div className="grid grid-cols-1 gap-px bg-white/[.07] sm:grid-cols-2">
        {REFERENCES.map((reference, index) => (
          <figure
            key={reference.file}
            className={`group overflow-hidden bg-[#071018] ${reference.className}`}
          >
            <div
              className={`relative flex items-center justify-center overflow-hidden bg-[#05080a] ${reference.ratio}`}
            >
              <img
                src={`${import.meta.env.BASE_URL}game-art-review/${reference.file}`}
                alt={reference.label}
                className={`h-full w-full object-cover transition duration-700 group-hover:scale-[1.03] ${index === 0 ? "object-[center_18%]" : ""}`}
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,9,13,.04),rgba(3,9,13,.72))]" />
              <span className="absolute left-3 top-3 flex items-center gap-1.5 border border-[#e0a36b]/45 bg-[#101a1c]/85 px-2 py-1.5 font-mono text-[8px] uppercase tracking-[.16em] text-[#f0c18e]">
                <Sparkles className="h-2.5 w-2.5" /> review plate
              </span>
              <span className="absolute bottom-3 right-3 font-mono text-[9px] tracking-[.16em] text-white/45">
                0{index + 1}
              </span>
            </div>
            <figcaption className="border-t border-white/[.06] px-3 py-3.5">
              <div className="min-w-0">
                <div className="font-display text-[11px] font-bold uppercase tracking-[.14em] text-[#eee4d0]">
                  {reference.label}
                </div>
                <div className="mt-1 font-mono text-[9px] leading-4 text-[#7d9696]">
                  {reference.description}
                </div>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="flex flex-col gap-1 border-t border-white/[0.06] px-4 py-3.5 font-mono text-[9px] leading-4 text-[#718889] sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span>Production reference · not loaded into live gameplay.</span>
        <span className="uppercase tracking-[.16em] text-[#c47e3f]">
          contracts + QA before promotion
        </span>
      </div>
    </section>
  );
}
