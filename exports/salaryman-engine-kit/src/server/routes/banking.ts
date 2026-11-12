import { Router, type Request, type Response, type NextFunction } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  realBankConnectionsTable,
  userBankingCredentialsTable,
  type RealBankAccountSnapshot,
  botsTable,
  botBrokerConnectionsTable,
  botTradingAccountsTable,
} from "@workspace/db";
import type { PlaidApi } from "plaid";
import { encryptCredentials, decryptCredentials } from "../lib/bot-crypto";
import {
  makePlaidClient,
  normalizePlaidEnv,
  type PlaidCredentials,
  PLAID_PRODUCTS,
  PLAID_COUNTRY_CODES,
} from "../lib/plaid-client";
import { convert, formatCurrency, centsToMajor, CURRENCIES } from "../lib/currency";

const router: Router = Router();

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

// IMPORTANT: This router is strictly VIEW-ONLY. It reads real bank balances via
// Plaid's hosted Link flow and aggregates them with brokerage balances from the
// in-app trading system. It NEVER moves money and is completely separate from
// the in-game FIAT bank (routes/bank.ts + schema/bank.ts).

function needsCredentials(res: Response) {
  res.status(400).json({
    error: "Add your Plaid credentials first.",
    code: "NEEDS_CREDENTIALS",
  });
}

// Load and decrypt the authenticated user's own Plaid credentials, if any.
async function loadUserCreds(userId: string): Promise<PlaidCredentials | null> {
  const [row] = await db
    .select()
    .from(userBankingCredentialsTable)
    .where(eq(userBankingCredentialsTable.userId, userId));
  if (!row) return null;
  const clientId = decryptCredentials(row.encryptedClientId);
  const secret = decryptCredentials(row.encryptedSecret);
  if (!clientId || !secret) return null;
  return { clientId, secret, env: row.env };
}

// Build a Plaid client from the user's stored credentials (or null if none).
async function getClientForUser(userId: string): Promise<PlaidApi | null> {
  const creds = await loadUserCreds(userId);
  if (!creds) return null;
  return makePlaidClient(creds);
}

function parseParam(p: string | string[] | undefined): string {
  return Array.isArray(p) ? p[0] : (p ?? "");
}

function normalizeCurrency(code: string | null | undefined): string {
  const c = (code || "USD").toUpperCase();
  return c in CURRENCIES ? c : "USD";
}

// Sum a connection's account current balances, converted to USD cents.
function sumAccountsUsdCents(accounts: RealBankAccountSnapshot[]): number {
  let usd = 0;
  for (const a of accounts) {
    const bal = a.balanceCurrent ?? a.balanceAvailable ?? 0;
    usd += convert(bal, normalizeCurrency(a.currency), "USD");
  }
  return Math.round(usd * 100);
}

// Status: has THIS user supplied their own Plaid credentials?
router.get("/banking/status", requireAuth, async (req: Request, res: Response) => {
  const creds = await loadUserCreds(getUserId(req));
  res.json({ configured: Boolean(creds) });
});

// Read the user's stored credential metadata (never returns the secret values).
router.get("/banking/credentials", requireAuth, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(userBankingCredentialsTable)
    .where(eq(userBankingCredentialsTable.userId, getUserId(req)));
  if (!row) {
    res.json({ configured: false });
    return;
  }
  // Surface only a masked hint of the client id so the user can recognize it.
  const clientId = decryptCredentials(row.encryptedClientId);
  const hint = clientId.length > 4 ? `\u2022\u2022\u2022\u2022${clientId.slice(-4)}` : "\u2022\u2022\u2022\u2022";
  res.json({ configured: true, env: row.env, clientIdHint: hint });
});

