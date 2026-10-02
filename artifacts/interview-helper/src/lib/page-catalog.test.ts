import { describe, expect, it } from "vitest";
import { buildPageCatalog, searchCatalog } from "./page-catalog";

describe("Pablo navigation catalog", () => {
  it("includes phone pages and makes the CRM dialer searchable", () => {
    const catalog = buildPageCatalog();
    expect(catalog.some((page) => page.path === "/phone/dialer")).toBe(true);
    expect(catalog.some((page) => page.path === "/phone/voicemail")).toBe(true);
    expect(searchCatalog("CRM dialer").some((page) => page.path === "/phone/dialer")).toBe(true);
  });
});