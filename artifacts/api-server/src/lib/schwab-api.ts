import { encryptCredentials, decryptCredentials } from "./bot-crypto";
import { db, botTradingAccountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";

const SCHWAB_AUTH_BASE = "https://api.schwabapi.com/v1/oauth";
const SCHWAB_MARKET_BASE = "https://api.schwabapi.com/marketdata/v1";
const SCHWAB_TRADER_BASE = "https://api.schwabapi.com/trader/v1";

export interface SchwabTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface SchwabCredentials {
  appKey: string;
  appSecret: string;
}

export interface SchwabPosition {
  symbol: string;
  quantity: number;
  marketValue: number;
  averagePrice: number;
  unrealizedPnl: number;
  assetType: string;
}

export interface SchwabAccount {
  accountNumber: string;
  accountHash: string;
  cashBalance: number;
  equity: number;
  positions: SchwabPosition[];
}

export interface SchwabQuote {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  volume: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  change: number;
  percentChange: number;
}

export interface SchwabCandle {
  datetime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SchwabOptionChain {
  symbol: string;
  underlyingPrice: number;
  callExpDateMap: Record<string, Record<string, SchwabOptionContract[]>>;
  putExpDateMap: Record<string, Record<string, SchwabOptionContract[]>>;
}

export interface SchwabOptionContract {
  symbol: string;
  strikePrice: number;
  expirationDate: string;
  bid: number;
  ask: number;
  last: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  impliedVolatility: number;
  openInterest: number;
  volume: number;
}

export interface PlaceOrderRequest {
  symbol: string;
  side: "BUY" | "SELL" | "BUY_TO_OPEN" | "SELL_TO_OPEN" | "BUY_TO_CLOSE" | "SELL_TO_CLOSE";
  quantity: number;
  orderType: "MARKET" | "LIMIT" | "NET_DEBIT" | "NET_CREDIT";
  limitPrice?: number;
  duration?: "DAY" | "GOOD_TILL_CANCEL";
  assetType?: "EQUITY" | "OPTION";
  optionLegs?: OptionsOrderLeg[];
}

export interface OptionsOrderLeg {
  instruction: "BUY_TO_OPEN" | "SELL_TO_OPEN" | "BUY_TO_CLOSE" | "SELL_TO_CLOSE";
  quantity: number;
  symbol: string;
}

export interface PlaceOrderResult {
  orderId: string;
  status: string;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, maxPerMinute = 120): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60_000 };
    rateLimitMap.set(key, entry);
  }
  entry.count++;
  return entry.count <= maxPerMinute;
}

