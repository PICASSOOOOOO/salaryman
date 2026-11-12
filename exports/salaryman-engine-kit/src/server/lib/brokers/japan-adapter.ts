import { createPaperAdapter } from "./paper-broker";

// Japanese retail brokers (Rakuten Securities, SBI Securities) do not expose a
// public programmatic trading API, so this runs in paper mode against the
// market-data layer, priced in JPY (TSE symbols).
export const japanAdapter = createPaperAdapter({
  broker: "japan",
  supportsOptions: false,
  startingBalanceMajor: 10_000_000, // ~JPY, roughly USD 65k
});
