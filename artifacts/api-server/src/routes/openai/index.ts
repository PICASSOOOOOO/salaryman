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
      const voiceId = process.env.ELEVENLABS_VOICE_ID || "86ZLAUcyPNBrbdJKn3u6";
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
      const errBody = await elRes.text();
      console.warn("ElevenLabs TTS failed:", elRes.status, errBody);
      if (elRes.status === 402) {
        console.warn("ElevenLabs requires a paid plan for this voice. Falling back to browser TTS.");
      }
    } catch (err) {
      console.warn("ElevenLabs TTS error:", err);
    }
  }

  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const directRes = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          voice: "onyx",
          input: text,
          response_format: "mp3",
        }),
      });
      if (directRes.ok) {
        const buffer = Buffer.from(await directRes.arrayBuffer());
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", buffer.length);
        res.end(buffer);
        return;
      }
      console.warn("OpenAI direct TTS failed:", directRes.status);
    }

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
    console.error("TTS error (all engines failed):", err);
    res.status(502).json({ error: "TTS failed", fallback: "browser" });
  }
});

router.post("/transcribe", async (req, res) => {
  const { audio, mimeType } = req.body as { audio?: string; mimeType?: string };
  if (!audio || typeof audio !== "string") {
    res.status(400).json({ error: "audio (base64) is required" });
    return;
  }

  try {
    const audioBuffer = Buffer.from(audio, "base64");
    console.log(`[Transcribe] Received ${audioBuffer.length} bytes, mimeType: ${mimeType || 'not specified'}, first bytes: ${audioBuffer.slice(0, 8).toString('hex')}`);

    let rmsLevel = 0;
    const { speechToText, detectAudioFormat } = await import("@workspace/integrations-openai-ai-server/audio");
    const detected = detectAudioFormat(audioBuffer);
    const format: "wav" | "mp3" | "webm" = detected === "wav" ? "wav" : detected === "mp3" ? "mp3" : "webm";

    if (detected === "wav" && audioBuffer.length > 44) {
      let sumSq = 0;
      const dataStart = 44;
      const sampleCount = Math.floor((audioBuffer.length - dataStart) / 2);
      for (let i = 0; i < sampleCount; i++) {
        const sample = audioBuffer.readInt16LE(dataStart + i * 2);
        sumSq += sample * sample;
      }
      rmsLevel = Math.sqrt(sumSq / sampleCount);
      const maxSample = Math.max(...Array.from({ length: Math.min(sampleCount, 10000) }, (_, i) => Math.abs(audioBuffer.readInt16LE(dataStart + i * 2))));
      const durationSec = (sampleCount / 16000).toFixed(1);
      console.log(`[Transcribe] WAV analysis: ${sampleCount} samples, ${durationSec}s, RMS=${rmsLevel.toFixed(0)}, peak=${maxSample}, silence=${rmsLevel < 50 ? 'YES' : 'NO'}`);
    }

    console.log(`[Transcribe] Detected format: ${detected}, using: ${format}`);
    const text = await speechToText(audioBuffer, format);
    console.log(`[Transcribe] Result: "${text}" (${text.length} chars)`);
    res.json({ text: text || "", rms: Math.round(rmsLevel) });
  } catch (err: any) {
    console.error("Transcription error:", err?.message || err);
    res.status(500).json({ error: `Transcription failed: ${err?.message || "unknown"}` });
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
