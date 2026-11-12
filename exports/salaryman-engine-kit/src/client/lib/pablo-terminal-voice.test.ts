import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const terminal = readFileSync(
  resolve(process.cwd(), "src/pages/PabloTerminal.tsx"),
  "utf8",
);

describe("Pablo terminal voice routing", () => {
  it("explicitly requests Pablo instead of relying on the generic TTS voice", () => {
    expect(terminal).toContain(
      'const PABLO_TTS_OPTIONS = { character: "PABLO" } as const;',
    );
    expect(terminal).toContain(
      'personaRef.current === "mila" ? "MILA" : "PABLO"',
    );

    const directPabloCalls = terminal.match(/PABLO_TTS_OPTIONS/g) ?? [];
    expect(directPabloCalls.length).toBeGreaterThan(10);
  });
});