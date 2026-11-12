const PUBLIC_EXACT_PATHS = new Set([
  "/",
  "/landing",
  "/sign-in",
  "/sign-up",
  "/pricing",
  "/alpha",
  "/pablo/promo",
  "/legal",
]);

export function requiresAppSignIn(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  if (PUBLIC_EXACT_PATHS.has(path)) return false;
  if (path.startsWith("/sign-in/") || path.startsWith("/sign-up/")) return false;
  if (path.startsWith("/legal/")) return false;
  return true;
}
