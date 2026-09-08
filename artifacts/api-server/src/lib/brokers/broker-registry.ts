import type { BrokerAdapter, BrokerId } from "./broker-types";
import { schwabAdapter } from "./schwab-adapter";
import { alpacaAdapter } from "./alpaca-adapter";
import { ibkrAdapter } from "./ibkr-adapter";
import { ssiAdapter } from "./ssi-adapter";
import { japanAdapter } from "./japan-adapter";
import { europeAdapter } from "./europe-adapter";

const REGISTRY: Record<BrokerId, BrokerAdapter> = {
  schwab: schwabAdapter,
  alpaca: alpacaAdapter,
  ibkr: ibkrAdapter,
  ssi: ssiAdapter,
  japan: japanAdapter,
  europe: europeAdapter,
};

export function getBrokerAdapter(broker: BrokerId): BrokerAdapter {
  const adapter = REGISTRY[broker];
  if (!adapter) throw new Error(`Unknown broker: ${broker}`);
  return adapter;
}

export function hasBrokerAdapter(broker: string): broker is BrokerId {
  return broker in REGISTRY;
}

export function listBrokerAdapters(): BrokerAdapter[] {
  return Object.values(REGISTRY);
}
