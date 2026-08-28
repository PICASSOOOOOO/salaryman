// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "WorldPlay.tsx"), "utf8");
const writes = source.match(/\b(?:g|gs\.current)\.salary\s*(?:=|\+=|-=|\*=|\/=|\+\+|--)/g) ?? [];

describe("WorldPlay salary authority", () => {
  it("only reconciles the legacy salary cache from a server response", () => {
    expect(writes).toEqual(["gs.current.salary ="]);
    expect(source).toMatch(/const reconcileAuthoritativeSalary[\s\S]*gs\.current\.salary = newBalance/);
  });

  it("gates dynamic purchases and quick-job state on successful settlement", () => {
    expect(source).toMatch(
      /const paid = await performGameplayFiatAction\(`world_commodity_buy_[\s\S]{0,300}if \(!paid \|\| paid\.duplicate\) return;[\s\S]{0,200}cargo\[cid\]/,
    );
    expect(source).toMatch(
      /performGameplayFiatAction\(`quick_job_[\s\S]{0,300}\.then\(paid => \{[\s\S]{0,100}if \(!paid \|\| paid\.duplicate\) return;[\s\S]{0,200}jobCooldowns/,
    );
    expect(source).not.toMatch(
      /void performGameplayFiatAction\('(?:dog_adoption|cat_adoption|commodity_buy|commodity_sell)'/,
    );
  });

  it("keeps architect-reviewed goods behind successful non-duplicate debits", () => {
    for (const [action, effect] of [
      ["office_lease_", "localStorage.setItem('sm_office'"],
      ["millionaire_purchase", "setShowSecretLabPrompt('setpw')"],
      ["newspaper_purchase", "g.inventory.push(newItem)"],
      ["checkpoint_fee", "g.py = crossingSouth"],
    ] as const) {
      const start = source.indexOf(`performGameplayFiatAction(${action.endsWith("_") ? "`" + action : "'" + action + "'"}`);
      expect(start, `${action} call missing`).toBeGreaterThan(-1);
      const block = source.slice(start, start + 900);
      expect(block).toMatch(/\.then\(paid => \{/);
      expect(block).toMatch(/if \(!paid \|\| paid\.duplicate\) return;/);
      expect(block, `${effect} must be inside the success callback`).toContain(effect);
    }
  });
});