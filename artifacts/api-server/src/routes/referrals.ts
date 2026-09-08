import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import {
  db,
  referralInvitesTable,
  bankAccountsTable,
  bankTransactionsTable,
  notificationsTable,
  usersTable,
  type ReferralInvite,
} from "@workspace/db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { getUncachableResendClient } from "../lib/resend";
import { screenEmail } from "../lib/email-security";
import twilio from "twilio";

const router = Router();

// One-time rewards (denominated in ƒ). Sensible defaults; tune later.
export const REFERRAL_INVITER_REWARD_FIAT = 5_000;
export const REFERRAL_WELCOME_REWARD_FIAT = 5_000;

// Token-link acceptance only rewards genuinely new players — accounts created
// within this window. Generous enough that a freshly-signed-up invitee always
// qualifies, tight enough that established accounts can't farm rewards.
export const REFERRAL_NEW_USER_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// Lightweight per-user send rate limit to deter spam: max N invites / window.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const sendBuckets = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const hits = (sendBuckets.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    sendBuckets.set(userId, hits);
    return true;
  }
  hits.push(now);
  sendBuckets.set(userId, hits);
  return false;
}

function requireAuth(req: Request, res: Response): req is Request & { user: Express.User } {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

function appBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "";
}

function toE164(raw: string): string | null {
  const cleaned = raw.replace(/[^+\d]/g, "");
  if (!/^\+?\d{7,15}$/.test(cleaned)) return null;
  return cleaned.startsWith("+") ? cleaned : `+1${cleaned}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function inviterDisplayName(user: { firstName?: string | null; email?: string | null }): string {
  return (user.firstName?.trim() || user.email?.split("@")[0] || "A friend").slice(0, 60);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Credit a player's checking account inside an existing transaction. Seeds the
// standard accounts if the user has never opened the bank, so an offline /
// never-banked recipient still receives the reward (visible on their next load).
async function grantReferralFiatTx(tx: Tx, userId: string, amount: number, memo: string): Promise<void> {
  let accounts = await tx
    .select()
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.userId, userId));
  if (accounts.length === 0) {
    accounts = await tx
      .insert(bankAccountsTable)
      .values([
        { userId, kind: "checking", label: "STANDARD CHECKING", balance: 12_400, apyBps: 0 },
        { userId, kind: "savings", label: "HIGH-YIELD SAVINGS", balance: 48_000, apyBps: 425 },
        { userId, kind: "vault", label: "GOLD VAULT", balance: 80_000, apyBps: 0 },
      ])
      .returning();
  }
  const checking = accounts.find((a) => a.kind === "checking") ?? accounts[0];
  const newBal = checking.balance + amount;
  await tx
    .update(bankAccountsTable)
    .set({ balance: newBal, updatedAt: new Date() })
    .where(eq(bankAccountsTable.id, checking.id));
  await tx.insert(bankTransactionsTable).values({
    userId,
    accountId: checking.id,
    kind: "deposit",
    description: memo.slice(0, 200),
    amount,
    balanceAfter: newBal,
  });
}

type ConvertResult = "converted" | "already" | "taken";

// Atomically convert an invite: claim the row (SELECT ... FOR UPDATE), pay out
// both one-time rewards, and mark it accepted — all inside one transaction so a
// retry or two concurrent accepts can NEVER double-pay. The DB-level unique
// index on invitedUserId is the backstop for one-attribution-per-person; a
// unique-violation from a concurrent conversion of a different invite for the
// same user surfaces as "taken".
//   - "converted": this call performed the conversion + payout.
//   - "already":   the same user already converted this exact invite (idempotent).
//   - "taken":     invite already used by someone else, or invitee already attributed.
async function convertInvite(inviteId: number, invitedUserId: string): Promise<ConvertResult> {
  try {
    return await db.transaction(async (tx): Promise<ConvertResult> => {
      const [row] = await tx
        .select()
        .from(referralInvitesTable)
        .where(eq(referralInvitesTable.id, inviteId))
        .for("update")
        .limit(1);
      if (!row) return "taken";
      if (row.status === "accepted") {
        return row.invitedUserId === invitedUserId ? "already" : "taken";
      }
      if (row.inviterUserId === invitedUserId) return "taken"; // self-referral

      // One attribution per person — checked inside the tx; the unique index
      // enforces it under races even if this read misses a concurrent insert.
      const [attr] = await tx
        .select({ id: referralInvitesTable.id })
        .from(referralInvitesTable)
        .where(eq(referralInvitesTable.invitedUserId, invitedUserId))
        .limit(1);
      if (attr) return "taken";

      await grantReferralFiatTx(
        tx,
        row.inviterUserId,
        REFERRAL_INVITER_REWARD_FIAT,
        "REFERRAL REWARD — a friend you invited joined SALARYMAN",
      );
      await tx.insert(notificationsTable).values({
        userId: row.inviterUserId,
        type: "referral_reward",
        title: "Referral reward earned",
        body: `Someone you invited joined SALARYMAN. ƒ${REFERRAL_INVITER_REWARD_FIAT.toLocaleString()} has been deposited to your checking account.`,
        link: "/profile",
      });
      await grantReferralFiatTx(
        tx,
        invitedUserId,
        REFERRAL_WELCOME_REWARD_FIAT,
        "WELCOME BONUS — referred to SALARYMAN",
      );
      await tx.insert(notificationsTable).values({
        userId: invitedUserId,
        type: "referral_welcome",
        title: "Welcome bonus",
        body: `You joined via a friend's invite. ƒ${REFERRAL_WELCOME_REWARD_FIAT.toLocaleString()} welcome bonus has been deposited to your checking account.`,
        link: "/profile",
      });

      // Conditional update: only flips a row still in "sent" — the FOR UPDATE
      // lock guarantees we're the sole writer, and this also sets invitedUserId
      // which trips the unique index if attribution raced.
      await tx
        .update(referralInvitesTable)
        .set({
          status: "accepted",
          invitedUserId,
          inviterRewardGranted: true,
          inviteeRewardGranted: true,
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(referralInvitesTable.id, inviteId), eq(referralInvitesTable.status, "sent")));
      return "converted";
    });
  } catch (err: any) {
    // Unique-violation on invitedUserId = the invitee was attributed by a
    // concurrent conversion. Treat as "taken" rather than a 500.
    if (err?.code === "23505") return "taken";
    throw err;
  }
}