// Save (or replace) the user's own Plaid credentials, encrypted at rest.
router.post("/banking/credentials", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { clientId, secret, env } = req.body as {
      clientId?: string;
      secret?: string;
      env?: string;
    };
    if (!clientId?.trim() || !secret?.trim()) {
      res.status(400).json({ error: "Both Client ID and Secret are required." });
      return;
    }
    const normEnv = normalizePlaidEnv(env);

    // Validate the credentials by attempting a Link token create before saving.
    try {
      const probe = makePlaidClient({ clientId: clientId.trim(), secret: secret.trim(), env: normEnv });
      await probe.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: "SALARYMAN",
        products: PLAID_PRODUCTS,
        country_codes: PLAID_COUNTRY_CODES,
        language: "en",
      });
    } catch {
      res.status(400).json({
        error: "Those Plaid credentials were rejected. Double-check your Client ID, Secret, and environment.",
        code: "INVALID_CREDENTIALS",
      });
      return;
    }

    const values = {
      userId,
      provider: "plaid" as const,
      encryptedClientId: encryptCredentials(clientId.trim()),
      encryptedSecret: encryptCredentials(secret.trim()),
      env: normEnv,
      updatedAt: new Date(),
    };
    await db
      .insert(userBankingCredentialsTable)
      .values(values)
      .onConflictDoUpdate({
        target: userBankingCredentialsTable.userId,
        set: {
          encryptedClientId: values.encryptedClientId,
          encryptedSecret: values.encryptedSecret,
          env: values.env,
          updatedAt: values.updatedAt,
        },
      });
    res.json({ ok: true, configured: true, env: normEnv });
  } catch (err) {
    console.error("Error saving banking credentials:", err);
    res.status(500).json({ error: "Failed to save credentials" });
  }
});

// Remove the user's stored Plaid credentials. Existing linked banks remain
// (cached balances still show), but refresh/link will require re-entering keys.
router.delete("/banking/credentials", requireAuth, async (req: Request, res: Response) => {
  try {
    await db
      .delete(userBankingCredentialsTable)
      .where(eq(userBankingCredentialsTable.userId, getUserId(req)));
    res.json({ ok: true, configured: false });
  } catch (err) {
    console.error("Error deleting banking credentials:", err);
    res.status(500).json({ error: "Failed to remove credentials" });
  }
});

// Create a Plaid Link token for the authenticated user. The frontend opens the
// hosted Link UI with this token so the user authenticates with their bank
// directly — we never see their bank credentials.
router.post("/banking/link-token", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const client = await getClientForUser(userId);
    if (!client) return needsCredentials(res);
    const resp = await client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "SALARYMAN",
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: "en",
    });
    res.json({ linkToken: resp.data.link_token, expiration: resp.data.expiration });
  } catch (err: unknown) {
    console.error("Error creating Plaid link token:", err);
    res.status(502).json({ error: "Failed to start bank linking" });
  }
});

// Read fresh balances for an access token and shape them into snapshots.
async function fetchAccountSnapshots(client: PlaidApi, accessToken: string): Promise<{
  institutionId: string | null;
  accounts: RealBankAccountSnapshot[];
}> {
  const balResp = await client.accountsBalanceGet({ access_token: accessToken });
  const accounts: RealBankAccountSnapshot[] = (balResp.data.accounts || []).map((a) => ({
    accountId: a.account_id,
    name: a.name,
    officialName: a.official_name ?? null,
    mask: a.mask ?? null,
    type: a.type ?? null,
    subtype: a.subtype ?? null,
    currency: normalizeCurrency(a.balances?.iso_currency_code || a.balances?.unofficial_currency_code),
    balanceCurrent: a.balances?.current ?? null,
    balanceAvailable: a.balances?.available ?? null,
  }));
  const institutionId = balResp.data.item?.institution_id ?? null;
  return { institutionId, accounts };
}

async function resolveInstitutionName(client: PlaidApi, institutionId: string | null): Promise<string | null> {
  if (!institutionId) return null;
  try {
    const inst = await client.institutionsGetById({
      institution_id: institutionId,
      country_codes: PLAID_COUNTRY_CODES,
    });
    return inst.data.institution?.name ?? null;
  } catch {
    return null;
  }
}

// Exchange the public token returned by Link for a persistent access token,
// fetch the initial balances, and store everything (token encrypted at rest).
router.post("/banking/exchange", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { publicToken } = req.body as { publicToken?: string };
    if (!publicToken) {
      res.status(400).json({ error: "Missing publicToken" });
      return;
    }
    const client = await getClientForUser(userId);
    if (!client) return needsCredentials(res);
    const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const { institutionId, accounts } = await fetchAccountSnapshots(client, accessToken);
    const institutionName = await resolveInstitutionName(client, institutionId);
    const totalUsdCents = sumAccountsUsdCents(accounts);

    const [saved] = await db
      .insert(realBankConnectionsTable)
      .values({
        userId,
        provider: "plaid",
        itemId,
        encryptedAccessToken: encryptCredentials(accessToken),
        institutionId,
        institutionName,
        accounts,
        cachedTotalUsdCents: totalUsdCents,
        status: "connected",
        lastSyncAt: new Date(),
      })
      .returning();

    res.json({ connection: toPublicConnection(saved) });
  } catch (err: unknown) {
    console.error("Error exchanging Plaid public token:", err);
    res.status(502).json({ error: "Failed to link bank account" });
  }
});

