import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getUncachableResendClient } from "../lib/resend";
import { db, contactsTable, contactInteractionsTable, userMemoryTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { fireWebhook } from "../lib/webhook";
import { safeFetch, SafeFetchError } from "../lib/safe-fetch";

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
  const [updated] = await db
    .update(contactsTable)
    .set(updates)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.userId, req.user.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
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
