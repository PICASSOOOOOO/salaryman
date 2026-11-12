// Inline-SVG pixel sprites for office interaction stations that don't have a
// dedicated furniture PNG yet (arcade cabinet, vending machine, water cooler,
// music rig, comms phone). Drawn as chunky pixel rects so they sit next to the
// existing pixel-art furniture without looking out of place, and kept period-
// appropriate (JP ~1989: CRT arcade, canned-drink vending, boombox).
//
// Each glyph declares its tile footprint (w x h in TILEs) so the office engine
// can position it on the grid. Render size is driven by `tile` (= TILE * scale).

export type StationGlyph =
  | 'arcade'
  | 'vending'
  | 'water_cooler'
  | 'music'
  | 'comms'
  | 'atm'
  | 'payphone'
  | 'bot_closet'
  | 'elevator';

/** Footprint of each glyph in TILEs (drives grid placement + render size). */
export const STATION_GLYPH_TILES: Record<StationGlyph, { w: number; h: number }> = {
  arcade: { w: 1.6, h: 2.4 },
  vending: { w: 1.6, h: 2.4 },
  water_cooler: { w: 1, h: 2 },
  music: { w: 2, h: 1.4 },
  comms: { w: 1.2, h: 1.2 },
  atm: { w: 1.6, h: 2.4 },
  payphone: { w: 1.2, h: 2.4 },
  bot_closet: { w: 2, h: 2.4 },
  elevator: { w: 2, h: 2.6 },
};

interface Props {
  glyph: StationGlyph;
  /** CSS px per TILE (TILE * scale). */
  tile: number;
}

