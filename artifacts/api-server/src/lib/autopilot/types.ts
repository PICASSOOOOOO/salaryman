import type { AutopilotConfig, AutopilotDomain, AutopilotOutcome, Bot } from "@workspace/db";

// ─── Autopilot handler contract ──────────────────────────────────────────────
// A domain handler is invoked by the scheduler ONCE per due tick for an org that
// has the domain enabled with a valid assigned bot. The four dependent tasks
// (Business Ops / Marketing / CRM & Calls / Accounting) each register a handler.
//
// CORE RULE: a handler must perform its work by calling the SAME service
// functions the manual screens call — never by re-implementing logic — so the
// manual and automatic paths can never diverge. See CONTRACT.md.

export interface AutopilotLogInput {
  /** Short machine-ish label, e.g. "publish_post", "reconcile", "tick". */
  action: string;
  /** Human-readable summary shown in the org's Autopilot Activity feed. */
  summary: string;
  outcome: AutopilotOutcome;
  detail?: Record<string, unknown>;
}

export interface AutopilotContext {
  orgId: number;
  domain: AutopilotDomain;
  config: AutopilotConfig;
  /** The assigned bot running this domain (already validated to belong to the org). */
  bot: Bot;
  /** Org owner — the account whose entitlement & API-credit balance gate paid work. */
  ownerId: string;
  ownerEmail: string | null;
  /** Per-tick action budget. Starts at the resolved cap and is decremented by recordAction. */
  maxActions: number;

  /** Append an entry to the org's Autopilot Activity log. Never throws. */
  log(input: AutopilotLogInput): Promise<void>;

  /**
   * Claim one unit of the per-tick action budget BEFORE performing a real
   * mutating action. Returns false (and logs a "blocked" entry) when the cap is
   * exhausted, so the handler should stop acting for this tick.
   */
  claimAction(): boolean;

  /**
   * Verify the org owner holds the given entitlement (default `claw_bot` /
   * PRIME) before a gated action (real publishing, paid AI). On failure it logs
   * a "blocked" entry and returns false. Call this for ANY action that, when
   * done manually, requires the same entitlement.
   */
  ensureEntitlement(feature?: "claw_bot"): Promise<boolean>;

  /**
   * Pablo-Tax / credit preflight before any PAID AI call. Mirrors the manual
   * `canUseApiFeatures` gate. On failure it logs "blocked" and returns false.
   */
  ensureCredit(): Promise<boolean>;
}

export type AutopilotHandler = (ctx: AutopilotContext) => Promise<void>;
