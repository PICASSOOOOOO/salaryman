/**
 * Daily phone-system health check (Twilio).
 *
 * Designed to run as a Replit Scheduled Deployment once per day. It performs
 * LIVE checks against the real Twilio account and the live API endpoints, then
 * emails a PASS/FAIL report via Resend. Exits non-zero on any hard failure so
 * the scheduled run is also marked failed in the deployment dashboard.
 *
 * Run: pnpm --filter @workspace/api-server run health:phone
 *
 * Optional env overrides:
 *   HEALTH_CHECK_BASE_URL    - base URL to probe (default https://picassoo.app)
 *   PHONE_HEALTH_ALERT_EMAIL - recipient for the report (default: first owner)
 *   PHONE_HEALTH_MIN_BALANCE - low-balance warning threshold (default 5)
 *   PHONE_HEALTH_ALWAYS_EMAIL - "1" to email on PASS too (default: email always)
 */
import twilio from "twilio";
import { db, systemConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableResendClient } from "../lib/resend";

type CheckResult = {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: string;
};

// Keep the default aligned with the verified published app domain. Scheduled
// runs can still override this for staging or another production alias.
const BASE_URL = (process.env.HEALTH_CHECK_BASE_URL || "https://salaryman.io").replace(/\/+$/, "");
const MIN_BALANCE = Number(process.env.PHONE_HEALTH_MIN_BALANCE ?? "5");
const FETCH_TIMEOUT_MS = 15000;
const OP_TIMEOUT_MS = 20000;

class TimeoutError extends Error {}

/** Bound any promise so the unattended job can never hang. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Resolve the alert recipient WITHOUT importing lib/plan (which pulls in
 * @workspace/db and throws at module load if DATABASE_URL is missing — the
 * scheduled job must not require a DB connection).
 */
