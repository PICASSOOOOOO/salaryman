import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("frontend startup boundaries", () => {
  it("keeps optional bootstrap work behind the first paint", () => {
    const main = source("main.tsx");
    expect(main).not.toMatch(/^import .*errorReporter/m);
    expect(main).not.toMatch(/^import .*global-ui-sound/m);
    expect(main).toContain('import("./lib/errorReporter")');
    expect(main).toContain("armAudioAutoUnlock();");
    expect(main).toContain("installDeferredGlobalUiSound();");
  });

  it("keeps Three, Twilio, audio conversion, and chat on demand", () => {
    const app = source("App.tsx");
    const twilio = source("contexts/TwilioDeviceContext.tsx");
    const music = source("contexts/MusicPlayerContext.tsx");
    const chat = source("components/DeferredChatPanel.tsx");

    expect(app).toContain('lazy(() => import("@/pages/PabloTerminal"))');
    expect(twilio).toContain("await import('@twilio/voice-sdk')");
    expect(twilio).not.toMatch(/^import \\{ Device, Call \\}/m);
    expect(music).toContain('await import("@/lib/audioConvert")');
    expect(music).not.toMatch(/^import .*audioConvert/m);
    expect(chat).toContain('import("@/components/ChatPanel")');
  });

  it("does not eagerly preload full landing media", () => {
    const landing = source("pages/ScrollLanding.tsx");
    expect(landing).toContain('preload="none"');
    expect(landing).toContain('preload="metadata"');
    expect(landing).not.toContain('preload="auto"');
  });

  it("lets route chunks own charts and syntax libraries", () => {
    const vite = source("../vite.config.ts");
    expect(vite).not.toContain('return "vendor-syntax"');
    expect(vite).not.toContain('return "vendor-markdown"');
    expect(vite).not.toContain('return "vendor-charts"');
  });
});