import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// ── In-memory contact store (swap for DB/Sheets later) ────────────────────────
const contacts: ContactRecord[] = [];
let nextId = 1;

export interface ContactRecord {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  age: string;
  ethnicity: string;
  hometown: string;
  timezone: string;
  kids: string;
  bio: string;
  createdAt: string;
}

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

// ── Contacts CRUD ──────────────────────────────────────────────────────────────

router.get("/tools/contacts", (_req, res) => {
  res.json({ contacts });
});

router.post("/tools/contacts", (req, res) => {
  const data = req.body as Omit<ContactRecord, "id" | "createdAt">;
  const record: ContactRecord = { ...data, id: nextId++, createdAt: new Date().toISOString() };
  contacts.push(record);
  res.status(201).json({ contact: record });
});

router.delete("/tools/contacts/:id", (req, res) => {
  const id = Number(req.params.id);
  const idx = contacts.findIndex((c) => c.id === id);
  if (idx === -1) { res.status(404).json({ error: "Not found" }); return; }
  contacts.splice(idx, 1);
  res.json({ ok: true });
});

router.get("/tools/contacts/export", (_req, res) => {
  const fields: (keyof ContactRecord)[] = [
    "id", "name", "email", "phone", "address", "age", "ethnicity",
    "hometown", "timezone", "kids", "bio", "createdAt",
  ];
  const header = fields.join(",");
  const rows = contacts.map((c) =>
    fields.map((f) => `"${String(c[f] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const csv = [header, ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="contacts.csv"');
  res.send(csv);
});

// ── POST /tools/send-email ────────────────────────────────────────────────────
// Sends an email to the user via Resend (requires RESEND_API_KEY env var)
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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Email service not configured — RESEND_API_KEY missing" });
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "DevDocs <noreply@devdocs.app>",
        to: [to],
        subject,
        html: html ?? `<pre>${text}</pre>`,
        text: text ?? "",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      res.status(500).json({ error: `Email failed: ${err}` });
      return;
    }

    const data = await response.json();
    res.json({ ok: true, id: (data as Record<string, unknown>).id });
  } catch (err) {
    res.status(500).json({ error: `Email error: ${String(err)}` });
  }
});

export default router;
