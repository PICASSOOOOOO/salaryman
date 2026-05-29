import { db, discordWebhooksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type DiscordWebhookEvent =
  | "new_hire"
  | "new_contact"
  | "new_applicant"
  | "weekly_summary";

const EVENT_FLAGS: Record<DiscordWebhookEvent, keyof typeof discordWebhooksTable.$inferSelect> = {
  new_hire: "eventNewHire",
  new_contact: "eventNewContact",
  new_applicant: "eventNewApplicant",
  weekly_summary: "eventWeeklySummary",
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

export function buildDiscordEmbedBody(event: DiscordWebhookEvent, payload: Record<string, unknown>) {
  return {
    username: "PABLO CORP",
    embeds: [
      {
        title: EVENT_TITLES[event],
        color: EMBED_COLOR,
        fields: buildFields(event, payload),
        footer: { text: "SALARYMAN · PABLO CORP" },
        timestamp: new Date().toISOString(),
      },
    ],
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

    const response = await fetch(row.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordEmbedBody(event, payload)),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error(`[Discord] Event "${event}" for user ${userId} rejected by Discord: HTTP ${response.status}`);
    }
  } catch (err) {
    console.error(`[Discord] Failed to fire event "${event}" for user ${userId}:`, err instanceof Error ? err.message : err);
  }
}
