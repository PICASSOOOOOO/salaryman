import { describe, expect, it } from "vitest";
import {
  parsePabloCommandResponse,
  PABLO_COMMAND_RESPONSE_FALLBACK,
} from "./pablo-response";

describe("Pablo command response parsing", () => {
  it("does not expose raw model output when JSON parsing fails", () => {
    const raw = "```diff\n+ internal code changes\n```";

    const response = parsePabloCommandResponse(raw);

    expect(response).toEqual({
      say: PABLO_COMMAND_RESPONSE_FALLBACK,
      action: null,
    });
    expect(response.say).not.toContain("internal code changes");
  });

  it("preserves valid user-facing replies and their action for downstream checks", () => {
    expect(
      parsePabloCommandResponse(
        JSON.stringify({ say: "Opening your office.", action: { kind: "navigate", path: "/office" } }),
      ),
    ).toEqual({
      say: "Opening your office.",
      action: { kind: "navigate", path: "/office" },
    });
  });

  it("uses a neutral reply for valid JSON without a non-empty say field", () => {
    expect(parsePabloCommandResponse('{"action":null}')).toEqual({
      say: "I'm here.",
      action: null,
    });
  });
});