type DbConnection = typeof realBankConnectionsTable.$inferSelect;

// Never leak the encrypted access token to the client.
function toPublicConnection(c: DbConnection) {
  return {
    id: c.id,
    provider: c.provider,
    institutionId: c.institutionId,
    institutionName: c.institutionName,
    status: c.status,
    lastError: c.lastError,
    lastSyncAt: c.lastSyncAt,
    accounts: (c.accounts || []).map((a) => ({
      accountId: a.accountId,
      name: a.name,
      officialName: a.officialName,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
      currency: a.currency,
      balanceCurrent: a.balanceCurrent,
      balanceAvailable: a.balanceAvailable,
      balanceFormatted:
        a.balanceCurrent != null ? formatCurrency(a.balanceCurrent, a.currency) : null,
    })),
  };
}

// List the user's linked banks (cached balances).
router.get("/banking/connections", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const rows = await db
      .select()
      .from(realBankConnectionsTable)
      .where(eq(realBankConnectionsTable.userId, userId));
    const creds = await loadUserCreds(userId);
    res.json({ connections: rows.map(toPublicConnection), configured: Boolean(creds) });
  } catch (err) {
    console.error("Error listing bank connections:", err);
    res.status(500).json({ error: "Failed to list bank connections" });
  }
});

// Refresh balances for one connection (or all of the user's) from the provider.
router.post("/banking/refresh", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const client = await getClientForUser(userId);
    if (!client) return needsCredentials(res);
    const { connectionId } = req.body as { connectionId?: number };

    const rows = await db
      .select()
      .from(realBankConnectionsTable)
      .where(
        connectionId
          ? and(
              eq(realBankConnectionsTable.userId, userId),
              eq(realBankConnectionsTable.id, connectionId),
            )
          : eq(realBankConnectionsTable.userId, userId),
      );

    const refreshed: ReturnType<typeof toPublicConnection>[] = [];
    for (const row of rows) {
      try {
        const accessToken = decryptCredentials(row.encryptedAccessToken);
        const { institutionId, accounts } = await fetchAccountSnapshots(client, accessToken);
        const institutionName = row.institutionName || (await resolveInstitutionName(client, institutionId));
        const totalUsdCents = sumAccountsUsdCents(accounts);
        const [updated] = await db
          .update(realBankConnectionsTable)
          .set({
            accounts,
            institutionId: institutionId || row.institutionId,
            institutionName,
            cachedTotalUsdCents: totalUsdCents,
            status: "connected",
            lastError: null,
            lastSyncAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(realBankConnectionsTable.id, row.id))
          .returning();
        refreshed.push(toPublicConnection(updated));
      } catch (err) {
        console.error(`Error refreshing bank connection ${row.id}:`, err);
        const [updated] = await db
          .update(realBankConnectionsTable)
          .set({ status: "error", lastError: "Could not refresh balances", updatedAt: new Date() })
          .where(eq(realBankConnectionsTable.id, row.id))
          .returning();
        refreshed.push(toPublicConnection(updated));
      }
    }
    res.json({ connections: refreshed });
  } catch (err) {
    console.error("Error refreshing bank connections:", err);
    res.status(500).json({ error: "Failed to refresh balances" });
  }
});

// Disconnect a linked bank: remove the item at Plaid (best-effort) then delete.
router.delete("/banking/connections/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = parseInt(parseParam(req.params.id), 10);
    const [row] = await db
      .select()
      .from(realBankConnectionsTable)
      .where(and(eq(realBankConnectionsTable.id, id), eq(realBankConnectionsTable.userId, userId)));
    if (!row) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }
    try {
      const client = await getClientForUser(userId);
      if (client) {
        await client.itemRemove({ access_token: decryptCredentials(row.encryptedAccessToken) });
      }
    } catch (err) {
      console.error("Plaid itemRemove failed (continuing with local delete):", err);
    }
    await db.delete(realBankConnectionsTable).where(eq(realBankConnectionsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Error disconnecting bank:", err);
    res.status(500).json({ error: "Failed to disconnect bank" });
  }
});

