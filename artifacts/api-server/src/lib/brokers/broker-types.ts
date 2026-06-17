import type {
  SchwabQuote,
  SchwabCandle,
  SchwabOptionChain,
  PlaceOrderRequest,
} from "../schwab-api";
import type { BrokerId } from "@workspace/db";

export type { BrokerId };

// The canonical market-data shapes are the Schwab ones — every broker adapter
// normalizes into these so the existing strategy/analysis pipeline works
// unchanged across regions.
export type BrokerQuote = SchwabQuote;
export type BrokerCandle = SchwabCandle;
export type BrokerOptionChain = SchwabOptionChain;
export type BrokerOrderRequest = PlaceOrderRequest;

export interface BrokerPosition {
  symbol: string;
  quantity: number;
  // Native minor-unit × 100 (cents convention) in the account currency.
  marketValue: number;
  averagePrice: number;
  unrealizedPnl: number;
  assetType: string;
}

export interface BrokerAccountSnapshot {
  accountIdentifier: string;
  currency: string;
  // Native minor-unit × 100 (cents convention).
  cashBalance: number;
  equity: number;
  positions: BrokerPosition[];
}

export interface BrokerOrderResult {
  orderId: string;
  status: string;
  // Price the order is expected/known to fill at, in major units of the
  // account currency (e.g. dollars, yen). Useful for paper simulation.
  fillPrice?: number;
}

export interface BrokerOrderStatus {
  orderId: string;
  status: string;
  filledQuantity: number;
}

// Runtime context handed to an adapter for a single broker connection. The
// route/connector layer decrypts credentials and resolves the access token
// before calling the adapter, so adapters never touch the DB or crypto.
export interface BrokerConnectionContext {
  botId: number;
  connectionId: number;
  userId: string;
  isPaperMode: boolean;
  currency: string;
  accountIdentifier?: string | null;
  // Decrypted credential bag (apiKey/apiSecret/appKey/appSecret/...).
  credentials: Record<string, string>;
  // OAuth brokers expose a token accessor that handles refresh upstream.
  getAccessToken?: () => Promise<string>;
}

export interface BrokerAdapter {
  broker: BrokerId;
  // false => no public trading API available here; adapter is paper-only.
  supportsLiveTrading: boolean;
  supportsOptions: boolean;
  authType: "oauth" | "api_key" | "none";

  getAccount(ctx: BrokerConnectionContext): Promise<BrokerAccountSnapshot>;
  getQuotes(ctx: BrokerConnectionContext, symbols: string[]): Promise<Record<string, BrokerQuote>>;
  getPriceHistory(ctx: BrokerConnectionContext, symbol: string): Promise<BrokerCandle[]>;
  getOptionChain?(ctx: BrokerConnectionContext, symbol: string, strikeCount?: number): Promise<BrokerOptionChain>;
  placeOrder(ctx: BrokerConnectionContext, order: BrokerOrderRequest): Promise<BrokerOrderResult>;
  getOrderStatus(ctx: BrokerConnectionContext, orderId: string): Promise<BrokerOrderStatus>;
  cancelOrder(ctx: BrokerConnectionContext, orderId: string): Promise<void>;
}
