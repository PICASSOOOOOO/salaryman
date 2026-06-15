# Autopilot shared-service contract

This is the foundation the four domain autopilots build on: **Business Ops,
Marketing, CRM & Calls, Accounting**. Read this before implementing a domain
handler.

## The one rule that matters

> An autopilot handler MUST do its work by calling the **same service functions
> the manual screens call** — never by re-implementing the logic inline.

That is what guarantees the task's hard constraint: *everything a bot does
automatically remains doable by a human, and turning autopilot OFF returns the
domain to manual-only with no data divergence.* If a manual route still has its
logic inlined in the Express handler, extract it into a callable service function
first, then have BOTH the route and the autopilot handler call that function.

## How a domain handler is wired

1. Implement an `AutopilotHandler` (see `types.ts`): `async (ctx) => { ... }`.
2. Register it at server boot, before/around `startAutopilotScheduler()`:

   ```ts
   import { registerAutopilotHandler } from "./lib/autopilot";
   registerAutopilotHandler("marketing", marketingAutopilotHandler);
   ```

3. The scheduler invokes your handler once per due tick for each org that has the
   domain **enabled** with a **valid assigned bot**. You do not schedule anything
   yourself — there is ONE scheduler.

## What the engine has already done before your handler runs

- Confirmed the domain is enabled and a bot is assigned.
- Resolved and validated the bot belongs to the org (`ctx.bot`).
- Resolved the org owner (`ctx.ownerId` / `ctx.ownerEmail`) — the account whose
  entitlement and API-credit balance gate paid work.
- Computed the per-tick action cap (`ctx.maxActions`).
- Stamped `lastRunAt` so a slow/failing run won't double-fire next tick.

## What your handler MUST do for every action

Use the `ctx` helpers — they centralize the guardrails and record blocks to the
activity log instead of erroring:

- `ctx.claimAction()` — call BEFORE each mutating action. Returns `false` (and
  logs a block) when the per-tick cap is exhausted; stop acting when it does.
- `await ctx.ensureEntitlement()` — call before any action that, done manually,
  requires PRIME / `claw_bot` (real publishing, paid AI). Returns `false` + logs
  a block on failure.
- `await ctx.ensureCredit()` — call before any **paid AI** call (mirrors the
  manual `canUseApiFeatures` preflight). Returns `false` + logs a block.
- `await ctx.log({ action, summary, outcome, detail })` — record what you did so
  the org's Autopilot Activity feed shows it. Use `outcome: "success"` for real
  actions, `"noop"` when there was nothing to do.

## Money / external-call rules (unchanged from the rest of api-server)

- Money/credit-touching actions reuse the existing atomic patterns (advisory
  locks / single transaction) of the underlying service function — do not invent
  new ones in the handler.
- Outbound third-party calls must use abort-signal timeouts.

## Config & activity surfaces (already built)

- Config CRUD: `lib/autopilot/config.ts` (`getOrgAutopilotView`, `upsertDomainConfig`).
- Activity log: `lib/autopilot/activity.ts` (`recordAutopilotActivity`,
  `getRecentAutopilotActivity`).
- HTTP: `routes/autopilot.ts` (`GET /api/autopilot`, `PUT /api/autopilot/:domain`),
  owner/manager-gated via the `autopilot.manage` org permission.
- UI shell: the web app's Autopilot panel (`/business/autopilot`).
