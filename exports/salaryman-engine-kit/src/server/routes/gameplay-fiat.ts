import { Router, type Request, type Response } from "express";
import { bankTransactionsTable, db } from "@workspace/db";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { creditFiat, spendFiat } from "../lib/fiat-wallet";

const router = Router();

/** Fixed server-owned WorldPlay economy actions. Never accept a client amount. */
const GAMEPLAY_FIAT_ACTIONS_BASE = {
  data_vault: { direction: "credit", amountFiat: 400, kind: "world_reward", description: "Data Vault recovered transfer", once: true },
  supply_cache: { direction: "credit", amountFiat: 600, kind: "world_reward", description: "Supply Cache recovered FIAT", once: true },
  oxide_labs: { direction: "credit", amountFiat: 500, kind: "world_reward", description: "Oxide Labs drawer FIAT", once: true },
  bastion_keep: { direction: "credit", amountFiat: 2_000, kind: "world_reward", description: "Bastion Keep salvage credits", once: true },
  noodle_bar: { direction: "debit", amountFiat: 1_200, kind: "world_purchase", description: "Noodle Bar meal" },
  ttc: { direction: "debit", amountFiat: 5_000, kind: "world_purchase", description: "TTC encrypted call" },
  terminal_shop: { direction: "debit", amountFiat: 12_000, kind: "world_purchase", description: "Basic City passport" },
  clinic_repair: { direction: "debit", amountFiat: 5_000, kind: "world_purchase", description: "City Clinic device repair" },
  clinic_treatment: { direction: "debit", amountFiat: 10_000, kind: "world_purchase", description: "City Clinic treatment" },
  food_court: { direction: "debit", amountFiat: 4_000, kind: "world_purchase", description: "Food Court meal" },
  // WorldPlay's fixed interactions.  These values intentionally live on the
  // server even where a display copy remains in WorldPlay during migration.
  deep_camp_aid: { direction: "credit", amountFiat: 500, kind: "world_reward", description: "Deep Camp survivor aid" },
  office_terminal_rent: { direction: "debit", amountFiat: 50, kind: "world_purchase", description: "Public Office terminal rent" },
  checkpoint_fee: { direction: "debit", amountFiat: 2_000, kind: "world_fee", description: "Checkpoint passage fee" },
  subway_fare: { direction: "debit", amountFiat: 500, kind: "world_purchase", description: "Subway fare" },
  overlook_room: { direction: "debit", amountFiat: 8_000, kind: "world_purchase", description: "Pinnacle room 237" },
  dog_adoption: { direction: "debit", amountFiat: 2_000, kind: "world_purchase", description: "Dog adoption fee" },
  cat_adoption: { direction: "debit", amountFiat: 1_500, kind: "world_purchase", description: "Cat adoption fee" },
  story_dialogue_reward: { direction: "credit", amountFiat: 2_000, kind: "world_reward", description: "Story dialogue reward" },
  workstation_cycle: { direction: "credit", amountFiat: 500, kind: "world_reward", description: "Workstation job cycle" },
  quick_job_scrap: { direction: "credit", amountFiat: 3_500, kind: "world_job", description: "Haul Scrap pay" },
  quick_job_print_shop: { direction: "credit", amountFiat: 2_500, kind: "world_job", description: "Print Run pay" },
  quick_job_radio: { direction: "credit", amountFiat: 2_000, kind: "world_job", description: "Broadcast pay" },
  quick_job_oxide_labs: { direction: "credit", amountFiat: 6_000, kind: "world_job", description: "Assemble pay" },
  quick_job_market: { direction: "credit", amountFiat: 3_000, kind: "world_job", description: "Street Deal pay" },
  quick_job_public_office: { direction: "credit", amountFiat: 4_000, kind: "world_job", description: "Data Entry pay" },
  quick_job_data_vault: { direction: "credit", amountFiat: 5_500, kind: "world_job", description: "Decrypt Files pay" },
  quick_job_nexus_hub: { direction: "credit", amountFiat: 4_500, kind: "world_job", description: "Freelance Code pay" },
  quick_job_noodle_bar: { direction: "credit", amountFiat: 1_500, kind: "world_job", description: "Delivery Run pay" },
  quick_job_food_court: { direction: "credit", amountFiat: 1_800, kind: "world_job", description: "Serve Tables pay" },
  quick_job_nightclub: { direction: "credit", amountFiat: 3_500, kind: "world_job", description: "Bouncer Shift pay" },
  quick_job_pawn_shop: { direction: "credit", amountFiat: 2_800, kind: "world_job", description: "Appraise Goods pay" },
  city_tax_audit: { direction: "debit", amountFiat: 1_500, kind: "world_tax", description: "City tax audit" },
  mobility_tax: { direction: "debit", amountFiat: 500, kind: "world_tax", description: "Mobility tax" },
  found_stash: { direction: "credit", amountFiat: 50, kind: "world_reward", description: "Found FIAT stash" },
  dead_runner_cache: { direction: "credit", amountFiat: 80, kind: "world_reward", description: "Dead runner cache" },
  // Legacy WorldPlay encounters in the 5k–15k range.  The client sends only
  // these opaque action ids; it never supplies a price/reward.
  battle_reward: { direction: "credit", amountFiat: 500, kind: "world_reward", description: "Battle reward" },
  business_revenue: { direction: "credit", amountFiat: 500, kind: "world_revenue", description: "Business revenue" },
  workstation_rent: { direction: "debit", amountFiat: 50, kind: "world_rent", description: "Workstation rent" },
  pawn_shop_bonus: { direction: "credit", amountFiat: 3_000, kind: "world_reward", description: "Pawn shop sale" },
  ruins_alpha_loot: { direction: "credit", amountFiat: 300, kind: "world_reward", description: "Ruins Alpha loot" },
  world_message_reward: { direction: "credit", amountFiat: 100, kind: "world_reward", description: "World message reward" },
  world_secret_reward: { direction: "credit", amountFiat: 100, kind: "world_reward", description: "World secret reward" },
  combat_loot: { direction: "credit", amountFiat: 100, kind: "world_reward", description: "Combat loot" },
  combat_loot_small: { direction: "credit", amountFiat: 50, kind: "world_reward", description: "Small combat loot" },
  world_pickup: { direction: "credit", amountFiat: 100, kind: "world_reward", description: "World pickup" },
  loot_container: { direction: "credit", amountFiat: 100, kind: "world_reward", description: "Loot container" },
  merchant_sale: { direction: "credit", amountFiat: 100, kind: "world_sale", description: "Merchant sale" },
  cash_bill_payment: { direction: "debit", amountFiat: 500, kind: "world_bill", description: "Cash bill payment" },
  low_energy_fee: { direction: "debit", amountFiat: 500, kind: "world_fee", description: "Low energy fee" },
  tax_debt_payment: { direction: "debit", amountFiat: 500, kind: "world_tax", description: "Tax debt payment" },
  business_cycle_revenue: { direction: "credit", amountFiat: 500, kind: "world_revenue", description: "Business cycle revenue" },
  real_estate_revenue: { direction: "credit", amountFiat: 2_000, kind: "world_revenue", description: "Real estate revenue" },
  property_tax: { direction: "debit", amountFiat: 500, kind: "world_tax", description: "Property tax" },
  utility_bill: { direction: "debit", amountFiat: 500, kind: "world_bill", description: "Utility bill" },
  housing_rent: { direction: "debit", amountFiat: 500, kind: "world_rent", description: "Housing rent" },
  investment_dividend: { direction: "credit", amountFiat: 500, kind: "world_revenue", description: "Investment dividend" },
  world_penalty: { direction: "debit", amountFiat: 500, kind: "world_fee", description: "World penalty" },
  transaction_tax: { direction: "debit", amountFiat: 500, kind: "world_tax", description: "Transaction tax" },
  world_toll: { direction: "debit", amountFiat: 100, kind: "world_fee", description: "World toll" },
  world_vendor_fee: { direction: "debit", amountFiat: 100, kind: "world_fee", description: "World vendor fee" },
  world_tax: { direction: "debit", amountFiat: 100, kind: "world_tax", description: "World tax" },
  commodity_buy: { direction: "debit", amountFiat: 100, kind: "world_purchase", description: "Commodity purchase" },
  commodity_sell: { direction: "credit", amountFiat: 100, kind: "world_sale", description: "Commodity sale" },
  metered_usage_fee: { direction: "debit", amountFiat: 1, kind: "world_fee", description: "Metered terminal use" },
  millionaire_purchase: { direction: "debit", amountFiat: 500_000, kind: "world_purchase", description: "Premium world purchase" },
  arcade_fee: { direction: "debit", amountFiat: 100, kind: "world_purchase", description: "Arcade entry" },
  robbery_loss: { direction: "debit", amountFiat: 100, kind: "world_loss", description: "Robbery loss" },
  inventory_sale: { direction: "credit", amountFiat: 100, kind: "world_sale", description: "Inventory sale" },
  emergency_fee_partial: { direction: "debit", amountFiat: 100, kind: "world_fee", description: "Emergency partial fee" },
  emergency_fee: { direction: "debit", amountFiat: 100, kind: "world_fee", description: "Emergency fee" },
  housing_move: { direction: "debit", amountFiat: 500, kind: "world_rent", description: "Housing move-in" },
  business_registration: { direction: "debit", amountFiat: 5_000, kind: "world_purchase", description: "Business registration" },
  newspaper_purchase: { direction: "debit", amountFiat: 100, kind: "world_purchase", description: "The Minx newspaper" },
} as const;
export type GameplayFiatActionId = keyof typeof GAMEPLAY_FIAT_ACTIONS_BASE;

