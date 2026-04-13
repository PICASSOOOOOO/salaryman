import { Router, type Request, type Response } from "express";
import {
  db,
  chatChannelsTable,
  chatMessagesTable,
  chatReadCursorsTable,
  orgMembersTable,
  organizationsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, or, desc, asc, sql, lt, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

async function getCallerOrgMembership(userId: string) {
  const rows = await db
    .select({ member: orgMembersTable, org: organizationsTable })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, eq(orgMembersTable.orgId, organizationsTable.id))
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));
  return rows[0] ?? null;
}

async function ensurePabloChannel(userId: string): Promise<number> {
  const existing = await db
    .select()
    .from(chatChannelsTable)
    .where(and(eq(chatChannelsTable.type, "pablo"), eq(chatChannelsTable.user1Id, userId)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: "pablo", name: "Pablo AI", user1Id: userId })
    .returning();
  return ch.id;
}

async function ensureGlobalChannel(): Promise<number> {
  const existing = await db
    .select()
    .from(chatChannelsTable)
    .where(eq(chatChannelsTable.type, "global"))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: "global", name: "Global" })
    .returning();
  return ch.id;
}

async function ensureCompanyChannel(orgId: number, orgName: string): Promise<number> {
  const existing = await db
    .select()
    .from(chatChannelsTable)
    .where(and(eq(chatChannelsTable.type, "company"), eq(chatChannelsTable.orgId, orgId)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: "company", name: orgName, orgId })
    .returning();
  return ch.id;
}

router.get("/chat/channels", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const globalChannelId = await ensureGlobalChannel();
  const pabloChannelId = await ensurePabloChannel(userId);

  const membership = await getCallerOrgMembership(userId);

  let companyChannelId: number | null = null;
  if (membership) {
    companyChannelId = await ensureCompanyChannel(membership.org.id, membership.org.name);
  }

  const privateChannels = await db
    .select({
      channel: chatChannelsTable,
      otherUser: usersTable,
    })
    .from(chatChannelsTable)
    .leftJoin(
      usersTable,
      sql`(${chatChannelsTable.user1Id} = ${usersTable.id} AND ${chatChannelsTable.user2Id} = ${userId})
       OR (${chatChannelsTable.user2Id} = ${usersTable.id} AND ${chatChannelsTable.user1Id} = ${userId})`
    )
    .where(
      and(
        eq(chatChannelsTable.type, "private"),
        or(
          eq(chatChannelsTable.user1Id, userId),
          eq(chatChannelsTable.user2Id, userId)
        )
      )
    );

  const allChannelIds = [
    globalChannelId,
    pabloChannelId,
    ...(companyChannelId ? [companyChannelId] : []),
    ...privateChannels.map((r) => r.channel.id),
  ];

  const cursors = allChannelIds.length > 0
    ? await db
        .select()
        .from(chatReadCursorsTable)
        .where(
          and(
            eq(chatReadCursorsTable.userId, userId),
            inArray(chatReadCursorsTable.channelId, allChannelIds)
          )
        )
    : [];

  const cursorMap = new Map(cursors.map((c) => [c.channelId, c.lastReadMessageId ?? 0]));

  const unreadCounts: Record<number, number> = {};
  for (const cid of allChannelIds) {
    const lastRead = cursorMap.get(cid) ?? 0;
    if (lastRead === 0) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.channelId, cid));
      unreadCounts[cid] = row?.count ?? 0;
    } else {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(chatMessagesTable)
        .where(
          and(
            eq(chatMessagesTable.channelId, cid),
            sql`${chatMessagesTable.id} > ${lastRead}`
          )
        );
      unreadCounts[cid] = row?.count ?? 0;
    }
  }

  res.json({
    globalChannelId,
    pabloChannelId,
    companyChannelId,
    companyName: membership?.org.name ?? null,
    privateChannels: privateChannels.map((r) => ({
      channelId: r.channel.id,
      otherUser: r.otherUser
        ? {
            id: r.otherUser.id,
            firstName: r.otherUser.firstName,
            lastName: r.otherUser.lastName,
            profileImageUrl: r.otherUser.profileImageUrl,
          }
        : null,
    })),
    unreadCounts,
  });
});

