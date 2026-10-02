import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  insertRows: [] as Array<Record<string, unknown>>,
  selectCount: 0,
  resolveCurrentOrgId: vi.fn(),
  canDoInOrg: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      ...actual.db,
      select: mocks.dbSelect,
      insert: mocks.dbInsert,
    },
  };
});

vi.mock("../lib/org-permissions", () => ({
  resolveCurrentOrgId: mocks.resolveCurrentOrgId,
  canDoInOrg: mocks.canDoInOrg,
}));

import {
  autoMapCrmImportHeaders,
  importPabloCrmFile,
  parseCrmImportBuffer,
} from "../lib/crm-lead-import";

describe("Pablo CRM file import", () => {
  beforeEach(() => {
    mocks.selectCount = 0;
    mocks.insertRows = [];
    mocks.resolveCurrentOrgId.mockReset().mockResolvedValue(41);
    mocks.canDoInOrg.mockReset().mockResolvedValue({ allowed: true });
    mocks.dbSelect.mockReset().mockImplementation(() => ({
      from: () => ({
        where: async () => {
          mocks.selectCount += 1;
          if (mocks.selectCount <= 2) return [];
          return [];
        },
      }),
    }));
    mocks.dbInsert.mockReset().mockImplementation(() => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          mocks.insertRows.push(values);
          return [{ id: 700 + mocks.insertRows.length, ...values }];
        },
      }),
    }));
  });

  it("parses CSV files and maps common headers plus configured custom fields", async () => {
    const parsed = await parseCrmImportBuffer(
      Buffer.from("Full Name,Email Address,Mobile,Segment,Unknown\nAda Lovelace,ada@example.test,+1 555 0100,Finance,private"),
      "contacts.csv",
    );
    expect(parsed).toEqual({
      headers: ["Full Name", "Email Address", "Mobile", "Segment", "Unknown"],
      rows: [["Ada Lovelace", "ada@example.test", "+1 555 0100", "Finance", "private"]],
    });
    expect(autoMapCrmImportHeaders(parsed.headers, [
      { fieldKey: "segment", label: "Customer Segment", fieldType: "text", required: false },
    ])).toEqual({
      "Full Name": "name",
      "Mobile": "phone",
      "Segment": "segment",
    });
  });

  it("imports recognized columns into only the current organization and skips duplicates", async () => {
    mocks.dbSelect.mockImplementation(() => ({
      from: () => ({
        where: async () => {
          mocks.selectCount += 1;
          if (mocks.selectCount <= 2) return [];
          return [];
        },
      }),
    }));
    mocks.dbInsert.mockImplementation(() => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          mocks.insertRows.push(values);
          return [{ id: 700 + mocks.insertRows.length, ...values }];
        },
      }),
    }));

    const result = await importPabloCrmFile({
      userId: "user-1",
      file: {
        originalname: "contacts.csv",
        buffer: Buffer.from("Name,Email,Extra\nAda,ada@example.test,x\nAda Again,ada@example.test,y"),
      },
    });

    expect(mocks.resolveCurrentOrgId).toHaveBeenCalledWith("user-1");
    expect(mocks.canDoInOrg).toHaveBeenCalledWith("user-1", 41, "crm.edit");
    expect(mocks.dbInsert).toHaveBeenCalledTimes(1);
    expect(mocks.insertRows[0]).toMatchObject({
      orgId: 41,
      createdByUserId: "user-1",
      source: "crm_import",
      name: "Ada",
      email: "ada@example.test",
    });
    expect(result).toMatchObject({
      rowsRead: 2,
      created: 1,
      skipped: 1,
      updated: 0,
      mappedColumns: { Name: "name", Email: "email" },
      ignoredColumns: ["Extra"],
    });
  });

  it("refuses the import before touching CRM data without edit permission", async () => {
    mocks.canDoInOrg.mockResolvedValue({ allowed: false });
    await expect(importPabloCrmFile({
      userId: "user-1",
      file: { originalname: "contacts.csv", buffer: Buffer.from("Name\nAda") },
    })).rejects.toThrow("CRM edit permission is required");
    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.dbInsert).not.toHaveBeenCalled();
  });
});