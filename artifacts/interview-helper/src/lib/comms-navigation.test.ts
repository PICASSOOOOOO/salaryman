import { beforeEach, describe, expect, it } from "vitest";
import {
  queuePendingCommsDmUserId,
  takePendingCommsDmUserId,
} from "./comms-navigation";

describe("pending COMMS direct-message navigation", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("preserves and consumes a target user across route navigation", () => {
    queuePendingCommsDmUserId("  target-user  ");

    expect(takePendingCommsDmUserId()).toBe("target-user");
    expect(takePendingCommsDmUserId()).toBeUndefined();
  });

  it("ignores blank user identifiers", () => {
    queuePendingCommsDmUserId("   ");

    expect(takePendingCommsDmUserId()).toBeUndefined();
  });
});
