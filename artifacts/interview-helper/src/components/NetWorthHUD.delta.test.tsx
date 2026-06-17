// @vitest-environment jsdom
//
// Guards the floating cash-delta pop-up on NetWorthHUD.
//
// Contract:
//   1. A positive cash change renders a green "+ƒN" label.
//   2. A negative cash change renders a red  "-ƒN" label.
//   3. The label is removed from the DOM after the 750ms animation window.
//   4. Multiple rapid changes each spawn their own label (stacking).
//   5. No delta label appears on the first render (no prev value yet).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { NetWorthHUD } from "./NetWorthHUD";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

function deltaLabels() {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[style*='cashDeltaRise']")
  ).map((el) => el.textContent ?? "");
}

async function render(cash: number) {
  await act(async () => {
    root.render(
      <NetWorthHUD netWorth={1000} cash={cash} showStamina={false} showCredit={false} />
    );
  });
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

describe("NetWorthHUD cash delta pop-up", () => {
  it("shows no delta label on initial render", async () => {
    await render(500);
    expect(deltaLabels()).toHaveLength(0);
  });

  it("shows a green +ƒ label when cash increases", async () => {
    await render(500);
    await render(750);

    const labels = deltaLabels();
    expect(labels).toHaveLength(1);
    expect(labels[0]).toBe("+ƒ250");

    // Verify the color is green (positive)
    const el = container.querySelector<HTMLElement>("[style*='cashDeltaRise']");
    expect(el?.style.color).toBe("rgb(74, 222, 128)"); // #4ade80
  });

  it("shows a red -ƒ label when cash decreases", async () => {
    await render(1000);
    await render(880);

    const labels = deltaLabels();
    expect(labels).toHaveLength(1);
    expect(labels[0]).toBe("-ƒ120");

    const el = container.querySelector<HTMLElement>("[style*='cashDeltaRise']");
    expect(el?.style.color).toBe("rgb(255, 68, 68)"); // #ff4444
  });

  it("removes the delta label after 750ms", async () => {
    await render(500);
    await render(600);
    expect(deltaLabels()).toHaveLength(1);

    await act(async () => { vi.advanceTimersByTime(750); });
    expect(deltaLabels()).toHaveLength(0);
  });

  it("stacks labels for rapid successive changes", async () => {
    await render(500);
    await render(600);
    await render(700);

    // Both deltas visible before timeout
    expect(deltaLabels()).toHaveLength(2);
  });

  it("formats large deltas with K suffix", async () => {
    await render(5000);
    await render(8500);

    const labels = deltaLabels();
    expect(labels[0]).toBe("+ƒ4K");
  });
});