type ResolvedAction = {
  direction: "credit" | "debit";
  amountFiat: number;
  kind: string;
  description: string;
  once?: boolean;
};

/** Server copies of WorldPlay's variable-key catalogs.  Client display prices
 * are intentionally duplicated; only these values are used for settlement. */
export const WORLDPLAY_ITEM_PRICES: Readonly<Record<string, number>> = {
  power_pellet: 800, synth_ramen: 1200, recycled_water: 400, pablo_cola: 600,
  nutri_pack: 2000, stim_shot: 3500, med_kit: 6000, antidote: 4000,
  clean_water: 500, beer: 350, energy_drink: 900, power_cell: 2000,
  pablo_device: 5000, burner_phone: 1500, signal_jammer: 12000,
  netrunner_deck: 25000, holo_map: 5000, radio_implant: 20000,
  forged_basic: 8000, forged_full: 25000, forged_waste: 15000,
  fake_work_permit: 5000, identity_scrub: 20000,
  unlock_sword: 8000, unlock_gun: 15000, unlock_laser: 25000,
  unlock_bomb: 30000, hp_up: 10000, hp_up2: 20000, atk_boost: 18000,
  speed_boost: 12000, armor_plate: 22000,
};
export const WORLDPLAY_COSTUME_PRICES: Readonly<Record<string, number>> = {
  suit: 15000, pant_suit: 15000, business_casual: 9000, punk: 11000,
  rocker: 12000, goth: 12000, wasteland: 12000, cyberpunk: 18000,
  solarpunk: 16000,
};
export const WORLDPLAY_COMMODITY_PRICES = {
  stims: { cityBuy: 2400, citySell: 1200, wasteBuy: 8500, wasteSell: 5500 },
  rations: { cityBuy: 1500, citySell: 800, wasteBuy: 500, wasteSell: 3200 },
  scrap: { cityBuy: 900, citySell: 400, wasteBuy: 300, wasteSell: 1800 },
  power: { cityBuy: 3000, citySell: 1800, wasteBuy: 6200, wasteSell: 5000 },
  weapons: { cityBuy: 5200, citySell: 2500, wasteBuy: 2500, wasteSell: 8500 },
  data: { cityBuy: 8000, citySell: 4500, wasteBuy: 3000, wasteSell: 15000 },
  implants: { cityBuy: 12000, citySell: 6000, wasteBuy: 5000, wasteSell: 18000 },
  intel: { cityBuy: 10000, citySell: 7000, wasteBuy: 4000, wasteSell: 22000 },
} as const;
export const WORLDPLAY_OFFICE_PRICES: Readonly<Record<string, number>> = {
  hot_desk: 50, private_office: 200, team_suite: 500, exec_floor: 1500,
};

