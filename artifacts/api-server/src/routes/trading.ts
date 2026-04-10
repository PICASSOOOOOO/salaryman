import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  botsTable,
  botTradingAccountsTable,
  botTradeStrategiesTable,
  botTradeLogTable,
  botPlatformConnectionsTable,
  botOAuthSessionsTable,
} from "@workspace/db";
import { encryptCredentials, decryptCredentials } from "../lib/bot-crypto";
import { buildAuthUrl, exchangeCodeForTokens, getAccounts, generatePkce, type SchwabPosition } from "../lib/schwab-api";
import { activateKillSwitch, deactivateKillSwitch } from "../lib/trade-risk-manager";
import { startBot } from "../lib/bot-engine";
import { createHmac, randomBytes } from "crypto";

const router = Router();

if (!process.env.OAUTH_STATE_SECRET) {
  console.warn("[Trading] OAUTH_STATE_SECRET env var not set — using ephemeral key (restarts invalidate active OAuth flows)");
}
const OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET || randomBytes(32).toString("hex");

function signState(payload: string): string {
  const sig = createHmac("sha256", OAUTH_STATE_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyState(signed: string): { botId: number; userId: string; nonce: string } | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = signed.slice(0, lastDot);
  const sig = signed.slice(lastDot + 1);
  const expected = createHmac("sha256", OAUTH_STATE_SECRET).update(payload).digest("base64url");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

function getUserId(req: Request): string {
  return (req as Request & { user?: { id?: string } }).user?.id ?? "";
}

function parseParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

async function getOwnedBot(botId: number, userId: string) {
  const [bot] = await db
    .select()
    .from(botsTable)
    .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));
  return bot;
}

function hasTradingPermission(bot: { permissions: string[] }, ...required: string[]): boolean {
  return required.some(p => bot.permissions.includes(p));
}

router.get("/bots/:id/trading/account", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const bot = await getOwnedBot(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const [account] = await db
      .select()
      .from(botTradingAccountsTable)
      .where(eq(botTradingAccountsTable.botId, botId));

    res.json({ account: account ? {
      id: account.id,
      botId: account.botId,
      schwabAccountNumber: account.schwabAccountNumber,
      isPaperMode: account.isPaperMode,
      cachedBalance: account.cachedBalance,
      cachedEquity: account.cachedEquity,
      dailyPnl: account.dailyPnl,
      lastSyncAt: account.lastSyncAt,
      hasTokens: !!(account.encryptedAccessToken),
    } : null });
  } catch (err) {
    console.error("Error fetching trading account:", err);
    res.status(500).json({ error: "Failed to fetch trading account" });
  }
});

router.put("/bots/:id/trading/account", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const bot = await getOwnedBot(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const { isPaperMode } = req.body;

    const [existing] = await db
      .select()
      .from(botTradingAccountsTable)
      .where(eq(botTradingAccountsTable.botId, botId));

    if (existing) {
      if (isPaperMode === false && !existing.encryptedAccessToken) {
        res.status(400).json({ error: "Connect Schwab account before enabling live trading" });
        return;
      }
      const [updated] = await db
        .update(botTradingAccountsTable)
        .set({ ...(isPaperMode !== undefined ? { isPaperMode } : {}) })
        .where(eq(botTradingAccountsTable.botId, botId))
        .returning();
      res.json({ account: { ...updated, encryptedAccessToken: undefined, encryptedRefreshToken: undefined } });
    } else {
      const [created] = await db
        .insert(botTradingAccountsTable)
        .values({ botId, isPaperMode: isPaperMode ?? true })
        .returning();
      res.json({ account: { ...created, encryptedAccessToken: undefined, encryptedRefreshToken: undefined } });
    }
  } catch (err) {
    console.error("Error updating trading account:", err);
    res.status(500).json({ error: "Failed to update trading account" });
  }
});

router.post("/bots/:id/trading/account/paper-mode", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const bot = await getOwnedBot(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
    if (!hasTradingPermission(bot, "trading_paper", "trading_execute")) {
      res.status(403).json({ error: "Bot does not have trading permissions" });
      return;
    }

    const { isPaperMode } = req.body;

    const [existingAccount] = await db
      .select()
      .from(botTradingAccountsTable)
      .where(eq(botTradingAccountsTable.botId, botId));

    if (isPaperMode === false && !existingAccount?.encryptedAccessToken) {
      res.status(400).json({ error: "Schwab account must be connected before enabling live trading" });
      return;
    }

    const newMode = isPaperMode ?? true;
    await db
      .insert(botTradingAccountsTable)
      .values({ botId, isPaperMode: newMode })
      .onConflictDoUpdate({
        target: botTradingAccountsTable.botId,
        set: { isPaperMode: newMode },
      });

    res.json({ success: true, isPaperMode: newMode });
  } catch (err) {
    console.error("Error toggling paper mode:", err);
    res.status(500).json({ error: "Failed to toggle paper mode" });
  }
});

