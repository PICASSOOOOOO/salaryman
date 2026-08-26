import { useEffect, useRef } from 'react';
import type { OfficeOccupant } from './IsoOffice';

/**
 * Top-left see-through neon WIREFRAME of the office floor that shows live
 * occupants (player + bots) as glowing dots. Reads positions from a ref so the
 * parent never re-renders; redraws on its own animation frame (throttled).
 */
export function OfficeMinimap({
  occupantsRef,
  width = 152,
  height = 96,
}: {
  occupantsRef: React.MutableRefObject<OfficeOccupant[]>;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const pad = 9;
    const top = 14; // headroom for the count label
    let raf = 0;
    let last = 0;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 90) return;
      last = t;

      const w = width - pad * 2;
      const h = height - top - pad;
      ctx.clearRect(0, 0, width, height);

      // see-through dark glass panel
      ctx.fillStyle = 'rgba(2,12,14,0.5)';
      ctx.fillRect(0, 0, width, height);

      // header
      const occ = occupantsRef.current;
      ctx.fillStyle = 'rgba(56,230,255,0.85)';
      ctx.font = "8px 'Fira Code', monospace";
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('OFFICE FLOOR', pad, 10);
      ctx.fillStyle = 'rgba(109,255,143,0.9)';
      ctx.textAlign = 'right';
      ctx.fillText(`${occ.length} ON FLOOR`, width - pad, 10);
      ctx.textAlign = 'left';

      // faint floor grid (see-through)
      ctx.strokeStyle = 'rgba(56,230,255,0.1)';
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 6; i++) {
        const x = pad + (w * i) / 6;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + h);
        ctx.stroke();
      }
      for (let i = 1; i < 4; i++) {
        const y = top + (h * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(pad + w, y);
        ctx.stroke();
      }

      // neon wireframe building outline
      ctx.strokeStyle = 'rgba(56,230,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.shadowColor = 'rgba(56,230,255,0.7)';
      ctx.shadowBlur = 6;
      ctx.strokeRect(pad, top, w, h);
      ctx.shadowBlur = 0;

      // bullpen divider down the middle
      ctx.strokeStyle = 'rgba(56,230,255,0.28)';
      ctx.lineWidth = 0.8;
      const dvx = pad + w * 0.46;
      ctx.beginPath();
      ctx.moveTo(dvx, top);
      ctx.lineTo(dvx, top + h);
      ctx.stroke();

      // live occupants
      for (const o of occ) {
        const x = pad + Math.max(0, Math.min(1, o.x)) * w;
        const y = top + Math.max(0, Math.min(1, o.y)) * h;
        const isPlayer = o.kind === 'player';
        const color = isPlayer
          ? '#ffd24a'
          : o.kind === 'active'
            ? '#6dff8f'
            : 'rgba(120,180,255,0.75)';
        if (isPlayer) {
          ctx.strokeStyle = 'rgba(255,210,74,0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, 5 + Math.sin(t / 320) * 1.6, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = isPlayer ? 9 : 4;
        ctx.beginPath();
        ctx.arc(x, y, isPlayer ? 3.2 : 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [width, height, occupantsRef]);

  return (
    <div
      style={{
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid rgba(56,230,255,0.4)',
        boxShadow: '0 0 12px rgba(56,230,255,0.18)',
        background: 'rgba(2,12,14,0.35)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <canvas ref={canvasRef} style={{ width, height, display: 'block' }} />
    </div>
  );
}
