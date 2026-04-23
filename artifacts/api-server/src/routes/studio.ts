import { Router, type IRouter, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImageBuffer, type GptImageSize } from "@workspace/integrations-openai-ai-server/image";
import { db, brandKitTable, filesFoldersTable } from "@workspace/db";
import { eq, and, lt, isNull, isNotNull, sql } from "drizzle-orm";
import type { BrandKit } from "@workspace/db/schema";
import { requireFeature } from "../middlewares/requirePro";
import { ObjectStorageService } from "../lib/objectStorage";
import { generateImage as nanoBananaGenerate, isNanoBananaConfigured, type AspectRatio } from "../lib/nano-banana";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const VALID_IMAGE_SIZES: GptImageSize[] = ["1024x1024", "1024x1536", "1536x1024"];

/**
 * Map a GPT-style WIDTHxHEIGHT size string to a Nano Banana aspect ratio.
 * Pro API only accepts LANDSCAPE | PORTRAIT — square defaults to LANDSCAPE.
 */
function sizeToAspect(size: GptImageSize): AspectRatio {
  if (size === "1024x1536") return "PORTRAIT";
  return "LANDSCAPE";
}

/**
 * Generate an image and return a PNG/JPG Buffer. Prefers Nano Banana Pro when
 * NANO_BANANA_API_KEY is configured (unified art style across the product),
 * falls back to OpenAI gpt-image otherwise.
 */
async function generateStudioImage(prompt: string, size: GptImageSize): Promise<Buffer> {
  if (isNanoBananaConfigured()) {
    const result = await nanoBananaGenerate({
      prompt,
      aspectRatio: sizeToAspect(size),
      resolution: "2K",
      outputFormat: "png",
    });
    if (result.state === "completed" && result.imageUrls.length > 0) {
      const imgRes = await fetch(result.imageUrls[0], { signal: AbortSignal.timeout(30_000) });
      if (!imgRes.ok) throw new Error(`Nano Banana asset fetch failed: ${imgRes.status}`);
      const arr = new Uint8Array(await imgRes.arrayBuffer());
      return Buffer.from(arr);
    }
    // If Nano Banana failed/timed out, fall through to DALL-E so the user still gets art.
    console.warn("[Studio] Nano Banana fell back to OpenAI:", result.state, result.failMsg);
  }
  return generateImageBuffer(prompt, size);
}

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Login required" }); return null; }
  return (req.user as { id: string } | undefined)?.id ?? null;
}

const requireClaw = requireFeature("claw_bot");

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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function saveImageToStorage(userId: string, buffer: Buffer, fileName: string, source: string): Promise<{ fileId: number; objectPath: string } | null> {
  try {
    const uploadURL = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);

    await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: buffer,
      signal: AbortSignal.timeout(30_000),
    });

    const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);

    const [record] = await db.insert(filesFoldersTable).values({
      userId,
      name: fileName,
      isFolder: false,
      objectPath,
      mimeType: "image/png",
      fileSize: buffer.length,
      isLocked: false,
      expiresAt,
      source,
    }).returning();

    return { fileId: record.id, objectPath };
  } catch (err) {
    console.error("[Studio] Failed to save image to storage:", err);
    return null;
  }
}

router.post("/studio/generate-image", requireClaw, async (req: Request, res: Response) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { prompt, size = "1024x1024" } = req.body as { prompt?: string; size?: string };
  if (!prompt?.trim()) { res.status(400).json({ error: "Prompt required" }); return; }

  const imageSize: GptImageSize = VALID_IMAGE_SIZES.includes(size as GptImageSize)
    ? (size as GptImageSize)
    : "1024x1024";

  try {
    const buffer = await generateStudioImage(prompt.trim(), imageSize);
    const base64 = buffer.toString("base64");
    const fileName = `studio-${Date.now()}.png`;
    const saved = await saveImageToStorage(userId, buffer, fileName, "studio");
    res.json({ image: `data:image/png;base64,${base64}`, fileId: saved?.fileId ?? null });
  } catch (err: unknown) {
    console.error("Image generation error:", err);
    const message = err instanceof Error ? err.message : "Image generation failed";
    res.status(500).json({ error: message });
  }
});

