import { Router, type IRouter, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImageBuffer, type GptImageSize } from "@workspace/integrations-openai-ai-server/image";
import { db, brandKitTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { BrandKit } from "@workspace/db/schema";

const router: IRouter = Router();

const VALID_IMAGE_SIZES: GptImageSize[] = ["1024x1024", "1024x1536", "1536x1024"];

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Login required" }); return null; }
  return (req.user as { id: string } | undefined)?.id ?? null;
}

async function getBrandKit(userId: string): Promise<BrandKit | null> {
  const [kit] = await db.select().from(brandKitTable).where(eq(brandKitTable.userId, userId));
  return kit ?? null;
}

function buildBrandContext(kit: BrandKit | null): string {
  if (!kit) return "";
  const parts: string[] = [];
  if (kit.companyName) parts.push(`Company: ${kit.companyName}`);
  if (kit.industry) parts.push(`Industry: ${kit.industry}`);
  if (kit.tagline) parts.push(`Tagline: "${kit.tagline}"`);
  if (kit.mission) parts.push(`Mission: ${kit.mission}`);
  if (kit.targetAudience) parts.push(`Target audience: ${kit.targetAudience}`);
  if (kit.website) parts.push(`Website: ${kit.website}`);
  if (kit.primaryColor) parts.push(`Primary brand color: ${kit.primaryColor}`);
  if (kit.secondaryColor) parts.push(`Secondary brand color: ${kit.secondaryColor}`);
  if (kit.logoUrl) parts.push(`Logo URL: ${kit.logoUrl}`);
  if (parts.length === 0) return "";
  return `\n\nBrand context:\n${parts.join("\n")}`;
}

router.post("/studio/generate-image", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { prompt, size = "1024x1024" } = req.body as { prompt?: string; size?: string };
  if (!prompt?.trim()) { res.status(400).json({ error: "Prompt required" }); return; }

  const imageSize: GptImageSize = VALID_IMAGE_SIZES.includes(size as GptImageSize)
    ? (size as GptImageSize)
    : "1024x1024";

  try {
    const buffer = await generateImageBuffer(prompt.trim(), imageSize);
    const base64 = buffer.toString("base64");
    res.json({ image: `data:image/png;base64,${base64}` });
  } catch (err: unknown) {
    console.error("Image generation error:", err);
    const message = err instanceof Error ? err.message : "Image generation failed";
    res.status(500).json({ error: message });
  }
});

router.post("/studio/generate-copy", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { type, tone = "professional", context = "", platform } = req.body as {
    type?: string; tone?: string; context?: string; platform?: string;
  };

  if (!type) { res.status(400).json({ error: "Content type required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const kit = await getBrandKit(userId);
    const brandCtx = buildBrandContext(kit);

    const typePrompts: Record<string, string> = {
      tagline: `Write 5 punchy tagline options for this brand. Each tagline should be 3-8 words, memorable, and convey the core value proposition. Tone: ${tone}.${brandCtx}\n${context ? `\nAdditional context: ${context}` : ""}

Format each as:
• [tagline]

Add a one-line explanation for each.`,

      email: `Write a complete marketing email for this brand. Include: subject line, preview text, greeting, body (3 paragraphs), CTA, and sign-off. Tone: ${tone}.${brandCtx}\n${context ? `\nCampaign goal: ${context}` : ""}`,

      blog: `Write a compelling blog post introduction (300-400 words) that hooks readers immediately. Include a working title, subheading, and the intro paragraphs. Tone: ${tone}.${brandCtx}\n${context ? `\nTopic: ${context}` : ""}`,

      ad: `Write 3 ad copy variations for this brand. Each variation should include: headline (max 8 words), body copy (2-3 sentences), and CTA (max 5 words). Tone: ${tone}.${brandCtx}\n${context ? `\nAd goal: ${context}` : ""}

Label each as Variation A, B, C.`,

      social: `Write a social media post for ${platform ?? "LinkedIn"}. Include the main post text (max 280 words), 5 relevant hashtags, and an optional emoji suggestion. Tone: ${tone}.${brandCtx}\n${context ? `\nPost topic: ${context}` : ""}`,

      pitch: `Write a 30-second elevator pitch for this brand. It should be conversational, mention the problem solved, target audience, and unique advantage. Tone: ${tone}.${brandCtx}\n${context ? `\nAudience: ${context}` : ""}`,
    };

    const userPrompt = typePrompts[type] ?? typePrompts.ad;

    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `You are Pablo, an expert marketing and brand copywriter for startups. You write compelling, on-brand content that converts. You match the specified tone perfectly and always tailor your output to the brand's identity and target audience. If brand context is provided, use it naturally — don't just repeat it verbatim.`,
        },
        { role: "user", content: userPrompt },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err: unknown) {
    console.error("Copy generation error:", err);
    const message = err instanceof Error ? err.message : "Failed to generate copy";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  }

  res.end();
});

