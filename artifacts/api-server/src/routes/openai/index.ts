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
import { requireFeature } from "../../middlewares/requirePro";

const router: IRouter = Router();
const requireClaw = requireFeature("claw_bot");

// Per-character ElevenLabs voice routing.
// Uses ElevenLabs' free public voice library so no extra setup is required.
// Each major NPC / bot is mapped to a distinct stock voice so they sound
// different from one another. Override any of these via env vars of the form
// ELEVENLABS_VOICE_<CHARACTER_KEY> (e.g. ELEVENLABS_VOICE_PABLO).
const CHARACTER_VOICES: Record<string, string> = {
  // === Major NPCs ===
  PABLO:        "86ZLAUcyPNBrbdJKn3u6", // existing custom Pablo voice
  JEAN_CLAW:    "ErXwobaYiN019PkySvjV", // Antoni — refined French-flavoured
  RICK:         "VR6AewLTigWG4xSOukaG", // Arnold — gruff underboss
  MARCUS_VELL:  "TxGEqnHWrfWFTfGW9XjX", // Josh — tired corporate
  LILA_CRANE:   "EXAVITQu4vr4xnSDxMAi", // Bella — cautious accountant
  OFFICER_VOSS: "pNInz6obpgDQGcFmaJgB", // Adam — corrupt police captain
  VELLA_RUNE:   "21m00Tcm4TlvDq8ikWAM", // Rachel — cold android actuary
  MAEVE_GARRIN: "AZnzlk1HvdrDWiwoCwTL", // Domi — recursive shell director
  DR_ELARA_KERN:"MF3mGyEYCl7XYWbV9V6O", // Elli — defiant roboticist
  SILAS_GRAHN:  "yoZ06aMxZJJ28mfd3POQ", // Sam — weary combat android
  ORINA_FELL:   "AZnzlk1HvdrDWiwoCwTL", // Domi — ethereal precognitive
  MARSH_KETTER: "VR6AewLTigWG4xSOukaG", // Arnold — pragmatic arms dealer
  // === Major Bots ===
  KENJI:        "TxGEqnHWrfWFTfGW9XjX", // Josh — wise prompt sensei
  VIKTOR:       "pNInz6obpgDQGcFmaJgB", // Adam — analytical CFO
  PENNY:        "EXAVITQu4vr4xnSDxMAi", // Bella — precise tax bot
  ANDRE:        "ErXwobaYiN019PkySvjV", // Antoni — culinary chef
  GLORIA:       "AZnzlk1HvdrDWiwoCwTL", // Domi — beauty salon
  TERRENCE:     "VR6AewLTigWG4xSOukaG", // Arnold — music generator
  VANESSA:      "21m00Tcm4TlvDq8ikWAM", // Rachel — YouTube strategist
  ISAAC:        "yoZ06aMxZJJ28mfd3POQ", // Sam — copywriter
  ROSETTA:      "MF3mGyEYCl7XYWbV9V6O", // Elli — language tutor
  DEVONTE:      "TxGEqnHWrfWFTfGW9XjX", // Josh — coding mentor
};

function resolveVoiceId(character?: string, voiceIdOverride?: string): string {
  if (voiceIdOverride && /^[A-Za-z0-9]{16,}$/.test(voiceIdOverride)) {
    return voiceIdOverride;
  }
  if (character && typeof character === "string") {
    const key = character.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    const envOverride = process.env[`ELEVENLABS_VOICE_${key}`];
    if (envOverride) return envOverride;
    if (CHARACTER_VOICES[key]) return CHARACTER_VOICES[key];
  }
  return process.env.ELEVENLABS_VOICE_ID || "86ZLAUcyPNBrbdJKn3u6";
}

async function handleTts(req: any, res: any) {
  const { text, character, voiceId: voiceIdOverride } = req.body as {
    text?: string;
    character?: string;
    voiceId?: string;
  };
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (elevenLabsKey) {
    try {
      const voiceId = resolveVoiceId(character, voiceIdOverride);
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
            stability: 0.65,
            similarity_boost: 0.78,
            style: 0.22,
            use_speaker_boost: true,
            speed: 0.92,
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
}

// Guests get a small IP-metered free pool of TTS calls so the Pablo intro
// has a voice on first visit (browser SpeechSynthesis on iOS Safari is
// unreliable and was leaving guests staring at silent dialogue). Paid /
// signed-in users keep the unmetered claw_bot path. Mirrors the guest
// fallback already used by /api/chat/pablo/command.
const GUEST_TTS_CAP = 60; // ~enough for the storyteller intro plus a few replies
async function guardTtsForGuest(req: any, res: any, next: any) {
  // Authed users go through the existing feature gate.
  if (req.user?.id) return requireClaw(req, res, next);
  try {
    const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.ip || "0.0.0.0").slice(0, 64);
    const guestId = `guest:${ip}`;
    const { consumeUsage } = await import("../../lib/usage-meter");
    const gate = await consumeUsage(guestId, null, "ai_messages", 1);
    if (!gate.allowed) {
      // Cap reached — let the client fall back to browser TTS.
      res.status(429).json({ error: "guest_cap_reached", fallback: "browser" });
      return;
    }
    if ((gate.used || 0) > GUEST_TTS_CAP) {
      res.status(429).json({ error: "guest_cap_reached", fallback: "browser" });
      return;
    }
    next();
  } catch (err) {
    console.warn("[TTS] guest gate error, allowing through:", err);
    next();
  }
}
router.post("/tts", guardTtsForGuest, handleTts);

router.post("/game-tts", async (req, res) => {
  return handleTts(req, res);
});

// Transcription is intentionally NOT gated by requireClaw. The Pablo intro
// (and the unauthenticated landing flow generally) needs the user to be able
// to *speak* to Pablo so they can say the passcode and respond to his
// greeting. Locking STT behind a paid subscription means brand-new visitors
// hit a silent 403 the first time they try to talk — which surfaces in
// support as "Pablo can't hear me". Whisper is cheap; the auth gates that
// matter (TTS spend, model usage) stay in place on other endpoints.
router.post("/transcribe", async (req, res) => {
  // Defensive: same crash class as /interview/listen — if the proxy or a
  // bad client posts an empty body, destructuring an undefined req.body
  // throws a 500 instead of returning a clean 400. Always coerce.
  const { audio, mimeType } = (req.body ?? {}) as { audio?: string; mimeType?: string };
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
      console.log(`[Transcribe] Converting ${detected} (client mimeType: ${mimeType || 'n/a'}) to WAV via ffmpeg...`);
      try {
        finalBuffer = await convertToWav(audioBuffer) as Buffer<ArrayBuffer>;
        finalFormat = "wav";
        console.log(`[Transcribe] Converted to WAV: ${finalBuffer.length} bytes`);
      } catch (convErr: any) {
        console.error(`[Transcribe] ffmpeg conversion failed: ${convErr?.message}`);
        if (detected === "webm" || detected === "ogg") {
          finalFormat = "webm";
        } else {
          console.log(`[Transcribe] Retrying ffmpeg conversion for ${detected}...`);
          try {
            finalBuffer = await convertToWav(audioBuffer) as Buffer<ArrayBuffer>;
            finalFormat = "wav";
          } catch {
            finalFormat = "webm";
          }
        }
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
