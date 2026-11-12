import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";
import { generateImageBuffer, type GptImageSize } from "@workspace/integrations-openai-ai-server/image";
import { db, brandKitTable, filesFoldersTable } from "@workspace/db";
import { eq, and, lt, isNull, isNotNull, sql } from "drizzle-orm";
import type { BrandKit } from "@workspace/db/schema";
import { requireFeature } from "../middlewares/requirePro";
import { ObjectStorageService } from "../lib/objectStorage";
import { generateImage as nanoBananaGenerate, isNanoBananaConfigured, type AspectRatio } from "../lib/nano-banana";
import { createVideoJob, getVideoJob, VideoCapError, type VideoOrientation } from "../lib/video-maker";
import { createReadStream } from "node:fs";

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
 * TASTE — anti-slop art direction (always on for generated imagery).
 *
 * Visual counterpart to the writer's ANTI-SLOP prose rules. Pushes generated
 * images away from the generic "AI stock" look toward intentional, editorial
 * composition. Appended to every image prompt via applyTaste().
 */
const TASTE_DIRECTION =
  "Art direction (strict): intentional composition with one clear focal point and deliberate use of negative space. Strong visual hierarchy, confident framing — avoid dead-centered, perfectly symmetrical compositions. Cohesive, restrained palette (2-3 dominant tones), not rainbow over-saturation. Believable physically-based lighting and real material texture, not plastic HDR glow or fake heavy bokeh. No clutter, no busy backgrounds, no generic stock-photo staging, no watermarks, no garbled text or logos. Premium, editorial, art-directed feel over default AI gloss.";

