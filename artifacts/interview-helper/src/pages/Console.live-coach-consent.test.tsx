// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  isRecording: false,
  startListening: vi.fn(),
  stopListening: vi.fn(),
  isConversationSupported: false,
  isConversationActive: false,
  startConversation: vi.fn(),
  stopConversation: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/hooks/use-plan", () => ({ usePlan: () => ({ isPro: true, features: {} }) }));
vi.mock("@/hooks/use-interview", () => ({
  useInterviewSolver: () => ({ response: "", status: "idle", isStreaming: false, solve: vi.fn(), cancel: vi.fn(), reset: vi.fn() }),
  useVoiceListen: () => ({
    listenStatus: "idle", answer: "", isProcessing: false, isRecording: state.isRecording,
    startListening: state.startListening, stopListening: state.stopListening, reset: vi.fn(),
  }),
  useScreenScan: () => ({
    scanStatus: "idle", answer: "", autoPilot: false, countdown: 0, lastScanMode: "bullets",
    intervalSecs: 15, setIntervalSecs: vi.fn(), scanOnce: vi.fn(), scanChat: vi.fn(),
    startAutoPilot: vi.fn(), stopStream: vi.fn(), reset: vi.fn(), isConnecting: false, isAnalyzing: false,
  }),
  useTypingSimulator: () => ({
    displayedText: "", isTyping: false, isDone: true, start: vi.fn(), stop: vi.fn(), reset: vi.fn(),
  }),
  useAdvisorChat: () => ({ messages: [], sendVoice: vi.fn(), isStreaming: false }),
}));
vi.mock("@/hooks/use-voice-conversation", () => ({
  useVoiceConversation: () => ({
    isSupported: state.isConversationSupported,
    isConvMode: state.isConversationActive,
    convState: state.isConversationActive ? "listening" : "idle",
    startConversation: state.startConversation,
    stopConversation: state.stopConversation,
  }),
}));
vi.mock("@/hooks/use-media-analyzer", () => ({
  useMediaAnalyzer: () => ({
    response: "", isAnalyzing: false, status: "idle", analyze: vi.fn(), reset: vi.fn(),
  }),
  detectMediaFileType: vi.fn(),
  validateMediaFile: vi.fn(),
}));
vi.mock("@/components/ActionPanel", () => ({ ActionPanel: () => null }));
vi.mock("@/components/StatusIndicator", () => ({ StatusIndicator: () => null }));
vi.mock("@/components/MarkdownRenderer", () => ({ MarkdownRenderer: () => null }));
vi.mock("@/components/ProGate", () => ({ ProGate: ({ children }: any) => children }));
vi.mock("@/components/SignInPrompt", () => ({ SignInPage: () => null }));
vi.mock("@/components/TowerLifeHub", () => ({ TowerLifeHub: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a> }));

import Console from "./Console";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  state.isRecording = false;
  state.startListening.mockClear();
  state.stopListening.mockClear();
  state.isConversationSupported = false;
  state.isConversationActive = false;
  state.startConversation.mockClear();
  state.stopConversation.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Console />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function consentCheckbox(): HTMLInputElement {
  const input = container.querySelector('[data-testid="live-coach-consent"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("coaching consent checkbox not found");
  return input;
}

function listenButton(): HTMLButtonElement {
  const button = container.querySelector('[data-testid="live-coach-listen"]');
  if (!(button instanceof HTMLButtonElement)) throw new Error("live listen button not found");
  return button;
}

function conversationButton(): HTMLButtonElement {
  const button = container.querySelector('[data-testid="live-coach-conversation"]');
  if (!(button instanceof HTMLButtonElement)) throw new Error("live conversation button not found");
  return button;
}

describe("Console live coaching consent", () => {
  it("keeps recording disabled until the user consents", () => {
    expect(listenButton().disabled).toBe(true);
    act(() => consentCheckbox().click());
    expect(listenButton().disabled).toBe(false);
    act(() => listenButton().click());
    expect(state.startListening).toHaveBeenCalledWith("interview");
  });

  it("stops an active recording when consent is withdrawn", () => {
    state.isRecording = true;
    act(() => root.render(<Console />));
    act(() => consentCheckbox().click());
    act(() => consentCheckbox().click());
    expect(state.stopListening).toHaveBeenCalledOnce();
  });

  it("requires consent to start voice conversation and stops when consent is withdrawn", () => {
    state.isConversationSupported = true;
    act(() => root.render(<Console />));

    expect(conversationButton().disabled).toBe(true);
    act(() => consentCheckbox().click());
    expect(conversationButton().disabled).toBe(false);
    act(() => conversationButton().click());
    expect(state.startConversation).toHaveBeenCalledOnce();

    state.isConversationActive = true;
    act(() => root.render(<Console />));
    act(() => consentCheckbox().click());
    expect(state.stopConversation).toHaveBeenCalledOnce();
  });
});
