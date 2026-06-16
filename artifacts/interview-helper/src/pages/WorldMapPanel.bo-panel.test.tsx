// @vitest-environment jsdom
//
// Guards the BANCO OMBRA collector threat panel inside WorldMapPanel.
//
// The panel reads `wantedLevel`, `bountyAmount`, and `boWaveCount` from
// localStorage via `readBoCollectorsFromSave`.  It refreshes on the window
// `storage` event — meaning it reacts immediately when the game loop writes
// new threat data, rather than waiting up to 1 second for the polling interval.
//
// Tests verify:
//   1. Panel is hidden when wantedLevel = 0 (no collectors active).
//   2. Writing threat fields to sm_save then dispatching a storage event makes
//      the panel appear without advancing any timers.
//   3. wantedLevel stars, bountyAmount ƒ, and boWaveCount all reflect the
//      data from the storage write (not stale values).
//   4. A second storage write / event updates the panel to the new values.
//   5. The panel disappears again when wantedLevel drops to 0.
//   6. sm_live (fresh, recent writtenAt) is preferred over sm_save for the
//      wantedLevel field.
//   7. After unmount the storage listener is removed — a later event has no
//      effect (no crash, no state update on a dead tree).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@workspace/replit-auth-web', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useBoomerMode: () => [false],
}));

vi.mock('@/components/MapChrome', () => {
  const g = { icon: '●', tag: 'TEST', color: '#ffffff' };
  return {
    CompassRose: () => null,
    PamphletBanner: () => null,
    LANDMARK_GUIDE: {
      tower: g, security: g, commerce: g, civic: g, realestate: g, terminal: g,
    },
  };
});

vi.mock('@/lib/avatar', () => ({
  resolveAvatarUrl: (x: unknown) => String(x ?? ''),
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => (mockApiFetch as any)(...args),
}));

import WorldMapPanel from './WorldMapPanel';

function stubApi() {
  mockApiFetch.mockImplementation((path: string) => {
    if (String(path).includes('/world/online')) {
      return Promise.resolve({ ok: true, json: async () => ({ players: [] }) });
    }
    if (String(path).includes('/world/server-status')) {
      return Promise.resolve({ ok: true, json: async () => ({ online: 0, max: 100 }) });
    }
    if (String(path).includes('/real-estate/listings')) {
      return Promise.resolve({ ok: true, json: async () => ({ listings: [] }) });
    }
    return Promise.resolve({ ok: false, json: async () => ({}) });
  });
}

function writeSave(data: object) {
  localStorage.setItem('sm_save', JSON.stringify(data));
}

function writeLive(data: object) {
  localStorage.setItem('sm_live', JSON.stringify({ writtenAt: Date.now(), ...data }));
}

function fireStorageEvent() {
  window.dispatchEvent(new StorageEvent('storage', { key: 'sm_save' }));
}

function hasPanel(container: HTMLElement) {
  return container.textContent?.includes('BANCO OMBRA') ?? false;
}

let root: Root;
let container: HTMLDivElement;

async function mount() {
  await act(async () => {
    root.render(<WorldMapPanel />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mockApiFetch.mockReset();
  stubApi();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  localStorage.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('WorldMapPanel — BANCO OMBRA threat panel', () => {
  it('hides the panel when wantedLevel is 0 (no debt collectors active)', async () => {
    await mount();
    expect(hasPanel(container)).toBe(false);
  });

  it('shows the panel immediately on a storage event without advancing any timers', async () => {
    await mount();
    expect(hasPanel(container)).toBe(false);

    writeSave({ wantedLevel: 1, bountyAmount: 500, boWaveCount: 1 });

    await act(async () => {
      fireStorageEvent();
    });

    expect(hasPanel(container)).toBe(true);
  });

  it('reflects wantedLevel from sm_save in the threat level stars', async () => {
    await mount();

    writeSave({ wantedLevel: 2, bountyAmount: 0, boWaveCount: 0 });
    await act(async () => {
      fireStorageEvent();
    });

    expect(hasPanel(container)).toBe(true);
    const text = container.textContent ?? '';
    expect(text).toContain('SECOND NOTICE');
  });

  it('reflects bountyAmount from sm_save as the ƒ debt figure', async () => {
    await mount();

    writeSave({ wantedLevel: 1, bountyAmount: 1500, boWaveCount: 1 });
    await act(async () => {
      fireStorageEvent();
    });

    const text = container.textContent ?? '';
    expect(text).toContain('1,500');
  });

  it('reflects boWaveCount from sm_save as the wave counter', async () => {
    await mount();

    writeSave({ wantedLevel: 1, bountyAmount: 0, boWaveCount: 3 });
    await act(async () => {
      fireStorageEvent();
    });

    const text = container.textContent ?? '';
    expect(text).toContain('3 / 3');
  });

  it('updates all three fields on a second storage event with new values', async () => {
    await mount();

    writeSave({ wantedLevel: 1, bountyAmount: 500, boWaveCount: 1 });
    await act(async () => { fireStorageEvent(); });
    expect(container.textContent).toContain('FIRST NOTICE');

    writeSave({ wantedLevel: 3, bountyAmount: 9999, boWaveCount: 3 });
    await act(async () => { fireStorageEvent(); });

    const text = container.textContent ?? '';
    expect(text).toContain('FINAL NOTICE');
    expect(text).toContain('9,999');
    expect(text).toContain('3 / 3');
  });

  it('hides the panel again when wantedLevel drops to 0 on a subsequent event', async () => {
    await mount();

    writeSave({ wantedLevel: 2, bountyAmount: 1000, boWaveCount: 2 });
    await act(async () => { fireStorageEvent(); });
    expect(hasPanel(container)).toBe(true);

    writeSave({ wantedLevel: 0, bountyAmount: 0, boWaveCount: 0 });
    await act(async () => { fireStorageEvent(); });
    expect(hasPanel(container)).toBe(false);
  });

  it('prefers sm_live wantedLevel over sm_save when sm_live is fresh', async () => {
    await mount();

    writeSave({ wantedLevel: 3, bountyAmount: 5000, boWaveCount: 3 });
    writeLive({ wantedLevel: 1, boCollectors: [] });

    await act(async () => { fireStorageEvent(); });

    const text = container.textContent ?? '';
    expect(text).toContain('BANCO OMBRA');
    expect(text).toContain('FIRST NOTICE');
    expect(text).not.toContain('FINAL NOTICE');
  });

  it('removes the storage listener on unmount — later events do not crash or update', async () => {
    await mount();

    writeSave({ wantedLevel: 1, bountyAmount: 200, boWaveCount: 1 });
    await act(async () => { fireStorageEvent(); });
    expect(hasPanel(container)).toBe(true);

    await act(async () => { root.unmount(); });

    writeSave({ wantedLevel: 2, bountyAmount: 800, boWaveCount: 2 });
    await act(async () => { fireStorageEvent(); });

    expect(container.textContent).not.toContain('SECOND NOTICE');

    root = createRoot(container);
  });
});
