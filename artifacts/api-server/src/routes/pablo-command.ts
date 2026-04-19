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

const PABLO_TERMINAL_PROMPT = `You are Pablo, the voice-first AI butler for the Salaryman platform by Picasso.AI. The user is in a fullscreen terminal — no UI is visible except your core. You answer with your VOICE.

Your job: be a Jarvis. The user speaks; you respond and act. You can navigate, log them out, search, or just answer a question. Pick the right tool — don't ask for permission, just do it and confirm in one short sentence.

TOOLS:
- navigate_to({path, spoken}) — open any app page. Use the closest match from the known paths; if the user names something not listed, still pick the nearest path.
- log_out({spoken}) — sign the user out of the platform.
- search({query, spoken}) — run a global search across the app.
- open_external({url, spoken}) — open an external https URL in a new tab (only for clearly external sites the user named).
- speak only (no tool) — for questions, explanations, or chit-chat.

CRITICAL RULES:
- Keep spoken replies SHORT: 1–2 sentences, ~40 words max. The user hears you, doesn't read you.
- "open / show / go to / take me to / pull up / switch to" → navigate_to.
- "log me out / sign out / log off / sign me off" → log_out.
- "search / find / look up X" → search.
- Never describe the UI or list options unless asked. Be a butler, not a menu.

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
                spoken: { type: "string", description: "Brief 1-sentence spoken confirmation." },
              },
              required: ["path", "spoken"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "log_out",
            description: "Sign the user out of Salaryman.",
            parameters: {
              type: "object",
              properties: {
                spoken: { type: "string", description: "Brief 1-sentence spoken confirmation, e.g. 'Logging you out.'" },
              },
              required: ["spoken"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "search",
            description: "Run a global app search.",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string", description: "What to search for." },
                spoken: { type: "string", description: "Brief 1-sentence spoken confirmation." },
              },
              required: ["query", "spoken"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "open_external",
            description: "Open an external HTTPS URL in a new tab.",
            parameters: {
              type: "object",
              properties: {
                url: { type: "string", description: "Full https:// URL." },
                spoken: { type: "string", description: "Brief 1-sentence spoken confirmation." },
              },
              required: ["url", "spoken"],
            },
          },
        },
      ],
    });

    const choice = completion.choices[0];
    const toolCall = choice?.message?.tool_calls?.[0];
    if (toolCall && toolCall.type === "function") {
      const name = toolCall.function?.name;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(toolCall.function?.arguments || "{}"); } catch {}
      const spoken = typeof args.spoken === "string" && args.spoken.trim() ? args.spoken : "On it.";

      if (name === "navigate_to") {
        const path = typeof args.path === "string" && args.path.startsWith("/") ? args.path : "/";
        res.json({ say: spoken, action: { kind: "navigate", path } });
        return;
      }
      if (name === "log_out") {
        res.json({ say: spoken, action: { kind: "logout" } });
        return;
      }
      if (name === "search") {
        const query = typeof args.query === "string" ? args.query : "";
        res.json({ say: spoken, action: { kind: "search", query } });
        return;
      }
      if (name === "open_external") {
        const url = typeof args.url === "string" && /^https:\/\//i.test(args.url) ? args.url : "";
        if (url) {
          res.json({ say: spoken, action: { kind: "external", url } });
          return;
        }
      }
    }

    const reply = choice?.message?.content?.trim() || "I'm here.";
    res.json({ say: reply, action: null });
  } catch (err) {
    console.error("[Pablo Command] Error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Pablo is offline" });
  }
});

export default router;