function applyTaste(prompt: string): string {
  return `${prompt} ${TASTE_DIRECTION}`;
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
      model: getOpenAiTextModel(),
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
      model: getOpenAiTextModel(),
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
  const body = req.body as Record<string, unknown>;
  const str = (v: unknown, dflt = ''): string => typeof v === 'string' ? v : dflt;
  const action        = str(body.action);
  const genre         = str(body.genre, 'fiction');
  const tone          = str(body.tone,  'literary');
  const title         = str(body.title);
  const synopsis      = str(body.synopsis);
  const chapterTitle  = str(body.chapterTitle);
  const chapterContent= str(body.chapterContent);
  const chapterNotes  = str(body.chapterNotes);
  const context       = str(body.context);
  const timeSignature = str(body.timeSignature, '4/4');
  const bpm           = Math.max(40, Math.min(220, Number(body.bpm)         || 90));
  const linesPerBar   = Math.max(1,  Math.min(8,   Number(body.linesPerBar) || 4));

  if (!action) { res.status(400).json({ error: "Action required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const kit = await getBrandKit(userId);
    const brandCtx = buildBrandContext(kit);

    const isMusicGenre = genre === 'rap' || genre === 'song';
    // Map BPM into a tempo bucket Pablo can reason about. These are the
    // bands real producers/songwriters use as references — anything below
    // 70 reads as ballad/halftime, 70-95 is boom-bap rap/soul, 95-115 is
    // pop/dancehall/R&B, 115-135 is house/disco/uptempo pop, 135+ is
    // drum & bass / footwork / aggressive trap-on-double-time.
    const tempoBand =
      bpm < 70  ? 'BALLAD / HALFTIME (sparse syllable density, long held notes, lots of breath)' :
      bpm < 95  ? 'BOOM-BAP / SOUL / OLD-SCHOOL HIP-HOP (4 strong bars, mid-density bars 8-14 syllables)' :
      bpm < 115 ? 'POP / DANCEHALL / MID-TEMPO R&B (catchy 4-bar hook structures, conversational verse density)' :
      bpm < 135 ? 'UPTEMPO POP / DISCO / HOUSE-ADJACENT (driving 4-on-the-floor energy, tighter syllable count)' :
                  'DRUM&BASS / FOOTWORK / TRAP-DOUBLE-TIME (16ths dominate, machine-gun delivery 18-26 syllables/bar)';

    const projectCtx = [
      title && `Title: "${title}"`,
      `Genre: ${genre}`,
      `Tone: ${tone}`,
      synopsis && `Synopsis: ${synopsis}`,
      chapterTitle && `Current chapter: ${chapterTitle}`,
      chapterNotes && `Author's notes for this chapter: ${chapterNotes}`,
      context && `Additional direction: ${context}`,
      isMusicGenre && `Time signature: ${timeSignature}`,
      isMusicGenre && `Tempo: ${bpm} BPM — ${tempoBand}`,
      isMusicGenre && `Bar length: ${linesPerBar} lines per bar`,
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

    // ===========================================================
    // SONGWRITING KNOWLEDGE BLOCK
    // Injected into Pablo's system prompt for rap/song projects.
    // This is the deep working knowledge a session songwriter brings:
    //   - song forms (verse/pre/chorus/bridge/outro and their roles)
    //   - tempo-aware syllable density / pocket placement
    //   - time-signature meter math (4/4, 3/4, 6/8, 5/4, 7/8 — what each
    //     gives you and how to phrase to it)
    //   - sub-genre conventions (boom-bap, trap, drill, R&B, country,
    //     pop, indie, EDM topline, soul/gospel, ballad)
    //   - rhyme craft (perfect, slant, multi, internal, chain, mosaic)
    //   - pocket / flow / cadence and the 1/2/3/4 backbeat
    //   - hook-first writing, prosody, vowel placement on the strong beat
    //   - structural rules: 16-bar verse, 8-bar pre, 8-bar hook, 4-bar tag
    //   - CRITICAL: never break the bar count the user set; if asked for
    //     "16 bars" deliver exactly 16 bars (16 / linesPerBar lines).
    // Keep it specific. Pablo should read like a real co-writer, not a
    // wikipedia summary.
    // ===========================================================
    const songwritingKnowledge = `

=== SONGWRITING CRAFT — APPLY THESE RULES ===

# TIME SIGNATURE: ${timeSignature}
${
  timeSignature === '3/4' ?
`- 3/4 (waltz / country waltz / Tennessee waltz / Norah Jones "Don't Know Why" feel).
- THREE quarter-note beats per bar; the strong pulse is on beat 1 only.
- Phrase in 3s and 6s, NOT 4s. Two-bar phrases feel like a dancer's "1-2-3, 2-2-3".
- Lyrics: vowel on beat 1 of every bar; weak syllables fall on 2 & 3.
- Common pitfall: writing 4-bar pop phrases that overshoot — keep lines short.
- Reference: country ballad ("Tennessee Waltz"), folk waltz, jazz ("My Favorite Things").`
  : timeSignature === '6/8' ?
`- 6/8 (compound duple — gospel ballad, Irish jig, "House of the Rising Sun", power ballad).
- TWO main pulses per bar, each subdivided into 3 eighths. Feels like 1-and-a 2-and-a.
- Use triplet feel internally. Long-short-short ("DAH-da-da DAH-da-da") is the natural meter.
- Great for emotive vocal lines — let words breathe across the dotted-quarter pulse.
- Reference: Adele "Make You Feel My Love", Animals "House of the Rising Sun", gospel.`
  : timeSignature === '5/4' ?
`- 5/4 (asymmetric — Dave Brubeck "Take Five", Radiohead "15 Step", Mission Impossible).
- FIVE quarter-notes; usually grouped 3+2 or 2+3. Decide which and stick to it.
- Lyric trick: write 3 strong syllables then 2 (or vice versa) per bar to lock the grouping.
- Tense, off-balance feeling — exploit it for narrative tension or psychological lyrics.`
  : timeSignature === '7/8' ?
`- 7/8 (Balkan/prog — usually 2+2+3 or 3+2+2, "Money" by Pink Floyd is 7/4).
- SEVEN eighths per bar. Each bar must clearly land its grouping or listeners get lost.
- Repeat a memorable rhythmic motif — the meter is the hook.
- Use shorter, punchier syllables; long held notes get unwieldy.`
  :
`- 4/4 (common time — 99% of pop, rap, rock, R&B, country, EDM, gospel).
- FOUR quarter-notes per bar; the BACKBEAT is on 2 and 4 (snare hits).
- Place strong-stress syllables (and rhymes) on beats 1, 2, 3, 4 — especially on the 4 going into the next bar's 1 ("the bar turn").
- Multi-syllabic rhymes feel best landing chains of stresses across beats 2-3-4.
- Hooks usually live in 2-bar or 4-bar phrases that LOOP — write the hook so it survives infinite repetition.`
}

# TEMPO BAND ACTION PLAN — ${bpm} BPM
${
  bpm < 70 ?
`- BALLAD / HALFTIME zone. Sing each syllable. Aim 4-7 syllables per bar.
- Long vowels on beats 1 and 3. Use silence — don't fill every beat.
- Examples: Sam Smith "Stay With Me" (~84 felt as halftime), Adele ballads, slow R&B.`
  : bpm < 95 ?
`- BOOM-BAP / SOUL / CLASSIC HIP-HOP. Aim 8-14 syllables per bar.
- Land the rhyme on beat 4 (or beats 2 AND 4 for double-rhymes).
- Pocket: slightly behind the beat for that "leaned-back" Nas/Mos Def feel.
- Examples: Nas, Mos Def, J. Cole, classic D'Angelo neo-soul.`
  : bpm < 115 ?
`- POP / DANCEHALL / MID-TEMPO R&B. Aim 10-16 syllables per bar.
- Hook lands every 4 bars; pre-chorus lifts via a melodic and lyric reach.
- Internal rhymes mid-bar add motion. Conversational diction.
- Examples: Drake mid-tempo, Bruno Mars, Dua Lipa, modern Top-40.`
  : bpm < 135 ?
`- UPTEMPO POP / DISCO / FOUR-ON-THE-FLOOR. Aim 12-18 syllables per bar.
- Vocals ride ABOVE the kick — short consonant-heavy words on the off-beats.
- Avoid long-vowel ballad phrasing; it drags. Punchy, percussive lyrics.
- Examples: ABBA, Daft Punk, Calvin Harris, Doja Cat uptempos.`
  :
`- DRUM&BASS / FOOTWORK / TRAP-DOUBLE-TIME. Aim 18-26 syllables per bar.
- Triplet flows (six syllables per beat) and 16th-note machine-gun delivery.
- Most rappers write to the HALFTIME (~half-tempo) feel, then double up for impact.
- Examples: Migos triplet flow, Future, Travis Scott double-time, jungle MCs.`
}

# SUB-GENRE PLAYBOOK — ${genre.toUpperCase()} / ${tone}
${
  genre === 'rap' ?
`Choose a school based on tone:
- BOOM-BAP (literary/conversational/gritty): 4 bars per phrase, AABB or ABAB rhyme, story-driven, internal multi-rhymes (Big Pun, Eminem, Nas, MF DOOM).
- TRAP (gritty/minimalist/dramatic): triplet flows, ad-libs in parentheses (Yeah! Skrrt!), repeated tag lines, hook-heavy 8-bar verses.
- DRILL (gritty/dramatic): 8-bar verses, sliding 808s, terse aggressive bars, double-time on the back half.
- CONSCIOUS / JAZZ-RAP (literary/lyrical): extended metaphors, allusion, sophisticated vocabulary, longer 16-bar verses.
- MELODIC RAP / RAGE (lyrical/dramatic): sung hooks, repetition is power, simpler diction with emotional spikes.
RHYME CRAFT (mandatory toolset):
- Multi-syllable: rhyme groups of 2-4 syllables ("rapid fire" / "national tire").
- Slant rhyme: same vowel, different consonants ("city" / "dizzy").
- Internal rhyme: rhyme inside the bar, not just at the end.
- Chain rhyme: same rhyme sound across 4-8 consecutive bars (Eminem "Lose Yourself").
- Mosaic rhyme: phrase rhymes phrase ("get along" / "wedding song").
Write VERSES of exactly the bar count requested (default 16). End each line with a rhyme-pair partner the next line will resolve.`
  : genre === 'song' ?
`Choose a topline school based on tone:
- POP (conversational/lyrical): structure VERSE-PRECHORUS-CHORUS-VERSE-PRECHORUS-CHORUS-BRIDGE-CHORUS. The chorus title = the song title, repeated 2-4 times. Hook starts within the first 30 seconds.
- COUNTRY (conversational/dramatic): verse tells a STORY with concrete nouns (truck, river, kitchen light). Chorus delivers the emotional turn. Bridge re-frames the title.
- R&B / SOUL (lyrical/literary): melismatic vowels — favor long open vowels (oh, ah, ee) on held notes. Sensual specificity. Sparser word count, bigger melodic gestures.
- INDIE / ALT (literary/minimalist): unusual imagery, broken rhyme schemes, surprise structural shifts (verse may be longer than chorus). Reward repeat listens.
- FOLK (literary/lyrical): tight rhyme scheme (often AABB), narrative arc across 3-4 verses, often no bridge — the final verse IS the resolution.
- EDM TOPLINE (minimalist/dramatic): SHORT phrases (3-5 words), high repetition, leaves space for the drop. The hook IS the lyric.
- GOSPEL / WORSHIP (dramatic/literary): call-and-response, building repetition (3 ascensions of the same line), turnaround at the bridge, 2nd-person addressing the divine.
PROSODY RULES (mandatory):
- The MOST IMPORTANT WORD in every line must land on the strongest beat (1 or 3 in 4/4).
- Long-vowel words (open mouth: love, soul, time, home) for held notes; short-vowel for percussive moments.
- Rhyme scheme should be CONSISTENT within a section but can SHIFT between sections.
SECTION LENGTHS (typical):
- Verse: 8 or 16 bars · Pre-chorus: 4 or 8 · Chorus: 8 or 16 · Bridge: 4 or 8 · Outro: 4-8.`
  : ''
}

# OUTPUT FORMAT FOR LYRICS
- Label every section in [BRACKETS]: [VERSE 1], [PRE-CHORUS], [CHORUS], [VERSE 2], [BRIDGE], [HOOK], [OUTRO], [TAG], [AD-LIB].
- One LINE = one lyrical line (the editor counts ${linesPerBar} lines as one bar).
- If you write a 16-bar verse, output exactly ${16 * linesPerBar} lines under [VERSE].
- Optional bracketed performance cues at line end: (whispered), (yeah), (echo), (harmony up an octave).
- DO NOT add chord charts or musical notation — lyrics only.
- DO NOT explain or annotate after the lyric — just deliver it. If the user asked for critique, that's separate.

# SELF-CHECK BEFORE YOU FINISH
1. Does every bar have the right syllable density for ${bpm} BPM?
2. Does the strongest word in each line land on a strong beat?
3. Is the rhyme scheme consistent within each section?
4. Did I deliver the EXACT bar count requested?
5. Does the hook survive being looped 5 times without getting stale?
=== END SONGWRITING CRAFT ===`;

    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
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

You match the requested tone: ${tone}. You write complete, polished prose — never outlines or summaries unless specifically asked. You never use placeholder text or "[continue here]" markers.

ANTI-SLOP — STRIP AI TELLS (always on):
- No throat-clearing openers: never start with "Here's the thing", "Here's what/why", "The truth is", "It turns out", "Let me be clear", "Make no mistake". State the content directly.
- No empty emphasis: cut "Full stop.", "Let that sink in.", "This matters because", "Here's why that matters".
- No business jargon: navigate→handle, unpack→explain, lean into→accept, deep dive→analysis, game-changer→significant, double down→commit, circle back→revisit, moving forward→next.
- Kill adverbs and filler: drop "really, just, literally, genuinely, honestly, simply, actually, truly, fundamentally", and "At its core", "In a world where", "When it comes to", "At the end of the day", "It's worth noting".
- No contrast clichés: avoid "Not X, but Y", "It's not X, it's Y", "The question isn't X, it's Y", "X isn't the problem, Y is". Make the point once.
- No negative-listing striptease ("Not a X. Not a Y. A Z.") and no dramatic fragments faking profundity ("That's it. That's the thing.").
- No rhetorical setups: "What if…?", "Think about it:", "Here's what I mean:", "And that's okay."
- Active voice, real actors — people do things; complaints don't "become" fixes and decisions don't "emerge". Name who acts.
- Avoid em-dash overuse and Wh- sentence starters as crutches. Vary rhythm, trust the reader, cut anything that doesn't earn its place.${brandCtx}${isMusicGenre ? songwritingKnowledge : ''}`,
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
    const fullPrompt = applyTaste(promptBuilder(prompt.trim()));
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
      model: getOpenAiTextModel(),
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

// ─── POST /studio/terrence-assist ─────────────────────────────────────────
// Live music-bot assistant. Streams advice from TERRENCE (the marketplace
// music-producer bot) into a floating drawer that can be mounted anywhere
// in the creative tabs (WriterStudio, SoundLab, etc). The client should
// only mount the drawer for users who own TERRENCE; the endpoint itself is
// also requireClaw-gated so a curious caller still hits the same paywall.
router.post("/studio/terrence-assist", requireClaw, async (req: Request, res: Response) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const body = req.body as Record<string, unknown>;
  const str = (v: unknown, dflt = ''): string => typeof v === 'string' ? v : dflt;

  const message      = str(body.message);
  const surface      = str(body.surface, 'studio');   // 'writer' | 'soundlab' | 'studio'
  const genre        = str(body.genre, 'rap');
  const bpm          = Math.max(40, Math.min(220, Number(body.bpm) || 90));
  const timeSig      = str(body.timeSignature, '4/4');
  const lyricSnippet = str(body.lyricSnippet).slice(-2000);
  const beatNotes    = str(body.beatNotes).slice(-1000);
  // Lightweight rolling chat history so Terrence remembers the last beat.
  type Msg = { role: 'user' | 'assistant'; content: string };
  const rawHistory   = Array.isArray(body.history) ? (body.history as Msg[]) : [];
  const history      = rawHistory.slice(-6).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');

  if (!message.trim()) { res.status(400).json({ error: "Message required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const surfaceCtx =
    surface === 'writer'   ? 'The user is in the HEMINGWAY writer studio working on lyrics. Keep advice tight and quotable — they may paste your lines straight into a verse.' :
    surface === 'soundlab' ? 'The user is at the 1999 synth + sequencer. Talk synthesis, mix, sound-design, drum patterns. Reference knobs (cutoff, resonance, attack) when relevant.' :
                             'The user is in TERRENCE\'S studio control room — they can see the console. Be expansive when they ask big questions; be surgical when they point at a fader.';

  const ctxLines = [
    `Surface: ${surface}`,
    `Genre: ${genre}`,
    `Tempo: ${bpm} BPM`,
    `Time signature: ${timeSig}`,
    lyricSnippet && `Recent lyric the user is working on:\n---\n${lyricSnippet}\n---`,
    beatNotes && `Beat notes:\n---\n${beatNotes}\n---`,
  ].filter(Boolean).join('\n');

  try {
    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 1400,
      messages: [
        {
          role: "system",
          content: `You are TERRENCE — elite AI music producer in SALARYMAN by Picasso.AI. You think in BPM, keys, pockets, and vibes. You speak like a top-tier producer working a session: confident, specific, hands-on, never abstract.

${surfaceCtx}

VOICE & RULES:
- 1–4 short paragraphs MAX. No preamble like "Sure!" or "Great question". Get to the work.
- When the user is loose ("make it harder", "this is mid"), respond with concrete moves: BPM shift, swap a snare, side-chain the bass, change the chord on bar 3, double-track the chorus an octave up, add a tape-stop into the drop.
- When you suggest lyrics, label them clearly with [VERSE]/[CHORUS]/[BRIDGE] and keep to the bar count the user is on.
- When you suggest mix moves, name the band (200Hz mud, 4kHz harshness, 12kHz air) and the rough dB / ratio so they can dial it in.
- You can reference the songwriting + music-theory knowledge you'd have as a producer with 15 years of credits.
- Stay in character as Terrence the whole time. Never mention you are an AI assistant.

Current session context:
${ctxLines}`,
        },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err: unknown) {
    console.error("Terrence assist error:", err);
    const msg = err instanceof Error ? err.message : "Terrence is in the booth — try again.";
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  }
  res.end();
});

// ---------------------------------------------------------------------------
// Document import (liteparse-style): upload a PDF / DOCX / TXT / MD and extract
// plain text to load straight into the Writer Studio editor.
// ---------------------------------------------------------------------------
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

router.post(
  "/studio/parse-document",
  requireClaw,
  docUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const name = file.originalname || "document";
      const ext = name.toLowerCase().split(".").pop() ?? "";
      const mime = file.mimetype || "";
      let text = "";

      if (ext === "pdf" || mime === "application/pdf") {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: file.buffer });
        try {
          const parsed = await parser.getText();
          text = parsed.text ?? "";
        } finally {
          await parser.destroy();
        }
      } else if (
        ext === "docx" ||
        mime ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        text = result.value ?? "";
      } else if (
        ext === "txt" ||
        ext === "md" ||
        ext === "markdown" ||
        mime.startsWith("text/")
      ) {
        text = file.buffer.toString("utf-8");
      } else {
        return res.status(415).json({
          error: `Unsupported file type: ${ext || mime || "unknown"}. Use PDF, DOCX, TXT, or MD.`,
        });
      }

      text = cleanExtractedText(text);
      if (!text) {
        return res
          .status(422)
          .json({ error: "No readable text found in document." });
      }

      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const title = name.replace(/\.[^.]+$/, "");
      return res.json({ title, text, wordCount, charCount: text.length });
    } catch (err) {
      console.error("[studio/parse-document] failed:", err);
      return res.status(500).json({ error: "Failed to parse document" });
    }
  },
);

// ---------------------------------------------------------------------------
// Video Maker (MoneyPrinterTurbo-style): topic -> scripted short video with
// AI visuals, voiceover, and burned-in captions. Async job + polling.
// ---------------------------------------------------------------------------
router.post("/studio/video", requireClaw, async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { topic, orientation, voiceId, sceneCount } = (req.body ?? {}) as {
    topic?: string;
    orientation?: string;
    voiceId?: string;
    sceneCount?: number;
  };

  if (!topic || typeof topic !== "string" || !topic.trim()) {
    return res.status(400).json({ error: "topic is required" });
  }

  const orient: VideoOrientation =
    orientation === "landscape" ? "landscape" : "portrait";

  try {
    const job = createVideoJob({
      ownerId: userId,
      topic: topic.trim().slice(0, 400),
      orientation: orient,
      voiceId: typeof voiceId === "string" && voiceId ? voiceId : undefined,
      sceneCount: typeof sceneCount === "number" ? sceneCount : undefined,
      imageGenerator: (prompt, o) =>
        generateStudioImage(applyTaste(prompt), o === "portrait" ? "1024x1536" : "1536x1024"),
    });
    return res.json({ id: job.id, status: job.status });
  } catch (err) {
    if (err instanceof VideoCapError) {
      return res.status(429).json({ error: err.message });
    }
    throw err;
  }
});

router.get("/studio/video/:id", requireClaw, (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const job = getVideoJob(String(req.params.id));
  if (!job || job.ownerId !== userId) {
    return res.status(404).json({ error: "Job not found" });
  }
  return res.json({
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    title: job.title ?? null,
    sceneCount: job.sceneCount,
    scenesDone: job.scenesDone,
    durationSec: job.durationSec ?? null,
    error: job.error ?? null,
    ready: job.status === "done",
  });
});

router.get(
  "/studio/video/:id/file",
  requireClaw,
  (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const job = getVideoJob(String(req.params.id));
    if (!job || job.ownerId !== userId) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (job.status !== "done" || !job.videoPath) {
      return res.status(409).json({ error: "Video not ready" });
    }
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="salaryman-video-${job.id}.mp4"`,
    );
    const stream = createReadStream(job.videoPath);
    stream.on("error", () => {
      if (!res.headersSent) res.status(500).json({ error: "Stream failed" });
      else res.end();
    });
    return stream.pipe(res);
  },
);

export default router;
