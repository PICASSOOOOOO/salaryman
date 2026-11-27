// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";

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
    window.history.replaceState({}, "", "/creative/writer");
    vi.mocked(apiFetch).mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState({}, "", "/creative/writer");
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

  const mockWriterStream = (content: string) => {
    const chunk = new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`);
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk);
          controller.close();
        },
      }),
    } as Response);
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

  it("opens feature settings without a project and applies defaults to new projects", async () => {
    act(() => root.render(<WriterStudio />));

    expect(container.querySelector('[data-testid="hemingway-view-settings"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="hemingway-feature-settings"]')).toBeNull();
    click("hemingway-view-settings");
    expect(container.querySelector('[data-testid="hemingway-feature-settings"]')).not.toBeNull();

    setValue("hemingway-default-genre", "memoir", "change");
    setValue("hemingway-default-tone", "gritty", "change");
    expect(JSON.parse(window.localStorage.getItem("sm_writer_defaults") ?? "{}"))
      .toMatchObject({ genre: "memoir", tone: "gritty" });

    click("hemingway-view-writing");
    click("button-new-writing-project");
    await waitForSave();
    const saved = JSON.parse(window.localStorage.getItem("sm_writer_projects") ?? "[]") as Array<{
      genre: string;
      tone: string;
    }>;
    expect(saved.at(-1)).toMatchObject({ genre: "memoir", tone: "gritty" });
  });

  it("opens Hemingway settings from its existing settings link", () => {
    window.history.replaceState({}, "", "/creative/writer?settings=1");
    act(() => root.render(<WriterStudio />));

    expect(container.querySelector('[data-testid="hemingway-feature-settings"]')).not.toBeNull();
  });

  it("creates a business-plan project from the template library with saved sections", async () => {
    act(() => root.render(<WriterStudio />));
    click("hemingway-view-templates");
    click("button-use-hemingway-template-business-plan");
    await waitForSave();

    const saved = JSON.parse(window.localStorage.getItem("sm_writer_projects") ?? "[]") as Array<{
      genre: string;
      title: string;
      chapters: Array<{ title: string }>;
      writingPrompt?: string;
    }>;
    expect(saved.at(-1)).toMatchObject({
      genre: "business_plan",
      title: "UNTITLED BUSINESS PLAN",
      writingPrompt: expect.stringContaining("never fabricate research"),
    });
    expect(saved.at(-1)?.chapters.map(chapter => chapter.title)).toContain("FINANCIAL PLAN");
  });

  it("saves prompt-led writing and music notes in a music project", async () => {
    act(() => root.render(<WriterStudio />));
    click("hemingway-view-settings");
    setValue("hemingway-default-genre", "song", "change");
    click("hemingway-view-writing");
    click("button-new-writing-project");
    click("hemingway-project-settings-toggle");
    setValue("hemingway-music-notes", "Key: D minor; chords: Dm–Bb–F–C");
    click("button-toggle-hemingway-prompt");
    setValue("hemingway-writing-prompt", "Write a reflective chorus about returning home.");
    await waitForSave();

    const saved = JSON.parse(window.localStorage.getItem("sm_writer_projects") ?? "[]") as Array<{
      genre: string;
      musicNotes?: string;
      writingPrompt?: string;
    }>;
    expect(saved.at(-1)).toMatchObject({
      genre: "song",
      musicNotes: "Key: D minor; chords: Dm–Bb–F–C",
      writingPrompt: "Write a reflective chorus about returning home.",
    });
    expect(container.querySelector('[data-testid="hemingway-prompt-panel"]')).not.toBeNull();
  });

  it("offers optional grammar and style review for non-essay writing", () => {
    act(() => root.render(<WriterStudio />));
    click("button-new-writing-project");
    setValue("hemingway-editor", "The fog are lifting over the harbor.");
    click("button-toggle-hemingway-review");

    expect(container.querySelector('[data-testid="hemingway-writing-review"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="button-hemingway-review"]')).not.toBeNull();
  });

  it("sends a saved prompt to Pablo and adds the generated section to the draft", async () => {
    mockWriterStream("The harbor lights came on one by one.");
    act(() => root.render(<WriterStudio />));
    click("button-new-writing-project");
    click("button-toggle-hemingway-prompt");
    setValue("hemingway-writing-prompt", "Write a quiet opening scene at a harbor.");
    click("button-hemingway-generate-from-prompt");
    await waitForSave();

    const options = vi.mocked(apiFetch).mock.calls[0]?.[1];
    const requestBody = JSON.parse(String(options?.body)) as { action: string; context: string };
    expect(requestBody.action).toBe("write_section");
    expect(requestBody.context).toContain("Write a quiet opening scene at a harbor.");
    expect((container.querySelector('[data-testid="hemingway-editor"]') as HTMLTextAreaElement).value)
      .toBe("The harbor lights came on one by one.");
  });

  it("keeps a humanized revision as a proposal until the writer accepts it", async () => {
    mockWriterStream("A clearer version of the draft.");
    act(() => root.render(<WriterStudio />));
    click("button-new-writing-project");
    setValue("hemingway-editor", "Original wording stays here.");
    click("button-hemingway-humanize");
    await waitForSave();

    const editor = container.querySelector('[data-testid="hemingway-editor"]') as HTMLTextAreaElement;
    expect(editor.value).toBe("Original wording stays here.");
    expect(container.textContent).toContain("REPLACE DRAFT");
    click("button-apply-hemingway-output");
    expect(editor.value).toBe("A clearer version of the draft.");
  });

  it("saves a music composition to project notes only after acceptance", async () => {
    mockWriterStream("Key: D minor. Chorus: Dm–Bb–F–C.");
    act(() => root.render(<WriterStudio />));
    click("hemingway-view-settings");
    setValue("hemingway-default-genre", "song", "change");
    click("hemingway-view-writing");
    click("button-new-writing-project");
    click("hemingway-project-settings-toggle");
    setValue("hemingway-music-notes", "Tempo: 92 BPM.");
    setValue("hemingway-editor", "A song about finding home.");
    click("button-hemingway-compose-music");
    await waitForSave();

    expect((container.querySelector('[data-testid="hemingway-editor"]') as HTMLTextAreaElement).value)
      .toBe("A song about finding home.");
    click("button-apply-hemingway-output");
    await waitForSave();

    const saved = JSON.parse(window.localStorage.getItem("sm_writer_projects") ?? "[]") as Array<{
      genre: string;
      musicNotes?: string;
      chapters: Array<{ content: string }>;
    }>;
    expect(saved.at(-1)?.musicNotes).toContain("Tempo: 92 BPM.");
    expect(saved.at(-1)?.musicNotes).toContain("Key: D minor. Chorus: Dm–Bb–F–C.");
    expect(saved.at(-1)?.chapters[0]?.content).toBe("A song about finding home.");
  });
});
