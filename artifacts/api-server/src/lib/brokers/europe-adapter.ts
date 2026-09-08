import { createPaperAdapter } from "./paper-broker";

// Generic European venues (LSE, Euronext, Xetra). There is no single public
// retail trading API spanning these exchanges, so this runs in paper mode
// against the market-data layer, priced in the connection's currency (EUR/GBP).
export const europeAdapter = createPaperAdapter({
  broker: "europe",
  supportsOptions: false,
  startingBalanceMajor: 100_000,
});
