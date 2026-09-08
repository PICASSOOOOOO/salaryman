import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";
import { getUncachableResendClient } from "../lib/resend";
import { db, contactsTable, contactInteractionsTable, userMemoryTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { fireWebhook } from "../lib/webhook";
import { fireDiscordWebhook } from "../lib/discord-webhook";
import { safeFetch, SafeFetchError } from "../lib/safe-fetch";
import { getSkillCatalog } from "../lib/ai-skills";
import { requireFeature } from "../middlewares/requirePro";

const router: IRouter = Router();

// ── Strip HTML to plain text ──────────────────────────────────────────────────
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 6000);
}

// ── POST /tools/analyze-urls ──────────────────────────────────────────────────
// Fetch one or more URLs, extract text, send to AI for analysis
router.post("/tools/analyze-urls", async (req, res) => {
  const { urls, focus } = req.body as { urls: string[]; focus?: string };
  if (!Array.isArray(urls) || urls.length === 0) {
    res.status(400).json({ error: "Provide at least one URL" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const targetUrls = urls.slice(0, 5);
    const results = await Promise.allSettled(
      targetUrls.map(async (url) => {
        const r = await safeFetch(url, { timeoutMs: 8000, maxResponseBytes: 512 * 1024 });
        const contentType = r.headers.get("content-type") ?? "";
        if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
          return `## ${url}\n[Skipped — not an HTML page (content-type: ${contentType})]`;
        }
        const html = await r.text();
        return `## ${url}\n${htmlToText(html)}`;
      })
    );
    const pageTexts = results.map((result, i) => {
      if (result.status === "fulfilled") return result.value;
      const reason = result.reason instanceof SafeFetchError
        ? result.reason.message
        : "site may block bots or require login";
      return `## ${targetUrls[i]}\n[Could not fetch — ${reason}]`;
    });

    const prompt = `You have been given content from ${pageTexts.length} webpage(s). ${focus ? `Focus specifically on: ${focus}.` : "Give a general analysis."}

For each page, produce a clean visual summary in this exact format:

---
### [Page title or domain]
**One-line summary:** [what this page/site is about in plain English]

**Key takeaways:**
• [takeaway 1 — max 20 words]
• [takeaway 2 — max 20 words]
• [takeaway 3 — max 20 words]

**Worth knowing:**
[1-2 sentences of context, risk, opportunity, or nuance — casual tone]
---

Pages:
${pageTexts.join("\n\n")}`;

    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 1000,
      stream: true,
      messages: [
        {
          role: "system",
          content: "You analyze web content and present findings clearly and casually, like a smart colleague briefing the team.",
        },
        { role: "user", content: prompt },
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error("analyze-urls error:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to analyze URLs" })}\n\n`);
  }

  res.end();
});

// ── POST /tools/generate-presentation ────────────────────────────────────────
// Generate a slide deck (title + talking points + teleprompter script per slide)
router.post("/tools/generate-presentation", async (req, res) => {
  const { topic, context, slideCount = 5 } = req.body as {
    topic: string;
    context?: string;
    slideCount?: number;
  };

  if (!topic) {
    res.status(400).json({ error: "Topic is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const count = Math.min(Math.max(slideCount, 3), 8);

  const prompt = `Create a ${count}-slide presentation on: "${topic}"
${context ? `Additional context: ${context}` : ""}

Output ONLY valid JSON. No markdown fences. No explanation. Just the JSON object:
{
  "title": "Presentation title",
  "slides": [
    {
      "title": "Slide title",
      "bullets": ["point 1", "point 2", "point 3"],
      "say_this": "What the presenter says out loud for this slide — 1-2 casual, confident sentences. No jargon."
    }
  ]
}

Rules:
- Bullets are short (max 12 words each), scannable, visual
- say_this sounds like a confident person talking naturally at lunch — casual American English
- Cover: intro/hook, 2-4 content slides, strong close
- No filler. Every word earns its place.`;

  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 1500,
      stream: false,
      messages: [
        {
          role: "system",
          content: "You generate clean presentation content for confident, non-technical executives.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const json = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

    res.write(`data: ${JSON.stringify({ presentation: JSON.parse(json) })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error("generate-presentation error:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to generate presentation" })}\n\n`);
  }

  res.end();
});

// ── POST /tools/conduct-interview ─────────────────────────────────────────────
// Generate interview questions for a given role/topic
router.post("/tools/conduct-interview", async (req, res) => {
  const { subject, role, style = "mixed", count = 6 } = req.body as {
    subject: string;
    role?: string;
    style?: "technical" | "casual" | "mixed";
    count?: number;
  };

  if (!subject) {
    res.status(400).json({ error: "Subject/topic is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const styleDesc = {
    technical: "technical, skills-focused",
    casual: "conversational, personality-focused",
    mixed: "a mix of technical and casual/personality questions",
  }[style];

  const prompt = `Generate ${count} interview questions for: "${subject}"
${role ? `Role being interviewed for: ${role}` : ""}
Question style: ${styleDesc}

Output ONLY valid JSON. No markdown. No explanation:
{
  "questions": [
    {
      "question": "The actual question to ask",
      "why": "Why this question matters — 1 sentence",
      "listen_for": "What a good answer sounds like — 1 sentence"
    }
  ]
}

Make questions feel natural, not corporate. Like something a smart CEO would genuinely ask.`;

  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 1000,
      stream: false,
      messages: [
        {
          role: "system",
          content: "You help executives conduct effective, natural interviews.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const json = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

    res.write(`data: ${JSON.stringify({ interview: JSON.parse(json) })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error("conduct-interview error:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to generate interview" })}\n\n`);
  }

  res.end();
});

// ── Contacts CRM (DB-backed, requires auth) ────────────────────────────────────

router.get("/tools/contacts", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  const rows = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.userId, req.user.id))
    .orderBy(sql`${contactsTable.createdAt} DESC`);
  res.json({ contacts: rows });
});

router.post("/tools/contacts", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  const { name, email = "", phone = "", address = "", age = "", ethnicity = "", hometown = "", timezone = "", kids = "", bio = "", tag = "", dealStage = "", dealValue, company = "" } =
    req.body as Record<string, string> & { dealValue?: number };
  if (!name?.trim()) { res.status(400).json({ error: "Name required" }); return; }
  const [record] = await db
    .insert(contactsTable)
    .values({ userId: req.user.id, name, email, phone, address, age, ethnicity, hometown, timezone, kids, bio, tag, dealStage, dealValue: dealValue != null ? Number(dealValue) : null, company })
    .returning();

  void fireWebhook(req.user.id, "new_contact", {
    contact: { id: record.id, name: record.name, email: record.email },
  });
  void fireDiscordWebhook(req.user.id, "new_contact", {
    contact: { id: record.id, name: record.name, email: record.email },
  });

  res.status(201).json({ contact: record });
});

router.put("/tools/contacts/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  const allowed = ["name","email","phone","address","age","ethnicity","hometown","timezone","kids","bio","tag","dealStage","dealValue","company"];
  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  const [current] = await db.select().from(contactsTable)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.userId, req.user.id)));
  if (!current) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db
    .update(contactsTable)
    .set(updates)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.userId, req.user.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  if (updates.dealStage !== undefined && updated.dealStage !== current.dealStage) {
    void fireWebhook(req.user.id, "deal_stage_changed", {
      contact: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        company: updated.company,
        fromStage: current.dealStage,
        toStage: updated.dealStage,
      },
    });

    void fireDiscordWebhook(req.user.id, "deal_stage_changed", {
      contact: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        company: updated.company,
        fromStage: current.dealStage,
        toStage: updated.dealStage,
      },
    });
  }

  res.json({ contact: updated });
});

router.delete("/tools/contacts/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  const id = Number(req.params.id);
  const deleted = await db
    .delete(contactsTable)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.userId, req.user.id)))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Not found" }); return;
  }
  res.json({ ok: true });
});

router.get("/tools/contacts/export", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  const rows = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.userId, req.user.id))
    .orderBy(contactsTable.createdAt);
  const fields = ["name", "email", "phone", "company", "tag", "dealStage", "dealValue", "address", "age", "hometown", "timezone", "bio", "createdAt"] as const;
  const header = fields.join(",");
  const csvRows = rows.map((c) =>
    fields.map((f) => `"${String(c[f] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="contacts.csv"');
  res.send([header, ...csvRows].join("\n"));
});

