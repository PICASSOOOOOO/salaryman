import { describe, expect, it } from "vitest";
import { formatServerStoryContext, sanitizeNavPath } from "../routes/chat";
import { isPabloNavPath } from "../lib/pablo-navigation";

describe("Pablo grounded navigation safety", () => {
  it.each([
    "/api/users",
    "/API/users",
    "/phone",
    "/phone/dialer",
    "/%70hone",
    "//evil.example/path",
    "/safe/../phone",
  ])("rejects unsafe path %s", (path) => {
    expect(sanitizeNavPath(path)).toBeNull();
  });

  it("preserves safe real routes and query strings", () => {
    expect(sanitizeNavPath("/business/payroll?tab=runs")).toBe("/business/payroll?tab=runs");
    expect(sanitizeNavPath("/office")).toBe("/office");
  });

  it("requires server-owned route authority even when no client catalog is sent", () => {
    expect(sanitizeNavPath("/made-up-but-safe-looking")).toBe("/made-up-but-safe-looking");
    expect(isPabloNavPath("/made-up-but-safe-looking")).toBe(false);
    expect(isPabloNavPath("/recreation")).toBe(true);
    expect(isPabloNavPath("/world/play")).toBe(true);
    expect(isPabloNavPath("/business/announcements")).toBe(true);
    expect(isPabloNavPath("/creative/stems")).toBe(true);
  });
});

describe("Pablo server story grounding", () => {
  it("includes current scene and character identity without dumping arbitrary save data", () => {
    const context = formatServerStoryContext(2, {
      story: { active: true, currentScene: "camp-claim", quarter: 1, assignmentsCompleted: ["arrival"] },
      appearance: { name: "Rin", background: "analyst" },
      privateBlob: "must-not-escape",
    }, true);
    expect(context).toContain('"scene":"camp-claim"');
    expect(context).toContain('"playerName":"Rin"');
    expect(context).not.toContain("privateBlob");
    expect(context).not.toContain("must-not-escape");
  });

  it("omits identity in privacy mode and rejects nested story payloads", () => {
    const context = formatServerStoryContext(0, {
      story: {
        active: true,
        mission: { title: "nested private payload" },
        assignmentsCompleted: [{ secret: "nested private payload" }, "safe-beat"],
      },
      appearance: { name: "Private Name" },
    });
    expect(context).toContain("safe-beat");
    expect(context).not.toContain("nested private payload");
    expect(context).not.toContain("Private Name");
  });
});