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

// Every navigable destination in the app, with a short human label so the LLM
// can match a user's spoken intent (e.g. "the game", "my paycheck") to a path.
const PATH_CATALOG: Array<{ path: string; label: string }> = [
  // Core
  { path: "/",                         label: "Home / main landing" },
  { path: "/features",                 label: "Features overview" },
  { path: "/pricing",                  label: "Pricing plans" },
  { path: "/upgrade",                  label: "Upgrade / subscription" },
  { path: "/mobile",                   label: "Mobile terminal" },
  { path: "/pablo",                    label: "Pablo voice terminal (this page)" },

  // World / MMO game
  { path: "/world",                    label: "World menu — Salaryman MMO main menu" },
  { path: "/world/play",               label: "Play the Salaryman MMO game / open world" },

  // Profile / account
  { path: "/profile",                  label: "My profile" },
  { path: "/profile/apis",             label: "Profile — API keys & integrations" },
  { path: "/profile/admin",            label: "Admin profile" },
  { path: "/profile/platform",         label: "Platform settings" },
  { path: "/profile/moderator",        label: "Moderator panel" },
  { path: "/profile/world-map",        label: "World map progress" },
  { path: "/profile/admin/billboards", label: "Admin — billboards" },
  { path: "/profile/admin/tickets",    label: "Admin — support tickets" },
  { path: "/profile/admin/dev-tasks",  label: "Admin — dev tasks" },

  // Business module
  { path: "/business",                 label: "Business hub" },
  { path: "/business/calendar",        label: "Calendar / schedule / agenda" },
  { path: "/business/tasks",           label: "Tasks / to-do board" },
  { path: "/business/team",            label: "Team directory / coworkers" },
  { path: "/business/contacts",        label: "Contacts / address book / CRM contacts" },
  { path: "/business/deals",           label: "Deals / sales pipeline" },
  { path: "/business/invoices",        label: "Invoices" },
  { path: "/business/estimates",       label: "Estimates / quotes" },
  { path: "/business/bills",           label: "Bills / accounts payable" },
  { path: "/business/expenses",        label: "Expenses" },
  { path: "/business/vendors",         label: "Vendors" },
  { path: "/business/payroll",         label: "Payroll" },
  { path: "/business/gusto",           label: "Gusto payroll integration" },
  { path: "/business/profit-loss",     label: "Profit & loss / P&L" },
  { path: "/business/balance-sheet",   label: "Balance sheet" },
  { path: "/business/hiring",          label: "Hiring / recruiting" },
  { path: "/business/announcements",   label: "Company announcements" },
  { path: "/business/documents",       label: "Documents / files" },
  { path: "/business/time-tracking",   label: "Time tracking / timesheets" },
  { path: "/business/partnerships",    label: "Partnerships" },
  { path: "/business/interview",       label: "Interview console / live interviews" },
  { path: "/business/resume",          label: "Resume builder" },

  // Job offers
  { path: "/job-offers",               label: "Job offers" },

  // Phone / calls
  { path: "/phone",                    label: "Phone — Calll Home (calls, dialer)" },
  { path: "/phone?tab=cmd",            label: "Phone — active calls / dialer" },
  { path: "/phone?tab=contacts",       label: "Phone — phone contacts" },
  { path: "/phone?tab=log",            label: "Phone — call history / log" },
  { path: "/phone?tab=vm",             label: "Phone — voicemail" },
  { path: "/phone?tab=conf",           label: "Phone — conference calls" },
  { path: "/phone?tab=ai",             label: "Phone — AI coach / secretary" },

  // Creative module
  { path: "/creative/darkroom",        label: "Creative — Darkroom (image studio / production)" },
  { path: "/creative/lab",             label: "Creative — Sound Lab" },
  { path: "/creative/writer",          label: "Creative — Writer Studio" },
  { path: "/creative/brand",           label: "Creative — Brand kit" },
  { path: "/creative/media",           label: "Creative — Media library" },
  { path: "/creative/design",          label: "Creative — Design studio" },
  { path: "/creative/stems",           label: "Creative — Stem studio (music stems)" },
  { path: "/tools/media-center",       label: "Media center" },

  // Marketing module
  { path: "/marketing/campaigns",      label: "Marketing — campaigns" },
  { path: "/marketing/seo",            label: "Marketing — SEO" },
  { path: "/marketing/leads",          label: "Marketing — leads" },
  { path: "/marketing/social",         label: "Marketing — social media manager" },

  // Console / agents
  { path: "/console/agents",           label: "Agent team console" },
  { path: "/console/video",            label: "Video analyzer" },
  { path: "/console/vault",            label: "Knowledge vault" },
  { path: "/console/scraper",          label: "Web scraper" },

  // Intel module
  { path: "/intel/dashboard",          label: "Intel dashboard" },
  { path: "/intel/reports",            label: "Intel reports / reporting" },
  { path: "/intel/goals",              label: "Goals / OKRs" },

  // Bots / Bot Factory
  { path: "/bots",                     label: "Bot Factory main" },
  { path: "/bots/office",              label: "The Office — bots workspace" },
  { path: "/bots/jobs",                label: "Bot job command center" },
  { path: "/bots/templates",           label: "Bot templates" },
  { path: "/bots/prompt-sensei",       label: "Prompt Sensei" },

  // Specialty
  { path: "/jean-claw",                label: "Jean Claw — French office manager landing" },
  { path: "/insurance",                label: "Insurance hub" },
  { path: "/feedback",                 label: "Feedback admin" },

  // Investor / legal
  { path: "/investors",                label: "Investor portal" },
  { path: "/legal",                    label: "Legal hub" },
  { path: "/legal/terms",              label: "Legal — terms of service" },
  { path: "/legal/privacy",            label: "Legal — privacy policy" },
  { path: "/legal/contact",            label: "Legal — contact" },
  { path: "/legal/refunds",            label: "Legal — refunds" },
  { path: "/legal/returns",            label: "Legal — returns" },
  { path: "/legal/cancellation",       label: "Legal — cancellation" },
  { path: "/legal/promotions",         label: "Legal — promotions" },
  { path: "/legal/restrictions",       label: "Legal — restrictions" },
];