router.post("/studio/generate-copy", requireClaw, async (req: Request, res: Response) => {
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

router.post("/studio/generate-social", requireClaw, async (req: Request, res: Response) => {
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

router.post("/studio/writer", requireClaw, async (req: Request, res: Response) => {
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

// ── POST /studio/production ──────────────────────────────────────────────────
router.post("/studio/production", requireClaw, async (req: Request, res: Response) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { mode, prompt, style, aspect = "1024x1024", details } = req.body as {
    mode: string;
    prompt: string;
    style?: string;
    aspect?: string;
    details?: Record<string, string>;
  };

  if (!mode || !prompt?.trim()) { res.status(400).json({ error: "Mode and prompt required" }); return; }

  const kit = await getBrandKit(userId);
  const brandCtx = buildBrandContext(kit);

  const imageSize: GptImageSize = VALID_IMAGE_SIZES.includes(aspect as GptImageSize)
    ? (aspect as GptImageSize)
    : "1024x1024";

  const modePrompts: Record<string, (p: string) => string> = {
    clothing_brand: (p) => `Professional fashion photography product shot: ${p}. ${style ? `Style: ${style}.` : 'High-end fashion editorial style.'} Shot on medium format digital camera, studio lighting with soft key light and rim light, clean backdrop, fabric texture clearly visible, retail-ready composition. Photorealistic, 8K quality, fashion magazine editorial standard.${brandCtx ? ` Brand identity: ${brandCtx}` : ''}`,

    lookbook: (p) => `Fashion lookbook editorial photograph: ${p}. ${style ? `Style: ${style}.` : 'Contemporary streetwear meets high fashion.'} Model wearing the clothing in lifestyle setting, cinematic color grading, natural light mixed with studio fill, shot on 35mm film stock, fashion week backstage energy. Photorealistic, Vogue/GQ editorial quality.${brandCtx ? ` Brand identity: ${brandCtx}` : ''}`,

    billboard: (p) => `Large-format billboard advertisement design: ${p}. ${style ? `Visual style: ${style}.` : 'Bold, minimal, high-impact.'} Ultra high resolution, bold typography space, strong visual hierarchy, readable from distance, outdoor advertising format. Professional advertising agency quality, award-winning OOH campaign style.${brandCtx ? ` Brand identity: ${brandCtx}` : ''}`,

    film_35mm: (p) => `Cinematic 35mm film photograph: ${p}. ${style ? `Film style: ${style}.` : 'Kodak Portra 400 color palette.'} Shot on 35mm analog camera, authentic film grain, natural lens flare, shallow depth of field, golden hour lighting, analog color science. No digital processing artifacts. The look and feel of Wes Anderson meets Wong Kar-wai cinematography.`,

    film_hidef: (p) => `Ultra high definition cinematic photograph: ${p}. ${style ? `Visual style: ${style}.` : 'ARRI ALEXA 65 camera aesthetic.'} 8K resolution clarity, cinematic aspect ratio, professional color grading, volumetric lighting, photorealistic detail in every pixel. The visual quality of a Christopher Nolan IMAX production still.`,

    packaging: (p) => `Premium product packaging design mockup: ${p}. ${style ? `Design style: ${style}.` : 'Minimalist luxury.'} 3D product visualization, studio lighting, photorealistic materials and textures, retail shelf-ready, premium unboxing experience aesthetic.${brandCtx ? ` Brand identity: ${brandCtx}` : ''}`,

    label: (p) => `Professional clothing label and tag design: ${p}. ${style ? `Style: ${style}.` : 'Premium woven label aesthetic.'} Close-up macro photography of fabric label, embroidered or printed tag, authentic textile texture, fashion brand label standard. Photorealistic detail.${brandCtx ? ` Brand identity: ${brandCtx}` : ''}`,

    poster: (p) => `High-impact promotional poster design: ${p}. ${style ? `Visual style: ${style}.` : 'Contemporary graphic design meets fine art.'} Print-ready quality, strong visual composition, bold color palette, typography-integrated design, museum-quality graphic art standard.${brandCtx ? ` Brand identity: ${brandCtx}` : ''}`,
  };

  const promptBuilder = modePrompts[mode] ?? modePrompts.film_hidef;

  try {
    const fullPrompt = promptBuilder(prompt.trim());
    const buffer = await generateStudioImage(fullPrompt, imageSize);
    const base64 = buffer.toString("base64");
    const fileName = `production-${mode}-${Date.now()}.png`;
    const saved = await saveImageToStorage(userId, buffer, fileName, "production");
    res.json({ image: `data:image/png;base64,${base64}`, prompt: fullPrompt, fileId: saved?.fileId ?? null });
  } catch (err: unknown) {
    console.error("Production studio error:", err);
    const message = err instanceof Error ? err.message : "Image generation failed";
    res.status(500).json({ error: message });
  }
});

// ── POST /studio/production-script ──────────────────────────────────────────
router.post("/studio/production-script", requireClaw, async (req: Request, res: Response) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { mode, concept, duration = "30", style, audience } = req.body as {
    mode: string;
    concept: string;
    duration?: string;
    style?: string;
    audience?: string;
  };

  if (!concept?.trim()) { res.status(400).json({ error: "Concept required" }); return; }

  const kit = await getBrandKit(userId);
  const brandCtx = buildBrandContext(kit);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const systemPrompts: Record<string, string> = {
      video_commercial: `You are a world-class commercial director and creative director at a top advertising agency. You create broadcast-quality TV commercial scripts and production plans.

Output format:
## COMMERCIAL SCRIPT: [Title]
**Duration:** ${duration} seconds
**Target Audience:** ${audience || 'General'}
**Visual Style:** ${style || 'Cinematic'}

### PRE-PRODUCTION
- **Concept:** [One-line concept]
- **Mood:** [Emotional tone]
- **Color Palette:** [Key colors]
- **Music Direction:** [Style/temp track reference]

### SHOT LIST
For each shot include: Shot #, Duration, Camera (lens/movement), Description, Audio/VO, Mood
| Shot | Time | Camera | Visual | Audio | Mood |
|------|------|--------|--------|-------|------|

### SCRIPT / VOICEOVER
[Full voiceover script with timing markers]

### STORYBOARD PROMPTS
For each key frame, provide a detailed AI image generation prompt that could recreate the shot.

### POST-PRODUCTION NOTES
- Color grade direction
- VFX requirements
- Sound design notes
- Music cue points`,

      music_video: `You are a visionary music video director known for groundbreaking visual storytelling. Create a complete music video treatment and production plan.

Output a full treatment with: concept overview, visual motifs, shot-by-shot breakdown with camera directions, choreography notes, lighting design, wardrobe/styling direction, location descriptions, VFX/post requirements, and storyboard prompts for key moments.`,

      brand_film: `You are a brand film director specializing in emotionally resonant brand storytelling. Create a brand film script that tells a compelling story while subtly weaving in brand identity.

Include: narrative arc, character descriptions, scene breakdowns with dialogue, camera directions, music/sound design, and storyboard prompts for hero shots.${brandCtx}`,

      social_video: `You are a viral content strategist who understands every social platform's algorithm. Create a ${duration}-second social media video script optimized for maximum engagement.

Include: hook (first 3 seconds), retention strategy, platform-specific formatting notes (vertical/horizontal), trending audio suggestions, text overlay copy, CTA timing, and thumbnail recommendation.`,

      lookbook_video: `You are a fashion film director creating high-end lookbook/campaign videos. Create a detailed production plan for a fashion brand video.

Include: mood/concept statement, model casting direction, styling notes per look, location/set design, lighting setup, camera movements (gimbal/steadicam/crane shots), music direction, edit pacing notes, and color grade references.${brandCtx}`,
    };

    const systemPrompt = systemPrompts[mode] ?? systemPrompts.video_commercial;

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 4000,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Create a complete production plan for: ${concept.trim()}${audience ? `\nTarget audience: ${audience}` : ''}${style ? `\nVisual style: ${style}` : ''}${brandCtx}` },
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err: unknown) {
    console.error("Production script error:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to generate script" })}\n\n`);
  }
  res.end();
});

router.get("/studio/productions", requireClaw, async (req: Request, res: Response) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const rows = await db.select().from(filesFoldersTable)
      .where(and(
        eq(filesFoldersTable.userId, userId),
        eq(filesFoldersTable.isFolder, false),
        sql`${filesFoldersTable.source} IN ('studio', 'production')`,
      ))
      .orderBy(sql`${filesFoldersTable.createdAt} DESC`)
      .limit(50);
    res.json({ items: rows });
  } catch (err) {
    console.error("[Studio] List productions error:", err);
    res.status(500).json({ error: "Failed to list productions" });
  }
});

