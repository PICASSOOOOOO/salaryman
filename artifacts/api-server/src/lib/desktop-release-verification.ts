import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";

// A receipt is emitted only after the native builder's Godot smoke test.
// Bind it to the archive bytes, not merely a reusable filename.
export async function verifyDesktopRelease(archive: string, platform: string): Promise<boolean> {
  try {
    const receipt = JSON.parse(await readFile(`${archive}.verified.json`, "utf8"));
    if (receipt.schema !== 1 || receipt.client !== "godot" || receipt.pairedSmokePassed !== true) return false;
    if (receipt.platform !== platform || !/^[a-f0-9]{64}$/.test(receipt.sha256)) return false;
    if (platform === "macos" && (receipt.developerIdSigned !== true || receipt.notarized !== true)) return false;
    const info = await stat(archive);
    if (info.size !== receipt.bytes) return false;
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    return hash.digest("hex") === receipt.sha256;
  } catch {
    return false;
  }
}