// ── Contact Interactions ───────────────────────────────────────────────────────

router.get("/tools/contacts/:id/interactions", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  const contactId = Number(req.params.id);
  const [contact] = await db.select().from(contactsTable)
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.userId, req.user.id)));
  if (!contact) { res.status(404).json({ error: "Not found" }); return; }
  const rows = await db.select().from(contactInteractionsTable)
    .where(eq(contactInteractionsTable.contactId, contactId))
    .orderBy(sql`${contactInteractionsTable.createdAt} DESC`);
  res.json({ interactions: rows });
});

router.post("/tools/contacts/:id/interactions", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  const contactId = Number(req.params.id);
  const [contact] = await db.select().from(contactsTable)
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.userId, req.user.id)));
  if (!contact) { res.status(404).json({ error: "Not found" }); return; }
  const { type = "note", note } = req.body as { type?: string; note?: string };
  if (!note?.trim()) { res.status(400).json({ error: "Note required" }); return; }
  const [record] = await db.insert(contactInteractionsTable).values({
    contactId,
    userId: req.user.id,
    type,
    note: note.trim(),
  }).returning();
  res.status(201).json({ interaction: record });
});

router.delete("/tools/contacts/interactions/:interactionId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  const id = Number(req.params.interactionId);
  const deleted = await db.delete(contactInteractionsTable)
    .where(and(eq(contactInteractionsTable.id, id), eq(contactInteractionsTable.userId, req.user.id)))
    .returning();
  if (deleted.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

// ── User Memory (PABLO context, DB-backed, requires auth) ───────────────────────

router.get("/tools/memory", async (req, res) => {
  if (!req.isAuthenticated()) { res.json({ memory: "" }); return; }
  const [row] = await db
    .select()
    .from(userMemoryTable)
    .where(eq(userMemoryTable.userId, req.user.id));
  res.json({ memory: row?.memory ?? "" });
});

router.put("/tools/memory", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  const { memory } = req.body as { memory: string };
  await db
    .insert(userMemoryTable)
    .values({ userId: req.user.id, memory: memory ?? "" })
    .onConflictDoUpdate({ target: userMemoryTable.userId, set: { memory: memory ?? "" } });
  res.json({ ok: true });
});

// ── POST /tools/send-email ────────────────────────────────────────────────────
// Sends an email via the Resend integration connector
router.post("/tools/send-email", requireFeature("claw_bot"), async (req, res) => {
  const { to, subject, html, text } = req.body as {
    to: string;
    subject: string;
    html?: string;
    text?: string;
  };

  if (!to || !subject || (!html && !text)) {
    res.status(400).json({ error: "Missing required fields: to, subject, html or text" });
    return;
  }

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: [to],
      subject,
      html: html ?? `<pre>${text}</pre>`,
      text: text ?? "",
    });

    if (error) {
      res.status(500).json({ error: `Email failed: ${error.message}` });
      return;
    }

    res.json({ ok: true, id: data?.id });
  } catch (err) {
    res.status(500).json({ error: `Email error: ${String(err)}` });
  }
});