// Unified financial overview: real bank balances + brokerage balances (from the
// trading system, across all of this user's bots) aggregated into a combined
// net total, converted to the requested home currency (default USD).
router.get("/banking/overview", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const homeCurrency = normalizeCurrency(parseParam(req.query.currency as string | undefined));
    const hasCreds = Boolean(await loadUserCreds(userId));

    // ---- Real bank balances (cached snapshots) ----
    const bankRows = await db
      .select()
      .from(realBankConnectionsTable)
      .where(eq(realBankConnectionsTable.userId, userId));

    let bankTotalHome = 0;
    const banks = bankRows.map((row) => {
      let connHome = 0;
      const accounts = (row.accounts || []).map((a) => {
        const bal = a.balanceCurrent ?? a.balanceAvailable ?? 0;
        const home = convert(bal, normalizeCurrency(a.currency), homeCurrency);
        connHome += home;
        return {
          accountId: a.accountId,
          name: a.name,
          mask: a.mask,
          subtype: a.subtype,
          currency: a.currency,
          balanceCurrent: a.balanceCurrent,
          balanceFormatted: a.balanceCurrent != null ? formatCurrency(a.balanceCurrent, a.currency) : null,
          balanceHome: Math.round(home * 100) / 100,
        };
      });
      bankTotalHome += connHome;
      return {
        id: row.id,
        institutionName: row.institutionName,
        status: row.status,
        lastSyncAt: row.lastSyncAt,
        accounts,
        totalHome: Math.round(connHome * 100) / 100,
      };
    });

    // ---- Brokerage balances (in-app trading system, cached native equity) ----
    const userBots = await db
      .select({ id: botsTable.id, name: botsTable.name })
      .from(botsTable)
      .where(eq(botsTable.ownerId, userId));
    const botIds = userBots.map((b) => b.id);
    const botNameById = new Map(userBots.map((b) => [b.id, b.name] as const));

    let brokerageTotalHome = 0;
    const brokerages: Array<{
      botId: number;
      botName: string | null;
      broker: string;
      currency: string;
      isPaperMode: boolean;
      equityNative: number;
      equityFormatted: string;
      equityHome: number;
    }> = [];

    if (botIds.length > 0) {
      const brokerConns = await db
        .select()
        .from(botBrokerConnectionsTable)
        .where(inArray(botBrokerConnectionsTable.botId, botIds));
      const legacy = await db
        .select()
        .from(botTradingAccountsTable)
        .where(inArray(botTradingAccountsTable.botId, botIds));

      for (const c of brokerConns) {
        const currency = normalizeCurrency(c.currency);
        const equityMajor = centsToMajor(c.cachedEquityNative ?? c.cachedBalanceNative ?? 0);
        const home = convert(equityMajor, currency, homeCurrency);
        brokerageTotalHome += home;
        brokerages.push({
          botId: c.botId,
          botName: botNameById.get(c.botId) ?? null,
          broker: c.broker,
          currency,
          isPaperMode: c.isPaperMode,
          equityNative: c.cachedEquityNative ?? c.cachedBalanceNative ?? 0,
          equityFormatted: formatCurrency(equityMajor, currency),
          equityHome: Math.round(home * 100) / 100,
        });
      }

      // Legacy Schwab primary accounts (USD), only when they hold live tokens.
      for (const a of legacy) {
        if (!botIds.includes(a.botId)) continue;
        if (!a.encryptedAccessToken) continue;
        const equityMajor = centsToMajor(a.cachedEquity ?? a.cachedBalance ?? 0);
        const home = convert(equityMajor, "USD", homeCurrency);
        brokerageTotalHome += home;
        brokerages.push({
          botId: a.botId,
          botName: botNameById.get(a.botId) ?? null,
          broker: "schwab",
          currency: "USD",
          isPaperMode: a.isPaperMode,
          equityNative: a.cachedEquity ?? a.cachedBalance ?? 0,
          equityFormatted: formatCurrency(equityMajor, "USD"),
          equityHome: Math.round(home * 100) / 100,
        });
      }
    }

    const combinedHome = bankTotalHome + brokerageTotalHome;

    res.json({
      homeCurrency,
      configured: hasCreds,
      banks,
      brokerages,
      totals: {
        bankHome: Math.round(bankTotalHome * 100) / 100,
        brokerageHome: Math.round(brokerageTotalHome * 100) / 100,
        combinedHome: Math.round(combinedHome * 100) / 100,
        bankFormatted: formatCurrency(bankTotalHome, homeCurrency),
        brokerageFormatted: formatCurrency(brokerageTotalHome, homeCurrency),
        combinedFormatted: formatCurrency(combinedHome, homeCurrency),
      },
      currencies: Object.keys(CURRENCIES),
    });
  } catch (err) {
    console.error("Error building financial overview:", err);
    res.status(500).json({ error: "Failed to build financial overview" });
  }
});

export default router;
