// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.apiFetch }));

import { useVoiceListen } from "./use-interview";

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  static instance: FakeMediaRecorder | null = null;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void | Promise<void>) | null = null;
  finished: Promise<void> = Promise.resolve();

  constructor(_stream: MediaStream, _options: MediaRecorderOptions) {
    FakeMediaRecorder.instance = this;
  }

  start() {
    this.ondataavailable?.({ data: new Blob(["simulated audio"]) });
  }

  stop() {
    this.finished = Promise.resolve(this.onstop?.()).then(() => undefined);
  }
}

let root: Root;
let container: HTMLDivElement;
let hook: ReturnType<typeof useVoiceListen>;
const getUserMedia = vi.fn();
const trackStop = vi.fn();

function HookHarness() {
  hook = useVoiceListen();
  return <div data-testid="listen-status">{hook.listenStatus}</div>;
}

beforeEach(() => {
  mocks.apiFetch.mockReset();
  getUserMedia.mockReset();
  trackStop.mockReset();
  FakeMediaRecorder.instance = null;
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
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
                'data: {"content":"CONTEXT: The owner and date are undecided."}\n\n' +
                'data: {"content":"SAY: Can we decide today?"}\n\n' +
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
  vi.unstubAllGlobals();
});

describe("useVoiceListen capture flow", () => {
  it("captures only after explicit start and submits the selected scenario", async () => {
    expect(getUserMedia).not.toHaveBeenCalled();

    await act(async () => {
      await hook.startListening("meeting");
    });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeMediaRecorder.instance).not.toBeNull();
    expect(container.textContent).toBe("recording");

    await act(async () => {
      hook.stopListening();
      await FakeMediaRecorder.instance!.finished;
    });

    expect(trackStop).toHaveBeenCalledOnce();
    expect(mocks.apiFetch).toHaveBeenCalledOnce();
    const [url, init] = mocks.apiFetch.mock.calls[0];
    expect(url).toContain("/api/interview/listen");
    expect(JSON.parse(init.body)).toMatchObject({
      scenario: "meeting",
      audio: expect.any(String),
    });
    expect(container.textContent).toBe("done");
  });

  it("does not send an audio request when microphone access is denied", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("permission denied"));

    await act(async () => {
      await hook.startListening("interview");
    });

    expect(container.textContent).toBe("error");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
});
