import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.apiFetch }));

import ClassroomWritingReview from "./ClassroomWritingReview";

describe("ClassroomWritingReview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.apiFetch.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({
        findings: {
          potentialPatterns: ["Paragraphs follow a similar structure."],
          alternativeExplanations: ["The assignment template may encourage this structure."],
          conversationQuestions: ["How did you decide to organize your ideas?"],
        },
        limitations: ["Text style cannot determine authorship."],
        reviewedCharacters: 72,
        truncated: false,
      }),
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("opens a temporary review, shows qualified findings, then clears it on close", async () => {
    await act(async () => root.render(
      <ClassroomWritingReview classroomId={12} submissionId={34} canReview />,
    ));

    await act(async () => {
      container.querySelector("button")?.click();
      await Promise.resolve();
    });

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      "/api/education/classrooms/12/submissions/34/writing-review",
      expect.objectContaining({ method: "POST" }),
    );
    expect(container.textContent).toContain("Temporary review only");
    expect(container.textContent).toContain("Paragraphs follow a similar structure.");
    expect(container.textContent).toContain("NEUTRAL CONVERSATION QUESTIONS");
    expect(container.textContent).not.toContain("AI likelihood");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Close writing review"]')?.click();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).not.toContain("Paragraphs follow a similar structure.");
  });

  it("does not open or call the API for an ineligible submission", async () => {
    await act(async () => root.render(
      <ClassroomWritingReview classroomId={12} submissionId={34} canReview={false} />,
    ));

    expect(container.querySelector("button")?.disabled).toBe(true);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
});
