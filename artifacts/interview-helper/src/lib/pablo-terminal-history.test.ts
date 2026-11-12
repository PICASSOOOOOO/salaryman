import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const terminal = readFileSync(
  resolve(process.cwd(), "src/pages/PabloTerminal.tsx"),
  "utf8",
);
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const startWorkMenu = readFileSync(
  resolve(process.cwd(), "src/components/StartWorkMenu.tsx"),
  "utf8",
);
const swipe = readFileSync(
  resolve(process.cwd(), "src/hooks/useSwipeNavigation.ts"),
  "utf8",
);

describe("Pablo terminal physical-world navigation", () => {
  it("uses the shared START WORK menu for authenticated terminal visitors", () => {
    expect(terminal).toContain('import { StartWorkMenu } from "@/components/StartWorkMenu";');
    expect(terminal).toContain("{!isLoading && isAuthenticated && <StartWorkMenu />}");
    expect(startWorkMenu).toContain("<span>START WORK</span>");
    expect(startWorkMenu).toContain("requestWorkspaceFeatureAssignment(path)");
    expect(startWorkMenu).toContain('location.split("?")[0] === "/workspace"');
    expect(terminal).not.toContain('navigate(hasFinishedOnboarding ? "/office" : "/tower")');
    expect(terminal).not.toContain('{hasFinishedOnboarding ? "OFFICE" : "ENTER TOWER"}');
    expect(terminal).not.toContain('window.history.back()');
  });

  it("does not offer a map control from the Pablo nebula", () => {
    expect(terminal).not.toContain('pablo-nav-map');
    expect(terminal).not.toContain('href="/game/map"');
  });

  it("keeps edge-swipe back history-based", () => {
    expect(swipe).toContain("window.history.back()");
  });

  it("keeps the public home surface separate from protected routes", () => {
    expect(app).toContain('if (location.split("?")[0] !== "/") return null;');
    expect(app).toContain('return <ProfessionalHome />');
  });
});