export type CreditClaimPolicy =
  | { type: "once" }
  | { type: "cooldown"; cooldownMs: number }
  | { type: "disabled" };

const QUICK_JOB_COOLDOWNS_MS: Readonly<Record<string, number>> = {
  quick_job_scrap: 30_000, quick_job_print_shop: 20_000, quick_job_radio: 15_000,
  quick_job_oxide_labs: 40_000, quick_job_market: 15_000,
  quick_job_public_office: 25_000, quick_job_data_vault: 35_000,
  quick_job_nexus_hub: 20_000, quick_job_noodle_bar: 10_000,
  quick_job_food_court: 10_000, quick_job_nightclub: 30_000,
  quick_job_pawn_shop: 15_000,
};
const DISABLED_UNVERIFIABLE_CREDITS = new Set([
  "battle_reward", "business_revenue", "world_message_reward", "combat_loot",
  "combat_loot_small", "world_pickup", "loot_container", "merchant_sale",
  "business_cycle_revenue", "real_estate_revenue", "investment_dividend",
  "inventory_sale", "workstation_cycle", "commodity_sell",
]);

export function creditClaimPolicy(actionId: string): CreditClaimPolicy {
  if (actionId.startsWith("quick_job_") || actionId.startsWith("world_commodity_") || actionId === "commodity_buy" || actionId === "commodity_sell") {
    return { type: "disabled" };
  }
  if (DISABLED_UNVERIFIABLE_CREDITS.has(actionId)) return { type: "disabled" };
  // A client-selected action id is not proof that a discovery, encounter, or
  // story reward occurred. Repeatable jobs and commodity sales use their
  // dedicated authoritative contracts; every remaining credit stays disabled
  // until its domain can issue a durable server-owned claim.
  return { type: "disabled" };
}

