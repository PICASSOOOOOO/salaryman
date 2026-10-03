---
name: Battery running-cost system
description: Batteries are the in-world wrapper for AI/electrical running cost; how AI metering settles via battery charge and where Pablo Tax still applies.
---

# Battery running-cost system

Batteries remain the in-world AI/electrical resource. AI consumers — bots, the
Pablo/Mila assistant, and non-human companions — run on installed, charged
batteries, and AI usage continues to burn battery charge sized to real provider
cost. The new Credits economy adds a separate, idempotent provider-usage charge
in Credits at the approved cost-derived rate; an AI action may consume both
resources. Do not treat the battery burn as payment of the Credits fee.

**Rule:** preserve the battery path through `lib/battery.ts` — `getPowerStatus`
(read-only preflight) then `burnAiCharge` (atomic burn + line item
`settledVia=battery`) — and charge provider-use Credits through its own
idempotent ledger path. Don't reintroduce `chargePabloTax` on AI call sites.

**Why:** the user explicitly wants provider-backed AI work to incur both the
existing in-game battery consumption and a separate shared Credits usage fee.

**How to apply:**
- Humans and owners are EXEMPT (owners recharge free; humans never metered).
- Call sites that meter AI: `chat.ts` (Pablo/Mila chat + image),
  `routes/nano-banana.ts` (sync + task), salaryman-saves portrait, autopilot
  `guardrails.ts`/`engine.ts` (bot battery preflight + flat per-action burn).
- Assistant battery auto-seeds **once** — `burnAiCharge` reports the assistant as
  powered when seedable, but only actually seeds when the caller passes
  `allowSeed:true`. All assistant call sites pass it. The seed flag lives on the
  pablo-tax meter as `assistantBatterySeeded`.
- Autopilot fallback is ALLOW-on-error (don't hard-fail bots on a metering error).
- `lib/nano-banana.ts` (the LIB) is intentionally NOT metered — metering lives in
  the route files that call it.

**Pablo Tax is now narrowed to property only:** `real-estate.ts` acquire charges
a one-time property purchase tax (5%, `chargePabloTax` kind `"tax"`) on `own`
tenure only — fire-and-forget, idempotent requestId. Don't expand Pablo Tax back
onto AI usage.

**Battery item mechanics (items.ts):**
- "assistant" is an install target (capacity 1) in INSTALL_TARGET_TYPES +
  resolveInstallTargets.
- Install sets a battery's `currentCharge` = full.
- Uninstall refunds the battery to the stack ONLY if full; a drained battery is
  discarded (no refund).
- Routes: GET `/items/battery/status`, POST `/items/battery/recharge` (owners
  free, otherwise records electricity utility revenue), `/swap` (discard old, no
  refund; install held full), `/sell` (50% refund, SELL_REFUND_PCT=0.5).
- Charge UI = `InstalledBatteryPanel` in UtilityStation.tsx, charge mode only;
  low-power threshold LOW_POWER_PCT, depleted at charge<=0.
