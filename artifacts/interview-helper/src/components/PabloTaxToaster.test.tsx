// @vitest-environment jsdom
//
// Guards the global Pablo-Tax draw toaster. AI usage (Pablo chat, image gen,
// character portraits) is billed FIRE-AND-FORGET after the response, so the ƒ
// balance can drop with no explanation. This component re-reads the billing
// meter when a PABLO_TAX_DRAW_CHECK_EVENT fires and pops a one-line toast IF the
// waterfall actually drew ƒ (billedCents increased).
//
// Contract:
//   1. A check after the meter's billedCents goes UP → exactly ONE toast naming
//      the ƒ delta (converted at fiatPerUsd).
//   2. A check where billedCents is unchanged (accrued-but-not-drawn, the common
//      case) → NO toast.
//   3. The pre-existing billedCents present at mount is baselined, never toasted.
//   4. A period rollover (billedCents resets / period changes) re-anchors the
//      baseline and does NOT toast the apparent decrease.
//
// The component renders to null. We drive it by dispatching the real event and
// feeding successive meter payloads through a mocked apiFetch.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  // Queue of meter payloads returned by successive apiFetch calls.
  meterQueue: [] as any[],
}));

vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));
vi.mock("@/lib/api-client", () => ({
  PABLO_TAX_DRAW_CHECK_EVENT: "salaryman:pablo-tax-check",
  apiFetch: vi.fn(async () => {
    const body = h.meterQueue.shift() ?? null;
    return {
      ok: body != null,
      json: async () => body,
    } as Response;
  }),
}));

import { PabloTaxToaster } from "./PabloTaxToaster";
import { PABLO_TAX_DRAW_CHECK_EVENT } from "@/lib/api-client";

let root: Root;
let container: HTMLDivElement;

function meter(billedCents: number, period = "2026-06") {
  return { period, billedCents, fiatPerUsd: 1000 };
}

// Render and let the baseline fetch resolve.
async function mount(baseline: any) {
  h.meterQueue = [baseline];
  await act(async () => {
    root.render(<PabloTaxToaster />);
  });
  // flush the baseline microtask(s)
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

// Fire the check event with the NEXT meter payload queued.
async function check(next: any) {
  h.meterQueue.push(next);
  await act(async () => {
    window.dispatchEvent(new CustomEvent(PABLO_TAX_DRAW_CHECK_EVENT));
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  h.toast.mockClear();
  h.meterQueue = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

describe("Pablo-Tax draw toaster", () => {
  it("toasts the ƒ delta when billedCents increases", async () => {
    await mount(meter(0));
    await check(meter(2000)); // $20 drawn → ƒ20,000

    expect(h.toast).toHaveBeenCalledTimes(1);
    const arg = h.toast.mock.calls[0][0];
    expect(arg.title).toBe("Pablo Tax");
    expect(arg.description).toContain("20,000");
  });

  it("does NOT toast when billedCents is unchanged (accrued but not drawn)", async () => {
    await mount(meter(2000));
    await check(meter(2000));

    expect(h.toast).not.toHaveBeenCalled();
  });

  it("does NOT toast the pre-existing billed total at mount", async () => {
    await mount(meter(5000));
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("re-anchors (no toast) on a period rollover even if billedCents looks lower", async () => {
    await mount(meter(4000, "2026-06"));
    // New month: meter reset to a small draw under a different period.
    await check(meter(500, "2026-07"));
    expect(h.toast).not.toHaveBeenCalled();

    // A genuine draw in the new period now toasts against the re-anchored baseline.
    await check(meter(2500, "2026-07"));
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast.mock.calls[0][0].description).toContain("20,000");
  });
});