export function isCreditClaimBlocked(
  policy: Exclude<CreditClaimPolicy, { type: "disabled" }>,
  priorCreatedAt: Date | null,
  now = Date.now(),
): boolean {
  if (!priorCreatedAt) return false;
  return policy.type === "once" || now - priorCreatedAt.getTime() < policy.cooldownMs;
}

/** Public catalog includes the enforced claim policy as action metadata. */
export const GAMEPLAY_FIAT_ACTIONS = Object.fromEntries(
  Object.entries(GAMEPLAY_FIAT_ACTIONS_BASE).map(([actionId, action]) => [
    actionId,
    action.direction === "credit"
      ? { ...action, claimPolicy: creditClaimPolicy(actionId) }
      : action,
  ]),
) as Record<GameplayFiatActionId, (typeof GAMEPLAY_FIAT_ACTIONS_BASE)[GameplayFiatActionId] & { claimPolicy?: CreditClaimPolicy }>;

export function resolveGameplayFiatAction(actionId: string): ResolvedAction | null {
  const fixed = GAMEPLAY_FIAT_ACTIONS[actionId as GameplayFiatActionId];
  if (fixed) return fixed;
  if (actionId.startsWith("world_item_")) {
    const slug = actionId.slice("world_item_".length);
    const amountFiat = WORLDPLAY_ITEM_PRICES[slug];
    return amountFiat ? { direction: "debit", amountFiat, kind: "world_purchase", description: `World item ${slug}` } : null;
  }
  if (actionId.startsWith("world_costume_")) {
    const slug = actionId.slice("world_costume_".length);
    const amountFiat = WORLDPLAY_COSTUME_PRICES[slug];
    return amountFiat ? { direction: "debit", amountFiat, kind: "world_purchase", description: `World costume ${slug}` } : null;
  }
  if (actionId.startsWith("office_lease_")) {
    const slug = actionId.slice("office_lease_".length);
    const amountFiat = WORLDPLAY_OFFICE_PRICES[slug];
    return amountFiat ? { direction: "debit", amountFiat, kind: "world_rent", description: `Office lease ${slug}` } : null;
  }
  const match = /^world_commodity_(buy|sell)_(city|waste)_([a-z_]+)$/.exec(actionId);
  if (match) {
    const [, operation, location, slug] = match;
    const prices = WORLDPLAY_COMMODITY_PRICES[slug as keyof typeof WORLDPLAY_COMMODITY_PRICES];
    if (!prices) return null;
    const key = `${location}${operation === "buy" ? "Buy" : "Sell"}` as keyof typeof prices;
    return {
      direction: operation === "buy" ? "debit" : "credit",
      amountFiat: prices[key],
      kind: operation === "buy" ? "world_purchase" : "world_sale",
      description: `Commodity ${operation} ${location} ${slug}`,
    };
  }
  return null;
}

