import { describe, expect, it } from "vitest";
import { buildFollowUpTaskDraft } from "./review-items";

describe("follow-up task draft", () => {
  it("creates an internal task from the CRM summary without expanding its scope", () => {
    expect(buildFollowUpTaskDraft("Acme contact", "Asked for a proposal next week.")).toEqual({
      title: "Follow up with Acme contact after call",
      description: "Suggested from the completed CRM call.\n\nCall summary:\nAsked for a proposal next week.",
    });
  });

  it("cleans CRM text and bounds stored task fields", () => {
    const draft = buildFollowUpTaskDraft(`  Ada\n${"x".repeat(300)} `, "summary\u0000".repeat(2000));
    expect(draft.title).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(draft.title.length).toBeLessThanOrEqual(300);
    expect(draft.description).not.toContain("\u0000");
    expect(draft.description.length).toBeLessThan(6100);
  });
});