function resolveRecipient(): string {
  const explicit = (process.env.PHONE_HEALTH_ALERT_EMAIL || "").trim();
  if (explicit) return explicit;
  const ownerEnv = (process.env.OWNER_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  return ownerEnv[0] || "";
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function checkEnv(results: CheckResult[]): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const num = process.env.TWILIO_PHONE_NUMBER;
  const missing = [
    !sid && "TWILIO_ACCOUNT_SID",
    !token && "TWILIO_AUTH_TOKEN",
    !num && "TWILIO_PHONE_NUMBER",
    !process.env.TWILIO_API_KEY_SID && "TWILIO_API_KEY_SID",
    !process.env.TWILIO_API_KEY_SECRET && "TWILIO_API_KEY_SECRET",
    !process.env.TWILIO_TWIML_APP_SID && "TWILIO_TWIML_APP_SID",
  ].filter(Boolean);
  if (missing.length) {
    results.push({
      name: "Twilio credentials configured",
      status: "FAIL",
      detail: `Missing env: ${missing.join(", ")}`,
    });
    return false;
  }
  results.push({
    name: "Twilio credentials configured",
    status: "PASS",
    detail: `SID present, auth token present, number ${num}`,
  });
  return true;
}

async function checkTwimlApplication(client: twilio.Twilio, results: CheckResult[]) {
  const expectedUrl = `${BASE_URL}/api/twilio/twiml/client-voice`;
  const stored = await db.select({ value: systemConfigTable.value })
    .from(systemConfigTable)
    .where(eq(systemConfigTable.key, "twilio_twiml_app_sid"))
    .limit(1);
  const candidates = [...new Set([stored[0]?.value, process.env.TWILIO_TWIML_APP_SID].filter((sid): sid is string => Boolean(sid)))];
  for (const appSid of candidates) {
    try {
      const app = await withTimeout(client.applications(appSid).fetch(), OP_TIMEOUT_MS, "TwiML application fetch");
      if (app.voiceUrl !== expectedUrl || (app.voiceMethod || "POST").toUpperCase() !== "POST") {
        await withTimeout(
          client.applications(appSid).update({ voiceUrl: expectedUrl, voiceMethod: "POST" }),
          OP_TIMEOUT_MS,
          "TwiML application update",
        );
      }
      if (stored[0]?.value !== appSid) {
        await db.insert(systemConfigTable)
          .values({ key: "twilio_twiml_app_sid", value: appSid, category: "twilio", description: "Auto-repaired by phone health" })
          .onConflictDoUpdate({ target: systemConfigTable.key, set: { value: appSid, updatedAt: new Date() } });
      }
      results.push({ name: "Browser Voice TwiML application", status: "PASS", detail: `${appSid} -> POST ${expectedUrl}` });
      return;
    } catch {
      // Try the next persisted/configured candidate before provisioning.
    }
  }
  try {
    const app = await withTimeout(
      client.applications.create({ friendlyName: "Salaryman Voice App", voiceUrl: expectedUrl, voiceMethod: "POST" }),
      OP_TIMEOUT_MS,
      "TwiML application provision",
    );
    await db.insert(systemConfigTable)
      .values({ key: "twilio_twiml_app_sid", value: app.sid, category: "twilio", description: "Auto-repaired by phone health" })
      .onConflictDoUpdate({ target: systemConfigTable.key, set: { value: app.sid, updatedAt: new Date() } });
    results.push({ name: "Browser Voice TwiML application", status: "PASS", detail: `Provisioned ${app.sid} -> POST ${expectedUrl}` });
  } catch (e: any) {
    results.push({ name: "Browser Voice TwiML application", status: "FAIL", detail: `Could not provision TwiML application: ${e?.message || e}` });
  }
}

async function checkClientVoiceContract(results: CheckResult[]) {
  const conference = "conf-phone-health-check-probe";
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/twilio/twiml/client-voice`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: conference, From: "client:phone-health-check" }).toString(),
    });
    const xml = await res.text();
    const valid = res.ok
      && xml.includes("<Response><Dial><Conference")
      && xml.includes(`>${conference}</Conference></Dial></Response>`)
      && xml.includes('startConferenceOnEnter="true"')
      && xml.includes('endConferenceOnExit="true"');
    results.push({
      name: "Browser Voice callback contract",
      status: valid ? "PASS" : "FAIL",
      detail: valid ? `POST client-voice returned conference TwiML (${res.status})` : `Unexpected callback response (${res.status}): ${xml.slice(0, 180)}`,
    });
  } catch (e: any) {
    results.push({ name: "Browser Voice callback contract", status: "FAIL", detail: `Callback probe failed: ${e?.message || e}` });
  }
}

async function checkAccountActive(client: twilio.Twilio, sid: string, results: CheckResult[]) {
  try {
    const acct = await withTimeout(client.api.v2010.accounts(sid).fetch(), OP_TIMEOUT_MS, "Twilio account fetch");
    if (acct.status === "active") {
      results.push({ name: "Twilio account active", status: "PASS", detail: `status=${acct.status}` });
    } else {
      results.push({
        name: "Twilio account active",
        status: "FAIL",
        detail: `Account status is "${acct.status}" (expected "active")`,
      });
    }
  } catch (e: any) {
    results.push({
      name: "Twilio account active",
      status: "FAIL",
      detail: `Could not fetch account (bad credentials or Twilio outage): ${e?.message || e}`,
    });
  }
}

async function checkPhoneNumber(client: twilio.Twilio, num: string, results: CheckResult[]) {
  try {
    const nums = await withTimeout(
      client.incomingPhoneNumbers.list({ phoneNumber: num, limit: 1 }),
      OP_TIMEOUT_MS,
      "Twilio number list"
    );
    if (nums.length > 0) {
      const n = nums[0];
      const caps = n.capabilities || ({} as any);
      results.push({
        name: "Phone number provisioned",
        status: "PASS",
        detail: `${n.phoneNumber} owned (voice=${!!caps.voice}, sms=${!!caps.sms})`,
      });
    } else {
      results.push({
        name: "Phone number provisioned",
        status: "FAIL",
        detail: `${num} is NOT present in this Twilio account`,
      });
    }
  } catch (e: any) {
    results.push({
      name: "Phone number provisioned",
      status: "FAIL",
      detail: `Could not list incoming numbers: ${e?.message || e}`,
    });
  }
}

async function checkTollfreeMessagingVerification(client: twilio.Twilio, num: string, results: CheckResult[]) {
  // Twilio's shared sender is a US toll-free number. Toll-free SMS can be
  // accepted by the API and still be blocked at delivery until verification is
  // approved, so provisioning alone is not enough to call messaging healthy.
  if (!/^\+1(?:800|888|877|866|855|844|833)/.test(num)) {
    results.push({ name: "Toll-free SMS verification", status: "PASS", detail: "Not applicable to this sender" });
    return;
  }
  try {
    const numbers = await withTimeout(
      client.incomingPhoneNumbers.list({ phoneNumber: num, limit: 1 }),
      OP_TIMEOUT_MS,
      "Toll-free sender lookup",
    );
    const phoneSid = numbers[0]?.sid;
    if (!phoneSid) {
      results.push({ name: "Toll-free SMS verification", status: "FAIL", detail: "Could not resolve the sender phone-number SID" });
      return;
    }
    const verifications = await withTimeout(
      client.messaging.v1.tollfreeVerifications.list({ tollfreePhoneNumberSid: phoneSid, limit: 10 }),
      OP_TIMEOUT_MS,
      "Toll-free verification lookup",
    );
    const status = verifications[0]?.status;
    if (status === "TWILIO_APPROVED") {
      results.push({ name: "Toll-free SMS verification", status: "PASS", detail: "Sender approved by Twilio" });
    } else {
      results.push({
        name: "Toll-free SMS verification",
        status: "FAIL",
        detail: status ? `Sender verification status is ${status}` : "No toll-free verification record exists",
      });
    }
  } catch (e: any) {
    results.push({ name: "Toll-free SMS verification", status: "FAIL", detail: `Verification lookup failed: ${e?.message || e}` });
  }
}

async function checkBalance(client: twilio.Twilio, results: CheckResult[]) {
  try {
    const bal = await withTimeout(client.balance.fetch(), OP_TIMEOUT_MS, "Twilio balance fetch");
    const amount = Number(bal.balance);
    const cur = bal.currency || "USD";
    if (!Number.isFinite(amount)) {
      // Indeterminate balance must not pass — the objective is live verification.
      results.push({ name: "Account balance", status: "FAIL", detail: `Could not parse balance: ${bal.balance}` });
    } else if (amount <= 0) {
      results.push({ name: "Account balance", status: "FAIL", detail: `Balance is ${amount} ${cur} — calls/SMS will fail` });
    } else if (amount < MIN_BALANCE) {
      results.push({ name: "Account balance", status: "WARN", detail: `Low balance: ${amount} ${cur} (threshold ${MIN_BALANCE})` });
    } else {
      results.push({ name: "Account balance", status: "PASS", detail: `${amount} ${cur}` });
    }
  } catch (e: any) {
    // Treat an unreachable balance API as a hard failure (assume broken).
    results.push({ name: "Account balance", status: "FAIL", detail: `Could not fetch balance: ${e?.message || e}` });
  }
}

async function checkApiHealth(results: CheckResult[]) {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/healthz`);
    if (res.ok) {
      results.push({ name: "API server reachable", status: "PASS", detail: `GET /api/healthz -> ${res.status}` });
    } else {
      results.push({ name: "API server reachable", status: "FAIL", detail: `GET /api/healthz -> ${res.status}` });
    }
  } catch (e: any) {
    results.push({ name: "API server reachable", status: "FAIL", detail: `GET /api/healthz failed: ${e?.message || e}` });
  }
}

