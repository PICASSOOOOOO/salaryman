import { Router, type IRouter } from "express";
import { streamWithRouter } from "../lib/ai-router";
import { safeFetch } from "../lib/safe-fetch";

const router: IRouter = Router();

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return "https://" + trimmed;
  return trimmed;
}

async function fetchPageContent(url: string): Promise<{
  html: string;
  title: string;
  metaDescription: string;
  headings: string[];
  images: { src: string; alt: string }[];
  canonicalUrl: string;
  robots: string;
  ogTags: Record<string, string>;
  structuredData: string[];
  wordCount: number;
  textContent: string;
  error?: string;
}> {
  const result = {
    html: "",
    title: "",
    metaDescription: "",
    headings: [] as string[],
    images: [] as { src: string; alt: string }[],
    canonicalUrl: "",
    robots: "",
    ogTags: {} as Record<string, string>,
    structuredData: [] as string[],
    wordCount: 0,
    textContent: "",
  };

  try {
    const response = await safeFetch(url, { timeoutMs: 15000, maxResponseBytes: 5 * 1024 * 1024 });

    if (!response.ok) {
      return { ...result, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { ...result, error: `Unsupported content type: ${contentType}` };
    }

    const html = await response.text();
    result.html = html.slice(0, 50000);

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    result.title = titleMatch?.[1]?.trim() ?? "";

    const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    result.metaDescription = metaDescMatch?.[1]?.trim() ?? "";

    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
      ?? html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
    result.canonicalUrl = canonicalMatch?.[1]?.trim() ?? "";

    const robotsMatch = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["']/i);
    result.robots = robotsMatch?.[1]?.trim() ?? "";

    const ogMatches = [...html.matchAll(/<meta[^>]+property=["'](og:[^"']*)["'][^>]+content=["']([^"']*)["']/gi)];
    for (const m of ogMatches) {
      result.ogTags[m[1]] = m[2];
    }

    const headingMatches = [...html.matchAll(/<h([1-6])[^>]*>([^<]*(?:<(?!\/h[1-6]>)[^<]*)*)<\/h[1-6]>/gi)];
    result.headings = headingMatches.slice(0, 30).map(m => {
      const level = m[1];
      const text = m[2].replace(/<[^>]+>/g, "").trim();
      return `H${level}: ${text}`;
    });

    const imgMatches = [...html.matchAll(/<img[^>]+>/gi)];
    result.images = imgMatches.slice(0, 50).map(m => {
      const srcMatch = m[0].match(/src=["']([^"']*)["']/i);
      const altMatch = m[0].match(/alt=["']([^"']*)["']/i);
      return { src: srcMatch?.[1] ?? "", alt: altMatch?.[1] ?? "" };
    });

    const schemaMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    result.structuredData = schemaMatches.slice(0, 5).map(m => m[1].trim().slice(0, 500));

    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    result.textContent = stripped.slice(0, 5000);
    result.wordCount = stripped.split(/\s+/).filter(Boolean).length;

    return result;
  } catch (err: any) {
    return { ...result, error: err?.message ?? "Failed to fetch URL" };
  }
}

function buildPageSummary(data: Awaited<ReturnType<typeof fetchPageContent>>, url: string): string {
  const lines: string[] = [
    `URL: ${url}`,
    `Title: ${data.title || "(none)"}`,
    `Meta Description: ${data.metaDescription || "(none)"}`,
    `Canonical: ${data.canonicalUrl || "(none)"}`,
    `Robots meta: ${data.robots || "(not set)"}`,
    `Word count: ~${data.wordCount}`,
    `Images found: ${data.images.length}`,
    `Images without alt text: ${data.images.filter(i => !i.alt).length}`,
    "",
    "HEADINGS:",
    ...(data.headings.length ? data.headings : ["(none found)"]),
    "",
    "OPEN GRAPH TAGS:",
    ...(Object.keys(data.ogTags).length
      ? Object.entries(data.ogTags).map(([k, v]) => `${k}: ${v}`)
      : ["(none)"]),
    "",
    "STRUCTURED DATA (JSON-LD):",
    ...(data.structuredData.length ? data.structuredData.map(s => s.slice(0, 200)) : ["(none found)"]),
    "",
    "PAGE TEXT SAMPLE (first 2000 chars):",
    data.textContent.slice(0, 2000),
  ];
  return lines.join("\n");
}

router.post("/seo/audit", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url?.trim()) {
    res.status(400).json({ error: "URL required" });
    return;
  }

  const normalizedUrl = normalizeUrl(url.trim());

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(`data: ${JSON.stringify({ status: "Fetching page..." })}\n\n`);

  const pageData = await fetchPageContent(normalizedUrl);

  if (pageData.error) {
    res.write(`data: ${JSON.stringify({ error: `Failed to fetch page: ${pageData.error}` })}\n\n`);
    res.end();
    return;
  }

  res.write(`data: ${JSON.stringify({ status: "Analyzing SEO..." })}\n\n`);

  const pageSummary = buildPageSummary(pageData, normalizedUrl);

  const systemPrompt = `You are SPIDER-X, an elite SEO audit engine. You analyze websites and produce structured, actionable SEO reports. You are precise, data-driven, and focus on impact. Format your output in clean markdown.`;

  const userMessage = `Perform a comprehensive SEO audit on the following page data. Score each category 0-100 and provide specific, actionable recommendations.

PAGE DATA:
${pageSummary}

Produce a report with these sections:

## OVERALL SEO SCORE: [X/100]

## CRITICAL ISSUES
(List any blockers — missing title, no meta description, noindex, etc.)

## META & ON-PAGE (Score: X/100)
- Title tag analysis (length, keyword placement, CTR potential)
- Meta description (presence, length, compelling factor)
- Canonical tag status
- Robots meta directive

## CONTENT QUALITY (Score: X/100)
- Word count assessment
- Heading structure (H1, H2, H3 hierarchy)
- Content depth signals
- Recommendations

## TECHNICAL SEO (Score: X/100)
- Structured data / Schema markup
- Open Graph tags for social sharing
- Image optimization (alt text coverage)
- Mobile-friendliness signals

## QUICK WINS
(Top 3 highest-impact changes to make right now, ordered by priority)

## NEXT STEPS
(Longer-term improvements to implement over the next 30 days)`;

  try {
    await streamWithRouter(
      [{ role: "user", content: userMessage }],
      systemPrompt,
      { maxTokens: 4096, preferProvider: "claude" },
      (chunk) => {
        if (chunk.agent) res.write(`data: ${JSON.stringify({ agent: chunk.agent })}\n\n`);
        if (chunk.content) res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        if (chunk.done) res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        if (chunk.error) res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`);
      }
    );
  } catch (err) {
    console.error("Error in /seo/audit:", err);
    res.write(`data: ${JSON.stringify({ error: "SEO audit failed. Please try again." })}\n\n`);
  }

  res.end();
});

router.post("/seo/keywords", async (req, res) => {
  const { topic } = req.body as { topic?: string };
  if (!topic?.trim()) {
    res.status(400).json({ error: "Topic required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const systemPrompt = `You are SPIDER-X, an elite SEO keyword research engine. You produce structured, strategic keyword plans that help content teams rank. You understand search intent deeply and prioritize keywords by business impact. Format your output in clean markdown.`;

  const userMessage = `Perform comprehensive keyword research for: "${topic.trim()}"

Produce a strategic keyword report with these sections:

## PRIMARY KEYWORDS
(3-5 high-value head terms — direct match to the topic)
For each: keyword | search intent | estimated difficulty (Low/Med/High) | content angle

## SECONDARY KEYWORDS
(8-10 closely related terms to support the primary)
For each: keyword | intent | difficulty

## LONG-TAIL KEYWORDS
(10-15 specific, lower-competition phrases)
For each: keyword | why it converts | content format that works best (blog, FAQ, landing page, etc.)

## SEARCH INTENT BREAKDOWN
- Informational keywords (for top-of-funnel content)
- Commercial/Navigational keywords (mid-funnel)
- Transactional keywords (bottom-of-funnel, highest conversion)

## CONTENT ANGLE SUGGESTIONS
(5 specific article/page ideas based on the keyword landscape with a hook for each)

## SEMANTIC TERMS TO INCLUDE
(LSI and related terms to weave into content for topical authority)

## COMPETITOR GAPS
(Types of content or angles that are likely underserved based on this topic space)`;

  try {
    await streamWithRouter(
      [{ role: "user", content: userMessage }],
      systemPrompt,
      { maxTokens: 4096 },
      (chunk) => {
        if (chunk.agent) res.write(`data: ${JSON.stringify({ agent: chunk.agent })}\n\n`);
        if (chunk.content) res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        if (chunk.done) res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        if (chunk.error) res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`);
      }
    );
  } catch (err) {
    console.error("Error in /seo/keywords:", err);
    res.write(`data: ${JSON.stringify({ error: "Keyword research failed. Please try again." })}\n\n`);
  }

  res.end();
});

