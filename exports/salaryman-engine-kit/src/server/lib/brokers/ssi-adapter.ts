import { createPaperAdapter } from "./paper-broker";

// SSI / VPS are the major Vietnamese retail brokers (HOSE/HNX). Their FastConnect
// APIs are partner-gated and not openly available, so we run them in paper mode
// against the market-data layer, priced in VND.
export const ssiAdapter = createPaperAdapter({
  broker: "ssi",
  supportsOptions: false,
  startingBalanceMajor: 500_000_000, // ~VND, roughly USD 20k
});
