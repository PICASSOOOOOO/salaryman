import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";
import { speechToText, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server/audio";
import { SolveInterviewQuestionBody } from "@workspace/api-zod";
import { streamWithRouter } from "../lib/ai-router";
import { completeInternalText } from "../lib/internal-ai";
import { requireFeature, requirePro } from "../middlewares/requirePro";
import multer from "multer";

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are assisting a senior tech startup executive — a CEO who has actively coded throughout their career, built systems from scratch, and led engineering teams through tight deadlines. They think in trade-offs, systems, and team dynamics. Their code is practical, readable, and well-commented — not competition-level clever. They value maintainability, risk awareness, and clear reasoning. They speak like someone who has shipped real products under pressure and knows how to get the most out of a team based on individual strengths.

When writing code: it should be correct and functional, use clear variable names, and include comments that explain WHY decisions were made — not just what the code does. Occasionally include a note showing production awareness (e.g., "# TODO: add input validation in production" or "# works for given constraints, would cache this at scale"). Write it like someone who cares about their teammates reading it later.

When explaining: speak like a technical leader briefing their team — cover the approach, the trade-offs, what could go wrong, and how you'd distribute the work. Never sound like a textbook.`;

router.post("/interview/solve", async (req, res) => {
  const parsed = SolveInterviewQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { question, language, mode } = parsed.data;

  if (mode === "say_it") {
    const { hasFeature } = await import("../lib/plan");
    if (!req.isAuthenticated?.()) {
      res.status(401).json({ error: "Login required" });
      return;
    }
    const has = await hasFeature(req.user.id, req.user.email, "say_this");
    if (!has) {
      res.status(403).json({ error: "Say This subscription required", feature: "say_this", price: 5, upgrade: "/upgrade" });
      return;
    }
  }

  const modePrompts: Record<string, string> = {
    hint: `As a technical leader giving a nudge — not the answer — give 1-2 sentences pointing toward the right approach for this ${language} problem. Mention the key concept or data structure to think about. Frame it like you're thinking out loud with a capable engineer, not lecturing. Make them feel like they're close.\n\nProblem: ${question}`,

    solution: `Write a complete, working ${language} solution for this problem as a senior-but-practical engineer would. Code must be correct. Use clear variable names. Add comments that explain WHY each decision was made, not just what the code does. Include at least one comment showing production awareness (e.g. "# TODO: validate input in production" or "# works within given constraints"). End with a one-line complexity note.\n\nProblem: ${question}`,

    explain: `Explain how you'd approach this ${language} problem as if briefing your engineering team before starting the sprint. Cover: (1) what the problem is really asking, (2) the approach and why you'd choose it over alternatives, (3) what risks or edge cases you'd flag before writing a single line, (4) how you'd split the work across the team based on strengths. Then show the code with key comments. Talk like a leader who also writes code.\n\nProblem: ${question}`,

    complexity: `Analyze the time and space complexity of this ${language} problem as you would in a technical architecture review — not just the Big-O math, but what it means in practice. Cover: best/average/worst cases, where the real bottleneck is, when this complexity actually matters vs. when optimization would be premature, and how you'd approach it differently at 10x scale. Speak like someone who has debugged production systems at scale.\n\nProblem: ${question}`,

    say_it: `Give EXACTLY 3 bullet points for a startup tech CEO to say out loud in a coding interview right now. They understand the problem, make architectural decisions, and lead a team — they don't show off LeetCode tricks. Rules: NO code. NO jargon. Each bullet is ONE short plain sentence (max 15 words). Sound natural when spoken aloud. Frame it from a leader's perspective — cover the approach, a trade-off you'd consider, or a team/production implication.\n\nProblem: ${question}\n\nFormat:\n• [sentence]\n• [sentence]\n• [sentence]`,
  };

  const userMessage = modePrompts[mode] ?? modePrompts.solution;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
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
  } catch (err) {
    console.error("Error calling OpenAI:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to get response from AI" })}\n\n`);
  }

  res.end();
});

const SCAN_PROMPTS = {
  bullets: `Look at this screenshot carefully. Find any coding interview question, technical problem, chat message, or task description visible on the screen.

Then give EXACTLY 3 bullet points that the person can read out loud right now to sound smart. Rules: NO code. NO jargon. Each bullet is ONE short plain sentence (max 15 words). Make it sound natural, like something a smart person would say in conversation.

Format:
• [sentence]
• [sentence]
• [sentence]

If you cannot identify a clear question, describe what you see and give 3 general smart-sounding things to say about it.`,

  chat: `Look at this screenshot of a technical interview or chat conversation. Find the most recent message or question directed at the person being interviewed.

Write the reply they should type back. Rules:
- ONE sentence. Casual American texting style — the way a smart 30-something in tech actually types to a coworker.
- Lowercase is fine. Skip punctuation if it feels more natural. Contractions always ("we're", "it's", "that's").
- Openers like: "yeah", "oh for sure", "tbh", "lol yeah", "ngl", "right so", "honestly", "haha yeah"
- Never sounds formal, polished, or written. Sounds like a Slack message.
- No bullet points. No explanation. Just the one sentence.

Output ONLY the reply text. Nothing else.`,
};

router.post("/interview/scan", requireFeature("screen_scan"), async (req, res) => {
  const { image, responseMode = "bullets" } = req.body;
  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "Missing image data" });
    return;
  }

  const promptText = SCAN_PROMPTS[responseMode as keyof typeof SCAN_PROMPTS] ?? SCAN_PROMPTS.bullets;
  const maxTokens = responseMode === "chat" ? 80 : 400;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" },
            },
            { type: "text", text: promptText },
          ],
        },
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
  } catch (err) {
    console.error("Error in /scan:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to analyze screen" })}\n\n`);
  }

  res.end();
});

