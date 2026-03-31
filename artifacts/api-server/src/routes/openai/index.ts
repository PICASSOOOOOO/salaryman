import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  CreateOpenaiConversationBody,
  SendOpenaiMessageBody,
  GetOpenaiConversationParams,
  DeleteOpenaiConversationParams,
  ListOpenaiMessagesParams,
  SendOpenaiMessageParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/tts", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (elevenLabsKey) {
    try {
      const voiceId = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";
      const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsKey,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.4,
            use_speaker_boost: true,
          },
        }),
      });

      if (elRes.ok) {
        const buffer = Buffer.from(await elRes.arrayBuffer());
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", buffer.length);
        res.end(buffer);
        return;
      }
      console.warn("ElevenLabs TTS failed, falling back to OpenAI:", elRes.status, await elRes.text());
    } catch (err) {
      console.warn("ElevenLabs TTS error, falling back to OpenAI:", err);
    }
  }

  try {
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx",
      input: text,
      response_format: "mp3",
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
  } catch (err) {
    console.error("TTS error:", err);
    res.status(502).json({ error: "TTS failed" });
  }
});

router.get("/openai/conversations", async (_req, res) => {
  const all = await db.select().from(conversations).orderBy(conversations.createdAt);
  res.json(all);
});

router.post("/openai/conversations", async (req, res) => {
  const parsed = CreateOpenaiConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const [conv] = await db.insert(conversations).values({ title: parsed.data.title }).returning();
  res.status(201).json(conv);
});

router.get("/openai/conversations/:id", async (req, res) => {
  const parsed = GetOpenaiConversationParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, parsed.data.id));
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(messages.createdAt);
  res.json({ ...conv, messages: msgs });
});

router.delete("/openai/conversations/:id", async (req, res) => {
  const parsed = DeleteOpenaiConversationParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, parsed.data.id));
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.delete(messages).where(eq(messages.conversationId, parsed.data.id));
  await db.delete(conversations).where(eq(conversations.id, parsed.data.id));
  res.status(204).end();
});

router.get("/openai/conversations/:id/messages", async (req, res) => {
  const parsed = ListOpenaiMessagesParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, parsed.data.id)).orderBy(messages.createdAt);
  res.json(msgs);
});

router.post("/openai/conversations/:id/messages", async (req, res) => {
  const paramParsed = SendOpenaiMessageParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = SendOpenaiMessageBody.safeParse(req.body);
  if (!paramParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { id } = paramParsed.data;
  const { content } = bodyParsed.data;

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.insert(messages).values({ conversationId: id, role: "user", content });

  const allMessages = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
  const chatMessages = allMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  const stream = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: chatMessages,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullResponse += delta;
      res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
    }
  }

  await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
