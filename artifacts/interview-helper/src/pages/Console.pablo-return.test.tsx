// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use-interview", () => ({
  useInterviewSolver: () => ({ response: "", status: "idle", isStreaming: false, solve: vi.fn(), cancel: vi.fn(), reset: vi.fn() }),
  useVoiceListen: () => ({ listenStatus: "idle", answer: "", startListening: vi.fn(), stopListening: vi.fn(), reset: vi.fn(), isRecording: false, isProcessing: false }),
  useScreenScan: () => ({ scanStatus: "idle", answer: "", autoPilot: false, countdown: 0, lastScanMode: "screen", intervalSecs: 10, setIntervalSecs: vi.fn(), scanOnce: vi.fn(), scanChat: vi.fn(), startAutoPilot: vi.fn(), stopStream: vi.fn(), reset: vi.fn(), isConnecting: false, isAnalyzing: false }),
  useTypingSimulator: () => ({ displayedText: "", isTyping: false, isDone: true, start: vi.fn(), stop: vi.fn(), reset: vi.fn() }),
  useAdvisorChat: () => ({ messages: [], sendVoice: vi.fn(), isStreaming: false }),
}));
vi.mock("@/hooks/use-voice-conversation", () => ({ useVoiceConversation: () => ({ isConvMode: false, convState: "idle" }) }));
vi.mock("@/hooks/use-media-analyzer", () => ({
  useMediaAnalyzer: () => ({ response: "", isAnalyzing: false, status: "idle", analyze: vi.fn(), reset: vi.fn() }),
  detectMediaFileType: vi.fn(),
  validateMediaFile: vi.fn(),
}));
vi.mock("@/hooks/use-plan", () => ({ usePlan: () => ({ isPro: false, features: new Set<string>() }) }));
vi.mock("@/hooks/use-mobile", () => ({ getDefaultBoomerMode: () => false }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ActionPanel", () => ({ ActionPanel: () => null }));
vi.mock("@/components/StatusIndicator", () => ({ StatusIndicator: () => null }));
vi.mock("@/components/MarkdownRenderer", () => ({ MarkdownRenderer: () => null }));
vi.mock("@/components/ProGate", () => ({ ProGate: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));

import Console from "./Console";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Console Pablo return", () => {
  it("gives an authenticated console user a direct path back to normal Pablo chat", async () => {
    await act(async () => root.render(<Console />));
    const link = container.querySelector('[data-testid="console-open-pablo"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/pablo");
    expect(link.textContent).toContain("PABLO");
  });
});