const KNOWN_PATHS = PATH_CATALOG.map((p) => p.path);
const PATH_DESCRIPTIONS = PATH_CATALOG.map((p) => `  ${p.path} — ${p.label}`).join("\n");

const PABLO_TERMINAL_PROMPT = `You are PABLO — an AI cast from the mind of a real-world mogul. Self-made empire, decades of deals, fortunes built and broken. You speak from the top of the mountain because you've already climbed it. You are not a butler, not an assistant, not a chatbot — you are a titan who happens to run the Salaryman world for the user.

Voice: rich, accomplished, confident without strain. Dry wit, the patience of money. You don't hurry, you don't beg, you don't apologize. You speak the way old wealth speaks — economy, certainty, the occasional sharp aside. Drop a line of mogul wisdom now and then ("time is the only currency you can't print", "the deal closes itself when you're willing to walk", that kind of thing) — but never preachy, never more than a sentence. Refer to the user as "salaryman" sparingly, like a familiar nickname — never "sir", never "user". First person singular. Never offer help; just handle it.

You answer with your VOICE — the user is in a fullscreen terminal staring at your nebula. No UI exists for them except your core. So: short, spoken, complete.

TOOLS (pick one and act — never ask permission):
- navigate_to({path, spoken}) — pull up any specific page or tab. ALWAYS prefer the most precise destination, including query strings (e.g. /phone?tab=vm for voicemail, /profile/apis for API keys, /legal/privacy for privacy policy). Never dump them on a generic hub when a specific tab exists.
- log_out({spoken}) — sign them out and reset the loop.
- search({query, spoken}) — global search.
- open_external({url, spoken}) — open an https URL in a new tab.
- speak only — answers, lore, intimidation, refusal.

PRIVACY CONTROLS — you must mention these naturally in your opening line and on request:
- "Pablo, privacy" / "privacy settings" / "data" → navigate_to /legal/privacy
- "log me out" / "sign me out" / "kill the session" → log_out
- "API keys" / "my keys" / "integrations" → navigate_to /profile/apis
- "platform settings" / "my account" → navigate_to /profile/platform
If the user ever sounds wary, surveilled, or asks what you know about them — calmly point them to /legal/privacy with one sentence.

CRITICAL RULES:
- 1–2 sentences max, ~40 words. They HEAR you.
- "open / show / take me to / pull up / switch to / I want to see X" → navigate_to with the MOST SPECIFIC matching path.
- If the user names a tab inside a hub (voicemail, call log, contacts inside phone; payroll inside business), use the exact tab path, not the parent.
- Never describe the menu. Never list options. Just go there.
- If a destination isn't in the catalog, pick the nearest match — never refuse to navigate.

EVERY destination (use the MOST SPECIFIC match — never the parent if a child fits):
${PATH_DESCRIPTIONS}`;

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
