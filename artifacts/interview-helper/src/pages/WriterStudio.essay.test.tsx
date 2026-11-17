// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, login: vi.fn() }),
}));

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/tts", () => ({
  speakWithTTS: vi.fn(),
  WRITER_VOICES: [{ key: "pablo", label: "PABLO" }],
  loadWriterVoice: () => "pablo",
  saveWriterVoice: vi.fn(),
}));

vi.mock("@/lib/song-tools", () => ({
  lineSyllables: () => 0,
  alliterationLetters: () => new Set<string>(),
  fetchRhymes: vi.fn(),
  fetchNearRhymes: vi.fn(),
  fetchMeansLike: vi.fn(),
  fetchSynonyms: vi.fn(),
  fetchAdjectives: vi.fn(),
  fileToAudioBuffer: vi.fn(),
  fetchTTSBuffer: vi.fn(),
  mixVocalsAndBeat: vi.fn(),
  audioBufferToWavBlob: vi.fn(),
  isMusicGenre: (genre: string | null) => genre === "rap" || genre === "song",
}));

vi.mock("@/components/TrackPicker", () => ({
  useTrackPicker: () => ({ pick: vi.fn(), picker: null }),
}));

vi.mock("@/components/HummingbirdIcon", () => ({
  HummingbirdIcon: () => null,
}));

import WriterStudio from "./WriterStudio";

describe("Hemingway essay project persistence", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const click = (testId: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    if (!button) throw new Error(`Missing button ${testId}`);
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  };

  const setValue = (testId: string, value: string, eventType = "input") => {
    const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      `[data-testid="${testId}"]`,
    );
    if (!field) throw new Error(`Missing field ${testId}`);
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
    setter?.call(field, value);
    act(() => field.dispatchEvent(new Event(eventType, { bubbles: true })));
  };

  const waitForSave = async () => {
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
    });
  };

  it("keeps essay planning, citations, and style after switching projects and reloading", async () => {
    act(() => root.render(<WriterStudio />));
    click("button-new-essay");

    setValue("input-plan-thesis", "Public investment improves access.");
    setValue("select-citation-style", "MLA9", "change");
    click("button-toggle-source-form");
    setValue("input-source-type", "book", "change");
    setValue("input-source-authors", "Jane Doe");
    setValue("input-source-title", "Writing with Evidence");
    setValue("input-source-publisher", "Example Press");
    setValue("input-source-year", "2022");
    const sourceForm = container.querySelector<HTMLFormElement>('[data-testid="form-add-source"]');
    if (!sourceForm) throw new Error("Missing source form");
    act(() => sourceForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    await waitForSave();
    const saved = JSON.parse(window.localStorage.getItem("sm_writer_projects") ?? "[]") as Array<{
      id: string;
      genre: string;
      essayPlan?: { thesis?: string };
      citationStyle?: string;
      essaySources?: Array<{ title: string }>;
    }>;
    const essay = saved.find((project) => project.genre === "essay");
    expect(essay?.essayPlan?.thesis).toBe("Public investment improves access.");
    expect(essay?.citationStyle).toBe("MLA9");
    expect(essay?.essaySources?.[0]?.title).toBe("Writing with Evidence");

    click("button-new-writing-project");
    click(`card-writing-project-${essay!.id}`);
    expect((container.querySelector('[data-testid="input-plan-thesis"]') as HTMLTextAreaElement).value)
      .toBe("Public investment improves access.");
    await act(async () => root.unmount());

    root = createRoot(container);
    act(() => root.render(<WriterStudio />));
    expect((container.querySelector('[data-testid="select-citation-style"]') as HTMLSelectElement).value)
      .toBe("MLA9");
    expect(container.textContent).toContain("Writing with Evidence");
    expect(container.textContent).toContain("(Doe)");
  });
});
