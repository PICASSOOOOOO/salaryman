// @vitest-environment jsdom
//
// Guards the NetWorthHUD CASH flash behaviour. When the `cash` prop changes the
// CASH value span switches to green (#4ade80) on gain or red (#ff4444) on loss,
// then reverts to the default colour after a 400 ms timeout. A rapid series of
// changes must clear any in-flight timer so stale colours never linger.
//
// Contract:
//   1. Initial render with cash → no flash (prevCashRef is undefined).
//   2. Re-render with higher cash → green flash immediately.
//   3. Re-render with lower cash → red flash immediately.
//   4. After 400 ms the flash colour clears back to the default.
//   5. Rapid sequential changes cancel the previous timer; only the final
//      change's flash survives, and it clears after its own 400 ms.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NetWorthHUD } from "./NetWorthHUD";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const GAIN_COLOR = "rgb(74, 222, 128)";   // #4ade80 as normalised by jsdom
const LOSS_COLOR = "rgb(255, 68, 68)";    // #ff4444 as normalised by jsdom

let root: Root;
let container: HTMLDivElement;

function cashSpan(): HTMLElement | null {
  return container.querySelector<HTMLElement>("[data-cash-value]");
}

function cashColor(): string | undefined {
  return cashSpan()?.style.color;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render(cash: number | undefined, netWorth = 100_000) {
  await act(async () => {
    root.render(
      <NetWorthHUD
        netWorth={netWorth}
        cash={cash}
        showStamina={false}
        showCredit={false}
      />,
    );
  });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("NetWorthHUD CASH flash", () => {
  it("shows no flash on the initial render (no previous value to compare)", async () => {
    await render(500);
    expect(cashColor()).not.toBe(GAIN_COLOR);
    expect(cashColor()).not.toBe(LOSS_COLOR);
  });

  it("flashes green when cash increases", async () => {
    await render(500);
    await render(800);
    expect(cashColor()).toBe(GAIN_COLOR);
  });

  it("flashes red when cash decreases", async () => {
    await render(500);
    await render(200);
    expect(cashColor()).toBe(LOSS_COLOR);
  });

  it("clears the flash colour after 400 ms", async () => {
    await render(500);
    await render(800);
    expect(cashColor()).toBe(GAIN_COLOR);

    await act(async () => { vi.advanceTimersByTime(400); });
    await flush();

    expect(cashColor()).not.toBe(GAIN_COLOR);
    expect(cashColor()).not.toBe(LOSS_COLOR);
  });

  it("flash does not clear before 400 ms elapse", async () => {
    await render(500);
    await render(800);

    await act(async () => { vi.advanceTimersByTime(399); });
    await flush();

    expect(cashColor()).toBe(GAIN_COLOR);
  });

  it("rapid changes cancel the stale timer — only the last change's flash survives", async () => {
    await render(500);

    // First increase → green flash
    await render(800);
    expect(cashColor()).toBe(GAIN_COLOR);

    // Rapid second change (decrease) before the 400 ms timer fires
    await act(async () => { vi.advanceTimersByTime(100); });
    await render(300);
    // Should now be red (not green), and the old green timer was cancelled
    expect(cashColor()).toBe(LOSS_COLOR);

    // The new timer fires at 400 ms from the second change
    await act(async () => { vi.advanceTimersByTime(400); });
    await flush();
    expect(cashColor()).not.toBe(GAIN_COLOR);
    expect(cashColor()).not.toBe(LOSS_COLOR);
  });

  it("no flash when cash is unchanged between renders", async () => {
    await render(500);
    await render(500);
    expect(cashColor()).not.toBe(GAIN_COLOR);
    expect(cashColor()).not.toBe(LOSS_COLOR);
  });

  it("no flash and no error when cash prop is omitted", async () => {
    await render(undefined);
    // CASH span should not be in the DOM at all
    expect(cashSpan()).toBeNull();
  });
});
