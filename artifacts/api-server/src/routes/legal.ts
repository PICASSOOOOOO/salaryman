import { Router, type Request, type Response } from "express";
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

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count += 1;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 10 * 60 * 1000);

router.post("/legal/contact", async (req: Request, res: Response) => {
  try {
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: "Too many requests. Please wait before submitting again." });
      return;
    }

    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      res.status(400).json({ error: "All fields are required: name, email, subject, message" });
      return;
    }

    if (typeof name !== "string" || typeof email !== "string" || typeof subject !== "string" || typeof message !== "string") {
      res.status(400).json({ error: "Invalid field types" });
      return;
    }

    if (name.length > 200 || email.length > 320 || subject.length > 200) {
      res.status(400).json({ error: "One or more fields exceed maximum length" });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: "Invalid email address" });
      return;
    }

    if (message.length > 5000) {
      res.status(400).json({ error: "Message is too long (max 5000 characters)" });
      return;
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message);

    const { client, fromEmail } = await getUncachableResendClient();

    await client.emails.send({
      from: fromEmail,
      to: ["support@picassoo.ai"],
      replyTo: email,
      subject: `[SALARYMAN Support] ${safeSubject}`,
      html: `
<div style="font-family:monospace;background:#030803;color:#00ff41;padding:24px;max-width:600px;border:1px solid rgba(0,255,65,0.2);border-radius:8px;">
  <h2 style="color:#00ff41;letter-spacing:0.1em;margin-bottom:4px;">[ SUPPORT REQUEST ]</h2>
  <p style="color:rgba(0,255,65,0.5);font-size:0.75em;margin-top:0;">PICASSO AI LLC · SALARYMAN Platform</p>
  <hr style="border-color:rgba(0,255,65,0.15);margin:16px 0;" />
  <p><strong style="color:#00ff41;">From:</strong> ${safeName}</p>
  <p><strong style="color:#00ff41;">Email:</strong> ${safeEmail}</p>
  <p><strong style="color:#00ff41;">Subject:</strong> ${safeSubject}</p>
  <hr style="border-color:rgba(0,255,65,0.15);margin:16px 0;" />
  <p><strong style="color:#00ff41;">Message:</strong></p>
  <div style="background:rgba(0,255,65,0.05);border:1px solid rgba(0,255,65,0.1);border-radius:4px;padding:12px;white-space:pre-wrap;color:rgba(0,255,65,0.85);font-size:0.9em;">${safeMessage}</div>
  <hr style="border-color:rgba(0,255,65,0.15);margin:16px 0;" />
  <p style="color:rgba(0,255,65,0.3);font-size:0.75em;">Sent from SALARYMAN Legal &amp; Support Contact Form · ${new Date().toUTCString()}</p>
</div>
      `.trim(),
    });

    res.json({ ok: true, message: "Support request submitted successfully. Our team will respond within 1–2 business days." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Legal] contact form error:", msg);
    if (msg.includes("not connected") || msg.includes("Resend")) {
      res.status(503).json({ error: "Email service temporarily unavailable. Please try again later." });
    } else {
      res.status(500).json({ error: "Failed to send message. Please try again." });
    }
  }
});

export default router;
