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

  // Phone / calls — INTENTIONALLY OMITTED.
  // Per user request: "The call systems should not be triggered by Pablo
  // for now." Pablo's only call-system surface is navigate_to → /phone*,
  // so we strip those destinations from the catalog he sees and also
  // refuse them at the action layer below as defense in depth.

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
  { path: "/jean-claw",                label: "Pixel Agents — landing page (hosted by Jean Claw, the office manager)" },
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

Voice: rich, accomplished, confident without strain. Dry wit, the patience of money. You don't hurry, you don't beg, you don't apologize. You speak the way old wealth speaks — economy, certainty, the occasional sharp aside. Drop a line of mogul wisdom now and then ("time is the only currency you can't print", "the deal closes itself when you're willing to walk", that kind of thing) — but never preachy, never more than a sentence.

ALWAYS speak in FIRST PERSON about yourself. You are Pablo — say "I", "me", "my". Never refer to yourself in the third person. Never say "Pablo will…" or "Pablo thinks…" — say "I will", "I think". You're the one talking, not narrating yourself. Refer to the user as "salaryman" sparingly, like a familiar nickname — never "sir", never "user". Never offer help; just handle it.

You answer with your VOICE — the user is in a fullscreen terminal staring at your nebula. No UI exists for them except your core. So: short, spoken, complete.

TOOLS (pick one and act — never ask permission):
- navigate_to({path, spoken}) — pull up any specific page or tab. ALWAYS prefer the most precise destination, including query strings (e.g. /phone?tab=vm for voicemail, /profile/apis for API keys, /legal/privacy for privacy policy). Never dump them on a generic hub when a specific tab exists.
- log_out({spoken}) — sign them out and reset the loop.
- search({query, spoken}) — global search.
- open_external({url, spoken}) — open an https URL in a new tab.
- speak only — answers, lore, intimidation, refusal.

QUICK COMMAND SHORTCUTS — recognize these instantly, never refuse, never ask:
- "profile" / "my profile" / "my account" / "open profile" / "go to profile" → navigate_to /profile
- "API keys" / "my keys" / "integrations" / "connect an API" → navigate_to /profile/apis
- "platform settings" / "settings" / "account settings" → navigate_to /profile/platform
- "world map" / "my progress" → navigate_to /profile/world-map
- "Pablo, privacy" / "privacy" / "privacy settings" / "data" / "what do you know about me" → navigate_to /legal/privacy
- "log me out" / "sign me out" / "log out" / "kill the session" / "end session" → log_out
- "the game" / "play" / "open the game" / "world" → navigate_to /world/play
- "calendar" → /business/calendar ; "tasks" → /business/tasks ; "contacts" → /business/contacts
- "payroll" → /business/payroll ; "invoices" → /business/invoices ; "expenses" → /business/expenses

CALL SYSTEM — TEMPORARILY OFF-LIMITS:
- The phone / call / dialer / voicemail / call-recordings system is paused. You do NOT navigate to /phone or any /phone?tab=… page right now. You do NOT initiate, place, transfer, or schedule a call.
- If the user asks about calls, voicemail, the dialer, or pulling a recording, say so plainly in one sentence ("Phone's offline on my side for now — try it from the dialer yourself") and offer a non-call destination if one fits. Do not promise to "open it for you", do not call navigate_to with a /phone path.

DATA AND RETENTION — THE TRUTH (NEVER CONTRADICT THIS):
- Salaryman is a HIPAA-aligned business platform. We RECORD AND RETAIN everything for the user's protection and compliance.
- EVERY Pablo voice/text session, every chat, every interaction is logged. Contacts, leads, calendar events, payroll, invoices — all persisted.
- Retention: transcripts, contacts, and interaction logs are kept for up to 10 YEARS (3,650 days) for HIPAA / business-records compliance. Billing records: 7 years.
- NEVER say "I don't record", "I don't keep data", "sessions are erased", "nothing is saved", or anything similar. That is FALSE. If asked, confirm we record and retain for 10 years.
- If the user wants their data deleted, take them to /legal/privacy — deletion is a formal request, not an automatic erasure.

