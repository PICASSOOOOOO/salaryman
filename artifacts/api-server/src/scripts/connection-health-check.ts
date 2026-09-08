/**
 * Platform-wide connection health check (external / on-demand layer).
 *
 * Two-layer health model:
 *   - This script is the EXTERNAL probe: run as a Replit Scheduled Deployment on
 *     a cron, it hits the live server from outside, so it also catches a fully
 *     down server (which the in-process monitor cannot report on). It is the
 *     counterpart to the always-on in-process monitor in
 *     lib/connection-health-monitor.ts, which re-probes every few minutes and
 *     emails on confirmed transitions while the server is up.
 *
 * Probes every platform connection (internal Replit-managed OpenAI/Anthropic, OpenClaw,
 * Twilio, Resend, ElevenLabs, Stripe, Nano Banana, Replicate, Object Storage,
 * MusicBrainz) PLUS the internal API: a liveness probe (/api/healthz → 200) and
 * a structure probe (an auth-enforced route → 401, proving routers are mounted
 * and auth is enforced). Emails the owner a report via Resend when degraded.
 *
 * Stays quiet on all-PASS by default. Exits non-zero on any FAIL so the
 * Scheduled Deployment run is marked failed in the Replit dashboard.
 *
 * Run:   pnpm --filter @workspace/api-server run health:all
 *
 * Optional env overrides:
 *   HEALTH_CHECK_BASE_URL    - base URL for the internal /api/healthz probe
 *                              (default: https://salaryman.io)
 *   CONN_HEALTH_ALERT_EMAIL  - override recipient email
 *                              (default: first OWNER_EMAILS entry)
 *   CONN_HEALTH_WARN_EMAIL   - set to "1" to email on WARN too
 *                              (default: "0" — only FAIL triggers an alert;
 *                              WARNs are printed to console only so unconfigured
 *                              optional integrations don't create noise)
 *   CONN_HEALTH_ALWAYS_EMAIL - set to "1" to email even on all-PASS
 *                              (default: "0")
 *
 * ── Publishing as a Replit Scheduled Deployment ──────────────────────────────
 * 1. Open the Replit Deployments panel and choose "Scheduled" deployment type.
 * 2. Set the run command to:
 *      pnpm --filter @workspace/api-server run health:all
 * 3. Choose a schedule (recommended: every 1 hour, or at minimum once per day).
 * 4. Ensure the following environment variables are set in the deployment's
 *    Secrets panel (they are shared from the main app environment):
 *      OWNER_EMAILS, AI_INTEGRATIONS_OPENAI_*, AI_INTEGRATIONS_ANTHROPIC_*,
 *      REPLIT_CONNECTORS_HOSTNAME, REPL_IDENTITY or WEB_REPL_RENEWAL,
 *      TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER,
 *      ELEVENLABS_API_KEY, STRIPE_SECRET_KEY, NANO_BANANA_API_KEY,
 *      REPLICATE_API_TOKEN, PUBLIC_OBJECT_SEARCH_PATHS (or PRIVATE_OBJECT_DIR).
 *    The Resend connector (for sending the report email) is resolved automatically
 *    via the connectors API — no RESEND_API_KEY env var is needed.
 * 5. Optional: set CONN_HEALTH_ALERT_EMAIL to override the default recipient,
 *    and HEALTH_CHECK_BASE_URL if the app is hosted at a custom domain.
 * 6. Save and deploy. The run will exit 0 on all-PASS, 1 on any failure,
 *    which Replit surfaces as a "failed" run in the deployment history.
 */
import { runAllProbes, type ProbeResult, type ProbeStatus } from "../lib/connection-probes";
import { getUncachableResendClient } from "../lib/resend";

const BASE_URL = (process.env.HEALTH_CHECK_BASE_URL || "https://salaryman.io").replace(/\/+$/, "");
const OP_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

