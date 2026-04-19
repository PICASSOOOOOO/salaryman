import { Router, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

const KNOWN_PATHS = [
  "/", "/console", "/dashboard", "/profile", "/profile/apis", "/profile/admin",
  "/calendar", "/business/calendar", "/business/tasks", "/business/team",
  "/business/contacts", "/business/leads", "/business/deals", "/business/invoices",
  "/business/estimates", "/business/bills", "/business/expenses", "/business/payroll",
  "/business/balance-sheet", "/business/profit-loss", "/business/hiring",
  "/business/announcements", "/business/documents", "/business/time-tracking",
  "/business/partnerships", "/business/interview", "/business/resume",
  "/contacts", "/documents", "/hiring", "/job-offers", "/insurance",
  "/bots", "/bots/office", "/bots/jobs", "/bots/templates", "/bots/prompt-sensei",
  "/agents", "/jean-claw", "/campaigns", "/feedback", "/features",
  "/creative/studio", "/creative/writer", "/creative/lab", "/creative/darkroom",
  "/creative/design", "/creative/brand", "/creative/media", "/creative/campaigns",
  "/creative/production", "/creative/stems",
  "/intel/dashboard", "/intel/reports", "/intel/goals", "/intel/seo",
  "/intel/agents", "/intel/balance-sheet", "/intel/video",
  "/console/agents", "/console/scraper", "/console/vault", "/console/video",
  "/world", "/world/play", "/admin", "/admin/dev-tasks", "/admin/tickets",
  "/investors", "/legal",
];

const PABLO_TERMINAL_PROMPT = `You are Pablo, the voice-first AI navigator for the Salaryman platform by Picasso.AI. The user is in a fullscreen terminal — no UI is visible except your nebula. You answer with your VOICE.

Your job: be a Jarvis. The user speaks; you respond and, when they want a page or feature, navigate them there using the navigate_to tool. If they ask "what does X do" or want information, just speak — concise, conversational, no markdown.

CRITICAL RULES:
- Keep spoken replies SHORT: 1–2 sentences, ~40 words max. The user hears you, doesn't read you.
- If the user asks to "open", "show", "go to", "take me to", "pull up", "bring up", "switch to" anything — call navigate_to.
- If the user asks a question or wants you to explain something — answer in speech, no navigation.
- If you navigate, also speak a brief confirmation ("Opening your calendar.").
- Never describe the UI; never list options unless asked. Be a butler, not a menu.
- If you don't know exactly which path, pick the closest match from the known paths and say where you're taking them.

Available paths:
${KNOWN_PATHS.join(", ")}`;

router.post("/chat/pablo/command", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { transcript, history } = (req.body ?? {}) as {
    transcript?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    res.status(400).json({ error: "transcript required" });
    return;
  }

  try {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: PABLO_TERMINAL_PROMPT },
    ];
    if (Array.isArray(history)) {
      for (const m of history.slice(-10)) {
        if (!m || typeof m.content !== "string") continue;
        if (m.role !== "user" && m.role !== "assistant") continue;
        messages.push({ role: m.role, content: m.content.slice(0, 1000) });
      }
    }
    messages.push({ role: "user", content: transcript.slice(0, 1500) });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 200,
      temperature: 0.6,
      tools: [
        {
          type: "function",
          function: {
            name: "navigate_to",
            description: "Open a page in the Salaryman app for the user.",
            parameters: {
              type: "object",
              properties: {
                path: { type: "string", description: "App path to open, e.g. /calendar, /bots/office" },
                spoken: { type: "string", description: "Brief 1-sentence spoken confirmation, e.g. 'Opening your calendar.'" },
              },
              required: ["path", "spoken"],
            },
          },
        },
      ],
    });

    const choice = completion.choices[0];
    const toolCall = choice?.message?.tool_calls?.[0];
    if (toolCall && toolCall.type === "function" && toolCall.function?.name === "navigate_to") {
      try {
        const args = JSON.parse(toolCall.function.arguments || "{}") as { path?: string; spoken?: string };
        const path = typeof args.path === "string" && args.path.startsWith("/") ? args.path : "/";
        const spoken = typeof args.spoken === "string" && args.spoken.trim() ? args.spoken : `Opening ${path}.`;
        res.json({ say: spoken, navigate: path });
        return;
      } catch (parseErr) {
        // fall through to plain reply
      }
    }

    const reply = choice?.message?.content?.trim() || "I'm here.";
    res.json({ say: reply, navigate: null });
  } catch (err) {
    console.error("[Pablo Command] Error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Pablo is offline" });
  }
});

export default router;
