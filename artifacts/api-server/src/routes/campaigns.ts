import { Router, type Request, type Response } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "../lib/openai-models";
import {
  db,
  emailCampaignsTable,
  emailCampaignRecipientsTable,
  smsCampaignsTable,
  smsCampaignRecipientsTable,
  smsConversationsTable,
  smsMessagesTable,
  contactsTable,
  contactChannelPrefsTable,
  notificationsTable,
} from "@workspace/db";
import { getUncachableResendClient } from "../lib/resend";
import { hasFeature } from "../lib/plan";
import { recordTelephonyActivity } from "../lib/crm-recorder";
import { sendSmsMessage } from "../lib/telephony-service";
import { toE164 } from "../lib/phone";
import { resolveUserCountry } from "../lib/phone-context";
import { canUsePlatformTwilio } from "../lib/platform-twilio-access";

const router = Router();

async function requireAuth(req: Request, res: Response): Promise<string | null> {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  const userId = (req.user as { id: string } | undefined)?.id ?? null;
  if (!userId) return null;
  const has = await hasFeature(userId, req.user?.email, "phone_system");
  if (!has) {
    res.status(403).json({ error: "Calll Home subscription required ($95/mo)", feature: "phone_system", price: 95, upgrade: "/upgrade" });
    return null;
  }
  if (!(await canUsePlatformTwilio(userId, req.user?.email))) {
    res.status(403).json({ error: "Platform phone system is restricted to authorized organizations.", code: "TWILIO_ORG_RESTRICTED" });
    return null;
  }
  return userId;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL CAMPAIGNS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/campaigns/email", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const campaigns = await db
      .select()
      .from(emailCampaignsTable)
      .where(eq(emailCampaignsTable.userId, userId))
      .orderBy(desc(emailCampaignsTable.createdAt));
    res.json({ campaigns });
  } catch (err: any) {
    console.error("[campaigns] email list error:", err.message);
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

router.get("/campaigns/email/:id", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const [campaign] = await db
      .select()
      .from(emailCampaignsTable)
      .where(and(eq(emailCampaignsTable.id, Number(req.params.id)), eq(emailCampaignsTable.userId, userId)));
    if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
    const recipients = await db
      .select()
      .from(emailCampaignRecipientsTable)
      .where(eq(emailCampaignRecipientsTable.campaignId, campaign.id))
      .limit(500);
    res.json({ campaign, recipients });
  } catch (err: any) {
    console.error("[campaigns] email get error:", err.message);
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

router.post("/campaigns/email", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { name, subject, previewText, htmlBody, textBody, fromName, replyTo, scheduledAt, recipientFilter } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "Campaign name required" }); return; }
  try {
    const [campaign] = await db
      .insert(emailCampaignsTable)
      .values({
        userId,
        name: name.trim(),
        subject: subject?.trim() || "",
        previewText: previewText?.trim() || "",
        htmlBody: htmlBody || "",
        textBody: textBody || "",
        fromName: fromName?.trim() || "",
        replyTo: replyTo?.trim() || "",
        status: "draft",
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        recipientFilter: recipientFilter || {},
      })
      .returning();
    res.json({ campaign });
  } catch (err: any) {
    console.error("[campaigns] email create error:", err.message);
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.put("/campaigns/email/:id", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { name, subject, previewText, htmlBody, textBody, fromName, replyTo, scheduledAt, recipientFilter, status } = req.body;
  try {
    const [existing] = await db
      .select()
      .from(emailCampaignsTable)
      .where(and(eq(emailCampaignsTable.id, Number(req.params.id)), eq(emailCampaignsTable.userId, userId)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.status === "sent") { res.status(400).json({ error: "Cannot edit a sent campaign" }); return; }

    const updates: Partial<typeof emailCampaignsTable.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (subject !== undefined) updates.subject = subject.trim();
    if (previewText !== undefined) updates.previewText = previewText.trim();
    if (htmlBody !== undefined) updates.htmlBody = htmlBody;
    if (textBody !== undefined) updates.textBody = textBody;
    if (fromName !== undefined) updates.fromName = fromName.trim();
    if (replyTo !== undefined) updates.replyTo = replyTo.trim();
    if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    if (recipientFilter !== undefined) updates.recipientFilter = recipientFilter;
    if (status !== undefined && ["draft", "scheduled"].includes(status)) updates.status = status;

    const [campaign] = await db
      .update(emailCampaignsTable)
      .set(updates)
      .where(eq(emailCampaignsTable.id, existing.id))
      .returning();
    res.json({ campaign });
  } catch (err: any) {
    console.error("[campaigns] email update error:", err.message);
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

router.delete("/campaigns/email/:id", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    await db
      .delete(emailCampaignsTable)
      .where(and(eq(emailCampaignsTable.id, Number(req.params.id)), eq(emailCampaignsTable.userId, userId)));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[campaigns] email delete error:", err.message);
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

router.post("/campaigns/email/:id/send", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { test, testEmail } = req.body;

  try {
    const [campaign] = await db
      .select()
      .from(emailCampaignsTable)
      .where(and(eq(emailCampaignsTable.id, Number(req.params.id)), eq(emailCampaignsTable.userId, userId)));
    if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
    if (!campaign.subject?.trim()) { res.status(400).json({ error: "Subject line required" }); return; }
    if (!campaign.htmlBody?.trim()) { res.status(400).json({ error: "Email body required" }); return; }

    const { client, fromEmail } = await getUncachableResendClient();

    if (test) {
      const email = testEmail || (req.user as any)?.email;
      if (!email) { res.status(400).json({ error: "Test email address required" }); return; }
      await client.emails.send({
        from: campaign.fromName ? `${campaign.fromName} <${fromEmail}>` : fromEmail,
        to: email,
        subject: `[TEST] ${campaign.subject}`,
        html: campaign.htmlBody,
        text: campaign.textBody || undefined,
        replyTo: campaign.replyTo || undefined,
      });
      res.json({ ok: true, message: `Test email sent to ${email}` });
      return;
    }

    if (campaign.status === "sent") { res.status(400).json({ error: "Campaign already sent" }); return; }

    const contacts = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.userId, userId));

    const filter = (campaign.recipientFilter as any) || {};
    let eligible = contacts.filter((c) => c.email && c.email.trim() !== "");
    if (filter.tag) eligible = eligible.filter((c) => c.tag === filter.tag);
    if (filter.dealStage) eligible = eligible.filter((c) => c.dealStage === filter.dealStage);

    if (eligible.length === 0) {
      res.status(400).json({ error: "No eligible recipients with email addresses" });
      return;
    }

    const unsubscribedPrefs = await db
      .select()
      .from(contactChannelPrefsTable)
      .where(and(eq(contactChannelPrefsTable.userId, userId), eq(contactChannelPrefsTable.emailOptIn, false)));
    const unsubscribedContactIds = new Set(unsubscribedPrefs.map((p) => p.contactId));
    eligible = eligible.filter((c) => !unsubscribedContactIds.has(c.id));

    await db
      .update(emailCampaignsTable)
      .set({ status: "sending", totalRecipients: eligible.length, updatedAt: new Date() })
      .where(eq(emailCampaignsTable.id, campaign.id));

    res.json({ ok: true, total: eligible.length, message: `Sending to ${eligible.length} recipients...` });

    (async () => {
      let sent = 0;
      let failed = 0;
      for (const contact of eligible) {
        try {
          const unsubUrl = `${process.env.APP_URL || ""}/api/campaigns/email/unsubscribe?email=${encodeURIComponent(contact.email)}&campaignId=${campaign.id}`;
          const html = campaign.htmlBody + `\n<p style="font-size:11px;color:#999;margin-top:24px;">Don't want these emails? <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a></p>`;
          const result = await client.emails.send({
            from: campaign.fromName ? `${campaign.fromName} <${fromEmail}>` : fromEmail,
            to: contact.email,
            subject: campaign.subject,
            html,
            text: campaign.textBody || undefined,
            replyTo: campaign.replyTo || undefined,
          });
          await db.insert(emailCampaignRecipientsTable).values({
            campaignId: campaign.id,
            contactId: contact.id,
            email: contact.email,
            name: contact.name,
            status: "sent",
            resendMessageId: (result as any)?.data?.id || null,
          });
          sent++;
        } catch (e: any) {
          console.error("[campaigns] email send error for", contact.email, e.message);
          await db.insert(emailCampaignRecipientsTable).values({
            campaignId: campaign.id,
            contactId: contact.id,
            email: contact.email,
            name: contact.name,
            status: "failed",
          });
          failed++;
        }
        await sleep(50);
      }
      await db
        .update(emailCampaignsTable)
        .set({ status: "sent", totalSent: sent, sentAt: new Date(), updatedAt: new Date() })
        .where(eq(emailCampaignsTable.id, campaign.id));

      try {
        await db.insert(notificationsTable).values({
          userId: campaign.userId,
          type: "campaign_complete",
          title: `Email campaign "${campaign.name}" sent`,
          body: `${sent} delivered, ${failed} failed out of ${sent + failed} total.`,
          link: `/phone/campaigns`,
        });
      } catch {}
    })();
  } catch (err: any) {
    console.error("[campaigns] email send error:", err.message);
    res.status(500).json({ error: err.message || "Failed to send campaign" });
  }
});

router.get("/campaigns/email/unsubscribe", async (req: Request, res: Response) => {
  const { email, campaignId } = req.query as { email?: string; campaignId?: string };
  if (!email) { res.status(400).send("Invalid unsubscribe link"); return; }
  try {
    await db
      .update(emailCampaignRecipientsTable)
      .set({ unsubscribedAt: new Date(), status: "unsubscribed" })
      .where(
        and(
          eq(emailCampaignRecipientsTable.email, email),
          campaignId ? eq(emailCampaignRecipientsTable.campaignId, Number(campaignId)) : sql`1=1`
        )
      );
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#09090b;color:#e4e4e7"><h2>Unsubscribed</h2><p style="color:#a1a1aa">You've been removed from this mailing list.</p></body></html>`);
  } catch (err: any) {
    console.error("[campaigns] unsubscribe error:", err.message);
    res.status(500).send("Error processing unsubscribe");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SMS CAMPAIGNS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/campaigns/sms", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const campaigns = await db
      .select()
      .from(smsCampaignsTable)
      .where(eq(smsCampaignsTable.userId, userId))
      .orderBy(desc(smsCampaignsTable.createdAt));
    res.json({ campaigns });
  } catch (err: any) {
    console.error("[campaigns] sms list error:", err.message);
    res.status(500).json({ error: "Failed to fetch SMS campaigns" });
  }
});

router.get("/campaigns/sms/:id", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const [campaign] = await db
      .select()
      .from(smsCampaignsTable)
      .where(and(eq(smsCampaignsTable.id, Number(req.params.id)), eq(smsCampaignsTable.userId, userId)));
    if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
    const recipients = await db
      .select()
      .from(smsCampaignRecipientsTable)
      .where(eq(smsCampaignRecipientsTable.campaignId, campaign.id))
      .limit(500);
    res.json({ campaign, recipients });
  } catch (err: any) {
    console.error("[campaigns] sms get error:", err.message);
    res.status(500).json({ error: "Failed to fetch SMS campaign" });
  }
});

