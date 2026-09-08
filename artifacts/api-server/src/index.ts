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
import { dedupeDuplicateBots } from './lib/dedupe-bots';
import { rehydrateActiveBots } from './lib/bot-engine';
import { seedInsuranceCarriers } from './routes/insurance';
import { seedSalarymanArtKit } from './routes/art-assets';
import { pollBackendHealth, ALERT_POLL_INTERVAL_MS } from './lib/art-providers/backend-alerts';
import { pollConnectionHealth, CONN_HEALTH_POLL_INTERVAL_MS } from './lib/connection-health-monitor';
import { runRecordingRetentionSweep } from './lib/recording-retention';
import { seedSubwayStations } from './routes/subway';
import { ensureOwnersAreApprovedAlphaTesters } from './lib/seed-alpha-testers';
import { sweepInactiveTesters } from './routes/alpha';
import { scheduleWeeklyTikTok } from './lib/weekly-tiktok';
import { startAutopilotScheduler, registerAutopilotHandler, businessOpsAutopilotHandler } from './lib/autopilot';
import { marketingAutopilotHandler } from './lib/autopilot/handlers/marketing';
import { accountingAutopilotHandler } from './lib/autopilot/handlers/accounting';
import { crmCallsAutopilotHandler } from './lib/autopilot/crm-handler';
import { startOrgAccountInterestTick, backfillOrgAccounts } from './routes/org-accounts';
import { seedResourceNodes, tickCommodityPrices } from './routes/resources';
import { expireOverdueRentals } from './routes/fleet';
import { purgeOutsideWorldState } from './lib/outside-world';
import { setupGodotRenderBridge } from './godot-render-bridge';
import { setupDeviceControlBridge } from './device-control-bridge';

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
setupGodotRenderBridge(httpServer);
setupDeviceControlBridge(httpServer);

const ownerEmails = (process.env.OWNER_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);

// Heavy boot work deferred off the readiness path so the server can answer
// health probes the instant it starts listening.  Seeders and bot rehydration
// run in staggered batches to avoid DB-connection spikes.
function runDeferredBoot(): void {
  // Batch 1 (next tick): lightweight seeders — fast, low DB pressure.
  setImmediate(() => {
    purgeOutsideWorldState()
      .then((purged) => {
        if (purged) console.log("[World] Exterior state purged for building-only mode.");
      })
      .catch((err) => console.error("[World] Exterior purge failed:", err));
    seedMerchProducts().catch(err => {
      console.error("[Merch Seed] Error seeding products:", err);
    });
    seedInsuranceCarriers().catch(err => {
      console.error("[Insurance Seed] Error seeding carriers:", err);
    });
    // Register the art catalog without starting paid image jobs during boot.
    // Generation remains available through the explicit admin bake route; boot
    // should stay quiet and responsive even when provider credit is exhausted.
    seedSalarymanArtKit(0).catch(err => {
      console.error("[Art Kit Seed] Error:", err);
    });
    seedSubwayStations().catch(err => {
      console.error("[Subway Seed] Error:", err);
    });
    seedResourceNodes().catch(err => {
      console.error("[Resource Seed] Error:", err);
    });
    tickCommodityPrices().catch(err => {
      console.error("[Commodity Prices] Error:", err);
    });
  });

  // Batch 2 (500 ms): org + bot seed chain — heavier, staggered to let
  // Batch 1 settle before we run the longer sequential seed chain.
  setTimeout(() => {
    seedPicassoOrg()
      .then(() => seedBotMarketplace())
      // Marketplace activation is always an explicit user action. Boot may
      // seed the catalog and reconcile old records, but it must never wake an
      // entire roster into office desks.
      .then(() => activateAllBotsForPicassoOrg())
      // One-time, idempotent collapse of duplicate marketplace bot instances so
      // the Command Center count matches the consolidated roster. Runs after
      // activation so the canonical (subscription-linked) instance is settled.
      .then(() => dedupeDuplicateBots())
      .catch(err => {
        console.error("[Picasso/Bots Seed] Error during seed chain:", err);
      });
    // Auto-approve every Picasso owner/tester email as alpha_tester. Idempotent.
    ensureOwnersAreApprovedAlphaTesters().catch(err => {
      console.error("[Alpha Seed] Error:", err);
    });
  }, 500);

  // Batch 3 (2 000 ms): bot rehydration — 158 bots; runs last so the seed
  // chain above has had time to ensure marketplace rows exist.
  setTimeout(() => {
    rehydrateActiveBots().catch(err => {
      console.error("[Bot Engine] Rehydration error:", err);
    });
  }, 2_000);

  // Org accounts backfill: seeds checking+savings rows for orgs that existed
  // before this feature was deployed. Idempotent — no-op for already-seeded orgs.
  setTimeout(() => {
    backfillOrgAccounts().catch(err => {
      console.error("[OrgAccounts] Backfill error:", err);
    });
  }, 3_000);

  // Schedulers — just register timers, effectively instant.
  scheduleWeeklyTikTok();
  startOrgAccountInterestTick();
  registerAutopilotHandler("marketing", marketingAutopilotHandler);
  registerAutopilotHandler("accounting", accountingAutopilotHandler);
  registerAutopilotHandler("crm_calls", crmCallsAutopilotHandler);
  registerAutopilotHandler("business_ops", businessOpsAutopilotHandler);
  startAutopilotScheduler();
}

