import { createServer } from 'http';
import app from "./app";
import { attachWorldServer } from './worldServer';
import { setupChatServer } from './chatServer';
import { dispatchWeeklySummaries } from './routes/reporting';
import { seedMerchProducts } from './lib/seed-merch';
import { seedPicassoOrg } from './lib/seed-picasso';
import { seedBotMarketplace } from './lib/seed-bots-marketplace';
import { rehydrateActiveBots } from './lib/bot-engine';
import { seedInsuranceCarriers } from './routes/insurance';

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
    console.log(`[Access] Owner email bypass active for ${ownerEmails.length} address(es)`);
  } else {
    console.warn("[Access] OWNER_EMAILS is not configured — owner bypass inactive");
  }
  seedMerchProducts().catch(err => {
    console.error("[Merch Seed] Error seeding products:", err);
  });
  seedPicassoOrg().catch(err => {
    console.error("[Picasso Seed] Error seeding Picasso org:", err);
  });
  seedBotMarketplace().catch(err => {
    console.error("[Bot Marketplace Seed] Error seeding marketplace:", err);
  });
  rehydrateActiveBots().catch(err => {
    console.error("[Bot Engine] Rehydration error:", err);
  });
  seedInsuranceCarriers().catch(err => {
    console.error("[Insurance Seed] Error seeding carriers:", err);
  });
});

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
setInterval(() => {
  dispatchWeeklySummaries().catch(err => {
    console.error("[Reporting] Weekly summary scheduler error:", err);
  });
}, WEEK_MS);