router.post("/campaigns/sms", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { name, messageBody, scheduledAt, recipientFilter } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "Campaign name required" }); return; }
  try {
    const [campaign] = await db
      .insert(smsCampaignsTable)
      .values({
        userId,
        name: name.trim(),
        messageBody: messageBody || "",
        status: "draft",
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        recipientFilter: recipientFilter || {},
      })
      .returning();
    res.json({ campaign });
  } catch (err: any) {
    console.error("[campaigns] sms create error:", err.message);
    res.status(500).json({ error: "Failed to create SMS campaign" });
  }
});

router.put("/campaigns/sms/:id", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { name, messageBody, scheduledAt, recipientFilter, status } = req.body;
  try {
    const [existing] = await db
      .select()
      .from(smsCampaignsTable)
      .where(and(eq(smsCampaignsTable.id, Number(req.params.id)), eq(smsCampaignsTable.userId, userId)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.status === "sent") { res.status(400).json({ error: "Cannot edit a sent campaign" }); return; }

    const updates: Partial<typeof smsCampaignsTable.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (messageBody !== undefined) updates.messageBody = messageBody;
    if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    if (recipientFilter !== undefined) updates.recipientFilter = recipientFilter;
    if (status !== undefined && ["draft", "scheduled"].includes(status)) updates.status = status;

    const [campaign] = await db
      .update(smsCampaignsTable)
      .set(updates)
      .where(eq(smsCampaignsTable.id, existing.id))
      .returning();
    res.json({ campaign });
  } catch (err: any) {
    console.error("[campaigns] sms update error:", err.message);
    res.status(500).json({ error: "Failed to update SMS campaign" });
  }
});