// True if this user has already been attributed as anyone's referral. A person
// can only ever be counted as one inviter's referral (anti-abuse).
async function alreadyAttributed(invitedUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: referralInvitesTable.id })
    .from(referralInvitesTable)
    .where(eq(referralInvitesTable.invitedUserId, invitedUserId))
    .limit(1);
  return !!row;
}

// Called from the auth JIT sign-in flow. When a BRAND-NEW user signs in whose
// email matches a pending email invite, attribute + reward it. Only fires for
// new accounts so we never silently reward a long-standing player just because
// someone emailed their address. Token-link acceptance (POST /referrals/accept)
// is the primary path and also covers SMS invites.
export async function reconcileReferralInvites(
  user: { id: string; email: string | null },
  opts: { isNew: boolean },
): Promise<void> {
  if (!opts.isNew || !user.email) return;
  const email = user.email.toLowerCase();
  try {
    if (await alreadyAttributed(user.id)) return;
    const [invite] = await db
      .select()
      .from(referralInvitesTable)
      .where(
        and(
          eq(referralInvitesTable.channel, "email"),
          eq(referralInvitesTable.targetEmail, email),
          eq(referralInvitesTable.status, "sent"),
        ),
      )
      .orderBy(referralInvitesTable.createdAt)
      .limit(1);
    if (!invite) return;
    if (invite.inviterUserId === user.id) return; // can't refer yourself
    const result = await convertInvite(invite.id, user.id);
    console.log(`[Referrals] Reconciled email invite ${invite.id} → ${user.id}: ${result}`);
  } catch (err) {
    console.error("[Referrals] reconcile failed:", err);
  }
}