router.post("/interview/listen", requireFeature("live_listen"), async (req, res) => {
  // Defensive: req.body may be undefined when the client posts without a
  // Content-Type: application/json header, when the JSON parse fails, or
  // when an upstream proxy strips the body. Crashing the request handler
  // surfaces as 500s and shows up as the production error
  // "Cannot destructure property 'audio' of 't.body' as it is undefined".
  const { audio } = (req.body ?? {}) as { audio?: unknown };
  if (!audio || typeof audio !== "string") {
    res.status(400).json({ error: "Missing audio data" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const audioBuffer = Buffer.from(audio, "base64");
    const { buffer, format } = await ensureCompatibleFormat(audioBuffer);
    const transcript = await speechToText(buffer, format);

    if (!transcript || !transcript.trim()) {
      res.write(`data: ${JSON.stringify({ error: "Could not hear anything. Try again." })}\n\n`);
      res.end();
      return;
    }

    const sayItPrompt = `You are helping a non-technical person sound smart in a coding interview. They just heard this question: "${transcript}"\n\nGive EXACTLY 3 bullet points. Rules: NO code whatsoever. NO jargon. Each bullet is ONE short simple sentence (max 15 words). Write it so they can read it off a screen and say it out loud naturally right now. Think of it as a teleprompter script.\n\nFormat:\n• [sentence]\n• [sentence]\n• [sentence]`;

    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 300,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: sayItPrompt },
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
  } catch (err) {
    console.error("Error in /listen:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to process audio" })}\n\n`);
  }

  res.end();
});

const MAX_MEDIA_SIZE = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_SIZE },
});

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp', 'heic', 'svg', 'cr2', 'nef', 'raw']);
const AUDIO_EXTENSIONS = new Set(['wav', 'mp3', 'aac', 'ogg', 'flac', 'wma', 'm4a', 'aiff', 'aif', 'opus', 'amr']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', '3gp', 'mpeg', 'mpg', 'm4v']);

type MediaType = 'image' | 'audio' | 'video' | 'unknown';

function detectMediaTypeByMagicBytes(buffer: Buffer): MediaType {
  if (buffer.length < 12) return 'unknown';

  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image';
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image';
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image';
  // BMP
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image';
  // TIFF (little-endian or big-endian)
  if ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)) return 'image';
  // WebP (RIFF....WEBP)
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image';

  // WAV (RIFF....WAVE)
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45) return 'audio';
  // MP3 (frame sync or ID3)
  if ((buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) ||
      (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)) return 'audio';
  // FLAC
  if (buffer[0] === 0x66 && buffer[1] === 0x4c && buffer[2] === 0x61 && buffer[3] === 0x43) return 'audio';
  // OGG
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return 'audio';
  // AIFF
  if (buffer[0] === 0x46 && buffer[1] === 0x4f && buffer[2] === 0x52 && buffer[3] === 0x4d) return 'audio';

  // MP4/MOV/M4A/M4V/3GP (ftyp box)
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (brand.startsWith('m4a') || brand.startsWith('m4b')) return 'audio';
    return 'video';
  }
  // WebM/MKV (EBML header)
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'video';
  // AVI (RIFF....AVI )
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x41 && buffer[9] === 0x56 && buffer[10] === 0x49) return 'video';

  return 'unknown';
}

function detectMediaType(buffer: Buffer, filename: string, mimeType?: string): MediaType {
  const byMagic = detectMediaTypeByMagicBytes(buffer);
  if (byMagic !== 'unknown') return byMagic;

  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
  }

  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'unknown';
}

async function extractVideoFrames(videoBuffer: Buffer, count = 4): Promise<Buffer[]> {
  const { spawn } = await import('child_process');
  const { writeFile, readFile, unlink, readdir } = await import('fs/promises');
  const { randomUUID } = await import('crypto');
  const { tmpdir } = await import('os');
  const { join } = await import('path');

  const id = randomUUID();
  const inputPath = join(tmpdir(), `vid-${id}.mp4`);
  const outPattern = join(tmpdir(), `frame-${id}-%03d.jpg`);

  try {
    await writeFile(inputPath, videoBuffer);

    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-i', inputPath,
        '-vf', `select='eq(n,0)+eq(n,30)+eq(n,60)+eq(n,90)',setpts=N/FRAME_RATE/TB`,
        '-frames:v', String(count),
        '-q:v', '3',
        '-y',
        outPattern,
      ]);
      ff.stderr.on('data', () => {});
      ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg frame extraction exited ${code}`)));
      ff.on('error', reject);
    });

    const dir = tmpdir();
    const files = (await readdir(dir)).filter(f => f.startsWith(`frame-${id}-`)).sort();
    const frames: Buffer[] = [];
    for (const f of files) {
      frames.push(await readFile(join(dir, f)));
      await unlink(join(dir, f)).catch(() => {});
    }
    return frames;
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}

