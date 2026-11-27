export interface CharacterArtQaAsset {
  category: string;
  status: string;
}

export interface CharacterArtQaSummary {
  expected: number;
  ready: number;
  pending: number;
  failed: number;
  unclassified: number;
  releaseReady: boolean;
}

export function summarizeCharacterArtQa(assets: CharacterArtQaAsset[]): CharacterArtQaSummary {
  const characters = assets.filter(asset => asset.category === "character");
  const ready = characters.filter(asset => asset.status === "ready").length;
  const pending = characters.filter(asset => asset.status === "pending").length;
  const failed = characters.filter(asset => asset.status === "failed").length;
  const unclassified = characters.length - ready - pending - failed;
  return {
    expected: characters.length,
    ready,
    pending,
    failed,
    unclassified,
    releaseReady: characters.length > 0 && ready === characters.length,
  };
}
