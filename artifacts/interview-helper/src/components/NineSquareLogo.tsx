interface NineSquareLogoProps {
  size?: number;
  color?: string;
  gap?: number;
  className?: string;
}

export function NineSquareLogo({
  size = 28,
  color = '#34d399',
  gap = 2,
  className,
}: NineSquareLogoProps) {
  const cellSize = Math.floor((size - gap * 2) / 3);
  const totalSize = cellSize * 3 + gap * 2;

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
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: cellSize,
            height: cellSize,
            background: color,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}
