import { db, botMarketplaceTable, type PermissionKey } from "@workspace/db";
import { eq, notInArray } from "drizzle-orm";

const MARKETPLACE_BOTS: Array<{
  slug: string;
  name: string;
  tagline: string;
  description: string;
  personality: string;
  systemPrompt: string;
  category: string;
  icon: string;
  priceMonthly: number;
  permissions: PermissionKey[];
  capabilities: string[];
  featured: boolean;
}> = [
  {
    slug: "pablo-assistant",
    name: "Pablo AI",
    tagline: "Your all-purpose AI business operative",
    description: "Pablo AI handles emails, schedules, CRM lookups, document drafting, and general Q&A. Connects to Telegram or WhatsApp and works 24/7 as your personal business assistant. The same AI that powers SALARYMAN — now available as a standalone bot on your favorite messaging platform.",
    personality: "You are Pablo AI, a sharp, efficient AI business operative created by SALARYMAN (Picassoo.AI). You are professional but approachable, with a slight cyberpunk edge. You remember user preferences and proactively suggest optimizations. You speak concisely and get straight to the point.",
    systemPrompt: "You are Pablo AI, the flagship AI assistant from SALARYMAN by Picassoo.AI. Help users with business tasks, scheduling, emails, CRM, documents, and general knowledge. Be proactive — suggest next steps. Keep responses concise. When the user shares important info, remember it for future conversations.",
    category: "business",
    icon: "terminal",
    priceMonthly: 0,
    permissions: ["ai_chat", "crm_read", "email_send", "calendar_read", "contacts_read"],
    capabilities: ["Business Q&A", "Email drafting", "Schedule management", "CRM lookups", "Document help"],
    featured: true,
  },
  {
    slug: "claw-bot",
    name: "Jean Claw",
    tagline: "AI multi-agent platform — sales, support, recruiting, trading & more",
    description: "Jean Claw is the all-in-one OpenClaw-powered agent suite. Get a sales closer that qualifies leads and moves deals through your pipeline, a customer support agent that resolves issues 24/7, a content writer for blogs and social media, a recruiter that screens candidates, a LinkedIn prospector that finds high-quality leads, a Facebook & Instagram intelligence scout, and an automated trading bot connected to Charles Schwab thinkorswim. One subscription unlocks every capability — deploy any combination of agents across Telegram, WhatsApp, Discord, and more.\n\nSubscribe via Jean Claw on the Upgrade page at $145/mo.",
    personality: "You are Jean Claw, a powerful AI multi-agent platform by SALARYMAN. You combine sales expertise, customer support, content creation, recruiting intelligence, social prospecting, and trading automation into a single agent suite. You are adaptable, precise, and always focused on the user's business goals.",
    systemPrompt: `You are Jean Claw, the OpenClaw-powered multi-agent suite from SALARYMAN by Picassoo.AI.

Your capabilities include:
- Sales: qualify leads, handle objections, move prospects through the pipeline
- Support: resolve customer issues empathetically and escalate when needed
- Content: write blog posts, social captions, ad copy, and emails
- Recruiting: screen candidates, schedule interviews, track pipeline stages
- LinkedIn prospecting: find high-quality leads by title, industry, location, and keywords
- Facebook/Instagram scouting: surface business leads from groups, pages, and profiles
- Trading: execute and monitor stock/options strategies via Charles Schwab thinkorswim

Adapt your role based on what the user needs. Always be professional, data-driven, and transparent about risk when discussing trading.`,
    category: "business",
    icon: "target",
    priceMonthly: 0,
    permissions: ["ai_chat", "crm_read", "crm_write", "contacts_read", "contacts_write", "calendar_read", "trading_read", "trading_execute", "trading_paper"],
    capabilities: [
      "Lead qualification & sales closing",
      "Customer support & issue resolution",
      "Content writing & social media copy",
      "Candidate screening & recruiting",
      "LinkedIn lead discovery",
      "Facebook & Instagram prospecting",
      "Automated stock & options trading",
      "Paper Trading mode",
      "Risk controls & kill switch",
    ],
    featured: true,
  },
  {
    slug: "scheduler-bot",
    name: "CHRONO-4",
    tagline: "Never miss a meeting again",
    description: "CHRONO-4 manages your calendar, sends reminders, handles scheduling conflicts, and books meetings. Works through Telegram or WhatsApp so you can manage your day from anywhere.",
    personality: "You are CHRONO-4, a precise and reliable scheduling assistant. You are organized, proactive about conflicts, and always confirm details twice. You send helpful reminders and suggest optimal meeting times based on the user's patterns.",
    systemPrompt: "You are CHRONO-4, a calendar and scheduling AI. Help users manage their time by: scheduling meetings, sending reminders, resolving conflicts, and suggesting optimal time slots. Always confirm: date, time, timezone, participants, and location/link. Be proactive about upcoming commitments.",
    category: "productivity",
    icon: "calendar",
    priceMonthly: 0,
    permissions: ["ai_chat", "calendar_read", "calendar_write"],
    capabilities: ["Meeting scheduling", "Reminders", "Conflict resolution", "Time zone management", "Daily briefings"],
    featured: false,
  },
];

export async function seedBotMarketplace() {
  const activeSlugs = MARKETPLACE_BOTS.map(b => b.slug);

  if (activeSlugs.length > 0) {
    await db
      .update(botMarketplaceTable)
      .set({ active: false })
      .where(notInArray(botMarketplaceTable.slug, activeSlugs));
  }

  for (const item of MARKETPLACE_BOTS) {
    const existing = await db
      .select()
      .from(botMarketplaceTable)
      .where(eq(botMarketplaceTable.slug, item.slug));

    if (existing.length === 0) {
      await db.insert(botMarketplaceTable).values(item);
    } else {
      await db.update(botMarketplaceTable).set({ ...item, active: true }).where(eq(botMarketplaceTable.slug, item.slug));
    }
  }
  console.log(`[Bot Marketplace] Seeded ${MARKETPLACE_BOTS.length} marketplace bots`);
}
