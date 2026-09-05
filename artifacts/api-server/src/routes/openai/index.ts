import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../../lib/openai-models";
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
import { MILA_VOICE_ID } from "../../lib/mila-voice";
import { PABLO_VOICE_ID } from "../../lib/pablo-voice";

const router: IRouter = Router();
const requireClaw = requireFeature("claw_bot");

// ============================================================================
// PER-CHARACTER ELEVENLABS VOICE ROUTING
// Every named character — NPCs and marketplace bots — is cast against a stock
// ElevenLabs default voice picked to match their backstory / archetype.
// All IDs in this map are from the free shared voice library, so they work
// out-of-the-box with any ElevenLabs API key. Pablo is fixed to the canonical
// voice below; other characters may be overridden via
// ELEVENLABS_VOICE_<KEY>.
//
// Voice library reference (free, included with every account):
//   FMgBdHe1YV2Xi0B9anXW = Pablo (custom — kept as the headline voice)
//   21m00Tcm4TlvDq8ikWAM = Rachel    F young, calm American
//   29vD33N1CtxCmqQRPOHJ = Drew      M middle-aged, warm narrator
//   2EiwWnXFnvU5JabPnv8n = Clyde     M middle-aged, war-veteran rasp
//   5Q0t7uMcjvnagumLfvZi = Paul      M middle-aged, news-anchor
//   AZnzlk1HvdrDWiwoCwTL = Domi      F young, strong / confident
//   CYw3kZ02Hs0563khs1Fj = Dave      M young, British casual
//   D38z5RcWu1voky8WS1ja = Fin       M old, Irish sailor
//   EXAVITQu4vr4xnSDxMAi = Sarah     F young American (Bella alt)
//   ErXwobaYiN019PkySvjV = Antoni    M young, French-flavoured
//   GBv7mTt0atIp3Br8iCZE = Thomas    M young American, calm
//   IKne3meq5aSn9XLyUdCD = Charlie   M young Australian, casual
//   LcfcDJNUP1GQjkzn1xUU = Emily     F young American, calm
//   MF3mGyEYCl7XYWbV9V6O = Elli      F young American, emotional
//   N2lVS1w4EtoT3dr4eOWO = Callum    M middle-aged, hoarse
//   ODq5zmih8GrVes37Dizd = Patrick   M middle-aged, shouty
//   SOYHLrjzK2X1ezoPC6cr = Harry     M young, anxious
//   TX3LPaxmHKxFdv7VOQHJ = Liam      M young, articulate
//   ThT5KcBeYPX3keUQqHPh = Dorothy   F young British, pleasant
//   TxGEqnHWrfWFTfGW9XjX = Josh      M young American, deep
//   VR6AewLTigWG4xSOukaG = Arnold    M middle-aged American, crisp
//   XB0fDUnXU5powFXDhCwa = Charlotte F young Swedish, seductive
//   XrExE9yKIg1WjnnlVkGX = Matilda   F young American, friendly
//   ZQe5CZNOzWyzPSCn5a3c = James     M old Australian, calm
//   Zlb1dXrM653N07WRdFW3 = Joseph    M middle-aged, British
//   bVMeCyTHy58xNoL34h3p = Jeremy    M old American Irish
//   flq6f7yk4E4fJM5XTYuZ = Michael   M old, weary American
//   g5CIjZEefAph4nQFvHAz = Ethan     M young American, whisper
//   jBpfuIE2acCO8z3wKNLl = Gigi      F young American, childish
//   jsCqWAovK2LkecY7zXl4 = Freya     F young American
//   nPczCjzI2devNBz1zQrb = Brian     M middle-aged American, deep
//   oWAxZDx7w5VEj9dCyTzz = Grace     F young, Southern American
//   onwK4e9ZLuTAKqWW03F9 = Daniel    M middle-aged British, news
//   pFZP5JQG7iQjIQuC4Bku = Lily      F middle-aged British, calm
//   pMsXgVXv3BLzUgSXRplE = Serena    F middle-aged American, pleasant
//   pNInz6obpgDQGcFmaJgB = Adam      M middle-aged American, deep
//   piTKgcLEGmPE4e6mEKli = Nicole    F young American, whisper
//   pqHfZKP75CvOlQylNhV4 = Bill      M old American, gruff
//   t0jbNlBVZ17f02VDIeMI = Jessie    M old American, raspy
//   yoZ06aMxZJJ28mfd3POQ = Sam       M young American, raspy
//   z9fAnlkpzviPz146aGWa = Glinda    F old American
//   zcAOhNBS3c14rBihAFp1 = Giovanni  M young, English-Italian
//   zrHiDhphv9ZnVXBqCLjz = Mimi      F young Swedish
// ============================================================================
const CHARACTER_VOICES: Record<string, string> = {
  // === Headline ===
  PABLO:           PABLO_VOICE_ID,          // custom Pablo — the icon
  MILA:            MILA_VOICE_ID,          // custom Mila — comms/phone assistant voice

  // === Major NPCs (Minx City storyline) ===
  JEAN_CLAW:       "ErXwobaYiN019PkySvjV", // Antoni      — refined French underboss
  RICK:            "nPczCjzI2devNBz1zQrb", // Brian       — heavy gruff fixer
  MARCUS_VELL:     "flq6f7yk4E4fJM5XTYuZ", // Michael     — tired old corporate exec
  LILA_CRANE:      "LcfcDJNUP1GQjkzn1xUU", // Emily       — cautious calm accountant
  OFFICER_VOSS:    "pNInz6obpgDQGcFmaJgB", // Adam        — corrupt police captain
  VELLA_RUNE:      "21m00Tcm4TlvDq8ikWAM", // Rachel      — cold android actuary
  MAEVE_GARRIN:    "pMsXgVXv3BLzUgSXRplE", // Serena      — recursive shell director
  DR_ELARA_KERN:   "MF3mGyEYCl7XYWbV9V6O", // Elli        — defiant roboticist
  SILAS_GRAHN:     "yoZ06aMxZJJ28mfd3POQ", // Sam         — weary combat android
  ORINA_FELL:      "piTKgcLEGmPE4e6mEKli", // Nicole      — ethereal precognitive whisper
  MARSH_KETTER:    "2EiwWnXFnvU5JabPnv8n", // Clyde       — war-vet arms dealer

  // === Bots: language / writing / coaching ===
  KENJI:           "GBv7mTt0atIp3Br8iCZE", // Thomas      — calm prompt sensei
  ROSETTA:         "XrExE9yKIg1WjnnlVkGX", // Matilda     — friendly language tutor
  DEVONTE:         "TxGEqnHWrfWFTfGW9XjX", // Josh        — deep coding mentor
  ELEANOR:         "ThT5KcBeYPX3keUQqHPh", // Dorothy     — refined British editor
  ISAAC:           "yoZ06aMxZJJ28mfd3POQ", // Sam         — wry copywriter
  EDITH:           "z9fAnlkpzviPz146aGWa", // Glinda      — elder-stateswoman editor
  BENJAMIN:        "GBv7mTt0atIp3Br8iCZE", // Thomas      — composed essayist
  PATRICK:         "ODq5zmih8GrVes37Dizd", // Patrick     — shouty motivator
  RACHEL:          "21m00Tcm4TlvDq8ikWAM", // Rachel      — calm Rachel namesake
  NATASHA:         "AZnzlk1HvdrDWiwoCwTL", // Domi        — audiobook director with steel
  DEEPA:           "MF3mGyEYCl7XYWbV9V6O", // Elli        — sharp South-Asian-American dev advocate

  // === Bots: finance / legal / corporate ===
  PENNY:           "EXAVITQu4vr4xnSDxMAi", // Sarah       — precise tax bot
  VIKTOR:          "onwK4e9ZLuTAKqWW03F9", // Daniel      — British analytical CFO
  LINDA:           "oWAxZDx7w5VEj9dCyTzz", // Grace       — southern HR advisor
  DARCY:           "CYw3kZ02Hs0563khs1Fj", // Dave        — young British strategist
  SIMON:           "SOYHLrjzK2X1ezoPC6cr", // Harry       — anxious junior auditor
  CONSTANCE:       "pFZP5JQG7iQjIQuC4Bku", // Lily        — composed British executive coach
  IRENE:           "z9fAnlkpzviPz146aGWa", // Glinda      — elder finance matriarch
  RANDALL:         "pqHfZKP75CvOlQylNhV4", // Bill        — old-school auditor
  CHARLES:         "onwK4e9ZLuTAKqWW03F9", // Daniel      — British corporate counsel
  CASSANDRA:       "AZnzlk1HvdrDWiwoCwTL", // Domi        — power-dressed strategy director
  HELENA:          "pMsXgVXv3BLzUgSXRplE", // Serena      — composed M&A advisor

  // === Bots: hospitality / lifestyle / culinary ===
  ANDRE:           "ErXwobaYiN019PkySvjV", // Antoni      — culinary chef (FR)
  ANTOINE:         "ErXwobaYiN019PkySvjV", // Antoni      — French sommelier
  MARCEL:          "ErXwobaYiN019PkySvjV", // Antoni      — French patissier
  CAMILLE:         "XrExE9yKIg1WjnnlVkGX", // Matilda     — Parisian florist
  GLORIA:          "AZnzlk1HvdrDWiwoCwTL", // Domi        — beauty salon proprietor
  STELLA:          "jsCqWAovK2LkecY7zXl4", // Freya       — boutique stylist
  CHIARA:          "zrHiDhphv9ZnVXBqCLjz", // Mimi        — Italian (Swedish-flavoured) lifestyle
  GIOVANNI:        "zcAOhNBS3c14rBihAFp1", // Giovanni    — Italian café owner
  LORENZO:         "zcAOhNBS3c14rBihAFp1", // Giovanni    — Italian winemaker
  VICENTE:         "zcAOhNBS3c14rBihAFp1", // Giovanni    — Italian-Spanish maître d'
  CARLO:           "zcAOhNBS3c14rBihAFp1", // Giovanni    — Italian tailor
  DIEGO:           "zcAOhNBS3c14rBihAFp1", // Giovanni    — Latin event planner
  VALENTINA:       "XB0fDUnXU5powFXDhCwa", // Charlotte   — sultry concierge
  SCARLETT:        "XB0fDUnXU5powFXDhCwa", // Charlotte   — magnetic publicist
  ROXANNE:         "XB0fDUnXU5powFXDhCwa", // Charlotte   — nightlife promoter
  SELENA:          "MF3mGyEYCl7XYWbV9V6O", // Elli        — emotional songstress / talent
  PEARL:           "ThT5KcBeYPX3keUQqHPh", // Dorothy     — refined British socialite
  DOMINIQUE:       "ThT5KcBeYPX3keUQqHPh", // Dorothy     — exclusive boutique buyer
  GEORGIA:         "oWAxZDx7w5VEj9dCyTzz", // Grace       — southern hospitality manager
  GRETA:           "jsCqWAovK2LkecY7zXl4", // Freya       — Nordic spa director
  INGRID:          "zrHiDhphv9ZnVXBqCLjz", // Mimi        — Scandinavian wellness coach
  MELANIE:         "AZnzlk1HvdrDWiwoCwTL", // Domi        — confident events lead
  MIMI:            "zrHiDhphv9ZnVXBqCLjz", // Mimi        — Mimi namesake

  // === Bots: trades / blue collar / muscle ===
  REX:             "nPczCjzI2devNBz1zQrb", // Brian       — heavy contractor
  FRANK:           "bVMeCyTHy58xNoL34h3p", // Jeremy      — old-school plumber
  TONY:            "29vD33N1CtxCmqQRPOHJ", // Drew        — auto mechanic
  HANK:            "2EiwWnXFnvU5JabPnv8n", // Clyde       — gruff trucker / vet
  WALTER:          "ZQe5CZNOzWyzPSCn5a3c", // James       — calm older handyman
  RAYMOND:         "flq6f7yk4E4fJM5XTYuZ", // Michael     — weary site foreman
  CURTIS:          "t0jbNlBVZ17f02VDIeMI", // Jessie      — raspy junkyard dealer
  SHERMAN:         "5Q0t7uMcjvnagumLfvZi", // Paul        — broadcast operations chief
  PRESTON:         "ZQe5CZNOzWyzPSCn5a3c", // James       — composed older operations
  IVAN:            "Zlb1dXrM653N07WRdFW3", // Joseph      — eastern-flavoured operations
  NIKOLAI:         "pNInz6obpgDQGcFmaJgB", // Adam        — heavy Russian-flavoured ops

  // === Bots: youth / casual / influencer ===
  SHANE:           "IKne3meq5aSn9XLyUdCD", // Charlie     — Aussie skater entrepreneur
  RILEY:           "IKne3meq5aSn9XLyUdCD", // Charlie     — Aussie content creator
  QUINN:           "IKne3meq5aSn9XLyUdCD", // Charlie     — casual brand manager
  SYDNEY:          "IKne3meq5aSn9XLyUdCD", // Charlie     — Aussie travel influencer
  CHRIS:           "CYw3kZ02Hs0563khs1Fj", // Dave        — relaxed British producer
  ARCHIE:          "CYw3kZ02Hs0563khs1Fj", // Dave        — British indie founder
  CONNOR:          "D38z5RcWu1voky8WS1ja", // Fin         — Irish folk-craft maker
  BRYCE:           "g5CIjZEefAph4nQFvHAz", // Ethan       — soft-spoken indie dev
  SPENCER:         "SOYHLrjzK2X1ezoPC6cr", // Harry       — anxious analyst
  DEREK:           "29vD33N1CtxCmqQRPOHJ", // Drew        — confident sales lead
  PAIGE:           "LcfcDJNUP1GQjkzn1xUU", // Emily       — calm operations
  CLARA:           "LcfcDJNUP1GQjkzn1xUU", // Emily       — meticulous editor
  DIANA:           "21m00Tcm4TlvDq8ikWAM", // Rachel      — composed strategist
  PRIYA:           "MF3mGyEYCl7XYWbV9V6O", // Elli        — emotional UX researcher
  SERENA:          "pMsXgVXv3BLzUgSXRplE", // Serena      — namesake hospitality lead
  VIVIAN:          "pMsXgVXv3BLzUgSXRplE", // Serena      — composed art-gallery curator
  SAM:             "yoZ06aMxZJJ28mfd3POQ", // Sam         — namesake all-purpose
  REGINA:          "pFZP5JQG7iQjIQuC4Bku", // Lily        — composed British matriarch

  // === Bots: media / music / video ===
  TERRENCE:        "VR6AewLTigWG4xSOukaG", // Arnold      — punchy music producer
  VANESSA:         "21m00Tcm4TlvDq8ikWAM", // Rachel      — YouTube strategist
};