router.post("/seo/optimize", async (req, res) => {
  const { content, keyword } = req.body as { content?: string; keyword?: string };
  if (!content?.trim() || !keyword?.trim()) {
    res.status(400).json({ error: "Content and target keyword required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const wordCount = content.trim().split(/\s+/).length;
  const keywordCount = (content.toLowerCase().match(new RegExp(keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  const density = wordCount > 0 ? ((keywordCount / wordCount) * 100).toFixed(2) : "0";

  const systemPrompt = `You are SPIDER-X, an elite SEO content optimizer. You analyze and improve content to rank for target keywords while maintaining natural readability. Format your output in clean markdown.`;

  const userMessage = `Optimize the following content for the target keyword: "${keyword.trim()}"

CURRENT CONTENT STATS:
- Word count: ${wordCount}
- Keyword occurrences: ${keywordCount}
- Keyword density: ${density}%

CONTENT TO OPTIMIZE:
${content.trim().slice(0, 8000)}

Produce a full optimization report:

## CONTENT ANALYSIS

### Current Score: [X/100]
- Keyword density assessment (ideal: 1-2%)
- Readability grade
- Structure evaluation
- Missing SEO elements

### Key Issues Found
(Bullet list of what's hurting this content's rankings)

## META SUGGESTIONS

**Optimized Title Tag** (50-60 chars, keyword near front):
[title]

**Meta Description** (150-160 chars, includes keyword + CTA):
[description]

**Suggested URL Slug:**
[slug]

## HEADING STRUCTURE SUGGESTIONS
(Recommended H1, H2, H3 hierarchy with the keyword and semantic terms)

## CONTENT OPTIMIZATIONS

### Keyword Placement
(Specific recommendations for where to add/move the target keyword)

### Semantic Terms to Add
(LSI keywords and related phrases to include for topical depth)

### Readability Improvements
(Sentence length, paragraph structure, formatting suggestions)

### Content Gaps
(What this content is missing compared to what ranks for this keyword)

## TRACKED CHANGES — BEFORE & AFTER
Show 2-3 specific sentence/paragraph rewrites with this format:

**BEFORE:**
> [original text]

**AFTER:**
> [optimized version]

**What changed:** [1-sentence explanation of the SEO improvement made]

(Repeat for each major change. Focus on keyword placement, opening hook, and meta-relevant content.)`;

  try {
    await streamWithRouter(
      [{ role: "user", content: userMessage }],
      systemPrompt,
      { maxTokens: 4096, preferProvider: "claude" },
      (chunk) => {
        if (chunk.agent) res.write(`data: ${JSON.stringify({ agent: chunk.agent })}\n\n`);
        if (chunk.content) res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        if (chunk.done) res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        if (chunk.error) res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`);
      }
    );
  } catch (err) {
    console.error("Error in /seo/optimize:", err);
    res.write(`data: ${JSON.stringify({ error: "Content optimization failed. Please try again." })}\n\n`);
  }

  res.end();
});

router.post("/seo/competitor", async (req, res) => {
  const { yourUrl, competitorUrls } = req.body as { yourUrl?: string; competitorUrls?: string[] };
  if (!yourUrl?.trim() || !Array.isArray(competitorUrls) || competitorUrls.length === 0) {
    res.status(400).json({ error: "Your URL and at least one competitor URL required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const yourNorm = normalizeUrl(yourUrl.trim());
  const compNorm = competitorUrls.slice(0, 3).map(u => normalizeUrl(u.trim()));

  res.write(`data: ${JSON.stringify({ status: "Fetching pages for comparison..." })}\n\n`);

  const [yourData, ...compData] = await Promise.all([
    fetchPageContent(yourNorm),
    ...compNorm.map(u => fetchPageContent(u)),
  ]);

  if (yourData.error) {
    res.write(`data: ${JSON.stringify({ error: `Could not fetch your site: ${yourData.error}` })}\n\n`);
    res.end();
    return;
  }

  const successfulComps = compData.filter(d => !d.error);
  if (successfulComps.length === 0) {
    const firstError = compData[0]?.error ?? "unknown error";
    res.write(`data: ${JSON.stringify({ error: `Could not fetch any competitor pages. First error: ${firstError}` })}\n\n`);
    res.end();
    return;
  }

  const fetchDiagnostics = compData.map((d, i) =>
    d.error ? `COMPETITOR ${i + 1} (${compNorm[i]}): FETCH FAILED — ${d.error}` : null
  ).filter(Boolean);

  if (fetchDiagnostics.length > 0) {
    res.write(`data: ${JSON.stringify({ status: `Note: ${fetchDiagnostics.join("; ")}. Proceeding with available data.` })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ status: "Running competitive analysis..." })}\n\n`);

  const yourSummary = buildPageSummary(yourData, yourNorm);
  const compSummaries = compData.map((d, i) => {
    if (d.error) {
      return `--- COMPETITOR ${i + 1}: ${compNorm[i]} ---\nFETCH FAILED: ${d.error}\n(Unable to analyze this competitor page)`;
    }
    return `--- COMPETITOR ${i + 1}: ${compNorm[i]} ---\n${buildPageSummary(d, compNorm[i])}`;
  }).join("\n\n");

  const systemPrompt = `You are SPIDER-X, an elite competitive SEO analyst. You compare websites and identify strategic gaps and opportunities. Format your output in clean, structured markdown.`;

  const userMessage = `Perform a competitive SEO analysis. Compare the target site against its competitors and identify gaps and opportunities.

YOUR SITE:
${yourSummary}

COMPETITORS:
${compSummaries}

Produce a competitive analysis report:

## COMPETITIVE OVERVIEW

| Metric | Your Site | ${compNorm.map((_, i) => `Competitor ${i + 1}`).join(" | ")} |
|--------|-----------|${compNorm.map(() => "-----------|").join("")}
(Fill in: Title present, Meta desc, Word count, Headings, Images w/alt, Schema, OG tags)

## WHERE COMPETITORS ARE WINNING
(Specific SEO elements where competitors outperform your site)

## YOUR ADVANTAGES
(Where your site is ahead or equal — preserve these)

## CONTENT GAPS
(Topics, angles, or content depth your competitors cover that you're missing)

## STRUCTURAL ADVANTAGES TO COPY
(Technical SEO patterns competitors use that you should adopt)

## KEYWORD OPPORTUNITIES
(Based on competitor titles and headings, what keywords are they targeting that you're not? What should you target?)

## PRIORITY ACTION PLAN
Rank these from highest to lowest impact:
1. [Most critical gap to close]
2. [Second priority]
3. [Third priority]
4. [Fourth priority]
5. [Fifth priority]

## 30-DAY BATTLE PLAN
(Specific, week-by-week actions to close the gap and overtake competitors in search)`;

  try {
    await streamWithRouter(
      [{ role: "user", content: userMessage }],
      systemPrompt,
      { maxTokens: 4096, preferProvider: "claude" },
      (chunk) => {
        if (chunk.agent) res.write(`data: ${JSON.stringify({ agent: chunk.agent })}\n\n`);
        if (chunk.content) res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        if (chunk.done) res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        if (chunk.error) res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`);
      }
    );
  } catch (err) {
    console.error("Error in /seo/competitor:", err);
    res.write(`data: ${JSON.stringify({ error: "Competitor analysis failed. Please try again." })}\n\n`);
  }

  res.end();
});

export default router;
