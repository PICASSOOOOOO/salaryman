import { useArtAsset } from "@/lib/art";
import { characterArtKey } from "@/lib/character-art";

export interface PixelFaceTheme {
  base: string;
  baseDark: string;
  accent: string;
  accentDim: string;
}

export function PixelAgentFace({
  seed,
  theme,
  className,
}: {
  seed: string;
  theme: PixelFaceTheme;
  className?: string;
}) {
  const assetKey = characterArtKey("pixel_agent", seed);
  const imageUrl = useArtAsset(assetKey, 4000, { retryOnFail: true });

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        className={className}
        alt={`Named art for ${seed}`}
        loading="lazy"
        style={{ objectFit: "contain", imageRendering: "pixelated" }}
        data-character-art-key={assetKey}
      />
    );
  }

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-1 border border-dashed ${className ?? ""}`}
      style={{
        borderColor: theme.accent,
        background: "linear-gradient(145deg, rgba(12,12,20,.96), rgba(26,16,36,.96))",
        color: theme.accent,
        fontFamily: "monospace",
        textAlign: "center",
      }}
      role="img"
      aria-label={`${seed} named art is not ready`}
      data-testid="character-art-missing"
      data-character-art-key={assetKey}
    >
      <span style={{ fontSize: "clamp(7px, 1.6vw, 11px)", fontWeight: 800, letterSpacing: ".12em" }}>
        ART NOT READY
      </span>
      <span style={{ maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", fontSize: "clamp(6px, 1.2vw, 9px)" }}>
        {seed.toUpperCase()}
      </span>
    </div>
  );
}

const STEEL_BASE = "#c7d3e0";
const STEEL_DARK = "#74849a";

export interface DivisionMeta {
  label: string;
  accent: string;
  theme: PixelFaceTheme;
}

function div(label: string, accent: string, accentDim: string): DivisionMeta {
  return {
    label,
    accent,
    theme: { base: STEEL_BASE, baseDark: STEEL_DARK, accent, accentDim },
  };
}

export const DIVISIONS: Record<string, DivisionMeta> = {
  core: div("Core Command", "#34d399", "#0f766e"),
  automation: div("Growth & Automation", "#a78bfa", "#6d28d9"),
  business: div("Business Development", "#fbbf24", "#b45309"),
  finance: div("Finance Desk", "#a3e635", "#4d7c0f"),
  creative: div("Creative Studio", "#f472b6", "#be185d"),
  trades: div("Trades & Service", "#fb923c", "#c2410c"),
  publishing: div("Publishing House", "#38bdf8", "#0369a1"),
  education: div("The Academy", "#22d3ee", "#0e7490"),
  professional: div("Legal & Professional", "#818cf8", "#4338ca"),
  ecommerce: div("Commerce Floor", "#fb7185", "#be123c"),
  productivity: div("Ops & Productivity", "#2dd4bf", "#0f766e"),
  personal: div("Lifestyle", "#c084fc", "#7e22ce"),
  healthcare: div("Health Bay", "#f87171", "#b91c1c"),
  gaming: div("Game World", "#4ade80", "#15803d"),
  insurance: div("Insurance Wing", "#60a5fa", "#1d4ed8"),
};

export const DIVISION_ORDER = [
  "core",
  "automation",
  "business",
  "finance",
  "creative",
  "professional",
  "ecommerce",
  "trades",
  "publishing",
  "education",
  "productivity",
  "healthcare",
  "personal",
  "insurance",
  "gaming",
];

export function divisionFor(category: string): DivisionMeta {
  return DIVISIONS[category] ?? div(category.toUpperCase(), "#94a3b8", "#475569");
}