router.post("/bots/:id/trading/schwab/auth-url", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const bot = await getOwnedBot(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const { appKey } = req.body;
    if (!appKey) { res.status(400).json({ error: "appKey is required" }); return; }

    const host = req.headers.host || process.env.REPLIT_DEV_DOMAIN || "localhost";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const redirectUri = `${proto}://${host}/api/trading/schwab/callback`;

    const { codeVerifier, codeChallenge } = generatePkce();
    const nonce = randomBytes(16).toString("hex");

    const statePayload = Buffer.from(JSON.stringify({ botId, userId, nonce })).toString("base64url");
    const signedState = signState(statePayload);

    await db.delete(botOAuthSessionsTable).where(eq(botOAuthSessionsTable.botId, botId));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.insert(botOAuthSessionsTable).values({ nonce, botId, userId, codeVerifier, expiresAt });

    const authUrl = buildAuthUrl(appKey, redirectUri, codeChallenge, signedState);

    res.json({ authUrl, redirectUri });
  } catch (err) {
    console.error("Error building Schwab auth URL:", err);
    res.status(500).json({ error: "Failed to build auth URL" });
  }
});

router.get("/trading/schwab/callback", async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      res.status(400).send("Missing code or state parameter");
      return;
    }

    const stateData = verifyState(state);
    if (!stateData) {
      res.status(400).send("Invalid or tampered state parameter");
      return;
    }

    const { botId, userId, nonce } = stateData;

    const [pkceEntry] = await db
      .select()
      .from(botOAuthSessionsTable)
      .where(eq(botOAuthSessionsTable.nonce, nonce));

    if (!pkceEntry) {
      res.status(400).send("OAuth session expired or already used — please restart the authorization flow");
      return;
    }
    if (pkceEntry.botId !== botId || pkceEntry.userId !== userId) {
      await db.delete(botOAuthSessionsTable).where(eq(botOAuthSessionsTable.nonce, nonce));
      res.status(400).send("State mismatch — authorization rejected");
      return;
    }
    if (new Date() > pkceEntry.expiresAt) {
      await db.delete(botOAuthSessionsTable).where(eq(botOAuthSessionsTable.nonce, nonce));
      res.status(400).send("OAuth session expired — please restart the authorization flow");
      return;
    }

    await db.delete(botOAuthSessionsTable).where(eq(botOAuthSessionsTable.nonce, nonce));

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, userId)));

    if (!bot) {
      res.status(404).send("Bot not found");
      return;
    }

    const [conn] = await db
      .select()
      .from(botPlatformConnectionsTable)
      .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "thinkorswim")));

    if (!conn) {
      res.status(400).send("thinkorswim platform not connected — please connect the platform first");
      return;
    }

    const creds = JSON.parse(decryptCredentials(conn.credentials)) as { appKey: string; appSecret: string };

    const host = req.headers.host || process.env.REPLIT_DEV_DOMAIN || "localhost";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const redirectUri = `${proto}://${host}/api/trading/schwab/callback`;

    const tokens = await exchangeCodeForTokens(code, creds.appKey, creds.appSecret, redirectUri, pkceEntry.codeVerifier);

    const tokenSet = {
      encryptedAccessToken: encryptCredentials(tokens.accessToken),
      encryptedRefreshToken: encryptCredentials(tokens.refreshToken),
      tokenExpiresAt: new Date(tokens.expiresAt),
    };

    await db
      .insert(botTradingAccountsTable)
      .values({ botId, isPaperMode: true, ...tokenSet })
      .onConflictDoUpdate({
        target: botTradingAccountsTable.botId,
        set: tokenSet,
      });

    try {
      const accounts = await getAccounts(botId, creds.appKey, creds.appSecret);
      if (accounts.length > 0) {
        await db.update(botTradingAccountsTable).set({
          schwabAccountHash: accounts[0].accountHash,
          schwabAccountNumber: accounts[0].accountNumber,
          cachedBalance: accounts[0].cashBalance,
          cachedEquity: accounts[0].equity,
          lastSyncAt: new Date(),
        }).where(eq(botTradingAccountsTable.botId, botId));
      }
    } catch (err) {
      console.error("Error fetching Schwab accounts after auth:", err);
    }

    try {
      await startBot(botId);
      console.log(`[OAuth] Bot ${botId} restarted after Schwab account linked`);
    } catch (err) {
      console.error(`[OAuth] Failed to restart bot ${botId} after Schwab link:`, err);
    }

    const previewPath = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/`
      : "/";
    res.redirect(`${previewPath}?schwab_connected=1&bot_id=${botId}`);
  } catch (err) {
    console.error("Schwab OAuth callback error:", err);
    res.status(500).send("OAuth callback failed");
  }
});

router.get("/bots/:id/trading/strategies", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const bot = await getOwnedBot(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const strategies = await db
      .select()
      .from(botTradeStrategiesTable)
      .where(eq(botTradeStrategiesTable.botId, botId));

    res.json({ strategies });
  } catch (err) {
    console.error("Error fetching strategies:", err);
    res.status(500).json({ error: "Failed to fetch strategies" });
  }
});

router.post("/bots/:id/trading/strategies", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const bot = await getOwnedBot(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const {
      strategyType, enabled, parameters,
      maxDailyLoss, maxDailyLossPercent, maxPositionSize,
      maxConcurrentTrades, stopLossPercent, trailingStopPercent,
    } = req.body;

    if (!strategyType) { res.status(400).json({ error: "strategyType is required" }); return; }

    const existing = await db
      .select()
      .from(botTradeStrategiesTable)
      .where(and(eq(botTradeStrategiesTable.botId, botId), eq(botTradeStrategiesTable.strategyType, strategyType)));

    if (existing.length > 0) {
      const [updated] = await db
        .update(botTradeStrategiesTable)
        .set({
          enabled: enabled ?? existing[0].enabled,
          parameters: parameters ?? existing[0].parameters,
          maxDailyLoss: maxDailyLoss ?? existing[0].maxDailyLoss,
          maxDailyLossPercent: maxDailyLossPercent ?? existing[0].maxDailyLossPercent,
          maxPositionSize: maxPositionSize ?? existing[0].maxPositionSize,
          maxConcurrentTrades: maxConcurrentTrades ?? existing[0].maxConcurrentTrades,
          stopLossPercent: stopLossPercent ?? existing[0].stopLossPercent,
          trailingStopPercent: trailingStopPercent ?? existing[0].trailingStopPercent,
        })
        .where(eq(botTradeStrategiesTable.id, existing[0].id))
        .returning();
      res.json({ strategy: updated });
    } else {
      const [created] = await db
        .insert(botTradeStrategiesTable)
        .values({
          botId,
          strategyType,
          enabled: enabled ?? false,
          parameters: parameters ?? {},
          maxDailyLoss: maxDailyLoss ?? 500,
          maxDailyLossPercent: maxDailyLossPercent ?? 5,
          maxPositionSize: maxPositionSize ?? 1000,
          maxConcurrentTrades: maxConcurrentTrades ?? 3,
          stopLossPercent: stopLossPercent ?? 2,
          trailingStopPercent: trailingStopPercent ?? 0,
        })
        .returning();
      res.json({ strategy: created });
    }
  } catch (err) {
    console.error("Error saving strategy:", err);
    res.status(500).json({ error: "Failed to save strategy" });
  }
});

router.put("/bots/:id/trading/strategies/:strategyId", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const strategyId = parseInt(parseParam(req.params.strategyId), 10);
    const bot = await getOwnedBot(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const updates: Record<string, unknown> = {};
    const allowed = ["enabled", "parameters", "maxDailyLoss", "maxDailyLossPercent", "maxPositionSize",
      "maxConcurrentTrades", "stopLossPercent", "trailingStopPercent", "killSwitch"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const [updated] = await db
      .update(botTradeStrategiesTable)
      .set(updates)
      .where(and(eq(botTradeStrategiesTable.id, strategyId), eq(botTradeStrategiesTable.botId, botId)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Strategy not found" }); return; }
    res.json({ strategy: updated });
  } catch (err) {
    console.error("Error updating strategy:", err);
    res.status(500).json({ error: "Failed to update strategy" });
  }
});

router.get("/bots/:id/trading/trades", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const bot = await getOwnedBot(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const limit = parseInt(req.query.limit as string, 10) || 100;
    const trades = await db
      .select()
      .from(botTradeLogTable)
      .where(eq(botTradeLogTable.botId, botId))
      .orderBy(desc(botTradeLogTable.createdAt))
      .limit(limit);

    const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
    const wins = trades.filter(t => (t.pnl || 0) > 0).length;
    const losses = trades.filter(t => (t.pnl || 0) < 0).length;

    res.json({ trades, stats: { totalPnl, wins, losses, total: trades.length } });
  } catch (err) {
    console.error("Error fetching trades:", err);
    res.status(500).json({ error: "Failed to fetch trades" });
  }
});

router.post("/bots/:id/trading/kill-switch", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const bot = await getOwnedBot(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
    if (!hasTradingPermission(bot, "trading_execute", "trading_paper")) {
      res.status(403).json({ error: "Bot does not have trading permissions" });
      return;
    }

    const { activate } = req.body;

    if (activate === false) {
      await deactivateKillSwitch(botId);
      res.json({ success: true, killSwitch: false });
      return;
    }

    const [conn] = await db
      .select()
      .from(botPlatformConnectionsTable)
      .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "thinkorswim")));

    let appKey = "";
    let appSecret = "";
    if (conn?.credentials) {
      try {
        const creds = JSON.parse(decryptCredentials(conn.credentials));
        appKey = creds.appKey || "";
        appSecret = creds.appSecret || "";
      } catch (err) {
        console.error("Failed to decrypt thinkorswim credentials for kill switch:", err);
      }
    }

    const result = await activateKillSwitch(botId, appKey, appSecret);
    res.json({ success: true, killSwitch: true, ...result });
  } catch (err) {
    console.error("Error toggling kill switch:", err);
    res.status(500).json({ error: "Failed to toggle kill switch" });
  }
});

router.get("/bots/:id/trading/positions", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const botId = parseInt(parseParam(req.params.id), 10);
    const bot = await getOwnedBot(botId, userId);
    if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

    const [account] = await db
      .select()
      .from(botTradingAccountsTable)
      .where(eq(botTradingAccountsTable.botId, botId));

    if (!account?.schwabAccountHash) {
      res.json({ positions: [], source: "paper" });
      return;
    }

    const [conn] = await db
      .select()
      .from(botPlatformConnectionsTable)
      .where(and(eq(botPlatformConnectionsTable.botId, botId), eq(botPlatformConnectionsTable.platform, "thinkorswim")));

    if (!conn?.credentials) {
      res.json({ positions: [], source: "paper" });
      return;
    }

    const creds = JSON.parse(decryptCredentials(conn.credentials)) as { appKey: string; appSecret: string };
    const accounts = await getAccounts(botId, creds.appKey, creds.appSecret);
    const matched = accounts.find(a => a.accountHash === account.schwabAccountHash);
    const positions: SchwabPosition[] = matched?.positions ?? [];
    res.json({ positions, source: "live" });
  } catch (err) {
    console.error("Error fetching portfolio positions:", err);
    res.status(500).json({ error: "Failed to fetch positions" });
  }
});

import { RISK_PROFILES, INTERNATIONAL_MARKETS, isMarketOpenNow } from "../lib/trading-strategies";

router.get("/trading/risk-profiles", (_req: Request, res: Response) => {
  res.json({ profiles: RISK_PROFILES });
});

router.get("/trading/markets", (_req: Request, res: Response) => {
  const markets = INTERNATIONAL_MARKETS.map(m => ({
    ...m,
    isOpen: isMarketOpenNow(m),
  }));
  res.json({ markets });
});

router.post("/bots/:id/trading/risk-profile", requireAuth, async (req: Request, res: Response) => {
  const botId = Number(req.params.id);
  const { profile } = req.body;
  if (!profile || !RISK_PROFILES[profile as keyof typeof RISK_PROFILES]) {
    res.status(400).json({ error: "Invalid risk profile. Must be conservative, moderate, or aggressive." });
    return;
  }
  const cfg = RISK_PROFILES[profile as keyof typeof RISK_PROFILES];
  try {
    const strategies = await db
      .select()
      .from(botTradeStrategiesTable)
      .where(eq(botTradeStrategiesTable.botId, botId));

    for (const strat of strategies) {
      const enabled = cfg.allowedStrategies.includes(strat.strategyType);
      await db.update(botTradeStrategiesTable)
        .set({
          enabled,
          maxDailyLossPercent: cfg.maxDailyLossPercent,
          maxPositionSize: Math.round(cfg.maxPositionSizePercent * 100),
          maxConcurrentTrades: cfg.maxConcurrentTrades,
          stopLossPercent: cfg.stopLossPercent,
          trailingStopPercent: cfg.trailingStopPercent,
        })
        .where(eq(botTradeStrategiesTable.id, strat.id));
    }

    const enabledStrategies = cfg.allowedStrategies;
    const existingTypes = strategies.map(s => s.strategyType);
    for (const stratType of enabledStrategies) {
      if (!existingTypes.includes(stratType)) {
        await db.insert(botTradeStrategiesTable).values({
          botId,
          strategyType: stratType,
          enabled: true,
          maxDailyLoss: 0,
          maxDailyLossPercent: cfg.maxDailyLossPercent,
          maxPositionSize: Math.round(cfg.maxPositionSizePercent * 100),
          maxConcurrentTrades: cfg.maxConcurrentTrades,
          stopLossPercent: cfg.stopLossPercent,
          trailingStopPercent: cfg.trailingStopPercent,
          killSwitch: false,
        });
      }
    }

    const updated = await db
      .select()
      .from(botTradeStrategiesTable)
      .where(eq(botTradeStrategiesTable.botId, botId));

    res.json({ ok: true, profile, config: cfg, strategies: updated });
  } catch (err) {
    console.error("Error applying risk profile:", err);
    res.status(500).json({ error: "Failed to apply risk profile" });
  }
});

export default router;
