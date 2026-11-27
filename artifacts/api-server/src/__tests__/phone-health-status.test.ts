import { describe, expect, it } from "vitest";
import { classifyTollfreeVerificationStatus } from "../lib/phone-health-status";

describe("toll-free phone health status", () => {
  it("passes an approved sender", () => {
    expect(classifyTollfreeVerificationStatus("TWILIO_APPROVED")).toEqual({
      status: "PASS",
      detail: "Sender approved by Twilio",
    });
  });

  it("reports rejected SMS verification as a warning, not a health-check blocker", () => {
    const result = classifyTollfreeVerificationStatus(
      "TWILIO_REJECTED",
      "Invalid or Inaccessible Website URL",
    );

    expect(result.status).toBe("WARN");
    expect(result.detail).toContain("Invalid or Inaccessible Website URL");
    expect(result.detail).toContain("toll-free SMS may be unavailable");
  });

  it("keeps pending verification visible as a warning", () => {
    expect(classifyTollfreeVerificationStatus("IN_REVIEW").status).toBe("WARN");
  });

  it("continues to fail when no verification record exists", () => {
    expect(classifyTollfreeVerificationStatus(null)).toEqual({
      status: "FAIL",
      detail: "No toll-free verification record exists",
    });
  });

  it("continues to fail on unexpected verification states", () => {
    expect(classifyTollfreeVerificationStatus("SUSPENDED").status).toBe("FAIL");
  });
});
