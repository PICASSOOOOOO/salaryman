import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { STORY_HOME, STORY_TRIGGER, STORY_CORRIDOR } from "./story-scene1";

// STORY LANDMARKS are the coordinates the story system pins onto the world map:
// the UNDERGROUND CAMP (STORY_HOME), the MX-75 uplink beacon (STORY_TRIGGER) and
// the city-center -> underground story corridor (STORY_CORRIDOR). The client's
// single source of truth for all three is story-scene1.ts.
//
// STORY_HOME is special: it is the AUTHORITY-WRITTEN value. The server writes it
// into the begun story's homeBase (api-server salaryman-saves.ts) and the client
// mirrors the same coordinates for render/proximity. It is therefore declared on
// BOTH sides with no shared module binding them, so it MUST stay in lockstep —
// if the two drift, the client renders/aims at one place while the server
// relocates the player to another.
//
// STORY_TRIGGER and STORY_CORRIDOR are currently CLIENT-ONLY (the server has no
// counterpart), but the begin endpoint or any future server-side position
// validation could re-declare them, and a silent divergence would carry the same
// drift risk. Rather than hand-write a new guard per constant, this is a single
// generalized lockstep check that:
//   1. asserts every landmark the server DOES declare matches the client value
//      field-for-field (today that is STORY_HOME), and
//   2. for landmarks the server is REQUIRED to share (STORY_HOME), fails loudly
//      if the server copy ever disappears or is renamed.
// So the moment any landmark is duplicated onto the server it is automatically
// held in lockstep — no per-constant guard ever has to be added again.

// Resolve the server route file relative to this test (sibling artifact). We
// parse the value out of source (rather than importing across artifacts) to
// avoid pulling the whole server route — and its db/express deps — into the web
// test runner.
const SERVER_SAVES_PATH = path.resolve(
  import.meta.dirname,
  "../../../api-server/src/routes/salaryman-saves.ts",
);
const serverSource = readFileSync(SERVER_SAVES_PATH, "utf8");

// The body (`...` inside the braces) of a `const <NAME> = { ... }` object
// literal in the server source, or null if the server does not declare it.
function extractServerObjectBody(name: string): string | null {
  const decl = serverSource.match(
    new RegExp(`const\\s+${name}\\s*=\\s*\\{([^}]*)\\}`),
  );
  return decl ? decl[1] : null;
}

// Pull one field's literal value (string or number) out of an object-literal
// body, or undefined if the field is absent.
function fieldFromBody(body: string, key: string): string | number | undefined {
  const strM = body.match(new RegExp(`${key}\\s*:\\s*["']([^"']*)["']`));
  if (strM) return strM[1];
  const numM = body.match(new RegExp(`${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
  if (numM) return Number(numM[1]);
  return undefined;
}

type Landmark = {
  name: string;
  // The client value, reduced to the fields that must match across both sides.
  client: Record<string, string | number>;
  // True for landmarks the server is contractually obliged to also declare.
  requiredOnServer: boolean;
};

const LANDMARKS: Landmark[] = [
  {
    name: "STORY_HOME",
    client: {
      kind: STORY_HOME.kind,
      x: STORY_HOME.x,
      y: STORY_HOME.y,
      label: STORY_HOME.label,
    },
    requiredOnServer: true,
  },
  {
    name: "STORY_TRIGGER",
    client: {
      x: STORY_TRIGGER.x,
      y: STORY_TRIGGER.y,
      r: STORY_TRIGGER.r,
      label: STORY_TRIGGER.label,
    },
    requiredOnServer: false,
  },
  {
    name: "STORY_CORRIDOR",
    client: {
      x: STORY_CORRIDOR.x,
      y: STORY_CORRIDOR.y,
      w: STORY_CORRIDOR.w,
      h: STORY_CORRIDOR.h,
    },
    requiredOnServer: false,
  },
];

describe("story landmarks stay in lockstep between client and server", () => {
  for (const lm of LANDMARKS) {
    const body = extractServerObjectBody(lm.name);

    if (lm.requiredOnServer) {
      it(`${lm.name} is still declared on the server`, () => {
        expect(
          body,
          `Could not find a ${lm.name} object literal in ${SERVER_SAVES_PATH}. ` +
            `It is a shared story landmark — if it was renamed or restructured, ` +
            `update this lockstep guard and the server in lockstep.`,
        ).not.toBeNull();
      });
    }

    // Whenever the server declares the landmark (required or not), every client
    // field must match the server's copy exactly — otherwise they have drifted.
    if (body !== null) {
      it(`${lm.name} matches the server's coordinates exactly`, () => {
        const server: Record<string, string | number> = {};
        for (const key of Object.keys(lm.client)) {
          const value = fieldFromBody(body, key);
          expect(
            value,
            `Server ${lm.name} is missing field "${key}".`,
          ).not.toBeUndefined();
          server[key] = value as string | number;
        }
        expect(server).toEqual(lm.client);
      });
    }
  }
});