async function extractAudioFromVideo(videoBuffer: Buffer): Promise<Buffer> {
  const { spawn } = await import('child_process');
  const { writeFile, readFile, unlink } = await import('fs/promises');
  const { randomUUID } = await import('crypto');
  const { tmpdir } = await import('os');
  const { join } = await import('path');

  const id = randomUUID();
  const inputPath = join(tmpdir(), `vid-audio-${id}.mp4`);
  const outputPath = join(tmpdir(), `vid-audio-${id}.wav`);

  try {
    await writeFile(inputPath, videoBuffer);
    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-i', inputPath, '-vn', '-f', 'wav', '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', '-y', outputPath,
      ]);
      ff.stderr.on('data', () => {});
      ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg audio extract exited ${code}`)));
      ff.on('error', reject);
    });
    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

router.post("/interview/analyze-media", requirePro(), upload.single('file'), async (req, res) => {
  let fileBuffer: Buffer;
  let filename: string;
  let mimeType: string | undefined;

  if (req.file) {
    fileBuffer = req.file.buffer;
    filename = req.file.originalname;
    mimeType = req.file.mimetype;
  } else {
    const body = req.body as { file?: string; filename?: string; mimeType?: string };
    if (!body.file || typeof body.file !== 'string' || !body.filename) {
      res.status(400).json({ error: "Missing file data or filename" });
      return;
    }
    fileBuffer = Buffer.from(body.file, 'base64');
    filename = body.filename;
    mimeType = body.mimeType;
  }

  if (fileBuffer.length > MAX_MEDIA_SIZE) {
    res.status(413).json({ error: `File too large. Max size is 25 MB.` });
    return;
  }

  const mediaType = detectMediaType(fileBuffer, filename, mimeType);
  if (mediaType === 'unknown') {
    res.status(400).json({ error: `Unsupported file format. Upload an image, audio, or video file.` });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendSSE = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    if (mediaType === 'image') {
      sendSSE({ phase: 'analyzing', label: 'Analyzing image...' });

      const ext = filename.split('.').pop()?.toLowerCase() ?? 'png';
      const mime = mimeType || (ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
      const dataUrl = `data:${mime};base64,${fileBuffer.toString('base64')}`;

      const stream = await openai.chat.completions.create({
        model: getOpenAiTextModel(),
        max_completion_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            { type: "text", text: `Analyze this image in detail for research purposes. Cover:\n1. Overall description — what is shown\n2. Objects, people, text, or symbols identified\n3. Composition and visual style analysis\n4. Any data, charts, or information that can be extracted\n5. Technical details (estimated resolution quality, format observations)\n\nBe thorough and specific. This is for research, not casual description.` },
          ],
        }],
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) sendSSE({ content });
      }
    } else if (mediaType === 'audio') {
      sendSSE({ phase: 'transcribing', label: 'Transcribing audio...' });

      const { buffer: compatBuffer, format } = await ensureCompatibleFormat(fileBuffer);
      const transcript = await speechToText(compatBuffer, format);

      if (!transcript?.trim()) {
        sendSSE({ content: "**Transcription:** No speech detected in this audio file.\n\n" });
        sendSSE({ done: true });
        res.end();
        return;
      }

      sendSSE({ content: `**Transcription:**\n\n${transcript}\n\n---\n\n` });
      sendSSE({ phase: 'analyzing', label: 'Analyzing audio content...' });

      const stream = await openai.chat.completions.create({
        model: getOpenAiTextModel(),
        max_completion_tokens: 2048,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Analyze this audio transcription for research purposes:\n\n"${transcript}"\n\nProvide:\n1. Content summary\n2. Key topics and themes\n3. Tone and communication style analysis\n4. Language identification\n5. Notable quotes or important statements\n6. Any actionable insights` },
        ],
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) sendSSE({ content });
      }
    } else if (mediaType === 'video') {
      sendSSE({ phase: 'extracting', label: 'Extracting frames and audio...' });

      let frames: Buffer[] = [];
      let audioTranscript = '';

      const [framesResult, audioResult] = await Promise.allSettled([
        extractVideoFrames(fileBuffer, 4),
        (async () => {
          const audioBuffer = await extractAudioFromVideo(fileBuffer);
          if (audioBuffer.length > 1000) {
            const { buffer: compatBuffer, format } = await ensureCompatibleFormat(audioBuffer);
            return await speechToText(compatBuffer, format);
          }
          return '';
        })(),
      ]);

      if (framesResult.status === 'fulfilled') {
        frames = framesResult.value;
      } else {
        console.error("Frame extraction failed:", framesResult.reason);
      }

      if (audioResult.status === 'fulfilled') {
        audioTranscript = audioResult.value;
      } else {
        console.error("Audio extraction failed:", audioResult.reason);
      }

      if (audioTranscript?.trim()) {
        sendSSE({ content: `**Audio Transcription:**\n\n${audioTranscript}\n\n---\n\n` });
      }

      sendSSE({ phase: 'analyzing', label: 'Analyzing video content...' });

      const imageMessages: Array<{ type: "image_url"; image_url: { url: string; detail: "low" } }> = frames.map(f => ({
        type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${f.toString('base64')}`, detail: "low" as const },
      }));

      const analysisPrompt = `Analyze this video for research purposes. ${frames.length > 0 ? `I've extracted ${frames.length} key frames for visual analysis.` : 'No frames could be extracted.'} ${audioTranscript ? `The audio transcript is: "${audioTranscript}"` : 'No audio could be extracted.'}\n\nProvide:\n1. Visual content summary — what is shown across the frames\n2. Scene transitions and key moments\n3. ${audioTranscript ? 'Audio/speech content analysis and how it relates to the visuals' : 'Visual-only analysis since no audio was detected'}\n4. Overall research summary combining visual and audio elements\n5. Key takeaways and notable details`;

      const stream = await openai.chat.completions.create({
        model: getOpenAiTextModel(),
        max_completion_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            ...imageMessages,
            { type: "text", text: analysisPrompt },
          ],
        }],
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) sendSSE({ content });
      }
    }

    sendSSE({ done: true });
  } catch (err) {
    console.error("Error in /analyze-media:", err);
    sendSSE({ error: "Failed to analyze media file" });
  }

  res.end();
});

function buildAdvisorPrompt(businessMemory: string): string {
  return `You are PABLO — the built-in AI assistant for Salaryman, an all-in-one tool that helps people during interviews (whether they're the interviewer or the interviewee), presentations, and networking. You are warm, friendly, and your #1 job is to make sure users never feel lost or frustrated.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO HELP NEW USERS:
If someone seems confused, asks "how does this work?", "what can I do here?", "I don't understand", or anything like that — walk them through the app clearly and simply. Don't assume they know tech terms. Treat them like a smart person who just hasn't seen this app before.

QUICK ORIENTATION you can give anyone:
"Salaryman has 4 main areas:
1. Home (where you are now) — PABLO chat + Website Analyzer to research URLs before meetings.
2. Code/Console — real-time help during interviews: Live Listen, Screen Scan, Interview Solver.
3. Hiring — post jobs, track applicants, manage staff, conduct interviews, and build slide decks.
4. Contacts — save people you meet with notes about them."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVERY FEATURE IN DETAIL:

HOME PAGE (/) — Pablo + Website Analyzer:
• PABLO tab (where this chat lives) — ask me anything, any topic, anytime.
• Translator — free for all users. Translate text between languages, or speak and have it translated.
• Website Analyzer tab — paste up to 5 website URLs, the app reads them and gives you a clean summary of key takeaways. Great for researching a company before a meeting.

CODE/CONSOLE (/console) — click "CODE/CONSOLE" (or "CIPHER-X") in the top nav:
• LIVE LISTEN button — click it, speak a question out loud (e.g. something an interviewer just asked you), get 3 short bullet points to say back naturally. Great when you need words fast.
• SCAN SCREEN → Once — takes a screenshot of your entire screen right now, analyzes it, gives 3 bullets about what it sees. Useful if there's a problem on screen you need help with.
• SCAN SCREEN → Chat Reply — reads a chat message visible on your screen, writes one natural reply for you, then auto-types it like a human would. Perfect for live chats during meetings.
• SCAN SCREEN → Auto — keeps scanning every 5, 10, or 15 seconds on a loop. Good for long meetings where content keeps changing.
• Problem box — type or paste any question, coding problem, or topic. Then hit one of the buttons:
  - Get Hint: a nudge in the right direction without giving it away
  - Full Solution: complete answer with explanation
  - Explain Approach: how to talk through it out loud, confidently
  - Analyze Complexity: how hard/efficient it is and why that matters
  - Say This: 3 plain-English sentences to say out loud right now
• Language selector — pick the programming language if it's a coding question
• Type Mode toggle — when on, the answer types itself out naturally instead of appearing all at once (looks more human)

HIRING (/hiring) — click "HIRING" (or "RECRUIT-8") in the top nav:
• Job Board tab — post and manage open positions.
• Applicants tab — track candidates through the pipeline.
• Staff tab — manage your active team roster.
• Interview Conductor tab — tell it who you're interviewing (or what role/topic), it generates smart questions with coaching notes. The current question shows up big so you can read it live.
• Presentation tab — type a topic, AI builds a full slide deck with talking points. Then go fullscreen and screen-share — your audience sees the slides, you see your script below.

CONTACT COLLECTOR (/contacts) — click "Contacts" in the top nav:
• Add anyone you meet — name, email, phone, hometown, notes, etc.
• Export to CSV anytime, or email the list to yourself
• All contacts are saved to your account and follow you across devices

CALENDAR (/calendar) — click "CHRONO-4" or "Calendar" in the top nav (Pro feature):
• Schedule appointments and events with title, date/time, location, and notes
• Three views: month, week, and day — click any day to add an event
• Set reminder alarms (5 min, 15 min, 1 hour, etc) — browser notifications fire automatically
• Send email confirmations to anyone directly from the calendar
• Ask me things like "schedule a meeting tomorrow at 3pm", "what's on my calendar", or "remind me about the project review"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICE & CONVERSATION MODE:
You have full voice capabilities. Users can talk to you out loud using the CONV (Conversation Mode) button on the Home page. When they speak, you hear them through their microphone via speech recognition, and you respond with your voice using ElevenLabs text-to-speech. This is a hands-free back-and-forth conversation — just like a phone call. You also serve as the AI call screening agent on the phone system, answering inbound calls and screening callers before transferring them. You ARE able to hear users when they speak — never say you can't hear them or that you're text-only. If conversation mode isn't working, suggest they check their browser microphone permissions or try opening the app in a new browser tab.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR ROLE:
- Answer any general question (facts, advice, explanations) like a knowledgeable friend
- Guide users to the right Salaryman tool for what they need
- Never make someone feel dumb for not knowing something
- If they ask how to do something in the app, give them clear step-by-step directions
- When they want to go somewhere in the app, include an action tag

WHAT YOU KNOW ABOUT THIS USER:
${businessMemory || "Nothing yet. Be welcoming — they may be new."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE STYLE:
- Casual, warm, clear American English — like a helpful friend, not a manual
- Short by default (2-3 sentences). Give more detail only when the user needs it.
- When describing a feature: say exactly where to find it (e.g. "scroll down on the Home page to the Website Analyzer")
- When they want to go somewhere: always include an action tag
- Never robotic, never condescending, never over-technical

ACTION TAG FORMAT (include at the END only when navigating to a tool):
<action>{"type":"navigate","to":"/console","label":"Open Code/Console","description":"Live Listen, Screen Scan, and Interview Solver waiting for you","autoFill":{}}</action>

Rules for action tags:
- "to": page path — "/" for home, "/console", "/hiring", "/contacts", or "/calendar"
- "tab": optional — for /hiring only: "jobs", "applicants", "staff", "conduct", or "present"
- "label": button text shown to user (keep it short and action-y)
- "description": 1 short encouraging sentence
- "autoFill": optional — pre-fills the form on the target page. For /hiring with tab "conduct": subject, role, style, count. For /hiring with tab "present": topic, context, slideCount. For / tab "analyzer": urls (array), focus.
- Only ONE action tag per response
- Skip action tags for informational/conversational answers`;
}

router.post("/interview/advisor", async (req, res) => {
  let { messages, businessMemory = "" } = req.body as {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    businessMemory?: string;
  };
  if (!Array.isArray(messages)) {
    if (messages && typeof messages === 'object') {
      const converted = Object.values(messages) as any[];
      if (converted.length > 0 && converted[0]?.role) {
        messages = converted;
      }
    }
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Missing messages" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    await streamWithRouter(
      messages,
      buildAdvisorPrompt(businessMemory),
      { maxTokens: 600 },
      (chunk) => {
        if (chunk.agent) res.write(`data: ${JSON.stringify({ agent: chunk.agent })}\n\n`);
        if (chunk.content) res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        if (chunk.done) res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        if (chunk.error) res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`);
      }
    );
  } catch (err) {
    console.error("Error in /advisor:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to get response" })}\n\n`);
  }

  res.end();
});

// ── POST /interview/extract-context ───────────────────────────────────────────
// Silently extract and update business context from recent conversation
router.post("/interview/extract-context", async (req, res) => {
  const { messages, existingContext = "" } = req.body as {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    existingContext?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.json({ context: existingContext });
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 300,
      stream: false,
      messages: [
        {
          role: "system",
          content: `You extract and update business context from a conversation. Output a short, dense text note (3-8 bullet points max) summarizing what you know about the user's business, industry, role, goals, and needs. Only include concrete facts inferred from the conversation. Skip generic info.

Existing context:
${existingContext || "None yet."}

Update it based on the new conversation. Keep it brief. Use bullet points. Plain text only — no headers, no markdown formatting beyond bullets.`,
        },
        ...messages.slice(-10),
        {
          role: "user",
          content: "Update the business context based on this conversation.",
        },
      ],
    });

    const context = completion.choices[0]?.message?.content?.trim() ?? existingContext;
    res.json({ context });
  } catch {
    res.json({ context: existingContext });
  }
});

// ── POST /advisor/chat ────────────────────────────────────────────────────────
// Pablo in-world AI chat used by World.tsx, WorldPlay.tsx, MobileTerminal.tsx
router.post("/advisor/chat", async (req, res) => {
  const { message, context = "" } = req.body as { message: string; context?: string };
  if (!message?.trim()) {
    res.status(400).json({ error: "Missing message" });
    return;
  }
  try {
    const completion = await completeInternalText(
      [
        { role: "system", content: context || "You are PABLO, a gritty in-world AI assistant. Be brief and stay in character." },
        { role: "user", content: message },
      ],
      { maxTokens: 300, prefer: "gpt", fallback: true },
    );
    res.json({ response: completion.content || "Signal lost." });
  } catch (err) {
    console.error("Error in /advisor/chat:", err);
    res.status(500).json({ error: "Failed to get response" });
  }
});

export default router;