// POST /api/referrals/send — send an email or SMS invite to a friend.
router.post("/referrals/send", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const { channel, recipient, note } = (req.body ?? {}) as {
    channel?: string;
    recipient?: string;
    note?: string;
  };

  const ch = channel === "sms" ? "sms" : channel === "email" ? "email" : null;
  if (!ch) {
    res.status(400).json({ error: "channel must be 'email' or 'sms'" });
    return;
  }
  const raw = String(recipient ?? "").trim();
  if (!raw) {
    res.status(400).json({ error: "recipient required" });
    return;
  }
  const cleanNote = note ? String(note).slice(0, 500).trim() : null;

  if (rateLimited(userId)) {
    res.status(429).json({ error: "Too many invites sent. Try again later." });
    return;
  }

  let targetEmail: string | null = null;
  let targetPhone: string | null = null;
  if (ch === "email") {
    const email = raw.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: "Enter a valid email address" });
      return;
    }
    const screen = await screenEmail(email);
    if (!screen.allowed) {
      res.status(400).json({ error: "That email address can't be invited" });
      return;
    }
    targetEmail = email;
  } else {
    const e164 = toE164(raw);
    if (!e164) {
      res.status(400).json({ error: "Enter a valid phone number" });
      return;
    }
    targetPhone = e164;
  }

  // Dedupe: don't re-send (or re-create) an invite to an address this user has
  // already invited — re-inviting a converted address grants nothing extra.
  const targetCol = ch === "email" ? referralInvitesTable.targetEmail : referralInvitesTable.targetPhone;
  const targetVal = ch === "email" ? targetEmail! : targetPhone!;
  const [existing] = await db
    .select()
    .from(referralInvitesTable)
    .where(and(eq(referralInvitesTable.inviterUserId, userId), eq(targetCol, targetVal)))
    .limit(1);
  if (existing) {
    if (existing.status === "accepted") {
      res.status(409).json({ error: "That contact already joined from your invite." });
      return;
    }
    res.status(409).json({ error: "You've already invited that contact.", invite: existing });
    return;
  }

  const token = randomBytes(32).toString("hex");
  let invite;
  try {
    [invite] = await db
      .insert(referralInvitesTable)
      .values({
        inviterUserId: userId,
        channel: ch,
        targetEmail,
        targetPhone,
        token,
        note: cleanNote,
        status: "sent",
      })
      .returning();
  } catch (err: any) {
    // Concurrent send to the same address tripped the (inviter,address) unique
    // index — treat as a dedupe hit rather than a 500.
    if (err?.code === "23505") {
      res.status(409).json({ error: "You've already invited that contact." });
      return;
    }
    throw err;
  }

  const base = appBaseUrl();
  const inviteUrl = `${base}/?ref=${token}`;
  const inviterName = inviterDisplayName(req.user);
  const personal = cleanNote ? `\n\n"${cleanNote}"\n` : "";

  try {
    if (ch === "email") {
      const { client, fromEmail } = await getUncachableResendClient();
      const html = `
        <div style="font-family:system-ui,sans-serif;background:#09090b;color:#e4e4e7;padding:32px;border-radius:12px;max-width:520px;margin:auto">
          <h1 style="color:#fff;font-size:22px;margin:0 0 8px">${inviterName} invited you to SALARYMAN</h1>
          <p style="color:#a1a1aa;line-height:1.5">Join the city, build your empire, and play free. Your friend gets a reward too — and so do you when you sign in.</p>
          ${cleanNote ? `<blockquote style="border-left:3px solid #6366f1;margin:16px 0;padding:8px 16px;color:#d4d4d8;font-style:italic">${cleanNote.replace(/</g, "&lt;")}</blockquote>` : ""}
          <a href="${inviteUrl}" style="display:inline-block;margin-top:16px;background:#6366f1;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600">Play SALARYMAN free →</a>
          <p style="color:#52525b;font-size:12px;margin-top:24px">Or paste this link: ${inviteUrl}</p>
        </div>`;
      await client.emails.send({
        from: inviterName ? `${inviterName} via SALARYMAN <${fromEmail.replace(/^.*<|>.*$/g, "")}>` : fromEmail,
        to: targetEmail!,
        subject: `${inviterName} invited you to play SALARYMAN`,
        html,
        text: `${inviterName} invited you to play SALARYMAN — join free and you both earn a reward.${personal}\n${inviteUrl}`,
      });
    } else {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;
      if (!accountSid || !authToken || !fromNumber) {
        throw new Error("SMS sending is not configured");
      }
      const sms = twilio(accountSid, authToken);
      await sms.messages.create({
        from: fromNumber,
        to: targetPhone!,
        body: `${inviterName} invited you to play SALARYMAN free — you both earn a reward when you join.${personal}\n${inviteUrl}`,
      });
    }
  } catch (err: any) {
    console.error("[Referrals] send failed:", err?.message ?? err);
    // Roll back the invite record so the user can retry cleanly.
    await db.delete(referralInvitesTable).where(eq(referralInvitesTable.id, invite.id));
    const msg = ch === "sms" && /not configured/i.test(err?.message ?? "")
      ? "Text invites aren't available right now. Try email instead."
      : "Couldn't send the invite. Please try again.";
    res.status(502).json({ error: msg });
    return;
  }

  res.json({ ok: true, invite, inviteUrl });
});

