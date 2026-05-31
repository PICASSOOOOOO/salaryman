import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { STORY_HOME } from "./story-scene1";

// The UNDERGROUND CAMP coordinates (STORY_HOME) are declared twice: here on the
// client (story-scene1.ts) and on the server (api-server salaryman-saves.ts).
// The server is the authority that writes homeBase into the begun story; the
// client uses the same coordinates for render/proximity. If the two ever drift
// apart, the client would point render/proximity logic at the wrong place while
// the server relocates the player elsewhere. There is no shared module binding
// them, so this test fails loudly the moment they diverge.

// Resolve the server route file relative to this test (sibling artifact).
const SERVER_SAVES_PATH = path.resolve(
  import.meta.dirname,
  "../../../api-server/src/routes/salaryman-saves.ts",
);

// Pull the literal value of a field out of the server's STORY_HOME object.
// We parse from source (rather than import across artifacts) to avoid pulling
// the whole server route — and its db/express deps — into the web test runner.
function extractServerStoryHome(): { kind: string; x: number; y: number; label: string } {
  const source = readFileSync(SERVER_SAVES_PATH, "utf8");
  const decl = source.match(/const\s+STORY_HOME\s*=\s*\{([^}]*)\}/);
  if (!decl) {
    throw new Error(
      `Could not find a STORY_HOME object literal in ${SERVER_SAVES_PATH}. ` +
        `If it was renamed or restructured, update this lockstep guard.`,
    );
  }
  const body = decl[1];
  const str = (key: string): string => {
    const m = body.match(new RegExp(`${key}\\s*:\\s*["']([^"']*)["']`));
    if (!m) throw new Error(`Server STORY_HOME is missing string field "${key}".`);
    return m[1];
  };
  const num = (key: string): number => {
    const m = body.match(new RegExp(`${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
    if (!m) throw new Error(`Server STORY_HOME is missing numeric field "${key}".`);
    return Number(m[1]);
  };
  return { kind: str("kind"), x: num("x"), y: num("y"), label: str("label") };
}

describe("STORY_HOME stays in lockstep between client and server", () => {
  it("matches the server's UNDERGROUND CAMP coordinates exactly", () => {
    const server = extractServerStoryHome();
    expect({
      kind: STORY_HOME.kind,
      x: STORY_HOME.x,
      y: STORY_HOME.y,
      label: STORY_HOME.label,
    }).toEqual(server);
  });
});