// Retry-on-EADDRINUSE so dev workflow restarts survive a slow port release.
let bindAttempts = 0;
const MAX_BIND_ATTEMPTS = 5;
const BIND_RETRY_MS = 1_000;

function startListening(): void {
  httpServer.listen(port, () => {
    bindAttempts = 0;
    console.log(`Server listening on port ${port}`);
    if (ownerEmails.length > 0) {
      console.log(`[Access] Tester / Picasso staff bypass active for ${ownerEmails.length} address(es) — every paid feature free.`);
    } else {
      console.warn("[Access] OWNER_EMAILS is not configured — owner bypass inactive");
    }
    // Kick off deferred work AFTER the listen callback returns so the first
    // health probe can be answered with zero blocking.
    setImmediate(runDeferredBoot);
  });
}

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    if (bindAttempts < MAX_BIND_ATTEMPTS) {
      bindAttempts++;
      console.warn(`[Startup] Port ${port} in use — retry ${bindAttempts}/${MAX_BIND_ATTEMPTS} in ${BIND_RETRY_MS}ms`);
      setTimeout(() => {
        httpServer.close();
        startListening();
      }, BIND_RETRY_MS);
    } else {
      console.error(`[FATAL] Port ${port} still in use after ${MAX_BIND_ATTEMPTS} retries. Exiting.`);
      process.exit(1);
    }
  } else {
    console.error("[FATAL] Server error:", err);
    process.exit(1);
  }
});

startListening();

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

// Watch configured render backends and email admins when one goes offline (or
// recovers), debounced so a flapping node doesn't spam. Silenced via the
// ART_BACKEND_ALERTS env toggle. First tick establishes a silent baseline.
function runBackendHealthPoll(): void {
  pollBackendHealth().catch((err) => console.error("[Art Backend Alerts] poll error:", err));
}
setTimeout(runBackendHealthPoll, 45_000); // 45s after boot — let seeders settle
setInterval(runBackendHealthPoll, ALERT_POLL_INTERVAL_MS);

// Continuously probe every external platform connection (+ internal API
// structure) and email admins when one transitions healthy->broken (or
// recovers), debounced so a blip doesn't spam. Confirmed transitions are
// persisted to the shared health-transition store. Silenced via the
// CONN_HEALTH_MONITOR env toggle. First tick establishes a silent baseline.
function runConnectionHealthPoll(): void {
  pollConnectionHealth().catch((err) => console.error("[Conn Health Monitor] poll error:", err));
}
setTimeout(runConnectionHealthPoll, 60_000); // 60s after boot — let seeders settle
setInterval(runConnectionHealthPoll, CONN_HEALTH_POLL_INTERVAL_MS);

const RECORDING_RETENTION_SWEEP_MS = 24 * 60 * 60 * 1000;
const runRetentionSweep = () => {
  void runRecordingRetentionSweep()
    .then(({ notified, deleted }) => {
      if (notified || deleted) console.log(`[recording-retention] notified=${notified} deleted=${deleted}`);
    })
    .catch((error: unknown) => {
      console.error("[recording-retention] sweep failed:", error instanceof Error ? error.message : error);
    });
};
setTimeout(runRetentionSweep, 60_000);
setInterval(runRetentionSweep, RECORDING_RETENTION_SWEEP_MS);

// Expire overdue fleet rentals every 2 minutes. Credits org checking accounts
// automatically and clears the vehicle so it becomes available again.
const FLEET_CRON_MS = 2 * 60 * 1000;
function runFleetExpiry(): void {
  expireOverdueRentals().catch((err) => console.error("[Fleet] expiry cron error:", err));
}
setTimeout(runFleetExpiry, 120_000); // 2 min after boot
setInterval(runFleetExpiry, FLEET_CRON_MS);
