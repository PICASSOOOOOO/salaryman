// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.apiFetch }));

import { useAdvisorChat } from "./use-interview";

let root: Root;
let container: HTMLDivElement;
let hook: ReturnType<typeof useAdvisorChat>;

function HookHarness() {
  hook = useAdvisorChat();
  return <div>{hook.messages.length}</div>;
}

beforeEach(() => {
  localStorage.clear();
  mocks.apiFetch.mockReset();
  mocks.apiFetch.mockResolvedValue({
    ok: true,
    body: {
      getReader: () => {
        let sent = false;
        return {
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return {
              done: false,
              value: new TextEncoder().encode(
                'data: {"content":"Yes, the sky appears blue."}\n\n' +
                'data: {"done":true}\n\n',
              ),
            };
          },
        };
      },
    },
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<HookHarness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useAdvisorChat voice requests", () => {
  it("sends the transcript in the advisor messages contract", async () => {
    await act(async () => {
      await hook.sendVoice("Is the sky blue?");
    });

    const advisorCall = mocks.apiFetch.mock.calls.find(([url]) =>
      String(url).includes("api/interview/advisor"),
    );
    expect(advisorCall).toBeDefined();
    const [url, init] = advisorCall as [string, RequestInit];
    expect(url).toContain("api/interview/advisor");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      messages: [{ role: "user", content: "Is the sky blue?" }],
    });
    expect(hook.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "Yes, the sky appears blue.",
    });
  });
});
