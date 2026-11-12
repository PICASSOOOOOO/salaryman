export interface MarketResearchSource {
  title: string;
  url: string;
}

/** Read only first-party Responses API URL citations and reject unsafe schemes. */
export function extractWebSearchCitations(response: unknown): MarketResearchSource[] {
  if (typeof response !== "object" || response === null) return [];
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return [];

  const sources: MarketResearchSource[] = [];
  const seen = new Set<string>();
  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part !== "object" || part === null) continue;
      const annotations = (part as { annotations?: unknown }).annotations;
      if (!Array.isArray(annotations)) continue;
      for (const annotation of annotations) {
        if (typeof annotation !== "object" || annotation === null) continue;
        const citation = annotation as { type?: unknown; url?: unknown; title?: unknown };
        if (citation.type !== "url_citation" || typeof citation.url !== "string") continue;
        try {
          const parsed = new URL(citation.url);
          if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || seen.has(parsed.href)) continue;
          seen.add(parsed.href);
          const title = typeof citation.title === "string" && citation.title.trim()
            ? citation.title.trim().slice(0, 240)
            : parsed.hostname;
          sources.push({ title, url: parsed.href });
          if (sources.length >= 8) return sources;
        } catch {
          // Malformed URLs are not usable citations.
        }
      }
    }
  }
  return sources;
}