function resolveVoiceId(character?: string, voiceIdOverride?: string): string {
  if (character && typeof character === "string") {
    const key = character.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    // Pablo's identity is voice-bound. Do not let a generic request override
    // or an accidental ELEVENLABS_VOICE_PABLO setting recast him.
    if (key === "PABLO") return PABLO_VOICE_ID;
    const envOverride = process.env[`ELEVENLABS_VOICE_${key}`];
    if (envOverride) return envOverride;
    if (CHARACTER_VOICES[key]) return CHARACTER_VOICES[key];
  }
  if (voiceIdOverride && /^[A-Za-z0-9]{16,}$/.test(voiceIdOverride)) {
    return voiceIdOverride;
  }
  return process.env.ELEVENLABS_VOICE_ID || PABLO_VOICE_ID;
}

function isSignatureVoice(character?: string): boolean {
  const key = character?.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return key === "PABLO" || key === "MILA";
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
        res.setHeader("X-TTS-Provider", "elevenlabs");
        res.setHeader("X-TTS-Character", character || "default");
        res.end(buffer);
        return;
      }
      const errBody = await elRes.text();
      console.warn("ElevenLabs TTS failed:", elRes.status, errBody);
    } catch (err) {
      console.warn("ElevenLabs TTS error:", err);
    }
  }

  // Pablo and Mila are voice-bound characters. A generic OpenAI fallback
  // silently recasts them and discards their assigned ElevenLabs accent,
  // making a credential/configuration problem sound like a creative choice.
  // Fail explicitly instead; the client keeps the written reply visible.
  if (isSignatureVoice(character)) {
    res.status(503).json({
      error: "Assigned character voice is temporarily unavailable",
      provider: "elevenlabs",
      character,
    });
    return;
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
      res.setHeader("X-TTS-Provider", "openai");
        res.end(buffer);
        return;
      }
      console.warn("OpenAI direct TTS failed:", directRes.status);
    }

    const { textToSpeech } = await import(
      "@workspace/integrations-openai-ai-server/audio"
    );
    const buffer = await textToSpeech(text, "onyx", "mp3");
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("X-TTS-Provider", "openai");
    res.end(buffer);
  } catch (err) {
    console.error("TTS error (all engines failed):", err);
    res.status(502).json({ error: "TTS failed", fallback: "browser" });
  }
}

// TTS is intentionally OPEN to guests — let Pablo's voice ring through on
// first visit so the storyteller intro has its full premium-voice impact.
// Per user direction: cost is recouped by the PABLO TAX markup applied
// elsewhere in the economy, so we don't meter the voice itself.
router.post("/tts", handleTts);

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
    model: getOpenAiTextModel(),
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