router.post("/studio/generate-social", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { template, topic = "" } = req.body as { template?: string; topic?: string };

  if (!template) { res.status(400).json({ error: "Template required" }); return; }

  try {
    const kit = await getBrandKit(userId);
    const brandCtx = buildBrandContext(kit);

    const templates: Record<string, string> = {
      instagram_square: `Create an Instagram post for a 1:1 square image format.\n\nReturn a JSON object with these fields:\n- caption: Main post caption (max 2200 chars, engaging, with line breaks)\n- hashtags: Array of 20-30 relevant hashtags (strings without #)\n- cta: Call to action text (max 10 words)\n- image_prompt: A detailed DALL-E image generation prompt for an on-brand Instagram visual (incorporate the brand colors into the style description)\n- alt_text: Image alt text for accessibility${brandCtx}${topic ? `\n\nPost topic: ${topic}` : ""}`,

      twitter_card: `Create a Twitter/X post optimized for maximum engagement.\n\nReturn a JSON object with these fields:\n- tweet: Main tweet text (max 280 chars, punchy, no hashtags in body)\n- hashtags: Array of 2-3 hashtags (strings without #)\n- image_prompt: A detailed DALL-E image generation prompt for a 2:1 landscape Twitter card image (incorporate the brand colors into the style description)${brandCtx}${topic ? `\n\nPost topic: ${topic}` : ""}`,

      linkedin_banner: `Create a LinkedIn thought leadership post.\n\nReturn a JSON object with these fields:\n- post: Main post body (max 700 chars, professional, value-driven, with emojis sparingly)\n- hook: Opening sentence that stops the scroll (max 15 words)\n- hashtags: Array of 5 professional hashtags (strings without #)\n- image_prompt: A detailed DALL-E image generation prompt for a professional LinkedIn banner (1.91:1 landscape, clean, corporate style, incorporate the brand colors into the style description)${brandCtx}${topic ? `\n\nPost topic: ${topic}` : ""}`,

      tiktok_vertical: `Create a TikTok post optimized for maximum virality and short-form video engagement.\n\nReturn a JSON object with these fields:\n- hook: Opening hook text that grabs attention in the first 2 seconds (max 15 words, punchy, curiosity-driven)\n- description: Video description/caption (max 300 chars, engaging, with line breaks)\n- hashtags: Array of 10-15 trending and relevant hashtags (strings without #)\n- image_prompt: A detailed DALL-E image generation prompt for a 9:16 vertical thumbnail/cover image (bold, eye-catching, designed for mobile screens, incorporate the brand colors into the style description)${brandCtx}${topic ? `\n\nPost topic: ${topic}` : ""}`,

      facebook_feed: `Create a Facebook feed post optimized for engagement and sharing.\n\nReturn a JSON object with these fields:\n- post: Main post text (max 500 chars, conversational, relatable, with emojis)\n- hook: Opening line that stops the scroll (max 15 words)\n- hashtags: Array of 5-8 relevant hashtags (strings without #)\n- cta: Call to action text encouraging comments or shares (max 15 words)\n- image_prompt: A detailed DALL-E image generation prompt for a Facebook feed image (1.91:1 landscape or square, vibrant, shareable, incorporate the brand colors into the style description)${brandCtx}${topic ? `\n\nPost topic: ${topic}` : ""}`,
    };

    const userPrompt = templates[template];
    if (!userPrompt) { res.status(400).json({ error: "Invalid template" }); return; }

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `You are Pablo, an expert social media strategist for startups. You create viral, on-brand social media content. Always respond with valid JSON only — no markdown fences, no extra text.`,
        },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      res.json(parsed);
    } catch {
      res.json({ raw });
    }
  } catch (err: unknown) {
    console.error("Social generation error:", err);
    const message = err instanceof Error ? err.message : "Failed to generate social content";
    res.status(500).json({ error: message });
  }
});

