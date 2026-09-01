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

vi.mock('@/hooks/use-auth', () => ({
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

  it('falls back to sm_save threat level when sm_live is removed (game tab closes)', async () => {
    await mount();

    // sm_live holds a high threat; sm_save holds a lower one.
    writeLive({ wantedLevel: 3, boCollectors: [] });
    writeSave({ wantedLevel: 1, bountyAmount: 500, boWaveCount: 2 });

    // Initial render — component should show sm_live's FINAL NOTICE.
    await act(async () => { fireStorageEvent(); });
    expect(container.textContent).toContain('FINAL NOTICE');

    // Game loop tears down — removes sm_live and fires a storage event
    // keyed on 'sm_live' (the key that was deleted).
    localStorage.removeItem('sm_live');
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'sm_live' }));
    });

    const text = container.textContent ?? '';
    // Panel must reflect sm_save values, not the stale sm_live values.
    expect(text).toContain('BANCO OMBRA');
    expect(text).toContain('FIRST NOTICE');
    expect(text).not.toContain('FINAL NOTICE');
    // bountyAmount and boWaveCount from sm_save.
    expect(text).toContain('500');
    expect(text).toContain('2 / 3');
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

describe('WorldMapPanel — BANCO OMBRA threat level labels', () => {
  it('shows FIRST NOTICE when wantedLevel is 1', async () => {
    await mount();

    writeSave({ wantedLevel: 1, bountyAmount: 100, boWaveCount: 1 });
    await act(async () => { fireStorageEvent(); });

    const text = container.textContent ?? '';
    expect(text).toContain('FIRST NOTICE');
    expect(text).not.toContain('SECOND NOTICE');
    expect(text).not.toContain('FINAL NOTICE');
  });

  it('shows SECOND NOTICE when wantedLevel is 2', async () => {
    await mount();

    writeSave({ wantedLevel: 2, bountyAmount: 500, boWaveCount: 2 });
    await act(async () => { fireStorageEvent(); });

    const text = container.textContent ?? '';
    expect(text).toContain('SECOND NOTICE');
    expect(text).not.toContain('FIRST NOTICE');
    expect(text).not.toContain('FINAL NOTICE');
  });

  it('shows FINAL NOTICE when wantedLevel is 3', async () => {
    await mount();

    writeSave({ wantedLevel: 3, bountyAmount: 9999, boWaveCount: 3 });
    await act(async () => { fireStorageEvent(); });

    const text = container.textContent ?? '';
    expect(text).toContain('FINAL NOTICE');
    expect(text).not.toContain('FIRST NOTICE');
    expect(text).not.toContain('SECOND NOTICE');
  });

  it('uses the softer border (border-red-500/40) when wantedLevel is below 3', async () => {
    await mount();

    writeSave({ wantedLevel: 2, bountyAmount: 500, boWaveCount: 1 });
    await act(async () => { fireStorageEvent(); });

    const panel = container.querySelector('.border-red-500\\/40');
    expect(panel).not.toBeNull();
    expect(container.querySelector('.border-red-500\\/70')).toBeNull();
  });

  it('uses the intense border (border-red-500/70) when wantedLevel reaches 3', async () => {
    await mount();

    writeSave({ wantedLevel: 3, bountyAmount: 9999, boWaveCount: 3 });
    await act(async () => { fireStorageEvent(); });

    const panel = container.querySelector('.border-red-500\\/70');
    expect(panel).not.toBeNull();
    expect(container.querySelector('.border-red-500\\/40')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Collector dot SVG markers
// ---------------------------------------------------------------------------

function collectorDots(container: HTMLElement): NodeListOf<Element> {
  return container.querySelectorAll('circle[stroke="#ff1e1e"]');
}

describe('WorldMapPanel — collector dot SVG markers', () => {
  it('renders SVG collector circles when boCollectors is non-empty and wantedLevel > 0', async () => {
    await mount();

    writeSave({ wantedLevel: 1, bountyAmount: 500, boWaveCount: 1, boCollectors: [{ x: 200, y: 300 }] });
    await act(async () => { fireStorageEvent(); });

    const dots = collectorDots(container);
    expect(dots.length).toBeGreaterThan(0);

    const cx = dots[0].getAttribute('cx');
    const cy = dots[0].getAttribute('cy');
    expect(cx).toBe('200');
    expect(cy).toBe('300');
  });

  it('suppresses collector SVG circles when wantedLevel is 0, even if boCollectors is non-empty', async () => {
    await mount();

    writeSave({ wantedLevel: 0, bountyAmount: 0, boWaveCount: 0, boCollectors: [{ x: 200, y: 300 }] });
    await act(async () => { fireStorageEvent(); });

    expect(collectorDots(container).length).toBe(0);
  });

  it('renders one set of circles per collector when multiple are present', async () => {
    await mount();

    writeSave({
      wantedLevel: 2,
      bountyAmount: 1000,
      boWaveCount: 2,
      boCollectors: [{ x: 100, y: 150 }, { x: 400, y: 250 }],
    });
    await act(async () => { fireStorageEvent(); });

    const dots = collectorDots(container);
    const cxValues = Array.from(dots).map((el) => el.getAttribute('cx'));
    expect(cxValues).toContain('100');
    expect(cxValues).toContain('400');
  });

  it('removes collector circles when wantedLevel drops to 0 on a subsequent event', async () => {
    await mount();

    writeSave({ wantedLevel: 1, bountyAmount: 500, boWaveCount: 1, boCollectors: [{ x: 200, y: 300 }] });
    await act(async () => { fireStorageEvent(); });
    expect(collectorDots(container).length).toBeGreaterThan(0);

    writeSave({ wantedLevel: 0, bountyAmount: 0, boWaveCount: 0, boCollectors: [{ x: 200, y: 300 }] });
    await act(async () => { fireStorageEvent(); });
    expect(collectorDots(container).length).toBe(0);
  });

  it('moves the collector dot when sm_live is rewritten with updated coordinates', async () => {
    await mount();

    writeLive({ wantedLevel: 1, boCollectors: [{ x: 100, y: 100 }] });
    await act(async () => { fireStorageEvent(); });

    let dots = collectorDots(container);
    expect(dots.length).toBeGreaterThan(0);
    expect(dots[0].getAttribute('cx')).toBe('100');
    expect(dots[0].getAttribute('cy')).toBe('100');

    writeLive({ wantedLevel: 1, boCollectors: [{ x: 400, y: 400 }] });
    await act(async () => { fireStorageEvent(); });

    dots = collectorDots(container);
    expect(dots.length).toBeGreaterThan(0);
    expect(dots[0].getAttribute('cx')).toBe('400');
    expect(dots[0].getAttribute('cy')).toBe('400');
  });

  it('falls back to sm_save positions when sm_live writtenAt is more than 5 minutes old', async () => {
    await mount();

    localStorage.setItem('sm_live', JSON.stringify({
      writtenAt: Date.now() - 6 * 60 * 1000,
      wantedLevel: 2,
      boCollectors: [{ x: 999, y: 999 }],
    }));

    writeSave({ wantedLevel: 1, bountyAmount: 500, boWaveCount: 1, boCollectors: [{ x: 123, y: 456 }] });

    await act(async () => { fireStorageEvent(); });

    const dots = collectorDots(container);
    expect(dots.length).toBeGreaterThan(0);

    const cxValues = Array.from(dots).map((el) => el.getAttribute('cx'));
    const cyValues = Array.from(dots).map((el) => el.getAttribute('cy'));

    expect(cxValues).toContain('123');
    expect(cyValues).toContain('456');
    expect(cxValues).not.toContain('999');
    expect(cyValues).not.toContain('999');
  });

  it('falls back to sm_save positions when sm_live key is removed entirely', async () => {
    await mount();

    // sm_live is fresh — component should initially use its collector positions.
    writeLive({ wantedLevel: 1, boCollectors: [{ x: 999, y: 999 }] });
    writeSave({ wantedLevel: 1, bountyAmount: 500, boWaveCount: 1, boCollectors: [{ x: 123, y: 456 }] });

    await act(async () => { fireStorageEvent(); });

    let dots = collectorDots(container);
    expect(dots.length).toBeGreaterThan(0);
    expect(Array.from(dots).map((el) => el.getAttribute('cx'))).toContain('999');

    // Game loop tears down — removes sm_live entirely and fires a storage event
    // keyed on 'sm_live' (the key that was deleted).
    localStorage.removeItem('sm_live');
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'sm_live' }));
    });

    dots = collectorDots(container);
    expect(dots.length).toBeGreaterThan(0);

    const cxValues = Array.from(dots).map((el) => el.getAttribute('cx'));
    const cyValues = Array.from(dots).map((el) => el.getAttribute('cy'));

    expect(cxValues).toContain('123');
    expect(cyValues).toContain('456');
    expect(cxValues).not.toContain('999');
    expect(cyValues).not.toContain('999');
  });
});
