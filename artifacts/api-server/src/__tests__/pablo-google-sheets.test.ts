import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
  queryRows: [] as any[],
  lastWhere: null as any,
  canDoInOrg: vi.fn(),
  resolveCurrentOrgId: vi.fn(),
  safeFetch: vi.fn(),
  decryptProtectedRecord: vi.fn(),
  encryptProtectedRecord: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: { ...actual.db, select: mocks.dbSelect, update: mocks.dbUpdate } };
});
vi.mock("../lib/org-permissions", () => ({
  canDoInOrg: mocks.canDoInOrg,
  resolveCurrentOrgId: mocks.resolveCurrentOrgId,
}));
vi.mock("../lib/org-protected-records-crypto", () => ({
  decryptProtectedRecord: mocks.decryptProtectedRecord,
  encryptProtectedRecord: mocks.encryptProtectedRecord,
}));
vi.mock("../lib/site-proxy", () => ({ safeFetch: mocks.safeFetch }));

import {
  getPabloSheetsAccess,
  findExactSheetRow,
  listPabloSheetSources,
  readPabloSheet,
  writePabloSheet,
} from "../lib/pablo-google-sheets";

const access = { orgId: 41, canView: true, canEdit: true };
const source = {
  id: 7,
  orgId: 41,
  provider: "google_sheets",
  name: "Contacts",
  enabled: "true",
  encryptedAuth: "encrypted-token",
  configJson: {
    spreadsheetId: "configured_sheet_id",
    range: "Contacts!B4:C",
    mapping: { email: "Email", name: "Name" },
  },
};

function jsonResponse(data: unknown, status = 200) {
  return { status, body: Buffer.from(JSON.stringify(data)) };
}

