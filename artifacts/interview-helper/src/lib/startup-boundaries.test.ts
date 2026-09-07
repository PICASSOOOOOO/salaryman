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

  it("keeps unfinished gameplay media off the public landing page", () => {
    const app = source("App.tsx");
    const landing = source("pages/ProfessionalHome.tsx");
    expect(app).toContain('lazy(() => import("@/pages/ProfessionalHome"))');
    expect(landing).not.toContain("<video");
    expect(landing).not.toContain(".mp4");
    expect(landing).toContain("Three paths.");
  });

  it("lets route chunks own charts and syntax libraries", () => {
    const vite = source("../vite.config.ts");
    expect(vite).not.toContain('return "vendor-syntax"');
    expect(vite).not.toContain('return "vendor-markdown"');
    expect(vite).not.toContain('return "vendor-charts"');
  });

  it("releases inactive primary surfaces instead of hiding them", () => {
    const app = source("App.tsx");
    expect(app).toContain("{isHome && (");
    expect(app).toContain("{isConsoleTerminal && (");
    expect(app).not.toContain('display: isHome ? "block" : "none"');
    expect(app).not.toContain('display: isConsoleTerminal ? "block" : "none"');
  });

  it("bounds and pauses the office canvas workload", () => {
    const office = source("pixel-office/LiveOffice.tsx");
    const isoOffice = source("components/IsoOffice.tsx");
    const loop = source("pixel-office/office/engine/gameLoop.ts");
    expect(office).toContain("lowGfx ? 1 : Math.max(1, Math.min(2, window.devicePixelRatio || 1))");
    expect(office).toContain("maxFps: lowGfx ? 30 : undefined");
    expect(isoOffice).toContain("lowGfx ? 1 : Math.min(2, window.devicePixelRatio || 1)");
    expect(isoOffice).toContain("1000 / 30");
    expect(loop).toContain("document.visibilityState === 'hidden'");
    expect(loop).toContain("document.addEventListener('visibilitychange'");
    expect(loop).toContain("document.removeEventListener('visibilitychange'");
  });

  it("keeps the exterior world out of the active application", () => {
    const app = source("App.tsx");
    expect(app).not.toContain('lazy(() => import("@/pages/WorldPlay"))');
    expect(app).not.toContain('lazy(() => import("@/pages/LandRegistry"))');
    expect(app).not.toContain('lazy(() => import("@/pages/Subway"))');
    expect(app).toContain('<Route path="/world/*">{() => <Redirect to="/desktop" />}</Route>');
    expect(app).toContain('<Route path="/subway">{() => <Redirect to="/desktop" />}</Route>');
    expect(app).toContain('<Route path="/tower/*">{() => <Redirect to="/desktop" />}</Route>');
    expect(app).toContain('<Route path="/desktop" component={DesktopDownload} />');
  });
});