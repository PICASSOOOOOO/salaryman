import { describe, expect, it } from "vitest";
import {
  createOrgConnectorToken,
  hasOrgConnectorScope,
  hashOrgConnectorToken,
  parseOrgConnectorScopes,
} from "./org-connectors";

describe("organization connector credentials", () => {
  it("deduplicates and rejects unregistered scopes", () => {
    expect(parseOrgConnectorScopes(["crm:read", "crm:read"])).toEqual(["crm:read"]);
    expect(parseOrgConnectorScopes(["crm:read", "admin:*"])).toBeNull();
    expect(parseOrgConnectorScopes("crm:read")).toBeNull();
  });

  it("creates opaque high-entropy tokens and stores only a one-way hash", () => {
    const token = createOrgConnectorToken();
    expect(token).toMatch(/^sma_live_[a-f0-9]{64}$/);
    expect(hashOrgConnectorToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOrgConnectorToken(token)).not.toBe(token);
  });

  it("allows only explicitly granted scopes", () => {
    expect(hasOrgConnectorScope(["crm:read"], "crm:read")).toBe(true);
    expect(hasOrgConnectorScope(["crm:read"], "crm:write")).toBe(false);
  });
});
