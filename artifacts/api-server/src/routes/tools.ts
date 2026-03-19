import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getUncachableResendClient } from "../lib/resend";
import { db, contactsTable, userMemoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fireWebhook } from "../lib/webhook";

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
    const pageTexts: string[] = [];
    for (const url of urls.slice(0, 5)) {
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; DevDocsBot/1.0)" },
          signal: AbortSignal.timeout(8000),
        });
        const html = await r.text();
        pageTexts.push(`## ${url}\n${htmlToText(html)}`);
      } catch {
        pageTexts.push(`## ${url}\n[Could not fetch — site may block bots or require login]`);
      }
    }

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
      model: "gpt-4o",
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
      model: "gpt-4o",
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
      model: "gpt-4o",
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

// ── Contacts CRUD (DB-backed, requires auth) ───────────────────────────────────

router.get("/tools/contacts", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  const rows = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.userId, req.user.id))
    .orderBy(contactsTable.createdAt);
  res.json({ contacts: rows.reverse() });
});

router.post("/tools/contacts", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  const { name, email = "", phone = "", address = "", age = "", ethnicity = "", hometown = "", timezone = "", kids = "", bio = "" } =
    req.body as Record<string, string>;
  if (!name?.trim()) { res.status(400).json({ error: "Name required" }); return; }
  const [record] = await db
    .insert(contactsTable)
    .values({ userId: req.user.id, name, email, phone, address, age, ethnicity, hometown, timezone, kids, bio })
    .returning();

  void fireWebhook(req.user.id, "new_contact", {
    contact: { id: record.id, name: record.name, email: record.email },
  });

  res.status(201).json({ contact: record });
});

router.delete("/tools/contacts/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  const id = Number(req.params.id);
  const deleted = await db
    .delete(contactsTable)
    .where(eq(contactsTable.id, id))
    .returning();
  if (deleted.length === 0 || deleted[0].userId !== req.user.id) {
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
  const fields = ["name", "email", "phone", "address", "age", "ethnicity", "hometown", "timezone", "kids", "bio", "createdAt"] as const;
  const header = fields.join(",");
  const csvRows = rows.map((c) =>
    fields.map((f) => `"${String(c[f] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="contacts.csv"');
  res.send([header, ...csvRows].join("\n"));
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
router.post("/tools/send-email", async (req, res) => {
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

export default router;
