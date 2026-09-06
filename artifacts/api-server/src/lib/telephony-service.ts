// ── Telephony service ───────────────────────────────────────────────────────
// Callable, route-independent outreach services that BOTH the manual screens and
// the CRM autopilot use, so the manual and automatic paths can never diverge.
// Today this owns outbound SMS (extracted from the `/sms/send` route). The
// function sends via Twilio, persists the user-scoped SMS conversation/message,
// and records the interaction into the org CRM via recordTelephonyActivity so the
// shared timeline, dedupe and lead side-effects fire identically for both paths.
import { db, smsConversationsTable, smsMessagesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import twilio from "twilio";
import { recordTelephonyActivity } from "./crm-recorder";
import { toE164 } from "./phone";
import { getOutboundNumberForRouting } from "./phone-number-service";
import { canUsePlatformTwilio } from "./platform-twilio-access";

// Re-export the shared, country-aware normalizer so existing importers
// (campaigns.ts) keep working through the single source of truth.
export { toE164 } from "./phone";

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("Twilio credentials not configured");
  return twilio(accountSid, authToken);
}

export interface SendSmsInput {
  /** Handling user — the SMS conversation is scoped to them, exactly like a manual send. */
  userId: string;
  userEmail?: string | null;
  /** The OTHER party's number (the recipient). */
  phone: string;
  body: string;
  contactId?: number | null;
  contactName?: string | null;
  /**
   * Org to attribute the CRM activity to. Optional: when omitted the recorder
   * resolves the user's active org (manual-route behavior). The autopilot passes
   * its own orgId so a multi-org owner can't be misattributed.
   */
  orgId?: number | null;
  /**
   * ISO country (e.g. "US" / "VN") used to normalize a LOCAL recipient number to
   * E.164. Explicit "+" numbers ignore it. Defaults to US so existing callers
   * are unchanged; country-aware callers pass the sender's home-city country.
   */
  defaultCountry?: string;
  /** Optional CRM-selected sender from the user's personal/org phone pool. */
  phoneNumberId?: number | null;
}

export interface SendSmsResult {
  message: typeof smsMessagesTable.$inferSelect;
  conversation: typeof smsConversationsTable.$inferSelect;
  /** The normalized E.164 recipient number the message was sent to. */
  toPhone: string;
}

/**
 * Send an outbound SMS and record it everywhere a manual send would. Throws on
 * invalid input or a Twilio/DB failure so callers can surface the error their
 * own way (the route maps it to an HTTP status; the autopilot logs it).
 */
export async function sendSmsMessage(input: SendSmsInput): Promise<SendSmsResult> {
  const { userId, userEmail, contactId, contactName, orgId, defaultCountry } = input;
  const trimmed = (input.body || "").trim();
  if (!trimmed) throw new Error("Message body required");
  const e164 = toE164(input.phone, defaultCountry);
  if (!e164) throw new Error("Invalid phone number");
  if (!(await canUsePlatformTwilio(userId, userEmail))) throw new Error("Platform Twilio access denied");

  const client = getTwilioClient();
  const fromNumber = await getOutboundNumberForRouting({ userId, orgId, phoneNumberId: input.phoneNumberId });

  const msg = await client.messages.create({ from: fromNumber, to: e164, body: trimmed });

  let [conv] = await db
    .select()
    .from(smsConversationsTable)
    .where(and(eq(smsConversationsTable.userId, userId), eq(smsConversationsTable.contactPhone, e164)));

  if (!conv) {
    const name = contactName || e164;
    [conv] = await db
      .insert(smsConversationsTable)
      .values({ userId, contactId: contactId || null, contactPhone: e164, contactName: name, lastMessageAt: new Date() })
      .returning();
  } else {
    await db
      .update(smsConversationsTable)
      .set({ lastMessageAt: new Date(), contactName: contactName || conv.contactName })
      .where(eq(smsConversationsTable.id, conv.id));
  }

  const [message] = await db
    .insert(smsMessagesTable)
    .values({
      conversationId: conv.id,
      userId,
      direction: "outbound",
      body: trimmed,
      fromPhone: fromNumber,
      toPhone: e164,
      twilioMessageSid: msg.sid,
      status: msg.status || "sent",
      isRead: true,
    })
    .returning();

  await recordTelephonyActivity({
    userId,
    orgId: orgId ?? undefined,
    channel: "sms",
    direction: "outbound",
    phone: e164,
    contactName: contactName || conv.contactName || undefined,
    contactId: contactId || undefined,
    body: trimmed,
    twilioSid: msg.sid,
  }).catch(() => {});

  return { message, conversation: conv, toPhone: e164 };
}