router.post("/studio/writer", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const {
    action, genre = 'fiction', tone = 'literary',
    title = '', synopsis = '', chapterTitle = '',
    chapterContent = '', chapterNotes = '', context = '',
  } = req.body as Record<string, string>;

  if (!action) { res.status(400).json({ error: "Action required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const kit = await getBrandKit(userId);
    const brandCtx = buildBrandContext(kit);

    const projectCtx = [
      title && `Title: "${title}"`,
      `Genre: ${genre}`,
      `Tone: ${tone}`,
      synopsis && `Synopsis: ${synopsis}`,
      chapterTitle && `Current chapter: ${chapterTitle}`,
      chapterNotes && `Author's notes for this chapter: ${chapterNotes}`,
      context && `Additional direction: ${context}`,
    ].filter(Boolean).join('\n');

    const contentCtx = chapterContent.trim()
      ? `\n\nCurrent chapter content (${chapterContent.split(/\s+/).length} words so far):\n---\n${chapterContent.slice(-6000)}\n---`
      : '';

    const actionPrompts: Record<string, string> = {
      outline: `Create a detailed chapter-by-chapter outline for this work. For each chapter, include: chapter number, title suggestion, a 2-3 sentence summary of what happens, and key character/theme developments. Suggest 8-15 chapters.

${projectCtx}`,

      write_section: `Write the next section of this chapter (800-1500 words). Write with full creative depth — vivid imagery, authentic dialogue, emotional resonance. Do NOT summarize or skip ahead. Show, don't tell. Every sentence should earn its place.

${projectCtx}${contentCtx}`,

      continue: `Continue writing exactly where the text left off. Write 600-1200 words. Maintain the exact same voice, pacing, and style. Do not repeat what was already written. Pick up mid-scene if needed. Write with full creative commitment.

${projectCtx}${contentCtx}`,

      rewrite: `Rewrite the current chapter content with improved prose, sharper dialogue, and deeper character work. Maintain the same plot points and story beats but elevate the writing quality. Same length or slightly longer.

${projectCtx}${contentCtx}`,

      expand: `Expand and deepen the current text. Add sensory details, internal monologue, environmental description, subtext in dialogue, and emotional complexity. Double the depth without changing the story direction. Add 400-800 words of enrichment woven into the existing text.

${projectCtx}${contentCtx}`,

      critique: `Provide a detailed editorial critique of this chapter. Cover:
1. PROSE QUALITY — sentence-level craft, word choice, rhythm
2. PACING — does it move well? Where does it drag or rush?
3. CHARACTER — are voices distinct? Motivations clear?
4. DIALOGUE — natural? Purposeful? Subtext?
5. STRUCTURE — does the chapter arc work?
6. SPECIFIC LINE EDITS — quote 3-5 specific passages and suggest improvements

Be honest but constructive. This is a working draft, not a finished piece.

${projectCtx}${contentCtx}`,
    };

    const userPrompt = actionPrompts[action] ?? actionPrompts.write_section;

    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8000,
      messages: [
        {
          role: "system",
          content: `You are Pablo, a world-class creative writer and editor. You write with the depth of literary fiction, the pacing of a thriller, and the emotional truth of memoir. You are NOT a corporate copywriter — you are a novelist, poet, and storyteller.

Your writing is:
- Vivid and sensory — readers should feel, smell, hear the world
- Character-driven — every character has a distinct voice and inner life
- Structurally intentional — every scene serves the larger story
- Emotionally honest — you don't shy from complexity or discomfort
- Genre-appropriate — you adapt your style to match ${genre} conventions while maintaining craft

You match the requested tone: ${tone}. You write complete, polished prose — never outlines or summaries unless specifically asked. You never use placeholder text or "[continue here]" markers.${brandCtx}`,
        },
        { role: "user", content: userPrompt },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err: unknown) {
    console.error("Writer generation error:", err);
    const message = err instanceof Error ? err.message : "Failed to generate content";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  }

  res.end();
});

export default router;
