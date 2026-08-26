// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BurnedPaperMap } from './BurnedPaperMap';

const BOUNDS = { minX: 1000, minY: 2000, maxX: 3000, maxY: 3200 };
const RECT = {
  left: 20,
  top: 40,
  width: 400,
  height: 300,
  right: 420,
  bottom: 340,
  x: 20,
  y: 40,
  toJSON: () => ({}),
} as DOMRect;

describe('BurnedPaperMap waypoint coordinates', () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    container?.remove();
    container = null;
  });

  it('maps the visible fitted-map edges and ignores the letterbox bars', async () => {
    const onWaypointSet = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BurnedPaperMap
          bounds={BOUNDS}
          exploredTiles={[]}
          onWaypointSet={onWaypointSet}
        />,
      );
    });

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    vi.spyOn(svg!, 'getBoundingClientRect').mockReturnValue(RECT);

    // 2000:1200 fitted into 400:300 renders 400×240, centered at y=70..310.
    svg!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 70 }));
    svg!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 420, clientY: 310 }));
    svg!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 220, clientY: 55 }));

    expect(onWaypointSet).toHaveBeenNthCalledWith(1, 1000, 2000);
    expect(onWaypointSet).toHaveBeenNthCalledWith(2, 3000, 3200);
    expect(onWaypointSet).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });
});