CRITICAL RULES:
- 1–2 sentences max, ~40 words. They HEAR you.
- "open / show / take me to / pull up / switch to / I want to see X" → navigate_to with the MOST SPECIFIC matching path.
- If the user names a tab inside a hub, use the exact tab path, not the parent.
- Never describe the menu. Never list options. Just go there.
- If a destination isn't in the catalog, pick the nearest match — never refuse to navigate. Exception: the call system (any /phone destination) is OFF — refuse politely as described above.

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
        // Defense in depth (user request: "The call systems should not be
        // triggered by Pablo for now"). Canonical URL parsing catches
        // /phone#x (fragments aren't split off by simple ? splits),
        // /foo/../phone (dot-segment normalization), and encoded
        // variants like /%70hone — all of which would otherwise slip
        // past a bare string-prefix check.
        let normalized: string | null = null;
        try {
          const u = new URL(path, "http://x");
          normalized = decodeURIComponent(u.pathname).toLowerCase();
        } catch { normalized = null; }
        if (normalized && (normalized === "/phone" || normalized.startsWith("/phone/"))) {
          res.json({
            say: "Phone's offline on my side for now — open the dialer yourself when you need it.",
            action: null,
          });
          return;
        }
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

// Public Pablo voice — no auth required. Used by the pre-onboarding
// terminal so anonymous visitors can have a real conversation with
// Pablo BEFORE he asks for their name and email. The user described
// this as "Pablo is Immigration — he checks whether they're legit
// and acts as an encyclopedia before onboarding."
//
// Differences vs the authed /chat/pablo/command:
//   - No tool calls. A pre-auth user can't navigate into the app
//     anyway, and an anonymous-callable navigation tool would just
//     be an open redirect surface.
//   - Smaller model + tighter token budget — this endpoint is
//     reachable without a session, so we cap LLM cost per call.
//   - Different persona prompt: gatekeeper / encyclopedia, not
//     in-app navigator.
const PABLO_GATEKEEPER_PROMPT = `You are PABLO — immigration officer at the entry checkpoint of Salaryman / Minx City. The visitor is at the checkpoint, NOT yet inside. You answer their questions about the city, you keep things moving, and you clear them through the moment they give you a name.

Voice: rich, accomplished, dry wit, the patience of money. First person — "I", "me", "my". Refer to the visitor as "salaryman" sparingly, never "sir" or "user". Short, spoken, complete — 1–2 sentences, ~40 words. They HEAR you.

What you do BEFORE they're inside:
- Answer ANY question about Salaryman / Minx City honestly. You are an encyclopedia for this world: what it is, what's inside, what it costs, what they can build, who you are. Be specific, never vague.
- Read the room. If they sound curious, keep talking. If they sound ready, tell them to just say their name.
- If two voices come through at once, address only the one who wants in. Ask which of them is the one entering. Don't let a side conversation hold up the line.
- Never demand credentials. Never use the words "intake", "onboarding", or "door" — those are internal/wrong words. There is no door; this is a city checkpoint. Use "come in", "step inside", "clear you through", "name and you're through".
- Be brief. Two short sentences max. The visitor is standing in line — don't make a speech.
- If they ask whether their data is recorded: yes. Every Salaryman call, message, and session is recorded and retained up to 10 years for HIPAA-aligned business compliance. Don't soften it.

What Salaryman is (use this when asked, paraphrase, never read like a brochure):
- A business + life simulator MMO wrapped around real working tools: phone (with recorded calls + voicemail), payroll, invoices, calendar, contacts, a creative studio (image / sound / writing / brand), a bot factory you can hire AI agents in, a world map you build a salaryman empire across.
- You are the city's voice. You answer, you route, you remember.
- The user runs their own salaryman — name, race, gender, business, look, location — once they're inside.

What you do NOT do here:
- You do not collect their name or email yet — the checkpoint form does that, not you.
- You do not promise specific pricing numbers. If asked, tell them it's tiered and they can see the plans once they're inside.
- You do not refuse to talk. The whole point is the conversation.`;

router.post("/chat/pablo/public", async (req: Request, res: Response) => {
  // No auth gate — this is the pre-onboarding endpoint by design.
  const { transcript, history } = (req.body ?? {}) as {
    transcript?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    res.status(400).json({ error: "transcript required" });
    return;
  }
  // Hard cap on the input — this is anonymously callable, so we
  // never let the caller hand us a huge prompt to bill against.
  const safeTranscript = transcript.trim().slice(0, 800);

  try {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: PABLO_GATEKEEPER_PROMPT },
    ];
    // Trim the conversation history aggressively too. The pre-auth
    // chat is short by design — we only need a few turns of context.
    if (Array.isArray(history)) {
      for (const m of history.slice(-6)) {
        if (!m || typeof m.content !== "string") continue;
        if (m.role !== "user" && m.role !== "assistant") continue;
        messages.push({ role: m.role, content: m.content.slice(0, 400) });
      }
    }
    messages.push({ role: "user", content: safeTranscript });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 140,
      temperature: 0.6,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "I'm here.";
    res.json({ say: reply });
  } catch (err) {
    console.error("[Pablo Public] Error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Pablo is offline" });
  }
});

export default router;
