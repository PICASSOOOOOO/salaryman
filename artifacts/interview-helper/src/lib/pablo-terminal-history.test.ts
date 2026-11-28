import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const terminal = readFileSync(
  resolve(process.cwd(), "src/pages/PabloTerminal.tsx"),
  "utf8",
);
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const startWorkMenu = readFileSync(
  resolve(process.cwd(), "src/components/StartWorkMenu.tsx"),
  "utf8",
);
const swipe = readFileSync(
  resolve(process.cwd(), "src/hooks/useSwipeNavigation.ts"),
  "utf8",
);

describe("Pablo terminal physical-world navigation", () => {
  it("offers the grouped Start Work menu to authenticated terminal visitors", () => {
    expect(terminal).toContain('import { StartWorkMenu } from "@/components/StartWorkMenu";');
    expect(terminal).toContain("{!isLoading && isAuthenticated && <StartWorkMenu />}");
    expect(startWorkMenu).toContain("<span>START WORK</span>");
    expect(startWorkMenu).toContain('data-testid="start-work-menu-trigger"');
    expect(startWorkMenu).toContain("aria-expanded={open}");
    expect(startWorkMenu).toContain("href={WORKSPACE_MENU_OFFICE.path}");
    expect(startWorkMenu).toContain("WORKSPACE_MENU_SECTIONS.map");
    expect(startWorkMenu).toContain("isGameReleaseLocked");
    expect(startWorkMenu).toContain("{!osIsLocked && (");
    expect(terminal).not.toContain('navigate(hasFinishedOnboarding ? "/office" : "/tower")');
    expect(terminal).not.toContain('{hasFinishedOnboarding ? "OFFICE" : "ENTER TOWER"}');
    expect(terminal).not.toContain('window.history.back()');
  });

  it("does not offer a map control from the Pablo nebula", () => {
    expect(terminal).not.toContain('pablo-nav-map');
    expect(terminal).not.toContain('href="/game/map"');
  });

  it("lets conversation history use the available screen height and scroll to older messages", () => {
    expect(terminal).toContain('data-testid="pablo-conversation"');
    expect(terminal).toContain("onScroll={handleConversationScroll}");
    expect(terminal).toContain("conversationPinnedToBottomRef.current");
    expect(styles).toContain("top: calc(6.5rem + env(safe-area-inset-top, 0px))");
    expect(styles).toContain("max-height: none");
    expect(styles).not.toContain("max-height: 38dvh");
    expect(styles).not.toContain("max-height: 32dvh");
    expect(styles).not.toContain("max-height: 44dvh");
  });

  it("keeps edge-swipe back history-based", () => {
    expect(swipe).toContain("window.history.back()");
  });

  it("keeps the public home surface separate from protected routes", () => {
    expect(app).toContain('if (location.split("?")[0] !== "/") return null;');
    expect(app).toContain('return <ProfessionalHome />');
  });
});