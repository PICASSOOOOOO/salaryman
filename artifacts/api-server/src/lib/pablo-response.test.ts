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

  it("accepts JSON wrapped in a markdown code fence", () => {
    expect(parsePabloCommandResponse('```json\n{"say":"I found your office.","action":null}\n```')).toEqual({
      say: "I found your office.",
      action: null,
    });
  });

  it("recovers a complete JSON reply surrounded by provider commentary", () => {
    expect(parsePabloCommandResponse('Here is the reply:\n{"say":"Opening your office.","action":{"kind":"navigate","path":"/office"}}\nDone.')).toEqual({
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

  it("still hides incomplete or non-JSON model output", () => {
    expect(parsePabloCommandResponse('{"say":"unfinished"')).toEqual({
      say: PABLO_COMMAND_RESPONSE_FALLBACK,
      action: null,
    });
    expect(parsePabloCommandResponse("```diff\n+ internal code changes\n```")).toEqual({
      say: PABLO_COMMAND_RESPONSE_FALLBACK,
      action: null,
    });
  });
});
