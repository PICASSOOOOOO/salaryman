import { describe, expect, it } from "vitest";
import {
  findContractualHighlights,
  readRecordingWorkflowState,
  updateRecordingWorkflowState,
  validateRecordingExcerpts,
} from "../lib/recording-excerpts";

describe("recording workflow metadata", () => {
  it("preserves transcript sequence cursors when workflow metadata changes", () => {
    const original = JSON.stringify({
      "transcription-sid|inbound": 12,
      __recordingWorkflow: { emailSentAt: "2026-10-05T00:00:00.000Z" },
    });
    const updated = updateRecordingWorkflowState(original, {
      excerpts: [],
      contractHighlights: [],
    });

    expect(JSON.parse(updated)["transcription-sid|inbound"]).toBe(12);
    expect(readRecordingWorkflowState(updated).emailSentAt).toBe("2026-10-05T00:00:00.000Z");
    expect(readRecordingWorkflowState(updated).excerpts).toEqual([]);
  });

  it("suggests contractual passages without inventing audio timestamps", () => {
    const highlights = findContractualHighlights([
      "We agreed to the written terms and conditions for this service.",
      "The deposit is due after the invoice is received.",
      "Either party may cancel with thirty days notice.",
      "Please send the brochure when you have a chance.",
    ].join("\n"));

    expect(highlights.map(({ category }) => category)).toEqual(["agreement", "payment", "cancellation"]);
    expect(highlights.every((highlight) => !("startMs" in highlight))).toBe(true);
  });

  it("accepts user-confirmed ranges and rejects duplicates or ranges over ten minutes", () => {
    const now = new Date("2026-10-05T00:00:00.000Z");
    const valid = {
      id: "excerpt-1",
      label: "Payment terms",
      startMs: 1000,
      endMs: 61000,
      transcriptText: "The deposit is due next week.",
      createdAt: now.toISOString(),
    };

    expect(validateRecordingExcerpts([valid], 120, now)).toMatchObject([{
      id: "excerpt-1",
      label: "Payment terms",
      startMs: 1000,
      endMs: 61000,
      updatedAt: now.toISOString(),
    }]);
    expect(validateRecordingExcerpts([valid, valid], 120, now)).toBeNull();
    expect(validateRecordingExcerpts([{ ...valid, endMs: 601001 }], 700, now)).toBeNull();
    expect(validateRecordingExcerpts([{ ...valid, endMs: 121000 }], 120, now)).toBeNull();
  });
});
