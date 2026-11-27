/**
 * Production game routes stay locked until the trailer flag is enabled.
 * A production PTU build opts out with VITE_GAME_RELEASE_CHANNEL=ptu.
 */
export function isGameReleaseLocked(config: {
  production: boolean;
  releaseChannel?: string;
  trailerReady?: string | boolean;
}): boolean {
  if (!config.production || config.releaseChannel?.toLowerCase() === "ptu") return false;
  return config.trailerReady !== true && config.trailerReady !== "true";
}
