/**
 * Shared identity, brand hierarchy, and explicit access checks for NPC actions.
 *
 * This module deliberately does not execute integrations. Callers must authorize
 * the exact actor, action, resource, and requested data scope before dispatching
 * any real-system operation.
 */

export type AgentKind = "human" | "npc";

export interface AgentIdentity {
  id: string;
  kind: AgentKind;
}

export interface BrandFaction {
  id: string;
  name: string;
}

export interface ShopLocationBoss {
  id: string;
  name: string;
  brandId: string;
  shopId: string;
  locationId: string;
  netWorthFiat: number;
}

export interface LoyaltyTarget {
  level: "shop" | "brand";
  id: string;
}

/**
 * Every branch boss prioritizes their own shop, then the shared brand faction.
 * A multi-location brand therefore shares one faction while retaining one boss
 * identity per location.
 */
export function loyaltyOrderForBoss(boss: ShopLocationBoss): LoyaltyTarget[] {
  return [
    { level: "shop", id: boss.shopId },
    { level: "brand", id: boss.brandId },
  ];
}

export interface ExplicitActionGrant {
  actor: AgentIdentity;
  action: string;
  resourceId: string;
  dataScopes: readonly string[];
  expiresAt?: number;
  revokedAt?: number;
}

export interface AgentActionRequest {
  actor: AgentIdentity;
  action: string;
  resourceId: string;
  dataScope?: string;
}

/**
 * Human and NPC actions follow the same permission rule. No actor, resource,
 * operation, or data scope is implicitly authorized.
 */
export function hasExplicitActionAccess(
  request: AgentActionRequest,
  grants: readonly ExplicitActionGrant[],
  now = Date.now(),
): boolean {
  return grants.some((grant) => {
    if (
      grant.actor.id !== request.actor.id ||
      grant.actor.kind !== request.actor.kind ||
      grant.action !== request.action ||
      grant.resourceId !== request.resourceId ||
      grant.revokedAt !== undefined ||
      (grant.expiresAt !== undefined && grant.expiresAt <= now)
    ) {
      return false;
    }
    return request.dataScope === undefined || grant.dataScopes.includes(request.dataScope);
  });
}
