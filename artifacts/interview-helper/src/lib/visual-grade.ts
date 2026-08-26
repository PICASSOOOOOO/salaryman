/**
 * Shared visual language for the world and office.
 *
 * The palette is intentionally small: ink and slate carry the environment,
 * cyan is navigation/interactive signal, magenta is story/identity signal,
 * and amber is utility/light. CCTV is the only surface allowed to switch to
 * phosphor green.
 */
export const NEON_NOIR_PALETTE = {
  ink: "#05070b",
  void: "#091017",
  surface: "#111923",
  raised: "#1a2834",
  slate: "#30414f",
  cyan: "#62e6f5",
  magenta: "#ff6eaa",
  amber: "#ffd166",
  ice: "#e9f7f8",
  mint: "#75e0c0",
  danger: "#ff6b7a",
  shadow: "#020407",
} as const;

export const NEON_NOIR_RGB = {
  terrain: [27, 38, 49],
  terrainIndigo: [29, 34, 53],
  terrainTeal: [25, 47, 54],
  terrainPlum: [43, 37, 56],
  road: [34, 42, 49],
  sidewalk: [62, 75, 83],
  wall: [45, 56, 70],
  wallIndigo: [45, 50, 72],
  wallTeal: [39, 72, 79],
  wallPlum: [69, 50, 72],
} as const;

export type SceneVariant = "live" | "cctv";

export const SCENE_GRADES = {
  live: {
    label: "live",
    accent: NEON_NOIR_PALETTE.cyan,
    secondary: NEON_NOIR_PALETTE.magenta,
    wash: "rgba(98,230,245,.12)",
    filter: "saturate(0.92) contrast(1.04)",
  },
  cctv: {
    label: "cctv",
    accent: "#6ee7b7",
    secondary: "#34d399",
    wash: "rgba(52,211,153,.12)",
    filter: "saturate(0.45) hue-rotate(75deg) brightness(0.9) contrast(1.05)",
  },
} as const;

export function sceneGradeFor(variant: SceneVariant) {
  return SCENE_GRADES[variant];
}

export function crewAccentFor(
  kind: "pablo" | "jean" | "generic",
  active: boolean,
  variant: SceneVariant,
): string {
  if (variant === "cctv") return active ? SCENE_GRADES.cctv.accent : NEON_NOIR_PALETTE.slate;
  if (kind === "pablo") return NEON_NOIR_PALETTE.magenta;
  if (kind === "jean" || active) return NEON_NOIR_PALETTE.cyan;
  return NEON_NOIR_PALETTE.slate;
}