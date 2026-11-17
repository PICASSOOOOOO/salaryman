// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EssayWorkspaceTools, { type EssayWorkspaceToolsProps } from "./EssayWorkspaceTools";

const emptyProps: EssayWorkspaceToolsProps = {
  plan: { assignment: "", thesis: "", outline: "", argument: "", evidence: "", revisionGoal: "" },
  sources: [],
  citationStyle: "APA7",
  suggestions: [],
  isProofreading: false,
  isBusy: false,
  canProofread: false,
  citationPreviews: {},
  onPlanChange: vi.fn(),
  onCitationStyleChange: vi.fn(),
  onAddSource: vi.fn(),
  onRemoveSource: vi.fn(),
  onInsertCitation: vi.fn(),
  onProofread: vi.fn(),
  onAcceptSuggestion: vi.fn(),
  onRejectSuggestion: vi.fn(),
};

describe("Hemingway essay tools", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (props: Partial<EssayWorkspaceToolsProps> = {}) => {
    act(() => root.render(<EssayWorkspaceTools {...emptyProps} {...props} />));
  };

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

  it("shows the essay plan and keeps review unavailable until a draft exists", () => {
    render();
    expect(container.querySelector('[data-testid="section-essay-plan"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="button-proofread"]')?.hasAttribute("disabled")).toBe(true);
    expect(container.textContent).toContain("Add draft text before requesting a review.");

    setValue("input-plan-thesis", "Public investment improves access.");
    expect(emptyProps.onPlanChange).toHaveBeenCalledWith({ thesis: "Public investment improves access." });
  });

  it("keeps the tools usable at phone width with stacked, full-width fields", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    render();
    expect(container.querySelector('[data-testid="essay-workspace-tools"]')?.className)
      .toContain("min-w-0");
    expect(container.querySelector('[data-testid="section-essay-plan"]')?.textContent)
      .toContain("Thesis");
    expect(container.querySelector('[data-testid="input-plan-thesis"]')?.className)
      .toContain("w-full");
    expect(container.querySelector('[data-testid="button-proofread"]')?.className)
      .toContain("min-h-11");
  });

  it("lets writers choose a citation style and add only entered source details", () => {
    render();
    setValue("select-citation-style", "MLA9", "change");
    expect(emptyProps.onCitationStyleChange).toHaveBeenCalledWith("MLA9");

    click("button-toggle-source-form");
    setValue("input-source-type", "book", "change");
    setValue("input-source-authors", "Jane Doe");
    setValue("input-source-title", "Writing with Evidence");
    setValue("input-source-publisher", "Example Press");
    setValue("input-source-year", "2022");

    const form = container.querySelector<HTMLFormElement>('[data-testid="form-add-source"]');
    if (!form) throw new Error("Missing source form");
    act(() => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    expect(emptyProps.onAddSource).toHaveBeenCalledWith(expect.objectContaining({
      type: "book",
      authors: "Jane Doe",
      title: "Writing with Evidence",
      publisher: "Example Press",
      year: "2022",
    }));
  });

  it("keeps citation insertion and proofreading decisions writer-controlled", () => {
    const props: EssayWorkspaceToolsProps = {
      ...emptyProps,
      canProofread: true,
      sources: [{
        id: "s-1",
        type: "book",
        authors: "Jane Doe",
        title: "Writing with Evidence",
        containerTitle: "",
        publisher: "Example Press",
        year: "2022",
        month: "",
        day: "",
        volume: "",
        issue: "",
        pages: "",
        doi: "",
        url: "",
        accessedDate: "",
        pageNumber: "",
      }],
      citationPreviews: { "s-1": { inText: "(Doe, 2022)", reference: "Doe, J. (2022). Writing with Evidence.", warnings: [] } },
      suggestions: [
        { id: "g-1", original: "The policy improve", replacement: "The policy improves", category: "grammar", explanation: "Match the verb to its subject." },
        { id: "c-1", original: "due to the fact that", replacement: "because", category: "clarity", explanation: "Use a more direct phrase." },
      ],
    };
    render(props);
    click("button-insert-citation-s-1");
    click("button-accept-suggestion-g-1");
    click("button-reject-suggestion-c-1");
    click("button-proofread");

    expect(props.onInsertCitation).toHaveBeenCalledWith("s-1");
    expect(props.onAcceptSuggestion).toHaveBeenCalledWith("g-1");
    expect(props.onRejectSuggestion).toHaveBeenCalledWith("c-1");
    expect(props.onProofread).toHaveBeenCalledOnce();
  });
});
