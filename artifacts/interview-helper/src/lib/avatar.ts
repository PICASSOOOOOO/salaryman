// Profile photos are stored as a raw object path ("/objects/...") which we serve
// through the public storage route. Replit-auth absolute URLs (and data/blob
// URLs) are used verbatim. This is the single source of truth for resolving a
// stored profile photo into a loadable <img src>; render it everywhere a user
// appears so uploaded photos show consistently across the app.
export function resolveAvatarUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  if (url.startsWith('/objects/')) return `${import.meta.env.BASE_URL}api/storage${url}`;
  return url;
}