export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function buildAuthUrl(
  appKey: string,
  redirectUri: string,
  codeChallenge: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: appKey,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "PlaceTrades AccountAccess MarketData",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });
  return `${SCHWAB_AUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  appKey: string,
  appSecret: string,
  redirectUri: string,
  codeVerifier: string
): Promise<SchwabTokens> {
  const basic = Buffer.from(`${appKey}:${appSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(`${SCHWAB_AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Schwab token exchange failed: ${err}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAccessToken(
  refreshToken: string,
  appKey: string,
  appSecret: string
): Promise<SchwabTokens> {
  const basic = Buffer.from(`${appKey}:${appSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(`${SCHWAB_AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Schwab token refresh failed: ${err}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function getValidAccessToken(botId: number, appKey: string, appSecret: string): Promise<string> {
  const [account] = await db
    .select()
    .from(botTradingAccountsTable)
    .where(eq(botTradingAccountsTable.botId, botId));

  if (!account?.encryptedAccessToken) throw new Error("No Schwab tokens stored for this bot");

  const accessToken = decryptCredentials(account.encryptedAccessToken);
  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;

  if (Date.now() < expiresAt - 60_000) {
    return accessToken;
  }

  if (!account.encryptedRefreshToken) throw new Error("No refresh token available");
  const refreshToken = decryptCredentials(account.encryptedRefreshToken);

  const newTokens = await refreshAccessToken(refreshToken, appKey, appSecret);

  await db.update(botTradingAccountsTable).set({
    encryptedAccessToken: encryptCredentials(newTokens.accessToken),
    encryptedRefreshToken: encryptCredentials(newTokens.refreshToken),
    tokenExpiresAt: new Date(newTokens.expiresAt),
  }).where(eq(botTradingAccountsTable.botId, botId));

  return newTokens.accessToken;
}

async function schwabFetch(url: string, accessToken: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

export async function getAccounts(botId: number, appKey: string, appSecret: string): Promise<SchwabAccount[]> {
  if (!checkRateLimit(`accounts-${botId}`)) throw new Error("Rate limit exceeded");

  const token = await getValidAccessToken(botId, appKey, appSecret);
  const res = await schwabFetch(`${SCHWAB_TRADER_BASE}/accounts?fields=positions`, token);

  if (!res.ok) throw new Error(`Failed to fetch accounts: ${res.status}`);

  const data = await res.json() as Array<{
    securitiesAccount: {
      accountNumber: string;
      accountId: string;
      currentBalances: { cashBalance: number; equity: number };
      positions?: Array<{
        instrument: { symbol: string; assetType: string };
        longQuantity: number;
        shortQuantity: number;
        marketValue: number;
        averagePrice: number;
        unrealizedPnL: number;
      }>;
    };
  }>;

  return data.map(a => ({
    accountNumber: a.securitiesAccount.accountNumber,
    accountHash: a.securitiesAccount.accountId,
    cashBalance: Math.round((a.securitiesAccount.currentBalances.cashBalance || 0) * 100),
    equity: Math.round((a.securitiesAccount.currentBalances.equity || 0) * 100),
    positions: (a.securitiesAccount.positions || []).map(p => ({
      symbol: p.instrument.symbol,
      quantity: (p.longQuantity || 0) - (p.shortQuantity || 0),
      marketValue: Math.round((p.marketValue || 0) * 100),
      averagePrice: Math.round((p.averagePrice || 0) * 100),
      unrealizedPnl: Math.round((p.unrealizedPnL || 0) * 100),
      assetType: p.instrument.assetType,
    })),
  }));
}

export async function getQuotes(
  botId: number,
  appKey: string,
  appSecret: string,
  symbols: string[]
): Promise<Record<string, SchwabQuote>> {
  if (!checkRateLimit(`quotes-${botId}`, 240)) throw new Error("Rate limit exceeded");

  const token = await getValidAccessToken(botId, appKey, appSecret);
  const symbolList = symbols.join(",");
  const res = await schwabFetch(
    `${SCHWAB_MARKET_BASE}/quotes?symbols=${encodeURIComponent(symbolList)}&fields=quote,reference`,
    token
  );

  if (!res.ok) throw new Error(`Failed to fetch quotes: ${res.status}`);

  const data = await res.json() as Record<string, {
    quote?: {
      lastPrice: number;
      bidPrice: number;
      askPrice: number;
      totalVolume: number;
      openPrice: number;
      highPrice: number;
      lowPrice: number;
      closePrice: number;
      netChange: number;
      netPercentChange: number;
    };
  }>;

  const result: Record<string, SchwabQuote> = {};
  for (const [symbol, info] of Object.entries(data)) {
    if (info.quote) {
      result[symbol] = {
        symbol,
        lastPrice: info.quote.lastPrice || 0,
        bidPrice: info.quote.bidPrice || 0,
        askPrice: info.quote.askPrice || 0,
        volume: info.quote.totalVolume || 0,
        openPrice: info.quote.openPrice || 0,
        highPrice: info.quote.highPrice || 0,
        lowPrice: info.quote.lowPrice || 0,
        closePrice: info.quote.closePrice || 0,
        change: info.quote.netChange || 0,
        percentChange: info.quote.netPercentChange || 0,
      };
    }
  }
  return result;
}

export async function getPriceHistory(
  botId: number,
  appKey: string,
  appSecret: string,
  symbol: string,
  periodType: "day" | "month" | "year" = "day",
  period = 1,
  frequencyType: "minute" | "daily" = "minute",
  frequency = 5
): Promise<SchwabCandle[]> {
  if (!checkRateLimit(`history-${botId}`, 120)) throw new Error("Rate limit exceeded");

  const token = await getValidAccessToken(botId, appKey, appSecret);
  const url = `${SCHWAB_MARKET_BASE}/pricehistory?symbol=${encodeURIComponent(symbol)}&periodType=${periodType}&period=${period}&frequencyType=${frequencyType}&frequency=${frequency}&needExtendedHoursData=false`;
  const res = await schwabFetch(url, token);

  if (!res.ok) throw new Error(`Failed to fetch price history: ${res.status}`);

  const data = await res.json() as {
    candles?: Array<{ datetime: number; open: number; high: number; low: number; close: number; volume: number }>;
  };

  return (data.candles || []).map(c => ({
    datetime: c.datetime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

export async function getOptionChain(
  botId: number,
  appKey: string,
  appSecret: string,
  symbol: string,
  strikeCount = 5
): Promise<SchwabOptionChain> {
  if (!checkRateLimit(`options-${botId}`, 60)) throw new Error("Rate limit exceeded");

  const token = await getValidAccessToken(botId, appKey, appSecret);
  const url = `${SCHWAB_MARKET_BASE}/chains?symbol=${encodeURIComponent(symbol)}&contractType=ALL&strikeCount=${strikeCount}&includeUnderlyingQuote=true&strategy=SINGLE`;
  const res = await schwabFetch(url, token);

  if (!res.ok) throw new Error(`Failed to fetch option chain: ${res.status}`);

  const data = await res.json() as SchwabOptionChain;
  return data;
}

export function selectNearestATMOption(
  chain: SchwabOptionChain,
  side: "CALL" | "PUT",
  dteMin = 7,
  dteMax = 45
): SchwabOptionContract | null {
  const expMap = side === "CALL" ? chain.callExpDateMap : chain.putExpDateMap;
  const underlying = chain.underlyingPrice;
  const today = Date.now();

  let best: SchwabOptionContract | null = null;
  let bestDist = Infinity;

  for (const [expKey, strikes] of Object.entries(expMap)) {
    const expDate = new Date(expKey.split(":")[0]).getTime();
    const dte = (expDate - today) / (1000 * 60 * 60 * 24);
    if (dte < dteMin || dte > dteMax) continue;

    for (const [, contracts] of Object.entries(strikes)) {
      for (const contract of contracts) {
        if (!contract.symbol || contract.bid <= 0) continue;
        const dist = Math.abs(contract.strikePrice - underlying);
        if (dist < bestDist) {
          bestDist = dist;
          best = contract;
        }
      }
    }
  }

  return best;
}

export function selectOptionAtStrike(
  chain: SchwabOptionChain,
  side: "CALL" | "PUT",
  targetStrike: number,
  dteMin = 7,
  dteMax = 45
): SchwabOptionContract | null {
  const expMap = side === "CALL" ? chain.callExpDateMap : chain.putExpDateMap;
  const today = Date.now();

  let best: SchwabOptionContract | null = null;
  let bestDist = Infinity;

  for (const [expKey, strikes] of Object.entries(expMap)) {
    const expDate = new Date(expKey.split(":")[0]).getTime();
    const dte = (expDate - today) / (1000 * 60 * 60 * 24);
    if (dte < dteMin || dte > dteMax) continue;

    for (const [, contracts] of Object.entries(strikes)) {
      for (const contract of contracts) {
        if (!contract.symbol || contract.bid <= 0) continue;
        const dist = Math.abs(contract.strikePrice - targetStrike);
        if (dist < bestDist) {
          bestDist = dist;
          best = contract;
        }
      }
    }
  }

  return best;
}

export async function placeEquityOrder(
  botId: number,
  appKey: string,
  appSecret: string,
  accountHash: string,
  order: PlaceOrderRequest
): Promise<PlaceOrderResult> {
  if (!checkRateLimit(`orders-${botId}`, 60)) throw new Error("Rate limit exceeded");

  const token = await getValidAccessToken(botId, appKey, appSecret);

  const orderBody = {
    orderType: order.orderType,
    session: "NORMAL",
    duration: order.duration || "DAY",
    orderStrategyType: "SINGLE",
    orderLegCollection: [
      {
        instruction: order.side as string,
        quantity: order.quantity,
        instrument: {
          symbol: order.symbol,
          assetType: "EQUITY",
        },
      },
    ],
    ...(order.orderType === "LIMIT" && order.limitPrice ? { price: order.limitPrice } : {}),
  };

  const res = await schwabFetch(`${SCHWAB_TRADER_BASE}/accounts/${accountHash}/orders`, token, {
    method: "POST",
    body: JSON.stringify(orderBody),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to place equity order: ${res.status} - ${err}`);
  }

  const location = res.headers.get("Location") || "";
  const orderId = location.split("/").pop() || `sim-${Date.now()}`;

  return { orderId, status: "WORKING" };
}

export async function placeOptionsOrder(
  botId: number,
  appKey: string,
  appSecret: string,
  accountHash: string,
  legs: OptionsOrderLeg[],
  orderType: "MARKET" | "LIMIT" | "NET_DEBIT" | "NET_CREDIT" = "MARKET",
  limitPrice?: number,
  duration: "DAY" | "GOOD_TILL_CANCEL" = "DAY"
): Promise<PlaceOrderResult> {
  if (!checkRateLimit(`orders-${botId}`, 60)) throw new Error("Rate limit exceeded");

  const token = await getValidAccessToken(botId, appKey, appSecret);

  const orderBody = {
    orderType,
    session: "NORMAL",
    duration,
    orderStrategyType: "SINGLE",
    orderLegCollection: legs.map(leg => ({
      instruction: leg.instruction,
      quantity: leg.quantity,
      instrument: {
        symbol: leg.symbol,
        assetType: "OPTION",
      },
    })),
    ...(limitPrice != null ? { price: limitPrice } : {}),
  };

  const res = await schwabFetch(`${SCHWAB_TRADER_BASE}/accounts/${accountHash}/orders`, token, {
    method: "POST",
    body: JSON.stringify(orderBody),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to place options order: ${res.status} - ${err}`);
  }

  const location = res.headers.get("Location") || "";
  const orderId = location.split("/").pop() || `sim-opts-${Date.now()}`;

  return { orderId, status: "WORKING" };
}

export async function placeOrder(
  botId: number,
  appKey: string,
  appSecret: string,
  accountHash: string,
  order: PlaceOrderRequest
): Promise<PlaceOrderResult> {
  if (order.assetType === "OPTION" && order.optionLegs && order.optionLegs.length > 0) {
    return placeOptionsOrder(botId, appKey, appSecret, accountHash, order.optionLegs, order.orderType as "MARKET" | "LIMIT" | "NET_DEBIT" | "NET_CREDIT", order.limitPrice, order.duration);
  }
  return placeEquityOrder(botId, appKey, appSecret, accountHash, order);
}

export async function getOrders(
  botId: number,
  appKey: string,
  appSecret: string,
  accountHash: string
): Promise<Array<{ orderId: string; status: string; symbol: string; quantity: number; side: string }>> {
  if (!checkRateLimit(`get-orders-${botId}`, 120)) throw new Error("Rate limit exceeded");

  const token = await getValidAccessToken(botId, appKey, appSecret);
  const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const toDate = new Date().toISOString().split("T")[0];

  const res = await schwabFetch(
    `${SCHWAB_TRADER_BASE}/accounts/${accountHash}/orders?fromEnteredTime=${fromDate}&toEnteredTime=${toDate}`,
    token
  );

  if (!res.ok) throw new Error(`Failed to fetch orders: ${res.status}`);

  const data = await res.json() as Array<{
    orderId: string;
    status: string;
    orderLegCollection?: Array<{
      instruction: string;
      quantity: number;
      instrument: { symbol: string };
    }>;
  }>;

  return data.map(o => ({
    orderId: String(o.orderId),
    status: o.status,
    symbol: o.orderLegCollection?.[0]?.instrument?.symbol || "",
    quantity: o.orderLegCollection?.[0]?.quantity || 0,
    side: o.orderLegCollection?.[0]?.instruction || "",
  }));
}

export async function cancelOrder(
  botId: number,
  appKey: string,
  appSecret: string,
  accountHash: string,
  orderId: string
): Promise<void> {
  const token = await getValidAccessToken(botId, appKey, appSecret);
  const res = await schwabFetch(
    `${SCHWAB_TRADER_BASE}/accounts/${accountHash}/orders/${orderId}`,
    token,
    { method: "DELETE" }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to cancel order: ${res.status}`);
  }
}

export function isMarketOpen(): boolean {
  const now = new Date();
  const nyParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);

  const parts: Record<string, string> = {};
  for (const p of nyParts) parts[p.type] = p.value;

  const weekday = parts["weekday"];
  if (weekday === "Sat" || weekday === "Sun") return false;

  const hour = parseInt(parts["hour"] ?? "0", 10);
  const minute = parseInt(parts["minute"] ?? "0", 10);

  const afterOpen = hour > 9 || (hour === 9 && minute >= 30);
  const beforeClose = hour < 16;
  return afterOpen && beforeClose;
}
