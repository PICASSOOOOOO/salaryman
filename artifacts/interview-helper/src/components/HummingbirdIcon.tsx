type Props = {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Hovering hummingbird silhouette, side view, facing right.
 * Iconic features: long needle beak, small round head, plump body,
 * swept-back pointed wing (hover blur), forked fan tail.
 */
export function HummingbirdIcon({ size = 16, color = "currentColor", className, style }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="hummingbird"
    >
      <g fill={color}>
        {/* Body — plump teardrop tilted slightly */}
        <ellipse cx="34" cy="36" rx="12" ry="7.5" />
        {/* Head — small round */}
        <circle cx="28" cy="27" r="5.5" />
        {/* Long needle beak pointing forward-right */}
        <path d="M30 25 L62 21 L62 23 L31 28 Z" />
        {/* Swept-back pointed wing — long curved blade above body */}
        <path d="M30 30 C 22 18, 14 8, 4 6 C 12 14, 18 22, 22 32 C 24 32, 27 31, 30 30 Z" />
        {/* Fan tail — pointed feathers sweeping back-left */}
        <path d="M44 36 L62 40 L60 42 L62 46 L44 42 Z" />
        <path d="M44 36 L60 32 L62 30 L44 34 Z" />
      </g>
    </svg>
  );
}

export default HummingbirdIcon;
