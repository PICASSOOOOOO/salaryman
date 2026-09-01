import { describe, it, expect } from "vitest";
import {
  CHARACTER_TEMPLATE_CATALOG,
  SALARYMAN_ART_KIT,
  REALISTIC_CHARACTER_STYLE,
  composeRealisticCharacterPrompt,
  composeSalarymanPrompt,
} from "../lib/salaryman-art";

const ARCHETYPES = ["man", "woman", "replicant"] as const;
const FACTIONS = ["suit", "nomad", "replicant"] as const;

describe("character template catalog", () => {
  it("has 27 entries (3 variations × 3 archetypes × 3 factions) with stable char_template_ keys", () => {
    expect(CHARACTER_TEMPLATE_CATALOG).toHaveLength(27);
    const ids = CHARACTER_TEMPLATE_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(27); // unique keys
    for (const t of CHARACTER_TEMPLATE_CATALOG) {
      expect(t.id).toMatch(new RegExp(`^char_template_${t.archetype}_${t.faction}(?:_v[23])?$`));
      expect(ARCHETYPES).toContain(t.archetype);
      expect(FACTIONS).toContain(t.faction);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.subject.length).toBeGreaterThan(0);
    }
  });

  it("covers every archetype × faction combination once", () => {
    const combos = new Set(CHARACTER_TEMPLATE_CATALOG.map((t) => `${t.archetype}|${t.faction}`));
    for (const a of ARCHETYPES) {
      for (const f of FACTIONS) {
        expect(combos.has(`${a}|${f}`)).toBe(true);
      }
    }
  });

  it("carries hex colors + non-empty look ids for the pixel-sprite hints", () => {
    for (const t of CHARACTER_TEMPLATE_CATALOG) {
      expect(t.look.skinTone).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      expect(t.look.hairColor).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      expect(t.look.hairStyle.length).toBeGreaterThan(0);
      expect(t.look.faceStyle.length).toBeGreaterThan(0);
    }
  });
});

describe("character template kit entries", () => {
  const kitByKey = new Map(SALARYMAN_ART_KIT.map((e) => [e.key, e]));

  it("registers each catalog template in the art kit, routed to the unreal backend", () => {
    for (const t of CHARACTER_TEMPLATE_CATALOG) {
      const entry = kitByKey.get(t.id);
      expect(entry, `kit entry for ${t.id}`).toBeDefined();
      expect(entry!.backend).toBe("unreal");
      expect(entry!.jobType).toBe("object");
      expect(entry!.aspectRatio).toBe("3:4");
      expect(entry!.category).toBe("character");
    }
  });

  it("bakes the REALISTIC prompt (not the pixel style) via fullPrompt", () => {
    for (const t of CHARACTER_TEMPLATE_CATALOG) {
      const entry = kitByKey.get(t.id)!;
      expect(entry.fullPrompt).toBe(composeRealisticCharacterPrompt(t.subject));
      // The realistic prompt must carry the realistic style marker...
      expect(entry.fullPrompt).toContain(REALISTIC_CHARACTER_STYLE[0]);
      // ...and must NOT be the default pixel composition.
      expect(entry.fullPrompt).not.toBe(composeSalarymanPrompt(t.subject));
    }
  });
});

// Mirror the read-only shape the GET /salaryman/character/templates endpoint
// projects, so the client gallery contract is locked even though the route
// itself is a thin DB read. Degraded (no art row) → imageUrl:null/status:"none".
describe("templates endpoint projection", () => {
  function project(
    rowByKey: Map<string, { url: string | null; status: string }>,
  ) {
    return CHARACTER_TEMPLATE_CATALOG.map((t) => {
      const row = rowByKey.get(t.id);
      const ready = row?.status === "ready" && !!row.url;
      return {
        id: t.id,
        artKey: t.id,
        label: t.label,
        archetype: t.archetype,
        faction: t.faction,
        imageUrl: ready ? row!.url : null,
        status: row?.status ?? "none",
        appearance: t.look,
      };
    });
  }

  it("degrades to imageUrl:null / status:none when no art row exists", () => {
    const out = project(new Map());
    expect(out).toHaveLength(27);
    for (const o of out) {
      expect(o.imageUrl).toBeNull();
      expect(o.status).toBe("none");
      expect(o.appearance).toBeDefined();
    }
  });

  it("surfaces the url only when the row is ready AND has a url", () => {
    const ready = CHARACTER_TEMPLATE_CATALOG[0].id;
    const pending = CHARACTER_TEMPLATE_CATALOG[1].id;
    const readyNoUrl = CHARACTER_TEMPLATE_CATALOG[2].id;
    const out = project(
      new Map([
        [ready, { url: "/api/art/asset/x.png", status: "ready" }],
        [pending, { url: null, status: "pending" }],
        [readyNoUrl, { url: null, status: "ready" }],
      ]),
    );
    const byId = new Map(out.map((o) => [o.id, o]));
    expect(byId.get(ready)!.imageUrl).toBe("/api/art/asset/x.png");
    expect(byId.get(ready)!.status).toBe("ready");
    expect(byId.get(pending)!.imageUrl).toBeNull();
    expect(byId.get(pending)!.status).toBe("pending");
    expect(byId.get(readyNoUrl)!.imageUrl).toBeNull();
  });
});
