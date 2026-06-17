import { createPaperAdapter } from "./paper-broker";

// Interactive Brokers' real API requires a locally-running Client Portal / TWS
// gateway with an authenticated session — there is no pure cloud REST key flow
// we can drive from the server. We therefore run IBKR in paper mode against the
// market-data layer; the catalog surfaces this limitation to the user.
export const ibkrAdapter = createPaperAdapter({
  broker: "ibkr",
  supportsOptions: true,
  startingBalanceMajor: 100_000,
});