export function OfficeStationSprite({ glyph, tile }: Props) {
  const { w, h } = STATION_GLYPH_TILES[glyph];
  const px = (n: number) => n; // viewBox is a 16-unit grid per tile
  const W = w * 16;
  const H = h * 16;
  const common = {
    width: w * tile,
    height: h * tile,
    viewBox: `0 0 ${W} ${H}`,
    shapeRendering: 'crispEdges' as const,
    style: {
      imageRendering: 'pixelated' as const,
      filter: 'drop-shadow(2px 4px 3px rgba(0,0,0,0.45))',
      display: 'block' as const,
    },
  };

  switch (glyph) {
    case 'arcade':
      return (
        <svg {...common} aria-hidden="true">
          {/* cabinet body */}
          <rect x={px(2)} y={px(4)} width={W - 4} height={H - 6} fill="#241a3a" />
          <rect x={px(2)} y={px(4)} width={W - 4} height={3} fill="#3a2a5e" />
          {/* marquee */}
          <rect x={px(2)} y={px(0)} width={W - 4} height={5} fill="#ff3d7f" />
          <rect x={px(4)} y={px(1)} width={W - 8} height={3} fill="#ffd23f" />
          {/* screen */}
          <rect x={px(5)} y={px(8)} width={W - 10} height={10} fill="#06121f" />
          <rect x={px(6)} y={px(9)} width={W - 12} height={8} fill="#0b3a4a" />
          <rect x={px(7)} y={px(10)} width={4} height={2} fill="#38f0ff" />
          <rect x={px(13)} y={px(13)} width={3} height={2} fill="#ff5577" />
          {/* control deck */}
          <rect x={px(3)} y={px(20)} width={W - 6} height={4} fill="#1a1230" />
          <circle cx={px(8)} cy={px(22)} r={1.5} fill="#ff3d7f" />
          <circle cx={px(14)} cy={px(22)} r={1.5} fill="#38f0ff" />
        </svg>
      );
    case 'vending':
      return (
        <svg {...common} aria-hidden="true">
          <rect x={px(2)} y={px(1)} width={W - 4} height={H - 2} fill="#8a1f2b" />
          <rect x={px(2)} y={px(1)} width={W - 4} height={3} fill="#b8323f" />
          {/* glass front with cans */}
          <rect x={px(4)} y={px(5)} width={W - 12} height={H - 12} fill="#0c1822" />
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => (
              <rect
                key={`${r}-${c}`}
                x={px(6 + c * 4)}
                y={px(7 + r * 5)}
                width={3}
                height={4}
                fill={['#ffd23f', '#38f0ff', '#7CFC9B'][(r + c) % 3]}
              />
            )),
          )}
          {/* keypad + dispense slot */}
          <rect x={px(W - 7)} y={px(6)} width={4} height={6} fill="#160c10" />
          <rect x={px(W - 6)} y={px(7)} width={2} height={1} fill="#ff5577" />
          <rect x={px(4)} y={px(H - 6)} width={W - 8} height={3} fill="#060a0e" />
        </svg>
      );
    case 'water_cooler':
      return (
        <svg {...common} aria-hidden="true">
          {/* bottle */}
          <rect x={px(4)} y={px(0)} width={8} height={9} fill="#9fe7ff" opacity={0.85} />
          <rect x={px(6)} y={px(8)} width={4} height={2} fill="#cfeefb" />
          {/* cabinet */}
          <rect x={px(3)} y={px(10)} width={10} height={H - 11} fill="#e8eef2" />
          <rect x={px(3)} y={px(10)} width={10} height={2} fill="#c2ccd2" />
          <rect x={px(6)} y={px(14)} width={4} height={3} fill="#2b3a44" />
          <rect x={px(7)} y={px(15)} width={2} height={1} fill="#38bdf8" />
        </svg>
      );
    case 'music':
      return (
        <svg {...common} aria-hidden="true">
          {/* boombox body */}
          <rect x={px(1)} y={px(4)} width={W - 2} height={H - 6} fill="#1c1c22" />
          <rect x={px(1)} y={px(4)} width={W - 2} height={3} fill="#2e2e38" />
          {/* handle */}
          <rect x={px(8)} y={px(1)} width={W - 16} height={3} fill="#2e2e38" />
          {/* speakers */}
          <circle cx={px(7)} cy={px(13)} r={5} fill="#0b0b0f" />
          <circle cx={px(7)} cy={px(13)} r={2.5} fill="#444" />
          <circle cx={px(W - 7)} cy={px(13)} r={5} fill="#0b0b0f" />
          <circle cx={px(W - 7)} cy={px(13)} r={2.5} fill="#444" />
          {/* tape deck + EQ */}
          <rect x={px(W / 2 - 4)} y={px(8)} width={8} height={4} fill="#06121f" />
          <rect x={px(W / 2 - 3)} y={px(13)} width={2} height={5} fill="#38f0ff" />
          <rect x={px(W / 2)} y={px(11)} width={2} height={7} fill="#ffd23f" />
          <rect x={px(W / 2 + 3)} y={px(14)} width={2} height={4} fill="#ff5577" />
        </svg>
      );
    case 'comms':
      return (
        <svg {...common} aria-hidden="true">
          {/* desk telephone base */}
          <rect x={px(1)} y={px(10)} width={W - 2} height={H - 11} fill="#2b2f3a" />
          <rect x={px(3)} y={px(12)} width={W - 6} height={3} fill="#0b3a4a" />
          {/* handset */}
          <rect x={px(2)} y={px(6)} width={W - 4} height={3} fill="#3a3f4d" />
          <rect x={px(2)} y={px(6)} width={3} height={5} fill="#3a3f4d" />
          <rect x={px(W - 5)} y={px(6)} width={3} height={5} fill="#3a3f4d" />
          {/* signal blip */}
          <rect x={px(W / 2 - 1)} y={px(2)} width={2} height={2} fill="#38f0ff" />
        </svg>
      );
    case 'atm':
      return (
        <svg {...common} aria-hidden="true">
          {/* cash machine body */}
          <rect x={px(2)} y={px(2)} width={W - 4} height={H - 4} fill="#13352b" />
          <rect x={px(2)} y={px(2)} width={W - 4} height={3} fill="#1d5142" />
          {/* screen */}
          <rect x={px(5)} y={px(6)} width={W - 10} height={9} fill="#03110c" />
          <rect x={px(6)} y={px(7)} width={W - 12} height={7} fill="#0a3a2a" />
          <rect x={px(7)} y={px(8)} width={5} height={1} fill="#7CFC9B" />
          <rect x={px(7)} y={px(10)} width={8} height={1} fill="#38f0ff" />
          {/* keypad */}
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => (
              <rect key={`${r}-${c}`} x={px(6 + c * 4)} y={px(17 + r * 3)} width={2} height={2} fill="#9fe7ff" />
            )),
          )}
          {/* cash slot */}
          <rect x={px(4)} y={px(H - 6)} width={W - 8} height={2} fill="#ffd23f" />
        </svg>
      );
    case 'payphone':
      return (
        <svg {...common} aria-hidden="true">
          {/* booth back plate */}
          <rect x={px(2)} y={px(1)} width={W - 4} height={H - 2} fill="#1c2740" />
          {/* phone box */}
          <rect x={px(4)} y={px(3)} width={W - 8} height={12} fill="#243a66" />
          <rect x={px(4)} y={px(3)} width={W - 8} height={2} fill="#3656a0" />
          {/* coin slots */}
          <rect x={px(W - 6)} y={px(5)} width={2} height={1} fill="#ffd23f" />
          <rect x={px(W - 6)} y={px(7)} width={2} height={1} fill="#ffd23f" />
          {/* handset */}
          <rect x={px(3)} y={px(5)} width={2} height={8} fill="#0b0b0f" />
          <rect x={px(3)} y={px(5)} width={4} height={2} fill="#0b0b0f" />
          <rect x={px(3)} y={px(11)} width={4} height={2} fill="#0b0b0f" />
          {/* keypad + cord */}
          <rect x={px(6)} y={px(8)} width={W - 14} height={5} fill="#06121f" />
          <rect x={px(W / 2 - 1)} y={px(15)} width={2} height={H - 16} fill="#3656a0" />
        </svg>
      );
    case 'bot_closet':
      return (
        <svg {...common} aria-hidden="true">
          {/* server rack / closet door */}
          <rect x={px(2)} y={px(1)} width={W - 4} height={H - 2} fill="#14121f" />
          <rect x={px(2)} y={px(1)} width={W - 4} height={3} fill="#2a2440" />
          {/* glass with blinking rack LEDs */}
          <rect x={px(4)} y={px(5)} width={W - 8} height={H - 8} fill="#06080f" />
          {[0, 1, 2, 3, 4].map((r) => (
            <g key={r}>
              <rect x={px(6)} y={px(7 + r * 4)} width={W - 12} height={2} fill="#1a1c2c" />
              <rect x={px(7)} y={px(7 + r * 4)} width={1} height={2} fill={['#7CFC9B', '#ff5577', '#38f0ff'][r % 3]} />
              <rect x={px(9)} y={px(7 + r * 4)} width={1} height={2} fill="#ffd23f" />
            </g>
          ))}
          {/* door handle */}
          <rect x={px(W - 6)} y={px(H / 2)} width={2} height={4} fill="#3656a0" />
        </svg>
      );
    case 'elevator':
      return (
        <svg {...common} aria-hidden="true">
          {/* steel elevator frame */}
          <rect x={px(1)} y={px(1)} width={W - 2} height={H - 2} fill="#2a2f38" />
          <rect x={px(1)} y={px(1)} width={W - 2} height={3} fill="#3c424e" />
          {/* lit floor indicator above doors */}
          <rect x={px(W / 2 - 5)} y={px(4)} width={10} height={3} fill="#06121f" />
          <rect x={px(W / 2 - 1)} y={px(5)} width={2} height={1} fill="#ffd23f" />
          {/* twin doors with seam */}
          <rect x={px(4)} y={px(9)} width={W - 8} height={H - 11} fill="#11151c" />
          <rect x={px(4)} y={px(9)} width={(W - 8) / 2 - 0.5} height={H - 11} fill="#1b2531" />
          <rect x={px(W / 2 + 0.5)} y={px(9)} width={(W - 8) / 2 - 0.5} height={H - 11} fill="#1b2531" />
          <rect x={px(W / 2 - 0.5)} y={px(9)} width={1} height={H - 11} fill="#0a0d12" />
          {/* call button */}
          <rect x={px(W - 4)} y={px(H / 2)} width={2} height={3} fill="#38f0ff" />
        </svg>
      );
    default:
      return null;
  }
}
