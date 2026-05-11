/**
 * PixelBotAvatar — shared bot avatar that crops frame 0 of the down-facing
 * row from /public/pixel-agents/characters/char_0.png. The same Pixel Agents
 * sprite sheet is used by PixelOffice and PabloOffice's LiveOffice canvas, so
 * any UI surface that shows a bot avatar (surveillance feed, activity feed,
 * per-bot office door sign, etc.) renders the bot in the same visual cast as
 * the actual game world.
 *
 * The sheet is 4 walk frames × 3 directions (down/up/right) at 28×32 native
 * px each (full image: 112×96). We display at `size` × `size` CSS px and
 * background-size up by `size / FRAME_H`, then nudge `backgroundPosition`
 * horizontally so the slightly-narrower 28-wide sprite sits centred inside
 * the 32-tall box. `image-rendering: pixelated` keeps the upscale crisp.
 *
 * `tint` re-colours the sprite via hue-rotate so status reads at a glance:
 *   lime  → ON SHIFT (active)
 *   amber → STANDBY (paused)
 *   red   → FAULT (error)
 *   zinc  → desaturated, used for empty/dormant slots
 */

export type PixelBotAvatarTint = 'lime' | 'amber' | 'red' | 'zinc';

interface PixelBotAvatarProps {
  size?: number;
  tint?: PixelBotAvatarTint;
  className?: string;
}

const FRAME_W = 28;
const FRAME_H = 32;
const SHEET_W = FRAME_W * 4; // 112
const SHEET_H = FRAME_H * 3; // 96

export function PixelBotAvatar({ size = 28, tint = 'lime', className }: PixelBotAvatarProps) {
  const BASE = (import.meta as any).env?.BASE_URL ?? '/';
  const scale = size / FRAME_H;
  const bgW = SHEET_W * scale;
  const bgH = SHEET_H * scale;
  const offsetX = (size - FRAME_W * scale) / 2;
  const hueRotate =
    tint === 'lime'  ? '100deg'
    : tint === 'amber' ? '30deg'
    : tint === 'red'   ? '330deg'
    : '0deg';
  const saturate = tint === 'zinc' ? '0' : '1.6';
  return (
    <div
      aria-hidden
      className={className}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${BASE}pixel-agents/characters/char_0.png)`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${offsetX}px 0px`,
        backgroundSize: `${bgW}px ${bgH}px`,
        imageRendering: 'pixelated',
        filter: `sepia(1) hue-rotate(${hueRotate}) saturate(${saturate}) brightness(1.05)`,
      }}
    />
  );
}

export function tintForBotStatus(s: string): PixelBotAvatarTint {
  if (s === 'active') return 'lime';
  if (s === 'paused') return 'amber';
  if (s === 'error')  return 'red';
  return 'zinc';
}
