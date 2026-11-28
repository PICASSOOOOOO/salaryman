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

const GAME_ONLY_BROWSER_PATHS = [
  "/armory",
  "/business/floor-plans",
  "/cutscene",
  "/desktop",
  "/game",
  "/marketplace",
  "/my-office",
  "/office",
  "/profile/world-map",
  "/recreation",
  "/settings/os",
  "/skills",
  "/store/realty",
  "/subway",
  "/tower",
  "/travel",
  "/vending",
  "/world",
] as const;

/** True for game surfaces that must not appear in ordinary browser feature menus. */
export function isGameOnlyBrowserPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  return GAME_ONLY_BROWSER_PATHS.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
