import DATA from "./page-meta-data.json";

const { baseUrl, defaultOgImage, routes } = DATA;

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
}

type RouteKey = keyof typeof routes;

function buildMeta(path: RouteKey): PageMeta {
  const r = routes[path];
  return {
    title: r.title,
    description: r.description,
    canonical: baseUrl + path,
    ogTitle: r.ogTitle,
    ogDescription: r.ogDescription,
    ogImage: defaultOgImage,
  };
}

export const PAGE_META = Object.fromEntries(
  (Object.keys(routes) as RouteKey[]).map((k) => [k, buildMeta(k)])
) as Record<string, PageMeta>;

const DEFAULT_META = PAGE_META["/"];

export function getPageMeta(pathname: string): PageMeta {
  return PAGE_META[pathname] ?? DEFAULT_META;
}