// GET /api/referrals/mine — the caller's sent invites + reward summary.
router.get("/referrals/mine", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const invites = await db
    .select()
    .from(referralInvitesTable)
    .where(eq(referralInvitesTable.inviterUserId, userId))
    .orderBy(desc(referralInvitesTable.createdAt))
    .limit(200);

  const accepted = invites.filter((i) => i.status === "accepted");
  const rewardsEarned = accepted.filter((i) => i.inviterRewardGranted).length;
  res.json({
    invites: invites.map((i) => ({
      id: i.id,
      channel: i.channel,
      recipient: i.targetEmail ?? i.targetPhone,
      status: i.status,
      note: i.note,
      createdAt: i.createdAt,
      acceptedAt: i.acceptedAt,
    })),
    counts: {
      sent: invites.length,
      accepted: accepted.length,
      rewardsEarned,
      fiatEarned: rewardsEarned * REFERRAL_INVITER_REWARD_FIAT,
    },
    rewardPerReferral: REFERRAL_INVITER_REWARD_FIAT,
    welcomeReward: REFERRAL_WELCOME_REWARD_FIAT,
  });
});

// POST /api/referrals/accept — accept an invite via its token (the link path,
// also the only way SMS invites are attributed). Idempotent and abuse-guarded.
router.post("/referrals/accept", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const { token } = (req.body ?? {}) as { token?: string };
  if (!token) {
    res.status(400).json({ error: "token required" });
    return;
  }

  const [invite] = await db
    .select()
    .from(referralInvitesTable)
    .where(eq(referralInvitesTable.token, String(token)))
    .limit(1);
  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  if (invite.inviterUserId === userId) {
    res.status(400).json({ error: "You can't accept your own invite." });
    return;
  }

  // Already converted by this same user → idempotent success.
  if (invite.status === "accepted") {
    if (invite.invitedUserId === userId) {
      res.json({ ok: true, alreadyAccepted: true });
    } else {
      res.status(409).json({ error: "This invite has already been used." });
    }
    return;
  }

  // A person can only be attributed once, ever.
  if (await alreadyAttributed(userId)) {
    res.status(409).json({ error: "You've already been credited as a referral." });
    return;
  }

  // The welcome reward is for NEW players only. Reject long-standing accounts so
  // an established player can't farm rewards by clicking invite links. We treat
  // "new" as an account created within REFERRAL_NEW_USER_WINDOW_MS — the link is
  // normally clicked seconds-to-hours after the JIT account is created.
  const [acct] = await db
    .select({ createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const accountAgeMs = acct?.createdAt ? Date.now() - new Date(acct.createdAt).getTime() : Infinity;
  if (accountAgeMs > REFERRAL_NEW_USER_WINDOW_MS) {
    res.status(403).json({ error: "Referral rewards are only available to new players." });
    return;
  }

  let result: ConvertResult;
  try {
    result = await convertInvite(invite.id, userId);
  } catch (err) {
    console.error("[Referrals] accept failed:", err);
    res.status(500).json({ error: "Couldn't accept invite. Try again." });
    return;
  }
  if (result === "taken") {
    res.status(409).json({ error: "This invite has already been used." });
    return;
  }
  if (result === "already") {
    res.json({ ok: true, alreadyAccepted: true });
    return;
  }
  res.json({ ok: true, reward: REFERRAL_WELCOME_REWARD_FIAT });
});

export default router;
