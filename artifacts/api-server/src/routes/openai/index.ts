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

    const { speechToText, detectAudioFormat, convertToWav } = await import("@workspace/integrations-openai-ai-server/audio");
    const detected = detectAudioFormat(audioBuffer);
    console.log(`[Transcribe] Detected format: ${detected}`);

    let finalBuffer = audioBuffer;
    let finalFormat: "wav" | "mp3" | "webm" = "wav";

    if (detected === "wav") {
      finalFormat = "wav";
    } else if (detected === "mp3") {
      finalFormat = "mp3";
    } else {
      console.log(`[Transcribe] Converting ${detected} to WAV via ffmpeg...`);
      try {
        finalBuffer = await convertToWav(audioBuffer) as Buffer<ArrayBuffer>;
        finalFormat = "wav";
        console.log(`[Transcribe] Converted to WAV: ${finalBuffer.length} bytes`);
      } catch (convErr: any) {
        console.error(`[Transcribe] ffmpeg conversion failed: ${convErr?.message}, sending as webm`);
        finalFormat = "webm";
      }
    }

    if (finalFormat === "wav" && finalBuffer.length > 44) {
      const dataStart = 44;
      const sampleCount = Math.floor((finalBuffer.length - dataStart) / 2);
      let sumSq = 0;
      let peakSample = 0;
      for (let i = 0; i < sampleCount; i++) {
        const sample = finalBuffer.readInt16LE(dataStart + i * 2);
        sumSq += sample * sample;
        const absSample = Math.abs(sample);
        if (absSample > peakSample) peakSample = absSample;
      }
      const rmsLevel = Math.sqrt(sumSq / sampleCount);
      const durationSec = (sampleCount / 16000).toFixed(1);
      console.log(`[Transcribe] WAV analysis: ${sampleCount} samples, ${durationSec}s, RMS=${rmsLevel.toFixed(0)}, peak=${peakSample}, silence=${rmsLevel < 50 ? 'YES' : 'NO'}`);

      if (rmsLevel > 10 && rmsLevel < 1500) {
        console.log(`[Transcribe] Audio too quiet (RMS=${rmsLevel.toFixed(0)}), re-converting with loudnorm...`);
        try {
          finalBuffer = await convertToWav(audioBuffer, true) as Buffer<ArrayBuffer>;
          console.log(`[Transcribe] Normalized WAV: ${finalBuffer.length} bytes`);
        } catch (normErr: any) {
          console.error(`[Transcribe] Normalization failed: ${normErr?.message}`);
        }
      }
    }

    const text = await speechToText(finalBuffer, finalFormat);
    console.log(`[Transcribe] Result: "${text}" (${text.length} chars)`);
    res.json({ text: text || "" });
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
