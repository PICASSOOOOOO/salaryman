import { describe, it, expect } from "vitest";
import { computeAuth, sha256Base64, formatTimecode } from "./obs-websocket";

// The OBS WebSocket v5 auth handshake is the trickiest part of the client: the
// server only accepts a connection when we echo back
// sha256(base64(sha256(password + salt)) + challenge), base64'd. These vectors
// are computed independently from the spec so a regression in the hashing order
// (or a swap of salt/challenge) is caught here rather than as a silent 4009.
describe("OBS v5 auth handshake", () => {
  it("produces a stable digest for fixed inputs (regression lock)", async () => {
    const password = "supersecretpassword";
    const salt = "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=";
    const challenge = "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=";
    const auth = await computeAuth(password, salt, challenge);
    expect(auth).toBe("1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=");
  });

  it("matches the manual two-step derivation", async () => {
    const password = "p@ss";
    const salt = "c2FsdA==";
    const challenge = "Y2hhbGxlbmdl";
    const secret = await sha256Base64(password + salt);
    const expected = await sha256Base64(secret + challenge);
    expect(await computeAuth(password, salt, challenge)).toBe(expected);
  });

  it("is sensitive to swapping salt and challenge", async () => {
    const a = await computeAuth("pw", "saltA", "challB");
    const b = await computeAuth("pw", "challB", "saltA");
    expect(a).not.toBe(b);
  });
});

describe("formatTimecode", () => {
  it("trims the OBS HH:MM:SS.mmm timecode to HH:MM:SS", () => {
    expect(formatTimecode("01:23:45.678")).toBe("01:23:45");
  });

  it("derives HH:MM:SS from a millisecond duration when no timecode", () => {
    expect(formatTimecode(undefined, 3_661_000)).toBe("01:01:01");
  });

  it("falls back to zero when nothing is available", () => {
    expect(formatTimecode()).toBe("00:00:00");
    expect(formatTimecode("", 0)).toBe("00:00:00");
  });
});