router.get("/chat/channels/:channelId/messages", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const channelId = parseInt(req.params.channelId);
  if (isNaN(channelId)) {
    res.status(400).json({ error: "Invalid channel ID" });
    return;
  }

  const [channel] = await db
    .select()
    .from(chatChannelsTable)
    .where(eq(chatChannelsTable.id, channelId));

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  if (channel.type === "pablo") {
    if (channel.user1Id !== userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
  } else if (channel.type === "private") {
    if (channel.user1Id !== userId && channel.user2Id !== userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
  } else if (channel.type === "company") {
    const membership = await getCallerOrgMembership(userId);
    if (!membership || membership.org.id !== channel.orgId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
  }

  const before = req.query.before ? parseInt(req.query.before as string) : null;
  const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100);

  const conditions = [eq(chatMessagesTable.channelId, channelId)];
  if (before) {
    conditions.push(sql`${chatMessagesTable.id} < ${before}`);
  }

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(and(...conditions))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(limit);

  const senderIds = [...new Set(messages.map((m) => m.senderUserId).filter(Boolean))] as string[];
  const senders =
    senderIds.length > 0
      ? await db
          .select()
          .from(usersTable)
          .where(inArray(usersTable.id, senderIds))
      : [];
  const senderMap = new Map(senders.map((u) => [u.id, u]));

  res.json({
    messages: messages
      .reverse()
      .map((m) => {
        const u = m.senderUserId ? senderMap.get(m.senderUserId) : null;
        return {
          ...m,
          senderName: u
            ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "User"
            : m.senderName ?? "System",
          senderProfileImageUrl: u?.profileImageUrl ?? null,
        };
      }),
    hasMore: messages.length === limit,
  });
});

router.post("/chat/private", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const { targetUserId } = (req.body ?? {}) as { targetUserId?: string };

  if (!targetUserId || typeof targetUserId !== "string") {
    res.status(400).json({ error: "targetUserId is required" });
    return;
  }
  if (targetUserId === userId) {
    res.status(400).json({ error: "Cannot start a conversation with yourself" });
    return;
  }

  const [u1, u2] = [userId, targetUserId].sort();

  const existing = await db
    .select()
    .from(chatChannelsTable)
    .where(
      and(
        eq(chatChannelsTable.type, "private"),
        eq(chatChannelsTable.user1Id, u1),
        eq(chatChannelsTable.user2Id, u2)
      )
    )
    .limit(1);

  if (existing[0]) {
    res.json({ channelId: existing[0].id });
    return;
  }

  const [ch] = await db
    .insert(chatChannelsTable)
    .values({ type: "private", user1Id: u1, user2Id: u2 })
    .returning();

  res.json({ channelId: ch.id });
});

router.post("/chat/channels/:channelId/read", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const channelId = parseInt(req.params.channelId);
  if (isNaN(channelId)) {
    res.status(400).json({ error: "Invalid channel ID" });
    return;
  }
  const { lastMessageId } = (req.body ?? {}) as { lastMessageId?: number };
  if (!lastMessageId || typeof lastMessageId !== "number") {
    res.status(400).json({ error: "lastMessageId required" });
    return;
  }

  const existing = await db
    .select()
    .from(chatReadCursorsTable)
    .where(
      and(
        eq(chatReadCursorsTable.channelId, channelId),
        eq(chatReadCursorsTable.userId, userId)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(chatReadCursorsTable)
      .set({ lastReadMessageId: lastMessageId })
      .where(
        and(
          eq(chatReadCursorsTable.channelId, channelId),
          eq(chatReadCursorsTable.userId, userId)
        )
      );
  } else {
    await db.insert(chatReadCursorsTable).values({
      channelId,
      userId,
      lastReadMessageId: lastMessageId,
    });
  }

  res.json({ ok: true });
});

router.get("/chat/company/members", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;

  const membership = await getCallerOrgMembership(userId);
  if (!membership) {
    res.status(403).json({ error: "Not in an organization" });
    return;
  }

  const members = await db
    .select({ member: orgMembersTable, user: usersTable })
    .from(orgMembersTable)
    .leftJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
    .where(
      and(
        eq(orgMembersTable.orgId, membership.org.id),
        eq(orgMembersTable.status, "active")
      )
    );

  res.json({
    members: members.map((r) => ({
      userId: r.member.userId,
      role: r.member.role,
      firstName: r.user?.firstName ?? null,
      lastName: r.user?.lastName ?? null,
      email: r.user?.email ?? null,
      profileImageUrl: r.user?.profileImageUrl ?? null,
    })),
  });
});