router.patch("/studio/productions/:id/lock", requireClaw, async (req: Request, res: Response) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = Number(req.params.id);
  const { locked } = req.body as { locked?: boolean };
  if (typeof locked !== "boolean") { res.status(400).json({ error: "locked (boolean) required" }); return; }

  try {
    const updates: Record<string, unknown> = {
      isLocked: locked,
      updatedAt: new Date(),
    };
    if (locked) {
      updates.expiresAt = null;
    } else {
      updates.expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
    }

    const [record] = await db.update(filesFoldersTable).set(updates)
      .where(and(eq(filesFoldersTable.id, id), eq(filesFoldersTable.userId, userId)))
      .returning();
    if (!record) { res.status(404).json({ error: "File not found" }); return; }
    res.json({ item: record });
  } catch (err) {
    console.error("[Studio] Lock toggle error:", err);
    res.status(500).json({ error: "Failed to update lock status" });
  }
});

router.delete("/studio/productions/:id", requireClaw, async (req: Request, res: Response) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = Number(req.params.id);
  try {
    const [item] = await db.select().from(filesFoldersTable)
      .where(and(eq(filesFoldersTable.id, id), eq(filesFoldersTable.userId, userId)));
    if (!item) { res.status(404).json({ error: "File not found" }); return; }
    await db.delete(filesFoldersTable)
      .where(and(eq(filesFoldersTable.id, id), eq(filesFoldersTable.userId, userId)));
    res.json({ ok: true });
  } catch (err) {
    console.error("[Studio] Delete production error:", err);
    res.status(500).json({ error: "Failed to delete production" });
  }
});

async function cleanupExpiredFiles() {
  try {
    const now = new Date();
    const expired = await db.select().from(filesFoldersTable)
      .where(and(
        eq(filesFoldersTable.isLocked, false),
        isNotNull(filesFoldersTable.expiresAt),
        lt(filesFoldersTable.expiresAt, now),
      ));

    if (expired.length === 0) return;

    console.log(`[Cleanup] Removing ${expired.length} expired file(s)...`);

    for (const file of expired) {
      try {
        if (file.objectPath) {
          const objectFile = await objectStorage.getObjectEntityFile(file.objectPath);
          await objectFile.delete();
        }
      } catch {
        // Object may already be gone
      }
      await db.delete(filesFoldersTable).where(eq(filesFoldersTable.id, file.id));
    }

    console.log(`[Cleanup] Removed ${expired.length} expired file(s)`);
  } catch (err) {
    console.error("[Cleanup] Error cleaning expired files:", err);
  }
}

cleanupExpiredFiles();
setInterval(cleanupExpiredFiles, 24 * 60 * 60 * 1000);

export default router;
