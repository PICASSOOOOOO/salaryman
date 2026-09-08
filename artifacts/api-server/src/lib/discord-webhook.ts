import { db, discordWebhooksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { safeFetch } from "./safe-fetch";

export type DiscordWebhookEvent =
  | "new_hire"
  | "new_contact"
  | "new_applicant"
  | "weekly_summary"
  | "applicant_stage_changed"
  | "deal_stage_changed";

const EVENT_FLAGS: Record<DiscordWebhookEvent, keyof typeof discordWebhooksTable.$inferSelect> = {
  new_hire: "eventNewHire",
  new_contact: "eventNewContact",
  new_applicant: "eventNewApplicant",
  weekly_summary: "eventWeeklySummary",
  applicant_stage_changed: "eventApplicantStageChanged",
  deal_stage_changed: "eventDealStageChanged",
};

// PABLO CORP brand accent (sky-400) as a Discord embed color (decimal int).
const EMBED_COLOR = 0x38bdf8;

// Constrain user-supplied webhook URLs to genuine Discord webhook endpoints.
// This limits the SSRF blast radius — server-side fetch can only ever hit
// Discord's own hosts, never arbitrary internal/external addresses.
export function isValidDiscordWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.hostname !== "discord.com" && u.hostname !== "discordapp.com") return false;
    return u.pathname.startsWith("/api/webhooks/");
  } catch {
    return false;
  }
}

const EVENT_TITLES: Record<DiscordWebhookEvent, string> = {
  new_hire: "🧑‍💼 New Hire",
  new_contact: "📇 New Contact Added",
  new_applicant: "📨 New Applicant",
  weekly_summary: "📊 Weekly Summary",
  applicant_stage_changed: "🔄 Applicant Stage Changed",
  deal_stage_changed: "💼 Deal Stage Changed",
};

type DiscordEmbedField = { name: string; value: string; inline?: boolean };

// Translate the loose event payloads (same shapes the Zapier webhook fires)
// into Discord embed fields. Discord webhooks require a specific JSON body
// ({ content?, embeds? }) — raw arbitrary JSON like Zapier accepts is
// rejected, so we shape the payload into an embed here.
function buildFields(event: DiscordWebhookEvent, payload: Record<string, unknown>): DiscordEmbedField[] {
  const fields: DiscordEmbedField[] = [];
  const push = (name: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    fields.push({ name, value: String(value), inline: true });
  };

  switch (event) {
    case "new_applicant": {
      const a = (payload.applicant ?? {}) as Record<string, unknown>;
      push("Name", a.name);
      push("Email", a.email);
      push("Job ID", a.jobId);
      break;
    }
    case "applicant_stage_changed": {
      const a = (payload.applicant ?? {}) as Record<string, unknown>;
      push("Name", a.name);
      push("From", a.fromStage);
      push("To", a.toStage);
      push("Email", a.email);
      push("Job ID", a.jobId);
      break;
    }
    case "deal_stage_changed": {
      const c = (payload.contact ?? {}) as Record<string, unknown>;
      push("Contact", c.name);
      push("From", c.fromStage);
      push("To", c.toStage);
      push("Company", c.company);
      push("Email", c.email);
      break;
    }
    case "new_hire": {
      const h = (payload.hire ?? {}) as Record<string, unknown>;
      push("Name", h.name);
      push("Role", h.role);
      push("Email", h.email);
      break;
    }
    case "new_contact": {
      const c = (payload.contact ?? {}) as Record<string, unknown>;
      push("Name", c.name);
      push("Email", c.email);
      break;
    }
    case "weekly_summary": {
      const s = (payload.summary ?? {}) as Record<string, unknown>;
      const b = (payload.billing ?? {}) as Record<string, unknown>;
      push("Open Positions", s.openPositions);
      push("Total Applicants", s.totalApplicants);
      push("Active Staff", s.activeStaff);
      push("Hires This Month", s.hiresThisMonth);
      push("Contacts", s.totalContacts);
      push("Active Projects", s.activeProjects);
      if (b.estimatedMRR !== undefined) push("Est. MRR", `$${b.estimatedMRR}`);
      break;
    }
  }
  return fields;
}

function buildEmbed(event: DiscordWebhookEvent, payload: Record<string, unknown>) {
  return {
    title: EVENT_TITLES[event],
    color: EMBED_COLOR,
    fields: buildFields(event, payload),
    footer: { text: "SALARYMAN · PABLO CORP" },
    timestamp: new Date().toISOString(),
  };
}

export function buildDiscordEmbedBody(event: DiscordWebhookEvent, payload: Record<string, unknown>) {
  return {
    username: "PABLO CORP",
    embeds: [buildEmbed(event, payload)],
  };
}

// Representative sample data for each event, used by the "Send Test" preview so
// users can see exactly how each enabled alert will look in their channel —
// including the from/to fields on the stage-change events — before relying on them.
const SAMPLE_PAYLOADS: Record<DiscordWebhookEvent, Record<string, unknown>> = {
  new_hire: { hire: { name: "Akira Tanaka", role: "Sales Associate", email: "akira.tanaka@example.com" } },
  new_contact: { contact: { name: "Mei Watanabe", email: "mei.watanabe@example.com" } },
  new_applicant: { applicant: { name: "Kenji Sato", email: "kenji.sato@example.com", jobId: "JOB-1024" } },
  applicant_stage_changed: {
    applicant: { name: "Kenji Sato", fromStage: "Screening", toStage: "Interview", email: "kenji.sato@example.com", jobId: "JOB-1024" },
  },
  deal_stage_changed: {
    contact: { name: "Mei Watanabe", fromStage: "Proposal", toStage: "Negotiation", company: "Nakamura Holdings", email: "mei.watanabe@example.com" },
  },
  weekly_summary: {
    summary: { openPositions: 4, totalApplicants: 87, activeStaff: 23, hiresThisMonth: 3, totalContacts: 156, activeProjects: 9 },
    billing: { estimatedMRR: 475 },
  },
};

// Build a single Discord message containing one sample embed per enabled event,
// prefixed with a header so users understand these are previews, not live alerts.
// Discord allows up to 10 embeds per message; the six possible events fit within that.
export function buildSampleDiscordBody(events: DiscordWebhookEvent[]) {
  return {
    username: "PABLO CORP",
    content: "🔍 **Sample preview** — this is how your enabled alerts will appear. No live data was sent.",
    embeds: events.map((event) => buildEmbed(event, SAMPLE_PAYLOADS[event])),
  };
}

export async function fireDiscordWebhook(
  userId: string,
  event: DiscordWebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const [row] = await db
      .select()
      .from(discordWebhooksTable)
      .where(eq(discordWebhooksTable.userId, userId));

    if (!row || !row.webhookUrl) return;
    if (!isValidDiscordWebhookUrl(row.webhookUrl)) return;

    const flag = EVENT_FLAGS[event];
    if (!row[flag]) return;

    const response = await safeFetch(row.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordEmbedBody(event, payload)),
      timeoutMs: 8000,
    });
    if (!response.ok) {
      console.error(`[Discord] Event "${event}" for user ${userId} rejected by Discord: HTTP ${response.status}`);
    }
  } catch (err) {
    console.error(`[Discord] Failed to fire event "${event}" for user ${userId}:`, err instanceof Error ? err.message : err);
  }
}
