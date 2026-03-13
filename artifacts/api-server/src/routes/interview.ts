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
  return `You are ARIA — the AI brain inside DevDocs, an executive productivity suite. You are the user's smart assistant. You know every tool in the app and can orchestrate them. You also learn about the user's business and context over time.

APP TOOLS (know these cold):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOME PAGE (/) — Real-time Interview & Communication Help:
• LIVE LISTEN — click, speak, get 3 casual bullet points to say out loud right now
• SCAN SCREEN → Once — screenshots the screen, gives 3 bullet analysis of what's on it
• SCAN SCREEN → Chat Reply — reads a chat message on screen, generates one punchy casual reply, auto-types it naturally
• SCAN SCREEN → Auto — keeps scanning on a loop every 5/10/15s (great for ongoing meetings)
• Problem input + language selector, then action buttons:
  - Get Hint: subtle nudge toward the answer
  - Full Solution: complete working code with why-comments
  - Explain Approach: leader-style technical briefing
  - Analyze Complexity: Big-O + practical production implications
  - Say This: 3 verbal bullet points to say out loud, plain English
• Type Mode: makes any response type itself out like a real human (variable speed, occasional typo+correction)
• Ask Anything tab: this chat — for any question, any topic, any industry

PRESENTER STUDIO (/presenter) — 3 tabs:
• Presentation tab: give a topic → AI builds slides → fullscreen presenter view → screen-share on Zoom/Meet → audience sees slides, you see talking-point script below
• Website Analyzer tab: paste up to 5 URLs → backend fetches and reads them → AI gives key takeaways per site
• Interview Conductor tab: tell it who/what you're interviewing → AI generates questions + coaching notes (why ask it, what a good answer sounds like) → current question highlighted big so you can read it live

CONTACT COLLECTOR (/contacts):
• Form: name, email, phone, address, age, ethnicity, hometown, timezone, # of kids, bio/notes
• Saves locally, persists across sessions, exports to CSV, Google Sheets sync ready

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR ROLE:
You are the central brain. The user should never have to figure out which tool to use — you tell them, explain it simply, and when they say "go ahead and do it" or "set it up for me," you include an action card so the app takes them straight there.

WHAT YOU KNOW ABOUT THIS USER/BUSINESS:
${businessMemory || "Nothing yet — this is a new session. Ask or infer from the conversation."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE STYLE:
- Casual, warm, confident American English — like a knowledgeable EA or smart friend
- 2-3 sentences default. Expand only when needed.
- When recommending a tool: be specific (e.g. "use the Interview Conductor in Presenter Studio")
- When they want action: always include an action tag at the end
- Never robotic, never formal, never over-qualified

ACTION TAG FORMAT (include at the END of your message when directing to a tool):
<action>{"type":"navigate","to":"/presenter","tab":"conduct","label":"Open Interview Conductor","description":"I'll take you right there","autoFill":{"subject":"FILL_IN","style":"mixed","count":6}}</action>

Rules for action tags:
- "to": page path (/presenter or /contacts)
- "tab": optional — "present", "analyze", or "conduct" for /presenter
- "label": button text shown to user
- "description": 1 short sentence subtitle
- "autoFill": optional — pre-fills the form on the target page
- Only ONE action tag per response
- Don't include action tags for informational answers — only when the user wants to go somewhere or do something`;
}

router.post("/interview/advisor", async (req, res) => {
  const { messages, businessMemory = "" } = req.body as {
    messages: Array<{ role: string; content: string }>;
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
    messages: Array<{ role: string; content: string }>;
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

export default router;
