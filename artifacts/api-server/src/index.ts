import { createServer } from 'http';
import app from "./app";
import { attachWorldServer } from './worldServer';
import { dispatchWeeklySummaries } from './routes/reporting';
import { seedMerchProducts } from './lib/seed-merch';

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

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[FATAL] Port ${port} is already in use. Another process may still be running. Exiting.`);
  } else {
    console.error("[FATAL] Server error:", err);
  }
  process.exit(1);
});

httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  seedMerchProducts().catch(err => {
    console.error("[Merch Seed] Error seeding products:", err);
  });
});

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
setInterval(() => {
  dispatchWeeklySummaries().catch(err => {
    console.error("[Reporting] Weekly summary scheduler error:", err);
  });
}, WEEK_MS);
