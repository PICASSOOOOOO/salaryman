import { Router, type Request, type Response } from "express";
import * as cheerio from "cheerio";

const router = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

const OEMBED_ENDPOINTS: Record<string, string> = {
  "tiktok.com": "https://www.tiktok.com/oembed",
  "youtube.com": "https://www.youtube.com/oembed",
  "youtu.be": "https://www.youtube.com/oembed",
  "twitter.com": "https://publish.twitter.com/oembed",
  "x.com": "https://publish.twitter.com/oembed",
  "instagram.com": "https://api.instagram.com/oembed",
  "vimeo.com": "https://vimeo.com/api/oembed.json",
  "spotify.com": "https://open.spotify.com/oembed",
  "soundcloud.com": "https://soundcloud.com/oembed",
  "reddit.com": "https://www.reddit.com/oembed",
};

function getOembedEndpoint(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    for (const [domain, endpoint] of Object.entries(OEMBED_ENDPOINTS)) {
      if (hostname === domain || hostname.endsWith("." + domain)) {
        return endpoint;
      }
    }
  } catch {}
  return null;
}

function isSocialMediaUrl(url: string): boolean {
  return getOembedEndpoint(url) !== null;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isPrivateIp(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length === 4) {
    const a = parseInt(parts[0]);
    if (a === 10) return true;
    if (a === 172 && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31) return true;
    if (a === 192 && parseInt(parts[1]) === 168) return true;
    if (a === 127) return true;
    if (a === 0) return true;
  }
  if (hostname === "localhost" || hostname === "::1") return true;
  return false;
}

async function fetchOembed(url: string): Promise<any> {
  const endpoint = getOembedEndpoint(url);
  if (!endpoint) return null;

  const oembedUrl = `${endpoint}?url=${encodeURIComponent(url)}&format=json`;
  const resp = await fetch(oembedUrl, {
    headers: { "User-Agent": "Salaryman/1.0 (Content Extractor)" },
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) return null;
  return resp.json();
}

async function fetchAndParsePage(url: string): Promise<{
  title: string;
  description: string;
  content: string;
  author: string;
  image: string;
  siteName: string;
  publishedDate: string;
  links: { text: string; href: string }[];
  headings: string[];
}> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Salaryman/1.0; +https://salaryman.app)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }

  const contentType = resp.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    const text = await resp.text();
    return {
      title: new URL(url).hostname,
      description: "",
      content: text.slice(0, 50000),
      author: "",
      image: "",
      siteName: "",
      publishedDate: "",
      links: [],
      headings: [],
    };
  }

  const html = await resp.text();
  const $ = cheerio.load(html);

  $("script, style, noscript, iframe, svg, nav, footer, header, [role='navigation'], [role='banner']").remove();
  $(".sidebar, .nav, .menu, .footer, .header, .ad, .ads, .advertisement, .cookie, .popup, .modal").remove();

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    "";

  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    "";

  const author =
    $('meta[name="author"]').attr("content") ||
    $('meta[property="article:author"]').attr("content") ||
    $('[rel="author"]').first().text().trim() ||
    "";

  const image =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    "";

  const siteName =
    $('meta[property="og:site_name"]').attr("content") ||
    "";

  const publishedDate =
    $('meta[property="article:published_time"]').attr("content") ||
    $("time").first().attr("datetime") ||
    "";

  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 200) headings.push(text);
  });

  const links: { text: string; href: string }[] = [];
  $("article a, main a, .content a, .post a, .entry a").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (href && text && text.length > 2 && text.length < 200) {
      try {
        const fullUrl = new URL(href, url).href;
        if (fullUrl.startsWith("http")) {
          links.push({ text, href: fullUrl });
        }
      } catch {}
    }
  });

  const contentSelectors = [
    "article",
    '[role="main"]',
    "main",
    ".post-content",
    ".entry-content",
    ".article-content",
    ".content",
    ".post-body",
    "#content",
    ".prose",
  ];

  let contentEl: ReturnType<typeof $> | null = null;
  for (const sel of contentSelectors) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 100) {
      contentEl = el;
      break;
    }
  }

  if (!contentEl) {
    contentEl = $("body");
  }

  const blocks: string[] = [];
  contentEl.find("p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th, figcaption, dt, dd").each((_, el) => {
    const tag = (el as any).tagName?.toLowerCase() || "";
    let text = $(el).text().trim();
    if (!text || text.length < 3) return;

    text = text.replace(/\s+/g, " ");

    if (tag.startsWith("h")) {
      const level = parseInt(tag[1]) || 1;
      blocks.push("#".repeat(level) + " " + text);
    } else if (tag === "blockquote") {
      blocks.push("> " + text);
    } else if (tag === "li") {
      blocks.push("- " + text);
    } else if (tag === "pre") {
      blocks.push("```\n" + text + "\n```");
    } else {
      blocks.push(text);
    }
  });

  const content = blocks
    .filter((b, i, arr) => arr.indexOf(b) === i)
    .join("\n\n")
    .slice(0, 50000);

  return {
    title: title.slice(0, 500),
    description: description.slice(0, 1000),
    content,
    author,
    image,
    siteName,
    publishedDate,
    links: links.slice(0, 50),
    headings: headings.slice(0, 30),
  };
}

router.post("/scraper/extract", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url required" });
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: "Invalid URL — must start with http:// or https://" });
  }

  try {
    const parsed = new URL(url);
    if (isPrivateIp(parsed.hostname)) {
      return res.status(400).json({ error: "Cannot scrape private/local addresses" });
    }
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    if (isSocialMediaUrl(url)) {
      const oembed = await fetchOembed(url);
      if (oembed) {
        return res.json({
          source: "oembed",
          url,
          title: oembed.title || "",
          author: oembed.author_name || "",
          authorUrl: oembed.author_url || "",
          description: oembed.title || "",
          content: oembed.title || "",
          thumbnail: oembed.thumbnail_url || "",
          html: oembed.html || "",
          provider: oembed.provider_name || "",
          providerUrl: oembed.provider_url || "",
          type: oembed.type || "rich",
        });
      }
    }

    const data = await fetchAndParsePage(url);
    return res.json({
      source: "scrape",
      url,
      ...data,
    });
  } catch (err: any) {
    const message = err.message || "Failed to extract content";
    if (message.includes("timeout") || message.includes("abort")) {
      return res.status(408).json({ error: "Request timed out — site may be blocking automated access" });
    }
    return res.status(500).json({ error: message });
  }
});

router.post("/scraper/batch", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { urls } = req.body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "urls array required" });
  }

  if (urls.length > 10) {
    return res.status(400).json({ error: "Maximum 10 URLs per batch" });
  }

  const results = await Promise.allSettled(
    urls.filter((u: string) => isValidUrl(u) && !isPrivateIp(new URL(u).hostname)).map(async (url: string) => {
      try {
        if (isSocialMediaUrl(url)) {
          const oembed = await fetchOembed(url);
          if (oembed) {
            return {
              source: "oembed" as const,
              url,
              title: oembed.title || "",
              author: oembed.author_name || "",
              content: oembed.title || "",
              thumbnail: oembed.thumbnail_url || "",
              provider: oembed.provider_name || "",
            };
          }
        }
        const data = await fetchAndParsePage(url);
        return { source: "scrape" as const, url, ...data };
      } catch (err: any) {
        return { source: "error" as const, url, error: err.message };
      }
    })
  );

  const items = results.map(r => r.status === "fulfilled" ? r.value : { source: "error", error: "failed" });
  return res.json({ results: items });
});

export default router;
