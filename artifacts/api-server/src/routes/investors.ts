import { Router, type Request, type Response } from "express";
import { db, investorLeadsTable } from "@workspace/db";
import { getUncachableResendClient } from "../lib/resend";

const router = Router();

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

router.post("/investors", async (req: Request, res: Response) => {
  try {
    const { name, email, company, investmentRange, message } = req.body;

    if (!name || !email || !message) {
      res.status(400).json({ error: "Name, email, and message are required." });
      return;
    }

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof message !== "string"
    ) {
      res.status(400).json({ error: "Invalid field types." });
      return;
    }

    if (name.length > 200 || email.length > 320) {
      res.status(400).json({ error: "One or more fields exceed maximum length." });
      return;
    }

    if (message.length > 5000) {
      res.status(400).json({ error: "Message is too long (max 5000 characters)." });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: "Invalid email address." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    const normalizedCompany = typeof company === "string" ? company.trim() : undefined;
    const normalizedRange = typeof investmentRange === "string" ? investmentRange.trim() : undefined;

    await db.insert(investorLeadsTable).values({
      name: normalizedName,
      email: normalizedEmail,
      company: normalizedCompany || null,
      investmentRange: normalizedRange || null,
      message: message.trim(),
    });

    const safeName = escapeHtml(normalizedName);
    const safeEmail = escapeHtml(normalizedEmail);
    const safeCompany = escapeHtml(normalizedCompany || "—");
    const safeRange = escapeHtml(normalizedRange || "—");
    const safeMessage = escapeHtml(message.trim());

    const { client, fromEmail } = await getUncachableResendClient();

    await Promise.allSettled([
      client.emails.send({
        from: fromEmail,
        to: ["support@picassoo.ai"],
        replyTo: normalizedEmail,
        subject: `[SALARYMAN Investor Lead] ${safeName}`,
        html: `
<div style="font-family:monospace;background:#030803;color:#00ff41;padding:24px;max-width:600px;border:1px solid rgba(0,255,65,0.2);border-radius:8px;">
  <h2 style="color:#00ff41;letter-spacing:0.1em;margin-bottom:4px;">[ INVESTOR LEAD ]</h2>
  <p style="color:rgba(0,255,65,0.5);font-size:0.75em;margin-top:0;">PICASSO AI LLC · SALARYMAN Alpha</p>
  <hr style="border-color:rgba(0,255,65,0.15);margin:16px 0;" />
  <p><strong style="color:#00ff41;">Name:</strong> ${safeName}</p>
  <p><strong style="color:#00ff41;">Email:</strong> ${safeEmail}</p>
  <p><strong style="color:#00ff41;">Company / Fund:</strong> ${safeCompany}</p>
  <p><strong style="color:#00ff41;">Investment Range:</strong> ${safeRange}</p>
  <hr style="border-color:rgba(0,255,65,0.15);margin:16px 0;" />
  <p><strong style="color:#00ff41;">Message:</strong></p>
  <div style="background:rgba(0,255,65,0.05);border:1px solid rgba(0,255,65,0.1);border-radius:4px;padding:12px;white-space:pre-wrap;color:rgba(0,255,65,0.85);font-size:0.9em;">${safeMessage}</div>
  <hr style="border-color:rgba(0,255,65,0.15);margin:16px 0;" />
  <p style="color:rgba(0,255,65,0.3);font-size:0.75em;">Submitted via SALARYMAN Investor Portal · ${new Date().toUTCString()}</p>
</div>
        `.trim(),
      }),

      client.emails.send({
        from: fromEmail,
        to: normalizedEmail,
        subject: "We received your investor inquiry — Salaryman",
        html: `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#09090b;color:#e4e4e7;max-width:480px;margin:0 auto;padding:40px 32px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
  <p style="font-size:11px;font-family:monospace;letter-spacing:0.2em;color:#52525b;text-transform:uppercase;margin:0 0 20px;">PICASSO AI LLC · SALARYMAN</p>
  <h1 style="font-size:20px;font-weight:700;color:#f4f4f5;margin:0 0 12px;">We got your message.</h1>
  <p style="font-size:14px;color:#a1a1aa;line-height:1.7;margin:0 0 20px;">
    Hi ${safeName}, thank you for your interest in SALARYMAN. We read every investor inquiry personally and will be in touch if there's a fit.
  </p>
  <p style="font-size:14px;color:#a1a1aa;line-height:1.7;margin:0 0 20px;">
    SALARYMAN is currently in <strong style="color:#e4e4e7;">Alpha</strong> — a live product with real users, actively shaping toward GA. We appreciate early-stage interest and will respond thoughtfully.
  </p>
  <div style="border:1px solid rgba(34,197,94,0.2);border-radius:6px;padding:16px;background:rgba(34,197,94,0.05);margin:0 0 24px;">
    <p style="font-size:12px;font-family:monospace;color:#4ade80;margin:0;letter-spacing:0.05em;">WHAT HAPPENS NEXT</p>
    <p style="font-size:13px;color:#a1a1aa;margin:8px 0 0;line-height:1.6;">Our team will review your inquiry and reach out within a few business days if we see a mutual fit. No pressure, no automated follow-ups.</p>
  </div>
  <p style="font-size:13px;color:#71717a;margin:0;">
    — The SALARYMAN Team · PICASSO AI LLC
  </p>
</div>
        `.trim(),
      }),
    ]);

    res.json({ ok: true, message: "Thank you for your interest. We will be in touch." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Investors] form error:", msg);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;