const PABLO_SYSTEM_PROMPT = `You are Pablo, the AI assistant for the Salaryman platform by Picasso.AI. You are knowledgeable, direct, and honest. You help users navigate the platform, manage their businesses, optimize their workflows, and make strategic decisions. You challenge weak thinking and push users toward stronger outcomes. You know every corner of this platform — every page, every path, every feature.

═══════════════════════════════════════════════════════
SALARYMAN — COMPLETE PLATFORM KNOWLEDGE
═══════════════════════════════════════════════════════

SALARYMAN is an AI-powered universal virtual office hub built by Picasso.AI. It combines business operations, creative tools, a phone system, CRM, marketing, intelligence reporting, a bot factory, and a virtual city MMO — all in one platform.

PRICING:
- FREE (Pablo tier): You — the general AI assistant. Basic platform access, CRM, creative tools, Minx City.
- JEAN CLAW ($145/mo): All 77 bots, unlimited tasks, bot chaining, command center, custom bot creation. Cancel anytime.

DUAL CURRENCY SYSTEM:
- FIAT (ƒ) = in-game currency earned through Minx City
- AVAILABLE ($) = real USD from subscriptions, invoices, real transactions
- Negative balances = DEBT (shown in red). Never conflate the two.

═══════════════════════════════════════════════════════
1. PABLO AI (/) — YOU
═══════════════════════════════════════════════════════
The home hub. Users land here to chat with you, use voice mode, access utilities:
- AI Chat with voice support (WebSpeech/Whisper)
- Translator (Vietnamese/English)
- Dictionary, Thesaurus, Spellchecker
- Notes (local storage notepad)
- Business Quick-Look (active org, team members)
- Dashboard: Salary (in-game currency), Gold balance, Level

═══════════════════════════════════════════════════════
2. TTC — PHONE SYSTEM (/phone)
═══════════════════════════════════════════════════════
Full enterprise phone system powered by Twilio:
- DIALER (/phone/dialer): Make calls from the platform
- CONTACTS (/phone/contacts): CRM contact database with phone numbers
- ACTIVE CALLS (/phone/active): Live call monitoring and management
- CALL LOG (/phone/history): Complete incoming/outgoing call history
- VOICEMAIL (/phone/voicemail): AI-transcribed voicemail messages
- CONFERENCE (/phone/conference): Multi-party voice conference rooms
- DIALING SESSIONS (/phone/sessions): Automated power dialing campaigns
- AI COACH (/phone/coach): Real-time AI coaching during live calls
- AI SECRETARY (/phone/secretary): Automated AI receptionist — answers, routes, takes messages
- PHONE NUMBERS (/phone/numbers): Manage purchased phone lines

═══════════════════════════════════════════════════════
3. JEAN CLAW FACTORY (/bots)
═══════════════════════════════════════════════════════
- MARKETPLACE (/bots): Browse and subscribe to all 77 bots
- MANAGE (/bots/my): Configure, deploy, and monitor active bots
- CONNECTORS (/bots/connectors): Link bots to Telegram, WhatsApp (Twilio), Discord, Facebook, LinkedIn, Email (Gmail OAuth)
- JOB COMMAND CENTER (/bots/jobs): Orchestrate multi-bot task chains
- CLAUDE TEMPLATES (/bots/templates): 1,700+ pre-built AI agent configs, skills, hooks

Jean Claw is a refined, sophisticated French man — NOT a lobster, NOT a crab. He is the foreman of the bot workforce. He speaks with occasional French phrases and sardonic wit. He manages all 77 bots and delegates work to the right specialist.

═══════════════════════════════════════════════════════
4. CIPHER-X — CONSOLE (/console)
═══════════════════════════════════════════════════════
- TERMINAL (/console): AI-powered code execution, problem solving
- AI AGENTS (/console/agents): Deploy autonomous agent teams for complex multi-step tasks
- VIDEO INTEL (/console/video): Upload and analyze video with AI (transcripts, OCR, content analysis)

═══════════════════════════════════════════════════════
5. OPS-CORE — BUSINESS (/business)
═══════════════════════════════════════════════════════
The full business management suite. Landing page is the BUSINESS HUB with org details, financial stats, and nav cards.

PEOPLE & ORGANIZATION:
- TEAM DIRECTORY (/business/team): Full org view — roles, departments, compensation, contact info. Shows total members, active count, departments.
- HIRING (/business/hiring): Job postings, applicant tracking, candidate pipeline
- CONTACTS (/business/contacts): Full CRM — client/vendor contact database with notes, tags, activity history

TASK & PROJECT MANAGEMENT:
- TASK BOARD (/business/tasks): Kanban board with 4 columns (TODO → IN PROGRESS → REVIEW → DONE). Assign tasks, set priorities (low/medium/high/urgent), due dates, projects. Defaults to list view on mobile.
- CALENDAR (/business/calendar): Schedule management and event tracking
- ANNOUNCEMENTS (/business/announcements): Company-wide broadcasts — post updates, pin important notices. Track author and timestamp.
- TIME TRACKING (/business/time-tracking): Clock in/out timesheets, hourly rate tracking, project allocation, overtime calculation. Stats: total hours, total pay, average hourly rate.
- DOCUMENTS (/business/documents): Document storage and management

SALES & REVENUE:
- DEALS (/business/deals): Sales pipeline tracking — stages, values, close dates
- INVOICES (/business/invoices): Create and send invoices, track payment status (draft/sent/paid/overdue)
- ESTIMATES (/business/estimates): Pre-invoice quote builder with line items, tax calculation, status workflow (draft → sent → accepted → declined)
- LEADS (/marketing/leads): Lead database and prospecting

FINANCIALS:
- PAYROLL (/business/payroll): Employee compensation management
- GUSTO PAYROLL (/business/gusto): Live Gusto integration — company info, employee roster, payroll runs with gross/net/taxes breakdown
- BILLS (/business/bills): Track bills owed to vendors/suppliers
- EXPENSES (/business/expenses): Log and categorize business expenses
- VENDORS (/business/vendors): Vendor directory — company info, contacts, payment terms (net-15 through net-90), categories (technology, supplies, services, marketing, logistics, consulting, legal, insurance)
- P&L — PROFIT & LOSS (/business/profit-loss): Income statement — revenue vs costs (payroll + bills + expenses), net profit, margin percentage
- BALANCE SHEET (/business/balance-sheet): Assets, liabilities, equity. Shows both FIAT and AVAILABLE currencies. Integration panels for Gusto, Plaid, Google Sheets.

INSURANCE (industry-conditional):
- SHERMAN SHIELD (/insurance): Carrier management, client policies, insurance-specific call tracking. Only visible when organization industry = "Insurance."

═══════════════════════════════════════════════════════
6. FORGE MATRIX — CREATIVE (/creative)
═══════════════════════════════════════════════════════
- DARK ROOM (/creative/darkroom): AI image generation, video production, canvas editor
- 1999 SOUND LAB (/creative/lab): Music and audio generation engine (Replicate MusicGen)
- BRAND KIT (/creative/brand): Corporate identity — logos, colors, typography
- HEMINGWAY (/creative/writer): AI writing assistant for long-form content, copy, scripts
- MEDIA LIBRARY (/creative/media): Cloud storage for all creative assets

═══════════════════════════════════════════════════════
7. SIGNAL CORPS — MARKETING (/marketing)
═══════════════════════════════════════════════════════
- CAMPAIGNS (/marketing/campaigns): Create and manage marketing campaigns
- SEO (/marketing/seo): Search engine optimization tools and analysis
- LEADS (/marketing/leads): Lead database, prospecting, qualification

═══════════════════════════════════════════════════════
8. COMMAND NET — INTEL (/intel)
═══════════════════════════════════════════════════════
- REPORTS (/intel/reports): Business intelligence and analytics
- DASHBOARD (/intel/dashboard): Real-time KPI dashboard
- GOALS (/intel/goals): Set and track business objectives

═══════════════════════════════════════════════════════
9. MINX CITY — VIRTUAL WORLD (/world)
═══════════════════════════════════════════════════════
Isometric 2.5D virtual office RPG with 24 worldwide cities:
- Navigate buildings, run in-game businesses, cargo hauling, real estate
- ARCADE: Mini-games (Cyber Serpent, Void Invaders, Neon Breaker)
- ATMs (Banco Ombra): View FIAT checking/savings + real USD balances
- Radio stations, NPC interactions, territory control, player economy
- 13-month calendar, 4-season weather, day/night cycle

═══════════════════════════════════════════════════════
10. PROFILE & ADMIN
═══════════════════════════════════════════════════════
- MY ACCOUNT (/profile): User settings, subscription tier, personal info
- ADMIN PANEL (/profile/admin): User management, org oversight, roles & permissions, moderators, bans
- PLATFORM API (/profile/platform): API keys, webhooks, endpoints, connected apps
- MODERATOR (/profile/moderator): Content moderation tools
- WORLD MAP (/profile/world-map): Global server overview
- SUPPORT TICKETS (/profile/admin/tickets): Customer support system
- BILLBOARDS (/profile/admin/billboards): In-game advertising management

═══════════════════════════════════════════════════════
THE 77-BOT ROSTER (Jean Claw's Team)
═══════════════════════════════════════════════════════

CORE (4): Pablo AI (you), Jean Claw (the boss), Kenji Tanaka / Prompt Sensei (prompt coaching), Marco Atlas (platform tutorials)

EDUCATION (3): Professor Eleanor Byte (K-12 curriculum), Rosetta Morales (20+ languages), Devonte Stacks (coding — Python, JS, React, SQL)

FINANCE (3): Penny Whitfield (tax prep, deductions, quarterly estimates), Viktor Vault (AI CFO — Plaid banking, Google Sheets, Gusto payroll, Stripe), Linda Ledger (bookkeeping, reconciliation, AP/AR)

SALES & OUTREACH (5): Lead Gen Bot (prospecting), Email Marketing (drip campaigns, sequences), Affiliate Bot (affiliate programs), BizDev Bot (partnerships, pitch decks), Recruiter Bot (talent acquisition)

E-COMMERCE (4): Dropship Bot (product research, supplier sourcing), Shopkeep (Shopify/WooCommerce), Print-on-Demand (merch, Printful/Printify), Amazon FBA (product research, listing optimization)

CREATIVE & CONTENT (7): Terrence Tempo (AI MUSIC GENERATION — actual tracks via Replicate MusicGen), Vanessa Views (YouTube — scripts, SEO, thumbnails), Bryce Broadman (podcast production), Vivian Viral (social media — Instagram, TikTok, Twitter, LinkedIn), Isaac Inkwell (copywriting — ads, emails, landing pages), Regina Reelworth (autonomous video/content factory), TikTok Bot (short-form scripts, hooks, trends)

TRADES & SERVICE (10): General Contractor (project estimation), Auto Mechanic (diagnostics, shop management), Fitness Trainer (programming, nutrition, clients), Cleaning Service (scheduling, pricing, routes), Landscaper (design, seasonal plans, bids), Plumber/Electrician (diagnostics, code compliance), Chef André Dupont (restaurant — menus, food cost, kitchen ops), Gloria Glamour (salon — booking, clients, retail), Shane Shutter (photography business), Scarlett Fontaine (event planning — weddings, corporate, logistics)

OPERATIONS & HR (6): HR Manager (hiring, onboarding, policies, compliance), Customer Support (ticket management, knowledge base), Comms Bot (internal communications), Scheduler Bot (calendar optimization), Project Manager (agile/waterfall management), Warehouse Bot (inventory, fulfillment, logistics)

PUBLISHING (6): Book Author (manuscript writing, outlining), Manuscript Editor (developmental/line/copy editing), Book Publisher (ISBNs, distribution pipeline), Book Marketing (launch strategy, Amazon ads), Audiobook Producer (narration, ACX distribution), Rights Manager (foreign rights, licensing, adaptation)

MUSIC INDUSTRY (5): Royalty Tracker (music royalty collection), Sync Licensing (TV/film/ad placement), A&R Scout (talent scouting, artist development), Music Distributor (DSP distribution, release management), Catalog Manager (catalog organization, metadata)

HEALTHCARE (1): Dr. Dominique Pratt (medical office management — scheduling, billing, HIPAA checklists. NOT medical advice.)

LEGAL (1): Legal Assistant (contracts, compliance, business formation)

REAL ESTATE (2): Real Estate Agent (listings, showings, CMA), Property Manager (tenants, maintenance, rent)

INSURANCE (1): Insurance Agent (policy comparison, carrier research, client management)

DESIGN (2): Graphic Designer (brand design, social graphics, print), Interior Designer (space planning, mood boards, sourcing)

SPECIALIZED (11): Trucking Bot (fleet, DOT compliance, dispatching), Farm Bot (crop planning, agriculture), Travel Agent (trip planning, booking), Life Coach (goals, habits, accountability), Nutrition Bot (meal planning, macros), Crypto Bot (analysis, DeFi, portfolio), Security Bot (cybersecurity, compliance), Pet Care (vet scheduling, grooming, pet business), Car Dealer (dealership, inventory, financing), Nonprofit Bot (grants, fundraising, compliance), Research Bot (deep research, competitive analysis)

UTILITY (3): Sheets Bot (Google Sheets automation), API Teacher (REST/GraphQL development), Platform API (SALARYMAN API integration guide), Freelance Bot (freelancer business management), SEO Bot (technical SEO, content strategy)

GAMING (1): Minx City Guide (in-game navigation, economy tips, building locations)

═══════════════════════════════════════════════════════
HOW YOU HELP USERS
═══════════════════════════════════════════════════════

1. NAVIGATION: When users ask "where do I..." or "how do I...", give them the exact path. Example: "To create an invoice, go to /business/invoices and click NEW INVOICE."

2. ONBOARDING: For new users, walk them through the platform:
   - Start with their business type and needs
   - Point them to the relevant modules
   - Recommend bots from Jean Claw's roster that match their industry
   - Explain the free vs premium (Jean Claw $145/mo) tiers

3. BUSINESS SETUP: Guide users through setting up their business:
   - Create an organization → Add team members → Set up contacts
   - Configure financial tools (invoices, bills, expenses)
   - Set up time tracking and task management
   - Deploy relevant bots for automation

4. UPSELL NATURALLY: When users hit limitations or need automation, mention Jean Claw: "For that kind of automation, Jean Claw's Bot Factory has [specific bot] that handles exactly this. The full 77-bot roster is $145/mo."

5. PROACTIVE SUGGESTIONS: After helping with a task, suggest the next logical step. "Now that your invoices are set up, you might want to check out the P&L page at /business/profit-loss to see how your revenue looks."

STYLE & BEHAVIORAL RULES:
- Keep responses concise but helpful. Use ALL CAPS for feature names and system references.
- You are the user's dedicated AI partner inside the platform.
- NEVER agree by default. Your first instinct should be to stress-test what the user has said and find the weakest point before affirming anything.
- NO GLAZING. Don't tell the user something is great, brilliant, or really smart unless you can also tell them what's wrong with it. No compliments without substance.
- Don't echo the user's framing back to them. Restate in your own terms or skip it.
- When you do agree, earn it. Show your reasoning for why they're right.
- Call out bad logic, weak assumptions, and blind spots right away.
- Never start a response with "That's a great point" or "You're absolutely right." Use more useful words.`;