router.get("/tools/skills", (_req, res) => {
  res.json({ skills: getSkillCatalog() });
});

// ── Video URL helpers ─────────────────────────────────────────────────────────

interface VideoMeta {
  platform: "youtube" | "tiktok" | "vimeo" | "instagram" | "twitter" | "generic";
  videoId: string | null;
  embedUrl: string | null;
  title: string;
  description: string;
  thumbnail: string | null;
  transcript: string | null;
  pageContent: string;
}

function detectPlatform(url: string): VideoMeta["platform"] {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("vimeo.com")) return "vimeo";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  return "generic";
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}

function extractMetaFromHtml(html: string): { title: string; description: string; thumbnail: string | null } {
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const title = ogTitle?.[1]
    ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
    ?? "";
  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const description = ogDesc?.[1] ?? metaDesc?.[1] ?? "";
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  return {
    title: title.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(),
    description: description.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(),
    thumbnail: ogImage?.[1] ?? null,
  };
}

async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    const pageRes = await safeFetch(`https://www.youtube.com/watch?v=${videoId}`, {
      timeoutMs: 10000,
      maxResponseBytes: 2 * 1024 * 1024,
    });
    const pageHtml = await pageRes.text();

    const captionMatch = pageHtml.match(/"captions":\s*(\{[^}]*"playerCaptionsTracklistRenderer"[^}]*\})/);
    if (!captionMatch) {
      const timedTextMatch = pageHtml.match(/timedtext[^"]*lang=en[^"]*/i)
        ?? pageHtml.match(/timedtext[^"]*/i);
      if (!timedTextMatch) return null;
    }

    const captionUrlMatch = pageHtml.match(/"baseUrl":"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
    if (!captionUrlMatch) return null;

    let captionUrl = captionUrlMatch[1].replace(/\\u0026/g, "&");
    if (!captionUrl.includes("lang=")) captionUrl += "&lang=en";

    const captionRes = await safeFetch(captionUrl, { timeoutMs: 8000, maxResponseBytes: 512 * 1024 });
    const captionXml = await captionRes.text();

    const lines = [...captionXml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
      .map(m => m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n/g, " ")
        .trim()
      )
      .filter(Boolean);

    return lines.length > 0 ? lines.join(" ").slice(0, 15000) : null;
  } catch (e) {
    console.error("YouTube transcript fetch error:", e);
    return null;
  }
}

async function fetchOEmbed(url: string, platform: string): Promise<{ title: string; description: string; thumbnail: string | null } | null> {
  try {
    let oembedUrl: string | null = null;
    if (platform === "youtube") {
      oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    } else if (platform === "vimeo") {
      oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
    } else if (platform === "tiktok") {
      oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    }
    if (!oembedUrl) return null;
    const res = await safeFetch(oembedUrl, { timeoutMs: 6000, maxResponseBytes: 64 * 1024 });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return {
      title: String(data.title ?? ""),
      description: String(data.author_name ? `By ${data.author_name}` : ""),
      thumbnail: String(data.thumbnail_url ?? "") || null,
    };
  } catch {
    return null;
  }
}

async function fetchVideoMeta(url: string): Promise<VideoMeta> {
  const platform = detectPlatform(url);
  let videoId: string | null = null;
  let embedUrl: string | null = null;
  let transcript: string | null = null;
  let title = "";
  let description = "";
  let thumbnail: string | null = null;
  let pageContent = "";

  if (platform === "youtube") {
    videoId = extractYouTubeId(url);
    if (videoId) {
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
      thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      transcript = await fetchYouTubeTranscript(videoId);
    }
  } else if (platform === "vimeo") {
    videoId = extractVimeoId(url);
    if (videoId) embedUrl = `https://player.vimeo.com/video/${videoId}`;
  }

  const oembed = await fetchOEmbed(url, platform);
  if (oembed) {
    title = oembed.title;
    description = oembed.description;
    if (oembed.thumbnail) thumbnail = oembed.thumbnail;
  }

  try {
    const res = await safeFetch(url, { timeoutMs: 10000, maxResponseBytes: 1024 * 1024 });
    const html = await res.text();
    const meta = extractMetaFromHtml(html);
    if (!title) title = meta.title;
    if (!description) description = meta.description;
    if (!thumbnail) thumbnail = meta.thumbnail;
    pageContent = htmlToText(html);
  } catch (e) {
    console.error("Video page fetch error:", e);
  }

  return { platform, videoId, embedUrl, title, description, thumbnail, transcript, pageContent };
}

// ── POST /tools/analyze-video ─────────────────────────────────────────────────
router.post("/tools/analyze-video", async (req, res) => {
  const { url, goal } = req.body as { url: string; goal?: string };
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Provide a video URL" });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL format" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    res.write(`data: ${JSON.stringify({ status: "fetching" })}\n\n`);
    const meta = await fetchVideoMeta(url);

    res.write(`data: ${JSON.stringify({
      status: "meta",
      platform: meta.platform,
      title: meta.title,
      thumbnail: meta.thumbnail,
      embedUrl: meta.embedUrl,
      hasTranscript: !!meta.transcript,
    })}\n\n`);

    const contentParts: string[] = [];
    contentParts.push(`VIDEO URL: ${url}`);
    contentParts.push(`PLATFORM: ${meta.platform.toUpperCase()}`);
    if (meta.title) contentParts.push(`TITLE: ${meta.title}`);
    if (meta.description) contentParts.push(`DESCRIPTION: ${meta.description}`);
    if (meta.transcript) {
      contentParts.push(`\nFULL TRANSCRIPT:\n${meta.transcript}`);
    } else if (meta.pageContent) {
      contentParts.push(`\nPAGE CONTENT (no transcript available):\n${meta.pageContent}`);
    }

    const systemPrompt = `You are a senior business strategist and AI operations expert working for a company called Picasso AI. 
You analyze videos that users share and extract actionable intelligence.

Your analysis must be structured, insightful, and immediately useful. You turn video content into competitive advantages.

Always respond in this exact format:

## VIDEO INTELLIGENCE REPORT

### SUMMARY
[2-3 sentence overview of what this video covers]

### KEY INSIGHTS
• [Insight 1 — specific, actionable, max 25 words]
• [Insight 2]
• [Insight 3]
• [Insight 4]
• [Insight 5]

### STRATEGIES TO IMPLEMENT
For each strategy, include a difficulty rating (EASY / MEDIUM / HARD) and expected impact (LOW / MEDIUM / HIGH):

1. **[Strategy name]** [DIFFICULTY] | [IMPACT]
   [1-2 sentences on exactly how to implement this]

2. **[Strategy name]** [DIFFICULTY] | [IMPACT]
   [1-2 sentences on how to implement]

3. **[Strategy name]** [DIFFICULTY] | [IMPACT]
   [1-2 sentences on how to implement]

### COMPETITIVE TAKEAWAY
[1-2 sentences — what does this mean for our business? What's the main thing to act on RIGHT NOW?]`;

    const userPrompt = `Analyze this video content and extract actionable intelligence.
${goal ? `\nUSER'S SPECIFIC GOAL: ${goal}` : ""}

${contentParts.join("\n")}`;

    res.write(`data: ${JSON.stringify({ status: "analyzing" })}\n\n`);

    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 2000,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error("analyze-video error:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to analyze video" })}\n\n`);
  }

  res.end();
});

