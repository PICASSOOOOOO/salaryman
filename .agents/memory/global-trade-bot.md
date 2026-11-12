---
name: Global multi-broker trade bot
description: SALARYMAN Trade Bot expanded from Schwab-only to global multi-broker/multi-exchange with deep analysis; where the pieces live and the hard contracts.
---

# Global multi-broker / multi-exchange trade bot

The SALARYMAN Trade Bot is no longer Schwab-only. It is a broker-agnostic, multi-exchange,
currency-aware automated trading platform. Trading is owned by **claw-bot (Jean Claw)** in the
marketplace — there is NO separate "trade bot" slug.

## Architecture (api-server)
- Broker abstraction: `lib/brokers/` — `broker-types.ts` (every adapter normalizes into Schwab
  quote/candle shapes so the existing strategy/analysis pipeline works unchanged across regions),
  `broker-registry.ts` (getBrokerAdapter/hasBrokerAdapter), `broker-catalog.ts` (metadata: region,
  currency, markets, paperOnly, setupFields), `paper-broker.ts` (createPaperAdapter — simulated fills),
  `schwab-adapter.ts` + alpaca/ibkr/ssi/japan/europe adapters.
- Brokers: schwab (real OAuth, live), alpaca (real REST key+secret, live+paper), ibkr/ssi/japan/europe
  = **paper-only** (no public retail API / institutional gateway). VN = SSI (HOSE/HNX, VND).
- Market data: `lib/market-data/` — optional user-supplied encrypted key (polygon/twelvedata/finnhub),
  graceful degrade chain `user provider → broker-native → synthetic`. `resolveMarketDataProvider`
  short-circuits on empty userId (so paper fills are DB-free in tests).
- Analysis: `market-analysis.ts` (technicals 0.5 + fundamentals 0.25 + sentiment 0.25 lexicon, no dep
  + light macro) → SymbolAnalysis. Screener: `screener.ts` (volume_surge/momentum/breakout/oversold…).
- Currency: `currency.ts` (static FX, override via TRADING_FX_RATES env or setFxRates). Risk:
  trade-risk-manager `checkRiskCurrencyAware` + `convertPortfolioTotalUsd`.
- Multi-broker execution: `multi-broker-executor.ts` wired into thinkorswim-connector `[TRADING_SCAN]`
  BEFORE the legacy Schwab path; runs independently of any Schwab account.

## Hard contracts / gotchas
- **Cents convention is currency-agnostic: native major × 100** (NOT minor units). JPY/VND have
  minorUnits 1 but the DB still stores major×100. Use centsToMajor/majorToCents.
- Schwab stays its own dedicated table/OAuth flow; the multi-broker table is `botBrokerConnectionsTable`.
  The brokers-list route surfaces legacy Schwab as a synthetic entry `id:-1, legacy:true` so the UI
  renders one list — don't offer DISCONNECT on legacy.
- Catalog setupFields use `type: "text"|"password"` (NOT a `secret` boolean). Frontend input type and
  any test must key off `f.type === "password"`.
- analysis/screener routes are **POST** — a curl GET returns 404 (expected, not a missing route);
  POST without auth → 401.

## Frontend
- Trading Console UI lives in `artifacts/interview-helper/src/pages/BotFactory.tsx` (TradingConsole fn),
  NOT api-server. Tabs: dashboard/brokers/analysis/screener/strategies/trades/risk. Keep both the
  standard and boomer/cyberpunk (Share Tech Mono) styling on every new surface. `/api/*` proxies to
  api-server via apiFetch.
