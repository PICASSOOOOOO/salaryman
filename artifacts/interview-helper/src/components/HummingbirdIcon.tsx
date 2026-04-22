type Props = {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
};

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
      <path
        fill={color}
        d="M58 18c-3 .4-6 1.4-9 3-2 1-4 2-6 3l-7-7c-1-1-3-1-4 0-1 1-1 3 0 4l5 5-3 3-9-9c-1-1-3-1-4 0-1 1-1 3 0 4l9 9-2 2c-3-1-6-1-9 0-4 1-7 4-9 7-1 2 0 4 2 4l7-1-2 4c-1 2 1 4 3 3l5-3v4c0 2 2 3 4 2l5-4c1 3 4 5 7 5 4 0 8-2 11-6l8-9c4-5 5-11 4-17 0-2-2-3-4-2zm-12 8c1 0 2 1 2 2s-1 2-2 2-2-1-2-2 1-2 2-2z"
      />
    </svg>
  );
}

export default HummingbirdIcon;