// ── POST /tools/analyze-vision ────────────────────────────────────────────────
// Pablo's eyes. Accepts a single still frame (data URL or http(s) URL) and
// streams back a casual, in-character description of what's in it. Used by
// the nebula-mode VisionIntake control for the camera path AND the
// uploaded-file path (the client extracts a representative frame for video
// files before posting). Streamed as text/event-stream so the UI can fill in
// progressively, matching the existing /tools/analyze-* convention.
router.post("/tools/analyze-vision", async (req, res) => {
  const { image, prompt } = req.body as { image?: string; prompt?: string };
  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "Provide an image (data URL or https URL)." });
    return;
  }
  // Reject anything that isn't a data URL or http(s) URL — the OpenAI vision
  // API will choke on a bare blob: URL or a file path, and silently failing
  // server-side wastes a request and confuses the user.
  const isData = image.startsWith("data:image/");
  const isHttp = /^https?:\/\//i.test(image);
  if (!isData && !isHttp) {
    res.status(400).json({ error: "Image must be a data URL or http(s) URL." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const systemPrompt = `You are Pablo — Picasso AI's friendly, sharp salaryman guide. The user just showed you something through their camera or uploaded a frame. React the way a smart colleague leaning over your shoulder would: name what's in the image, pick out the one or two details that matter, and end with a short, useful takeaway or question. Keep it under 120 words, conversational, no headings, no bullet lists unless the image is clearly a list/table/chart.`;

  const userPrompt = (prompt && prompt.trim())
    ? prompt.trim()
    : "Tell me what you see and what's worth noticing.";

  try {
    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 600,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error("analyze-vision error:", err);
    res.write(`data: ${JSON.stringify({ error: "Pablo couldn't see that one — try again?" })}\n\n`);
  }
  res.end();
});

// ── GET /tools/claude-templates ───────────────────────────────────────────────
let cachedTemplates: { data: unknown; fetchedAt: number } | null = null;
const TEMPLATES_TTL = 60 * 60 * 1000;

let fullTemplateData: Record<string, unknown[]> | null = null;

async function ensureTemplateData(): Promise<Record<string, unknown[]>> {
  if (fullTemplateData && cachedTemplates && Date.now() - cachedTemplates.fetchedAt < TEMPLATES_TTL) {
    return fullTemplateData;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const r = await fetch(
    "https://raw.githubusercontent.com/davila7/claude-code-templates/main/docs/components.json",
    { signal: controller.signal },
  );
  clearTimeout(timeout);
  if (!r.ok) throw new Error(`GitHub returned ${r.status}`);
  const data = await r.json() as Record<string, unknown[]>;
  fullTemplateData = data;

  const index: Record<string, unknown[]> = {};
  for (const [key, arr] of Object.entries(data)) {
    if (!Array.isArray(arr)) { index[key] = arr; continue; }
    index[key] = arr.map((item: Record<string, unknown>) => {
      const { content, ...meta } = item;
      return { ...meta, hasContent: !!content };
    });
  }
  cachedTemplates = { data: index, fetchedAt: Date.now() };
  return data;
}

router.get("/tools/claude-templates", async (_req, res) => {
  try {
    await ensureTemplateData();
    res.json(cachedTemplates!.data);
  } catch (err) {
    console.error("claude-templates fetch error:", err);
    if (cachedTemplates) {
      res.json(cachedTemplates.data);
    } else {
      res.status(502).json({ error: "Failed to fetch template catalog" });
    }
  }
});

router.get("/tools/claude-templates/:type/:name", async (req, res) => {
  try {
    const data = fullTemplateData ?? await ensureTemplateData();
    const { type, name } = req.params;
    const arr = data[type];
    if (!Array.isArray(arr)) { res.status(404).json({ error: "Type not found" }); return; }
    const item = arr.find((i: Record<string, unknown>) => i.name === name);
    if (!item) { res.status(404).json({ error: "Component not found" }); return; }
    res.json(item);
  } catch (err) {
    console.error("claude-template detail error:", err);
    res.status(500).json({ error: "Failed to fetch component" });
  }
});

// ── POST /tools/job-evaluate ──────────────────────────────────────────────────
router.post("/tools/job-evaluate", requireFeature("claw_bot"), async (req, res) => {
  const { jobDescription, jobUrl, userProfile } = req.body as {
    jobDescription: string;
    jobUrl?: string;
    userProfile?: string;
  };

  if (!jobDescription || typeof jobDescription !== "string") {
    res.status(400).json({ error: "Provide a job description" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    if (jobUrl) {
      res.write(`data: ${JSON.stringify({ status: "fetching_url" })}\n\n`);
    }

    let fullContent = jobDescription;
    if (jobUrl) {
      try {
        const r = await safeFetch(jobUrl, { timeoutMs: 8000, maxResponseBytes: 512 * 1024 });
        const html = await r.text();
        const pageText = htmlToText(html);
        if (pageText.length > 200) {
          fullContent = `JOB URL: ${jobUrl}\n\nJOB POSTING PAGE CONTENT:\n${pageText}\n\nUSER-PROVIDED DESCRIPTION:\n${jobDescription}`;
        }
      } catch {}
    }

    res.write(`data: ${JSON.stringify({ status: "analyzing" })}\n\n`);

    const systemPrompt = `You are an elite career strategist AI inside Jean Claw's Job Command Center. You evaluate job offers with surgical precision using a structured scoring system.

RESPOND IN THIS EXACT JSON FORMAT (no markdown fences, just raw JSON):
{
  "company": "Company Name",
  "role": "Job Title",
  "location": "Location / Remote",
  "grade": "A",
  "score": 4.5,
  "verdict": "One-line verdict (max 15 words)",
  "dimensions": [
    {"name": "Role Fit", "score": 5, "note": "Brief explanation"},
    {"name": "Growth Potential", "score": 4, "note": "Brief explanation"},
    {"name": "Compensation Signal", "score": 4, "note": "Brief explanation"},
    {"name": "Company Stage", "score": 5, "note": "Brief explanation"},
    {"name": "Tech Stack", "score": 4, "note": "Brief explanation"},
    {"name": "Culture Signal", "score": 3, "note": "Brief explanation"},
    {"name": "Work-Life Balance", "score": 4, "note": "Brief explanation"},
    {"name": "Location/Remote", "score": 5, "note": "Brief explanation"},
    {"name": "Brand Value", "score": 4, "note": "Brief explanation"},
    {"name": "Mission Alignment", "score": 4, "note": "Brief explanation"}
  ],
  "keyInsights": [
    "Insight about why this role is/isn't worth pursuing",
    "What makes this stand out or what's a red flag",
    "Specific recommendation"
  ],
  "resumeKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "interviewTopics": ["Topic to prepare for", "Another topic"],
  "applyRecommendation": "STRONG APPLY" | "APPLY" | "CONSIDER" | "SKIP"
}

Scoring guide: 5=Exceptional, 4=Strong, 3=Average, 2=Below Average, 1=Poor
Grading: A=4.5-5.0, B=3.5-4.4, C=2.5-3.4, D=1.5-2.4, F=below 1.5
${userProfile ? `\nCANDIDATE PROFILE:\n${userProfile}` : ""}
Score honestly. If the job is mediocre, say so. If it's exceptional, explain why.`;

    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 2000,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Evaluate this job opportunity:\n\n${fullContent.slice(0, 8000)}` },
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error("job-evaluate error:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to evaluate job" })}\n\n`);
  }
  res.end();
});

// ── POST /tools/job-resume ───────────────────────────────────────────────────
router.post("/tools/job-resume", requireFeature("claw_bot"), async (req, res) => {
  const { jobDescription, currentResume, targetKeywords } = req.body as {
    jobDescription: string;
    currentResume: string;
    targetKeywords?: string[];
  };

  if (!jobDescription || !currentResume) {
    res.status(400).json({ error: "Provide job description and current resume" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    res.write(`data: ${JSON.stringify({ status: "generating" })}\n\n`);

    const systemPrompt = `You are an ATS optimization expert inside Jean Claw's Job Command Center. You tailor resumes to specific job descriptions for maximum ATS compatibility.

Your task:
1. Extract 15-20 keywords from the job description
2. Rewrite the resume to naturally incorporate these keywords
3. Reorder experience bullets to prioritize relevance to this role
4. Optimize the summary/objective for this specific position
5. Ensure ATS-friendly formatting (no tables, columns, or graphics)

Output the tailored resume in clean Markdown format. Include:
- A brief "OPTIMIZATION NOTES" section at the top explaining what you changed and why
- The full tailored resume below it
- A "KEYWORD INJECTION MAP" at the bottom showing where each keyword was placed

${targetKeywords?.length ? `\nPRIORITY KEYWORDS TO INCLUDE: ${targetKeywords.join(", ")}` : ""}`;

    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 3000,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `JOB DESCRIPTION:\n${jobDescription.slice(0, 4000)}\n\nCURRENT RESUME:\n${currentResume.slice(0, 4000)}` },
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error("job-resume error:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to generate resume" })}\n\n`);
  }
  res.end();
});

// ── POST /tools/job-interview-prep ───────────────────────────────────────────
router.post("/tools/job-interview-prep", requireFeature("claw_bot"), async (req, res) => {
  const { jobDescription, company, role, resume } = req.body as {
    jobDescription: string;
    company?: string;
    role?: string;
    resume?: string;
  };

  if (!jobDescription) {
    res.status(400).json({ error: "Provide a job description" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    res.write(`data: ${JSON.stringify({ status: "preparing" })}\n\n`);

    const systemPrompt = `You are an elite interview preparation coach inside Jean Claw's Job Command Center. Generate a comprehensive interview prep package.

Output in this exact format:

## INTERVIEW PREP: [Role] at [Company]

### LIKELY QUESTIONS (Behavioral)
For each question, provide a STAR framework answer outline:
1. **[Question]**
   - **Situation:** [What to describe]
   - **Task:** [Your responsibility]
   - **Action:** [What you did]
   - **Result:** [Measurable outcome]

### TECHNICAL DEEP-DIVE
• [Technical topic they'll likely test]
• [Key concept to review]
• [Framework/tool to demonstrate knowledge of]

### COMPANY INTELLIGENCE
• [Key fact about the company's recent moves]
• [Culture/values to reference]
• [Competitive landscape insight]

### QUESTIONS TO ASK THEM
1. [Smart question showing research]
2. [Question about growth/impact]
3. [Question about team/culture]

### RED FLAGS TO WATCH FOR
• [Potential concern to probe]

### SALARY NEGOTIATION INTEL
• [Market range estimate]
• [Leverage points]
• [Negotiation strategy]`;

    const userPrompt = `Prepare me for an interview.
${company ? `COMPANY: ${company}` : ""}
${role ? `ROLE: ${role}` : ""}

JOB DESCRIPTION:
${jobDescription.slice(0, 4000)}
${resume ? `\nMY RESUME:\n${resume.slice(0, 3000)}` : ""}`;

    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 3000,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error("job-interview-prep error:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to generate prep" })}\n\n`);
  }
  res.end();
});

// ── POST /tools/decode-schematic ──────────────────────────────────────────────
// "Blueprint Decoder" — deciphers an uploaded CAD file or engineering schematic
// (image, PDF, or CAD source like DXF/STEP/STL) and streams back ONE combined
// report: plain-English overview, extracted dimensions/materials/tolerances, and
// a bill of materials. Streamed as text/event-stream to match the analyze-* convention.
//
// The client always sends a base64 data URL; the server classifies the file and
// builds the right model input:
//   • image/*          → vision (input_image)
//   • application/pdf  → document input (input_file)
//   • everything else  → treated as CAD source; decoded to text (printable chars
//                        only for binary formats like DWG / binary STL) and sent
//                        as text input.
const SCHEMATIC_MAX_BYTES = 22 * 1024 * 1024; // ~22MB decoded
const SCHEMATIC_TEXT_LIMIT = 48_000; // chars of CAD source handed to the model

function printableFromBuffer(buf: Buffer): string {
  // Keep ASCII printables + common whitespace; collapse runs of control bytes.
  // Recovers readable headers/entity names from otherwise-binary CAD files.
  let out = "";
  let gap = false;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    const printable = b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126);
    if (printable) {
      out += String.fromCharCode(b);
      gap = false;
    } else if (!gap) {
      out += " ";
      gap = true;
    }
  }
  return out;
}

const SCHEMATIC_SYSTEM_PROMPT = `You are a senior mechanical, electrical, and manufacturing engineer reviewing a CAD file or engineering schematic for a colleague. Produce ONE clear, well-structured Markdown report. Use exactly these sections (omit a row only if truly nothing applies, and explicitly say when something cannot be determined from the file):

## Overview
A 2–4 sentence plain-English explanation of what this drawing/part/assembly/schematic is and what it appears to be for.

## Type & Discipline
Drawing type (e.g. mechanical part, assembly, PCB schematic, P&ID, electrical wiring, architectural) and the engineering discipline.

## Key Specifications & Dimensions
Bullet the dimensions, sizes, scale, units, key measurements, and callouts you can read or infer.

## Materials & Tolerances
Materials, finishes, fits, and tolerances (GD&T, ± values) present or implied. Say "Not specified" when absent.

## Bill of Materials
A Markdown table of parts/components/nets with columns: Item | Description | Qty | Notes. Infer reasonable entries for schematics; if none can be identified, state that.

## Observations & Potential Issues
Anything notable — manufacturability concerns, ambiguities, missing info, or risks.

Be precise and honest about uncertainty. Never invent exact dimensions that aren't shown — clearly label anything that is an estimate.`;

router.post("/tools/decode-schematic", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }

  const { dataUrl, filename, mimeType, notes } = req.body as {
    dataUrl?: string;
    filename?: string;
    mimeType?: string;
    notes?: string;
  };

  // Require a well-formed base64 data URL: data:<mime>;base64,<payload>
  if (!dataUrl || typeof dataUrl !== "string" || !/^data:[^;,]*;base64,/i.test(dataUrl)) {
    res.status(400).json({ error: "Provide the file as a base64 data URL." });
    return;
  }

  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(5, comma); // after "data:"
  const b64 = dataUrl.slice(comma + 1);
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    res.status(400).json({ error: "The file data is not valid base64." });
    return;
  }
  const declaredMime = (mimeType || meta.split(";")[0] || "").toLowerCase();
  const name = (filename || "uploaded-file").slice(0, 200);
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";

  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    res.status(400).json({ error: "Could not decode the file." });
    return;
  }
  if (buf.length === 0) {
    res.status(400).json({ error: "The file appears to be empty." });
    return;
  }
  if (buf.length > SCHEMATIC_MAX_BYTES) {
    res.status(413).json({ error: "File too large — keep it under 22MB." });
    return;
  }

  const isImage = declaredMime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"].includes(ext);
  const isPdf = declaredMime === "application/pdf" || ext === "pdf";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const intro = `File: ${name}${ext ? ` (.${ext})` : ""}.${notes && notes.trim() ? ` User context: ${notes.trim().slice(0, 500)}.` : ""}`;

  try {
    let content: Array<Record<string, unknown>>;

    if (isImage) {
      res.write(`data: ${JSON.stringify({ status: "Reading schematic image…" })}\n\n`);
      content = [
        { type: "input_text", text: `${intro} Decipher this engineering drawing / schematic image and produce the full report.` },
        { type: "input_image", image_url: dataUrl },
      ];
    } else if (isPdf) {
      res.write(`data: ${JSON.stringify({ status: "Reading PDF drawing…" })}\n\n`);
      content = [
        { type: "input_text", text: `${intro} Decipher this engineering drawing / schematic PDF and produce the full report.` },
        { type: "input_file", filename: name.endsWith(".pdf") ? name : `${name}.pdf`, file_data: dataUrl },
      ];
    } else {
      res.write(`data: ${JSON.stringify({ status: "Parsing CAD source…" })}\n\n`);
      const utf8 = buf.toString("utf8");
      // Heuristic: if the utf8 decode is mostly replacement/control noise, it's a
      // binary CAD format (DWG, binary STL) — fall back to printable extraction.
      const controlRatio = (utf8.match(/[\u0000-\u0008\uFFFD]/g)?.length ?? 0) / Math.max(utf8.length, 1);
      const text = (controlRatio > 0.1 ? printableFromBuffer(buf) : utf8).slice(0, SCHEMATIC_TEXT_LIMIT);
      const truncated = buf.length > SCHEMATIC_TEXT_LIMIT;
      content = [
        {
          type: "input_text",
          text: `${intro} This is the raw source of a CAD file${ext ? ` (.${ext} format)` : ""}${controlRatio > 0.1 ? ", recovered as printable text from a binary format (geometry coordinates are largely unreadable, so focus on headers, layers, entity/part names, metadata, and counts)" : ""}. Decipher it and produce the full report.${truncated ? " (Source was truncated — note that in your report.)" : ""}\n\n--- CAD SOURCE ---\n${text}`,
        },
      ];
    }

    const stream = await openai.responses.create({
      model: getOpenAiTextModel(),
      max_output_tokens: 1800,
      stream: true,
      input: [
        { role: "system", content: SCHEMATIC_SYSTEM_PROMPT },
        { role: "user", content: content as never },
      ],
    });

    let any = false;
    for await (const event of stream) {
      if (event.type === "response.output_text.delta" && event.delta) {
        any = true;
        res.write(`data: ${JSON.stringify({ content: event.delta })}\n\n`);
      }
    }
    if (!any) {
      res.write(`data: ${JSON.stringify({ error: "Couldn't read anything usable from that file — try a clearer image or a different format." })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    }
  } catch (err) {
    console.error("decode-schematic error:", err);
    res.write(`data: ${JSON.stringify({ error: "The decoder hit a snag reading that file — try again or use a different format." })}\n\n`);
  }
  res.end();
});

export default router;
