import { Router, type IRouter } from "express";
import { db, subscribersTable } from "@workspace/db";
import { getUncachableResendClient } from "../lib/resend";

const router: IRouter = Router();

router.post("/subscribers", async (req, res) => {
  const { email, source } = req.body as { email?: string; source?: string };

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  try {
    await db.insert(subscribersTable).values({
      email: normalized,
      source: source ?? "cover",
    });
  } catch (err) {
    const pgCode = (err as { code?: string })?.code;
    if (pgCode === "23505") {
      res.json({ ok: true, alreadySubscribed: true, message: "You're already on the list!" });
      return;
    }
    console.error("subscribers insert error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
    return;
  }

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    await client.emails.send({
      from: fromEmail,
      to: normalized,
      subject: "You're in — Salaryman",
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background: #09090b; color: #e4e4e7; max-width: 480px; margin: 0 auto; padding: 40px 32px; border-radius: 8px;">
          <h1 style="font-size: 20px; font-weight: 700; color: #f4f4f5; margin: 0 0 8px;">Welcome to Salaryman.</h1>
          <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6; margin: 0 0 24px;">
            You're on the list. We'll reach out when there's something worth your attention — new features, early access, or important updates.
          </p>
          <p style="font-size: 13px; color: #71717a; margin: 0;">
            — The Salaryman Team
          </p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.warn("subscribers: welcome email failed for", normalized, emailErr);
  }

  res.json({ ok: true, alreadySubscribed: false, message: "You're on the list!" });
});

export default router;
