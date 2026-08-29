import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const terminal = readFileSync(
  resolve(process.cwd(), "src/pages/PabloTerminal.tsx"),
  "utf8",
);
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const swipe = readFileSync(
  resolve(process.cwd(), "src/hooks/useSwipeNavigation.ts"),
  "utf8",
);

describe("Pablo terminal reverse navigation", () => {
  it("returns onboarded users to the walkable office floor", () => {
    const logo = terminal.slice(
      terminal.indexOf('data-testid="link-logo-loop"') - 400,
      terminal.indexOf('data-testid="link-logo-loop"') + 200,
    );
    expect(logo).toContain('href="/office"');
    expect(logo).toContain('aria-label="Back to office floor"');
    expect(terminal).not.toContain('window.history.back()');
  });

  it("does not offer a map control from the Pablo nebula", () => {
    expect(terminal).not.toContain('pablo-nav-map');
    expect(terminal).not.toContain('href="/game/map"');
  });

  it("keeps edge-swipe back history-based", () => {
    expect(swipe).toContain("window.history.back()");
  });

  it("limits office-first routing to the actual root route", () => {
    expect(app).toContain('if (location.split("?")[0] !== "/") return null;');
    expect(app).toContain('return <Redirect to="/office" />');
  });
});