router.delete("/campaigns/sms/:id", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    await db
      .delete(smsCampaignsTable)
      .where(and(eq(smsCampaignsTable.id, Number(req.params.id)), eq(smsCampaignsTable.userId, userId)));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[campaigns] sms delete error:", err.message);
    res.status(500).json({ error: "Failed to delete SMS campaign" });
  }
});

router.post("/campaigns/sms/:id/send", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { test, testPhone } = req.body;

  try {
    const [campaign] = await db
      .select()
      .from(smsCampaignsTable)
      .where(and(eq(smsCampaignsTable.id, Number(req.params.id)), eq(smsCampaignsTable.userId, userId)));
    if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
    if (!campaign.messageBody?.trim()) { res.status(400).json({ error: "Message body required" }); return; }

    const campaignCountry = await resolveUserCountry(userId);

    if (test) {
      if (!testPhone) { res.status(400).json({ error: "Test phone number required" }); return; }
      const e164 = toE164(testPhone, campaignCountry);
      if (!e164) { res.status(400).json({ error: "Invalid phone number" }); return; }
      await sendSmsMessage({
        userId,
        userEmail: req.user?.email,
        phone: e164,
        body: `[TEST] ${campaign.messageBody}`,
        defaultCountry: campaignCountry,
      });
      res.json({ ok: true, message: `Test SMS sent to ${e164}` });
      return;
    }

    if (campaign.status === "sent") { res.status(400).json({ error: "Campaign already sent" }); return; }

    const contacts = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.userId, userId));

    const filter = (campaign.recipientFilter as any) || {};
    let eligible = contacts.filter((c) => c.phone && c.phone.trim() !== "");
    if (filter.tag) eligible = eligible.filter((c) => c.tag === filter.tag);
    if (filter.dealStage) eligible = eligible.filter((c) => c.dealStage === filter.dealStage);

    const unsubscribedPrefs = await db
      .select()
      .from(contactChannelPrefsTable)
      .where(and(eq(contactChannelPrefsTable.userId, userId), eq(contactChannelPrefsTable.smsOptIn, false)));
    const unsubscribedContactIds = new Set(unsubscribedPrefs.map((p) => p.contactId));
    eligible = eligible.filter((c) => !unsubscribedContactIds.has(c.id));

    if (eligible.length === 0) {
      res.status(400).json({ error: "No eligible recipients with phone numbers" });
      return;
    }

    await db
      .update(smsCampaignsTable)
      .set({ status: "sending", totalRecipients: eligible.length, updatedAt: new Date() })
      .where(eq(smsCampaignsTable.id, campaign.id));

    res.json({ ok: true, total: eligible.length, message: `Sending to ${eligible.length} recipients...` });

    (async () => {
      const { consumeUsage: _consumeUsage_cs } = await import("../lib/usage-meter");
      let sent = 0;
      let failed = 0;
      for (const contact of eligible) {
        const e164 = toE164(contact.phone, campaignCountry);
        if (!e164) { failed++; continue; }
        const _gateSms = await _consumeUsage_cs(req.user?.id ?? "", req.user?.email, "sms_count", 1);
        if (!_gateSms.allowed) { failed++; continue; }
        try {
          const sentSms = await sendSmsMessage({
            userId: campaign.userId,
            userEmail: req.user?.email,
            phone: e164,
            body: campaign.messageBody,
            contactId: contact.id,
            contactName: contact.name,
            defaultCountry: campaignCountry,
          });
          await db.insert(smsCampaignRecipientsTable).values({
            campaignId: campaign.id,
            contactId: contact.id,
            phone: e164,
            name: contact.name,
            status: "sent",
            twilioMessageSid: sentSms.message.twilioMessageSid,
          });
          sent++;
        } catch (e: any) {
          console.error("[campaigns] sms send error for", contact.phone, e.message);
          await db.insert(smsCampaignRecipientsTable).values({
            campaignId: campaign.id,
            contactId: contact.id,
            phone: e164,
            name: contact.name,
            status: "failed",
          });
          failed++;
        }
        await sleep(100);
      }
      await db
        .update(smsCampaignsTable)
        .set({ status: "sent", totalSent: sent, sentAt: new Date(), updatedAt: new Date() })
        .where(eq(smsCampaignsTable.id, campaign.id));

      try {
        await db.insert(notificationsTable).values({
          userId: campaign.userId,
          type: "campaign_complete",
          title: `SMS campaign "${campaign.name}" sent`,
          body: `${sent} delivered, ${failed} failed out of ${sent + failed} total.`,
          link: `/phone/campaigns`,
        });
      } catch {}
    })();
  } catch (err: any) {
    console.error("[campaigns] sms send error:", err.message);
    res.status(500).json({ error: err.message || "Failed to send SMS campaign" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DIRECT SMS CONVERSATIONS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/sms/conversations", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const conversations = await db
      .select()
      .from(smsConversationsTable)
      .where(eq(smsConversationsTable.userId, userId))
      .orderBy(desc(smsConversationsTable.lastMessageAt));
    res.json({ conversations });
  } catch (err: any) {
    console.error("[sms] conversations error:", err.message);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

router.get("/sms/conversations/:id/messages", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const [conv] = await db
      .select()
      .from(smsConversationsTable)
      .where(and(eq(smsConversationsTable.id, Number(req.params.id)), eq(smsConversationsTable.userId, userId)));
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }

    const messages = await db
      .select()
      .from(smsMessagesTable)
      .where(eq(smsMessagesTable.conversationId, conv.id))
      .orderBy(smsMessagesTable.createdAt)
      .limit(200);

    await db
      .update(smsConversationsTable)
      .set({ unreadCount: 0 })
      .where(eq(smsConversationsTable.id, conv.id));

    await db
      .update(smsMessagesTable)
      .set({ isRead: true })
      .where(and(eq(smsMessagesTable.conversationId, conv.id), eq(smsMessagesTable.isRead, false)));

    res.json({ conversation: conv, messages });
  } catch (err: any) {
    console.error("[sms] messages error:", err.message);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.post("/sms/send", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { phone, body, contactId, contactName } = req.body;
  if (!phone || !body?.trim()) { res.status(400).json({ error: "Phone and message body required" }); return; }

  const e164 = toE164(phone, await resolveUserCountry(userId));
  if (!e164) { res.status(400).json({ error: "Invalid phone number" }); return; }

  const { checkAndEnforce, recordUsage, throttleResponse } = await import("../lib/usage-meter");
  const gate = await checkAndEnforce(userId, req.user?.email, "sms_count", 1);
  if (!gate.allowed) {
    res.status(429).json(throttleResponse("sms_count", gate.used, gate.limit));
    return;
  }

  try {
    // Outbound SMS lives in the shared telephony service so the manual route and
    // the CRM autopilot send + record identically (same CRM dedupe/side-effects).
    const { message, conversation } = await sendSmsMessage({ userId, userEmail: req.user?.email, phone: e164, body, contactId, contactName });
    await recordUsage(userId, "sms_count", 1);
    res.json({ ok: true, message, conversation });
  } catch (err: any) {
    console.error("[sms] send error:", err.message);
    if (err.message?.includes("not configured")) {
      res.status(503).json({ error: "SMS not configured. Contact admin." });
    } else {
      res.status(500).json({ error: err.message || "Failed to send SMS" });
    }
  }
});

router.post("/sms/webhook/inbound", async (req: Request, res: Response) => {
  try {
    const { From, To, Body, MessageSid } = req.body;
    if (!From || !Body) { res.status(400).send("Missing From or Body"); return; }

    const fromPhone = From;
    const toPhone = To;

    const contacts = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.phone, fromPhone))
      .limit(1);

    const contact = contacts[0];

    const [conv] = await db
      .select()
      .from(smsConversationsTable)
      .where(eq(smsConversationsTable.contactPhone, fromPhone))
      .limit(1);

    let conversation = conv;
    if (!conversation) {
      [conversation] = await db
        .insert(smsConversationsTable)
        .values({
          userId: contact?.userId || "unknown",
          contactId: contact?.id || null,
          contactPhone: fromPhone,
          contactName: contact?.name || fromPhone,
          lastMessageAt: new Date(),
          unreadCount: 1,
        })
        .returning();
    } else {
      await db
        .update(smsConversationsTable)
        .set({
          lastMessageAt: new Date(),
          unreadCount: sql`${smsConversationsTable.unreadCount} + 1`,
        })
        .where(eq(smsConversationsTable.id, conversation.id));
    }

    await db.insert(smsMessagesTable).values({
      conversationId: conversation.id,
      userId: conversation.userId,
      direction: "inbound",
      body: Body,
      fromPhone,
      toPhone,
      twilioMessageSid: MessageSid || null,
      status: "received",
      isRead: false,
    });

    await recordTelephonyActivity({
      userId: conversation.userId,
      channel: "sms",
      direction: "inbound",
      phone: fromPhone,
      contactName: contact?.name || undefined,
      contactId: contact?.id || undefined,
      body: Body,
      twilioSid: MessageSid || undefined,
    }).catch(() => {});

    res.set("Content-Type", "text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  } catch (err: any) {
    console.error("[sms] inbound webhook error:", err.message);
    res.status(500).send("Error");
  }
});

router.post("/sms/webhook/status", async (req: Request, res: Response) => {
  try {
    const { MessageSid, MessageStatus } = req.body;
    if (!MessageSid) { res.status(400).send("Missing MessageSid"); return; }

    await db
      .update(smsMessagesTable)
      .set({ status: MessageStatus || "unknown" })
      .where(eq(smsMessagesTable.twilioMessageSid, MessageSid));

    if (MessageStatus === "delivered") {
      await db
        .update(smsCampaignRecipientsTable)
        .set({ status: "delivered", deliveredAt: new Date() })
        .where(eq(smsCampaignRecipientsTable.twilioMessageSid, MessageSid));
    } else if (MessageStatus === "failed" || MessageStatus === "undelivered") {
      await db
        .update(smsCampaignRecipientsTable)
        .set({ status: "failed", failedAt: new Date() })
        .where(eq(smsCampaignRecipientsTable.twilioMessageSid, MessageSid));
    }

    res.sendStatus(204);
  } catch (err: any) {
    console.error("[sms] status webhook error:", err.message);
    res.status(500).send("Error");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT CHANNEL PREFERENCES (Opt-in / Opt-out)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/campaigns/contact-prefs/:contactId", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const [pref] = await db
      .select()
      .from(contactChannelPrefsTable)
      .where(and(eq(contactChannelPrefsTable.contactId, Number(req.params.contactId)), eq(contactChannelPrefsTable.userId, userId)));
    res.json({ pref: pref || null });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

router.put("/campaigns/contact-prefs/:contactId", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { emailOptIn, smsOptIn, tags } = req.body;
  const contactId = Number(req.params.contactId);
  try {
    const [existing] = await db
      .select()
      .from(contactChannelPrefsTable)
      .where(and(eq(contactChannelPrefsTable.contactId, contactId), eq(contactChannelPrefsTable.userId, userId)));

    const now = new Date();
    if (existing) {
      const updates: Partial<typeof contactChannelPrefsTable.$inferInsert> = { updatedAt: now };
      if (emailOptIn !== undefined) {
        updates.emailOptIn = emailOptIn;
        if (!emailOptIn && existing.emailOptIn) updates.emailOptedOutAt = now;
      }
      if (smsOptIn !== undefined) {
        updates.smsOptIn = smsOptIn;
        if (!smsOptIn && existing.smsOptIn) updates.smsOptedOutAt = now;
      }
      if (tags !== undefined) updates.tags = tags;
      const [pref] = await db
        .update(contactChannelPrefsTable)
        .set(updates)
        .where(eq(contactChannelPrefsTable.id, existing.id))
        .returning();
      res.json({ pref });
    } else {
      const [pref] = await db
        .insert(contactChannelPrefsTable)
        .values({
          contactId,
          userId,
          emailOptIn: emailOptIn ?? true,
          smsOptIn: smsOptIn ?? true,
          tags: tags || [],
        })
        .returning();
      res.json({ pref });
    }
  } catch (err: any) {
    console.error("[campaigns] contact prefs error:", err.message);
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI GENERATE SMS/EMAIL COPY
// ─────────────────────────────────────────────────────────────────────────────

router.post("/campaigns/generate-sms", async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { goal, tone = "professional", context = "" } = req.body;
  if (!goal?.trim()) { res.status(400).json({ error: "Campaign goal required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: getOpenAiTextModel(),
      max_completion_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You are a direct-response SMS marketing expert. Write concise, compelling SMS messages. Always stay under 160 characters for single-segment. Tone: ${tone}.`,
        },
        {
          role: "user",
          content: `Write 3 SMS campaign message variations for this goal: ${goal}${context ? `\nContext: ${context}` : ""}\n\nLabel each Variation A, B, C. Show character count per message.`,
        },
      ],
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error("[campaigns] generate-sms error:", err);
    res.write(`data: ${JSON.stringify({ error: "Failed to generate SMS copy" })}\n\n`);
  }
  res.end();
});

export default router;
