import type { OfficePropertyLayout } from "@/lib/office-property-layouts";

export type TowerSpaceArtKind =
  | "lobby"
  | "recreation"
  | "mezzanine"
  | "rest"
  | "security"
  | "founder"
  | "company"
  | "picasso"
  | "shadow_corp";

const SPACE_FILES: Record<TowerSpaceArtKind, string> = {
  lobby: "tower_space_lobby.jpg",
  recreation: "tower_space_recreation.jpg",
  mezzanine: "tower_space_mezzanine.jpg",
  rest: "tower_space_rest.jpg",
  security: "tower_space_security.jpg",
  founder: "tower_space_founder.jpg",
  company: "tower_space_company.jpg",
  picasso: "tower_space_picasso.jpg",
  shadow_corp: "tower_space_shadow_corp.jpg",
};

export function getTowerSpaceArtUrl(kind: TowerSpaceArtKind): string {
  if (kind === "lobby") {
    return `${import.meta.env.BASE_URL}game-art-review/salaryman-solarpunk-landscape-v2.png`;
  }
  return `${import.meta.env.BASE_URL}pixel-agents/shadow-tower/spaces/${SPACE_FILES[kind]}`;
}

/** Every Tower layout resolves to one intentional physical-space art family. */
export function getTowerSpaceArtKind(layout: OfficePropertyLayout): TowerSpaceArtKind {
  if (layout.propertyKey.endsWith(":lobby")) return "lobby";
  if (layout.plan.floorType !== "office") return layout.plan.floorType;
  if (layout.plan.floorNumber === 66) return "picasso";
  // Only the actual Shadow Corp roofline gets Shadow Corp's finished art.
  // Reserved sealed floors are not occupied corporate space.
  if (layout.plan.floorNumber === 67) return "shadow_corp";
  if (layout.plan.archetype === "company") return "company";
  return "founder";
}

export function getTowerSpaceArtUrlForLayout(layout: OfficePropertyLayout): string {
  return getTowerSpaceArtUrl(getTowerSpaceArtKind(layout));
}