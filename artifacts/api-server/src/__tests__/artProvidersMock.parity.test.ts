import { describe, it, expect } from "vitest";

// IMPORTANT: this file must NOT vi.mock("../lib/art-providers") — it deliberately
// imports the REAL registry so it can compare its public surface against the test
// mock. Every other art test mocks this module; this guard is what keeps that mock
// honest.
import * as realArtProviders from "../lib/art-providers";
import { makeArtProvidersMock } from "./helpers/artProvidersMock";

/**
 * Guard against test-mock drift.
 *
 * The art route tests replace ../lib/art-providers with makeArtProvidersMock().
 * When the real module gains/renames a runtime export (as happened with
 * listProviderSummariesWithHealth), a stale mock silently omits it — the route
 * then imports `undefined` and throws a 500 at runtime instead of failing with a
 * clear error. These assertions fail loudly the moment the mock falls behind, so
 * the WHOLE art suite stays trustworthy, not just the one test that happened to
 * exercise the changed export.
 */
describe("artProvidersMock parity with the real art-providers module", () => {
  const mock = makeArtProvidersMock() as Record<string, unknown>;
  const real = realArtProviders as Record<string, unknown>;
  // Type-only exports (interfaces/type aliases re-exported via `export *`) are
  // erased at runtime, so Object.keys() yields exactly the value exports the
  // routes can actually import.
  const realRuntimeKeys = Object.keys(real);

  it("exposes every runtime export the real module does", () => {
    const missing = realRuntimeKeys.filter((k) => !(k in mock));
    expect(
      missing,
      "makeArtProvidersMock() is missing real art-providers export(s): [" +
        missing.join(", ") +
        "]. Add them to src/__tests__/helpers/artProvidersMock.ts so the mock stays a faithful stand-in (a missing export makes the route import undefined and throw a 500 instead of a clear error).",
    ).toEqual([]);
  });

  it("matches the kind (function vs value) of every shared export", () => {
    const mismatches = realRuntimeKeys
      .filter((k) => k in mock)
      .filter((k) => typeof real[k] !== typeof mock[k])
      .map((k) => `${k}: real is ${typeof real[k]}, mock is ${typeof mock[k]}`);
    expect(
      mismatches,
      `makeArtProvidersMock() export kind mismatch — ${mismatches.join("; ")}`,
    ).toEqual([]);
  });
});
