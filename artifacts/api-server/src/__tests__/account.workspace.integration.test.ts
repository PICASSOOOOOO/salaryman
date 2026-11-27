// Exercise the real browser sync helpers against the mounted account route.
// The transport adapter forwards calls through supertest; it does not mock the
// workspace endpoint's input or response contract.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  actAs,
  buildApp,
  cleanupTestData,
  createUser,
} from "./helpers/commsTestApp";

let app: Express;

const apiFetchSpy = vi.fn(
  (path: string, options?: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  }) => {
    const method = (options?.method ?? "GET").toUpperCase();
    const requestPromise = (async () => {
      let response;
      if (method === "PUT") {
        const saveRequest = request(app).put(path);
        for (const [name, value] of Object.entries(options?.headers ?? {})) {
          saveRequest.set(name, value);
        }
        response = await saveRequest.send(options?.body ?? "");
      } else {
        response = await request(app).get(path);
      }
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async () => response.body,
      } as unknown as Response;
    })();
    return requestPromise;
  },
);

vi.mock("../../../interview-helper/src/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) =>
    apiFetchSpy(...(args as [string, {
      method?: string;
      body?: string;
      headers?: Record<string, string>;
    }?])),
}));

beforeAll(() => {
  app = buildApp({ onboardingMutationGate: true });
});

afterAll(async () => {
  await cleanupTestData();
});

describe("workspace browser helper ↔ account route", () => {
  it("saves on one device and loads the same layout on another", async () => {
    const user = await createUser();
    actAs(user);
    const layout = {
      version: 2 as const,
      slots: ["/phone", "/pablo", null, "/creative/scene"],
    };
    const sync = await import("../../../interview-helper/src/lib/workspace-layout-sync");

    const missingContentType = await request(app)
      .put("/api/account/workspace")
      .send(JSON.stringify(layout));
    expect(missingContentType.status).toBe(400);

    await sync.writeAccountWorkspaceLayout(layout);
    const layoutOnFreshDevice = await sync.readAccountWorkspaceLayout();

    expect(layoutOnFreshDevice).toEqual(layout);
    expect(apiFetchSpy.mock.calls.map(([path]) => path)).toEqual([
      "/api/account/workspace",
      "/api/account/workspace",
    ]);
    expect(apiFetchSpy.mock.calls[0]?.[1]?.headers)
      .toMatchObject({ "Content-Type": "application/json" });
  });
});
