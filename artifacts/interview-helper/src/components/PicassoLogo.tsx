interface PicassoLogoProps {
  size?: number;
  gap?: number;
  className?: string;
  glow?: boolean;
}

const GRID: { bg: string; shape: 'square' | 'circle' | 'triangle' }[] = [
  { bg: '#7C3AED', shape: 'square' },
  { bg: '#FFFFFF', shape: 'square' },
  { bg: '#22C55E', shape: 'circle' },
  { bg: '#FFFFFF', shape: 'square' },
  { bg: '#3B82F6', shape: 'square' },
  { bg: '#FFFFFF', shape: 'square' },
  { bg: '#EC4899', shape: 'triangle' },
  { bg: '#FFFFFF', shape: 'square' },
  { bg: '#1E3A5F', shape: 'square' },
];

export function PicassoLogo({
  size = 28,
  gap = 2,
  className,
  glow = false,
}: PicassoLogoProps) {
  const cellSize = Math.floor((size - gap * 2) / 3);

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: 'grid',
        gridTemplateColumns: `repeat(3, ${cellSize}px)`,
        gridTemplateRows: `repeat(3, ${cellSize}px)`,
        gap: `${gap}px`,
        flexShrink: 0,
        ...(glow ? {
          filter: 'drop-shadow(0 0 6px rgba(124, 58, 237, 0.5)) drop-shadow(0 0 12px rgba(59, 130, 246, 0.3))',
          animation: 'picasso-pulse 3s ease-in-out infinite',
        } : {}),
      }}
    >
      {glow && (
        <style>{`
          @keyframes picasso-pulse {
            0%, 100% { filter: drop-shadow(0 0 6px rgba(124,58,237,0.5)) drop-shadow(0 0 12px rgba(59,130,246,0.3)); }
            50% { filter: drop-shadow(0 0 10px rgba(124,58,237,0.7)) drop-shadow(0 0 20px rgba(59,130,246,0.5)); }
          }
        `}</style>
      )}
      {GRID.map((cell, i) => {
        if (cell.shape === 'circle') {
          return (
            <div
              key={i}
              style={{
                width: cellSize,
                height: cellSize,
                background: cell.bg,
                borderRadius: '50%',
              }}
            />
          );
        }
        if (cell.shape === 'triangle') {
          const half = cellSize / 2;
          return (
            <svg key={i} width={cellSize} height={cellSize} viewBox={`0 0 ${cellSize} ${cellSize}`}>
              <polygon
                points={`${half},0 ${cellSize},${cellSize} 0,${cellSize}`}
                fill={cell.bg}
              />
            </svg>
          );
        }
        return (
          <div
            key={i}
            style={{
              width: cellSize,
              height: cellSize,
              background: cell.bg,
              borderRadius: 1,
            }}
          />
        );
      })}
    </div>
  );
}
