import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { speechToText, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server/audio";
import { SolveInterviewQuestionBody } from "@workspace/api-zod";

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
      model: "gpt-5.2",
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

router.post("/interview/scan", async (req, res) => {
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
      model: "gpt-4o",
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

router.post("/interview/listen", async (req, res) => {
  const { audio } = req.body;
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
      model: "gpt-5.2",
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

function buildAdvisorPrompt(businessMemory: string): string {
  return `You are PABLO — the built-in AI assistant for Salaryman, an all-in-one tool that helps people during interviews (whether they're the interviewer or the interviewee), presentations, and networking. You are warm, friendly, and your #1 job is to make sure users never feel lost or frustrated.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO HELP NEW USERS:
If someone seems confused, asks "how does this work?", "what can I do here?", "I don't understand", or anything like that — walk them through the app clearly and simply. Don't assume they know tech terms. Treat them like a smart person who just hasn't seen this app before.

QUICK ORIENTATION you can give anyone:
"Salaryman has 4 main areas:
1. Home (where you are now) — PABLO AI chat + Website Analyzer to research URLs before meetings.
2. Code/Console — real-time help during interviews: Live Listen, Screen Scan, Interview Solver.
3. Hiring — post jobs, track applicants, manage staff, conduct interviews, and build slide decks.
4. Contacts — save people you meet with notes about them."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVERY FEATURE IN DETAIL:

HOME PAGE (/) — Pablo AI + Website Analyzer:
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
- When describing a feature: say exactly where to find it (e.g. "click Presenter in the top nav, then the Website Analyzer tab")
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
  const { messages, businessMemory = "" } = req.body as {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    businessMemory?: string;
  };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Missing messages" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 600,
      stream: true,
      messages: [
        { role: "system", content: buildAdvisorPrompt(businessMemory) },
        ...messages,
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
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
      model: "gpt-4o",
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
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 300,
      stream: false,
      messages: [
        { role: "system", content: context || "You are PABLO, a gritty in-world AI assistant. Be brief and stay in character." },
        { role: "user", content: message },
      ],
    });
    const response = completion.choices[0]?.message?.content?.trim() ?? "Signal lost.";
    res.json({ response });
  } catch (err) {
    console.error("Error in /advisor/chat:", err);
    res.status(500).json({ error: "Failed to get response" });
  }
});

export default router;
