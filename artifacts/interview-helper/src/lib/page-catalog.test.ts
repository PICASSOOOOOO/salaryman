import { describe, expect, it } from "vitest";
import { buildPageCatalog, searchCatalog } from "./page-catalog";

describe("Pablo navigation catalog", () => {
  it("includes phone pages and makes the CRM dialer searchable", () => {
    const catalog = buildPageCatalog();
    expect(catalog.some((page) => page.path === "/phone/dialer")).toBe(true);
    expect(catalog.some((page) => page.path === "/phone/voicemail")).toBe(true);
    expect(searchCatalog("CRM dialer").some((page) => page.path === "/phone/dialer")).toBe(true);
  });

  it("includes the new workspace tools and the reorganized product labels", () => {
    const catalog = new Map(buildPageCatalog().map((page) => [page.path, page]));
    expect(catalog.get("/workspace")).toMatchObject({ label: "The Office", group: "The Office" });
    expect(searchCatalog("notepad").some((page) => page.path === "/workspace/notepad")).toBe(true);
    expect(searchCatalog("calculator").some((page) => page.path === "/workspace/calculator")).toBe(true);
    expect(catalog.get("/creative/brand")?.group).toBe("Marketing");
    expect(catalog.get("/creative/media")?.label).toBe("Data vault");
    expect(catalog.get("/creative/classroom")?.label).toBe("Meeting room");
    expect(searchCatalog("stem player").some((page) => page.path === "/1999/stems")).toBe(true);
  });
});