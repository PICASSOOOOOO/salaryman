import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { verifyDesktopRelease } from "./desktop-release-verification";

let directory: string;
let archive: string;
const bytes = Buffer.from("native release test fixture");
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "desktop-release-"));
  archive = path.join(directory, "game.zip");
  await writeFile(archive, bytes);
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
async function receipt(overrides: Record<string, unknown> = {}) {
  await writeFile(`${archive}.verified.json`, JSON.stringify({
    schema: 1, client: "godot", platform: "windows", pairedSmokePassed: true,
    bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
    developerIdSigned: false, notarized: false, ...overrides,
  }));
}
describe("desktop release verification", () => {
  it("rejects legacy archives without a receipt", async () => {
    expect(await verifyDesktopRelease(archive, "windows")).toBe(false);
  });
  it("accepts an exact verified archive", async () => {
    await receipt();
    expect(await verifyDesktopRelease(archive, "windows")).toBe(true);
  });
  it("rejects a replaced archive even when its size matches", async () => {
    await receipt();
    await writeFile(archive, Buffer.alloc(bytes.length));
    expect(await verifyDesktopRelease(archive, "windows")).toBe(false);
  });
  it("rejects a receipt for another platform or failed smoke test", async () => {
    await receipt();
    expect(await verifyDesktopRelease(archive, "linux")).toBe(false);
    await receipt({ pairedSmokePassed: false });
    expect(await verifyDesktopRelease(archive, "windows")).toBe(false);
  });
  it("requires both Mac signing and notarization", async () => {
    await receipt({ platform: "macos" });
    expect(await verifyDesktopRelease(archive, "macos")).toBe(false);
    await receipt({ platform: "macos", developerIdSigned: true });
    expect(await verifyDesktopRelease(archive, "macos")).toBe(false);
    await receipt({ platform: "macos", developerIdSigned: true, notarized: true });
    expect(await verifyDesktopRelease(archive, "macos")).toBe(true);
  });
  it("fails closed on malformed receipts", async () => {
    await writeFile(`${archive}.verified.json`, "not json");
    expect(await verifyDesktopRelease(archive, "windows")).toBe(false);
  });
});
