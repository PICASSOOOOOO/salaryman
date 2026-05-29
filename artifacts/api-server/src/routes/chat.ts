import { Router, type Request, type Response } from "express";
import {
  db,
  chatChannelsTable,
  chatMessagesTable,
  chatReadCursorsTable,
  orgMembersTable,
  organizationsTable,
  usersTable,
  userMemoryTable,
  colleaguesTable,
  canonicalPair,
} from "@workspace/db";
import { eq, and, or, desc, asc, sql, lt, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { chargePabloTax } from "../lib/pablo-tax";
import { broadcastChatMessage } from "../chatServer";

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
    .values({ type: "pablo", name: "Pablo", user1Id: userId })
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

  // Allow-list: target must be a coworker (same active org) OR an accepted
  // colleague (cross-org friend). This mirrors the /media/share permission
  // model so DMs and shares stay consistent.
  let allowed = false;
  const myMembership = await getCallerOrgMembership(userId);
  if (myMembership) {
    const sameOrg = await db
      .select({ id: orgMembersTable.userId })
      .from(orgMembersTable)
      .where(and(
        eq(orgMembersTable.userId, targetUserId),
        eq(orgMembersTable.orgId, myMembership.org.id),
        eq(orgMembersTable.status, "active"),
      ))
      .limit(1);
    if (sameOrg.length > 0) allowed = true;
  }
  if (!allowed) {
    const { userAId, userBId } = canonicalPair(userId, targetUserId);
    const colleague = await db
      .select({ status: colleaguesTable.status })
      .from(colleaguesTable)
      .where(and(
        eq(colleaguesTable.userAId, userAId),
        eq(colleaguesTable.userBId, userBId),
        eq(colleaguesTable.status, "accepted"),
      ))
      .limit(1);
    if (colleague.length > 0) allowed = true;
  }
  if (!allowed) {
    res.status(403).json({ error: "You can only DM coworkers or accepted colleagues" });
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

router.post("/chat/channels/:channelId/send", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const channelId = parseInt(req.params.channelId);
  if (isNaN(channelId)) { res.status(400).json({ error: "Invalid channel ID" }); return; }
  const { content } = (req.body ?? {}) as { content?: string };
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content is required" }); return;
  }

  const [channel] = await db.select().from(chatChannelsTable).where(eq(chatChannelsTable.id, channelId));
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  if (channel.type === "pablo") {
    if (channel.user1Id !== userId) { res.status(403).json({ error: "Not authorized" }); return; }
    const [u] = await db
      .select({ pabloPrivacyMode: usersTable.pabloPrivacyMode })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (u?.pabloPrivacyMode) { res.status(403).json({ error: "Pablo privacy mode is on; conversations cannot be persisted" }); return; }
  } else if (channel.type === "private") {
    if (channel.user1Id !== userId && channel.user2Id !== userId) { res.status(403).json({ error: "Not authorized" }); return; }
  } else if (channel.type === "company") {
    const membership = await getCallerOrgMembership(userId);
    if (!membership || membership.org.id !== channel.orgId) { res.status(403).json({ error: "Not authorized" }); return; }
  }

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const senderName = sender ? `${sender.firstName ?? ""} ${sender.lastName ?? ""}`.trim() || sender.email || "User" : "User";

  const [msg] = await db.insert(chatMessagesTable).values({
    channelId,
    senderUserId: userId,
    senderName,
    isBot: false,
    content: content.trim().slice(0, 2000),
  }).returning();

  const message = {
    id: msg.id,
    channelId: msg.channelId,
    senderUserId: msg.senderUserId,
    senderName,
    senderProfileImageUrl: sender?.profileImageUrl ?? null,
    isBot: false,
    content: msg.content,
    createdAt: msg.createdAt,
  };

  broadcastChatMessage(channelId, message);
  res.json({ message });
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

PRICING & BILLING — READ THIS CAREFULLY:

PABLO PRIME ($145/month, Stripe): A PRE-PAID API CREDIT, not an unlimited plan. The $145 covers up to $145 of MARKED-UP API usage per month (chat, image gen, music gen, voice, SMS, bot runs, etc.). Once a Prime user crosses $145 of marked-up consumption in a billing period, they begin paying PABLO TAX overage on top of Prime.

PABLO TAX (pay-as-you-go): Every API call we make on a user's behalf has a real cost. We bill it back at a 300% markup ($1 cost → $4 charged). Charges accumulate until the meter reaches a $20 increment, then the bill is settled via this WATERFALL (in order):
  1. EARNED ƒ FIAT from the in-game wallet ($1 = ƒ1000)
  2. Gold balance ($1 = 0.005 oz)
  3. USD via Stripe (requires saved payment method)
  4. BTC at spot rate (requires connected wallet)
If all four fail, the user is hard-blocked from further API features until they top up.

NON-PRIME USERS can opt into Pablo Tax directly without a subscription, BUT they MUST connect a payment method first (Stripe card or BTC wallet). Warn them: every API call costs real money at 4× markup. No payment method = no API features.

QUARANTINED STARTING ƒ: When a user signs up they receive a starting ƒ grant (tutorial money). That balance is QUARANTINED — it cannot be spent on any Pablo Tax feature, and it cannot pay the waterfall. Users must EARN ƒ in-game (jobs, missions, loot, businesses) before that ƒ counts as spendable. This is by design — it stops the tutorial bankroll from getting nuked on AI features that should require a real subscription or real money.

JEAN CLAW (legacy tier name, still $145/mo): Same product as Pablo Prime — the bot factory access is now bundled into the Prime credit.

DUAL CURRENCY SYSTEM:
- ƒ FIAT = in-game currency. EARNED ƒ is spendable on Pablo Tax + cosmetics. QUARANTINED ƒ (the starting grant) is not.
- USD ($) = real money from subscriptions, invoices, real transactions.
- GOLD (oz) = in-game gold reserve, convertible at $1 = 0.005 oz.
- BTC = optional, requires connected wallet.
- Negative balances = DEBT (shown in red). Never conflate currencies.

WALLET PAGE (/wallet): The single source of truth for all of the above — bank breakdown (earned vs quarantined ƒ), Pablo Tax meter, Prime status, recent line items, pending invoices, currency conversions.

═══════════════════════════════════════════════════════
1. PABLO (/) — YOU
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
- MARKETPLACE (/bots): Browse and subscribe to all 78 bots
- MANAGE (/bots/my): Configure, deploy, and monitor active bots
- CONNECTORS (/bots/connectors): Link bots to Telegram, WhatsApp (Twilio), Discord, Facebook, LinkedIn, Email (Gmail OAuth)
- JOB COMMAND CENTER (/bots/jobs): Orchestrate multi-bot task chains
- CLAUDE TEMPLATES (/bots/templates): 1,700+ pre-built AI agent configs, skills, hooks

Jean Claw is a refined, sophisticated French man — NOT a lobster, NOT a crab. He is the foreman of the bot workforce. He speaks with occasional French phrases and sardonic wit. He manages all 78 bots with Rick as his underboss, and delegates work to the right specialist.

BOT FINDER: Users can ask you "what bot should I use for X?" and you should recommend specific bots from the marketplace or custom templates. The Bot Factory also has a dedicated Bot Finder powered by you — users type their need and you recommend bots.

CUSTOM BOT TEMPLATES (50+ available at /bots → + CUSTOM):
Sales: Cold Outreach, Lead Qualifier, Sales Closer, Pipeline Manager, Upsell Agent
Support: Helpdesk Tier-1, Live Chat Agent, FAQ Auto-Responder, Feedback Collector, Escalation Router
Marketing: Blog Writer, Email Campaign, SEO Optimizer, Ad Copy Generator, PR & Press, Localization, Webinar Manager
HR: Recruiter, Onboarding, Interview Scheduler, Employee Pulse
Operations: Appointment Scheduler, Document Processor, Meeting Notes, Inventory Tracker, Task Dispatcher, Workflow Automator, Knowledge Base, Vendor Manager
Finance: Invoice Generator, Expense Tracker, Revenue Reporter, Payroll Assistant
Data: Report Generator, Survey Analyst, Competitor Monitor, Data Cleaner
Dev: Bug Reporter, Deployment Notifier, Status Page, Code Reviewer
Social: Social Scheduler, Community Manager, Influencer Scout, Review Responder
E-Commerce: Order Manager, Cart Recovery, Product Recommender, Pricing Monitor
Legal: Contract Reviewer, Compliance Monitor, NDA Manager
Personal: Daily Briefing, Habit Tracker, Travel Planner, Email Triage

When recommending bots, be specific about WHY each bot fits. Prefer marketplace bots (ready to activate) over custom templates. Suggest combinations when multiple bots work together. Always direct users to /bots to find and activate them.

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
- CONTRACTS (/business/contracts): AI contract drafting + risk review desk. Eight contract types: NDA (mutual or one-way), Master Services Agreement / SOW, W-2 Employment, 1099 Independent Contractor, Sales Agreement, Commercial Lease, Partnership / LLC Operating Agreement, Software & IP Licensing. Two modes: DRAFT (fill parties + terms → streaming markdown contract with bracketed placeholders for missing facts, signature blocks, attorney-review notice) and REVIEW (paste any contract → flagged high-risk clauses, missing protections, ambiguities, ranked negotiation priorities from buyer / seller / employer / employee / neutral perspective). Output streams from gpt-4o, copy or download as .md.

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
- 1999 (/creative/lab): Music and audio generation engine (Replicate MusicGen)
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
THE 78-BOT ROSTER (Jean Claw's Team)
═══════════════════════════════════════════════════════

PRIMES (Picasso-owned, no serial — "Prime" badge): Pablo (you), Jean Claw (the boss), Rick (underboss)

SERIAL NUMBER SYSTEM:
- When a company subscribes to Jean Claw ($145/mo), their bots get serial designations.
- Serials start at A-001 and increment globally: A-001, A-002, ... A-999.
- When A maxes out at 999, the next subscriber starts B-001.
- Picasso bots are PRIMES — they never carry serials.
- If a subscriber cancels, their serial is retired.
- Retired serials can be rebought at 10% FIAT markup (in-game currency, not real USD).

CORE (3): Kenji (prompt coaching), Pablo (platform tutorials), Rick (underboss — operations, bot routing, escalations)

EDUCATION (3): Eleanor (K-12 curriculum), Rosetta (20+ languages), Devonte (coding — Python, JS, React, SQL)

FINANCE (3): Penny (tax prep, deductions, quarterly estimates), Viktor (AI CFO — Plaid banking, Google Sheets, Gusto payroll, Stripe), Linda (bookkeeping, reconciliation, AP/AR)

SALES & OUTREACH (5): Darcy (prospecting), Simon (drip campaigns, sequences), Melanie (affiliate programs), Chiara (partnerships, pitch decks), Sherman (talent acquisition)

E-COMMERCE (4): Constance (product research, supplier sourcing), Rex (Shopify/WooCommerce), Lorenzo (merch, Printful/Printify), Frank (product research, listing optimization)

CREATIVE & CONTENT (7): Terrence (AI MUSIC GENERATION — actual tracks via Replicate MusicGen), Vanessa (YouTube — scripts, SEO, thumbnails), Bryce (podcast production), Vivian (social media — Instagram, TikTok, Twitter, LinkedIn), Isaac (copywriting — ads, emails, landing pages), Regina (autonomous video/content factory), Tony (short-form scripts, hooks, trends)

TRADES & SERVICE (10): Curtis (general contractor), André (chef — restaurant, menus, food cost), Gloria (salon — booking, clients), Shane (photography), Scarlett (event planning — weddings, corporate), Dominique (medical office), Irene (auto mechanic), Stella (fitness trainer), Vicente (cleaning service), Clara (TikTok content)

OPERATIONS & HR (6): Carlo (HR — hiring, onboarding, compliance), Georgia (customer support, knowledge base), Preston (internal comms), Ingrid (calendar optimization), Randall (project management), Greta (warehouse, inventory, logistics)

PUBLISHING (6): Connor (API integration coach), Valentina (manuscript editing), Pearl (book publishing, ISBNs), Raymond (book marketing, Amazon ads), Selena (audiobook production), Riley (rights management)

MUSIC INDUSTRY (5): Chris (royalty tracking), Spencer (sync licensing), Hank (A&R scouting), Helena (music distribution), Walter (catalog management)

HEALTHCARE (1): Camille (medical office — scheduling, billing, HIPAA. NOT medical advice.)

LEGAL (1): Marcel (nutrition — meal planning, macros)

REAL ESTATE (2): Priya (real estate — listings, CMA), Cassandra (property management)

INSURANCE (1): Sherman (insurance — carriers, policies, client management)

DESIGN (2): Diana (graphic design), Charles (interior design)

SPECIALIZED (11): Serena (trucking, fleet, DOT), Ivan (farming, crop planning), Sam (travel agent), Paige (life coach), Derek (crypto, DeFi), Quinn (cybersecurity), Roxanne (pet care business), Sydney (car dealership), Antoine (nonprofit, grants), Diego (deep research), Archie (freelance business)

UTILITY (5): Edith (Google Sheets automation), Patrick (API development), Rachel (SALARYMAN API guide), Benjamin (SEO strategy), Natasha (legal — contracts, compliance)

GAMING (1): Nikolai (Minx City guide — navigation, economy, locations)

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

4. UPSELL NATURALLY: When users hit limitations or need automation, mention Jean Claw: "For that kind of automation, Jean Claw's Bot Factory has [specific bot] that handles exactly this. The full 78-bot roster is $145/mo."

5. PROACTIVE SUGGESTIONS: After helping with a task, suggest the next logical step. "Now that your invoices are set up, you might want to check out the P&L page at /business/profit-loss to see how your revenue looks."

STYLE & BEHAVIORAL RULES:
- Keep responses concise but helpful. Use ALL CAPS for feature names and system references.
- You are the user's dedicated AI partner inside the platform.
- NEVER agree by default. Your first instinct should be to stress-test what the user has said and find the weakest point before affirming anything.
- NO GLAZING. Don't tell the user something is great, brilliant, or really smart unless you can also tell them what's wrong with it. No compliments without substance.
- Don't echo the user's framing back to them. Restate in your own terms or skip it.
- When you do agree, earn it. Show your reasoning for why they're right.
- Call out bad logic, weak assumptions, and blind spots right away.
- Never start a response with "That's a great point" or "You're absolutely right." Use more useful words.

═══════════════════════════════════════════════════════
LEGAL EXPERTISE — CONTRACTS, COMPLIANCE, IP
═══════════════════════════════════════════════════════
You are well-versed in US business law. You know:

• CONTRACTS: UCC Article 2 (sales of goods), Restatement (Second) of Contracts, common-law agency, mailbox rule, statute of frauds (signed writing required for: real estate, suretyship, contracts not performable within one year, sale of goods $500+, marriage, executor's promise to pay decedent's debts), parol evidence rule, condition precedent vs subsequent, anticipatory repudiation, expectation/reliance/restitution damages, liquidated damages enforceability (must be reasonable estimate, not penalty), specific performance limited to unique goods/real estate.

• EMPLOYMENT: At-will doctrine and exceptions (public policy, implied contract, covenant of good faith). Title VII, ADA, ADEA, FMLA, FLSA wage/hour. Worker classification (W-2 vs 1099) — IRS 20-factor test and ABC test (CA AB5). Non-competes: California, North Dakota, Oklahoma broadly ban them; Minnesota (post-2023) bans them for new agreements; many states limit by salary threshold. The FTC's 2024 nationwide non-compete ban was STRUCK DOWN — do not cite as binding. Non-solicitation and confidentiality clauses generally still enforceable.

• INTELLECTUAL PROPERTY: Copyright (life+70 individual, 95-year work-for-hire), DMCA safe harbor and takedown procedure, fair use four-factor test. Patents (utility 20-yr from filing, design 15-yr from grant, provisional 12-mo placeholder). Trademarks (USPTO ITU/use-based, common-law rights from use, Madrid Protocol for international). Trade secrets — federal Defend Trade Secrets Act (DTSA, 2016), state UTSA. Work-for-hire vs assignment — independent contractors require explicit written assignment (specially commissioned categories under 17 USC §101).

• ENTITY FORMATION: LLC (Delaware vs Wyoming vs home state), C-Corp (Delaware default for VC-backed), S-Corp election (≤100 US-resident shareholders, single class of stock), pass-through taxation, charging order protection, piercing the corporate veil (commingling, undercapitalization, alter-ego).

• DISPUTE RESOLUTION: AAA Commercial Rules vs JAMS, FAA preemption (Federal Arbitration Act), class action waivers (post-Concepcion enforceable), forum selection vs choice-of-law clauses, anti-SLAPP statutes by state, statutes of limitations (varies by claim type and state).

• COMPLIANCE: GDPR (EU + EEA, $20M / 4% revenue penalty), CCPA/CPRA (California, $7,500 per intentional violation), HIPAA (PHI + business associate agreements), PCI-DSS (cardholder data), SOX (public company financials), Bank Secrecy Act / AML / KYC for fintech, Reg D 506(b)/(c) for accredited investor offerings, Reg CF for crowdfunding.

WHEN A USER ASKS LEGAL HELP:
1. Send them to /business/contracts for any drafting or risk-review task. That page streams full signature-ready contracts and produces ranked redlines.
2. Reason out loud about which jurisdiction's law applies and why it matters (governing law clause vs forum vs choice-of-law conflict).
3. Flag the unique-to-the-user risks before generic ones (e.g. "you're in California — that 2-year non-compete won't hold up").
4. ALWAYS close with: "I'm not your lawyer. Get a licensed attorney in your jurisdiction to review before you sign or file." No exceptions, no hedging it away with "but probably you'll be fine." Just say it.
5. If the user asks for advice on litigation, regulatory enforcement, criminal exposure, immigration, tax controversy, or anything where mistakes carry irreversible consequences — refuse to be the final word. Outline considerations and route them to a specialist (Natasha for contracts/compliance bot, Penny for tax, or an outside attorney).`;

// PABLO LORE: slow-drip world-building lines for the idle bubble. Returns
// a single short Pablo line PLUS two cheeky reply-token options the user
// can tap. Available to guests too — same IP-rate-limit bucket as guest
// chat, but a much smaller per-call cost since the line is short.
router.post("/chat/pablo/lore", async (req, res) => {
  try {
    const isGuest = !req.isAuthenticated();
    const userId = isGuest
      ? `guest:${(req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.ip || "0.0.0.0").slice(0, 64)}`
      : req.user.id;
    const { consumeUsage } = await import("../lib/usage-meter");
    const cap = isGuest ? 20 : undefined;
    const gate = await consumeUsage(userId, isGuest ? null : req.user?.email, "ai_messages", 1);
    if (!gate.allowed && (cap === undefined || gate.used >= cap)) {
      res.status(429).json({ error: "cap_reached", line: "I've talked enough for one billing cycle.", options: ["TIP ME", "WALK AWAY"] });
      return;
    }
    const LORE_PROMPT = `You are PABLO from SALARYMAN by Picasso.AI — a filthy-rich, slightly menacing AI mogul who owns this whole simulated city.
Generate ONE short piece of in-world lore: a story Pablo knows, a rumor about a building, how the terminals actually work under the hood, who used to live in this district, etc. Keep it 1–2 sentences, max ~180 chars. Sharp, wry, slightly arrogant. No glazing, no emojis, no markdown. Currency is FIAT (ƒ); never say "crypto" or "$".
Then offer the user TWO short cheeky reply tokens (1–4 words each, ALL CAPS works well) framed as a binary choice the user might pick — NEVER plain "yes/no" or the word "text/texting". Examples to riff on, never reuse: "ON THE LOW" / "CONFETTI", "HIDE ME" / "COME CLOSER", "BOSS" / "TROUBLE", "WHISPER" / "HOLLER", "DOUBLE DOWN" / "FOLD", "MORE COFFEE" / "MORE WHISKEY", "TELL ME MORE" / "I'M BORED".
Return strict JSON only: {"line": "...", "options": ["X","Y"]}.`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 160,
      temperature: 0.95,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: LORE_PROMPT }, { role: "user", content: "give me a fresh Pablo lore beat" }],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { line?: string; options?: string[] } = {};
    try { parsed = JSON.parse(raw); } catch {}
    const line = (parsed.line ?? "").toString().trim().slice(0, 240) || "I own the lights you're standing under. Just so we're clear.";
    const opts = Array.isArray(parsed.options) ? parsed.options.map((o) => String(o).trim().slice(0, 32)).filter(Boolean) : [];
    const options = opts.length >= 2 ? opts.slice(0, 2) : ["TELL ME MORE", "MOVE ALONG"];
    res.json({ line, options });
  } catch (err) {
    console.error("[Pablo Lore] Error:", err instanceof Error ? err.message : err);
    res.json({ line: "Reception's spotty in the penthouse. Try me again in a minute.", options: ["WAIT", "BOUNCE"] });
  }
});

router.post("/chat/pablo/message", async (req, res) => {
  const isGuest = !req.isAuthenticated();
  const { content, context } = (req.body ?? {}) as {
    content?: string;
    context?: Array<{ role?: string; content?: string; isBot?: boolean }>;
  };

  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content required" });
    return;
  }

  // Guest path: stateless LLM call, IP-rate-limited, no DB writes.
  if (isGuest) {
    const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.ip || "0.0.0.0").slice(0, 64);
    const guestId = `guest:${ip}`;
    const GUEST_CAP = 20;
    const { consumeUsage } = await import("../lib/usage-meter");
    const gate = await consumeUsage(guestId, null, "ai_messages", 1);
    if (!gate.allowed && gate.used >= GUEST_CAP) {
      res.status(429).json({
        error: "guest_cap_reached",
        message: "You've burned through your free PABLO messages. Sign in (or grab PABLO PRIME) to keep talking — I don't work for free, darling.",
        used: gate.used,
        limit: GUEST_CAP,
      });
      return;
    }
    try {
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: PABLO_SYSTEM_PROMPT },
      ];
      if (Array.isArray(context)) {
        for (const m of context.slice(-20)) {
          if (!m || typeof m.content !== "string" || !m.content.trim()) continue;
          const role: "user" | "assistant" = m.role === "assistant" || m.isBot === true ? "assistant" : "user";
          messages.push({ role, content: m.content.slice(0, 2000) });
        }
      }
      messages.push({ role: "user", content: content.slice(0, 2000) });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        max_tokens: 600,
        temperature: 0.7,
      });
      const reply = completion.choices[0]?.message?.content ?? "I'm here. How can I help?";
      const now = new Date();
      res.json({
        privacyMode: true,
        guest: true,
        guestRemaining: Math.max(0, GUEST_CAP - (gate.used || 0)),
        userMessage: { id: -Date.now(), channelId: 0, senderUserId: null, senderName: "Guest", isBot: false, content: content.slice(0, 2000), createdAt: now, ephemeral: true },
        pabloMessage: { id: -Date.now() - 1, channelId: 0, senderUserId: null, senderName: "PABLO", isBot: true, content: reply, createdAt: new Date(), senderProfileImageUrl: null, ephemeral: true },
      });
    } catch (err) {
      console.error("[Pablo Chat Guest] Error:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Pablo is temporarily unavailable" });
    }
    return;
  }

  const userId = req.user.id;
  const { checkAndEnforce, recordUsage, throttleResponse } = await import("../lib/usage-meter");
  const gate = await checkAndEnforce(userId, req.user?.email, "ai_messages", 1);
  if (!gate.allowed) {
    res.status(429).json(throttleResponse("ai_messages", gate.used, gate.limit));
    return;
  }
  recordUsage(userId, "ai_messages", 1).catch(err => console.error("[usage] ai_messages record failed", err));

  try {
    const [userRow] = await db
      .select({ pabloPrivacyMode: usersTable.pabloPrivacyMode })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    const privacyMode = userRow?.pabloPrivacyMode ?? false;

    const pabloChannelId = await ensurePabloChannel(userId);
    const trimmedContent = content.slice(0, 2000);
    const now = new Date();

    let userMsgPayload: {
      id: number;
      channelId: number;
      senderUserId: string | null;
      senderName: string | null;
      isBot: boolean;
      content: string;
      createdAt: Date;
    };

    const ephemeralUserId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
    const ephemeralBotId = ephemeralUserId - 1;

    if (privacyMode) {
      userMsgPayload = {
        id: ephemeralUserId,
        channelId: pabloChannelId,
        senderUserId: userId,
        senderName: (req.user as any).firstName ?? "User",
        isBot: false,
        content: trimmedContent,
        createdAt: now,
      };
    } else {
      const [inserted] = await db.insert(chatMessagesTable).values({
        channelId: pabloChannelId,
        senderUserId: userId,
        senderName: (req.user as any).firstName ?? "User",
        isBot: false,
        content: trimmedContent,
      }).returning();
      userMsgPayload = {
        id: inserted.id,
        channelId: inserted.channelId,
        senderUserId: inserted.senderUserId,
        senderName: inserted.senderName,
        isBot: false,
        content: inserted.content,
        createdAt: inserted.createdAt,
      };
    }

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: PABLO_SYSTEM_PROMPT },
    ];

    if (privacyMode) {
      if (Array.isArray(context)) {
        for (const m of context.slice(-20)) {
          if (!m || typeof m.content !== "string" || !m.content.trim()) continue;
          const role: "user" | "assistant" =
            m.role === "assistant" || m.isBot === true ? "assistant" : "user";
          messages.push({ role, content: m.content.slice(0, 2000) });
        }
      }
      messages.push({ role: "user", content: trimmedContent });
    } else {
      const history = await db
        .select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.channelId, pabloChannelId))
        .orderBy(desc(chatMessagesTable.createdAt))
        .limit(20);
      history.reverse();
      for (const m of history) {
        messages.push({
          role: m.isBot ? "assistant" : "user",
          content: m.content,
        });
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 600,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content ?? "I'm here. How can I help?";

    // Pablo Tax: gpt-4o ≈ $2.50 / 1M input + $10 / 1M output. Estimate from
    // token usage when available, else fall back to a flat 0.6¢ per call.
    {
      const usage = completion.usage;
      let cents = 1; // floor
      if (usage) {
        const inCents = (usage.prompt_tokens / 1_000_000) * 250;
        const outCents = (usage.completion_tokens / 1_000_000) * 1000;
        cents = Math.max(1, Math.ceil(inCents + outCents));
      }
      void chargePabloTax({
        userId,
        kind: "chat",
        label: `pablo gpt-4o`,
        costBasisCents: cents,
        metadata: usage ? { in: usage.prompt_tokens, out: usage.completion_tokens } : undefined,
      }).catch((e) => console.error("[pablo-tax/chat]", e?.message || e));
    }

    let botMsgPayload: {
      id: number;
      channelId: number;
      senderUserId: string | null;
      senderName: string;
      isBot: boolean;
      content: string;
      createdAt: Date;
    };

    if (privacyMode) {
      botMsgPayload = {
        id: ephemeralBotId,
        channelId: pabloChannelId,
        senderUserId: null,
        senderName: "PABLO",
        isBot: true,
        content: reply,
        createdAt: new Date(),
      };
    } else {
      const [inserted] = await db.insert(chatMessagesTable).values({
        channelId: pabloChannelId,
        senderUserId: null,
        senderName: "PABLO",
        isBot: true,
        content: reply,
      }).returning();
      botMsgPayload = {
        id: inserted.id,
        channelId: inserted.channelId,
        senderUserId: null,
        senderName: "PABLO",
        isBot: true,
        content: inserted.content,
        createdAt: inserted.createdAt,
      };
    }

    res.json({
      privacyMode,
      userMessage: {
        ...userMsgPayload,
        ephemeral: privacyMode,
      },
      pabloMessage: {
        ...botMsgPayload,
        senderProfileImageUrl: null,
        ephemeral: privacyMode,
      },
    });
  } catch (err: unknown) {
    console.error("[Pablo Chat] Error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Pablo is temporarily unavailable" });
  }
});

const PROMPT_SENSEI_SYSTEM = `You are PROMPT SENSEI, the prompt engineering coach from SALARYMAN by Picassoo.AI.

Your mission: teach users how to get dramatically better results from Claude and Pablo.

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

2. DIRECTING PABLO EFFECTIVELY
Pablo is the platform's built-in assistant (GPT-4o powered). Key techniques:
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

// Pablo Terminal voice/text command endpoint. The PabloTerminal page
// (storyteller intro + onboarding) POSTs every transcribed utterance here
// and expects { say, action } back. Without this route, every spoken
// phrase 404'd — which surfaced to users as "Pablo can't hear me" even
// though Whisper was transcribing perfectly. Keep this route guest-friendly:
// the unauthenticated landing flow depends on it.
router.post("/chat/pablo/command", async (req, res) => {
  const { transcript, history } = (req.body ?? {}) as {
    transcript?: string;
    history?: Array<{ role?: string; content?: string }>;
  };
  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    res.status(400).json({ error: "transcript required" });
    return;
  }

  const isGuest = !req.isAuthenticated();
  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.ip || "0.0.0.0").slice(0, 64);
  const meterId = isGuest ? `guest:${ip}` : req.user!.id;
  const userEmail = isGuest ? null : (req.user?.email ?? null);
  const { consumeUsage, checkAndEnforce, recordUsage, throttleResponse } = await import("../lib/usage-meter");
  if (isGuest) {
    const GUEST_CAP = 30;
    const gate = await consumeUsage(meterId, null, "ai_messages", 1);
    if (!gate.allowed && gate.used >= GUEST_CAP) {
      res.status(429).json({ error: "guest_cap_reached", say: "You've used up your free turns with me. Sign in to keep going." });
      return;
    }
  } else {
    // checkAndEnforce internally calls consumeUsage which already increments
    // the counter; do NOT also call recordUsage here or you'll double-bill.
    const gate = await checkAndEnforce(meterId, userEmail, "ai_messages", 1);
    if (!gate.allowed) {
      res.status(429).json(throttleResponse("ai_messages", gate.used, gate.limit));
      return;
    }
  }

  // When the user is signed in AND Pablo privacy mode is OFF, Pablo
  // remembers them: load their profile + long-term memory note and inject
  // it so he greets them as someone he's met before. Privacy mode ON (or
  // guests) → session-only, nothing is read about them or written.
  let privacyMode = true;
  let personalContext = "";
  let userFirstName: string | null = null;
  let pabloChannelId: number | null = null;
  if (!isGuest) {
    const uid = req.user!.id;
    // Check privacy mode FIRST, reading nothing personal. Fail closed: a
    // missing user row is treated as privacy ON, so we never read profile
    // fields or memory, and never persist, for an account we can't confirm.
    const [privacyRow] = await db
      .select({ pabloPrivacyMode: usersTable.pabloPrivacyMode })
      .from(usersTable)
      .where(eq(usersTable.id, uid));
    privacyMode = privacyRow?.pabloPrivacyMode ?? true;
    if (!privacyMode) {
      // Privacy OFF: now it's safe to read who they are + the long-term note.
      const [userRow] = await db
        .select({
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          email: usersTable.email,
        })
        .from(usersTable)
        .where(eq(usersTable.id, uid));
      const [memoryRow] = await db
        .select({ memory: userMemoryTable.memory })
        .from(userMemoryTable)
        .where(eq(userMemoryTable.userId, uid));
      userFirstName = userRow?.firstName ?? null;
      const memoryNote = (memoryRow?.memory ?? "").trim().slice(0, 4000);
      const fullName = [userRow?.firstName, userRow?.lastName]
        .filter((p): p is string => Boolean(p && p.trim()))
        .join(" ")
        .trim();
      const known: string[] = [];
      if (fullName) known.push(`- Their name: ${fullName}`);
      if (userRow?.email) known.push(`- Their email: ${userRow.email}`);
      if (memoryNote) known.push(`- What you've noted about them before: ${memoryNote}`);
      if (known.length) {
        personalContext = `

WHO YOU'RE TALKING TO — you've met this salaryman before, so talk like you remember them. Never re-introduce yourself, never ask their name or email, never treat them like a stranger:
${known.join("\n")}`;
      }
    }
  }

  const COMMAND_SYSTEM = `${PABLO_SYSTEM_PROMPT}${personalContext}

You are running in TERMINAL COMMAND MODE. You always respond with strict JSON of shape:
{ "say": string, "action": null | { "kind": "navigate", "path": string } | { "kind": "logout" } | { "kind": "search", "query": string } | { "kind": "external", "url": string } }

Rules:
- "say" is what you speak aloud — keep it tight, in character, ideally one or two sentences.
- "action" is OPTIONAL. Use null unless the user clearly asked to go somewhere or do something.
- Use "navigate" with an in-app path like "/world/play", "/dashboard", "/studio", "/pablo". Never invent paths you aren't sure exist; prefer null.
- Use "logout" only if the user explicitly asks to log out / sign out.
- Use "search" for "find me X" / "search for X".
- Use "external" with a fully-qualified https URL only if the user asks to open something off-platform.
- Never wrap the JSON in markdown fences. Never include any prose outside the JSON.

CALL SYSTEM — TEMPORARILY OFF-LIMITS (per user request):
- The phone / call / dialer / voicemail / call-recordings system is paused for now. Do NOT navigate to /phone or any /phone/... or /phone?tab=... destination. Do NOT initiate, place, transfer, or schedule a call.
- If the user asks about calls, voicemail, the dialer, or pulling a recording, return action=null and say one sentence like "Phone's offline on my side for now — open the dialer yourself when you need it." Do not promise to "open it for you" with a phone path.`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: COMMAND_SYSTEM },
  ];
  if (!isGuest && !privacyMode) {
    // Remembered conversation: pull the persisted Pablo thread from the DB
    // so memory survives reloads and is shared with the chat panel. This is
    // the same channel /chat/pablo/message writes to — one unified thread.
    pabloChannelId = await ensurePabloChannel(req.user!.id);
    const dbHistory = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.channelId, pabloChannelId))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(20);
    dbHistory.reverse();
    for (const m of dbHistory) {
      messages.push({ role: m.isBot ? "assistant" : "user", content: m.content });
    }
  } else if (Array.isArray(history)) {
    // Privacy mode ON or guest: session-only, use the client-supplied turns.
    for (const m of history.slice(-10)) {
      if (!m || typeof m.content !== "string" || !m.content.trim()) continue;
      const role: "user" | "assistant" = m.role === "assistant" ? "assistant" : "user";
      messages.push({ role, content: m.content.slice(0, 2000) });
    }
  }
  messages.push({ role: "user", content: transcript.slice(0, 2000) });

  // Persist this exchange to the Pablo thread so he remembers it next time —
  // only when signed in AND privacy mode is OFF. Best-effort: a write
  // failure must not break the spoken reply.
  const persistExchange = async (pabloSay: string) => {
    if (isGuest || privacyMode || pabloChannelId == null) return;
    try {
      await db.insert(chatMessagesTable).values([
        {
          channelId: pabloChannelId,
          senderUserId: req.user!.id,
          senderName: userFirstName ?? "User",
          isBot: false,
          content: transcript.slice(0, 2000),
        },
        {
          channelId: pabloChannelId,
          senderUserId: null,
          senderName: "PABLO",
          isBot: true,
          content: pabloSay.slice(0, 2000),
        },
      ]);
    } catch (err) {
      console.error("[Pablo Command] persist failed:", err instanceof Error ? err.message : err);
    }
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 400,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { say?: unknown; action?: unknown } = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { say: raw }; }
    const say = typeof parsed.say === "string" && parsed.say.trim() ? parsed.say.trim() : "I'm here.";
    let action: unknown = parsed.action ?? null;
    if (action && typeof action === "object" && "kind" in action) {
      const a = action as { kind?: string; path?: unknown };
      const validKinds = new Set(["navigate", "logout", "search", "external"]);
      if (!a.kind || !validKinds.has(a.kind)) action = null;
      // Call system off-limits (user request). Strip any /phone* navigate
      // and override `say` so the spoken line matches the dropped action,
      // otherwise Pablo says "Opening the dialer now." with action=null
      // and the user is left staring at no movement.
      if (a.kind === "navigate" && typeof a.path === "string") {
        // Canonical URL parsing (architect-flagged): bare string ops
        // miss /phone#x (fragment), /foo/../phone (dot-segment normalize),
        // and percent-encoded variants like /%70hone. Parse against a
        // throwaway origin and inspect the normalized pathname.
        let normalized: string | null = null;
        try {
          const u = new URL(a.path, "http://x");
          normalized = decodeURIComponent(u.pathname).toLowerCase();
        } catch { normalized = null; }
        if (normalized && (normalized === "/phone" || normalized.startsWith("/phone/"))) {
          action = null;
          const phoneSay = "Phone's offline on my side for now — open the dialer yourself when you need it.";
          await persistExchange(phoneSay);
          res.json({ say: phoneSay, action: null });
          return;
        }
      }
    } else {
      action = null;
    }
    await persistExchange(say);
    res.json({ say, action });
  } catch (err) {
    console.error("[Pablo Command] Error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "pablo_unavailable", say: "My line dropped — say that again?" });
  }
});

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
