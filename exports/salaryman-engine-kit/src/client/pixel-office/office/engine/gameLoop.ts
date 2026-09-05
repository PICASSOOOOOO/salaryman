import { MAX_DELTA_TIME_SEC } from '../../constants.js';

/** @internal */
export interface GameLoopCallbacks {
  update: (dt: number) => void;
  render: (ctx: CanvasRenderingContext2D) => void;
}

export interface GameLoopOptions {
  maxFps?: number;
}

export function startGameLoop(
  canvas: HTMLCanvasElement,
  callbacks: GameLoopCallbacks,
  options: GameLoopOptions = {},
): () => void {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  let lastTime = 0;
  let lastRenderedAt = 0;
  let rafId = 0;
  let stopped = false;
  const minFrameMs = options.maxFps && options.maxFps > 0 ? 1000 / options.maxFps : 0;

  const schedule = () => {
    if (stopped || rafId !== 0 || document.visibilityState === 'hidden') return;
    rafId = requestAnimationFrame(frame);
  };

  const frame = (time: number) => {
    rafId = 0;
    if (stopped) return;
    if (document.visibilityState === 'hidden') return;
    if (minFrameMs > 0 && lastRenderedAt !== 0 && time - lastRenderedAt < minFrameMs) {
      schedule();
      return;
    }
    const dt = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, MAX_DELTA_TIME_SEC);
    lastTime = time;
    lastRenderedAt = time;

    callbacks.update(dt);

    ctx.imageSmoothingEnabled = false;
    callbacks.render(ctx);

    schedule();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      rafId = 0;
      lastTime = 0;
      lastRenderedAt = 0;
      return;
    }
    schedule();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  schedule();

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = 0;
  };
}
