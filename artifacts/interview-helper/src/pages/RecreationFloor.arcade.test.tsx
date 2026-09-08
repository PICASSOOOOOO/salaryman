// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock("@/lib/city-defs", () => ({
  getActiveCityId: () => "minx_city",
  getActiveCityName: () => "MINX CITY",
}));

vi.mock("@/lib/office-property-layouts", () => ({
  getRecreationOfficeLayout: () => ({
    stations: [{ id: "rec-arcade" }, { id: "rec-elevator" }],
    rooms: [], deskCols: 0, deskRows: 0, capsuleSpots: [],
    cols: 12, rows: 12, spawn: { x: 16, y: 16, facing: "right" },
  }),
}));

vi.mock("@/components/IsoOffice", () => ({
  IsoOffice: ({ stations }: { stations: Array<{ id: string; onInteract?: () => void }> }) => (
    <div data-testid="iso-office">
      {stations.map((station) => (
        <button key={station.id} type="button" data-testid={`station-${station.id}`} onClick={station.onInteract}>
          {station.id}
        </button>
      ))}
    </div>
  ),
}));

const mockApiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import RecreationFloor from "./RecreationFloor";

const games = {
  arcade: { name: "Neon Arcade", staminaCost: 8, verb: "RUN CIRCUIT" },
  pool: { name: "Pool", staminaCost: 5, verb: "TAKE SHOT" },
  "air-hockey": { name: "Air Hockey", staminaCost: 7, verb: "SERVE PUCK" },
  foosball: { name: "Foosball", staminaCost: 6, verb: "SPIN ATTACK" },
  shuffleboard: { name: "Shuffleboard", staminaCost: 4, verb: "SLIDE PUCK" },
  bowling: { name: "Bowling", staminaCost: 12, verb: "ROLL BALL" },
  darts: { name: "Darts", staminaCost: 5, verb: "THROW DARTS" },
};

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

function stubApi() {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/api/salaryman/saves") {
      return jsonResponse({ saves: [{ slotIndex: 0, lastSavedAt: "2026-09-01T12:00:00.000Z" }] });
    }
    if (path.includes("/api/recreation/state")) {
      return jsonResponse({
        rec: { stamina: 100, effects: [], activeSession: null, charges: {} },
        games, items: [], sponsors: [], inventory: [],
        wallet: { balance: 200_000, spendable: 200_000 },
      });
    }
    if (path === "/api/recreation/games/start") {
      return jsonResponse({
        rec: {
          stamina: 100, effects: [], charges: {},
          activeSession: { id: "session-1", gameId: "arcade", sponsorId: "vendking" },
        },
      });
    }
    if (path === "/api/recreation/arcade/charge") {
      return jsonResponse({ charged: true, priceFiat: 10, wallet: { newBalance: 199_990, spendable: 199_990 } });
    }
    return jsonResponse({}, false);
  });
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  mockApiFetch.mockReset();
  stubApi();
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  (vi.spyOn(HTMLCanvasElement.prototype, "getContext") as any).mockImplementation(() => ({} as CanvasRenderingContext2D));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function mount() {
  await act(async () => root.render(<RecreationFloor />));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("REC classic arcade entry and exit", () => {
  it("opens a cabinet from the physical arcade station and exits back to the selector", async () => {
    await mount();

    await act(async () => {
      (container.querySelector('[data-testid="station-rec-arcade"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="classic-arcade-section"]')).not.toBeNull();

    await act(async () => {
      (container.querySelector('[data-testid="classic-cyber_serpent"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector("canvas")).not.toBeNull();
     expect(container.textContent).toContain("START · ƒ10");

    const exit = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "EXIT");
    expect(exit).toBeDefined();
    await act(async () => (exit as HTMLButtonElement).click());
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector('[data-testid="classic-arcade-section"]')).not.toBeNull();
  });
});