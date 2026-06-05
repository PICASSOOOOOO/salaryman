// ─── Org permissions ─────────────────────────────────────────────────────────
// Server-authoritative enforcement of the per-org permission policy. Every
// "cross-use" of one member's data by another member inside an org goes through
// `canDoInOrg`: it resolves the caller's LIVE active membership + role and
// compares the role rank against the org's configured (or default) minRole for
// that permission key. The org owner always passes. Never trust a client flag.

import {
  db,
  orgPermissionsTable,
  orgMembersTable,
  organizationsTable,
  usersTable,
  ORG_PERMISSION_KEYS,
  DEFAULT_PERMISSION_MIN_ROLE,
  ORG_ROLE_HIERARCHY,
  hasRoleAccess,
  type OrgPermissionKey,
  type OrgRole,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

export type OrgPermissionPolicy = Record<OrgPermissionKey, OrgRole>;

/** The effective policy for an org: defaults overlaid with any customized rows. */
export async function getOrgPermissionPolicy(orgId: number): Promise<OrgPermissionPolicy> {
  const policy = { ...DEFAULT_PERMISSION_MIN_ROLE };
  const rows = await db
    .select({ permissionKey: orgPermissionsTable.permissionKey, minRole: orgPermissionsTable.minRole })
    .from(orgPermissionsTable)
    .where(eq(orgPermissionsTable.orgId, orgId));
  for (const r of rows) {
    if ((ORG_PERMISSION_KEYS as readonly string[]).includes(r.permissionKey) && r.minRole in ORG_ROLE_HIERARCHY) {
      policy[r.permissionKey as OrgPermissionKey] = r.minRole as OrgRole;
    }
  }
  return policy;
}

export interface OrgPermissionCheck {
  allowed: boolean;
  reason?: "not_member" | "insufficient_role";
  role?: OrgRole;
  minRole?: OrgRole;
  isOwner?: boolean;
}

/** Resolve the caller's active membership and decide a single permission. */
export async function canDoInOrg(userId: string, orgId: number, key: OrgPermissionKey): Promise<OrgPermissionCheck> {
  const [member] = await db
    .select({ role: orgMembersTable.role, status: orgMembersTable.status })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId)))
    .limit(1);

  const [org] = await db
    .select({ ownerUserId: organizationsTable.ownerUserId })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  const isOwner = org?.ownerUserId === userId;
  if (!member || member.status !== "active") {
    // The owner always retains access even if their member row is odd/missing.
    if (isOwner) return { allowed: true, role: "owner", isOwner: true };
    return { allowed: false, reason: "not_member" };
  }

  const role = (isOwner ? "owner" : member.role) as OrgRole;
  const policy = await getOrgPermissionPolicy(orgId);
  const minRole = policy[key];
  if (isOwner || hasRoleAccess(role, minRole)) {
    return { allowed: true, role, minRole, isOwner };
  }
  return { allowed: false, reason: "insufficient_role", role, minRole, isOwner };
}

/** Resolve which org a user is currently acting in (current_org_id, else first active membership). */
export async function resolveCurrentOrgId(userId: string): Promise<number | null> {
  const [u] = await db
    .select({ currentOrgId: usersTable.currentOrgId })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (u?.currentOrgId) {
    const n = Number(u.currentOrgId);
    if (Number.isFinite(n)) {
      const [m] = await db
        .select({ orgId: orgMembersTable.orgId })
        .from(orgMembersTable)
        .where(and(eq(orgMembersTable.orgId, n), eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
        .limit(1);
      if (m) return n;
    }
  }
  const [first] = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(1);
  return first?.orgId ?? null;
}

/** Active member userIds for an org (used to aggregate cross-user org data). */
export async function getActiveOrgMemberIds(orgId: number): Promise<string[]> {
  const rows = await db
    .select({ userId: orgMembersTable.userId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")));
  return rows.map((r) => r.userId);
}
