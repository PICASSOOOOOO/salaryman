import { openai } from "@workspace/integrations-openai-ai-server";
import { SALARYMAN_STYLE } from "./salaryman-art";
import { getOpenAiTextModel } from "./openai-models";
import type { ConditionState } from "./world-condition";

export interface ArtDirectionAssetSpec {
  name: string;
  purpose: string;
  category: "character" | "building" | "environment" | "prop" | "ui" | "cinematic";
  aspectRatio: "SQUARE" | "PORTRAIT" | "LANDSCAPE";
  jobType: "object" | "landscape" | "cinematic";
  prompt: string;
  silhouette: string;
  palette: string[];
  reviewChecks: string[];
  conditionState?: ConditionState;
}

export interface ArtDirectionBrief {
  title: string;
  creativeThesis: string;
  palette: Array<{ name: string; hex: string; usage: string }>;
  lighting: string;
  materials: string;
  camera: string;
  silhouetteRules: string[];
  avoid: string[];
  assets: ArtDirectionAssetSpec[];
  conditionSystem: string;
  model: string;
}

function text(value: unknown, fallback: string, max = 600): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
}

function list(value: unknown, maxItems: number, maxLength = 240): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, maxItems);
}

function parseJson(raw: string): Record<string, unknown> {
  const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(clean);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Astra returned a non-object art-direction brief");
  }
  return parsed as Record<string, unknown>;
}

function normalizeAsset(value: unknown, index: number): ArtDirectionAssetSpec {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const categories = new Set<ArtDirectionAssetSpec["category"]>([
    "character", "building", "environment", "prop", "ui", "cinematic",
  ]);
  const aspectRatios = new Set<ArtDirectionAssetSpec["aspectRatio"]>([
    "SQUARE", "PORTRAIT", "LANDSCAPE",
  ]);
  const jobTypes = new Set<ArtDirectionAssetSpec["jobType"]>([
    "object", "landscape", "cinematic",
  ]);
  const conditionStates = new Set<ConditionState>([
    "flourishing", "maintained", "weathered", "neglected", "rotting",
  ]);
  const category = categories.has(item.category as ArtDirectionAssetSpec["category"])
    ? item.category as ArtDirectionAssetSpec["category"]
    : "prop";
  const aspectRatio = aspectRatios.has(item.aspectRatio as ArtDirectionAssetSpec["aspectRatio"])
    ? item.aspectRatio as ArtDirectionAssetSpec["aspectRatio"]
    : "SQUARE";
  const jobType = jobTypes.has(item.jobType as ArtDirectionAssetSpec["jobType"])
    ? item.jobType as ArtDirectionAssetSpec["jobType"]
    : category === "environment" || category === "building" ? "landscape" : "object";

  return {
    name: text(item.name, `Asset ${index + 1}`, 120),
    purpose: text(item.purpose, "Reusable game asset", 300),
    category,
    aspectRatio,
    jobType,
    prompt: text(item.prompt, "Create the described asset in the approved Salaryman style.", 900),
    silhouette: text(item.silhouette, "Readable at gameplay scale with a clear outer contour.", 300),
    palette: list(item.palette, 8, 80),
    reviewChecks: list(item.reviewChecks, 8, 180),
    conditionState: conditionStates.has(item.conditionState as ConditionState)
      ? item.conditionState as ConditionState
      : undefined,
  };
}

export async function generateArtDirectionBrief(input: {
  focus: string;
  assetTypes: string[];
  notes?: string;
  count?: number;
}): Promise<ArtDirectionBrief> {
  const count = Math.max(1, Math.min(24, Math.floor(input.count ?? 8)));
  const prompt = `You are SALARYMAN's senior art director and production asset planner.
Create a practical, reusable art-direction brief for a persistent 1970s–1980s
physical solar-punk world whose story is dark noir because Pablo Corp and Mr Shadow
consolidate power and neglect ordinary people. The world is not futuristic: use
human-scale civic architecture, analog technology, painted steel, wood, amber glass,
hand tools, paper, plants, and repairable real-world materials.
The output is handed to render providers and human reviewers; do not generate image URLs,
do not invent a new visual style, and do not use generic fantasy or glossy mobile-game language.

Canonical visual foundation:
${SALARYMAN_STYLE}

Current focus: ${input.focus}
Requested asset types: ${input.assetTypes.join(", ") || "props, environments, and building modules"}
Additional production notes: ${input.notes || "none"}
Plan exactly ${count} candidate assets.

Every physical asset belongs to a slow condition system:
flourishing, maintained, weathered, neglected, or rotting. Neglect accumulates over
months when nobody attends to a place. Player, business, and NPC repair work moves
the same place back toward care. Condition changes must be localized to material wear,
plant health, clutter, stains, lighting, and ordinary repairs; preserve silhouette,
footprint, collision, animation timing, and interaction readability. Never introduce
holograms, glowing circuitry, drones, impossible architecture, neon sludge, or graphic
biological horror.

Return strict JSON only with this shape:
{
  "title": "...",
  "creativeThesis": "...",
  "palette": [{"name":"...","hex":"#000000","usage":"..."}],
  "lighting": "...",
  "materials": "...",
  "camera": "...",
  "silhouetteRules": ["..."],
  "avoid": ["..."],
  "assets": [{
    "name":"...",
    "purpose":"...",
    "category":"character|building|environment|prop|ui|cinematic",
    "aspectRatio":"SQUARE|PORTRAIT|LANDSCAPE",
    "jobType":"object|landscape|cinematic",
    "prompt":"A provider-ready prompt that preserves the canonical style.",
    "silhouette":"...",
    "palette":["#hex ..."],
     "reviewChecks":["..."],
     "conditionState":"flourishing|maintained|weathered|neglected|rotting"
  }]
}

Every asset prompt must be concrete enough for a render operator to use without guessing.
Keep the set visually coherent, production-sized, and useful for a first playable art pass.`;

  const completion = await openai.chat.completions.create({
    model: getOpenAiTextModel(),
    max_completion_tokens: 5000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: "Build the next art-direction brief now." },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Astra returned an empty art-direction brief");
  const parsed = parseJson(raw);
  const palette = Array.isArray(parsed.palette)
    ? parsed.palette.slice(0, 12).map((entry) => {
        const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        return {
          name: text(item.name, "Accent", 80),
          hex: text(item.hex, "#22d3ee", 20),
          usage: text(item.usage, "Use sparingly for readable emphasis.", 180),
        };
      })
    : [];
  const assets = Array.isArray(parsed.assets)
    ? parsed.assets.slice(0, count).map((entry, index) => normalizeAsset(entry, index))
    : [];
  if (assets.length === 0) throw new Error("Astra returned no usable art assets");

  return {
    title: text(parsed.title, "Salaryman art-direction brief", 160),
    creativeThesis: text(parsed.creativeThesis, "A coherent physical solar-punk production set whose noir comes from neglect and power.", 500),
    palette,
    lighting: text(parsed.lighting, "Controlled cyan and hot-pink rim light over deep navy ambient fill.", 400),
    materials: text(parsed.materials, "Readable industrial materials with restrained surface variation.", 400),
    camera: text(parsed.camera, "Consistent isometric or centered orthographic framing.", 400),
    silhouetteRules: list(parsed.silhouetteRules, 12),
    avoid: list(parsed.avoid, 16),
    assets,
    conditionSystem: "Five bounded states: flourishing, maintained, weathered, neglected, rotting. Months of neglect lower condition; player, business, and NPC care restores it. Preserve physical readability and gameplay access.",
    model: getOpenAiTextModel(),
  };
}