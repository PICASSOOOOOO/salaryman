/**
 * Read-only production UI smoke audit.
 *
 * Intended for an hourly Replit Scheduled Deployment:
 *   pnpm --filter @workspace/api-server run audit:site
 */
import { chromium, type Page } from "playwright";
import { existsSync } from "node:fs";
import { getUncachableResendClient } from "../lib/resend";

const BASE_URL = (process.env.SITE_AUDIT_BASE_URL || "https://salaryman.io").replace(/\/+$/, "");
const ROUTES = ["/", "/sign-in", "/sign-up", "/desktop", "/pablo", "/phone"] as const;
const VIEWPORT = { width: 320, height: 800 };

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

function recipient(): string {
  const explicit = (process.env.SITE_AUDIT_ALERT_EMAIL || "").trim();
  if (explicit) return explicit;
  return (process.env.OWNER_EMAILS || "").split(",").map((v) => v.trim()).find(Boolean) || "";
}

function lightSurface(rgb: string): boolean {
  const values = rgb.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
  return values.length === 3 && values.reduce((sum, value) => sum + value, 0) / 3 >= 220;
}

async function visibleAndUncovered(page: Page, text: RegExp): Promise<boolean> {
  const locator = page.getByText(text).last();
  if ((await locator.count()) === 0 || !(await locator.isVisible())) return false;
  return locator.evaluate((target: any) => {
    const doc = (globalThis as any).document;
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const top = doc.elementFromPoint(x, y);
    return Boolean(top && (top === target || target.contains(top) || top.contains(target)));
  });
}

async function auditRoute(page: Page, path: string): Promise<Check[]> {
  const checks: Check[] = [];
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  const onPageError = (error: Error) => pageErrors.push(error.message);
  const onResponse = (response: { status(): number; url(): string }) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  };
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  try {
    const response = await page.goto(`${BASE_URL}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(2_000);

    checks.push({
      name: `${path} responds`,
      ok: Boolean(response?.ok()),
      detail: `HTTP ${response?.status() ?? "none"}`,
    });

    const state = await page.evaluate(() => {
      const win = globalThis as any;
      const doc = win.document;
      const bodyStyle = win.getComputedStyle(doc.body);
      return {
        overflow: doc.documentElement.scrollWidth - win.innerWidth,
        backgroundColor: bodyStyle.backgroundColor,
        replitUi: Boolean(
          doc.querySelector(
            "replit-agent-inbox-widget, replit-agent-inbox-i18n-mirror, #replit-agent-inbox-widget",
          ),
        ),
      };
    });
    checks.push({
      name: `${path} has no horizontal mobile bleed`,
      ok: state.overflow <= 1,
      detail: `${Math.max(0, state.overflow)}px overflow at ${VIEWPORT.width}px`,
    });
    checks.push({
      name: `${path} has no Replit feedback UI`,
      ok: !state.replitUi,
      detail: state.replitUi ? "Injected Replit widget is present" : "none present",
    });
    checks.push({
      name: `${path} has no runtime or 5xx errors`,
      ok: pageErrors.length === 0 && serverErrors.length === 0,
      detail: [...pageErrors, ...serverErrors].join("; ") || "clean",
    });

    if (path === "/sign-in" || path === "/sign-up") {
      checks.push({
        name: `${path} keeps the cream surface`,
        ok: lightSurface(state.backgroundColor),
        detail: `body background ${state.backgroundColor}`,
      });
      const crossLink = path === "/sign-in" ? /sign up/i : /sign in/i;
      checks.push({
        name: `${path} auth controls are visible and uncovered`,
        ok:
          (await page.getByRole("button", { name: /continue with google/i }).isVisible()) &&
          (await page.getByRole("button", { name: /^continue/i }).isVisible()) &&
          (await visibleAndUncovered(page, crossLink)),
        detail: "Google, Continue, and cross-link checked",
      });
    }
  } catch (error) {
    checks.push({
      name: `${path} audit completed`,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
  return checks;
}

async function emailFailure(checks: Check[]): Promise<void> {
  const to = recipient();
  if (!to) {
    console.error("[site-audit] No alert recipient. Set SITE_AUDIT_ALERT_EMAIL or OWNER_EMAILS.");
    return;
  }
  const failed = checks.filter((check) => !check.ok);
  const text = [
    `SALARYMAN hourly site audit failed`,
    `${new Date().toUTCString()} · ${BASE_URL}`,
    "",
    ...failed.map((check) => `FAIL ${check.name}: ${check.detail}`),
  ].join("\n");
  const { client, fromEmail } = await getUncachableResendClient();
  await client.emails.send({
    from: fromEmail,
    to,
    subject: `[SALARYMAN] Site audit failed (${failed.length})`,
    text,
  });
}

async function main(): Promise<void> {
  const configuredBrowser = (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "").trim();
  const replitBrowser = "/repl/tools/bin/chromium";
  const executablePath =
    (configuredBrowser && existsSync(configuredBrowser) && configuredBrowser) ||
    (existsSync(replitBrowser) && replitBrowser) ||
    undefined;
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const checks: Check[] = [];

  try {
    for (const route of ROUTES) checks.push(...(await auditRoute(page, route)));
  } finally {
    await browser.close();
  }

  for (const check of checks) {
    console.log(`[${check.ok ? "PASS" : "FAIL"}] ${check.name}: ${check.detail}`);
  }
  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    try {
      await emailFailure(checks);
    } catch (error) {
      console.error("[site-audit] Failed to send alert:", error);
    }
    process.exit(1);
  }
  console.log(`[site-audit] ${checks.length} checks passed for ${BASE_URL}`);
}

main().catch((error) => {
  console.error("[site-audit] Unexpected error:", error);
  process.exit(1);
});