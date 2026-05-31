import { createServer } from 'http';
import app from "./app";
import { attachWorldServer } from './worldServer';
import { setupChatServer } from './chatServer';
import { dispatchWeeklySummaries } from './routes/reporting';
import { sweepErrorReports } from './lib/feedback-sweeper';
import { sendDailyDigestIfDue } from './lib/feedback-digest';
import { seedMerchProducts } from './lib/seed-merch';
import { seedPicassoOrg } from './lib/seed-picasso';
import { seedBotMarketplace } from './lib/seed-bots-marketplace';
import { activateAllBotsForPicassoOrg } from './lib/seed-picasso-bots';
import { normalizeBotPrimeNames } from './lib/bot-naming';
import { rehydrateActiveBots } from './lib/bot-engine';
import { seedInsuranceCarriers } from './routes/insurance';
import { seedSalarymanArtKit } from './routes/art-assets';
import { seedSubwayStations } from './routes/subway';
import { ensureOwnersAreApprovedAlphaTesters } from './lib/seed-alpha-testers';
import { sweepInactiveTesters } from './routes/alpha';

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
attachWorldServer(httpServer);
setupChatServer(httpServer);

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[FATAL] Port ${port} is already in use. Another process may still be running. Exiting.`);
  } else {
    console.error("[FATAL] Server error:", err);
  }
  process.exit(1);
});

const ownerEmails = (process.env.OWNER_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);

httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  if (ownerEmails.length > 0) {
    console.log(`[Access] Tester / Picasso staff bypass active for ${ownerEmails.length} address(es) — every paid feature free.`);
  } else {
    console.warn("[Access] OWNER_EMAILS is not configured — owner bypass inactive");
  }
  seedMerchProducts().catch(err => {
    console.error("[Merch Seed] Error seeding products:", err);
  });
  seedPicassoOrg()
    .then(() => seedBotMarketplace())
    .then(() => activateAllBotsForPicassoOrg())
    .then(() => normalizeBotPrimeNames())
    .catch(err => {
      console.error("[Picasso/Bots Seed] Error during seed chain:", err);
    });
  rehydrateActiveBots().catch(err => {
    console.error("[Bot Engine] Rehydration error:", err);
  });
  seedInsuranceCarriers().catch(err => {
    console.error("[Insurance Seed] Error seeding carriers:", err);
  });
  seedSalarymanArtKit().catch(err => {
    console.error("[Art Kit Seed] Error:", err);
  });
  seedSubwayStations().catch(err => {
    console.error("[Subway Seed] Error:", err);
  });
  // Auto-approve every Picasso owner/tester email as alpha_tester. Idempotent.
  ensureOwnersAreApprovedAlphaTesters().catch(err => {
    console.error("[Alpha Seed] Error:", err);
  });
});

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
setInterval(() => {
  dispatchWeeklySummaries().catch(err => {
    console.error("[Reporting] Weekly summary scheduler error:", err);
  });
}, WEEK_MS);

// Auto-resolve stale / superseded / duplicate error reports every hour so
// the inbox stays small enough for a human to triage. Also runs once at
// boot to drain anything that piled up while the server was down.
const HOUR_MS = 60 * 60 * 1000;
function runErrorSweep(): void {
  sweepErrorReports()
    .then((r) => {
      if (r.stale || r.superseded || r.dedupCollapsed || r.errors.length) {
        console.log(`[Feedback Sweep] stale=${r.stale} superseded=${r.superseded} dedup=${r.dedupCollapsed} errors=${r.errors.length}`);
        if (r.errors.length) console.warn("[Feedback Sweep] partial errors:", r.errors);
      }
    })
    .catch((err) => console.error("[Feedback Sweep] scheduler error:", err));
}
setTimeout(runErrorSweep, 30_000); // 30s after boot — let seeders finish
setInterval(runErrorSweep, HOUR_MS);

// Daily Resend digest of the error/feedback inbox to OWNER_EMAILS. The
// helper internally checks a system_config "lastDigestAt" key and only
// actually mails when 24h have elapsed since the previous send, so it's
// safe to invoke on every hourly tick (and once shortly after boot, to
// catch the case where the server was down during the daily window).
function runDailyDigest(): void {
  sendDailyDigestIfDue()
    .then((r) => {
      if (r.sent) {
        console.log(`[Feedback Digest] sent to ${r.recipients} recipient(s)`);
      } else if (r.reason !== "not_due" && r.reason !== "nothing_to_report") {
        console.log(`[Feedback Digest] skipped: ${r.reason}`);
      }
    })
    .catch((err) => console.error("[Feedback Digest] scheduler error:", err));
}
setTimeout(runDailyDigest, 60_000); // 60s after boot
setInterval(runDailyDigest, HOUR_MS);

// Release tester slots held by members who haven't logged into SALARYMAN for
// 3 days (max 20 active testers). Runs shortly after boot and hourly after.
function runTesterSweep(): void {
  sweepInactiveTesters().catch((err) => console.error("[Alpha Sweep] scheduler error:", err));
}
setTimeout(runTesterSweep, 90_000); // 90s after boot — let seeders finish
setInterval(runTesterSweep, HOUR_MS);
