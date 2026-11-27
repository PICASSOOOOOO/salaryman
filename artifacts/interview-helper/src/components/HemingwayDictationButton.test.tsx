// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HemingwayDictationButton from "./HemingwayDictationButton";

type FakeRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
};

describe("Hemingway dictation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let recognition: FakeRecognition | null;

  beforeEach(() => {
    recognition = null;
    delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  const installRecognition = () => {
    class RecognitionMock {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: FakeRecognition["onresult"] = null;
      onerror: FakeRecognition["onerror"] = null;
      onend: FakeRecognition["onend"] = null;
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      constructor() {
        recognition = this as unknown as FakeRecognition;
      }
    }
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: RecognitionMock,
    });
  };

  const clickToggle = () => {
    const button = container.querySelector<HTMLButtonElement>('[data-testid="hemingway-dictation-toggle"]');
    if (!button) throw new Error("Missing dictation toggle");
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  };

  it("labels unsupported browsers as unavailable and disables the control", () => {
    act(() => root.render(<HemingwayDictationButton onTranscript={vi.fn()} />));

    const button = container.querySelector<HTMLButtonElement>('[data-testid="hemingway-dictation-coming-soon"]');
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toContain("COMING SOON");
  });

  it("inserts final recognized speech and reports microphone permission failures", () => {
    installRecognition();
    const onTranscript = vi.fn();
    act(() => root.render(<HemingwayDictationButton onTranscript={onTranscript} />));

    clickToggle();
    expect(recognition?.start).toHaveBeenCalledOnce();
    expect(recognition?.lang).toBe(navigator.language || "en-US");
    const result = Object.assign([{ transcript: "The first sentence." }], { isFinal: true });
    act(() => recognition?.onresult?.({ resultIndex: 0, results: [result] }));
    expect(onTranscript).toHaveBeenCalledWith("The first sentence.");

    act(() => recognition?.onerror?.({ error: "not-allowed" }));
    expect(container.textContent).toContain("Allow microphone access in your browser to dictate.");
  });
});
