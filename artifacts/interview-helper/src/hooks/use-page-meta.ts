import { useEffect } from "react";
import { useLocation } from "wouter";
import { getPageMeta } from "@/lib/page-meta";

function setMeta(selector: string, attr: string, value: string) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

export function usePageMeta() {
  const [pathname] = useLocation();

  useEffect(() => {
    const meta = getPageMeta(pathname);

    document.title = meta.title;

    setMeta('link[rel="canonical"]', "href", meta.canonical);
    setMeta('meta[name="description"]', "content", meta.description);

    setMeta('meta[property="og:title"]', "content", meta.ogTitle);
    setMeta('meta[property="og:description"]', "content", meta.ogDescription);
    setMeta('meta[property="og:url"]', "content", meta.canonical);
    setMeta('meta[property="og:image"]', "content", meta.ogImage);

    setMeta('meta[name="twitter:title"]', "content", meta.ogTitle);
    setMeta('meta[name="twitter:description"]', "content", meta.ogDescription);
    setMeta('meta[name="twitter:image"]', "content", meta.ogImage);
  }, [pathname]);
}
