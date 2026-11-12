import { createHash, randomBytes } from "node:crypto";
import { ORG_CONNECTOR_SCOPES, type OrgConnectorScope } from "@workspace/db";

export const ORG_CONNECTOR_SCOPE_LABELS: Record<OrgConnectorScope, string> = {
  "crm:read": "Read organization CRM data",
  "crm:write": "Create and update organization CRM data",
  "calls:read": "Read organization call activity",
  "calls:write": "Start organization call actions",
  "documents:read": "Read organization documents and files",
  "documents:write": "Create and update organization documents and files",
};

export function parseOrgConnectorScopes(value: unknown): OrgConnectorScope[] | null {
  if (!Array.isArray(value)) return null;
  const scopes = [...new Set(value)];
  if (scopes.some((scope) => typeof scope !== "string"
    || !(ORG_CONNECTOR_SCOPES as readonly string[]).includes(scope))) return null;
  return scopes as OrgConnectorScope[];
}

export function createOrgConnectorToken(): string {
  return `sma_live_${randomBytes(32).toString("hex")}`;
}

export function hashOrgConnectorToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hasOrgConnectorScope(
  scopes: readonly OrgConnectorScope[],
  required: OrgConnectorScope,
): boolean {
  return scopes.includes(required);
}