async function checkPhoneRouteMounted(results: CheckResult[]) {
  // Unauthenticated POST must be rejected with 401 — proves the phone route is
  // mounted AND auth is enforced. A 404/5xx means the phone system is broken.
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/twilio/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.status === 401) {
      results.push({ name: "Phone route mounted + auth enforced", status: "PASS", detail: `POST /api/twilio/call -> 401 (expected)` });
    } else if (res.status === 404) {
      results.push({ name: "Phone route mounted + auth enforced", status: "FAIL", detail: `POST /api/twilio/call -> 404 (route missing!)` });
    } else if (res.status >= 500) {
      results.push({ name: "Phone route mounted + auth enforced", status: "FAIL", detail: `POST /api/twilio/call -> ${res.status} (server error)` });
    } else {
      results.push({ name: "Phone route mounted + auth enforced", status: "WARN", detail: `POST /api/twilio/call -> ${res.status} (expected 401)` });
    }
  } catch (e: any) {
    results.push({ name: "Phone route mounted + auth enforced", status: "FAIL", detail: `POST /api/twilio/call failed: ${e?.message || e}` });
  }
}

function renderReport(results: CheckResult[], overall: "PASS" | "FAIL"): { subject: string; html: string; text: string } {
  const icon = (s: CheckResult["status"]) => (s === "PASS" ? "✅" : s === "WARN" ? "⚠️" : "❌");
  const fails = results.filter((r) => r.status === "FAIL").length;
  const warns = results.filter((r) => r.status === "WARN").length;
  const subject =
    overall === "PASS"
      ? `[SALARYMAN] Phone health: PASS${warns ? ` (${warns} warning${warns > 1 ? "s" : ""})` : ""}`
      : `[SALARYMAN] Phone health: FAIL (${fails} issue${fails > 1 ? "s" : ""})`;

  const rows = results
    .map((r) => `<tr><td style="padding:4px 10px;">${icon(r.status)}</td><td style="padding:4px 10px;font-weight:600;">${r.name}</td><td style="padding:4px 10px;color:#444;">${r.detail}</td></tr>`)
    .join("");
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;">
      <h2 style="margin:0 0 4px;">Twilio / Phone System Health — ${overall}</h2>
      <p style="color:#666;margin:0 0 12px;">${new Date().toUTCString()} · target ${BASE_URL}</p>
      <table style="border-collapse:collapse;border:1px solid #eee;">${rows}</table>
      ${overall === "FAIL" ? `<p style="color:#b00020;font-weight:600;margin-top:14px;">Action required: the phone system has a failing check. Investigate before customers are impacted.</p>` : ""}
    </div>`;
  const text =
    `Twilio / Phone System Health — ${overall}\n${new Date().toUTCString()} · target ${BASE_URL}\n\n` +
    results.map((r) => `${icon(r.status)} ${r.name}: ${r.detail}`).join("\n");
  return { subject, html, text };
}

async function sendReport(subject: string, html: string, text: string): Promise<boolean> {
  const recipient = resolveRecipient();
  if (!recipient) {
    console.error("[phone-health] No recipient configured (set PHONE_HEALTH_ALERT_EMAIL or OWNER_EMAILS); skipping email.");
    return false;
  }
  try {
    const { client, fromEmail } = await withTimeout(getUncachableResendClient(), OP_TIMEOUT_MS, "Resend connect");
    await withTimeout(
      client.emails.send({ from: fromEmail, to: recipient, subject, html, text }),
      OP_TIMEOUT_MS,
      "Resend send"
    );
    console.log(`[phone-health] Report emailed to ${recipient}`);
    return true;
  } catch (e: any) {
    console.error(`[phone-health] Failed to email report: ${e?.message || e}`);
    return false;
  }
}

async function main() {
  const results: CheckResult[] = [];

  const hasEnv = await checkEnv(results);
  if (hasEnv) {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const num = process.env.TWILIO_PHONE_NUMBER!;
    const client = twilio(sid, token);
    await checkAccountActive(client, sid, results);
    await checkPhoneNumber(client, num, results);
    await checkTollfreeMessagingVerification(client, num, results);
    await checkBalance(client, results);
    await checkTwimlApplication(client, results);
  }
  await checkApiHealth(results);
  await checkPhoneRouteMounted(results);
  await checkClientVoiceContract(results);

  const hardFail = results.some((r) => r.status === "FAIL");
  const overall: "PASS" | "FAIL" = hardFail ? "FAIL" : "PASS";

  console.log(`\n=== Phone health: ${overall} ===`);
  for (const r of results) {
    const tag = r.status === "PASS" ? "PASS" : r.status === "WARN" ? "WARN" : "FAIL";
    console.log(`[${tag}] ${r.name}: ${r.detail}`);
  }

  const alwaysEmail = (process.env.PHONE_HEALTH_ALWAYS_EMAIL ?? "1") !== "0";
  let alertDeliveryFailed = false;
  if (overall === "FAIL" || alwaysEmail) {
    const { subject, html, text } = renderReport(results, overall);
    const sent = await sendReport(subject, html, text);
    // A failing health check that could NOT alert anyone is itself a failure.
    if (overall === "FAIL" && !sent) alertDeliveryFailed = true;
  }

  if (alertDeliveryFailed) {
    console.error("[phone-health] FAIL report could not be delivered — escalating exit status.");
  }
  process.exit(hardFail || alertDeliveryFailed ? 1 : 0);
}

main().catch((e) => {
  console.error("[phone-health] Unexpected error:", e);
  process.exit(1);
});
