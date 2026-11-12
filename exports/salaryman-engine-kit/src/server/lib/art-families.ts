export type ArtFamilyId =
  | "character_template"
  | "pixel_character"
  | "floor_tile"
  | "wall_atlas"
  | "spatial_object"
  | "spatial_landscape"
  | "cinematic"
  | "ui_illustration";

export type ArtDevTool = "godot" | "unreal" | "godot+unreal";
export type ProductionRenderer = "web-png" | "unreal" | "nano-banana";

export interface ArtFamilyDefinition {
  id: ArtFamilyId;
  label: string;
  description: string;
  styleDirection: string;
  artDevTool: ArtDevTool;
  productionRenderer: ProductionRenderer;
  jobType: "object" | "landscape" | "cinematic";
  sourceContract: string;
  reviewChecklist: string[];
}

export const SALARYMAN_GAME_ART_STYLE =
  "Physical art: 1970s–1980s solar-punk retrofuture — warm daylight, abundant plants, repaired materials, amber glass, brushed metal, painted steel, modular civic architecture, optimistic analog technology, and hand-authored readable silhouettes. Narrative treatment may remain dark noir through weather, composition, lighting, wear, and story context; do not turn the physical world into dark cyberpunk. Avoid CRT scanlines, baked text, and disposable detail.";

export const ANIMATION_READY_RULES = [
  "clear silhouette at gameplay scale",
  "separable layers and materials",
  "no baked text or UI",
  "stable key light and camera",
  "clean joints, pivots, and contact points",
];

export const CONDITION_REVIEW_RULES = [
  "condition is localized to material wear, plants, clutter, stains, and ordinary repairs",
  "same silhouette, footprint, collision, anchor, camera, and interaction target in every state",
  "no global grayscale wash and no condition label encoded only by hue",
  "no holograms, glowing circuitry, drones, neon sludge, or impossible architecture",
  "rotting may cordon unsafe non-interactive detail but must preserve required gameplay access",
];

export const SALARYMAN_ART_FAMILIES: Record<ArtFamilyId, ArtFamilyDefinition> = {
  character_template: {
    id: "character_template",
    label: "Character templates",
    description: "Realistic identity portraits and hero character designs.",
    styleDirection: SALARYMAN_GAME_ART_STYLE,
    artDevTool: "unreal",
    productionRenderer: "unreal",
    jobType: "object",
    sourceContract: "3:4 portrait; realistic character prompt; natural anatomy and materials",
    reviewChecklist: ["face and hands", "silhouette", "wardrobe continuity", "transparent/cutout readiness", ...ANIMATION_READY_RULES, ...CONDITION_REVIEW_RULES],
  },
  pixel_character: {
    id: "pixel_character",
    label: "Pixel characters",
    description: "In-office character sheets used by the live 2D runtime.",
    styleDirection: SALARYMAN_GAME_ART_STYLE,
    artDevTool: "godot",
    productionRenderer: "web-png",
    jobType: "object",
    sourceContract: "112×96 PNG; 7 columns × 3 directions; each frame 16×32",
    reviewChecklist: ["frame alignment", "readable silhouette", "walk loop", "palette separation", ...ANIMATION_READY_RULES, ...CONDITION_REVIEW_RULES],
  },
  floor_tile: {
    id: "floor_tile",
    label: "Floor tiles",
    description: "Repeatable 16×16 floor textures for office spatial layouts.",
    styleDirection: SALARYMAN_GAME_ART_STYLE,
    artDevTool: "godot",
    productionRenderer: "web-png",
    jobType: "object",
    sourceContract: "16×16 PNG tile; seamless repetition; pixel-perfect edges",
    reviewChecklist: ["seamless repeat", "value contrast", "walkable readability", "no filtering", "material continuity", ...CONDITION_REVIEW_RULES],
  },
  wall_atlas: {
    id: "wall_atlas",
    label: "Wall atlases",
    description: "Bitmask wall pieces for occlusion and office boundaries.",
    styleDirection: SALARYMAN_GAME_ART_STYLE,
    artDevTool: "godot",
    productionRenderer: "web-png",
    jobType: "object",
    sourceContract: "64×128 PNG atlas; 16 pieces; each piece 16×32",
    reviewChecklist: ["all 16 masks", "corner continuity", "occlusion edge", "palette consistency", "modular variation", ...CONDITION_REVIEW_RULES],
  },
  spatial_object: {
    id: "spatial_object",
    label: "Spatial objects",
    description: "Furniture, props, interactables, and readable gameplay objects.",
    styleDirection: SALARYMAN_GAME_ART_STYLE,
    artDevTool: "godot+unreal",
    productionRenderer: "unreal",
    jobType: "object",
    sourceContract: "catalog dimensions/footprint; pixel office sprite or Unreal production render",
    reviewChecklist: ["footprint", "interaction silhouette", "occlusion", "material readability", ...ANIMATION_READY_RULES, ...CONDITION_REVIEW_RULES],
  },
  spatial_landscape: {
    id: "spatial_landscape",
    label: "Spatial landscapes",
    description: "Buildings, environments, and city-scale spatial art.",
    styleDirection: SALARYMAN_GAME_ART_STYLE,
    artDevTool: "godot+unreal",
    productionRenderer: "unreal",
    jobType: "landscape",
    sourceContract: "isometric/building contract or Unreal landscape/camera composition",
    reviewChecklist: ["scale language", "camera composition", "landmark silhouette", "lighting continuity", "parallax layers", ...CONDITION_REVIEW_RULES],
  },
  cinematic: {
    id: "cinematic",
    label: "Cinematics",
    description: "Story scenes, motion plates, and high-fidelity cinematic output.",
    styleDirection: SALARYMAN_GAME_ART_STYLE,
    artDevTool: "godot+unreal",
    productionRenderer: "unreal",
    jobType: "cinematic",
    sourceContract: "sequence timing, camera, media type, and public review URL",
    reviewChecklist: ["composition", "motion continuity", "character consistency", "encode/playback", "rig/contact continuity", ...CONDITION_REVIEW_RULES],
  },
  ui_illustration: {
    id: "ui_illustration",
    label: "UI illustrations",
    description: "Menu and card artwork that supports game navigation.",
    styleDirection: SALARYMAN_GAME_ART_STYLE,
    artDevTool: "unreal",
    productionRenderer: "nano-banana",
    jobType: "object",
    sourceContract: "card aspect ratio; no UI text baked into the image",
    reviewChecklist: ["small-size legibility", "safe crop", "no text artifacts", "palette fit", "layerable composition", ...CONDITION_REVIEW_RULES],
  },
};

export function classifyArtFamily(entry: { key: string; category: string }): ArtFamilyId {
  if (entry.key.startsWith("char_template_")) return "character_template";
  if (entry.key.startsWith("cutscene_")) return "cinematic";
  if (entry.key.startsWith("building_") || entry.category === "scene") return "spatial_landscape";
  if (entry.category === "building") return "spatial_landscape";
  if (entry.category === "prop") return "spatial_object";
  if (entry.category === "ui") return "ui_illustration";
  if (entry.category === "character") return "character_template";
  return "spatial_object";
}

export function listArtFamilies(): ArtFamilyDefinition[] {
  return Object.values(SALARYMAN_ART_FAMILIES);
}