function authenticatedUser(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return req.user.id;
}

router.post("/gameplay/fiat/action", async (req: Request, res: Response) => {
  const userId = authenticatedUser(req, res);
  if (!userId) return;
  const actionId = typeof req.body?.actionId === "string" ? req.body.actionId : "";
  const resolved = resolveGameplayFiatAction(actionId);
  const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : "";
  if (!resolved) { res.status(400).json({ error: "Unknown gameplay FIAT action" }); return; }
  if (actionId.startsWith("quick_job_") || actionId.startsWith("world_commodity_") || actionId === "commodity_buy" || actionId === "commodity_sell") {
    res.status(409).json({ error: "action_requires_authoritative_world_contract" }); return;
  }
  const policy = resolved.direction === "credit" ? creditClaimPolicy(actionId) : null;
  if (policy?.type === "disabled") {
    res.status(409).json({ error: "reward_requires_authoritative_claim" }); return;
  }
  const action: ResolvedAction = {
    ...resolved,
    description: `${resolved.description} [gameplay:${actionId}]`,
  };
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) {
    res.status(400).json({ error: "A valid idempotencyKey is required" }); return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      // Location discoveries are one-time rewards, not a client-repeatable
      // mint. The idempotency-key replay is still allowed below.
      if (action.direction === "credit" && policy) {
        // Serialize every claim for the same user/action. Request-key
        // idempotency alone is insufficient because concurrent requests can use
        // different keys and otherwise all observe no prior action claim.
        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(
            hashtext(${userId}),
            hashtext(${`gameplay-credit:${actionId}`})
          )
        `);
        const exactDescription = `${action.description.slice(0, 150)} [request:${idempotencyKey}]`;
        const exact = await tx.select({ id: bankTransactionsTable.id }).from(bankTransactionsTable)
          .where(and(eq(bankTransactionsTable.userId, userId), eq(bankTransactionsTable.description, exactDescription))).limit(1);
        if (exact.length > 0) return creditFiat(tx, { userId, ...action, idempotencyKey });
        const prior = await tx.select({ id: bankTransactionsTable.id, createdAt: bankTransactionsTable.createdAt })
          .from(bankTransactionsTable)
          .where(and(eq(bankTransactionsTable.userId, userId), like(bankTransactionsTable.description, `${action.description.slice(0, 150)}%`)))
          .orderBy(desc(bankTransactionsTable.createdAt)).limit(1);
        if (isCreditClaimBlocked(
          policy,
          prior[0]?.createdAt ? new Date(prior[0].createdAt) : null,
        )) {
          return { ok: false as const, error: "Reward already claimed", spendable: 0 };
        }
      }
      return action.direction === "credit"
        ? creditFiat(tx, { userId, ...action, idempotencyKey })
        : spendFiat(tx, { userId, ...action, idempotencyKey });
    });
    if (!result.ok) {
      res.status(result.error === "Reward already claimed" ? 409 : 402)
        .json({ error: result.error === "Reward already claimed" ? "reward_already_claimed" : "insufficient_fiat", required: action.amountFiat, spendable: result.spendable });
      return;
    }
    res.json({ ok: true, actionId, direction: action.direction, amountFiat: action.amountFiat,
      newBalance: result.newBalance, spendable: result.spendable, duplicate: Boolean(result.duplicate) });
  } catch (error) {
    console.error("[gameplay-fiat] action failed:", error);
    res.status(500).json({ error: "Gameplay FIAT action failed" });
  }
});

export default router;