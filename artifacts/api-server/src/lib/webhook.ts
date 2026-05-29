import { db, zapierWebhooksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { safeFetch } from "./safe-fetch";

// Basic validation for user-supplied Zapier webhook URLs at save time.
// Must be a well-formed http(s) URL. The deeper SSRF protection (rejecting
// private/loopback/link-local addresses, resolving DNS before connecting)
// happens at delivery time via safeFetch, since DNS can change after save.
export function isValidWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export type WebhookEvent =
  | "new_hire"
  | "new_contact"
  | "new_applicant"
  | "weekly_summary"
  | "applicant_stage_changed"
  | "deal_stage_changed";

const EVENT_FLAGS: Record<WebhookEvent, keyof typeof zapierWebhooksTable.$inferSelect> = {
  new_hire: "eventNewHire",
  new_contact: "eventNewContact",
  new_applicant: "eventNewApplicant",
  weekly_summary: "eventWeeklySummary",
  applicant_stage_changed: "eventApplicantStageChanged",
  deal_stage_changed: "eventDealStageChanged",
};

export async function fireWebhook(
  userId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const [row] = await db
      .select()
      .from(zapierWebhooksTable)
      .where(eq(zapierWebhooksTable.userId, userId));

    if (!row || !row.webhookUrl) return;

    const flag = EVENT_FLAGS[event];
    if (!row[flag]) return;

    await safeFetch(row.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        ...payload,
      }),
      timeoutMs: 8000,
    });
  } catch (err) {
    console.error(`[Webhook] Failed to fire event "${event}" for user ${userId}:`, err instanceof Error ? err.message : err);
  }
}