describe("Pablo Google Sheets access", () => {
  beforeEach(() => {
    process.env.GOOGLE_SHEETS_CLIENT_ID = "pablo-sheets-test-client";
    process.env.GOOGLE_SHEETS_CLIENT_SECRET = "pablo-sheets-test-secret";
    mocks.queryRows = [];
    mocks.lastWhere = null;
    mocks.dbSelect.mockReset().mockImplementation(() => ({
      from: () => ({
        where: (condition: unknown) => {
          mocks.lastWhere = condition;
          return Promise.resolve(mocks.queryRows);
        },
      }),
    }));
    mocks.dbUpdate.mockReset().mockImplementation(() => ({
      set: () => ({ where: () => Promise.resolve([]) }),
    }));
    mocks.canDoInOrg.mockReset().mockImplementation(async (_userId: string, _orgId: number, _permission: string) => ({ allowed: true }));
    mocks.resolveCurrentOrgId.mockReset().mockResolvedValue(41);
    mocks.safeFetch.mockReset().mockResolvedValue(jsonResponse({ values: [] }));
    mocks.decryptProtectedRecord.mockReset().mockReturnValue(JSON.stringify({ access_token: "test-access-token" }));
    mocks.encryptProtectedRecord.mockReset().mockReturnValue("refreshed-encrypted-token");
  });

  afterAll(() => {
    delete process.env.GOOGLE_SHEETS_CLIENT_ID;
    delete process.env.GOOGLE_SHEETS_CLIENT_SECRET;
  });

  it("resolves the current organization and its configured CRM permissions", async () => {
    mocks.resolveCurrentOrgId.mockResolvedValueOnce(null);
    expect(await getPabloSheetsAccess("user-1")).toBeNull();
    expect(mocks.canDoInOrg).not.toHaveBeenCalled();

    mocks.canDoInOrg.mockImplementation(async (_userId: string, _orgId: number, permission: string) => ({
      allowed: permission === "crm.edit",
    }));
    await expect(getPabloSheetsAccess("user-1")).resolves.toEqual({
      orgId: 41,
      canView: false,
      canEdit: true,
    });
    expect(mocks.canDoInOrg).toHaveBeenCalledWith("user-1", 41, "crm.view");
    expect(mocks.canDoInOrg).toHaveBeenCalledWith("user-1", 41, "crm.edit");
  });

  it("blocks reads without CRM view permission before making a provider request", async () => {
    await expect(readPabloSheet({ ...access, canView: false }, 7)).rejects.toThrow("CRM view permission required");
    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it("only reads an org-configured source and caps returned rows", async () => {
    mocks.queryRows = [source];
    mocks.safeFetch.mockResolvedValueOnce(jsonResponse({
      values: [["Email", "Name"], ...Array.from({ length: 150 }, (_, i) => [`person${i}@example.test`, `Person ${i}`])],
    }));

    const result = await readPabloSheet(access, 7, 3);
    expect(result.rows).toHaveLength(3);
    expect(mocks.lastWhere).toBeTruthy();
    expect(decodeURIComponent(mocks.safeFetch.mock.calls[0][0])).toContain("/spreadsheets/configured_sheet_id/values/Contacts!B4:C");

    mocks.queryRows = [];
    mocks.safeFetch.mockReset();
    await expect(readPabloSheet(access, 999, 3)).rejects.toThrow("Enabled Google Sheets source not found");
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it("lists only enabled Sheets sources and requires CRM view permission", async () => {
    mocks.queryRows = [
      source,
      { ...source, id: 8, enabled: "false", name: "Disabled" },
    ];
    await expect(listPabloSheetSources(access)).resolves.toEqual([
      { sourceId: 7, name: "Contacts", range: "Contacts!B4:C" },
    ]);
    await expect(listPabloSheetSources({ ...access, canView: false })).rejects.toThrow("CRM view permission required");
  });

  it("appends one bounded row only with view and edit permission", async () => {
    mocks.queryRows = [source];
    mocks.safeFetch
      .mockResolvedValueOnce(jsonResponse({ values: [["Email", "Name"]] }))
      .mockResolvedValueOnce(jsonResponse({ updates: { updatedRows: 1 } }));

    await expect(writePabloSheet(access, {
      sourceId: 7,
      operation: "append",
      values: { Email: "new@example.test", Name: "Ada" },
    })).resolves.toMatchObject({ operation: "append", written: 1 });
    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
    expect(mocks.safeFetch.mock.calls[1][1]).toMatchObject({ method: "POST" });
    expect(mocks.safeFetch.mock.calls[1][1].body).toContain("new@example.test");

    mocks.safeFetch.mockReset();
    await expect(writePabloSheet({ ...access, canEdit: false }, {
      sourceId: 7,
      operation: "append",
      values: { Email: "new@example.test" },
    })).rejects.toThrow("CRM view and edit permissions required");
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it("updates exactly one key match while preserving omitted cells and range offsets", async () => {
    const longUnchangedCell = "x".repeat(2501);
    mocks.queryRows = [{
      ...source,
      configJson: {
        ...source.configJson,
        range: "Contacts!B4:D",
        mapping: { email: "Email", name: "Name", notes: "Notes" },
      },
    }];
    mocks.safeFetch
      .mockResolvedValueOnce(jsonResponse({
        values: [["Email", "Name", "Notes"], ["ada@example.test", "Old name", longUnchangedCell]],
      }))
      .mockResolvedValueOnce(jsonResponse({ totalUpdatedRows: 1 }));

    await expect(writePabloSheet(access, {
      sourceId: 7,
      operation: "update",
      keyField: "email",
      keyValue: "ada@example.test",
      values: { Name: "New name" },
    })).resolves.toMatchObject({ operation: "update", written: 1 });

    const [url, options] = mocks.safeFetch.mock.calls[1];
    expect(decodeURIComponent(url)).toContain("/values/Contacts!B5:D5?valueInputOption=RAW");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body).values).toEqual([["ada@example.test", "New name", longUnchangedCell]]);
  });

  it("refuses ambiguous key updates and never sends a write request", async () => {
    mocks.queryRows = [source];
    mocks.safeFetch.mockResolvedValueOnce(jsonResponse({
      values: [["Email", "Name"], ["ada@example.test", "A"], ["ada@example.test", "B"]],
    }));

    await expect(writePabloSheet(access, {
      sourceId: 7,
      operation: "update",
      keyField: "email",
      keyValue: "ada@example.test",
      values: { Name: "Changed" },
    })).rejects.toThrow("Update key matched multiple rows; no changes made");
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("returns safe actionable provider errors without forwarding response bodies", async () => {
    mocks.queryRows = [source];
    mocks.safeFetch.mockResolvedValueOnce(jsonResponse({
      error: { message: "provider-private-detail", token: "provider-private-token" },
    }, 403));

    let errorText = "";
    try {
      await readPabloSheet(access, 7);
    } catch (error) {
      errorText = String(error);
    }
    expect(errorText).toContain("Google denied access");
    expect(errorText).not.toContain("provider-private-detail");
    expect(errorText).not.toContain("provider-private-token");
  });

  it("rejects partial-key matches", () => {
    expect(findExactSheetRow([["ada@example.test"]], 0, "ada@example.test.evil")).toBeNull();
  });
});