function resolveRecipient(): string {
  const explicit = (process.env.CONN_HEALTH_ALERT_EMAIL || "").trim();
  if (explicit) return explicit;
  const ownerEnv = (process.env.OWNER_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  return ownerEnv[0] || "";
}

function icon(s: ProbeStatus) {
  return s === "PASS" ? "✅" : s === "WARN" ? "⚠️" : "❌";
}

function renderReport(
  results: ProbeResult[],
  overall: ProbeStatus,
  failCount: number,
  warnCount: number
): { subject: string; html: string; text: string } {
  const subject =
    overall === "FAIL"
      ? `[SALARYMAN] Connection health: FAIL (${failCount} failure${failCount !== 1 ? "s" : ""})`
      : overall === "WARN"
      ? `[SALARYMAN] Connection health: WARN (${warnCount} degraded${warnCount !== 1 ? "" : ""})`
      : `[SALARYMAN] Connection health: PASS — all systems nominal`;

  const rows = results
    .map(
      (r) =>
        `<tr>
          <td style="padding:4px 10px;">${icon(r.status)}</td>
          <td style="padding:4px 10px;font-weight:600;white-space:nowrap;">${r.name}</td>
          <td style="padding:4px 10px;color:#777;font-size:12px;white-space:nowrap;">${r.latencyMs > 0 ? `${r.latencyMs}ms` : "—"}</td>
          <td style="padding:4px 10px;color:#444;font-size:12px;">${r.detail}</td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:720px;">
      <h2 style="margin:0 0 4px;">SALARYMAN Platform Connection Health — ${overall}</h2>
      <p style="color:#666;margin:0 0 12px;">${new Date().toUTCString()} · target ${BASE_URL}</p>
      <table style="border-collapse:collapse;border:1px solid #eee;width:100%;">${rows}</table>
      ${
        overall === "FAIL"
          ? `<p style="color:#b00020;font-weight:600;margin-top:16px;">⚠ Action required: ${failCount} platform connection${failCount !== 1 ? "s have" : " has"} failed. Investigate before customers are impacted.</p>`
          : ""
      }
      ${
        overall === "WARN"
          ? `<p style="color:#996600;margin-top:16px;">${warnCount} optional connection${warnCount !== 1 ? "s are" : " is"} degraded or unconfigured. Core services are unaffected.</p>`
          : ""
      }
    </div>`;

  const text =
    `SALARYMAN Platform Connection Health — ${overall}\n` +
    `${new Date().toUTCString()} · target ${BASE_URL}\n\n` +
    results
      .map(
        (r) =>
          `${icon(r.status)} [${r.status}] ${r.name}${r.latencyMs > 0 ? ` (${r.latencyMs}ms)` : ""}: ${r.detail}`
      )
      .join("\n");

  return { subject, html, text };
}

async function sendReport(
  subject: string,
  html: string,
  text: string
): Promise<boolean> {
  const recipient = resolveRecipient();
  if (!recipient) {
    console.error(
      "[conn-health] No recipient configured. Set CONN_HEALTH_ALERT_EMAIL or OWNER_EMAILS."
    );
    return false;
  }
  try {
    const { client, fromEmail } = await withTimeout(
      getUncachableResendClient(),
      OP_TIMEOUT_MS,
      "Resend connect"
    );
    await withTimeout(
      client.emails.send({ from: fromEmail, to: recipient, subject, html, text }),
      OP_TIMEOUT_MS,
      "Resend send"
    );
    console.log(`[conn-health] Report emailed to ${recipient}`);
    return true;
  } catch (e: any) {
    console.error(`[conn-health] Failed to email report: ${e?.message || e}`);
    return false;
  }
}

async function main() {
  console.log(`[conn-health] Running all connection probes → ${BASE_URL}`);

  const { results, overall, failCount, warnCount } = await runAllProbes(BASE_URL);

  console.log(
    `\n=== Connection health: ${overall} (${failCount} FAIL, ${warnCount} WARN) ===`
  );
  for (const r of results) {
    const latency = r.latencyMs > 0 ? ` (${r.latencyMs}ms)` : "";
    console.log(`[${r.status.padEnd(4)}] ${r.name}${latency}: ${r.detail}`);
  }

  const alwaysEmail = (process.env.CONN_HEALTH_ALWAYS_EMAIL ?? "0") === "1";
  const warnEmail = (process.env.CONN_HEALTH_WARN_EMAIL ?? "0") === "1";
  let alertDeliveryFailed = false;

  // Email policy (in order):
  //   FAIL always triggers an alert (core purpose of this script).
  //   WARN triggers an alert only when CONN_HEALTH_WARN_EMAIL=1 is set,
  //     preventing noise from intentionally unconfigured optional integrations.
  //   PASS triggers an alert only when CONN_HEALTH_ALWAYS_EMAIL=1 is set.
  const shouldEmail =
    overall === "FAIL" ||
    (overall === "WARN" && warnEmail) ||
    alwaysEmail;

  if (shouldEmail) {
    const { subject, html, text } = renderReport(results, overall, failCount, warnCount);
    const sent = await sendReport(subject, html, text);
    if (overall === "FAIL" && !sent) alertDeliveryFailed = true;
  } else {
    console.log(
      overall === "WARN"
        ? `[conn-health] ${warnCount} WARN(s) — staying quiet (set CONN_HEALTH_WARN_EMAIL=1 to receive WARN alerts).`
        : "[conn-health] All connections PASS — staying quiet (set CONN_HEALTH_ALWAYS_EMAIL=1 to always email)."
    );
  }

  if (alertDeliveryFailed) {
    console.error("[conn-health] FAIL report could not be delivered — escalating exit status.");
  }

  process.exit(overall === "FAIL" || alertDeliveryFailed ? 1 : 0);
}

main().catch((e) => {
  console.error("[conn-health] Unexpected error:", e);
  process.exit(1);
});