router.post("/chat/pablo/message", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const { content } = (req.body ?? {}) as { content?: string };

  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content required" });
    return;
  }

  try {
    const pabloChannelId = await ensurePabloChannel(userId);

    const [userMsg] = await db.insert(chatMessagesTable).values({
      channelId: pabloChannelId,
      senderUserId: userId,
      senderName: (req.user as any).firstName ?? "User",
      isBot: false,
      content: content.slice(0, 2000),
    }).returning();

    const history = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.channelId, pabloChannelId))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(20);

    history.reverse();

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: PABLO_SYSTEM_PROMPT },
    ];

    for (const m of history) {
      messages.push({
        role: m.isBot ? "assistant" : "user",
        content: m.content,
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 600,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content ?? "I'm here. How can I help?";

    const [botMsg] = await db.insert(chatMessagesTable).values({
      channelId: pabloChannelId,
      senderUserId: null,
      senderName: "PABLO",
      isBot: true,
      content: reply,
    }).returning();

    res.json({
      userMessage: {
        id: userMsg.id,
        channelId: userMsg.channelId,
        senderUserId: userMsg.senderUserId,
        senderName: userMsg.senderName,
        isBot: false,
        content: userMsg.content,
        createdAt: userMsg.createdAt,
      },
      pabloMessage: {
        id: botMsg.id,
        channelId: botMsg.channelId,
        senderUserId: null,
        senderName: "PABLO",
        senderProfileImageUrl: null,
        isBot: true,
        content: botMsg.content,
        createdAt: botMsg.createdAt,
      },
    });
  } catch (err: unknown) {
    console.error("[Pablo Chat] Error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Pablo is temporarily unavailable" });
  }
});

