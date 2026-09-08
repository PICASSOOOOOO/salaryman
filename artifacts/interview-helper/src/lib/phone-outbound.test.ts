import { describe, expect, it, vi } from "vitest";
import { actionablePhoneError, reconcilePolledCalls, runOutboundBridge } from "./phone-outbound";

describe("runOutboundBridge", () => {
  it("does not create a PSTN leg until the browser device is ready", async () => {
    const order: string[] = [];
    await runOutboundBridge({
      ensureDeviceReady: async () => { order.push("ready"); },
      create: async () => { order.push("create"); return { callSid: "CA1", conferenceName: "conf-1" }; },
      getLegs: (created) => [created],
      connectToConference: async () => { order.push("join"); },
      cleanup: vi.fn(),
    });
    expect(order).toEqual(["ready", "create", "join"]);
  });

  it("never creates a PSTN leg when device registration fails", async () => {
    const create = vi.fn();
    await expect(runOutboundBridge({
      ensureDeviceReady: async () => { throw new Error("registration failed"); },
      create,
      getLegs: () => [],
      connectToConference: vi.fn(),
      cleanup: vi.fn(),
    })).rejects.toThrow(/offline/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("cleans up every created PSTN leg when the browser conference join fails", async () => {
    const cleanup = vi.fn(async () => {});
    await expect(runOutboundBridge({
      ensureDeviceReady: async () => {},
      create: async () => ({
        calls: [
          { callSid: "CA1", conferenceName: "conf-1" },
          { callSid: "CA2", conferenceName: "conf-2" },
        ],
      }),
      getLegs: (created) => created.calls,
      connectToConference: async () => { throw new Error("Microphone permission denied"); },
      cleanup,
    })).rejects.toThrow(/Microphone access is required/);
    expect(cleanup).toHaveBeenCalledWith(["CA1", "CA2"]);
  });

  it("joins every conference before returning a multi-leg batch", async () => {
    const joined: string[] = [];
    await runOutboundBridge({
      ensureDeviceReady: async () => {},
      create: async () => ({
        calls: [
          { callSid: "CA1", conferenceName: "conf-1" },
          { callSid: "CA2", conferenceName: "conf-2" },
        ],
      }),
      getLegs: (created) => created.calls,
      connectToConference: async (conference) => { joined.push(conference); },
      cleanup: vi.fn(),
    });
    expect(joined).toEqual(["conf-1", "conf-2"]);
  });

  it("explains token failures without creating a misleading active state", () => {
    expect(actionablePhoneError(new Error("token fetch 401"))).toMatch(/authenticate/i);
  });

  it("accepts a completed or skipped dialing-session response with no new leg", async () => {
    const result = await runOutboundBridge({
      ensureDeviceReady: async () => {},
      create: async () => ({ completed: true }),
      getLegs: () => [],
      connectToConference: vi.fn(),
      cleanup: vi.fn(),
      allowNoLegs: true,
    });
    expect(result).toEqual({ completed: true });
  });
});

describe("reconcilePolledCalls", () => {
  const calls = [{ callSid: "CA1", status: "ringing" }];

  it("retains live controls when a status lookup is missing or transiently fails", () => {
    expect(reconcilePolledCalls(calls, [], ["completed"])).toEqual(calls);
    expect(reconcilePolledCalls(calls, [{ callSid: "CA1", error: "Twilio timeout" }], ["completed"])).toEqual(calls);
  });

  it("removes a call only after an explicit terminal status", () => {
    expect(reconcilePolledCalls(calls, [{ callSid: "CA1", status: "completed" }], ["completed"])).toEqual([]);
  });
});