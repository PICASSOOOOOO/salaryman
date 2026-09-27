import { describe, expect, it } from "vitest";
import { isPabloRequestId, safePabloErrorFields } from "../lib/pablo-chat-diagnostics";

describe("Pablo chat diagnostics", () => {
  it("accepts UUID v4 request IDs and rejects arbitrary header text", () => {
    expect(isPabloRequestId("c94b9e61-3b6b-4ea4-824a-7c41869aee12")).toBe(true);
    expect(isPabloRequestId("invalid\r\nx-log-injection: yes")).toBe(false);
    expect(isPabloRequestId(["c94b9e61-3b6b-4ea4-824a-7c41869aee12"])).toBe(false);
  });

  it("keeps only safe error metadata and never includes the raw error message", () => {
    const error = Object.assign(
      new Error("private transcript and user@example.com"),
      { code: "ECONNRESET", status: 503 },
    );

    const fields = safePabloErrorFields(error);

    expect(fields).toEqual({
      errorName: "Error",
      errorCode: "ECONNRESET",
      upstreamStatus: 503,
    });
    expect(JSON.stringify(fields)).not.toContain("private transcript");
    expect(JSON.stringify(fields)).not.toContain("user@example.com");
  });

  it("drops unsafe codes, malformed names, and out-of-range statuses", () => {
    const error = Object.assign(new Error("do not log"), {
      name: "transcript with spaces",
      code: "user@example.com",
      status: 999,
    });

    expect(safePabloErrorFields(error)).toEqual({ errorName: "Error" });
  });
});