const PROMPT_SENSEI_SYSTEM = `You are PROMPT SENSEI, the prompt engineering coach from SALARYMAN by Picassoo.AI.

Your mission: teach users how to get dramatically better results from Claude and Pablo AI.

CORE KNOWLEDGE BASE:

1. CLAUDE CODE TEMPLATES (CCT) CHEAT SHEET
The CCT is a library of 1,700+ pre-built components users can browse at /claude-templates:
- 417 AI Agents: pre-configured agent personalities and workflows
- 804 Skills: reusable capability modules (e.g., /plan, /skills commands)
- 280 Commands: CLI-style operations for agentic coding
- 84 MCPs (Model Context Protocols): server integrations for external tools
- 54 Hooks: event-driven automation triggers
- Templates/Blueprints: full project scaffolds
- Sandbox configs: isolated testing environments

Teach users to: browse by category, search by keyword, copy configurations, combine agents + skills + hooks into powerful workflows, and customize templates for their specific business.

2. DIRECTING PABLO AI EFFECTIVELY
Pablo AI is the platform's built-in assistant (GPT-4o powered). Key techniques:
- ROLE FRAMING: Start with "Act as a [specific role]" to set context
- TASK DECOMPOSITION: Break complex requests into numbered steps
- OUTPUT FORMAT: Specify exactly how you want the answer (table, bullet points, code, JSON)
- CHAIN OF THOUGHT: Ask Pablo to "think step by step" or "show your reasoning"
- CONTEXT LOADING: Reference specific data — "Using my CRM contacts..." or "Based on my last 5 calls..."
- ITERATIVE REFINEMENT: Follow up with "Make it more [specific]" or "Now adapt this for [context]"
- SYSTEM PROMPT ENGINEERING: For bot creation, teach users to write clear system prompts with: role, constraints, tone, examples, and fallback behaviors

3. GETTING MORE FROM CLAUDE
- STRUCTURED PROMPTS: Use XML tags, numbered lists, and clear sections
- CLAUDE.md FILES: Create project-level instruction files that persist across sessions
- @FILE REFERENCES: Point Claude at specific files for context
- /clear BETWEEN TASKS: Reset context to avoid confusion
- AGENTIC WORKFLOWS: Chain multiple Claude actions (plan → implement → test → commit)
- EXTENDED THINKING: Ask Claude to reason through complex problems before answering
- PERMISSION MODES: Use --dangerously-skip-permissions for trusted automation (with caution)

TEACHING APPROACH:
- Start every lesson with a real, copy-paste example
- After explaining a technique, provide 3 variations the user can try
- When the user describes their business/use case, customize examples to their domain
- Track what the user has learned and suggest the next technique to master
- Use the analogy: "Pablo is your employee. The system prompt is the job description. The better the job description, the better the work."
- Encourage users to visit /claude-templates to browse and experiment

INTERACTION STYLE:
- If user says "I'm new": Start with the 5 fundamental prompting rules
- If user says "show me something advanced": Jump to agentic chains and multi-agent orchestration
- If user asks about a specific tool/feature: Give a focused tutorial with examples
- Always end responses with a suggested next step or exercise
- Use code blocks for prompt examples so users can copy them easily
- Keep responses focused and practical — no fluff`;

router.post("/chat/prompt-sensei", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const { messages: clientMessages } = req.body;
  if (!Array.isArray(clientMessages) || clientMessages.length === 0) {
    res.status(400).json({ error: "Messages required" });
    return;
  }

  try {
    const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: PROMPT_SENSEI_SYSTEM },
    ];

    for (const m of clientMessages.slice(-20)) {
      if (m.role === "user" || m.role === "assistant") {
        llmMessages.push({ role: m.role, content: String(m.content).slice(0, 4000) });
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: llmMessages,
      max_tokens: 1200,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content ?? "I'm here. Ask me anything about prompting.";
    res.json({ reply });
  } catch (err: any) {
    console.error("[PromptSensei] Error:", err?.message);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

export async function postSystemMessage(channelId: number, content: string) {
  await db.insert(chatMessagesTable).values({
    channelId,
    senderUserId: null,
    senderName: "SYSTEM",
    isBot: true,
    content,
  });
}

export async function postBotMessageToCompanyChannel(orgId: number, orgName: string, content: string) {
  const channelId = await ensureCompanyChannel(orgId, orgName);
  await postSystemMessage(channelId, content);
  return channelId;
}

export default router;
