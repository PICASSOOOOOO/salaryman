import type { BrokerId } from "./broker-types";

export interface BrokerSetupField {
  key: string;        // stored (encrypted) credential key
  label: string;
  type: "text" | "password";
  placeholder?: string;
  required: boolean;
}

export interface BrokerCatalogEntry {
  id: BrokerId;
  name: string;
  region: string;
  description: string;
  defaultCurrency: string;
  supportedCurrencies: string[];
  markets: string[];          // exchange codes this broker reaches
  supportsLiveTrading: boolean;
  supportsOptions: boolean;
  paperOnly: boolean;         // true => no public trading API; paper simulation only
  authType: "oauth" | "api_key" | "none";
  setupFields: BrokerSetupField[];
  limitationNote?: string;
}

export const BROKER_CATALOG: Record<BrokerId, BrokerCatalogEntry> = {
  schwab: {
    id: "schwab",
    name: "Charles Schwab / thinkorswim",
    region: "United States",
    description: "Live US equities and options via the Schwab Trader API (OAuth).",
    defaultCurrency: "USD",
    supportedCurrencies: ["USD"],
    markets: ["NYSE", "NASDAQ"],
    supportsLiveTrading: true,
    supportsOptions: true,
    paperOnly: false,
    authType: "oauth",
    setupFields: [
      { key: "appKey", label: "App Key", type: "text", required: true },
      { key: "appSecret", label: "App Secret", type: "password", required: true },
    ],
  },
  alpaca: {
    id: "alpaca",
    name: "Alpaca",
    region: "United States",
    description: "Live or paper US equities via the Alpaca REST API (key + secret).",
    defaultCurrency: "USD",
    supportedCurrencies: ["USD"],
    markets: ["NYSE", "NASDAQ"],
    supportsLiveTrading: true,
    supportsOptions: false,
    paperOnly: false,
    authType: "api_key",
    setupFields: [
      { key: "apiKey", label: "API Key ID", type: "text", required: true },
      { key: "apiSecret", label: "API Secret Key", type: "password", required: true },
    ],
  },
  ibkr: {
    id: "ibkr",
    name: "Interactive Brokers",
    region: "Global",
    description: "Global multi-market access. Runs in paper mode here (IBKR requires a local gateway session).",
    defaultCurrency: "USD",
    supportedCurrencies: ["USD", "EUR", "GBP", "JPY", "HKD", "SGD", "AUD", "CAD"],
    markets: ["NYSE", "NASDAQ", "LSE", "XETRA", "EURONEXT", "TSE", "HKEX", "SGX"],
    supportsLiveTrading: false,
    supportsOptions: true,
    paperOnly: true,
    authType: "api_key",
    setupFields: [
      { key: "apiKey", label: "Account / Reference Label", type: "text", required: false },
    ],
    limitationNote: "IBKR has no pure cloud REST flow; this connection trades in paper mode against live market data.",
  },
  ssi: {
    id: "ssi",
    name: "SSI / VPS (Vietnam)",
    region: "Vietnam",
    description: "Vietnamese equities on HOSE/HNX. Paper mode (broker APIs are partner-gated).",
    defaultCurrency: "VND",
    supportedCurrencies: ["VND"],
    markets: ["HOSE", "HNX"],
    supportsLiveTrading: false,
    supportsOptions: false,
    paperOnly: true,
    authType: "api_key",
    setupFields: [
      { key: "apiKey", label: "Account / Reference Label", type: "text", required: false },
    ],
    limitationNote: "SSI/VPS FastConnect APIs are partner-gated; this connection trades in paper mode (VND).",
  },
  japan: {
    id: "japan",
    name: "Rakuten / SBI (Japan)",
    region: "Japan",
    description: "Japanese equities on the Tokyo Stock Exchange. Paper mode (no public trading API).",
    defaultCurrency: "JPY",
    supportedCurrencies: ["JPY"],
    markets: ["TSE"],
    supportsLiveTrading: false,
    supportsOptions: false,
    paperOnly: true,
    authType: "api_key",
    setupFields: [
      { key: "apiKey", label: "Account / Reference Label", type: "text", required: false },
    ],
    limitationNote: "Rakuten/SBI offer no public trading API; this connection trades in paper mode (JPY).",
  },
  europe: {
    id: "europe",
    name: "European Venues (LSE / Euronext / Xetra)",
    region: "Europe",
    description: "European equities across LSE, Euronext and Xetra. Paper mode (no unified retail API).",
    defaultCurrency: "EUR",
    supportedCurrencies: ["EUR", "GBP"],
    markets: ["LSE", "EURONEXT", "XETRA"],
    supportsLiveTrading: false,
    supportsOptions: false,
    paperOnly: true,
    authType: "api_key",
    setupFields: [
      { key: "apiKey", label: "Account / Reference Label", type: "text", required: false },
    ],
    limitationNote: "No single public retail API spans these venues; this connection trades in paper mode (EUR/GBP).",
  },
};

export function getBrokerCatalogEntry(broker: BrokerId): BrokerCatalogEntry {
  return BROKER_CATALOG[broker];
}

export function listBrokerCatalog(): BrokerCatalogEntry[] {
  return Object.values(BROKER_CATALOG);
}
